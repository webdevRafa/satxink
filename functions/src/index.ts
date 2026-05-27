// functions/src/index.ts
import type { CheckoutRequestData } from '../src/types/StripeCheckout';
import { onSchedule } from 'firebase-functions/v2/scheduler';


import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { setGlobalOptions }   from 'firebase-functions/v2/options';
import { defineSecret } from 'firebase-functions/params';

import * as admin  from 'firebase-admin';
import * as path   from 'path';
import * as os     from 'os';
import * as fs     from 'fs/promises';
import { createHash, randomBytes } from 'crypto';
import sharp       from 'sharp';
import { v4 as uuidv4 } from "uuid";  
import Stripe from 'stripe';
import { onCall } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';





import * as logger from 'firebase-functions/logger';
import { HttpsError } from 'firebase-functions/v2/https';


admin.initializeApp();
const bucket = admin.storage().bucket();
const db = admin.firestore();
// Bump memory + timeout for big HEICs
setGlobalOptions({ memory: '1GiB', timeoutSeconds: 120 });

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const PLATFORM_FEE_MIN_CENTS = 500;
const PLATFORM_FEE_MAX_CENTS = 3500;
const PLATFORM_FEE_RATE = 0.10;
const STRIPE_PERCENT_FEE = 0.029;
const STRIPE_FIXED_FEE_CENTS = 30;
const MIN_ARTIST_PAYOUT_CENTS = 100;
const DEFAULT_APP_URL = "https://satxink.com";

const createEventPassToken = () => randomBytes(32).toString("base64url");

const hashEventPassToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const getEventHostUserId = (event: admin.firestore.DocumentData) =>
  String(event.createdBy || event.artistId || "");

const isActiveEventRegistrationStatus = (status: unknown) =>
  status === "reserved" ||
  status === "paid" ||
  status === "checked_in" ||
  status === "pending_payment";

const userCanManageEvent = (
  uid: string,
  user: admin.firestore.DocumentData,
  event: admin.firestore.DocumentData
) => {
  if (event.createdBy === uid || event.artistId === uid) return true;

  const shopId = String(event.shopId || "");
  const ownedShopIds = [
    ...(Array.isArray(user.shopOwnerShopIds) ? user.shopOwnerShopIds : []),
    ...(Array.isArray(user.ownedShopIds) ? user.ownedShopIds : []),
  ].map(String);

  return Boolean(shopId && ownedShopIds.includes(shopId));
};

const userCanConnectPayouts = (user: admin.firestore.DocumentData) =>
  user.role === "artist" ||
  user.role === "shop_owner" ||
  (Array.isArray(user.shopOwnerShopIds) && user.shopOwnerShopIds.length > 0) ||
  (Array.isArray(user.ownedShopIds) && user.ownedShopIds.length > 0);

const calculatePlatformFeeCents = (artistAmountCents: number) => {
  if (!Number.isFinite(artistAmountCents) || artistAmountCents <= 0) return 0;

  const percentageFee = Math.round(artistAmountCents * PLATFORM_FEE_RATE);
  return Math.min(
    Math.max(percentageFee, PLATFORM_FEE_MIN_CENTS),
    PLATFORM_FEE_MAX_CENTS
  );
};

const estimateStripeFeeCents = (clientTotalCents: number) =>
  Math.round(clientTotalCents * STRIPE_PERCENT_FEE) + STRIPE_FIXED_FEE_CENTS;

type CheckoutPaymentMode = "deposit" | "full" | "remaining";

type CropAreaInput = {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
};

const parseStoragePathFromDownloadUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const marker = "/o/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
};

const clampCrop = (
  crop: CropAreaInput,
  imageWidth: number,
  imageHeight: number
) => {
  const x = Math.max(0, Math.floor(Number(crop.x)));
  const y = Math.max(0, Math.floor(Number(crop.y)));
  const width = Math.floor(Number(crop.width));
  const height = Math.floor(Number(crop.height));

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new HttpsError("invalid-argument", "A valid crop area is required.");
  }

  const safeX = Math.min(x, Math.max(imageWidth - 1, 0));
  const safeY = Math.min(y, Math.max(imageHeight - 1, 0));
  const safeWidth = Math.min(width, imageWidth - safeX);
  const safeHeight = Math.min(height, imageHeight - safeY);

  if (safeWidth <= 0 || safeHeight <= 0) {
    throw new HttpsError("invalid-argument", "Crop area is outside the image.");
  }

  return {
    left: safeX,
    top: safeY,
    width: safeWidth,
    height: safeHeight,
  };
};

const calculateClientPaymentBreakdown = (
  artistAmountCents: number,
  platformFeeCents: number
) => {
  let clientTotalCents = Math.ceil(
    (artistAmountCents + platformFeeCents + STRIPE_FIXED_FEE_CENTS) /
      (1 - STRIPE_PERCENT_FEE)
  );

  let stripeFeeCents = estimateStripeFeeCents(clientTotalCents);

  while (
    clientTotalCents - stripeFeeCents - platformFeeCents <
    artistAmountCents
  ) {
    clientTotalCents += 1;
    stripeFeeCents = estimateStripeFeeCents(clientTotalCents);
  }

  return {
    artistAmountCents,
    platformFeeCents,
    stripeFeeCents,
    clientTotalCents,
  };
};

const dollarsToCents = (amount: unknown) => Math.round(Number(amount || 0) * 100);

const parseMetadataCents = (
  metadata: Stripe.Metadata | null | undefined,
  key: string,
  fallback = 0
) => {
  const value = Number(metadata?.[key]);
  return Number.isFinite(value) ? value : fallback;
};

const getCompletedBookingUpdate = (
  booking: admin.firestore.DocumentData,
  session: Stripe.Checkout.Session,
  connectedAccountId?: string | null
) => {
  const metadata = session.metadata || {};
  const paymentMode = (metadata.paymentMode || "deposit") as CheckoutPaymentMode;
  const artistAmountCents = parseMetadataCents(metadata, "artistAmountCents");
  const priceCents = parseMetadataCents(
    metadata,
    "priceCents",
    dollarsToCents(booking.price)
  );
  const platformFeeCents = parseMetadataCents(metadata, "platformFeeCents");
  const stripeFeeCents = parseMetadataCents(metadata, "estimatedStripeFeeCents");
  const clientTotalCents = parseMetadataCents(
    metadata,
    "clientTotalCents",
    session.amount_total ?? 0
  );
  const currentPaidCents = Number(booking.totalArtistPaidCents || 0);
  const sessionAlreadyApplied = booking.lastCompletedCheckoutSessionId === session.id;
  const nextPaidCents =
    sessionAlreadyApplied
      ? currentPaidCents
      : paymentMode === "full"
      ? priceCents
      : Math.min(priceCents, currentPaidCents + artistAmountCents);
  const remainingBalanceCents = Math.max(priceCents - nextPaidCents, 0);
  const nextStatus = remainingBalanceCents > 0 ? "deposit_paid" : "paid";
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const isMultiSession =
    booking.projectType === "multi_session" ||
    Number(booking.estimatedSessionCount || 1) > 1;
  const activeSessionNumber = Math.max(Number(booking.activeSessionNumber || 1), 1);
  const estimatedSessionCount = Math.max(
    Number(booking.estimatedSessionCount || 1),
    1
  );
  const paidSessionNumber = Math.max(
    Number(booking.pendingSessionNumber || activeSessionNumber),
    1
  );
  const hasMoreSessions =
    isMultiSession &&
    paymentMode === "remaining" &&
    paidSessionNumber < estimatedSessionCount &&
    remainingBalanceCents > 0;

  return {
    status: nextStatus,
    paidAt: nextStatus === "paid" ? timestamp : booking.paidAt ?? null,
    depositPaidAt: paymentMode === "deposit" ? timestamp : booking.depositPaidAt ?? null,
    remainingPaidAt: paymentMode === "remaining" ? timestamp : booking.remainingPaidAt ?? null,
    paymentMode,
    checkoutPaymentMode: paymentMode,
    stripeCheckoutSessionId: session.id,
    lastCompletedCheckoutSessionId: session.id,
    stripePaymentIntentId: session.payment_intent,
    stripeConnectedAccountId:
      connectedAccountId ?? metadata.stripeConnectedAccountId ?? null,
    artistQuotedAmountCents: artistAmountCents,
    artistPayoutCents: artistAmountCents,
    clientPaymentAmountCents: clientTotalCents,
    platformFeeCents,
    estimatedStripeFeeCents: stripeFeeCents,
    depositPaidAmountCents:
      paymentMode === "deposit"
        ? artistAmountCents
        : Number(booking.depositPaidAmountCents || 0),
    depositPaidAmount:
      paymentMode === "deposit"
        ? artistAmountCents / 100
        : Number(booking.depositPaidAmount || 0),
    remainingPaidAmountCents:
      paymentMode === "remaining"
        ? artistAmountCents
        : Number(booking.remainingPaidAmountCents || 0),
    remainingPaidAmount:
      paymentMode === "remaining"
        ? artistAmountCents / 100
        : Number(booking.remainingPaidAmount || 0),
    totalArtistPaidCents: nextPaidCents,
    totalArtistPaidAmount: nextPaidCents / 100,
    remainingBalanceCents,
    remainingBalanceAmount: remainingBalanceCents / 100,
    ...(isMultiSession && paymentMode === "remaining"
      ? {
          sessionStatus: hasMoreSessions ? "awaiting_next_session" : "completed",
          activeSessionNumber: hasMoreSessions
            ? paidSessionNumber + 1
            : paidSessionNumber,
          pendingSessionPaymentAmount: 0,
          pendingSessionPaymentAmountCents: 0,
          pendingSessionNumber: null,
          lastPaidSessionNumber: paidSessionNumber,
          remainingPaymentStatus:
            remainingBalanceCents > 0 ? "due" : "confirmed",
        }
      : {}),
    updatedAt: timestamp,
  };
};




/**
 * One universal trigger for:
 * • portfolio uploads
 * • flash-sheet uploads
 * • client booking-request reference images
 */



const handleImageUpload = onObjectFinalized(async (event) => {
  const object = event.data;
  const filePath = object.name ?? "";
  const contentType = object.contentType ?? "";

  if (!contentType.startsWith("image/")) return;

  const fileName = path.basename(filePath).toLowerCase();

  // Skip derivatives/cropped files
  if (
    fileName.includes("_thumb") ||
    fileName.includes("_webp90") ||
    fileName.includes("_full") ||
    fileName.startsWith("cropped-")
  ) {
    console.log(`Skipping derivative file: ${filePath}`);
    return;
  }

  // Only handle bookingRequests/{reqId}/originals/
  const parts = filePath.split("/");
  if (parts[0] !== "bookingRequests" || parts[2] !== "originals") {
    console.log(`Skipping unrelated upload: ${filePath}`);
    return;
  }

  const requestId = parts[1];
  const tmpLocal = path.join(os.tmpdir(), fileName);

  try {
    await bucket.file(filePath).download({ destination: tmpLocal });

    const isHeic =
      contentType === "image/heic" || fileName.toLowerCase().endsWith(".heic");
    const fullJpegQuality = 80;

    const inputBuffer = isHeic
      ? await sharp(tmpLocal).jpeg({ quality: fullJpegQuality }).toBuffer()
      : await sharp(tmpLocal)
          .jpeg({ quality: fullJpegQuality, mozjpeg: true })
          .toBuffer();

    const baseName = path.parse(fileName).name;
    const fullResPath = `bookingRequests/full/${baseName}.jpg`;
    const thumbPath = `bookingRequests/thumbs/${baseName}.webp`;

    await bucket.file(fullResPath).save(inputBuffer, {
      metadata: {
        contentType: "image/jpeg",
        metadata: { firebaseStorageDownloadTokens: uuidv4() },
      },
    });

    const thumbBuffer = await sharp(inputBuffer)
      .resize({ width: 300 })
      .webp({ quality: 80 })
      .toBuffer();

    await bucket.file(thumbPath).save(thumbBuffer, {
      metadata: {
        contentType: "image/webp",
        metadata: { firebaseStorageDownloadTokens: uuidv4() },
      },
    });

    const [fullDownloadUrl] = await bucket.file(fullResPath).getSignedUrl({
      action: "read",
      expires: "03-01-2030",
    });
    const [thumbDownloadUrl] = await bucket.file(thumbPath).getSignedUrl({
      action: "read",
      expires: "03-01-2030",
    });

    // Duplicate-skip check before writing to Firestore
    const firestore = admin.firestore();
    const bookingRef = firestore.collection("bookingRequests").doc(requestId);
    const docSnap = await bookingRef.get();
    const docData = docSnap.data();
    if (docData?.fullUrl && docData?.thumbUrl) {
      console.log(`Skipping ${fileName} — already processed.`);
      return;
    }

    await bookingRef.set(
      {
        fullUrl: fullDownloadUrl,
        thumbUrl: thumbDownloadUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`✅ Processed booking request image for requestId: ${requestId}`);
  } catch (err) {
    console.error(`❌ Error processing booking request file: ${filePath}`, err);
  } finally {
    await Promise.allSettled([bucket.file(filePath).delete(), fs.unlink(tmpLocal)]);
  }
});



const processAvatar = onObjectFinalized(async (event) => {
  const object = event.data;
  const filePath = object.name;

  if (
    !filePath ||
    (!filePath.startsWith("users/") && !filePath.startsWith("tempAvatars/")) ||
    !filePath.includes("avatar-original.jpg")
  ) {
    console.log(`⏭️ Skipping unrelated file: ${filePath}`);
    return;
  }

  const bucket = admin.storage().bucket(object.bucket);
  const fileName = path.basename(filePath).toLowerCase();

  if (
    fileName.includes("_thumb") ||
    fileName.includes("_webp90") ||
    fileName.includes("_full") ||
    fileName.startsWith("cropped-")
  ) {
    console.log(`Skipping derivative file: ${filePath}`);
    return;
  }

  const uid = filePath.split("/")[1];
  const tempFilePath = path.join(os.tmpdir(), fileName);
  const avatarPath = path.join(os.tmpdir(), "avatar.jpg");
  const thumbPath = path.join(os.tmpdir(), "avatar-thumb.jpg");

  try {
    await bucket.file(filePath).download({ destination: tempFilePath });

    await sharp(tempFilePath).resize(512, 512).jpeg({ quality: 80 }).toFile(avatarPath);
    await bucket.upload(avatarPath, {
      destination: `users/${uid}/avatar.jpg`,
      metadata: { contentType: "image/jpeg" },
    });

    await sharp(tempFilePath).resize(128, 128).jpeg({ quality: 70 }).toFile(thumbPath);
    await bucket.upload(thumbPath, {
      destination: `users/${uid}/avatar-thumb.jpg`,
      metadata: { contentType: "image/jpeg" },
    });

    console.log(`✅ Avatar processed for user: ${uid}`);
  } catch (err) {
    console.error(`❌ Error processing avatar for ${uid}:`, err);
  } finally {
    await Promise.allSettled([fs.unlink(tempFilePath), fs.unlink(avatarPath), fs.unlink(thumbPath)]);
  }
});



const handleOfferImageUpload = onObjectFinalized(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const filePath = event.data.name || "";
    if (!filePath) return;

    const fileName = path.basename(filePath).toLowerCase();
    if (
      fileName.includes("_thumb") ||
      fileName.includes("_webp90") ||
      fileName.includes("_full") ||
      fileName.startsWith("cropped-")
    ) {
      console.log(`Skipping derivative file: ${filePath}`);
      return;
    }

    if (!(filePath.startsWith("users/") && filePath.includes("/offers/full/"))) {
      console.log(`Skipping non-offer upload: ${filePath}`);
      return;
    }

    const bucket = admin.storage().bucket(event.data.bucket);
    const tempFilePath = path.join(os.tmpdir(), fileName);

    try {
      await bucket.file(filePath).download({ destination: tempFilePath });

      const thumbBuffer = await sharp(tempFilePath).resize(400).jpeg({ quality: 75 }).toBuffer();
      const thumbPath = filePath.replace("/offers/full/", "/offers/thumbs/");
      const thumbFile = bucket.file(thumbPath);
      await thumbFile.save(thumbBuffer, { metadata: { contentType: "image/jpeg" } });

      const [fullUrl] = await bucket.file(filePath).getSignedUrl({ action: "read", expires: "03-01-2030" });
      const [thumbUrl] = await thumbFile.getSignedUrl({ action: "read", expires: "03-01-2030" });

      const offersRef = admin.firestore().collection("offers");
      const snapshot = await offersRef.where("imageFilename", "==", fileName).limit(1).get();

      if (snapshot.empty) {
        console.warn(`⚠️ No offer document found for: ${fileName}`);
        return;
      }

      const offerRef = snapshot.docs[0].ref;
      const docData = snapshot.docs[0].data();
      if (docData.fullUrl && docData.thumbUrl) {
        console.log(`Skipping ${fileName} — already processed.`);
        return;
      }

      await offerRef.update({ fullUrl, thumbUrl });
      console.log(`✅ Offer doc updated with fullUrl + thumbUrl for: ${fileName}`);
    } catch (err) {
      console.error(`❌ Error processing offer image ${filePath}:`, err);
    } finally {
      await Promise.allSettled([fs.unlink(tempFilePath)]);
    }
  }
);

const getStripeClient = () =>
  new Stripe(STRIPE_SECRET_KEY.value(), {
    apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
  });

const getBaseUrl = (rawUrl?: unknown) => {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return DEFAULT_APP_URL;

  try {
    const parsed = new URL(rawUrl);
    return parsed.origin;
  } catch {
    return DEFAULT_APP_URL;
  }
};

const getArtistStripeStatus = (account: Stripe.Account) => {
  const disabledReason = account.requirements?.disabled_reason ?? null;

  return {
    accountId: account.id,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    onboardingComplete: Boolean(
      account.charges_enabled &&
        account.payouts_enabled &&
        account.details_submitted
    ),
    disabledReason,
  };
};

const syncArtistStripeAccount = async (
  uid: string,
  stripe: Stripe,
  accountId: string
) => {
  const account = await stripe.accounts.retrieve(accountId);
  const status = getArtistStripeStatus(account);

  await db.collection("users").doc(uid).set(
    {
      paymentType: "internal",
      stripeConnect: {
        ...status,
        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return status;
};

const createArtistConnectedAccount = async (
  uid: string,
  artist: admin.firestore.DocumentData,
  stripe: Stripe
) => {
  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    email: artist.email,
    business_type: "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      firebaseUid: uid,
      satxinkRole: "artist",
    },
  });

  const status = getArtistStripeStatus(account);
  await db.collection("users").doc(uid).set(
    {
      paymentType: "internal",
      stripeConnect: {
        ...status,
        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return status;
};

const createStripeConnectAccount = onCall(
  { cors: true, region: "us-central1", secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Artist profile not found.");
    }

    const artist = userSnap.data() || {};
    if (!userCanConnectPayouts(artist)) {
      throw new HttpsError(
        "permission-denied",
        "Only artists and verified shop owners can connect payouts."
      );
    }

    const existingAccountId = artist.stripeConnect?.accountId;
    const stripe = getStripeClient();

    if (existingAccountId) {
      const status = await syncArtistStripeAccount(uid, stripe, existingAccountId);
      return { status };
    }

    const status = await createArtistConnectedAccount(uid, artist, stripe);

    return { status };
  }
);

const createStripeConnectOnboardingLink = onCall(
  { cors: true, region: "us-central1", secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const baseUrl = getBaseUrl(req.data?.returnUrl || req.data?.origin);
    const stripe = getStripeClient();
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const artist = userSnap.data() || {};

    if (!userCanConnectPayouts(artist)) {
      throw new HttpsError(
        "permission-denied",
        "Only artists and verified shop owners can connect payouts."
      );
    }

    let accountId = artist.stripeConnect?.accountId as string | undefined;

    if (!accountId) {
      const status = await createArtistConnectedAccount(uid, artist, stripe);
      accountId = status.accountId;
    }

    if (!accountId) {
      throw new HttpsError("internal", "Unable to create connected account.");
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/dashboard?stripe=refresh`,
      return_url: `${baseUrl}/dashboard?stripe=return`,
      type: "account_onboarding",
    });

    return { url: accountLink.url };
  }
);

const getStripeConnectStatus = onCall(
  { cors: true, region: "us-central1", secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const userSnap = await db.collection("users").doc(uid).get();
    const artist = userSnap.data() || {};
    const accountId = artist.stripeConnect?.accountId as string | undefined;

    if (!accountId) {
      return {
        status: {
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          onboardingComplete: false,
          disabledReason: "account_missing",
        },
      };
    }

    const status = await syncArtistStripeAccount(uid, getStripeClient(), accountId);
    return { status };
  }
);

const createStripeDashboardLoginLink = onCall(
  { cors: true, region: "us-central1", secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const userSnap = await db.collection("users").doc(uid).get();
    const artist = userSnap.data() || {};
    const accountId = artist.stripeConnect?.accountId as string | undefined;

    if (!accountId) {
      throw new HttpsError("failed-precondition", "Connect Stripe before opening the dashboard.");
    }

    const loginLink = await getStripeClient().accounts.createLoginLink(accountId);
    return { url: loginLink.url };
  }
);


const createCheckoutSession = onCall({ cors: true, region: "us-central1", secrets: [STRIPE_SECRET_KEY] }, async (req) => {

  const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

  const stripe = getStripeClient();

  try {
    const data = req.data as CheckoutRequestData;

    const { bookingId } = data;

    if (!bookingId) {
      throw new HttpsError("invalid-argument", "A bookingId is required.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
      throw new HttpsError("not-found", "Booking not found.");
    }

    const booking = bookingSnap.data() || {};

    if (booking.clientId !== uid) {
      throw new HttpsError("permission-denied", "Only the booking client can pay this booking.");
    }

    if (booking.status === "paid" || booking.status === "confirmed") {
      throw new HttpsError("failed-precondition", "This booking has already been paid.");
    }

    const priceCents = dollarsToCents(booking.price);
    const depositCents = dollarsToCents(booking.depositAmount || booking.price);
    const totalArtistPaidCents = Number(
      booking.totalArtistPaidCents ||
        booking.depositPaidAmountCents ||
        (booking.status === "deposit_paid" ? depositCents : 0)
    );
    let paymentMode = (data.paymentMode || "deposit") as CheckoutPaymentMode;

    if (!["deposit", "full", "remaining"].includes(paymentMode)) {
      paymentMode = "deposit";
    }

    if (booking.status === "deposit_paid") {
      paymentMode = "remaining";
    }

    if (
      paymentMode === "remaining" &&
      booking.remainingPaymentMethod === "external"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This booking's remaining balance is marked for in-person payment."
      );
    }

    if (paymentMode === "remaining" && booking.status !== "deposit_paid") {
      throw new HttpsError(
        "failed-precondition",
        "The remaining balance is not ready to be paid yet."
      );
    }

    const requestedSessionPaymentCents =
      paymentMode === "remaining" &&
      (booking.projectType === "multi_session" ||
        Number(booking.estimatedSessionCount || 1) > 1)
        ? Number(data.sessionPaymentAmountCents || 0) > 0
          ? Number(data.sessionPaymentAmountCents)
          : dollarsToCents(booking.pendingSessionPaymentAmount || 0)
        : 0;
    const minimumSessionPaymentCents =
      paymentMode === "remaining" &&
      (booking.projectType === "multi_session" ||
        Number(booking.estimatedSessionCount || 1) > 1)
        ? Math.max(
            dollarsToCents(booking.pendingSessionPaymentAmount || 0),
            Math.ceil(
              Math.max(priceCents - totalArtistPaidCents, 0) /
                Math.max(
                  Number(booking.estimatedSessionCount || 1) -
                    Number(booking.completedSessionCount || 0),
                  1
                )
            )
          )
        : 0;

    if (
      requestedSessionPaymentCents > 0 &&
      requestedSessionPaymentCents < minimumSessionPaymentCents
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Session payment cannot be below the minimum amount due."
      );
    }

    if (
      paymentMode === "remaining" &&
      (booking.projectType === "multi_session" ||
        Number(booking.estimatedSessionCount || 1) > 1) &&
      dollarsToCents(booking.pendingSessionPaymentAmount || 0) <= 0
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The next session payment is not ready yet."
      );
    }

    const artistAmountCents =
      paymentMode === "full"
        ? priceCents
        : paymentMode === "remaining"
        ? requestedSessionPaymentCents > 0
          ? Math.min(
              Math.max(priceCents - totalArtistPaidCents, 0),
              requestedSessionPaymentCents
            )
          : Math.max(priceCents - totalArtistPaidCents, 0)
        : Math.min(depositCents, priceCents);

    if (!Number.isFinite(artistAmountCents) || artistAmountCents < MIN_ARTIST_PAYOUT_CENTS) {
      throw new HttpsError(
        "failed-precondition",
        "The artist payout amount is too small to process."
      );
    }

    const platformFeeCents =
      paymentMode === "remaining"
        ? 0
        : calculatePlatformFeeCents(priceCents || artistAmountCents);

    const {
      clientTotalCents,
      stripeFeeCents,
    } = calculateClientPaymentBreakdown(artistAmountCents, platformFeeCents);

    if (clientTotalCents - platformFeeCents - stripeFeeCents < artistAmountCents) {
      throw new HttpsError(
        "failed-precondition",
        "The payment total could not cover the artist payout and fees."
      );
    }

    const artistSnap = await db.collection("users").doc(booking.artistId).get();
    const artist = artistSnap.data() || {};
    const connectedAccountId = artist.stripeConnect?.accountId as string | undefined;

    if (!connectedAccountId) {
      throw new HttpsError(
        "failed-precondition",
        "This artist has not connected Stripe payouts yet."
      );
    }

    const connectStatus = await syncArtistStripeAccount(
      booking.artistId,
      stripe,
      connectedAccountId
    );

    if (!connectStatus.chargesEnabled) {
      throw new HttpsError(
        "failed-precondition",
        "This artist needs to finish Stripe onboarding before accepting payments."
      );
    }
    
    let formattedDateTime = '';

    if (booking.selectedDate?.date && booking.selectedDate?.time) {
      const combinedDateTime = new Date(`${booking.selectedDate.date}T${booking.selectedDate.time}`);
      formattedDateTime = combinedDateTime.toLocaleString('en-US', {
        weekday: 'long',    // e.g., "Saturday"
        year: 'numeric',    // e.g., "2025"
        month: 'long',      // e.g., "July"
        day: 'numeric',     // e.g., "12"
        hour: 'numeric',    // e.g., "2"
        minute: '2-digit',  // e.g., "30"
        hour12: true        // e.g., "PM"
      });
    }

    const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
      metadata: {
        bookingId,
        artistId: booking.artistId ?? '',
        clientId: booking.clientId ?? '',
        artistAmountCents: String(artistAmountCents),
        platformFeeCents: String(platformFeeCents),
        estimatedStripeFeeCents: String(stripeFeeCents),
        clientTotalCents: String(clientTotalCents),
        paymentMode,
        priceCents: String(priceCents),
        depositCents: String(depositCents),
      },
    };

    if (platformFeeCents > 0) {
      paymentIntentData.application_fee_amount = platformFeeCents;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: clientTotalCents,
            product_data: {
              name: `${booking.artistName || artist.displayName || "Artist"}'s Tattoo Booking`,
              description: `Artist quote: $${(artistAmountCents / 100).toFixed(2)} | Studio: ${booking.shopName || 'N/A'} | Address: ${booking.shopAddress || 'N/A'} | Date: ${booking.selectedDate?.date || "TBD"} at ${booking.selectedDate?.time || "TBD"}`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: paymentIntentData,
      metadata: {
        offerId: booking.offerId ?? data.offerId ?? '',
        bookingId: bookingId ?? "",
        clientId: booking.clientId ?? '',
        artistId: booking.artistId ?? '',
        artistAvatar: booking.artistAvatar ?? '',
        displayName: booking.artistName ?? artist.displayName ?? '',
        shopName: booking.shopName ?? '',
        shopAddress: booking.shopAddress ?? '',
        selectedDate: formattedDateTime ?? '',
        artistAmountCents: String(artistAmountCents),
        platformFeeCents: String(platformFeeCents),
        estimatedStripeFeeCents: String(stripeFeeCents),
        clientTotalCents: String(clientTotalCents),
        paymentMode,
        priceCents: String(priceCents),
        depositCents: String(depositCents),
        stripeConnectedAccountId: connectedAccountId,
      },
      success_url: data.successUrl || `${DEFAULT_APP_URL}/payment-success?bookingId=${bookingId}`,
      cancel_url: data.cancelUrl || `${DEFAULT_APP_URL}/payment/${bookingId}`,
    }, {
      stripeAccount: connectedAccountId,
    });

    await bookingRef.set(
      {
        stripeCheckoutSessionId: session.id,
        stripeConnectedAccountId: connectedAccountId,
        artistQuotedAmount: artistAmountCents / 100,
        artistQuotedAmountCents: artistAmountCents,
        clientPaymentAmount: clientTotalCents / 100,
        clientPaymentAmountCents: clientTotalCents,
        platformFeeAmount: platformFeeCents / 100,
        platformFeeCents,
        estimatedStripeFeeAmount: stripeFeeCents / 100,
        estimatedStripeFeeCents: stripeFeeCents,
        artistPayoutAmount: artistAmountCents / 100,
        artistPayoutCents: artistAmountCents,
        checkoutPaymentMode: paymentMode,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { sessionUrl: session.url };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('Stripe checkout error', error);
    throw new HttpsError('internal', 'Unable to create checkout session');
  }
});
 
const syncBookingPaymentStatus = onCall(
  { cors: true, region: "us-central1", secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const bookingId = req.data?.bookingId as string | undefined;
    if (!bookingId) {
      throw new HttpsError("invalid-argument", "A bookingId is required.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
      throw new HttpsError("not-found", "Booking not found.");
    }

    const booking = bookingSnap.data() || {};
    if (booking.clientId !== uid && booking.artistId !== uid) {
      throw new HttpsError(
        "permission-denied",
        "Only the booking client or artist can sync this payment."
      );
    }

    if (booking.status === "paid" || booking.status === "confirmed") {
      return { paid: true, status: booking.status };
    }

    if (
      booking.status === "deposit_paid" &&
      booking.checkoutPaymentMode !== "remaining"
    ) {
      return { paid: true, status: booking.status };
    }

    const sessionId = booking.stripeCheckoutSessionId as string | undefined;
    if (!sessionId) {
      return { paid: false, status: booking.status || "pending_payment" };
    }

    let connectedAccountId =
      (booking.stripeConnectedAccountId as string | undefined) || undefined;

    if (!connectedAccountId && booking.artistId) {
      const artistSnap = await db.collection("users").doc(booking.artistId).get();
      const artist = artistSnap.data() || {};
      connectedAccountId = artist.stripeConnect?.accountId as string | undefined;
    }

    if (!connectedAccountId) {
      return { paid: false, status: booking.status || "pending_payment" };
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ["payment_intent"] },
      { stripeAccount: connectedAccountId }
    );

    const paymentIntent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    if (session.payment_status === "paid" || session.status === "complete") {
      const update = getCompletedBookingUpdate(
        booking,
        {
          ...session,
          payment_intent: paymentIntent,
        } as Stripe.Checkout.Session,
        connectedAccountId
      );

      await bookingRef.update(update);

      return { paid: true, status: update.status };
    }

    return {
      paid: false,
      status: booking.status || "pending_payment",
      stripeSessionStatus: session.status,
      stripePaymentStatus: session.payment_status,
    };
  }
);

const createShopClaimProofAccess = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const adminSnap = await db.collection("users").doc(uid).get();
    if (adminSnap.data()?.role !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "Only admins can view shop claim proof documents."
      );
    }

    const claimId = String(req.data?.claimId || "");
    const proofPath = String(req.data?.path || "");
    if (!claimId || !proofPath || !proofPath.startsWith("shopClaims/")) {
      throw new HttpsError("invalid-argument", "A valid proof path is required.");
    }

    const claimRef = db.collection("shopClaims").doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      throw new HttpsError("not-found", "Shop claim not found.");
    }

    const claim = claimSnap.data() || {};
    const proofDocuments = Array.isArray(claim.proofDocuments)
      ? claim.proofDocuments
      : [];
    const proofBelongsToClaim = proofDocuments.some(
      (proof: { path?: unknown }) => proof?.path === proofPath
    );

    if (!proofBelongsToClaim) {
      throw new HttpsError(
        "permission-denied",
        "This proof document is not attached to the selected claim."
      );
    }

    const expiresAt = Date.now() + 5 * 60 * 1000;
    const [url] = await bucket.file(proofPath).getSignedUrl({
      action: "read",
      expires: expiresAt,
    });

    await claimRef.collection("accessLogs").add({
      path: proofPath,
      viewedBy: uid,
      viewedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt),
    });

    await claimRef.set(
      {
        lastProofViewedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastProofViewedBy: uid,
      },
      { merge: true }
    );

    return { url, expiresAt };
  }
);

const createEventRsvp = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to RSVP for events.");
    }

    const eventId = String(req.data?.eventId || "").trim();
    if (!eventId) {
      throw new HttpsError("invalid-argument", "Event ID is required.");
    }

    const eventRef = db.collection("events").doc(eventId);
    const userRef = db.collection("users").doc(uid);
    const registrationRef = db.collection("eventRegistrations").doc(`${eventId}_${uid}`);

    return db.runTransaction(async (transaction) => {
      const [eventSnap, userSnap, existingRegistrationSnap] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(userRef),
        transaction.get(registrationRef),
      ]);

      if (!eventSnap.exists) {
        throw new HttpsError("not-found", "Event not found.");
      }

      const event = eventSnap.data() || {};
      if (event.status !== "published" || event.visibility !== "public") {
        throw new HttpsError("failed-precondition", "This event is not open for RSVP.");
      }

      if ((event.bookingMode || "info_only") !== "rsvp") {
        throw new HttpsError(
          "failed-precondition",
          "This event is not accepting free RSVPs yet."
        );
      }

      const endDate = event.endDate || event.startDate;
      const endTime = event.endTime || "23:59";
      if (endDate && new Date(`${endDate}T${endTime}`).getTime() < Date.now()) {
        throw new HttpsError("failed-precondition", "This event has already ended.");
      }

      const existingRegistration = existingRegistrationSnap.data();
      if (
        existingRegistrationSnap.exists &&
        existingRegistration?.status !== "cancelled"
      ) {
        return {
          registrationId: registrationRef.id,
          status: existingRegistration?.status || "reserved",
          qrToken: existingRegistration?.qrToken || "",
        };
      }

      const registrationsSnap = await transaction.get(
        db.collection("eventRegistrations").where("eventId", "==", eventId)
      );
      const activeRegistrations = registrationsSnap.docs.filter((docSnap) => {
        const status = docSnap.data().status;
        return isActiveEventRegistrationStatus(status);
      });
      const capacity = Number(event.capacity || 0);

      if (capacity > 0 && activeRegistrations.length >= capacity) {
        throw new HttpsError("resource-exhausted", "This event is already full.");
      }

      const user = userSnap.data() || {};
      const qrToken = createEventPassToken();
      const hostUserId = getEventHostUserId(event);
      const now = admin.firestore.FieldValue.serverTimestamp();

      transaction.set(registrationRef, {
        eventId,
        eventTitle: event.title || "",
        eventStartDate: event.startDate || "",
        eventStartTime: event.startTime || "",
        eventEndDate: event.endDate || "",
        eventEndTime: event.endTime || "",
        eventThumbnailUrl: event.thumbnailUrl || "",
        eventType: event.eventType || "",
        bookingMode: event.bookingMode || "rsvp",
        clientId: uid,
        clientName: user.displayName || user.name || req.auth?.token?.name || "Client",
        clientAvatarUrl: user.avatarUrl || req.auth?.token?.picture || "",
        hostUserId,
        artistId: event.artistId || "",
        shopId: event.shopId || "",
        ownerType: event.ownerType || "artist",
        hostName: event.shopName || event.artistName || "",
        locationName: event.shopName || "",
        address: event.address || "",
        mapLink: event.mapLink || "",
        status: "reserved",
        paymentStatus: "free",
        qrToken,
        qrTokenHash: hashEventPassToken(qrToken),
        createdAt: now,
        updatedAt: now,
      });

      transaction.set(
        eventRef,
        {
          spotsClaimed: activeRegistrations.length + 1,
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        registrationId: registrationRef.id,
        status: "reserved",
        qrToken,
      };
    });
  }
);

const createEventCheckoutSession = onCall(
  { cors: true, region: "us-central1", secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to buy event tickets.");
    }

    const eventId = String(req.data?.eventId || "").trim();
    if (!eventId) {
      throw new HttpsError("invalid-argument", "Event ID is required.");
    }

    const eventRef = db.collection("events").doc(eventId);
    const userRef = db.collection("users").doc(uid);
    const registrationRef = db.collection("eventRegistrations").doc(`${eventId}_${uid}`);
    const stripe = getStripeClient();

    const { event, qrToken } = await db.runTransaction(async (transaction) => {
      const [eventSnap, userSnap, existingRegistrationSnap] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(userRef),
        transaction.get(registrationRef),
      ]);

      if (!eventSnap.exists) {
        throw new HttpsError("not-found", "Event not found.");
      }

      const eventData = eventSnap.data() || {};
      if (eventData.status !== "published" || eventData.visibility !== "public") {
        throw new HttpsError("failed-precondition", "This event is not selling tickets.");
      }

      if (eventData.bookingMode !== "paid_ticket") {
        throw new HttpsError("failed-precondition", "This event is not a paid ticket event.");
      }

      const priceCents = Math.round(Number(eventData.price || 0) * 100);
      if (!priceCents || priceCents <= PLATFORM_FEE_MIN_CENTS) {
        throw new HttpsError(
          "failed-precondition",
          "Paid ticket prices must be greater than the platform fee."
        );
      }

      const existingRegistration = existingRegistrationSnap.data();
      if (
        existingRegistrationSnap.exists &&
        (existingRegistration?.status === "paid" ||
          existingRegistration?.status === "checked_in")
      ) {
        throw new HttpsError("already-exists", "You already have a ticket for this event.");
      }

      const registrationsSnap = await transaction.get(
        db.collection("eventRegistrations").where("eventId", "==", eventId)
      );
      const activeRegistrations = registrationsSnap.docs.filter((docSnap) =>
        docSnap.id !== registrationRef.id &&
        isActiveEventRegistrationStatus(docSnap.data().status)
      );
      const capacity = Number(eventData.capacity || 0);

      if (capacity > 0 && activeRegistrations.length >= capacity) {
        throw new HttpsError("resource-exhausted", "This event is already full.");
      }

      const userData = userSnap.data() || {};
      const nextQrToken = existingRegistration?.qrToken || createEventPassToken();
      const now = admin.firestore.FieldValue.serverTimestamp();

      transaction.set(
        registrationRef,
        {
          eventId,
          eventTitle: eventData.title || "",
          eventStartDate: eventData.startDate || "",
          eventStartTime: eventData.startTime || "",
          eventEndDate: eventData.endDate || "",
          eventEndTime: eventData.endTime || "",
          eventThumbnailUrl: eventData.thumbnailUrl || "",
          eventType: eventData.eventType || "",
          bookingMode: eventData.bookingMode || "paid_ticket",
          clientId: uid,
          clientName:
            userData.displayName || userData.name || req.auth?.token?.name || "Client",
          clientAvatarUrl: userData.avatarUrl || req.auth?.token?.picture || "",
          hostUserId: getEventHostUserId(eventData),
          artistId: eventData.artistId || "",
          shopId: eventData.shopId || "",
          ownerType: eventData.ownerType || "artist",
          hostName: eventData.shopName || eventData.artistName || "",
          locationName: eventData.shopName || "",
          address: eventData.address || "",
          mapLink: eventData.mapLink || "",
          status: "pending_payment",
          paymentStatus: "pending",
          qrToken: nextQrToken,
          qrTokenHash: hashEventPassToken(nextQrToken),
          ticketPriceCents: priceCents,
          updatedAt: now,
          createdAt: existingRegistrationSnap.exists
            ? existingRegistration?.createdAt || now
            : now,
        },
        { merge: true }
      );

      return { event: eventData, qrToken: nextQrToken };
    });

    try {
      const hostUserId = getEventHostUserId(event);
      if (!hostUserId) {
        throw new HttpsError("failed-precondition", "This event does not have a payout host.");
      }

      const hostSnap = await db.collection("users").doc(hostUserId).get();
      const host = hostSnap.data() || {};
      const connectedAccountId = host.stripeConnect?.accountId as string | undefined;

      if (!connectedAccountId) {
        throw new HttpsError(
          "failed-precondition",
          "This event host has not connected Stripe payouts yet."
        );
      }

      const connectStatus = await syncArtistStripeAccount(hostUserId, stripe, connectedAccountId);
      if (!connectStatus.chargesEnabled || !connectStatus.onboardingComplete) {
        throw new HttpsError(
          "failed-precondition",
          "This event host needs to finish Stripe onboarding before selling tickets."
        );
      }

      const artistAmountCents = Math.round(Number(event.price || 0) * 100);
      const platformFeeCents = calculatePlatformFeeCents(artistAmountCents);
      const { clientTotalCents, stripeFeeCents } = calculateClientPaymentBreakdown(
        artistAmountCents,
        platformFeeCents
      );
      const baseUrl = getBaseUrl(req.data?.origin || req.data?.returnUrl);
      const registrationId = `${eventId}_${uid}`;

      const session = await stripe.checkout.sessions.create(
        {
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: clientTotalCents,
                product_data: {
                  name: `${event.title || "SATX Ink event"} ticket`,
                  description: event.shopName || event.address || "Event ticket",
                  images: event.thumbnailUrl ? [event.thumbnailUrl] : undefined,
                },
              },
              quantity: 1,
            },
          ],
          payment_intent_data: {
            application_fee_amount: platformFeeCents,
            metadata: {
              eventPaymentType: "event_ticket",
              eventId,
              registrationId,
              clientId: uid,
              hostUserId,
              artistAmountCents: String(artistAmountCents),
              platformFeeCents: String(platformFeeCents),
              estimatedStripeFeeCents: String(stripeFeeCents),
              clientTotalCents: String(clientTotalCents),
              stripeConnectedAccountId: connectedAccountId,
            },
          },
          metadata: {
            eventPaymentType: "event_ticket",
            eventId,
            registrationId,
            clientId: uid,
            hostUserId,
            artistAmountCents: String(artistAmountCents),
            platformFeeCents: String(platformFeeCents),
            estimatedStripeFeeCents: String(stripeFeeCents),
            clientTotalCents: String(clientTotalCents),
            stripeConnectedAccountId: connectedAccountId,
            qrTokenHash: hashEventPassToken(qrToken),
          },
          success_url:
            req.data?.successUrl ||
            `${baseUrl}/dashboard?tab=eventPasses&eventCheckout=success`,
          cancel_url:
            req.data?.cancelUrl ||
            `${baseUrl}/events?eventCheckout=cancelled`,
        },
        { stripeAccount: connectedAccountId }
      );

      await registrationRef.set(
        {
          stripeCheckoutSessionId: session.id,
          stripeConnectedAccountId: connectedAccountId,
          clientPaymentAmountCents: clientTotalCents,
          platformFeeCents,
          estimatedStripeFeeCents: stripeFeeCents,
          hostPayoutCents: artistAmountCents,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { url: session.url, registrationId };
    } catch (error) {
      await registrationRef.set(
        {
          status: "cancelled",
          paymentStatus: "none",
          checkoutError:
            error instanceof Error ? error.message : "Could not start checkout.",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      throw error;
    }
  }
);

const cancelEventRsvp = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to cancel an RSVP.");
    }

    const registrationId = String(req.data?.registrationId || "").trim();
    if (!registrationId) {
      throw new HttpsError("invalid-argument", "Registration ID is required.");
    }

    const registrationRef = db.collection("eventRegistrations").doc(registrationId);

    return db.runTransaction(async (transaction) => {
      const registrationSnap = await transaction.get(registrationRef);
      if (!registrationSnap.exists) {
        throw new HttpsError("not-found", "Event pass not found.");
      }

      const registration = registrationSnap.data() || {};
      if (registration.clientId !== uid) {
        throw new HttpsError("permission-denied", "You can only cancel your own RSVP.");
      }

      if (registration.status === "checked_in") {
        throw new HttpsError("failed-precondition", "Checked-in passes cannot be cancelled.");
      }

      if (registration.paymentStatus !== "free") {
        throw new HttpsError(
          "failed-precondition",
          "Paid event tickets cannot be cancelled from the RSVP tool yet."
        );
      }

      const eventRef = db.collection("events").doc(String(registration.eventId || ""));
      const eventSnap = await transaction.get(eventRef);
      const event = eventSnap.data() || {};
      const activeCount = Math.max(Number(event.spotsClaimed || 1) - 1, 0);
      const now = admin.firestore.FieldValue.serverTimestamp();

      transaction.set(
        registrationRef,
        {
          status: "cancelled",
          cancelledAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      if (eventSnap.exists) {
        transaction.set(
          eventRef,
          {
            spotsClaimed: activeCount,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      return { status: "cancelled" };
    });
  }
);

const checkInEventRegistration = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to check in attendees.");
    }

    const registrationId = String(req.data?.registrationId || "").trim();
    const qrToken = String(req.data?.qrToken || "").trim();
    if (!registrationId || !qrToken) {
      throw new HttpsError("invalid-argument", "A valid event pass is required.");
    }

    const registrationRef = db.collection("eventRegistrations").doc(registrationId);
    const registrationSnap = await registrationRef.get();
    if (!registrationSnap.exists) {
      throw new HttpsError("not-found", "Event pass not found.");
    }

    const registration = registrationSnap.data() || {};
    if (registration.qrTokenHash !== hashEventPassToken(qrToken)) {
      throw new HttpsError("permission-denied", "This event pass is not valid.");
    }

    const [eventSnap, userSnap] = await Promise.all([
      db.collection("events").doc(String(registration.eventId || "")).get(),
      db.collection("users").doc(uid).get(),
    ]);

    if (!eventSnap.exists) {
      throw new HttpsError("not-found", "Event not found.");
    }

    const event = eventSnap.data() || {};
    const user = userSnap.data() || {};
    if (!userCanManageEvent(uid, user, event)) {
      throw new HttpsError("permission-denied", "You cannot check in this event.");
    }

    if (registration.status === "cancelled" || registration.status === "refunded") {
      throw new HttpsError("failed-precondition", "This pass is no longer active.");
    }

    if (registration.status === "pending_payment") {
      throw new HttpsError("failed-precondition", "This ticket has not been paid yet.");
    }

    if (registration.status === "checked_in") {
      return { status: "checked_in", alreadyCheckedIn: true };
    }

    await registrationRef.set(
      {
        status: "checked_in",
        checkedInAt: admin.firestore.FieldValue.serverTimestamp(),
        checkedInBy: uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { status: "checked_in", alreadyCheckedIn: false };
  }
);

const applyCompletedEventTicketCheckout = async (
  session: Stripe.Checkout.Session,
  connectedAccountId?: string | null
) => {
  const metadata = session.metadata || {};
  const registrationId = metadata.registrationId;
  const eventId = metadata.eventId;

  if (!registrationId || !eventId) {
    throw new Error("Missing event registration metadata.");
  }

  const registrationRef = db.collection("eventRegistrations").doc(registrationId);
  const eventRef = db.collection("events").doc(eventId);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  await db.runTransaction(async (transaction) => {
    const [registrationSnap, eventSnap] = await Promise.all([
      transaction.get(registrationRef),
      transaction.get(eventRef),
    ]);

    if (!registrationSnap.exists) {
      throw new Error(`Event registration ${registrationId} not found.`);
    }

    const registration = registrationSnap.data() || {};
    const event = eventSnap.data() || {};
    const alreadyApplied =
      registration.lastCompletedCheckoutSessionId === session.id ||
      registration.status === "paid" ||
      registration.status === "checked_in";

    if (!alreadyApplied) {
      const activeRegistrationsSnap = await transaction.get(
        db.collection("eventRegistrations").where("eventId", "==", eventId)
      );
      const activeRegistrations = activeRegistrationsSnap.docs.filter((docSnap) => {
        if (docSnap.id === registrationId) return false;
        return isActiveEventRegistrationStatus(docSnap.data().status);
      });
      const capacity = Number(event.capacity || 0);

      if (capacity > 0 && activeRegistrations.length >= capacity) {
        transaction.set(
          registrationRef,
          {
            status: "paid",
            paymentStatus: "paid",
            capacityReviewRequired: true,
            stripeCheckoutSessionId: session.id,
            lastCompletedCheckoutSessionId: session.id,
            stripePaymentIntentId: paymentIntentId,
            updatedAt: timestamp,
          },
          { merge: true }
        );
        return;
      }

      transaction.set(
        eventRef,
        {
          spotsClaimed: activeRegistrations.length + 1,
          updatedAt: timestamp,
        },
        { merge: true }
      );
    }

    transaction.set(
      registrationRef,
      {
        status: registration.status === "checked_in" ? "checked_in" : "paid",
        paymentStatus: "paid",
        paidAt: registration.paidAt || timestamp,
        stripeCheckoutSessionId: session.id,
        lastCompletedCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        stripeConnectedAccountId:
          connectedAccountId ?? metadata.stripeConnectedAccountId ?? null,
        hostPayoutCents: parseMetadataCents(metadata, "artistAmountCents"),
        platformFeeCents: parseMetadataCents(metadata, "platformFeeCents"),
        estimatedStripeFeeCents: parseMetadataCents(
          metadata,
          "estimatedStripeFeeCents"
        ),
        clientPaymentAmountCents: parseMetadataCents(metadata, "clientTotalCents"),
        updatedAt: timestamp,
      },
      { merge: true }
    );
  });
};

const stripeWebhook = onRequest(
  {
    region: 'us-central1',
    secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  },
  async (req, res): Promise<void> => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
      apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
    });

    const sig = req.headers['stripe-signature'] as string;
    const endpointSecret = STRIPE_WEBHOOK_SECRET.value();

    let event;

    try {
      const rawBody = req.rawBody;
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } catch (err: unknown) {
      console.error('❌ Webhook verification failed:', err);
      const message = err instanceof Error ? err.message : "Invalid webhook payload.";
      res.status(400).send(`Webhook Error: ${message}`);
      return;
    }

    const firestore = admin.firestore();
    const eventsRef = firestore.collection('processedEvents');
    const eventDoc = eventsRef.doc(event.id);

    // Check for duplicates (idempotency)
    const existing = await eventDoc.get();
    if (existing.exists) {
      console.log(`Skipping duplicate event: ${event.id}`);
      res.status(200).send('Event already processed.');
      return;
    }

    // Mark this event as processed
    await eventDoc.set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: event.type,
    });

    // Handle specific event types
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.eventPaymentType === "event_ticket") {
        try {
          await applyCompletedEventTicketCheckout(
            session,
            event.account ?? session.metadata?.stripeConnectedAccountId ?? null
          );
          res.status(200).send("Event ticket updated.");
        } catch (err) {
          console.error("Error updating event ticket:", err);
          res.status(500).send("Failed to update event ticket.");
        }
        return;
      }

      const bookingId = session.metadata?.bookingId;

      if (!bookingId) {
        console.warn("Missing bookingId in session metadata.");
        res.status(400).send("Missing bookingId.");
        return;
      }

      try {
        const bookingRef = firestore.collection("bookings").doc(bookingId);
        const bookingSnap = await bookingRef.get();

        if (!bookingSnap.exists) {
          console.warn(`Booking ${bookingId} not found for checkout webhook.`);
          res.status(404).send("Booking not found.");
          return;
        }

        const update = getCompletedBookingUpdate(
          bookingSnap.data() || {},
          session,
          event.account ?? session.metadata?.stripeConnectedAccountId ?? null
        );

        await bookingRef.update(update);

        console.log(`Booking ${bookingId} updated to ${update.status}.`);
        res.status(200).send("Booking updated.");
      } catch (err) {
        console.error("Error updating booking:", err);
        res.status(500).send("Failed to update booking.");
      }
    } else {
      console.log(`Unhandled event type: ${event.type}`);
      res.status(200).json({ received: true });
    }
  }
);



const processArtistMedia = onObjectFinalized(
  { timeoutSeconds: 300, memory: "2GiB" },
  async (event) => {
    const filePath = event.data.name;
    if (!filePath) return;

    if (
      !filePath.startsWith("users/") ||
      (
        !filePath.includes("/gallery/") &&
        !filePath.includes("/flashes/") &&
        !filePath.includes("/flashSheets/")
      ) ||
      filePath.includes("/flashSheets/flashes/")
    ) {
      return; // skip unrelated or already-processed crops
    }
    

    const fileName = path.basename(filePath).toLowerCase();
    if (fileName.includes("_thumb") || fileName.includes("_webp90") || fileName.includes("_full")) {
      console.log(`Skipping derivative file: ${filePath}`);
      return;
    }

    const parts = filePath.split("/");
    const mediaType = parts[2]; // "gallery" or "flashes"
    const baseName = path.basename(fileName, path.extname(fileName));
    const bucketDir = path.dirname(filePath);
    const uuid = uuidv4();

    const tempOriginal = path.join(os.tmpdir(), fileName);
    const tempThumb = path.join(os.tmpdir(), `${baseName}_thumb.webp`);
    const tempWebp90 = path.join(os.tmpdir(), `${baseName}_webp90.webp`);
    const tempFull = path.join(os.tmpdir(), `${baseName}_full.jpg`);

    try {
      // Download the uploaded original to a temp directory
      await bucket.file(filePath).download({ destination: tempOriginal });

      // Process three image sizes: 300px thumb, 1080px webp, full JPEG
      await sharp(tempOriginal).resize({ width: 300 }).webp({ quality: 70 }).toFile(tempThumb);
      await sharp(tempOriginal).resize({ width: 1080 }).webp({ quality: 90 }).toFile(tempWebp90);
      await sharp(tempOriginal).jpeg({ quality: 95 }).toFile(tempFull);

      // Destination paths for processed files
      const thumbPath = `${bucketDir}/${baseName}_thumb.webp`;
      const previewPath = `${bucketDir}/${baseName}_webp90.webp`;
      const fullPath = `${bucketDir}/${baseName}_full.jpg`;

      // Upload processed images to their final storage paths
      await bucket.upload(tempThumb, {
        destination: thumbPath,
        metadata: { contentType: "image/webp", metadata: { firebaseStorageDownloadTokens: uuid } },
      });
      await bucket.upload(tempWebp90, {
        destination: previewPath,
        metadata: { contentType: "image/webp", metadata: { firebaseStorageDownloadTokens: uuid } },
      });
      await bucket.upload(tempFull, {
        destination: fullPath,
        metadata: { contentType: "image/jpeg", metadata: { firebaseStorageDownloadTokens: uuid } },
      });

      // Helper for building download URLs
      const makeUrl = (path: string): string =>
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
          path
        )}?alt=media&token=${uuid}`;

      const thumbUrl = makeUrl(thumbPath);
      const webp90Url = makeUrl(previewPath);
      const fullUrl = makeUrl(fullPath);

      // Find the Firestore document created by UploadModal using fileName
      const snapshot = await db.collection(mediaType).where("fileName", "==", baseName).limit(1).get();

      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        const docData = snapshot.docs[0].data();

        // Skip processing if already done (retry safety)
        if (docData.thumbUrl || docData.webp90Url || docData.fullUrl) {
          console.log(`Skipping ${baseName} — already processed.`);
          await bucket.file(filePath).delete().catch(() => {
            console.log(`Could not delete duplicate raw file: ${filePath}`);
          });
          return;
        }

        // Update the Firestore doc with URLs and mark status as ready
        await docRef.update({
          thumbUrl,
          webp90Url,
          fullUrl,
          thumbPath,
          previewPath,
          fullPath,
          status: "ready",
        });

        console.log(`Updated Firestore doc for ${baseName} with image URLs.`);
      } else {
        console.warn(`No Firestore doc found for ${baseName}`);
      }

      // Delete the original raw cropped upload
      await bucket.file(filePath).delete().catch(() => {
        console.log(`Could not delete original file: ${filePath}`);
      });

      console.log(
        `Processed ${fileName}: Created 3 versions and updated Firestore doc in '${mediaType}'.`
      );
    } catch (err) {
      console.error(`Error processing ${filePath}:`, err);
    } finally {
      // Clean up temp files
      await Promise.allSettled([
        fs.unlink(tempOriginal),
        fs.unlink(tempThumb),
        fs.unlink(tempWebp90),
        fs.unlink(tempFull),
      ]);
    }
  }
);

const cropFlashFromSheet = onCall(
  { cors: true, region: "us-central1", timeoutSeconds: 120, memory: "1GiB" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to crop flash.");
    }

    const {
      sheetId,
      crop,
      title,
      price,
      tags,
    } = (req.data || {}) as {
      sheetId?: string;
      crop?: CropAreaInput;
      title?: string;
      price?: number | null;
      tags?: string[];
    };

    if (!sheetId || !crop) {
      throw new HttpsError("invalid-argument", "Sheet and crop are required.");
    }

    const sheetRef = db.collection("flashSheets").doc(sheetId);
    const sheetSnap = await sheetRef.get();
    if (!sheetSnap.exists) {
      throw new HttpsError("not-found", "Flash sheet not found.");
    }

    const sheet = sheetSnap.data() || {};
    if (sheet.artistId !== uid) {
      throw new HttpsError("permission-denied", "You can only crop your sheets.");
    }

    const sourcePath =
      typeof sheet.fullPath === "string" && sheet.fullPath
        ? sheet.fullPath
        : typeof sheet.imageUrl === "string"
          ? parseStoragePathFromDownloadUrl(sheet.imageUrl)
          : null;

    if (!sourcePath) {
      throw new HttpsError("failed-precondition", "Sheet image path is missing.");
    }

    const [sourceBuffer] = await bucket.file(sourcePath).download();
    const metadata = await sharp(sourceBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new HttpsError("failed-precondition", "Sheet image could not be read.");
    }

    const extract = clampCrop(crop, metadata.width, metadata.height);
    const cropped = await sharp(sourceBuffer).extract(extract).toBuffer();

    const timestamp = Date.now();
    const baseName = `flash_${timestamp}`;
    const bucketDir = `users/${uid}/flashes`;
    const uuid = uuidv4();
    const thumbPath = `${bucketDir}/${baseName}_thumb.webp`;
    const previewPath = `${bucketDir}/${baseName}_webp90.webp`;
    const fullPath = `${bucketDir}/${baseName}_full.jpg`;

    const [thumbBuffer, webp90Buffer, fullBuffer] = await Promise.all([
      sharp(cropped).resize({ width: 300 }).webp({ quality: 70 }).toBuffer(),
      sharp(cropped).resize({ width: 1080 }).webp({ quality: 90 }).toBuffer(),
      sharp(cropped).jpeg({ quality: 95 }).toBuffer(),
    ]);

    await Promise.all([
      bucket.file(thumbPath).save(thumbBuffer, {
        metadata: {
          contentType: "image/webp",
          metadata: { firebaseStorageDownloadTokens: uuid },
        },
      }),
      bucket.file(previewPath).save(webp90Buffer, {
        metadata: {
          contentType: "image/webp",
          metadata: { firebaseStorageDownloadTokens: uuid },
        },
      }),
      bucket.file(fullPath).save(fullBuffer, {
        metadata: {
          contentType: "image/jpeg",
          metadata: { firebaseStorageDownloadTokens: uuid },
        },
      }),
    ]);

    const makeUrl = (storagePath: string): string =>
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
        storagePath
      )}?alt=media&token=${uuid}`;

    const thumbUrl = makeUrl(thumbPath);
    const webp90Url = makeUrl(previewPath);
    const fullUrl = makeUrl(fullPath);
    const parsedPrice = Number(price);
    const normalizedPrice =
      price === null || price === undefined || !Number.isFinite(parsedPrice)
        ? null
        : parsedPrice;

    const flashRef = await db.collection("flashes").add({
      artistId: uid,
      fileName: baseName,
      sheetId,
      title: typeof title === "string" && title.trim() ? title.trim() : "Untitled Flash",
      price: normalizedPrice,
      tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string") : [],
      fullUrl,
      thumbUrl,
      webp90Url,
      thumbPath,
      previewPath,
      fullPath,
      isFromSheet: true,
      isAvailable: true,
      artistStripeConnectReady: true,
      marketplaceVisible: true,
      status: "ready",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      id: flashRef.id,
      fullUrl,
      thumbUrl,
      webp90Url,
    };
  }
);

const cleanupProcessedEvents = onSchedule("every 24 hours", async () => {
  const firestore = admin.firestore();
  const cutoff = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
  );

  const snapshot = await firestore
    .collection('processedEvents')
    .where('createdAt', '<', cutoff)
    .get();

  if (snapshot.empty) {
    console.log("No old processed events to delete.");
    return;
  }

  const batch = firestore.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  console.log(`Deleted ${snapshot.size} old processed events.`);
});





module.exports = {
  handleImageUpload,
  processAvatar,
  handleOfferImageUpload,
  createStripeConnectAccount,
  createStripeConnectOnboardingLink,
  getStripeConnectStatus,
  createStripeDashboardLoginLink,
  createCheckoutSession,
  syncBookingPaymentStatus,
  createShopClaimProofAccess,
  createEventRsvp,
  createEventCheckoutSession,
  cancelEventRsvp,
  checkInEventRegistration,
  stripeWebhook,
  processArtistMedia,
  cropFlashFromSheet,
  cleanupProcessedEvents,
};
 
