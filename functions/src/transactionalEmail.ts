import { defineSecret } from "firebase-functions/params";
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import * as fs from "node:fs";
import * as path from "node:path";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { Resend, type Attachment } from "resend";

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const APP_URL = "https://satxink.com";
const SUPPORT_EMAIL = "support@satxink.com";
const EMAIL_REGION = "us-central1";
const BRAND_NAME = "SATX Ink";
const CLIENT_WELCOME_LOGO_FILENAME =
  "satx-ink-email-logo_satx-for-email.png";
const CLIENT_WELCOME_LOGO_CONTENT_ID = "satx-ink-email-logo";
const CLIENT_WELCOME_LOGO_ASSET_PATH = path.join(
  __dirname,
  "..",
  "assets",
  CLIENT_WELCOME_LOGO_FILENAME
);
const BRAND_LOGO_WIDTH = 120;
const PREVIEW_SPACER = "&nbsp;&zwnj;".repeat(36);
const STALE_SENDING_WINDOW_MS = 10 * 60 * 1000;

const senders = {
  support: `${BRAND_NAME} <${SUPPORT_EMAIL}>`,
  accounts: `${BRAND_NAME} <accounts@satxink.com>`,
  requests: `${BRAND_NAME} <requests@satxink.com>`,
  offers: `${BRAND_NAME} <offers@satxink.com>`,
  bookings: `${BRAND_NAME} <bookings@satxink.com>`,
};

type EmailSender = keyof typeof senders;

type FieldValue = string | number | null | undefined;

type DetailRow = {
  label: string;
  value: FieldValue;
};

type DetailSection = {
  title: string;
  body?: string;
  rows?: DetailRow[];
  pills?: string[];
};

type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
  attachments?: Attachment[];
};

type LayoutInput = {
  preview: string;
  eyebrow?: string;
  headline: string;
  body: string;
  avatarUrl?: string;
  avatarAlt?: string;
  brandLogoUrl?: string;
  brandLogoAlt?: string;
  heroImageUrl?: string;
  heroImageAlt?: string;
  sections?: DetailSection[];
  cta?: {
    label: string;
    href: string;
  };
  footerNote?: string;
  attachments?: Attachment[];
};

type TransactionalEmailInput = EmailTemplate & {
  eventKey: string;
  from: EmailSender;
  to?: string | null;
};

const getDb = () => admin.firestore();

const getString = (
  data: admin.firestore.DocumentData | undefined | null,
  key: string,
  fallback = ""
) => {
  const value = data?.[key];
  return typeof value === "string" ? value.trim() : fallback;
};

const getNumber = (
  data: admin.firestore.DocumentData | undefined | null,
  key: string
) => {
  const value = data?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const getUser = async (uid?: string | null) => {
  if (!uid) return null;
  const snap = await getDb().collection("users").doc(uid).get();
  return snap.exists ? snap.data() || null : null;
};

const getShop = async (shopId?: string | null) => {
  if (!shopId) return null;
  const snap = await getDb().collection("shops").doc(shopId).get();
  return snap.exists ? snap.data() || null : null;
};

const getUserEmail = (user: admin.firestore.DocumentData | null) =>
  firstString(user?.email);

const getClientName = (
  data: admin.firestore.DocumentData,
  user?: admin.firestore.DocumentData | null
) =>
  firstString(
    data.clientName,
    [data.clientFirstName, data.clientLastName].filter(Boolean).join(" "),
    user?.displayName,
    user?.name,
    [user?.firstName, user?.lastName].filter(Boolean).join(" "),
    "there"
  );

const getArtistName = (
  data: admin.firestore.DocumentData,
  user?: admin.firestore.DocumentData | null
) =>
  firstString(
    data.artistName,
    data.displayName,
    user?.displayName,
    user?.name,
    "your artist"
  );

const getArtistAvatar = (
  data: admin.firestore.DocumentData,
  user?: admin.firestore.DocumentData | null
) => firstString(data.artistAvatar, user?.avatarUrl);

const getAbsoluteUrl = (pathOrUrl: string) => {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${APP_URL}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
};

const escapeHtml = (value: FieldValue) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isTruthyDisplayValue = (value: FieldValue) =>
  value !== null && value !== undefined && String(value).trim() !== "";

const formatMoney = (value: unknown) => {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
      ? Number(value)
      : NaN;
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

const formatMoneyFromCents = (value: unknown) => {
  const cents = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (cents <= 0) return "";
  return formatMoney(cents / 100);
};

const formatDate = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return "";
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
};

const formatAppointment = (option: unknown) => {
  if (!option || typeof option !== "object") return "";
  const data = option as admin.firestore.DocumentData;
  const date = formatDate(data.date);
  const time = firstString(data.time);
  if (date && time) return `${date} at ${time}`;
  return date || time || "";
};

const formatDateRange = (value: unknown) => {
  if (!Array.isArray(value)) return "";
  const [start, end] = value;
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return startLabel || endLabel || "";
};

const formatList = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .join(", ")
    : "";

const formatAvailableTime = (value: unknown) => {
  if (!value || typeof value !== "object") return "";
  const data = value as admin.firestore.DocumentData;
  const from = firstString(data.from);
  const to = firstString(data.to);
  if (from && to) return `${from} - ${to}`;
  return from || to || "";
};

const formatBudget = (value: unknown) => {
  if (typeof value === "number") return formatMoney(value);
  return firstString(value);
};

const renderRows = (rows: DetailRow[] = []) => {
  const visibleRows = rows.filter((row) => isTruthyDisplayValue(row.value));
  if (!visibleRows.length) return "";

  return visibleRows
    .map(
      (row) => `
        <tr>
          <td style="padding:12px 0;border-top:1px solid rgba(255,255,255,0.08);color:#a3a3a3;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:0.12em;">${escapeHtml(
            row.label
          )}</td>
          <td style="padding:12px 0;border-top:1px solid rgba(255,255,255,0.08);color:#f5f5f5;font-size:14px;line-height:21px;text-align:right;">${escapeHtml(
            row.value
          )}</td>
        </tr>`
    )
    .join("");
};

const renderPills = (pills: string[] = []) => {
  const visiblePills = pills.filter((pill) => pill.trim());
  if (!visiblePills.length) return "";

  return `
    <div style="padding-top:12px;">
      ${visiblePills
        .map(
          (pill) =>
            `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 9px;border:1px solid rgba(255,255,255,0.12);border-radius:999px;background:rgba(255,255,255,0.055);color:#d4d4d4;font-size:12px;line-height:14px;">${escapeHtml(
              pill
            )}</span>`
        )
        .join("")}
    </div>`;
};

const renderSections = (sections: DetailSection[] = []) =>
  sections
    .map((section) => {
      const rows = renderRows(section.rows);
      const pills = renderPills(section.pills);
      if (!section.body && !rows && !pills) return "";

      return `
        <div style="margin-top:16px;padding:18px;border:1px solid rgba(255,255,255,0.10);border-radius:12px;background:#141414;">
          <h2 style="margin:0;color:#ffffff;font-size:15px;line-height:22px;font-weight:700;">${escapeHtml(
            section.title
          )}</h2>
          ${
            section.body
              ? `<p style="margin:8px 0 0;color:#c7c7c7;font-size:14px;line-height:22px;">${escapeHtml(
                  section.body
                )}</p>`
              : ""
          }
          ${rows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;border-collapse:collapse;">${rows}</table>` : ""}
          ${pills}
        </div>`;
    })
    .join("");

const renderEmailLayout = (input: LayoutInput) => {
  const brandHeader = input.brandLogoUrl
    ? `<img src="${escapeHtml(input.brandLogoUrl)}" alt="${escapeHtml(
        input.brandLogoAlt ?? BRAND_NAME
      )}" width="${BRAND_LOGO_WIDTH}" style="display:block;width:${BRAND_LOGO_WIDTH}px;max-width:${BRAND_LOGO_WIDTH}px;height:auto;border:0;outline:none;text-decoration:none;">`
    : `<div style="font-size:22px;line-height:26px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">SATX<span style="color:#b6382d;font-style:italic;">INK</span></div>`;
  const avatar = input.avatarUrl
    ? `<img src="${escapeHtml(input.avatarUrl)}" alt="${escapeHtml(
        input.avatarAlt || ""
      )}" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);object-fit:cover;">`
    : "";
  const hero = input.heroImageUrl
    ? `<img src="${escapeHtml(input.heroImageUrl)}" alt="${escapeHtml(
        input.heroImageAlt || ""
      )}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;border:1px solid rgba(255,255,255,0.10);margin-top:18px;">`
    : "";

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.headline)}</title>
  </head>
  <body style="margin:0;padding:0;background:#0d0d0d;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(
      input.preview
    )}</div>
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${PREVIEW_SPACER}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0d0d0d;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 4px 16px;">
                ${brandHeader}
              </td>
            </tr>
            <tr>
              <td style="padding:1px;border-radius:16px;background:linear-gradient(135deg,rgba(182,56,45,0.68),rgba(255,255,255,0.10),rgba(255,255,255,0.04));">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-radius:15px;background:#111111;">
                  <tr>
                    <td style="padding:28px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                        <tr>
                          <td style="vertical-align:top;">
                            ${
                              input.eyebrow
                                ? `<p style="margin:0 0 10px;color:#b6382d;font-size:12px;line-height:18px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;">${escapeHtml(
                                    input.eyebrow
                                  )}</p>`
                                : ""
                            }
                            <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.02em;">${escapeHtml(
                              input.headline
                            )}</h1>
                          </td>
                          ${avatar ? `<td align="right" style="width:56px;padding-left:16px;vertical-align:top;">${avatar}</td>` : ""}
                        </tr>
                      </table>
                      <p style="margin:16px 0 0;color:#d4d4d4;font-size:15px;line-height:24px;">${escapeHtml(
                        input.body
                      )}</p>
                      ${hero}
                      ${renderSections(input.sections)}
                      ${
                        input.cta
                          ? `<div style="margin-top:22px;"><a href="${escapeHtml(
                              input.cta.href
                            )}" style="display:inline-block;padding:13px 18px;border-radius:8px;background:#ffffff;color:#0b0b0b;text-decoration:none;font-size:14px;line-height:18px;font-weight:700;">${escapeHtml(
                              input.cta.label
                            )}</a></div>`
                          : ""
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 4px 0;color:#7a7a7a;font-size:12px;line-height:19px;">
                ${escapeHtml(
                  input.footerNote ||
                    "You are receiving this because you have a SATX Ink account or booking activity."
                )}<br>
                Need help? Reply to this email or contact ${SUPPORT_EMAIL}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const renderTextEmail = (input: LayoutInput) => {
  const lines = [
    input.preview,
    "",
    input.headline,
    "",
    input.body,
    "",
    ...(input.sections || []).flatMap((section) => {
      const rows = (section.rows || [])
        .filter((row) => isTruthyDisplayValue(row.value))
        .map((row) => `${row.label}: ${row.value}`);
      const pills = section.pills?.length ? [`Details: ${section.pills.join(", ")}`] : [];
      return [section.title, ...(section.body ? [section.body] : []), ...rows, ...pills, ""];
    }),
    ...(input.cta ? [`Open: ${input.cta.href}`, ""] : []),
    `Support: ${SUPPORT_EMAIL}`,
  ];

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const buildEmail = (
  subject: string,
  input: LayoutInput
): EmailTemplate => {
  const defaultLogoAttachment = input.brandLogoUrl
    ? undefined
    : getBrandLogoAttachment();
  const layoutInput = defaultLogoAttachment
    ? {
        ...input,
        brandLogoUrl: `cid:${CLIENT_WELCOME_LOGO_CONTENT_ID}`,
        brandLogoAlt: "",
      }
    : input;
  const attachments = defaultLogoAttachment
    ? [...(input.attachments || []), defaultLogoAttachment]
    : input.attachments;

  return {
    subject,
    html: renderEmailLayout(layoutInput),
    text: renderTextEmail(layoutInput),
    attachments,
  };
};

const getBrandLogoAttachment = (): Attachment | undefined => {
  try {
    return {
      filename: CLIENT_WELCOME_LOGO_FILENAME,
      content: fs.readFileSync(CLIENT_WELCOME_LOGO_ASSET_PATH),
      contentType: "image/png",
      contentId: CLIENT_WELCOME_LOGO_CONTENT_ID,
    };
  } catch (error) {
    logger.warn("Email brand logo could not be attached.", {
      path: CLIENT_WELCOME_LOGO_ASSET_PATH,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
};

const claimEmailEvent = async (
  eventKey: string,
  input: TransactionalEmailInput
) => {
  const eventRef = getDb().collection("emailEvents").doc(eventKey);
  return getDb().runTransaction(async (transaction) => {
    const eventSnap = await transaction.get(eventRef);
    const status = eventSnap.exists ? getString(eventSnap.data(), "status") : "";
    const claimedAtMillis =
      typeof eventSnap.data()?.claimedAtMillis === "number"
        ? Number(eventSnap.data()?.claimedAtMillis)
        : 0;
    const sendingIsFresh =
      status === "sending" &&
      claimedAtMillis > 0 &&
      Date.now() - claimedAtMillis < STALE_SENDING_WINDOW_MS;

    if (status === "sent" || sendingIsFresh) {
      return false;
    }

    transaction.set(
      eventRef,
      {
        eventKey,
        to: input.to,
        from: senders[input.from],
        subject: input.subject,
        status: "sending",
        claimedAtMillis: Date.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: eventSnap.exists
          ? eventSnap.data()?.createdAt ?? admin.firestore.FieldValue.serverTimestamp()
          : admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return true;
  });
};

const sendTransactionalEmail = async (input: TransactionalEmailInput) => {
  const to = firstString(input.to);
  if (!to) {
    logger.warn("Skipping transactional email without recipient.", {
      eventKey: input.eventKey,
      subject: input.subject,
    });
    return;
  }

  const shouldSend = await claimEmailEvent(input.eventKey, { ...input, to });
  if (!shouldSend) return;

  const eventRef = getDb().collection("emailEvents").doc(input.eventKey);

  try {
    const resend = new Resend(RESEND_API_KEY.value());
    const result = await resend.emails.send({
      from: senders[input.from],
      to: [to],
      replyTo: SUPPORT_EMAIL,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    await eventRef.set(
      {
        status: "sent",
        provider: "resend",
        providerId: result.data?.id ?? null,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    await eventRef.set(
      {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw error;
  }
};

const renderClientWelcomeEmail = (
  user: admin.firestore.DocumentData
): EmailTemplate => {
  const name = firstString(user.displayName, user.name, user.firstName, "there");
  const email = getUserEmail(user);

  return buildEmail("Welcome to SATX Ink", {
    preview: "Find the right San Antonio tattoo artist for your idea.",
    headline: "Discover San Antonio tattoo artists who fit your style.",
    body:
      "Browse local artist profiles, explore their work and flash, and send your tattoo idea directly when it feels like the right fit.",
    avatarUrl: firstString(user.avatarUrl),
    avatarAlt: name,
    sections: [
      {
        title: "Your account",
        rows: [
          { label: "Name", value: name },
          { label: "Email", value: email },
        ],
      },
    ],
    cta: {
      label: "Browse artists",
      href: getAbsoluteUrl("/artists"),
    },
    footerNote:
      "You are receiving this because you signed up for a SATX Ink account.",
  });
};

const renderArtistWelcomeEmail = (
  user: admin.firestore.DocumentData,
  shop: admin.firestore.DocumentData | null
): EmailTemplate => {
  const name = firstString(user.displayName, user.name, "your studio");
  const specialties = Array.isArray(user.specialties)
    ? user.specialties.filter((item): item is string => typeof item === "string")
    : [];

  return buildEmail("Welcome to SATX Ink for Artists", {
    preview: "Manage requests, offers, and bookings from one dashboard.",
    eyebrow: "Welcome, artist",
    headline: "Start connecting with clients",
    body:
      "Use your dashboard to manage requests, send offers, and keep your booking flow organized as you finish getting set up.",
    avatarUrl: firstString(user.avatarUrl),
    avatarAlt: name,
    sections: [
      {
        title: "Profile details",
        rows: [
          { label: "Artist", value: name },
          { label: "Studio", value: firstString(shop?.name, user.shopName) },
        ],
        pills: specialties.slice(0, 6),
      },
    ],
    cta: {
      label: "Open dashboard",
      href: getAbsoluteUrl("/dashboard"),
    },
  });
};

const renderRequestEmail = (
  requestId: string,
  request: admin.firestore.DocumentData,
  client: admin.firestore.DocumentData | null,
  artist: admin.firestore.DocumentData | null
): EmailTemplate => {
  const artistName = getArtistName(request, artist);
  const clientName = getClientName(request, client);
  const requestImage = firstString(request.thumbUrl, request.fullUrl);
  const sourceLabel =
    request.sourceType === "flash"
      ? firstString(request.flashTitle, "Flash request")
      : "Custom tattoo request";

  return buildEmail(`Your request was sent to ${artistName}`, {
    preview: `We sent your tattoo request to ${artistName}.`,
    eyebrow: "Request sent",
    headline: "Your tattoo request is in.",
    body: `We sent your request to ${artistName}. You will get an update when they reply with an offer or follow-up.`,
    avatarUrl: getArtistAvatar(request, artist),
    avatarAlt: artistName,
    heroImageUrl: requestImage,
    heroImageAlt: sourceLabel,
    sections: [
      {
        title: "Request summary",
        rows: [
          { label: "Client", value: clientName },
          { label: "Artist", value: artistName },
          { label: "Type", value: sourceLabel },
          { label: "Placement", value: getString(request, "bodyPlacement") },
          { label: "Size", value: getString(request, "size") },
          { label: "Budget", value: formatBudget(request.budget) },
          { label: "Preferred dates", value: formatDateRange(request.preferredDateRange) },
          { label: "Available time", value: formatAvailableTime(request.availableTime) },
          { label: "Available days", value: formatList(request.availableDays) },
        ],
      },
      {
        title: "Notes",
        body: getString(request, "description"),
      },
    ],
    cta: {
      label: "View requests",
      href: getAbsoluteUrl("/dashboard?tab=requests"),
    },
    footerNote: `Request ID: ${requestId}`,
  });
};

const renderOfferEmail = (
  offerId: string,
  offer: admin.firestore.DocumentData,
  client: admin.firestore.DocumentData | null,
  artist: admin.firestore.DocumentData | null,
  shop: admin.firestore.DocumentData | null
): EmailTemplate => {
  const artistName = getArtistName(offer, artist);
  const dateOptions = Array.isArray(offer.dateOptions)
    ? offer.dateOptions.map(formatAppointment).filter(Boolean)
    : [];
  const price = getNumber(offer, "price");
  const depositAmount =
    typeof offer.depositPolicy?.amount === "number"
      ? offer.depositPolicy.amount
      : null;
  const sourceImage = firstString(offer.thumbUrl, offer.fullUrl);

  return buildEmail(`${artistName} sent you an offer`, {
    preview: `Review the quote and appointment options from ${artistName}.`,
    eyebrow: "New offer",
    headline: `You have a new offer from ${artistName}.`,
    body:
      "Review the quote, deposit, appointment options, and studio details before choosing what works best.",
    avatarUrl: getArtistAvatar(offer, artist),
    avatarAlt: artistName,
    heroImageUrl: sourceImage,
    heroImageAlt: firstString(offer.flashTitle, "Offer image"),
    sections: [
      {
        title: "Offer details",
        rows: [
          { label: "Client", value: getClientName(offer, client) },
          { label: "Artist", value: artistName },
          { label: "Quote", value: price === null ? "" : formatMoney(price) },
          { label: "Deposit", value: depositAmount === null ? "" : formatMoney(depositAmount) },
          { label: "Payment", value: firstString(offer.paymentType) },
          { label: "Final payment", value: firstString(offer.finalPaymentTiming) },
          { label: "Studio", value: firstString(offer.shopName, shop?.name) },
          { label: "Address", value: firstString(offer.shopAddress, shop?.address) },
          { label: "Flash", value: firstString(offer.flashTitle) },
        ],
      },
      {
        title: "Appointment options",
        pills: dateOptions,
      },
      {
        title: "Artist message",
        body: getString(offer, "message"),
      },
    ],
    cta: {
      label: "Review offer",
      href: getAbsoluteUrl("/dashboard?tab=offers"),
    },
    footerNote: `Offer ID: ${offerId}`,
  });
};

const renderBookingReadyEmail = (
  bookingId: string,
  booking: admin.firestore.DocumentData,
  client: admin.firestore.DocumentData | null,
  artist: admin.firestore.DocumentData | null
): EmailTemplate => {
  const artistName = getArtistName(booking, artist);
  const price = getNumber(booking, "price");
  const deposit = getNumber(booking, "depositAmount");
  const remaining =
    price !== null && deposit !== null ? Math.max(price - deposit, 0) : null;

  return buildEmail("Your booking details are ready", {
    preview: `Your spot with ${artistName} is almost set.`,
    eyebrow: "Booking ready",
    headline: `Your spot with ${artistName} is almost set.`,
    body:
      "You accepted the offer. Complete the required payment to confirm your appointment.",
    avatarUrl: getArtistAvatar(booking, artist),
    avatarAlt: artistName,
    heroImageUrl: firstString(booking.sampleImageUrl),
    heroImageAlt: firstString(booking.flashTitle, "Booking image"),
    sections: [
      {
        title: "Booking details",
        rows: [
          { label: "Artist", value: artistName },
          { label: "Appointment", value: formatAppointment(booking.selectedDate) },
          { label: "Studio", value: getString(booking, "shopName") },
          { label: "Address", value: getString(booking, "shopAddress") },
          { label: "Quote", value: price === null ? "" : formatMoney(price) },
          { label: "Deposit due", value: deposit === null ? "" : formatMoney(deposit) },
          { label: "Remaining balance", value: remaining === null ? "" : formatMoney(remaining) },
          { label: "Project type", value: getString(booking, "projectType") },
          { label: "Flash", value: getString(booking, "flashTitle") },
        ],
      },
    ],
    cta: {
      label: "Complete payment",
      href: getAbsoluteUrl(`/payment/${bookingId}`),
    },
    footerNote: `Booking ID: ${bookingId}`,
  });
};

const getPaymentHeadline = (booking: admin.firestore.DocumentData) => {
  const mode = firstString(booking.checkoutPaymentMode, booking.paymentMode);
  if (mode === "remaining" && Number(booking.estimatedSessionCount || 1) > 1) {
    return "Session payment received.";
  }
  if (mode === "remaining") return "Balance payment received.";
  if (mode === "platform_fee") return "Platform fee payment received.";
  if (mode === "full") return "Payment received - your booking is confirmed.";
  return "Deposit received - your booking is confirmed.";
};

const getPaymentAmount = (booking: admin.firestore.DocumentData) => {
  const mode = firstString(booking.checkoutPaymentMode, booking.paymentMode);
  if (mode === "deposit") return formatMoneyFromCents(booking.depositPaidAmountCents);
  if (mode === "remaining") return formatMoneyFromCents(booking.remainingPaidAmountCents);
  if (mode === "platform_fee") return formatMoneyFromCents(booking.platformFeeCents);
  return formatMoneyFromCents(booking.clientPaymentAmountCents);
};

const renderPaymentEmail = (
  bookingId: string,
  booking: admin.firestore.DocumentData,
  client: admin.firestore.DocumentData | null,
  artist: admin.firestore.DocumentData | null
): EmailTemplate => {
  const headline = getPaymentHeadline(booking);
  const mode = firstString(booking.checkoutPaymentMode, booking.paymentMode, "payment");
  const artistName = getArtistName(booking, artist);

  return buildEmail(headline.replace(/\.$/, ""), {
    preview: `We received your ${mode.replace("_", " ")} payment for ${artistName}.`,
    eyebrow: "Payment received",
    headline,
    body: `We received your ${mode.replace("_", " ")} payment for your booking with ${artistName}. Your dashboard has the latest booking and balance details.`,
    avatarUrl: getArtistAvatar(booking, artist),
    avatarAlt: artistName,
    sections: [
      {
        title: "Payment details",
        rows: [
          { label: "Client", value: getClientName(booking, client) },
          { label: "Artist", value: artistName },
          { label: "Payment type", value: mode },
          { label: "Amount paid", value: getPaymentAmount(booking) },
          { label: "Remaining balance", value: formatMoneyFromCents(booking.remainingBalanceCents) },
          { label: "Session", value: booking.lastPaidSessionNumber ? `Session ${booking.lastPaidSessionNumber}` : "" },
          { label: "Checkout", value: getString(booking, "lastCompletedCheckoutSessionId") },
          { label: "Appointment", value: formatAppointment(booking.selectedDate) },
        ],
      },
    ],
    cta: {
      label:
        mode === "remaining" && Number(booking.estimatedSessionCount || 1) > 1
          ? "View sessions"
          : "View booking",
      href: getAbsoluteUrl(
        mode === "remaining" && Number(booking.estimatedSessionCount || 1) > 1
          ? "/dashboard?tab=sessions"
          : "/dashboard?tab=bookings"
      ),
    },
    footerNote: `Booking ID: ${bookingId}`,
  });
};

const renderSessionCompleteEmail = (
  bookingId: string,
  sessionId: string,
  booking: admin.firestore.DocumentData,
  session: admin.firestore.DocumentData,
  client: admin.firestore.DocumentData | null,
  artist: admin.firestore.DocumentData | null
): EmailTemplate => {
  const artistName = getArtistName(booking, artist);
  const sessionNumber = Number(session.sessionNumber || booking.activeSessionNumber || 1);
  const estimatedSessionCount = Math.max(Number(booking.estimatedSessionCount || 1), 1);
  const completedSessionCount = Math.max(Number(booking.completedSessionCount || 0), sessionNumber);
  const isProjectComplete =
    booking.sessionStatus === "completed" || completedSessionCount >= estimatedSessionCount;
  const amountDue = formatMoneyFromCents(session.amountDueCents);

  return buildEmail(
    isProjectComplete
      ? "Your tattoo project is complete"
      : `Session ${sessionNumber} is complete`,
    {
      preview: `Your artist marked session ${sessionNumber} complete.`,
      eyebrow: isProjectComplete ? "Project complete" : "Session complete",
      headline: isProjectComplete
        ? "Your tattoo project is complete."
        : `Session ${sessionNumber} is complete.`,
      body: amountDue
        ? `Your artist marked this session complete. The next payment due is ${amountDue}.`
        : "Your artist marked this session complete. Your dashboard has the latest project status.",
      avatarUrl: getArtistAvatar(booking, artist),
      avatarAlt: artistName,
      heroImageUrl: Array.isArray(session.photoUrls) ? firstString(session.photoUrls[0]) : "",
      heroImageAlt: `Session ${sessionNumber} photo`,
      sections: [
        {
          title: "Session details",
          rows: [
            { label: "Client", value: getClientName(booking, client) },
            { label: "Artist", value: artistName },
            { label: "Session", value: `${sessionNumber} of ${estimatedSessionCount}` },
            { label: "Amount due", value: amountDue },
            { label: "Remaining balance", value: formatMoneyFromCents(booking.remainingBalanceCents) },
            { label: "Status", value: isProjectComplete ? "Project complete" : "Session complete" },
          ],
        },
        {
          title: "Artist notes",
          body: getString(session, "notes"),
        },
      ],
      cta: {
        label: "View sessions",
        href: getAbsoluteUrl("/dashboard?tab=sessions"),
      },
      footerNote: `Booking ID: ${bookingId} - Session ID: ${sessionId}`,
    }
  );
};

const sendClientWelcome = async (
  uid: string,
  user: admin.firestore.DocumentData
) => {
  if (user.role !== "client") return;
  await sendTransactionalEmail({
    eventKey: `welcome-client-${uid}`,
    from: "accounts",
    to: getUserEmail(user),
    ...renderClientWelcomeEmail(user),
  });
};

const sendArtistWelcome = async (
  uid: string,
  user: admin.firestore.DocumentData
) => {
  if (user.role !== "artist" || user.profileComplete !== true) return;
  const shop = await getShop(firstString(user.shopId));
  await sendTransactionalEmail({
    eventKey: `welcome-artist-${uid}`,
    from: "accounts",
    to: getUserEmail(user),
    ...renderArtistWelcomeEmail(user, shop),
  });
};

export const sendUserCreatedWelcomeEmail = onDocumentCreated(
  {
    document: "users/{uid}",
    region: EMAIL_REGION,
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const user = event.data?.data();
    const uid = event.params.uid;
    if (!user) return;

    await sendClientWelcome(uid, user);
    await sendArtistWelcome(uid, user);
  }
);

export const sendArtistCompletedWelcomeEmail = onDocumentUpdated(
  {
    document: "users/{uid}",
    region: EMAIL_REGION,
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || before?.profileComplete === true) return;
    await sendArtistWelcome(event.params.uid, after);
  }
);

export const sendRequestSubmittedEmail = onDocumentCreated(
  {
    document: "bookingRequests/{requestId}",
    region: EMAIL_REGION,
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const request = event.data?.data();
    if (!request) return;

    const [client, artist] = await Promise.all([
      getUser(firstString(request.clientId)),
      getUser(firstString(request.artistId)),
    ]);

    await sendTransactionalEmail({
      eventKey: `request-submitted-${event.params.requestId}`,
      from: "requests",
      to: getUserEmail(client),
      ...renderRequestEmail(event.params.requestId, request, client, artist),
    });
  }
);

export const sendOfferReceivedEmail = onDocumentCreated(
  {
    document: "offers/{offerId}",
    region: EMAIL_REGION,
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const offer = event.data?.data();
    if (!offer || offer.status !== "pending") return;

    const [client, artist, shop] = await Promise.all([
      getUser(firstString(offer.clientId)),
      getUser(firstString(offer.artistId)),
      getShop(firstString(offer.shopId)),
    ]);

    await sendTransactionalEmail({
      eventKey: `offer-received-${event.params.offerId}`,
      from: "offers",
      to: getUserEmail(client),
      ...renderOfferEmail(event.params.offerId, offer, client, artist, shop),
    });
  }
);

export const sendBookingReadyEmail = onDocumentCreated(
  {
    document: "bookings/{bookingId}",
    region: EMAIL_REGION,
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const booking = event.data?.data();
    if (!booking || booking.status !== "pending_payment") return;

    const [client, artist] = await Promise.all([
      getUser(firstString(booking.clientId)),
      getUser(firstString(booking.artistId)),
    ]);

    await sendTransactionalEmail({
      eventKey: `booking-ready-${event.params.bookingId}`,
      from: "bookings",
      to: getUserEmail(client),
      ...renderBookingReadyEmail(event.params.bookingId, booking, client, artist),
    });
  }
);

const getPaymentEventKey = (
  bookingId: string,
  before: admin.firestore.DocumentData,
  after: admin.firestore.DocumentData
) => {
  const beforeSession = firstString(before.lastCompletedCheckoutSessionId);
  const afterSession = firstString(after.lastCompletedCheckoutSessionId);
  if (afterSession && afterSession !== beforeSession) {
    return `booking-payment-${bookingId}-${afterSession}`;
  }

  const beforeExternalConfirmed =
    before.remainingPaymentStatus === "confirmed" ||
    before.status === "paid" ||
    before.status === "confirmed";
  const afterExternalConfirmed =
    after.remainingPaymentStatus === "confirmed" ||
    after.status === "paid" ||
    after.status === "confirmed";

  if (!beforeExternalConfirmed && afterExternalConfirmed) {
    const stamp =
      after.externalRemainingClientConfirmedAt?.toMillis?.() ||
      after.externalRemainingArtistConfirmedAt?.toMillis?.() ||
      after.updatedAt?.toMillis?.() ||
      Date.now();
    return `booking-payment-${bookingId}-external-${stamp}`;
  }

  return "";
};

export const sendBookingPaymentEmail = onDocumentUpdated(
  {
    document: "bookings/{bookingId}",
    region: EMAIL_REGION,
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const eventKey = getPaymentEventKey(event.params.bookingId, before, after);
    if (!eventKey) return;

    const [client, artist] = await Promise.all([
      getUser(firstString(after.clientId)),
      getUser(firstString(after.artistId)),
    ]);

    await sendTransactionalEmail({
      eventKey,
      from: "bookings",
      to: getUserEmail(client),
      ...renderPaymentEmail(event.params.bookingId, after, client, artist),
    });
  }
);

export const sendSessionCompletedEmail = onDocumentWritten(
  {
    document: "bookingSessions/{bookingId}/sessions/{sessionId}",
    region: EMAIL_REGION,
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || after.status !== "completed" || before?.status === "completed") {
      return;
    }

    const bookingSnap = await getDb()
      .collection("bookings")
      .doc(event.params.bookingId)
      .get();
    if (!bookingSnap.exists) return;

    const booking = bookingSnap.data() || {};
    const [client, artist] = await Promise.all([
      getUser(firstString(booking.clientId)),
      getUser(firstString(booking.artistId)),
    ]);

    await sendTransactionalEmail({
      eventKey: `session-completed-${event.params.bookingId}-${event.params.sessionId}`,
      from: "bookings",
      to: getUserEmail(client),
      ...renderSessionCompleteEmail(
        event.params.bookingId,
        event.params.sessionId,
        booking,
        after,
        client,
        artist
      ),
    });
  }
);
