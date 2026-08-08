// functions/src/index.ts
import type { CheckoutRequestData } from '../src/types/StripeCheckout';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';


import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { setGlobalOptions }   from 'firebase-functions/v2/options';
import { defineSecret } from 'firebase-functions/params';

import * as admin  from 'firebase-admin';
import * as path   from 'path';
import * as os     from 'os';
import * as fs     from 'fs/promises';
import sharp       from 'sharp';
import { v4 as uuidv4 } from "uuid";  
import Stripe from 'stripe';
import { onCall } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';
import * as transactionalEmail from "./transactionalEmail";





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
const PLATFORM_FEE_MAX_CENTS = 1000;
const PLATFORM_FEE_RATE = 0.10;
const STRIPE_PERCENT_FEE = 0.029;
const STRIPE_FIXED_FEE_CENTS = 30;
const MIN_ARTIST_PAYOUT_CENTS = 100;
const DEFAULT_APP_URL = "https://satxink.com";
const FLASH_CHECKOUT_HOLD_SECONDS = 60 * 60;

const getReferenceImageOrder = (reference: { fileName?: string }) => {
  const order = Number(reference.fileName?.split("-")[0]);
  return Number.isFinite(order) && order > 0 ? order : Number.MAX_SAFE_INTEGER;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BOOKING_REFERENCE_STANDARD_RETENTION_DAYS = 365;
const BOOKING_REFERENCE_TERMINAL_RETENTION_DAYS = 90;
const BOOKING_REFERENCE_RETENTION_POLICY_VERSION = 1;
const BOOKING_REFERENCE_CLEANUP_BATCH_LIMIT = 100;
const BOOKING_REFERENCE_ALLOWED_PREFIXES = [
  "bookingRequests/full/",
  "bookingRequests/thumbs/",
  "bookingRequests/thumb/",
];
const BOOKING_REFERENCE_TERMINAL_STATUSES = new Set([
  "cancelled",
  "declined",
  "expired",
]);

type BookingReferenceImageData = {
  fileName?: string;
  fullUrl?: string;
  thumbUrl?: string;
  fullPath?: string;
  thumbPath?: string;
};

const getDateFromFirestoreValue = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (value && typeof value === "object" && "toDate" in value) {
    const date = (value as { toDate?: () => Date }).toDate?.();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  }

  return null;
};

const getBookingReferenceRetentionDays = (status: unknown) =>
  BOOKING_REFERENCE_TERMINAL_STATUSES.has(String(status || ""))
    ? BOOKING_REFERENCE_TERMINAL_RETENTION_DAYS
    : BOOKING_REFERENCE_STANDARD_RETENTION_DAYS;

const getBookingReferenceBaseDate = (data: admin.firestore.DocumentData) => {
  const status = String(data.status || "");
  const candidates = BOOKING_REFERENCE_TERMINAL_STATUSES.has(status)
    ? [
        data.declinedAt,
        data.expiredAt,
        data.cancelledAt,
        data.updatedAt,
        data.createdAt,
      ]
    : status === "offered"
    ? [data.offeredAt, data.updatedAt, data.createdAt]
    : [data.createdAt, data.updatedAt];

  for (const candidate of candidates) {
    const date = getDateFromFirestoreValue(candidate);
    if (date) return date;
  }

  return new Date();
};

const getBookingReferenceCleanupTimestamp = (
  data: admin.firestore.DocumentData
) => {
  const retentionDays = getBookingReferenceRetentionDays(data.status);
  const baseDate = getBookingReferenceBaseDate(data);
  return admin.firestore.Timestamp.fromDate(
    new Date(baseDate.getTime() + retentionDays * DAY_MS)
  );
};

const isBookingReferenceStoragePath = (value: unknown) =>
  typeof value === "string" &&
  BOOKING_REFERENCE_ALLOWED_PREFIXES.some((prefix) => value.startsWith(prefix));

const getBookingReferenceStoragePathFromUrl = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;

  try {
    const url = new URL(value);
    if (url.hostname === "storage.googleapis.com") {
      const [, ...pathParts] = url.pathname
        .split("/")
        .filter((part) => part.length > 0);
      const storagePath = decodeURIComponent(pathParts.join("/"));
      return isBookingReferenceStoragePath(storagePath) ? storagePath : null;
    }

    if (url.hostname === "firebasestorage.googleapis.com") {
      const marker = "/o/";
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex < 0) return null;

      const encodedPath = url.pathname.slice(markerIndex + marker.length);
      const storagePath = decodeURIComponent(encodedPath);
      return isBookingReferenceStoragePath(storagePath) ? storagePath : null;
    }
  } catch {
    return null;
  }

  return null;
};

const collectBookingReferenceStoragePaths = (
  data: admin.firestore.DocumentData
) => {
  const paths = new Set<string>();
  const addPath = (value: unknown) => {
    if (isBookingReferenceStoragePath(value)) {
      paths.add(value as string);
      return;
    }

    const parsedPath = getBookingReferenceStoragePathFromUrl(value);
    if (parsedPath) paths.add(parsedPath);
  };

  if (Array.isArray(data.referenceImages)) {
    data.referenceImages.forEach((reference: BookingReferenceImageData) => {
      addPath(reference.fullPath);
      addPath(reference.thumbPath);
      addPath(reference.fullUrl);
      addPath(reference.thumbUrl);
    });
  }

  if (data.sourceType !== "flash") {
    addPath(data.fullPath);
    addPath(data.thumbPath);
    addPath(data.fullUrl);
    addPath(data.thumbUrl);
  }

  return [...paths];
};

const userCanConnectPayouts = (user: admin.firestore.DocumentData) =>
  user.role === "artist";

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

type CheckoutPaymentMode = "deposit" | "full" | "remaining" | "platform_fee";
type CheckoutPaymentPurpose =
  | "session_deposit"
  | "session_balance"
  | "platform_fee"
  | "legacy";
type FlashRepeatability = "repeatable" | "one_of_one";
type FlashAvailabilityStatus = "available" | "held" | "sold";
type FlashPublicationStatus = "draft" | "published";
type ProjectStatus = "active" | "paused" | "completed";
type SessionInstallmentTiming = "before_session" | "after_session";
type SessionBalanceMethod = "stripe" | "external";
type SessionAllocation = {
  sessionNumber: number;
  quotedAmountCents: number;
  depositAmountCents: number;
};
type ProjectAmendmentType =
  | "add_sessions"
  | "schedule_next_session"
  | "pause_project"
  | "resume_project";
type ProjectAmendmentStatus =
  | "proposed"
  | "accepted"
  | "declined"
  | "cancelled";

type CropAreaInput = {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
};

const FLASH_DESCRIPTION_MAX_LENGTH = 180;

const getImageMegapixels = (width?: number, height?: number) =>
  width && height ? Number(((width * height) / 1000000).toFixed(1)) : null;

const getStorageObjectSizeBytes = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : null;

  return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeFlashDescription = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  return trimmedValue.slice(0, FLASH_DESCRIPTION_MAX_LENGTH);
};

const getFlashRepeatability = (
  data: admin.firestore.DocumentData | undefined
): FlashRepeatability =>
  data?.repeatability === "one_of_one" ? "one_of_one" : "repeatable";

const getFlashAvailabilityStatus = (
  data: admin.firestore.DocumentData | undefined
): FlashAvailabilityStatus =>
  data?.availabilityStatus === "held" || data?.availabilityStatus === "sold"
    ? data.availabilityStatus
    : "available";

const getFlashPublicationStatus = (
  data: admin.firestore.DocumentData | undefined
): FlashPublicationStatus =>
  data?.publicationStatus === "draft" ? "draft" : "published";

type MarketplaceKind = "flash" | "sheet";

type MarketplaceArtistPublic = {
  id: string;
  name: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  studioName: string | null;
};

type MarketplaceProjection = {
  marketplaceReady: boolean;
  artistPublic: MarketplaceArtistPublic | null;
  searchTokens: string[];
  searchTags: string[];
  hasPrice?: boolean;
};

const MARKETPLACE_METADATA_REF = db
  .collection("siteSettings")
  .doc("flashMarketplace");
const MARKETPLACE_TAG_COUNTS_COLLECTION = "marketplaceTagCounts";
const MARKETPLACE_TOP_TAG_LIMIT = 18;
const MARKETPLACE_BATCH_LIMIT = 450;
const MARKETPLACE_PROJECTION_VERSION = 1;
const MARKETPLACE_PROJECTION_LEASE_MS = 10 * 60 * 1000;

const getFirstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const getStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

const normalizeSearchValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const getSearchWords = (value: unknown) => {
  const normalized = normalizeSearchValue(value);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
};

const normalizeTagKey = (tag: string) => getSearchWords(tag).join("-");

const getTagLabelMap = (tags: unknown) => {
  const labels: Record<string, string> = {};
  getStringArray(tags).forEach((tag) => {
    const key = normalizeTagKey(tag);
    if (key && !labels[key]) labels[key] = tag.trim();
  });
  return labels;
};

const buildMarketplaceSearchTokens = (
  item: admin.firestore.DocumentData,
  artist: MarketplaceArtistPublic | null
) => {
  const tokens = new Set<string>();
  [
    item.title,
    item.caption,
    item.description,
    artist?.displayName,
    artist?.name,
    artist?.studioName,
    ...getStringArray(item.tags),
  ].forEach((value) => {
    getSearchWords(value).forEach((word) => tokens.add(word));
  });

  return Array.from(tokens).slice(0, 80);
};

const buildMarketplaceSearchTags = (tags: unknown) =>
  Array.from(
    new Set(
      getStringArray(tags)
        .map(normalizeTagKey)
        .filter(Boolean)
    )
  ).slice(0, 40);

const isStripeConnectReadyForMarketplace = (
  artist: admin.firestore.DocumentData | null | undefined
) => {
  const stripeConnect = artist?.stripeConnect;
  return Boolean(
    stripeConnect?.onboardingComplete &&
      stripeConnect?.chargesEnabled &&
      stripeConnect?.payoutsEnabled &&
      stripeConnect?.detailsSubmitted
  );
};

const buildMarketplaceArtistPublic = (
  artistId: string,
  artist: admin.firestore.DocumentData | null | undefined
): MarketplaceArtistPublic => ({
  id: artistId,
  name: getFirstString(artist?.name) || null,
  displayName: getFirstString(artist?.displayName) || null,
  avatarUrl: getFirstString(artist?.avatarUrl, artist?.avatar, artist?.photoURL) || null,
  studioName: getFirstString(artist?.studioName, artist?.shopName) || null,
});

const getMarketplaceArtist = async (artistId: unknown) => {
  if (typeof artistId !== "string" || !artistId.trim()) return null;
  const artistSnap = await db.collection("users").doc(artistId.trim()).get();
  return artistSnap.exists ? artistSnap.data() || null : null;
};

const hasMarketplaceImage = (item: admin.firestore.DocumentData) =>
  Boolean(item.thumbUrl || item.webp90Url || item.fullUrl || item.imageUrl);

const hasValidMarketplacePrice = (item: admin.firestore.DocumentData) =>
  typeof item.price === "number" && Number.isFinite(item.price) && item.price > 0;

const buildFlashMarketplaceProjectionFromArtist = (
  item: admin.firestore.DocumentData,
  artist: admin.firestore.DocumentData | null | undefined
): MarketplaceProjection => {
  const artistId = getFirstString(item.artistId);
  const artistPublic = artistId ? buildMarketplaceArtistPublic(artistId, artist) : null;
  const artistReady =
    item.artistStripeConnectReady === true || isStripeConnectReadyForMarketplace(artist);
  const hasPrice = hasValidMarketplacePrice(item);
  const marketplaceReady = Boolean(
    artistId &&
      artistReady &&
      item.marketplaceVisible !== false &&
      getFlashPublicationStatus(item) === "published" &&
      item.isAvailable !== false &&
      getFlashAvailabilityStatus(item) === "available" &&
      hasPrice &&
      hasMarketplaceImage(item)
  );

  return {
    marketplaceReady,
    artistPublic,
    searchTokens: buildMarketplaceSearchTokens(item, artistPublic),
    searchTags: buildMarketplaceSearchTags(item.tags),
    hasPrice,
  };
};

const buildFlashMarketplaceProjection = async (
  item: admin.firestore.DocumentData
): Promise<MarketplaceProjection> =>
  buildFlashMarketplaceProjectionFromArtist(
    item,
    await getMarketplaceArtist(getFirstString(item.artistId))
  );

const buildSheetMarketplaceProjectionFromArtist = (
  item: admin.firestore.DocumentData,
  artist: admin.firestore.DocumentData | null | undefined
): MarketplaceProjection => {
  const artistId = getFirstString(item.artistId);
  const artistPublic = artistId ? buildMarketplaceArtistPublic(artistId, artist) : null;
  const artistReady =
    item.artistStripeConnectReady === true || isStripeConnectReadyForMarketplace(artist);
  const marketplaceReady = Boolean(
    artistId &&
      artistReady &&
      item.marketplaceVisible !== false &&
      hasMarketplaceImage(item)
  );

  return {
    marketplaceReady,
    artistPublic,
    searchTokens: buildMarketplaceSearchTokens(item, artistPublic),
    searchTags: buildMarketplaceSearchTags(item.tags),
  };
};

const buildSheetMarketplaceProjection = async (
  item: admin.firestore.DocumentData
): Promise<MarketplaceProjection> =>
  buildSheetMarketplaceProjectionFromArtist(
    item,
    await getMarketplaceArtist(getFirstString(item.artistId))
  );

const arraysEqual = (left: unknown, right: unknown) => {
  const leftItems = getStringArray(left);
  const rightItems = getStringArray(right);
  return (
    leftItems.length === rightItems.length &&
    leftItems.every((item, index) => item === rightItems[index])
  );
};

const artistPublicEquals = (
  left: unknown,
  right: MarketplaceArtistPublic | null
) => JSON.stringify(left || null) === JSON.stringify(right || null);

const projectionMatches = (
  data: admin.firestore.DocumentData,
  projection: MarketplaceProjection
) =>
  data.marketplaceReady === projection.marketplaceReady &&
  artistPublicEquals(data.artistPublic, projection.artistPublic) &&
  arraysEqual(data.searchTokens, projection.searchTokens) &&
  arraysEqual(data.searchTags, projection.searchTags) &&
  (projection.hasPrice === undefined || data.hasPrice === projection.hasPrice);

const getProjectionUpdate = (projection: MarketplaceProjection) => ({
  marketplaceReady: projection.marketplaceReady,
  artistPublic: projection.artistPublic,
  searchTokens: projection.searchTokens,
  searchTags: projection.searchTags,
  ...(projection.hasPrice === undefined ? {} : { hasPrice: projection.hasPrice }),
  marketplaceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

const refreshMarketplaceTopTags = async () => {
  const snapshot = await db
    .collection(MARKETPLACE_TAG_COUNTS_COLLECTION)
    .where("count", ">", 0)
    .orderBy("count", "desc")
    .limit(MARKETPLACE_TOP_TAG_LIMIT)
    .get();

  await MARKETPLACE_METADATA_REF.set(
    {
      topTags: snapshot.docs.map((tagDoc) => {
        const data = tagDoc.data() || {};
        return {
          key: tagDoc.id,
          tag: getFirstString(data.tag) || tagDoc.id,
          count: typeof data.count === "number" ? data.count : 0,
        };
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
};

const updateMarketplaceMetadata = async ({
  kind,
  beforeReady,
  beforeTags,
  afterReady,
  afterTags,
  afterTagLabels,
}: {
  kind: MarketplaceKind;
  beforeReady: boolean;
  beforeTags: string[];
  afterReady: boolean;
  afterTags: string[];
  afterTagLabels: Record<string, string>;
}) => {
  const readyChanged = beforeReady !== afterReady;
  const beforeTagSet = new Set(beforeReady ? beforeTags : []);
  const afterTagSet = new Set(afterReady ? afterTags : []);
  const removedTags = Array.from(beforeTagSet).filter((tag) => !afterTagSet.has(tag));
  const addedTags = Array.from(afterTagSet).filter((tag) => !beforeTagSet.has(tag));

  if (!readyChanged && removedTags.length === 0 && addedTags.length === 0) return;

  const batch = db.batch();
  const countField = kind === "flash" ? "flashCount" : "sheetCount";

  if (readyChanged) {
    batch.set(
      MARKETPLACE_METADATA_REF,
      {
        [countField]: admin.firestore.FieldValue.increment(afterReady ? 1 : -1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  removedTags.forEach((tagKey) => {
    batch.set(
      db.collection(MARKETPLACE_TAG_COUNTS_COLLECTION).doc(tagKey),
      {
        count: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  addedTags.forEach((tagKey) => {
    batch.set(
      db.collection(MARKETPLACE_TAG_COUNTS_COLLECTION).doc(tagKey),
      {
        tag: afterTagLabels[tagKey] || tagKey,
        count: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();
  await refreshMarketplaceTopTags();
};

const syncMarketplaceProjectionDocument = async ({
  kind,
  before,
  after,
}: {
  kind: MarketplaceKind;
  before: admin.firestore.QueryDocumentSnapshot | undefined;
  after: admin.firestore.QueryDocumentSnapshot | undefined;
}) => {
  const beforeData = before?.data();

  if (!after) {
    await updateMarketplaceMetadata({
      kind,
      beforeReady: beforeData?.marketplaceReady === true,
      beforeTags: getStringArray(beforeData?.searchTags),
      afterReady: false,
      afterTags: [],
      afterTagLabels: {},
    });
    return;
  }

  const afterData = after.data() || {};
  const projection =
    kind === "flash"
      ? await buildFlashMarketplaceProjection(afterData)
      : await buildSheetMarketplaceProjection(afterData);

  if (!projectionMatches(afterData, projection)) {
    await after.ref.update(getProjectionUpdate(projection));
    return;
  }

  await updateMarketplaceMetadata({
    kind,
    beforeReady: beforeData?.marketplaceReady === true,
    beforeTags: getStringArray(beforeData?.searchTags),
    afterReady: projection.marketplaceReady,
    afterTags: projection.searchTags,
    afterTagLabels: getTagLabelMap(afterData.tags),
  });
};

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (
    typeof value === "object" &&
    "seconds" in value &&
    typeof (value as { seconds?: unknown }).seconds === "number"
  ) {
    return (value as { seconds: number }).seconds * 1000;
  }
  return 0;
};

const isHeldUntilExpired = (value: unknown) => {
  const heldUntilMillis = toMillis(value);
  return heldUntilMillis > 0 && heldUntilMillis <= Date.now();
};

const getFlashHoldReleaseUpdate = () => ({
  availabilityStatus: "available",
  isAvailable: true,
  heldByBookingId: admin.firestore.FieldValue.delete(),
  heldByClientId: admin.firestore.FieldValue.delete(),
  heldByCheckoutSessionId: admin.firestore.FieldValue.delete(),
  heldUntil: admin.firestore.FieldValue.delete(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

const reserveOneOfOneFlashForCheckout = async ({
  bookingRef,
  bookingId,
  booking,
  clientId,
  holdUntil,
}: {
  bookingRef: admin.firestore.DocumentReference;
  bookingId: string;
  booking: admin.firestore.DocumentData;
  clientId: string;
  holdUntil: Date;
}) => {
  const flashId = typeof booking.flashId === "string" ? booking.flashId : "";
  if (booking.sourceType !== "flash" || !flashId) return false;

  const flashRef = db.collection("flashes").doc(flashId);
  const holdUntilTimestamp = admin.firestore.Timestamp.fromDate(holdUntil);

  return db.runTransaction(async (transaction) => {
    const flashSnap = await transaction.get(flashRef);
    if (!flashSnap.exists) {
      throw new HttpsError("not-found", "Flash design not found.");
    }

    const flash = flashSnap.data() || {};
    const repeatability = getFlashRepeatability(flash);
    if (repeatability !== "one_of_one") {
      transaction.set(
        bookingRef,
        {
          flashRepeatability: repeatability,
          flashAvailabilityStatus: getFlashAvailabilityStatus(flash),
        },
        { merge: true }
      );
      return false;
    }

    const status = getFlashAvailabilityStatus(flash);
    const heldByBookingId = flash.heldByBookingId as string | undefined;
    const heldByClientId = flash.heldByClientId as string | undefined;
    const sameHold =
      heldByBookingId === bookingId ||
      (heldByClientId === clientId && isHeldUntilExpired(flash.heldUntil));
    const canReclaimExpiredHold =
      status === "held" && isHeldUntilExpired(flash.heldUntil);

    if (status === "sold") {
      throw new HttpsError(
        "failed-precondition",
        "This one-of-one flash has already been purchased."
      );
    }

    if (status === "held" && !sameHold && !canReclaimExpiredHold) {
      throw new HttpsError(
        "failed-precondition",
        "This one-of-one flash is currently held for another checkout."
      );
    }

    if (flash.isAvailable === false && status !== "held") {
      throw new HttpsError(
        "failed-precondition",
        "This one-of-one flash is no longer available."
      );
    }

    transaction.update(flashRef, {
      repeatability: "one_of_one",
      availabilityStatus: "held",
      isAvailable: false,
      heldByBookingId: bookingId,
      heldByClientId: clientId,
      heldByCheckoutSessionId: admin.firestore.FieldValue.delete(),
      heldUntil: holdUntilTimestamp,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.set(
      bookingRef,
      {
        flashRepeatability: "one_of_one",
        flashAvailabilityStatus: "held",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return true;
  });
};

const setOneOfOneFlashCheckoutSession = async ({
  flashId,
  bookingId,
  sessionId,
  holdUntil,
}: {
  flashId?: string | null;
  bookingId: string;
  sessionId: string;
  holdUntil: Date;
}) => {
  if (!flashId) return;

  await db.runTransaction(async (transaction) => {
    const flashRef = db.collection("flashes").doc(flashId);
    const flashSnap = await transaction.get(flashRef);
    if (!flashSnap.exists) return;

    const flash = flashSnap.data() || {};
    if (
      getFlashRepeatability(flash) !== "one_of_one" ||
      getFlashAvailabilityStatus(flash) !== "held" ||
      flash.heldByBookingId !== bookingId
    ) {
      return;
    }

    transaction.update(flashRef, {
      heldByCheckoutSessionId: sessionId,
      heldUntil: admin.firestore.Timestamp.fromDate(holdUntil),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
};

const releaseOneOfOneFlashHold = async ({
  flashId,
  bookingId,
  sessionId,
}: {
  flashId?: string | null;
  bookingId?: string | null;
  sessionId?: string | null;
}) => {
  if (!flashId) return false;

  return db.runTransaction(async (transaction) => {
    const flashRef = db.collection("flashes").doc(flashId);
    const flashSnap = await transaction.get(flashRef);
    if (!flashSnap.exists) return false;

    const flash = flashSnap.data() || {};
    if (
      getFlashRepeatability(flash) !== "one_of_one" ||
      getFlashAvailabilityStatus(flash) !== "held"
    ) {
      return false;
    }

    if (bookingId && flash.heldByBookingId !== bookingId) return false;
    if (
      sessionId &&
      flash.heldByCheckoutSessionId &&
      flash.heldByCheckoutSessionId !== sessionId
    ) {
      return false;
    }

    transaction.update(flashRef, getFlashHoldReleaseUpdate());
    if (bookingId) {
      transaction.set(
        db.collection("bookings").doc(bookingId),
        {
          flashAvailabilityStatus: "available",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return true;
  });
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

const centsToDollars = (amountCents: number) => amountCents / 100;

const getNonNegativeCents = (value: unknown, fallback = 0) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getPositiveInteger = (value: unknown, fallback = 1) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const PAYMENT_MODEL_VERSION = 2;
const MAX_PROJECT_SESSION_COUNT = 12;
const MAX_SESSION_DEPOSIT_RATE = 0.5;

const buildEqualSessionAllocations = ({
  totalQuoteCents,
  sessionCount,
  depositAmountCents,
}: {
  totalQuoteCents: number;
  sessionCount: number;
  depositAmountCents: number;
}): SessionAllocation[] => {
  const normalizedTotal = Math.max(Math.round(totalQuoteCents), 0);
  const normalizedCount = Math.min(
    Math.max(Math.floor(sessionCount), 1),
    MAX_PROJECT_SESSION_COUNT
  );
  const baseSessionCents = Math.floor(normalizedTotal / normalizedCount);
  const remainderCents = normalizedTotal % normalizedCount;

  return Array.from({ length: normalizedCount }, (_, index) => {
    const quotedAmountCents =
      baseSessionCents + (index < remainderCents ? 1 : 0);
    const maximumDepositCents = Math.floor(
      quotedAmountCents * MAX_SESSION_DEPOSIT_RATE
    );

    return {
      sessionNumber: index + 1,
      quotedAmountCents,
      depositAmountCents: Math.min(
        Math.max(Math.round(depositAmountCents), 0),
        maximumDepositCents
      ),
    };
  });
};

const getProjectSessionAllocation = (
  booking: admin.firestore.DocumentData,
  sessionNumber: number
) => {
  const storedAllocations = Array.isArray(booking.sessionAllocations)
    ? booking.sessionAllocations
    : [];
  const stored = storedAllocations.find(
    (allocation: admin.firestore.DocumentData) =>
      Number(allocation?.sessionNumber) === sessionNumber
  );
  if (stored) {
    return {
      sessionNumber,
      quotedAmountCents: getNonNegativeCents(stored.quotedAmountCents, 0),
      depositAmountCents: getNonNegativeCents(stored.depositAmountCents, 0),
    };
  }

  const allocations = buildEqualSessionAllocations({
    totalQuoteCents: getBookingPriceCents(booking),
    sessionCount: getEstimatedSessionCount(booking),
    depositAmountCents: dollarsToCents(booking.depositAmount),
  });
  return allocations[Math.max(sessionNumber - 1, 0)] || allocations[0];
};

const isProtectedSessionPaymentBooking = (
  booking: admin.firestore.DocumentData
) => Number(booking.paymentModelVersion || 0) === PAYMENT_MODEL_VERSION;

const getOptionalString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const getBookingPriceCents = (booking: admin.firestore.DocumentData) =>
  getNonNegativeCents(booking.priceCents, dollarsToCents(booking.price));

const getEstimatedSessionCount = (booking: admin.firestore.DocumentData) =>
  Math.max(getPositiveInteger(booking.estimatedSessionCount, 1), 1);

const getActiveSessionNumber = (booking: admin.firestore.DocumentData) =>
  Math.max(getPositiveInteger(booking.activeSessionNumber, 1), 1);

const getCompletedSessionCount = (booking: admin.firestore.DocumentData) =>
  getNonNegativeCents(booking.completedSessionCount, 0);

const getLastPaidSessionNumber = (booking: admin.firestore.DocumentData) =>
  getNonNegativeCents(booking.lastPaidSessionNumber, 0);

const getSessionInstallmentTiming = (
  booking: admin.firestore.DocumentData
): SessionInstallmentTiming =>
  booking.sessionInstallmentTiming === "before_session"
    ? "before_session"
    : "after_session";

const isMultiSessionBooking = (booking: admin.firestore.DocumentData) =>
  booking.projectType === "multi_session" || getEstimatedSessionCount(booking) > 1;

const getTotalArtistPaidCents = (booking: admin.firestore.DocumentData) =>
  getNonNegativeCents(
    booking.totalArtistPaidCents,
    getNonNegativeCents(
      booking.depositPaidAmountCents,
      booking.status === "deposit_paid" || booking.status === "paid"
        ? dollarsToCents(booking.depositAmount || 0)
        : 0
    )
  );

const getRemainingBalanceCents = (booking: admin.firestore.DocumentData) =>
  getNonNegativeCents(
    booking.remainingBalanceCents,
    Math.max(getBookingPriceCents(booking) - getTotalArtistPaidCents(booking), 0)
  );

const getRemainingInstallmentCount = (
  booking: admin.firestore.DocumentData
) => {
  const totalLaterInstallments = Math.max(getEstimatedSessionCount(booking) - 1, 1);
  const lastPaidSessionNumber = getLastPaidSessionNumber(booking);
  const paidLaterInstallments =
    getSessionInstallmentTiming(booking) === "before_session"
      ? Math.max(lastPaidSessionNumber - 1, 0)
      : lastPaidSessionNumber;

  return Math.max(totalLaterInstallments - paidLaterInstallments, 1);
};

const getPlatformFeeCollectedCents = (
  booking: admin.firestore.DocumentData,
  includeLegacyPlatformFee = true
) => {
  const explicit = Number(booking.platformFeeCollectedCents);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.round(explicit);

  return includeLegacyPlatformFee
    ? getNonNegativeCents(booking.platformFeeCents, 0)
    : 0;
};

const getPendingPlatformFeeCents = (booking: admin.firestore.DocumentData) =>
  getNonNegativeCents(booking.pendingPlatformFeeCents, 0);

const getSessionInstallmentCents = (booking: admin.firestore.DocumentData) => {
  const remainingBalanceCents = getRemainingBalanceCents(booking);
  const pendingCents = getNonNegativeCents(
    booking.pendingSessionPaymentAmountCents,
    dollarsToCents(booking.pendingSessionPaymentAmount || 0)
  );

  if (pendingCents > 0) {
    return Math.min(pendingCents, remainingBalanceCents);
  }

  const sessionsLeft = isMultiSessionBooking(booking)
    ? getRemainingInstallmentCount(booking)
    : Math.max(getEstimatedSessionCount(booking) - getCompletedSessionCount(booking), 1);

  return Math.ceil(remainingBalanceCents / sessionsLeft);
};

const getBookingSessionRefs = (bookingId: string, sessionNumber: number) => {
  const summaryRef = db.collection("bookingSessions").doc(bookingId);
  const sessionRef = summaryRef
    .collection("sessions")
    .doc(`session-${sessionNumber}`);

  return { summaryRef, sessionRef };
};

const getParticipantRole = (
  booking: admin.firestore.DocumentData,
  uid: string
) => {
  if (booking.artistId === uid) return "artist" as const;
  if (booking.clientId === uid) return "client" as const;
  throw new HttpsError(
    "permission-denied",
    "Only the booking client or artist can update this project."
  );
};

const getProjectStatus = (
  booking: admin.firestore.DocumentData
): ProjectStatus => {
  if (booking.projectStatus === "paused") return "paused";
  if (booking.projectStatus === "completed") return "completed";
  return "active";
};

const createSessionSummaryUpdate = (
  bookingId: string,
  booking: admin.firestore.DocumentData,
  sessionNumber: number,
  update: admin.firestore.DocumentData
) => ({
  bookingId,
  artistId: booking.artistId,
  clientId: booking.clientId,
  offerId: booking.offerId ?? null,
  activeSessionNumber: sessionNumber,
  estimatedSessionCount: getEstimatedSessionCount(booking),
  remainingAmount: centsToDollars(getRemainingBalanceCents(booking)),
  remainingAmountCents: getRemainingBalanceCents(booking),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  ...update,
});

const createSessionRecordUpdate = (
  bookingId: string,
  booking: admin.firestore.DocumentData,
  sessionNumber: number,
  update: admin.firestore.DocumentData
) => ({
  bookingId,
  artistId: booking.artistId,
  clientId: booking.clientId,
  sessionNumber,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  ...update,
});

const createFlashRequest = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in as a client to request this flash."
      );
    }

    const flashId = getOptionalString(req.data?.flashId);
    const bodyPlacement = getOptionalString(req.data?.bodyPlacement);
    const size = getOptionalString(req.data?.size);
    const preferredDateRange = Array.isArray(req.data?.preferredDateRange)
      ? req.data.preferredDateRange.map(getOptionalString)
      : [];
    const availableTimeInput = req.data?.availableTime as
      | { from?: unknown; to?: unknown }
      | undefined;
    const availableTime = {
      from: getOptionalString(availableTimeInput?.from),
      to: getOptionalString(availableTimeInput?.to),
    };
    const availableDays = Array.isArray(req.data?.availableDays)
      ? [...new Set(req.data.availableDays.map(getOptionalString).filter(Boolean))]
      : [];

    if (!flashId) {
      throw new HttpsError("invalid-argument", "Choose a flash design first.");
    }
    if (!bodyPlacement || !size) {
      throw new HttpsError(
        "invalid-argument",
        "Placement and size are required."
      );
    }
    if (
      preferredDateRange.length !== 2 ||
      !preferredDateRange[0] ||
      !preferredDateRange[1] ||
      !/^\d{4}-\d{2}-\d{2}$/.test(preferredDateRange[0]) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(preferredDateRange[1]) ||
      preferredDateRange[1] < preferredDateRange[0]
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Choose a valid preferred date range."
      );
    }
    if (!availableTime.from || !availableTime.to) {
      throw new HttpsError(
        "invalid-argument",
        "Choose a preferred start and end time."
      );
    }
    if (availableDays.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Choose at least one day that usually works."
      );
    }

    const clientRef = db.collection("users").doc(uid);
    const flashRef = db.collection("flashes").doc(flashId);
    const requestRef = db.collection("bookingRequests").doc();

    await db.runTransaction(async (transaction) => {
      const [clientSnap, flashSnap] = await Promise.all([
        transaction.get(clientRef),
        transaction.get(flashRef),
      ]);
      if (!clientSnap.exists || clientSnap.data()?.role !== "client") {
        throw new HttpsError(
          "permission-denied",
          "Only client accounts can request flash."
        );
      }
      if (!flashSnap.exists) {
        throw new HttpsError("not-found", "This flash is no longer available.");
      }

      const client = clientSnap.data() || {};
      const flash = flashSnap.data() || {};
      const artistId = getOptionalString(flash.artistId);
      if (!artistId) {
        throw new HttpsError(
          "failed-precondition",
          "This flash is not connected to an artist."
        );
      }

      const artistRef = db.collection("users").doc(artistId);
      const artistSnap = await transaction.get(artistRef);
      const artist = artistSnap.exists ? artistSnap.data() || {} : null;
      const projection = buildFlashMarketplaceProjectionFromArtist(
        flash,
        artist
      );
      if (!projection.marketplaceReady) {
        throw new HttpsError(
          "failed-precondition",
          getFlashRepeatability(flash) === "one_of_one"
            ? "This one-of-one flash is no longer available."
            : "This flash is no longer available."
        );
      }

      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const clientFirstName = getFirstString(client.firstName);
      const clientLastName = getFirstString(client.lastName);
      const clientName =
        getFirstString(
          client.displayName,
          client.name,
          `${clientFirstName} ${clientLastName}`
        ) || "Client";
      const artistName =
        getFirstString(artist?.displayName, artist?.name) || "Artist";
      const flashTitle = getFirstString(flash.title, flash.caption) || "Flash";
      const fullUrl = getFirstString(
        flash.fullUrl,
        flash.webp90Url,
        flash.thumbUrl
      );
      const thumbUrl = getFirstString(
        flash.thumbUrl,
        flash.webp90Url,
        flash.fullUrl
      );

      transaction.create(requestRef, {
        sourceType: "flash",
        flashId,
        artistId,
        artistName,
        artistAvatar: getFirstString(artist?.avatarUrl) || "/default-avatar.png",
        clientId: uid,
        clientFirstName,
        clientLastName,
        clientName,
        clientAvatar:
          getFirstString(client.avatarUrl, client.photoURL) ||
          "/default-avatar.png",
        bodyPlacement,
        size,
        preferredDateRange,
        availableTime,
        availableDays,
        status: "pending",
        fullUrl,
        thumbUrl,
        flashTitle,
        flashDescription: getOptionalString(flash.description),
        flashPrice: Number(flash.price),
        flashSheetId: getOptionalString(flash.sheetId),
        flashRepeatability: getFlashRepeatability(flash),
        flashAvailabilityStatus: getFlashAvailabilityStatus(flash),
        isFromSheet: flash.isFromSheet === true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });

    return { requestId: requestRef.id };
  }
);

const acceptFlashOffer = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to accept this offer.");
    }

    const offerId = getOptionalString(req.data?.offerId);
    const selectedDateInput = req.data?.selectedDate as
      | { date?: unknown; time?: unknown }
      | undefined;
    const selectedDate = {
      date: getOptionalString(selectedDateInput?.date),
      time: getOptionalString(selectedDateInput?.time),
    };
    if (!offerId || !selectedDate.date || !selectedDate.time) {
      throw new HttpsError(
        "invalid-argument",
        "Choose an appointment option before accepting."
      );
    }

    const offerRef = db.collection("offers").doc(offerId);
    const newBookingRef = db.collection("bookings").doc();
    let acceptedBookingId = newBookingRef.id;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
      const offerSnap = await transaction.get(offerRef);
      if (!offerSnap.exists) {
        throw new HttpsError("not-found", "Offer not found.");
      }

      const offer = offerSnap.data() || {};
      if (offer.clientId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the client who received this offer can accept it."
        );
      }
      if (
        offer.status === "accepted" &&
        typeof offer.bookingId === "string" &&
        offer.bookingId
      ) {
        acceptedBookingId = offer.bookingId;
        return;
      }
      if (offer.status !== "pending") {
        throw new HttpsError(
          "failed-precondition",
          "This offer is no longer available."
        );
      }
      if (offer.sourceType !== "flash" || !getOptionalString(offer.flashId)) {
        throw new HttpsError(
          "failed-precondition",
          "Only flash offers can be accepted at launch."
        );
      }

      const offeredDates = Array.isArray(offer.dateOptions)
        ? offer.dateOptions
        : [];
      const matchesOfferedDate = offeredDates.some(
        (option: admin.firestore.DocumentData) =>
          option?.date === selectedDate.date &&
          option?.time === selectedDate.time
      );
      if (!matchesOfferedDate) {
        throw new HttpsError(
          "invalid-argument",
          "Choose one of the appointment options from the offer."
        );
      }

      const artistId = getOptionalString(offer.artistId);
      const requestId = getOptionalString(offer.requestId);
      const flashId = getOptionalString(offer.flashId);
      if (!artistId || !requestId || !flashId) {
        throw new HttpsError(
          "failed-precondition",
          "This offer is missing its flash relationship."
        );
      }

      const artistRef = db.collection("users").doc(artistId);
      const requestRef = db.collection("bookingRequests").doc(requestId);
      const flashRef = db.collection("flashes").doc(flashId);
      const [artistSnap, requestSnap, flashSnap] = await Promise.all([
        transaction.get(artistRef),
        transaction.get(requestRef),
        transaction.get(flashRef),
      ]);
      if (!artistSnap.exists || !requestSnap.exists || !flashSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "The flash offer can no longer be verified."
        );
      }

      const artist = artistSnap.data() || {};
      const request = requestSnap.data() || {};
      const flash = flashSnap.data() || {};
      if (
        request.sourceType !== "flash" ||
        request.flashId !== flashId ||
        request.artistId !== artistId ||
        request.clientId !== uid ||
        flash.artistId !== artistId ||
        getFlashPublicationStatus(flash) !== "published"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The flash offer does not match its request."
        );
      }

      const repeatability = getFlashRepeatability(flash);
      const availabilityStatus = getFlashAvailabilityStatus(flash);
      if (
        repeatability === "one_of_one" &&
        availabilityStatus !== "available"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "This one-of-one flash is no longer available."
        );
      }
      if (flash.isAvailable === false && repeatability !== "one_of_one") {
        throw new HttpsError(
          "failed-precondition",
          "This flash is no longer available."
        );
      }

      const totalQuoteCents = dollarsToCents(flash.price);
      const offeredPriceCents = dollarsToCents(offer.price);
      const depositAmountCents = dollarsToCents(offer.depositPolicy?.amount);
      if (
        totalQuoteCents <= 0 ||
        offeredPriceCents !== totalQuoteCents ||
        depositAmountCents <= 0 ||
        depositAmountCents > Math.round(totalQuoteCents * 0.5)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The flash price or deposit is no longer valid."
        );
      }

      const shopId = getOptionalString(offer.shopId || artist.shopId);
      const shopRef = shopId ? db.collection("shops").doc(shopId) : null;
      const shopSnap = shopRef ? await transaction.get(shopRef) : null;
      const shop = shopSnap?.exists ? shopSnap.data() || {} : {};
      const shopBalanceCents = Math.max(
        totalQuoteCents - depositAmountCents,
        0
      );

      const bookingData = {
        sourceType: "flash",
        flashId,
        requestId,
        offerId,
        artistId,
        artistName: offer.displayName || artist.displayName || "Artist",
        artistAvatar: offer.artistAvatar ?? artist.avatarUrl ?? null,
        clientId: uid,
        clientFirstName: offer.clientFirstName ?? "",
        clientLastName: offer.clientLastName ?? "",
        clientName: offer.clientName ?? null,
        clientAvatar: offer.clientAvatar ?? null,
        flashTitle: flash.title || flash.caption || "Untitled flash",
        flashDescription: flash.description ?? null,
        flashImageUrl:
          flash.fullUrl || flash.webp90Url || flash.thumbUrl || null,
        fullUrl: flash.fullUrl || flash.webp90Url || flash.thumbUrl || null,
        thumbUrl: flash.thumbUrl || flash.webp90Url || flash.fullUrl || null,
        flashPrice: centsToDollars(totalQuoteCents),
        flashSheetId: flash.sheetId ?? null,
        flashRepeatability: repeatability,
        flashAvailabilityStatus:
          repeatability === "one_of_one" ? "held" : availabilityStatus,
        isFromSheet: flash.isFromSheet === true,
        bodyPlacement: request.bodyPlacement ?? null,
        size: request.size ?? null,
        price: centsToDollars(totalQuoteCents),
        priceCents: totalQuoteCents,
        quoteTotalCents: totalQuoteCents,
        totalAmountCents: totalQuoteCents,
        depositAmount: centsToDollars(depositAmountCents),
        depositAmountCents,
        depositStatus: "pending",
        shopBalanceAmount: centsToDollars(shopBalanceCents),
        shopBalanceAmountCents: shopBalanceCents,
        shopBalanceStatus: shopBalanceCents > 0 ? "unpaid" : "paid",
        remainingBalanceAmount: centsToDollars(totalQuoteCents),
        remainingBalanceCents: totalQuoteCents,
        remainingPaymentMethod: "external",
        remainingPaymentStatus: "not_due",
        externalRemainingAmount: centsToDollars(shopBalanceCents),
        externalRemainingAmountCents: shopBalanceCents,
        artistPaidCents: 0,
        totalArtistPaidCents: 0,
        totalArtistPaidAmount: 0,
        paymentType: "internal",
        paymentModelVersion: PAYMENT_MODEL_VERSION,
        appointmentStatus: "scheduled",
        sessionStatus: "not_started",
        selectedDate,
        appointmentStartsAt: null,
        shopId,
        shopName: offer.shopName || shop.name || "Shop pending review",
        shopAddress: offer.shopAddress || shop.address || null,
        shopMapLink: offer.shopMapLink || shop.mapLink || null,
        status: "pending_payment",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      transaction.create(newBookingRef, bookingData);
      const { summaryRef, sessionRef } = getBookingSessionRefs(
        newBookingRef.id,
        1
      );
      transaction.create(sessionRef, {
        bookingId: newBookingRef.id,
        artistId,
        clientId: uid,
        sessionNumber: 1,
        quotedAmountCents: totalQuoteCents,
        quotedAmount: centsToDollars(totalQuoteCents),
        depositAmountCents,
        depositAmount: centsToDollars(depositAmountCents),
        balanceAmountCents: shopBalanceCents,
        balanceAmount: centsToDollars(shopBalanceCents),
        allowedBalanceMethods: ["external"],
        selectedBalanceMethod: shopBalanceCents > 0 ? "external" : null,
        depositStatus: "due",
        balanceStatus: "not_due",
        paymentStatus: "deposit_due",
        status: "scheduled",
        selectedDate,
        checkoutAttemptNumber: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.create(summaryRef, {
        bookingId: newBookingRef.id,
        artistId,
        clientId: uid,
        offerId,
        activeSessionNumber: 1,
        estimatedSessionCount: 1,
        completedSessionCount: 0,
        remainingAmountCents: totalQuoteCents,
        remainingAmount: centsToDollars(totalQuoteCents),
        paymentModelVersion: PAYMENT_MODEL_VERSION,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      if (repeatability === "one_of_one") {
        const holdUntil = admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + FLASH_CHECKOUT_HOLD_SECONDS * 1000)
        );
        transaction.update(flashRef, {
          repeatability: "one_of_one",
          availabilityStatus: "held",
          isAvailable: false,
          heldByBookingId: newBookingRef.id,
          heldByClientId: uid,
          heldByCheckoutSessionId: admin.firestore.FieldValue.delete(),
          heldUntil: holdUntil,
          updatedAt: timestamp,
        });
      }

      transaction.update(offerRef, {
        status: "accepted",
        respondedAt: timestamp,
        bookingId: newBookingRef.id,
        updatedAt: timestamp,
      });
      transaction.update(requestRef, {
        status: "offered",
        offeredAt: request.offeredAt || timestamp,
        updatedAt: timestamp,
      });
    });

    return { bookingId: acceptedBookingId };
  }
);

// Temporary compatibility alias for clients deployed before the flash-only release.
const acceptProjectOffer = acceptFlashOffer;

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
  const metadataConnectedAccountId = getOptionalString(
    metadata.stripeConnectedAccountId
  );
  const currentPaidCents = Number(booking.totalArtistPaidCents || 0);
  const sessionAlreadyApplied = booking.lastCompletedCheckoutSessionId === session.id;
  const isPlatformFeeOnlyPayment = paymentMode === "platform_fee";
  const nextPaidCents =
    sessionAlreadyApplied || isPlatformFeeOnlyPayment
      ? currentPaidCents
      : paymentMode === "full"
      ? priceCents
      : Math.min(priceCents, currentPaidCents + artistAmountCents);
  const remainingBalanceCents = isPlatformFeeOnlyPayment
    ? getRemainingBalanceCents(booking)
    : Math.max(priceCents - nextPaidCents, 0);
  const nextStatus = isPlatformFeeOnlyPayment
    ? booking.status || "deposit_paid"
    : remainingBalanceCents > 0
    ? "deposit_paid"
    : "paid";
  const currentPlatformFeeCollectedCents =
    getPlatformFeeCollectedCents(booking, false);
  const nextPlatformFeeCollectedCents = sessionAlreadyApplied
    ? currentPlatformFeeCollectedCents
    : currentPlatformFeeCollectedCents + platformFeeCents;
  const nextPendingPlatformFeeCents = sessionAlreadyApplied
    ? getPendingPlatformFeeCents(booking)
    : Math.max(getPendingPlatformFeeCents(booking) - platformFeeCents, 0);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const isMultiSession =
    booking.projectType === "multi_session" ||
    Number(booking.estimatedSessionCount || 1) > 1;
  const activeSessionNumber = Math.max(Number(booking.activeSessionNumber || 1), 1);
  const estimatedSessionCount = Math.max(
    Number(booking.estimatedSessionCount || 1),
    1
  );
  const sessionInstallmentTiming = getSessionInstallmentTiming(booking);
  const completedSessionCount = getCompletedSessionCount(booking);
  const paidSessionNumber = Math.max(
    Number(booking.pendingSessionNumber || activeSessionNumber),
    1
  );
  const projectCompleteAfterPayment =
    sessionInstallmentTiming === "before_session"
      ? completedSessionCount >= estimatedSessionCount
      : paidSessionNumber >= estimatedSessionCount && remainingBalanceCents <= 0;
  const hasMoreSessions =
    isMultiSession && paymentMode === "remaining" && !projectCompleteAfterPayment;
  const nextActiveSessionNumber =
    sessionInstallmentTiming === "before_session"
      ? paidSessionNumber
      : hasMoreSessions
      ? Math.min(paidSessionNumber + 1, estimatedSessionCount)
      : paidSessionNumber;

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
      connectedAccountId ??
      metadataConnectedAccountId ??
      booking.stripeConnectedAccountId ??
      null,
    clientPaymentAmountCents: clientTotalCents,
    platformFeeCents,
    platformFeeCollectedCents: nextPlatformFeeCollectedCents,
    platformFeeCollectedAmount: centsToDollars(nextPlatformFeeCollectedCents),
    pendingPlatformFeeCents: nextPendingPlatformFeeCents,
    pendingPlatformFeeAmount: centsToDollars(nextPendingPlatformFeeCents),
    ...(isPlatformFeeOnlyPayment
      ? {
          platformFeeOnlyPaidAt: timestamp,
        }
      : {
          artistQuotedAmountCents: artistAmountCents,
          artistPayoutCents: artistAmountCents,
        }),
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
          activeSessionNumber: nextActiveSessionNumber,
          pendingSessionPaymentAmount: 0,
          pendingSessionPaymentAmountCents: 0,
          pendingSessionNumber: null,
          pendingSessionPaymentNote: null,
          pendingSessionPaymentRequestedAt: null,
          pendingSessionPaymentRequestedBy: null,
          lastPaidSessionNumber: paidSessionNumber,
          remainingPaymentStatus:
            remainingBalanceCents > 0 ? "not_due" : "confirmed",
        }
      : {}),
    updatedAt: timestamp,
  };
};

const expirePendingFlashWorkflows = async (
  flashId?: string | null,
  paidOfferId?: string | null
) => {
  if (!flashId) return;

  const firestore = admin.firestore();
  const [offersSnap, requestsSnap] = await Promise.all([
    firestore
      .collection("offers")
      .where("flashId", "==", flashId)
      .where("status", "==", "pending")
      .get(),
    firestore
      .collection("bookingRequests")
      .where("flashId", "==", flashId)
      .where("status", "==", "pending")
      .get(),
  ]);

  const batch = firestore.batch();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  offersSnap.docs.forEach((docSnap) => {
    if (docSnap.id === paidOfferId) return;
    batch.update(docSnap.ref, {
      status: "expired",
      expiredAt: timestamp,
      unavailableReason: "one_of_one_flash_purchased",
    });
  });

  requestsSnap.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, {
      status: "expired",
      expiredAt: timestamp,
      unavailableReason: "one_of_one_flash_purchased",
    });
  });

  if (!offersSnap.empty || !requestsSnap.empty) {
    await batch.commit();
  }
};

const finalizeBookingPaymentAndFlash = async (
  bookingRef: admin.firestore.DocumentReference,
  session: Stripe.Checkout.Session,
  connectedAccountId?: string | null
) => {
  let resultStatus = "paid";
  let flashToExpire: string | null = null;
  let paidOfferId: string | null = null;

  await db.runTransaction(async (transaction) => {
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) {
      throw new HttpsError("not-found", "Booking not found.");
    }

    const booking = bookingSnap.data() || {};
    const flashId = typeof booking.flashId === "string" ? booking.flashId : "";
    let flashSnap: admin.firestore.DocumentSnapshot | null = null;
    let flash: admin.firestore.DocumentData = {};
    let repeatability = booking.flashRepeatability as FlashRepeatability | undefined;

    if (booking.sourceType === "flash" && flashId) {
      const flashRef = db.collection("flashes").doc(flashId);
      flashSnap = await transaction.get(flashRef);
      flash = flashSnap.exists ? flashSnap.data() || {} : {};
      repeatability = getFlashRepeatability(flash);
    }

    paidOfferId = typeof booking.offerId === "string" ? booking.offerId : null;
    if (booking.sourceType === "flash") {
      const metadata = session.metadata || {};
      const paymentPurpose = metadata.paymentPurpose as CheckoutPaymentPurpose;
      if (paymentPurpose !== "session_deposit") {
        throw new HttpsError(
          "failed-precondition",
          "Only a flash booking deposit can complete this checkout."
        );
      }

      const { summaryRef, sessionRef } = getBookingSessionRefs(
        bookingRef.id,
        1
      );
      const paymentRef = bookingRef.collection("payments").doc(session.id);
      const [sessionSnap, paymentSnap] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(paymentRef),
      ]);
      if (paymentSnap.exists) {
        resultStatus = String(booking.status || "deposit_paid");
      } else {
        if (!sessionSnap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "The flash appointment payment record is missing."
          );
        }

        const sessionLedger = sessionSnap.data() || {};
        const artistAmountCents = parseMetadataCents(
          metadata,
          "artistAmountCents"
        );
        const expectedDepositCents = getNonNegativeCents(
          sessionLedger.depositAmountCents,
          dollarsToCents(booking.depositAmount)
        );
        if (
          expectedDepositCents < MIN_ARTIST_PAYOUT_CENTS ||
          artistAmountCents !== expectedDepositCents
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Stripe payment does not match the flash booking deposit."
          );
        }

        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        const priceCents = getBookingPriceCents(booking);
        const shopBalanceCents = Math.max(
          priceCents - artistAmountCents,
          0
        );
        const platformFeeCents = parseMetadataCents(
          metadata,
          "platformFeeCents"
        );
        const clientTotalCents = parseMetadataCents(
          metadata,
          "clientTotalCents",
          session.amount_total || 0
        );
        const stripeFeeCents = parseMetadataCents(
          metadata,
          "estimatedStripeFeeCents"
        );
        resultStatus = "deposit_paid";

        transaction.update(bookingRef, {
          status: "deposit_paid",
          depositStatus: "paid",
          depositPaidAt: timestamp,
          depositPaidAmountCents: artistAmountCents,
          depositPaidAmount: centsToDollars(artistAmountCents),
          paymentMode: "deposit",
          checkoutPaymentMode: "deposit",
          checkoutPaymentPurpose: "session_deposit",
          stripeCheckoutSessionId: session.id,
          lastCompletedCheckoutSessionId: session.id,
          stripePaymentIntentId: session.payment_intent,
          stripeConnectedAccountId:
            connectedAccountId ??
            getOptionalString(metadata.stripeConnectedAccountId) ??
            booking.stripeConnectedAccountId ??
            null,
          clientPaymentAmountCents: clientTotalCents,
          clientPaymentAmount: centsToDollars(clientTotalCents),
          estimatedStripeFeeCents: stripeFeeCents,
          estimatedStripeFeeAmount: centsToDollars(stripeFeeCents),
          platformFeeCents,
          platformFeeAmount: centsToDollars(platformFeeCents),
          platformFeeCollectedCents: platformFeeCents,
          platformFeeCollectedAmount: centsToDollars(platformFeeCents),
          artistPaidCents: artistAmountCents,
          totalArtistPaidCents: artistAmountCents,
          totalArtistPaidAmount: centsToDollars(artistAmountCents),
          remainingBalanceCents: shopBalanceCents,
          remainingBalanceAmount: centsToDollars(shopBalanceCents),
          shopBalanceAmountCents: shopBalanceCents,
          shopBalanceAmount: centsToDollars(shopBalanceCents),
          shopBalanceStatus: shopBalanceCents > 0 ? "unpaid" : "paid",
          remainingPaymentMethod: "external",
          remainingPaymentStatus:
            shopBalanceCents > 0 ? "not_due" : "confirmed",
          pendingSessionPaymentAmount: 0,
          pendingSessionPaymentAmountCents: 0,
          pendingSessionNumber: null,
          updatedAt: timestamp,
        });
        transaction.set(
          sessionRef,
          {
            depositStatus: "paid",
            depositPaidAt: timestamp,
            depositCheckoutSessionId: session.id,
            paymentStatus: "deposit_paid",
            checkoutStatus: "complete",
            updatedAt: timestamp,
          },
          { merge: true }
        );
        transaction.set(
          summaryRef,
          {
            activeSessionNumber: 1,
            completedSessionCount: 0,
            remainingAmountCents: shopBalanceCents,
            remainingAmount: centsToDollars(shopBalanceCents),
            paymentStatus: "deposit_paid",
            updatedAt: timestamp,
          },
          { merge: true }
        );
        transaction.create(paymentRef, {
          bookingId: bookingRef.id,
          sessionNumber: 1,
          purpose: "session_deposit",
          method: "stripe",
          artistAmountCents,
          platformFeeCents,
          stripeFeeCents,
          clientTotalCents,
          checkoutSessionId: session.id,
          paymentIntentId: session.payment_intent,
          status: "confirmed",
          createdAt: timestamp,
        });
      }
    } else if (isProtectedSessionPaymentBooking(booking)) {
      const metadata = session.metadata || {};
      const paymentPurpose = metadata.paymentPurpose as CheckoutPaymentPurpose;
      const paidSessionNumber = getPositiveInteger(
        metadata.sessionNumber,
        getActiveSessionNumber(booking)
      );
      const { summaryRef, sessionRef } = getBookingSessionRefs(
        bookingRef.id,
        paidSessionNumber
      );
      const paymentRef = bookingRef.collection("payments").doc(session.id);
      const [sessionSnap, paymentSnap] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(paymentRef),
      ]);

      if (paymentSnap.exists) {
        resultStatus = String(booking.status || "deposit_paid");
      } else {
        if (!sessionSnap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "The session ledger is missing."
          );
        }
        const sessionLedger = sessionSnap.data() || {};
        const expectedAmountCents =
          paymentPurpose === "session_deposit"
            ? getNonNegativeCents(sessionLedger.depositAmountCents, 0)
            : paymentPurpose === "session_balance"
            ? getNonNegativeCents(sessionLedger.balanceAmountCents, 0)
            : 0;
        const artistAmountCents = parseMetadataCents(
          metadata,
          "artistAmountCents"
        );
        if (
          expectedAmountCents < MIN_ARTIST_PAYOUT_CENTS ||
          artistAmountCents !== expectedAmountCents
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Stripe payment does not match the session ledger."
          );
        }

        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        const priceCents = getBookingPriceCents(booking);
        const nextPaidCents = Math.min(
          getTotalArtistPaidCents(booking) + artistAmountCents,
          priceCents
        );
        const remainingBalanceCents = Math.max(
          priceCents - nextPaidCents,
          0
        );
        const platformFeeCents = parseMetadataCents(
          metadata,
          "platformFeeCents"
        );
        const platformFeeCollectedCents =
          getPlatformFeeCollectedCents(booking, false) + platformFeeCents;
        const clientTotalCents = parseMetadataCents(
          metadata,
          "clientTotalCents",
          session.amount_total || 0
        );
        const stripeFeeCents = parseMetadataCents(
          metadata,
          "estimatedStripeFeeCents"
        );
        const isBalancePayment = paymentPurpose === "session_balance";
        const isFinalSession =
          paidSessionNumber >= getEstimatedSessionCount(booking);
        const projectComplete =
          isBalancePayment && isFinalSession && remainingBalanceCents === 0;
        const nextActiveSessionNumber =
          isBalancePayment && !isFinalSession
            ? paidSessionNumber + 1
            : paidSessionNumber;
        const nextStatus = projectComplete ? "paid" : "deposit_paid";
        resultStatus = nextStatus;

        const bookingUpdate = {
          status: nextStatus,
          paymentMode:
            paymentPurpose === "session_deposit" ? "deposit" : "remaining",
          checkoutPaymentMode:
            paymentPurpose === "session_deposit" ? "deposit" : "remaining",
          checkoutPaymentPurpose: paymentPurpose,
          stripeCheckoutSessionId: session.id,
          lastCompletedCheckoutSessionId: session.id,
          stripePaymentIntentId: session.payment_intent,
          stripeConnectedAccountId:
            connectedAccountId ??
            getOptionalString(metadata.stripeConnectedAccountId) ??
            booking.stripeConnectedAccountId ??
            null,
          clientPaymentAmountCents: clientTotalCents,
          clientPaymentAmount: centsToDollars(clientTotalCents),
          estimatedStripeFeeCents: stripeFeeCents,
          estimatedStripeFeeAmount: centsToDollars(stripeFeeCents),
          platformFeeCents,
          platformFeeAmount: centsToDollars(platformFeeCents),
          platformFeeCollectedCents,
          platformFeeCollectedAmount: centsToDollars(
            platformFeeCollectedCents
          ),
          pendingPlatformFeeCents: Math.max(
            getPendingPlatformFeeCents(booking) - platformFeeCents,
            0
          ),
          artistPaidCents: nextPaidCents,
          totalArtistPaidCents: nextPaidCents,
          totalArtistPaidAmount: centsToDollars(nextPaidCents),
          outstandingProjectCents: remainingBalanceCents,
          remainingBalanceCents,
          remainingBalanceAmount: centsToDollars(remainingBalanceCents),
          pendingSessionPaymentAmount: 0,
          pendingSessionPaymentAmountCents: 0,
          pendingSessionNumber: null,
          remainingPaymentStatus: isBalancePayment
            ? projectComplete
              ? "confirmed"
              : "not_due"
            : "not_due",
          remainingPaymentMethod: "stripe",
          activeSessionNumber: nextActiveSessionNumber,
          sessionStatus: isBalancePayment
            ? projectComplete
              ? "completed"
              : "awaiting_next_session"
            : booking.sessionStatus || "not_started",
          projectStatus: projectComplete ? "completed" : "active",
          ...(paymentPurpose === "session_deposit"
            ? {
                depositPaidAt: timestamp,
                depositPaidAmountCents:
                  getNonNegativeCents(booking.depositPaidAmountCents, 0) +
                  artistAmountCents,
                depositPaidAmount:
                  centsToDollars(
                    getNonNegativeCents(
                      booking.depositPaidAmountCents,
                      0
                    ) + artistAmountCents
                  ),
              }
            : {
                remainingPaidAt: timestamp,
                remainingPaidAmountCents:
                  getNonNegativeCents(booking.remainingPaidAmountCents, 0) +
                  artistAmountCents,
                remainingPaidAmount:
                  centsToDollars(
                    getNonNegativeCents(
                      booking.remainingPaidAmountCents,
                      0
                    ) + artistAmountCents
                  ),
                lastPaidSessionNumber: paidSessionNumber,
              }),
          ...(projectComplete ? { paidAt: timestamp } : {}),
          updatedAt: timestamp,
        };

        transaction.update(bookingRef, bookingUpdate);
        transaction.set(
          sessionRef,
          {
            ...(paymentPurpose === "session_deposit"
              ? {
                  depositStatus: "paid",
                  depositPaidAt: timestamp,
                  depositCheckoutSessionId: session.id,
                  paymentStatus: "deposit_paid",
                }
              : {
                  balanceStatus: "confirmed",
                  balancePaidAt: timestamp,
                  balanceCheckoutSessionId: session.id,
                  paidBalanceAmountCents: artistAmountCents,
                  paidBalanceAmount: centsToDollars(artistAmountCents),
                  paymentStatus: "confirmed",
                }),
            checkoutStatus: "complete",
            updatedAt: timestamp,
          },
          { merge: true }
        );
        transaction.set(
          summaryRef,
          {
            activeSessionNumber: nextActiveSessionNumber,
            completedSessionCount: getCompletedSessionCount(booking),
            remainingAmountCents: remainingBalanceCents,
            remainingAmount: centsToDollars(remainingBalanceCents),
            paymentStatus:
              paymentPurpose === "session_deposit"
                ? "deposit_paid"
                : "confirmed",
            updatedAt: timestamp,
          },
          { merge: true }
        );
        transaction.create(paymentRef, {
          bookingId: bookingRef.id,
          sessionNumber: paidSessionNumber,
          purpose: paymentPurpose,
          method: "stripe",
          artistAmountCents,
          platformFeeCents,
          stripeFeeCents,
          clientTotalCents,
          checkoutSessionId: session.id,
          paymentIntentId: session.payment_intent,
          status: "confirmed",
          createdAt: timestamp,
        });
      }
    } else {
      const update = getCompletedBookingUpdate(
        booking,
        session,
        connectedAccountId
      );
      resultStatus = update.status;

      transaction.update(bookingRef, {
        ...update,
        ...(booking.sourceType === "flash" && repeatability
          ? {
              flashRepeatability: repeatability,
              flashAvailabilityStatus:
                repeatability === "one_of_one" ? "sold" : "available",
            }
          : {}),
      });

      const paymentMode = (session.metadata?.paymentMode ||
        "") as CheckoutPaymentMode;
      if (paymentMode === "remaining" && isMultiSessionBooking(booking)) {
        const paidSessionNumber = Math.max(
          Number(
            booking.pendingSessionNumber || booking.activeSessionNumber || 1
          ),
          1
        );
        const paidAmountCents = parseMetadataCents(
          session.metadata || {},
          "artistAmountCents"
        );
        const { summaryRef, sessionRef } = getBookingSessionRefs(
          bookingRef.id,
          paidSessionNumber
        );
        const paymentUpdate = {
          paymentStatus: "confirmed",
          paidAmount: centsToDollars(paidAmountCents),
          paidAmountCents,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          checkoutSessionId: session.id,
          remainingAmount: update.remainingBalanceAmount,
          remainingAmountCents: update.remainingBalanceCents,
        };

        transaction.set(
          summaryRef,
          createSessionSummaryUpdate(
            bookingRef.id,
            { ...booking, ...update },
            paidSessionNumber,
            paymentUpdate
          ),
          { merge: true }
        );
        transaction.set(
          sessionRef,
          createSessionRecordUpdate(
            bookingRef.id,
            booking,
            paidSessionNumber,
            paymentUpdate
          ),
          { merge: true }
        );
      }
    }

    if (
      booking.sourceType === "flash" &&
      flashId &&
      flashSnap?.exists &&
      repeatability === "one_of_one"
    ) {
      const flashRef = db.collection("flashes").doc(flashId);
      transaction.update(flashRef, {
        repeatability: "one_of_one",
        availabilityStatus: "sold",
        isAvailable: false,
        soldAt: admin.firestore.FieldValue.serverTimestamp(),
        soldBookingId: bookingRef.id,
        soldCheckoutSessionId: session.id,
        heldByBookingId: admin.firestore.FieldValue.delete(),
        heldByClientId: admin.firestore.FieldValue.delete(),
        heldByCheckoutSessionId: admin.firestore.FieldValue.delete(),
        heldUntil: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      flashToExpire = flashId;
    }
  });

  await expirePendingFlashWorkflows(flashToExpire, paidOfferId);

  return { status: resultStatus, flashId: flashToExpire };
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

    const firestore = admin.firestore();
    const bookingRef = firestore.collection("bookingRequests").doc(requestId);
    const referenceImage = {
      fileName,
      fullUrl: fullDownloadUrl,
      thumbUrl: thumbDownloadUrl,
      fullPath: fullResPath,
      thumbPath,
    };

    await firestore.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(bookingRef);
      const docData = docSnap.data() ?? {};
      const existingReferences = Array.isArray(docData.referenceImages)
        ? docData.referenceImages.filter(
            (reference: admin.firestore.DocumentData) =>
              typeof reference?.fileName === "string" &&
              (typeof reference?.fullUrl === "string" ||
                typeof reference?.thumbUrl === "string")
          )
        : [];
      const mergedReferences = [
        ...existingReferences.filter(
          (reference: admin.firestore.DocumentData) =>
            reference.fileName !== fileName
        ),
        referenceImage,
      ].sort(
        (
          a: admin.firestore.DocumentData,
          b: admin.firestore.DocumentData
        ) => getReferenceImageOrder(a) - getReferenceImageOrder(b)
      );
      const shouldPromoteAsPrimary =
        !docData.fullUrl || getReferenceImageOrder(referenceImage) === 1;
      const retentionDays = getBookingReferenceRetentionDays(docData.status);

      transaction.set(
        bookingRef,
        {
          ...(shouldPromoteAsPrimary
            ? {
                fullUrl: fullDownloadUrl,
                thumbUrl: thumbDownloadUrl,
                fullPath: fullResPath,
                thumbPath,
              }
            : {}),
          referenceImages: mergedReferences,
          referenceCleanupAt: getBookingReferenceCleanupTimestamp({
            ...docData,
            referenceImages: mergedReferences,
          }),
          referenceRetentionDays: retentionDays,
          referenceRetentionPolicyVersion:
            BOOKING_REFERENCE_RETENTION_POLICY_VERSION,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    console.log(`✅ Processed booking request image for requestId: ${requestId}`);
  } catch (err) {
    console.error(`❌ Error processing booking request file: ${filePath}`, err);
  } finally {
    await Promise.allSettled([bucket.file(filePath).delete(), fs.unlink(tmpLocal)]);
  }
});


const syncBookingRequestReferenceRetention = onDocumentWritten(
  "bookingRequests/{requestId}",
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;

    const data = afterSnap.data() || {};
    if (data.referencesDeletedAt) return;
    if (collectBookingReferenceStoragePaths(data).length === 0) return;

    const cleanupAt = getBookingReferenceCleanupTimestamp(data);
    const currentCleanupAt = getDateFromFirestoreValue(data.referenceCleanupAt);
    const retentionDays = getBookingReferenceRetentionDays(data.status);
    const cleanupIsCurrent =
      currentCleanupAt &&
      Math.abs(currentCleanupAt.getTime() - cleanupAt.toDate().getTime()) <
        DAY_MS;

    if (
      cleanupIsCurrent &&
      data.referenceRetentionDays === retentionDays &&
      data.referenceRetentionPolicyVersion ===
        BOOKING_REFERENCE_RETENTION_POLICY_VERSION
    ) {
      return;
    }

    await afterSnap.ref.set(
      {
        referenceCleanupAt: cleanupAt,
        referenceRetentionDays: retentionDays,
        referenceRetentionPolicyVersion:
          BOOKING_REFERENCE_RETENTION_POLICY_VERSION,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
);



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
        "Only artists can connect payouts."
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
        "Only artists can connect payouts."
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
  let reservedOneOfOneFlash = false;
  let reservedFlashId: string | null = null;
  let reservedBookingId: string | null = null;
  let createdCheckoutSessionId: string | null = null;
  let reservedConnectedAccountId: string | null = null;

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

    if (booking.sourceType !== "flash" || !getOptionalString(booking.flashId)) {
      throw new HttpsError(
        "failed-precondition",
        "Checkout is available only for flash booking deposits."
      );
    }

    if (data.paymentMode && data.paymentMode !== "deposit") {
      throw new HttpsError(
        "failed-precondition",
        "Only the flash booking deposit can be paid through SATX Ink."
      );
    }

    if (booking.status !== "pending_payment") {
      throw new HttpsError(
        "failed-precondition",
        "This flash booking deposit is no longer due."
      );
    }

    const paymentMode: CheckoutPaymentMode = "deposit";
    const paymentPurpose: CheckoutPaymentPurpose = "session_deposit";
    const payableSessionNumber = 1;
    const checkoutAttemptNumber = 1;

    const priceCents = dollarsToCents(booking.price);
    const depositCents = dollarsToCents(booking.depositAmount || booking.price);
    const artistAmountCents = Math.min(depositCents, priceCents);

    if (
      (!Number.isFinite(artistAmountCents) ||
        artistAmountCents < MIN_ARTIST_PAYOUT_CENTS)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The artist payout amount is too small to process."
      );
    }

    const platformFeeCents = calculatePlatformFeeCents(
      priceCents || artistAmountCents
    );

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
    reservedConnectedAccountId = connectedAccountId ?? null;

    if (!connectedAccountId) {
      throw new HttpsError(
        "failed-precondition",
        "This artist has not connected Stripe payouts yet."
      );
    }

    const connectStatus =
      connectedAccountId
        ? await syncArtistStripeAccount(
            booking.artistId,
            stripe,
            connectedAccountId
          )
        : null;

    if (connectStatus && !connectStatus.chargesEnabled) {
      throw new HttpsError(
        "failed-precondition",
        "This artist needs to finish Stripe onboarding before accepting payments."
      );
    }

    const flashHoldUntil = new Date(
      Date.now() + FLASH_CHECKOUT_HOLD_SECONDS * 1000
    );
    reservedFlashId =
      typeof booking.flashId === "string" ? booking.flashId : null;
    reservedBookingId = bookingId;
    reservedOneOfOneFlash = await reserveOneOfOneFlashForCheckout({
      bookingRef,
      bookingId,
      booking,
      clientId: uid,
      holdUntil: flashHoldUntil,
    });
    const checkoutFlashRepeatability = reservedOneOfOneFlash
      ? "one_of_one"
      : booking.flashRepeatability || "";
    
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
        paymentPurpose,
        sessionNumber: String(payableSessionNumber),
        paymentModelVersion: String(booking.paymentModelVersion || 1),
        checkoutAttemptNumber: String(checkoutAttemptNumber),
        priceCents: String(priceCents),
        depositCents: String(depositCents),
        flashId: reservedFlashId ?? '',
        flashRepeatability: checkoutFlashRepeatability,
      },
    };

    if (platformFeeCents > 0) {
      paymentIntentData.application_fee_amount = platformFeeCents;
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
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
        paymentPurpose,
        sessionNumber: String(payableSessionNumber),
        paymentModelVersion: String(booking.paymentModelVersion || 1),
        checkoutAttemptNumber: String(checkoutAttemptNumber),
        priceCents: String(priceCents),
        depositCents: String(depositCents),
        flashId: reservedFlashId ?? '',
        flashRepeatability: checkoutFlashRepeatability,
        stripeConnectedAccountId: connectedAccountId ?? "",
      },
      expires_at: Math.floor(flashHoldUntil.getTime() / 1000),
      success_url: data.successUrl || `${DEFAULT_APP_URL}/payment-success?bookingId=${bookingId}`,
      cancel_url: data.cancelUrl || `${DEFAULT_APP_URL}/payment/${bookingId}`,
    };

    const idempotencyKey = [
      "booking",
      bookingId,
      "session",
      payableSessionNumber,
      paymentPurpose,
      "attempt",
      checkoutAttemptNumber,
    ].join(":");
    const session = await stripe.checkout.sessions.create(sessionParams, {
      stripeAccount: connectedAccountId,
      idempotencyKey,
    });
    createdCheckoutSessionId = session.id;

    if (reservedOneOfOneFlash) {
      await setOneOfOneFlashCheckoutSession({
        flashId: reservedFlashId,
        bookingId,
        sessionId: session.id,
        holdUntil: flashHoldUntil,
      });
    }

    await bookingRef.set(
      {
        stripeCheckoutSessionId: session.id,
        stripeCheckoutExpiresAt: admin.firestore.Timestamp.fromDate(flashHoldUntil),
        stripeConnectedAccountId:
          connectedAccountId ?? booking.stripeConnectedAccountId ?? null,
        clientPaymentAmount: clientTotalCents / 100,
        clientPaymentAmountCents: clientTotalCents,
        platformFeeAmount: platformFeeCents / 100,
        platformFeeCents,
        estimatedStripeFeeAmount: stripeFeeCents / 100,
        estimatedStripeFeeCents: stripeFeeCents,
        artistQuotedAmount: artistAmountCents / 100,
        artistQuotedAmountCents: artistAmountCents,
        artistPayoutAmount: artistAmountCents / 100,
        artistPayoutCents: artistAmountCents,
        checkoutPaymentMode: paymentMode,
        checkoutPaymentPurpose: paymentPurpose,
        checkoutSessionNumber: payableSessionNumber,
        ...(reservedOneOfOneFlash
          ? {
              flashRepeatability: "one_of_one",
              flashAvailabilityStatus: "held",
            }
          : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { sessionUrl: session.url };
  } catch (error) {
    if (reservedOneOfOneFlash) {
      try {
        if (createdCheckoutSessionId && reservedConnectedAccountId) {
          await stripe.checkout.sessions.expire(
            createdCheckoutSessionId,
            {},
            { stripeAccount: reservedConnectedAccountId }
          );
        }
        await releaseOneOfOneFlashHold({
          flashId: reservedFlashId,
          bookingId: reservedBookingId,
        });
      } catch (releaseError) {
        logger.error("Failed to release one-of-one flash hold", releaseError);
      }
    }
    if (error instanceof HttpsError) throw error;
    logger.error('Stripe checkout error', error);
    throw new HttpsError('internal', 'Unable to create checkout session');
  }
});

const proposeProjectAmendment = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to propose a project change.");
    }

    const data = (req.data || {}) as {
      bookingId?: string;
      type?: ProjectAmendmentType;
      additionalSessionCount?: unknown;
      addedArtistAmountCents?: unknown;
      addedArtistAmount?: unknown;
      message?: unknown;
      reason?: unknown;
      pausedUntil?: unknown;
      selectedDate?: { date?: unknown; time?: unknown };
      date?: unknown;
      time?: unknown;
      sessionNumber?: unknown;
    };
    const bookingId = getOptionalString(data.bookingId);
    const amendmentType = data.type;

    if (!bookingId || !amendmentType) {
      throw new HttpsError(
        "invalid-argument",
        "A booking and amendment type are required."
      );
    }

    if (
      ![
        "add_sessions",
        "schedule_next_session",
        "pause_project",
        "resume_project",
      ].includes(amendmentType)
    ) {
      throw new HttpsError("invalid-argument", "Unsupported amendment type.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const amendmentRef = bookingRef.collection("amendments").doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    let createdAmendment: admin.firestore.DocumentData = {};

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      const booking = bookingSnap.data() || {};
      const role = getParticipantRole(booking, uid);

      if (
        booking.status === "cancelled" ||
        booking.status === "pending_payment"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Only active paid projects can be amended."
        );
      }

      if (getProjectStatus(booking) === "completed") {
        throw new HttpsError(
          "failed-precondition",
          "Completed projects cannot be amended."
        );
      }

      if (amendmentType === "add_sessions" && role !== "artist") {
        throw new HttpsError(
          "permission-denied",
          "Only the artist can propose added sessions."
        );
      }

      const currentPriceCents = getBookingPriceCents(booking);
      const currentEstimatedSessionCount = getEstimatedSessionCount(booking);
      const baseAmendment = {
        bookingId,
        type: amendmentType,
        status: "proposed" as ProjectAmendmentStatus,
        proposedById: uid,
        proposedByRole: role,
        message: getOptionalString(data.message),
        createdAt: timestamp,
        updatedAt: timestamp,
        projectRevision: getPositiveInteger(booking.projectRevision, 0),
      };

      if (amendmentType === "add_sessions") {
        const additionalSessionCount = getPositiveInteger(
          data.additionalSessionCount,
          0
        );
        const addedArtistAmountCents = getNonNegativeCents(
          data.addedArtistAmountCents,
          dollarsToCents(data.addedArtistAmount || 0)
        );

        if (
          additionalSessionCount <= 0 ||
          currentEstimatedSessionCount + additionalSessionCount >
            MAX_PROJECT_SESSION_COUNT
        ) {
          throw new HttpsError(
            "invalid-argument",
            "A project can contain no more than 12 sessions."
          );
        }

        if (addedArtistAmountCents < MIN_ARTIST_PAYOUT_CENTS) {
          throw new HttpsError(
            "invalid-argument",
            "Added artist amount is too small."
          );
        }

        const proposedPriceCents = currentPriceCents + addedArtistAmountCents;
        const proposedEstimatedSessionCount =
          currentEstimatedSessionCount + additionalSessionCount;
        const proposedSessionAllocations =
          isProtectedSessionPaymentBooking(booking)
            ? buildEqualSessionAllocations({
                totalQuoteCents: addedArtistAmountCents,
                sessionCount: additionalSessionCount,
                depositAmountCents: dollarsToCents(booking.depositAmount),
              }).map((allocation) => ({
                ...allocation,
                sessionNumber:
                  currentEstimatedSessionCount + allocation.sessionNumber,
              }))
            : [];
        if (
          isProtectedSessionPaymentBooking(booking) &&
          proposedSessionAllocations.some(
            (allocation) =>
              allocation.depositAmountCents !==
              dollarsToCents(booking.depositAmount)
          )
        ) {
          throw new HttpsError(
            "invalid-argument",
            "The added amount is too low for the project's session deposit."
          );
        }
        const proposedRemainingBalanceCents = Math.max(
          proposedPriceCents - getTotalArtistPaidCents(booking),
          0
        );
        const platformFeeCollectedCents = getPlatformFeeCollectedCents(booking);
        const platformFeeDeltaCents = Math.max(
          calculatePlatformFeeCents(proposedPriceCents) -
            platformFeeCollectedCents,
          0
        );

        createdAmendment = {
          ...baseAmendment,
          additionalSessionCount,
          addedArtistAmountCents,
          addedArtistAmount: centsToDollars(addedArtistAmountCents),
          currentPriceCents,
          currentEstimatedSessionCount,
          proposedPriceCents,
          proposedPrice: centsToDollars(proposedPriceCents),
          proposedEstimatedSessionCount,
          proposedSessionAllocations,
          proposedRemainingBalanceCents,
          proposedRemainingBalanceAmount: centsToDollars(
            proposedRemainingBalanceCents
          ),
          platformFeeCollectedCents,
          platformFeeDeltaCents,
          platformFeeDeltaAmount: centsToDollars(platformFeeDeltaCents),
        };
      } else if (amendmentType === "schedule_next_session") {
        const date = getOptionalString(data.date ?? data.selectedDate?.date);
        const time = getOptionalString(data.time ?? data.selectedDate?.time);
        const sessionNumber = getPositiveInteger(
          data.sessionNumber,
          getActiveSessionNumber(booking)
        );

        if (!date || !time) {
          throw new HttpsError(
            "invalid-argument",
            "A proposed date and time are required."
          );
        }

        createdAmendment = {
          ...baseAmendment,
          sessionNumber,
          proposedSelectedDate: { date, time },
        };
      } else if (amendmentType === "pause_project") {
        createdAmendment = {
          ...baseAmendment,
          reason: getOptionalString(data.reason),
          pausedUntil: getOptionalString(data.pausedUntil),
        };
      } else {
        createdAmendment = {
          ...baseAmendment,
          reason: getOptionalString(data.reason),
        };
      }

      transaction.create(amendmentRef, createdAmendment);
      transaction.update(bookingRef, {
        lastProjectAmendmentProposedAt: timestamp,
        updatedAt: timestamp,
      });
    });

    return { amendmentId: amendmentRef.id };
  }
);

const respondToProjectAmendment = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to respond to changes.");
    }

    const data = (req.data || {}) as {
      bookingId?: string;
      amendmentId?: string;
      response?: ProjectAmendmentStatus;
    };
    const bookingId = getOptionalString(data.bookingId);
    const amendmentId = getOptionalString(data.amendmentId);
    const response = data.response;

    if (!bookingId || !amendmentId || !response) {
      throw new HttpsError(
        "invalid-argument",
        "A booking, amendment, and response are required."
      );
    }

    if (!["accepted", "declined", "cancelled"].includes(response)) {
      throw new HttpsError("invalid-argument", "Unsupported amendment response.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const amendmentRef = bookingRef.collection("amendments").doc(amendmentId);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    let finalStatus: ProjectAmendmentStatus = response;

    await db.runTransaction(async (transaction) => {
      const [bookingSnap, amendmentSnap] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(amendmentRef),
      ]);

      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      if (!amendmentSnap.exists) {
        throw new HttpsError("not-found", "Amendment not found.");
      }

      const booking = bookingSnap.data() || {};
      const amendment = amendmentSnap.data() || {};
      const role = getParticipantRole(booking, uid);
      const type = amendment.type as ProjectAmendmentType;
      const currentStatus = amendment.status as ProjectAmendmentStatus;

      if (currentStatus !== "proposed") {
        finalStatus = currentStatus;
        return;
      }

      if (response === "cancelled") {
        if (amendment.proposedById !== uid && role !== "artist") {
          throw new HttpsError(
            "permission-denied",
            "Only the proposer or artist can cancel this amendment."
          );
        }
      } else if (type === "add_sessions" && role !== "client") {
        throw new HttpsError(
          "permission-denied",
          "Only the client can accept or decline added sessions."
        );
      } else if (amendment.proposedById === uid) {
        throw new HttpsError(
          "permission-denied",
          "The other project participant needs to respond."
        );
      }

      transaction.update(amendmentRef, {
        status: response,
        respondedAt: timestamp,
        respondedById: uid,
        respondedByRole: role,
        updatedAt: timestamp,
      });

      if (response !== "accepted") {
        return;
      }

      const bookingUpdate: admin.firestore.DocumentData = {
        projectRevision: admin.firestore.FieldValue.increment(1),
        lastAcceptedAmendmentId: amendmentId,
        lastProjectAmendmentAcceptedAt: timestamp,
        updatedAt: timestamp,
      };

      if (type === "add_sessions") {
        const currentPriceCents = getBookingPriceCents(booking);
        const currentEstimatedSessionCount = getEstimatedSessionCount(booking);
        const addedArtistAmountCents = getNonNegativeCents(
          amendment.addedArtistAmountCents,
          0
        );
        const additionalSessionCount = getPositiveInteger(
          amendment.additionalSessionCount,
          0
        );

        if (addedArtistAmountCents <= 0 || additionalSessionCount <= 0) {
          throw new HttpsError(
            "failed-precondition",
            "This added-session amendment is missing pricing details."
          );
        }

        const nextPriceCents = currentPriceCents + addedArtistAmountCents;
        const nextEstimatedSessionCount =
          currentEstimatedSessionCount + additionalSessionCount;
        const nextRemainingBalanceCents = Math.max(
          nextPriceCents - getTotalArtistPaidCents(booking),
          0
        );
        const platformFeeCollectedCents = getPlatformFeeCollectedCents(booking);
        const platformFeeDeltaCents = Math.max(
          calculatePlatformFeeCents(nextPriceCents) - platformFeeCollectedCents,
          0
        );
        const pendingPlatformFeeCents =
          getPendingPlatformFeeCents(booking) + platformFeeDeltaCents;
        const addedSessionAllocations: SessionAllocation[] =
          isProtectedSessionPaymentBooking(booking)
            ? (
                Array.isArray(amendment.proposedSessionAllocations)
                  ? amendment.proposedSessionAllocations
                  : buildEqualSessionAllocations({
                      totalQuoteCents: addedArtistAmountCents,
                      sessionCount: additionalSessionCount,
                      depositAmountCents: dollarsToCents(
                        booking.depositAmount
                      ),
                    }).map((allocation) => ({
                      ...allocation,
                      sessionNumber:
                        currentEstimatedSessionCount +
                        allocation.sessionNumber,
                    }))
              ).map((allocation: admin.firestore.DocumentData) => ({
                sessionNumber: getPositiveInteger(
                  allocation.sessionNumber,
                  currentEstimatedSessionCount + 1
                ),
                quotedAmountCents: getNonNegativeCents(
                  allocation.quotedAmountCents,
                  0
                ),
                depositAmountCents: getNonNegativeCents(
                  allocation.depositAmountCents,
                  0
                ),
              }))
            : [];
        const currentAllocations = Array.isArray(booking.sessionAllocations)
          ? booking.sessionAllocations
          : [];

        Object.assign(bookingUpdate, {
          projectStatus: "active",
          projectType:
            nextEstimatedSessionCount > 1 ? "multi_session" : booking.projectType,
          originalPriceCents:
            booking.originalPriceCents ?? currentPriceCents,
          originalPrice:
            booking.originalPrice ?? centsToDollars(currentPriceCents),
          originalEstimatedSessionCount:
            booking.originalEstimatedSessionCount ??
            currentEstimatedSessionCount,
          price: centsToDollars(nextPriceCents),
          priceCents: nextPriceCents,
          quoteTotalCents: nextPriceCents,
          estimatedSessionCount: nextEstimatedSessionCount,
          ...(isProtectedSessionPaymentBooking(booking)
            ? {
                sessionAllocations: [
                  ...currentAllocations,
                  ...addedSessionAllocations,
                ],
                outstandingProjectCents: nextRemainingBalanceCents,
              }
            : {}),
          remainingBalanceCents: nextRemainingBalanceCents,
          remainingBalanceAmount: centsToDollars(nextRemainingBalanceCents),
          platformFeeCollectedCents,
          platformFeeCollectedAmount: centsToDollars(
            platformFeeCollectedCents
          ),
          pendingPlatformFeeCents,
          pendingPlatformFeeAmount: centsToDollars(pendingPlatformFeeCents),
        });

        transaction.update(amendmentRef, {
          acceptedPriceCents: nextPriceCents,
          acceptedEstimatedSessionCount: nextEstimatedSessionCount,
          acceptedRemainingBalanceCents: nextRemainingBalanceCents,
          acceptedPlatformFeeDeltaCents: platformFeeDeltaCents,
        });
        if (isProtectedSessionPaymentBooking(booking)) {
          addedSessionAllocations.forEach((allocation) => {
            const { sessionRef } = getBookingSessionRefs(
              bookingId,
              allocation.sessionNumber
            );
            const balanceAmountCents = Math.max(
              allocation.quotedAmountCents -
                allocation.depositAmountCents,
              0
            );
            transaction.create(sessionRef, {
              bookingId,
              artistId: booking.artistId,
              clientId: booking.clientId,
              sessionNumber: allocation.sessionNumber,
              quotedAmountCents: allocation.quotedAmountCents,
              quotedAmount: centsToDollars(
                allocation.quotedAmountCents
              ),
              depositAmountCents: allocation.depositAmountCents,
              depositAmount: centsToDollars(
                allocation.depositAmountCents
              ),
              balanceAmountCents,
              balanceAmount: centsToDollars(balanceAmountCents),
              allowedBalanceMethods: ["external"],
              selectedBalanceMethod:
                balanceAmountCents > 0 ? "external" : null,
              depositStatus: "not_due",
              balanceStatus: "not_due",
              paymentStatus: "not_due",
              status: "planned",
              checkoutAttemptNumber: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
            });
          });
        }
      } else if (type === "schedule_next_session") {
        const selectedDate = amendment.proposedSelectedDate || {};
        const date = getOptionalString(selectedDate.date);
        const time = getOptionalString(selectedDate.time);
        const sessionNumber = getPositiveInteger(
          amendment.sessionNumber,
          getActiveSessionNumber(booking)
        );

        if (!date || !time) {
          throw new HttpsError(
            "failed-precondition",
            "This scheduling amendment is missing a date or time."
          );
        }
        const protectedPaymentModel =
          isProtectedSessionPaymentBooking(booking);
        const sessionAllocation = protectedPaymentModel
          ? getProjectSessionAllocation(booking, sessionNumber)
          : null;
        const sessionDepositCents =
          sessionAllocation?.depositAmountCents || 0;

        Object.assign(bookingUpdate, {
          selectedDate: { date, time },
          nextSessionScheduledBy: uid,
          nextSessionScheduledAt: timestamp,
          sessionStatus: protectedPaymentModel
            ? "not_started"
            : booking.sessionStatus || "not_started",
          ...(protectedPaymentModel
            ? {
                pendingSessionPaymentAmount:
                  centsToDollars(sessionDepositCents),
                pendingSessionPaymentAmountCents: sessionDepositCents,
                pendingSessionNumber: sessionNumber,
                remainingPaymentMethod: "stripe",
                remainingPaymentStatus: "due",
              }
            : {}),
        });

        const { summaryRef, sessionRef } = getBookingSessionRefs(
          bookingId,
          sessionNumber
        );
        transaction.set(
          summaryRef,
          createSessionSummaryUpdate(bookingId, booking, sessionNumber, {
            status: "scheduled",
            sessionNumber,
            scheduledDate: date,
            scheduledTime: time,
            scheduledBy: uid,
          }),
          { merge: true }
        );
        transaction.set(
          sessionRef,
          createSessionRecordUpdate(bookingId, booking, sessionNumber, {
            status: "scheduled",
            scheduledDate: date,
            scheduledTime: time,
            scheduledBy: uid,
            scheduledAt: timestamp,
            ...(protectedPaymentModel
              ? {
                  selectedDate: { date, time },
                  depositStatus: "due",
                  paymentStatus: "deposit_due",
                }
              : {}),
          }),
          { merge: true }
        );
      } else if (type === "pause_project") {
        Object.assign(bookingUpdate, {
          projectStatus: "paused",
          pausedAt: timestamp,
          pausedBy: uid,
          pausedReason: getOptionalString(amendment.reason),
          pausedUntil: getOptionalString(amendment.pausedUntil),
        });
      } else if (type === "resume_project") {
        Object.assign(bookingUpdate, {
          projectStatus: "active",
          resumedAt: timestamp,
          resumedBy: uid,
          pausedUntil: admin.firestore.FieldValue.delete(),
        });
      }

      transaction.update(bookingRef, bookingUpdate);
    });

    return { status: finalStatus };
  }
);

const scheduleProjectSession = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to schedule a session.");
    }

    const data = (req.data || {}) as {
      bookingId?: string;
      sessionNumber?: unknown;
      selectedDate?: { date?: unknown; time?: unknown };
      date?: unknown;
      time?: unknown;
      note?: unknown;
    };
    const bookingId = getOptionalString(data.bookingId);
    const date = getOptionalString(data.date ?? data.selectedDate?.date);
    const time = getOptionalString(data.time ?? data.selectedDate?.time);

    if (!bookingId || !date || !time) {
      throw new HttpsError(
        "invalid-argument",
        "A booking, date, and time are required."
      );
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    let scheduledSessionNumber = 1;

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      const booking = bookingSnap.data() || {};
      const participantRole = getParticipantRole(booking, uid);

      if (getProjectStatus(booking) === "completed") {
        throw new HttpsError(
          "failed-precondition",
          "Completed projects cannot be scheduled."
        );
      }

      scheduledSessionNumber = getPositiveInteger(
        data.sessionNumber,
        getActiveSessionNumber(booking)
      );
      const { summaryRef, sessionRef } = getBookingSessionRefs(
        bookingId,
        scheduledSessionNumber
      );
      const protectedPaymentModel = isProtectedSessionPaymentBooking(booking);
      const sessionSnap = protectedPaymentModel
        ? await transaction.get(sessionRef)
        : null;
      const sessionLedger = sessionSnap?.data() || {};
      if (protectedPaymentModel) {
        if (participantRole !== "artist") {
          throw new HttpsError(
            "permission-denied",
            "Only the artist can schedule the next project session."
          );
        }
        if (scheduledSessionNumber !== getActiveSessionNumber(booking)) {
          throw new HttpsError(
            "failed-precondition",
            "Only the active project session can be scheduled."
          );
        }
        if (!sessionSnap?.exists) {
          throw new HttpsError(
            "failed-precondition",
            "The session ledger is missing."
          );
        }
        if (
          !["planned", "awaiting_schedule"].includes(
            String(sessionLedger.status || "")
          )
        ) {
          throw new HttpsError(
            "failed-precondition",
            "This session is not ready to schedule."
          );
        }
      }
      const sessionDepositCents = protectedPaymentModel
        ? getNonNegativeCents(sessionLedger.depositAmountCents, 0)
        : 0;
      const sessionUpdate = {
        status: "scheduled",
        sessionNumber: scheduledSessionNumber,
        scheduledDate: date,
        scheduledTime: time,
        scheduledBy: uid,
        scheduledAt: timestamp,
        note: getOptionalString(data.note),
        ...(protectedPaymentModel
          ? {
              selectedDate: { date, time },
              depositStatus: "due",
              paymentStatus: "deposit_due",
            }
          : {}),
      };

      transaction.update(bookingRef, {
        projectStatus: "active",
        selectedDate: { date, time },
        nextSessionScheduledBy: uid,
        nextSessionScheduledAt: timestamp,
        sessionStatus: protectedPaymentModel
          ? "not_started"
          : booking.sessionStatus || "not_started",
        ...(protectedPaymentModel
          ? {
              pendingSessionPaymentAmount:
                centsToDollars(sessionDepositCents),
              pendingSessionPaymentAmountCents: sessionDepositCents,
              pendingSessionNumber: scheduledSessionNumber,
              remainingPaymentMethod: "stripe",
              remainingPaymentStatus: "due",
            }
          : {}),
        updatedAt: timestamp,
      });
      transaction.set(
        summaryRef,
        createSessionSummaryUpdate(
          bookingId,
          booking,
          scheduledSessionNumber,
          sessionUpdate
        ),
        { merge: true }
      );
      transaction.set(
        sessionRef,
        createSessionRecordUpdate(
          bookingId,
          booking,
          scheduledSessionNumber,
          sessionUpdate
        ),
        { merge: true }
      );
    });

    return { sessionNumber: scheduledSessionNumber };
  }
);

const setProjectPaused = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to update the project.");
    }

    const data = (req.data || {}) as {
      bookingId?: string;
      paused?: unknown;
      reason?: unknown;
      pausedUntil?: unknown;
    };
    const bookingId = getOptionalString(data.bookingId);
    if (!bookingId) {
      throw new HttpsError("invalid-argument", "A booking is required.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const shouldPause = data.paused !== false;
    let projectStatus: ProjectStatus = shouldPause ? "paused" : "active";

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      const booking = bookingSnap.data() || {};
      getParticipantRole(booking, uid);

      if (
        booking.status === "cancelled" ||
        booking.status === "pending_payment"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Only active paid projects can be paused or resumed."
        );
      }

      if (getProjectStatus(booking) === "completed") {
        throw new HttpsError(
          "failed-precondition",
          "Completed projects cannot be paused or resumed."
        );
      }

      const update = shouldPause
        ? {
            projectStatus: "paused" as ProjectStatus,
            pausedAt: timestamp,
            pausedBy: uid,
            pausedReason: getOptionalString(data.reason),
            pausedUntil: getOptionalString(data.pausedUntil),
            updatedAt: timestamp,
          }
        : {
            projectStatus: "active" as ProjectStatus,
            resumedAt: timestamp,
            resumedBy: uid,
            pausedUntil: admin.firestore.FieldValue.delete(),
            updatedAt: timestamp,
          };

      projectStatus = update.projectStatus;
      transaction.update(bookingRef, update);
    });

    return { projectStatus };
  }
);

const prepareProjectSessionPayment = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to request a session payment.");
    }

    const data = (req.data || {}) as {
      bookingId?: string;
      sessionNumber?: unknown;
      amountCents?: unknown;
      amount?: unknown;
      note?: unknown;
    };
    const bookingId = getOptionalString(data.bookingId);
    if (!bookingId) {
      throw new HttpsError("invalid-argument", "A booking is required.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    let requestedSessionNumber = 1;
    let requestedAmountCents = 0;

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      const booking = bookingSnap.data() || {};
      const role = getParticipantRole(booking, uid);
      if (role !== "artist") {
        throw new HttpsError(
          "permission-denied",
          "Only the artist can request a session payment."
        );
      }

      if (isProtectedSessionPaymentBooking(booking)) {
        throw new HttpsError(
          "failed-precondition",
          "Protected projects calculate each deposit and balance from the session ledger."
        );
      }

      if (!isMultiSessionBooking(booking)) {
        throw new HttpsError(
          "failed-precondition",
          "Session payments are only available for multi-session projects."
        );
      }

      if (getSessionInstallmentTiming(booking) !== "before_session") {
        throw new HttpsError(
          "failed-precondition",
          "This project creates payment follow-up after sessions are completed."
        );
      }

      if (
        booking.status === "cancelled" ||
        booking.status === "pending_payment" ||
        getProjectStatus(booking) === "completed"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Only active paid projects can request session payments."
        );
      }

      if (booking.sessionStatus === "in_progress") {
        throw new HttpsError(
          "failed-precondition",
          "Complete the active session before requesting another payment."
        );
      }

      if (getNonNegativeCents(booking.pendingSessionPaymentAmountCents, 0) > 0) {
        throw new HttpsError(
          "failed-precondition",
          "A session payment is already pending."
        );
      }

      const activeSessionNumber = getActiveSessionNumber(booking);
      const sessionCount = getEstimatedSessionCount(booking);
      requestedSessionNumber = getPositiveInteger(
        data.sessionNumber,
        activeSessionNumber
      );
      if (requestedSessionNumber <= 1 || requestedSessionNumber > sessionCount) {
        throw new HttpsError(
          "invalid-argument",
          "Session payments can only be requested for later project sessions."
        );
      }

      if (getLastPaidSessionNumber(booking) >= requestedSessionNumber) {
        throw new HttpsError(
          "failed-precondition",
          "This session payment has already been cleared."
        );
      }

      const remainingBalanceCents = getRemainingBalanceCents(booking);
      if (remainingBalanceCents <= 0) {
        throw new HttpsError(
          "failed-precondition",
          "There is no remaining artist balance to request."
        );
      }

      const defaultAmountCents = getSessionInstallmentCents(booking);
      const rawAmountCents = getNonNegativeCents(
        data.amountCents,
        dollarsToCents(data.amount || 0)
      );
      requestedAmountCents =
        rawAmountCents > 0 ? rawAmountCents : defaultAmountCents;
      const note = getOptionalString(data.note);

      if (requestedSessionNumber >= sessionCount) {
        if (rawAmountCents > 0 && rawAmountCents !== remainingBalanceCents) {
          throw new HttpsError(
            "invalid-argument",
            "The final session payment must clear the full remaining balance."
          );
        }
        requestedAmountCents = remainingBalanceCents;
      }

      if (
        requestedAmountCents !== defaultAmountCents &&
        requestedSessionNumber < sessionCount &&
        !note
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Add a note when changing the suggested payment amount."
        );
      }

      if (
        requestedAmountCents < MIN_ARTIST_PAYOUT_CENTS ||
        requestedAmountCents > remainingBalanceCents
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Session payment must fit within the remaining project balance."
        );
      }

      const { summaryRef, sessionRef } = getBookingSessionRefs(
        bookingId,
        requestedSessionNumber
      );
      const paymentUpdate = {
        status: "payment_due",
        sessionNumber: requestedSessionNumber,
        paymentStatus: "due",
        amountDue: centsToDollars(requestedAmountCents),
        amountDueCents: requestedAmountCents,
        requestedAt: timestamp,
        requestedBy: uid,
        note,
      };

      transaction.update(bookingRef, {
        remainingPaymentStatus: "due",
        pendingSessionPaymentAmount: centsToDollars(requestedAmountCents),
        pendingSessionPaymentAmountCents: requestedAmountCents,
        pendingSessionNumber: requestedSessionNumber,
        pendingSessionPaymentRequestedAt: timestamp,
        pendingSessionPaymentRequestedBy: uid,
        pendingSessionPaymentNote: note,
        updatedAt: timestamp,
      });
      transaction.set(
        summaryRef,
        createSessionSummaryUpdate(
          bookingId,
          booking,
          requestedSessionNumber,
          paymentUpdate
        ),
        { merge: true }
      );
      transaction.set(
        sessionRef,
        createSessionRecordUpdate(
          bookingId,
          booking,
          requestedSessionNumber,
          paymentUpdate
        ),
        { merge: true }
      );
    });

    return {
      sessionNumber: requestedSessionNumber,
      amountCents: requestedAmountCents,
    };
  }
);

const startProjectSession = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to start a session.");
    }

    const bookingId = getOptionalString((req.data || {}).bookingId);
    if (!bookingId) {
      throw new HttpsError("invalid-argument", "A booking is required.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    let startedSessionNumber = 1;

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      const booking = bookingSnap.data() || {};
      const role = getParticipantRole(booking, uid);
      if (role !== "artist") {
        throw new HttpsError(
          "permission-denied",
          "Only the artist can start a session."
        );
      }

      if (!["confirmed", "deposit_paid", "paid"].includes(String(booking.status))) {
        throw new HttpsError(
          "failed-precondition",
          "This booking is not ready to start."
        );
      }

      if (getProjectStatus(booking) === "paused") {
        throw new HttpsError(
          "failed-precondition",
          "Resume this project before starting a session."
        );
      }

      if (booking.sessionStatus === "in_progress") {
        throw new HttpsError(
          "failed-precondition",
          "This session is already in progress."
        );
      }

      if (getNonNegativeCents(booking.pendingSessionPaymentAmountCents, 0) > 0) {
        throw new HttpsError(
          "failed-precondition",
          "Settle the requested session payment before starting."
        );
      }

      if (getPendingPlatformFeeCents(booking) > 0) {
        throw new HttpsError(
          "failed-precondition",
          "Collect the pending SATX Ink platform fee before starting the next session."
        );
      }

      startedSessionNumber = getActiveSessionNumber(booking);

      if (
        isMultiSessionBooking(booking) &&
        getSessionInstallmentTiming(booking) === "before_session" &&
        startedSessionNumber > 1 &&
        getRemainingBalanceCents(booking) > 0 &&
        getLastPaidSessionNumber(booking) < startedSessionNumber
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Request and collect this session installment before starting."
        );
      }

      const { summaryRef, sessionRef } = getBookingSessionRefs(
        bookingId,
        startedSessionNumber
      );
      if (isProtectedSessionPaymentBooking(booking)) {
        const sessionSnap = await transaction.get(sessionRef);
        const sessionLedger = sessionSnap.data() || {};
        if (!sessionSnap.exists || sessionLedger.depositStatus !== "paid") {
          throw new HttpsError(
            "failed-precondition",
            "The session deposit must be paid before tattooing begins."
          );
        }
        if (
          !["scheduled", "not_started"].includes(
            String(sessionLedger.status || "")
          )
        ) {
          throw new HttpsError(
            "failed-precondition",
            "This session is not ready to start."
          );
        }
      }
      const sessionUpdate = {
        status: "in_progress",
        sessionNumber: startedSessionNumber,
        startedAt: timestamp,
        startedBy: uid,
      };

      transaction.update(bookingRef, {
        projectStatus: "active",
        sessionId: bookingId,
        sessionStatus: "in_progress",
        sessionStartedAt: timestamp,
        activeSessionNumber: startedSessionNumber,
        updatedAt: timestamp,
      });
      transaction.set(
        summaryRef,
        createSessionSummaryUpdate(
          bookingId,
          booking,
          startedSessionNumber,
          sessionUpdate
        ),
        { merge: true }
      );
      transaction.set(
        sessionRef,
        createSessionRecordUpdate(
          bookingId,
          booking,
          startedSessionNumber,
          sessionUpdate
        ),
        { merge: true }
      );
    });

    return { sessionNumber: startedSessionNumber };
  }
);

const completeProjectSession = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to complete a session.");
    }

    const data = (req.data || {}) as {
      bookingId?: string;
      notes?: unknown;
      photoUrls?: unknown;
    };
    const bookingId = getOptionalString(data.bookingId);
    if (!bookingId) {
      throw new HttpsError("invalid-argument", "A booking is required.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    let completedSessionNumber = 1;
    let amountDueCents = 0;

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      const booking = bookingSnap.data() || {};
      const role = getParticipantRole(booking, uid);
      if (role !== "artist") {
        throw new HttpsError(
          "permission-denied",
          "Only the artist can complete a session."
        );
      }

      if (!["confirmed", "deposit_paid", "paid"].includes(String(booking.status))) {
        throw new HttpsError(
          "failed-precondition",
          "This booking is not ready to complete."
        );
      }

      completedSessionNumber = getActiveSessionNumber(booking);
      const sessionCount = getEstimatedSessionCount(booking);
      const sessionInstallmentTiming = getSessionInstallmentTiming(booking);
      const completedSessionCount = Math.max(
        getCompletedSessionCount(booking),
        completedSessionNumber
      );
      const remainingBalanceCents = getRemainingBalanceCents(booking);
      const protectedPaymentModel = isProtectedSessionPaymentBooking(booking);
      const { summaryRef, sessionRef } = getBookingSessionRefs(
        bookingId,
        completedSessionNumber
      );
      const protectedSessionSnap = protectedPaymentModel
        ? await transaction.get(sessionRef)
        : null;
      const protectedSession = protectedSessionSnap?.data() || {};
      if (protectedPaymentModel) {
        if (!protectedSessionSnap?.exists) {
          throw new HttpsError(
            "failed-precondition",
            "The session ledger is missing."
          );
        }
        if (protectedSession.depositStatus !== "paid") {
          throw new HttpsError(
            "failed-precondition",
            "The session deposit has not been paid."
          );
        }
        if (protectedSession.status !== "in_progress") {
          throw new HttpsError(
            "failed-precondition",
            "Start the session before marking it complete."
          );
        }
      }
      amountDueCents = protectedPaymentModel
        ? getNonNegativeCents(protectedSession.balanceAmountCents, 0)
        : sessionInstallmentTiming === "after_session" &&
          remainingBalanceCents > 0
        ? getSessionInstallmentCents(booking)
        : 0;
      const projectIsComplete = completedSessionCount >= sessionCount;
      const hasAnotherSession =
        isMultiSessionBooking(booking) && completedSessionNumber < sessionCount;
      const nextSessionStatus = projectIsComplete
        ? "completed"
        : hasAnotherSession && amountDueCents <= 0
        ? "awaiting_next_session"
        : "completed";
      const nextActiveSessionNumber = projectIsComplete
        ? completedSessionNumber
        : hasAnotherSession && amountDueCents <= 0
        ? Math.min(completedSessionNumber + 1, sessionCount)
        : completedSessionNumber;
      const submittedPhotoUrls = Array.isArray(data.photoUrls)
        ? data.photoUrls.filter((url): url is string => typeof url === "string")
        : [];
      const existingSessionPhotoUrls = Array.isArray(protectedSession.photoUrls)
        ? protectedSession.photoUrls.filter(
            (url): url is string => typeof url === "string"
          )
        : [];
      const photoUrls = Array.from(
        new Set(
          submittedPhotoUrls.length > 0
            ? [...existingSessionPhotoUrls, ...submittedPhotoUrls]
            : existingSessionPhotoUrls
        )
      );
      const sessionUpdate = {
        status: "completed",
        sessionNumber: completedSessionNumber,
        completedAt: timestamp,
        completedBy: uid,
        notes: getOptionalString(data.notes),
        photoUrls,
        amountDueCents,
        amountDue: centsToDollars(amountDueCents),
        paymentStatus: amountDueCents > 0 ? "due" : "confirmed",
        ...(protectedPaymentModel
          ? {
              balanceStatus:
                amountDueCents > 0 ? "due" : "confirmed",
              selectedBalanceMethod:
                amountDueCents > 0 ? "external" : null,
            }
          : {}),
        pendingPlatformFeeCents: getPendingPlatformFeeCents(booking),
      };

      transaction.update(bookingRef, {
        sessionStatus: nextSessionStatus,
        projectStatus:
          projectIsComplete && amountDueCents <= 0
            ? "completed"
            : "active",
        sessionCompletedAt: timestamp,
        completedSessionCount,
        pendingSessionPaymentAmount: centsToDollars(amountDueCents),
        pendingSessionPaymentAmountCents: amountDueCents,
        pendingSessionNumber: amountDueCents > 0 ? completedSessionNumber : null,
        pendingSessionPaymentNote: amountDueCents > 0 ? booking.pendingSessionPaymentNote ?? null : null,
        pendingSessionPaymentRequestedAt: amountDueCents > 0 ? timestamp : null,
        pendingSessionPaymentRequestedBy: amountDueCents > 0 ? uid : null,
        remainingPaymentStatus:
          amountDueCents > 0
            ? "due"
            : remainingBalanceCents > 0
            ? "not_due"
            : "confirmed",
        remainingPaymentMethod: "external",
        externalRemainingAmount: centsToDollars(amountDueCents),
        externalRemainingAmountCents: amountDueCents,
        activeSessionNumber: nextActiveSessionNumber,
        sessionPhotoUrls: photoUrls.length > 0 ? photoUrls : booking.sessionPhotoUrls ?? [],
        updatedAt: timestamp,
      });
      transaction.set(
        summaryRef,
        createSessionSummaryUpdate(
          bookingId,
          booking,
          completedSessionNumber,
          sessionUpdate
        ),
        { merge: true }
      );
      transaction.set(
        sessionRef,
        createSessionRecordUpdate(
          bookingId,
          booking,
          completedSessionNumber,
          sessionUpdate
        ),
        { merge: true }
      );
    });

    return {
      sessionNumber: completedSessionNumber,
      amountDueCents,
    };
  }
);

const addProjectSessionPhoto = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to save a session photo."
      );
    }

    const bookingId = getOptionalString(req.data?.bookingId);
    const photoUrl = getOptionalString(req.data?.photoUrl);
    if (!bookingId || !photoUrl) {
      throw new HttpsError(
        "invalid-argument",
        "A booking and photo URL are required."
      );
    }

    let parsedPhotoUrl: URL;
    try {
      parsedPhotoUrl = new URL(photoUrl);
    } catch {
      throw new HttpsError("invalid-argument", "The photo URL is invalid.");
    }
    if (
      parsedPhotoUrl.protocol !== "https:" ||
      !["firebasestorage.googleapis.com", "storage.googleapis.com"].includes(
        parsedPhotoUrl.hostname
      ) ||
      photoUrl.length > 2048
    ) {
      throw new HttpsError(
        "invalid-argument",
        "The photo must come from SATX Ink storage."
      );
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    let sessionNumber = 1;
    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      const booking = bookingSnap.data() || {};
      if (getParticipantRole(booking, uid) !== "artist") {
        throw new HttpsError(
          "permission-denied",
          "Only the artist can add session photos."
        );
      }

      sessionNumber = getActiveSessionNumber(booking);
      const { summaryRef, sessionRef } = getBookingSessionRefs(
        bookingId,
        sessionNumber
      );
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const photoUpdate = {
        bookingId,
        artistId: booking.artistId,
        clientId: booking.clientId,
        sessionNumber,
        photoUrls: admin.firestore.FieldValue.arrayUnion(photoUrl),
        updatedAt: timestamp,
      };

      transaction.update(bookingRef, {
        sessionPhotoUrls: admin.firestore.FieldValue.arrayUnion(photoUrl),
        updatedAt: timestamp,
      });
      transaction.set(summaryRef, photoUpdate, { merge: true });
      transaction.set(sessionRef, photoUpdate, { merge: true });
    });

    return { sessionNumber, photoUrl };
  }
);

const selectSessionBalanceMethod = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to choose a payment method."
      );
    }
    const bookingId = getOptionalString(req.data?.bookingId);
    const method = req.data?.method as SessionBalanceMethod | undefined;
    if (!bookingId || method !== "external") {
      throw new HttpsError(
        "invalid-argument",
        "Session balances are settled at the shop."
      );
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }
      const booking = bookingSnap.data() || {};
      const role = getParticipantRole(booking, uid);
      if (role !== "client") {
        throw new HttpsError(
          "permission-denied",
          "Only the client can choose how to settle the session balance."
        );
      }
      if (!isProtectedSessionPaymentBooking(booking)) {
        throw new HttpsError(
          "failed-precondition",
          "This booking uses the legacy payment flow."
        );
      }

      const sessionNumber = getPositiveInteger(
        booking.pendingSessionNumber,
        getActiveSessionNumber(booking)
      );
      const { sessionRef } = getBookingSessionRefs(bookingId, sessionNumber);
      const sessionSnap = await transaction.get(sessionRef);
      const sessionLedger = sessionSnap.data() || {};
      if (
        !sessionSnap.exists ||
        sessionLedger.balanceStatus !== "due"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The session balance is not due yet."
        );
      }
      const allowedMethods = Array.isArray(sessionLedger.allowedBalanceMethods)
        ? sessionLedger.allowedBalanceMethods
        : ["external"];
      if (!allowedMethods.includes(method)) {
        throw new HttpsError(
          "failed-precondition",
          "That payment method is not available for this session."
        );
      }
      if (
        sessionLedger.externalArtistConfirmedAt ||
        sessionLedger.externalClientConfirmedAt
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The payment method cannot change after a confirmation."
        );
      }

      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      transaction.update(bookingRef, {
        remainingPaymentMethod: method,
        updatedAt: timestamp,
      });
      transaction.set(
        sessionRef,
        {
          selectedBalanceMethod: method,
          updatedAt: timestamp,
        },
        { merge: true }
      );
    });

    return { method };
  }
);

const attestExternalSessionPayment = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to confirm this payment."
      );
    }
    const bookingId = getOptionalString(req.data?.bookingId);
    const action = req.data?.action === "dispute" ? "dispute" : "confirm";
    const reason = getOptionalString(req.data?.reason);
    if (!bookingId) {
      throw new HttpsError("invalid-argument", "A booking is required.");
    }
    if (action === "dispute" && !reason) {
      throw new HttpsError(
        "invalid-argument",
        "Add a short reason for the payment dispute."
      );
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    let settled = false;
    let resultingStatus = "due";

    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }
      const booking = bookingSnap.data() || {};
      const role = getParticipantRole(booking, uid);
      if (!role) {
        throw new HttpsError(
          "permission-denied",
          "Only this booking's artist or client can update its payment."
        );
      }
      if (!isProtectedSessionPaymentBooking(booking)) {
        throw new HttpsError(
          "failed-precondition",
          "This booking uses the legacy payment flow."
        );
      }
      const sessionNumber = getPositiveInteger(
        booking.pendingSessionNumber,
        getActiveSessionNumber(booking)
      );
      const { summaryRef, sessionRef } = getBookingSessionRefs(
        bookingId,
        sessionNumber
      );
      const paymentRef = bookingRef
        .collection("payments")
        .doc(`external-session-${sessionNumber}`);
      const [sessionSnap, paymentSnap] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(paymentRef),
      ]);
      const sessionLedger = sessionSnap.data() || {};
      if (
        !sessionSnap.exists ||
        !["due", "artist_confirmed", "client_confirmed", "disputed"].includes(
          String(sessionLedger.balanceStatus || "")
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The session balance is not available for confirmation."
        );
      }
      if (
        action === "confirm" &&
        sessionLedger.balanceStatus === "disputed"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "This payment is disputed and must be reviewed before confirmation."
        );
      }
      if (paymentSnap.exists) {
        settled = true;
        resultingStatus = "confirmed";
        return;
      }

      const allowedMethods = Array.isArray(sessionLedger.allowedBalanceMethods)
        ? sessionLedger.allowedBalanceMethods
        : ["external"];
      if (!allowedMethods.includes("external")) {
        throw new HttpsError(
          "failed-precondition",
          "Payment at the shop is not enabled for this session."
        );
      }
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      if (action === "dispute") {
        resultingStatus = "disputed";
        transaction.update(bookingRef, {
          remainingPaymentMethod: "external",
          remainingPaymentStatus: "disputed",
          externalRemainingDisputeReason: reason,
          externalRemainingDisputedAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.set(
          sessionRef,
          {
            selectedBalanceMethod: "external",
            balanceStatus: "disputed",
            disputeReason: reason,
            disputedAt: timestamp,
            disputedBy: uid,
            updatedAt: timestamp,
          },
          { merge: true }
        );
        return;
      }

      const artistAlreadyConfirmed = Boolean(
        sessionLedger.externalArtistConfirmedAt
      );
      const clientAlreadyConfirmed = Boolean(
        sessionLedger.externalClientConfirmedAt
      );
      if (
        role === "client" &&
        !artistAlreadyConfirmed
      ) {
        resultingStatus = "client_confirmed";
        transaction.update(bookingRef, {
          remainingPaymentMethod: "external",
          remainingPaymentStatus: "client_confirmed",
          externalRemainingClientConfirmedAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.set(
          sessionRef,
          {
            selectedBalanceMethod: "external",
            balanceStatus: "client_confirmed",
            externalClientConfirmedAt: timestamp,
            updatedAt: timestamp,
          },
          { merge: true }
        );
        return;
      }
      resultingStatus = "confirmed";

      const balanceAmountCents = getNonNegativeCents(
        sessionLedger.balanceAmountCents,
        0
      );
      if (balanceAmountCents <= 0) {
        throw new HttpsError(
          "failed-precondition",
          "The session ledger has no balance to settle."
        );
      }
      const priceCents = getBookingPriceCents(booking);
      const nextPaidCents = Math.min(
        getTotalArtistPaidCents(booking) + balanceAmountCents,
        priceCents
      );
      const remainingBalanceCents = Math.max(priceCents - nextPaidCents, 0);
      const isFinalSession =
        sessionNumber >= getEstimatedSessionCount(booking);
      const projectComplete = isFinalSession && remainingBalanceCents === 0;
      const nextSessionNumber = projectComplete
        ? sessionNumber
        : sessionNumber + 1;
      settled = true;

      transaction.update(bookingRef, {
        status: projectComplete ? "paid" : "deposit_paid",
        artistPaidCents: nextPaidCents,
        totalArtistPaidCents: nextPaidCents,
        totalArtistPaidAmount: centsToDollars(nextPaidCents),
        outstandingProjectCents: remainingBalanceCents,
        remainingBalanceCents,
        remainingBalanceAmount: centsToDollars(remainingBalanceCents),
        remainingPaidAmountCents:
          getNonNegativeCents(booking.remainingPaidAmountCents, 0) +
          balanceAmountCents,
        remainingPaidAmount:
          centsToDollars(
            getNonNegativeCents(booking.remainingPaidAmountCents, 0) +
              balanceAmountCents
          ),
        remainingPaidAt: timestamp,
        remainingPaymentMethod: "external",
        remainingPaymentStatus: projectComplete ? "confirmed" : "not_due",
        externalRemainingArtistConfirmedAt: timestamp,
        pendingSessionPaymentAmount: 0,
        pendingSessionPaymentAmountCents: 0,
        pendingSessionNumber: null,
        lastPaidSessionNumber: sessionNumber,
        activeSessionNumber: nextSessionNumber,
        sessionStatus: projectComplete
          ? "completed"
          : "awaiting_next_session",
        projectStatus: projectComplete ? "completed" : "active",
        ...(projectComplete ? { paidAt: timestamp } : {}),
        updatedAt: timestamp,
      });
      transaction.set(
        sessionRef,
        {
          selectedBalanceMethod: "external",
          balanceStatus: "confirmed",
          paymentStatus: "confirmed",
          externalArtistConfirmedAt:
            sessionLedger.externalArtistConfirmedAt || timestamp,
          paidBalanceAmountCents: balanceAmountCents,
          paidBalanceAmount: centsToDollars(balanceAmountCents),
          balancePaidAt: timestamp,
          updatedAt: timestamp,
        },
        { merge: true }
      );
      transaction.set(
        summaryRef,
        {
          activeSessionNumber: nextSessionNumber,
          remainingAmountCents: remainingBalanceCents,
          remainingAmount: centsToDollars(remainingBalanceCents),
          paymentStatus: "confirmed",
          updatedAt: timestamp,
        },
        { merge: true }
      );
      transaction.create(paymentRef, {
        bookingId,
        sessionNumber,
        purpose: "session_balance",
        method: "external",
        artistAmountCents: balanceAmountCents,
        platformFeeCents: 0,
        stripeFeeCents: 0,
        clientTotalCents: balanceAmountCents,
        status: "confirmed",
        artistConfirmedAt:
          sessionLedger.externalArtistConfirmedAt || timestamp,
        clientConfirmedAt: clientAlreadyConfirmed
          ? sessionLedger.externalClientConfirmedAt
          : null,
        createdAt: timestamp,
      });
    });

    return { settled, status: resultingStatus };
  }
);

const startFlashAppointment = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to start this appointment.");
    }

    const bookingId = getOptionalString(req.data?.bookingId);
    if (!bookingId) {
      throw new HttpsError("invalid-argument", "A bookingId is required.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const { summaryRef, sessionRef } = getBookingSessionRefs(bookingId, 1);

    await db.runTransaction(async (transaction) => {
      const [bookingSnap, sessionSnap] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(sessionRef),
      ]);
      if (!bookingSnap.exists || !sessionSnap.exists) {
        throw new HttpsError("not-found", "Flash appointment not found.");
      }

      const booking = bookingSnap.data() || {};
      const session = sessionSnap.data() || {};
      if (booking.sourceType !== "flash") {
        throw new HttpsError(
          "failed-precondition",
          "Only flash appointments are supported at launch."
        );
      }
      if (booking.artistId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the booked artist can start this appointment."
        );
      }
      if (booking.status !== "deposit_paid") {
        throw new HttpsError(
          "failed-precondition",
          "The booking deposit must be paid before the appointment starts."
        );
      }
      if (session.depositStatus !== "paid") {
        throw new HttpsError(
          "failed-precondition",
          "The appointment deposit has not been confirmed."
        );
      }
      if (
        booking.appointmentStatus === "completed" ||
        session.status === "completed"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "This appointment is already complete."
        );
      }
      if (
        booking.appointmentStatus === "in_progress" &&
        session.status === "in_progress"
      ) {
        return;
      }

      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      transaction.update(bookingRef, {
        appointmentStatus: "in_progress",
        sessionStatus: "in_progress",
        appointmentStartedAt: timestamp,
        sessionStartedAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.set(
        sessionRef,
        {
          status: "in_progress",
          startedAt: timestamp,
          startedBy: uid,
          updatedAt: timestamp,
        },
        { merge: true }
      );
      transaction.set(
        summaryRef,
        {
          appointmentStatus: "in_progress",
          activeSessionNumber: 1,
          updatedAt: timestamp,
        },
        { merge: true }
      );
    });

    return { status: "in_progress" };
  }
);

const completeFlashAppointment = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to complete this appointment."
      );
    }

    const bookingId = getOptionalString(req.data?.bookingId);
    if (!bookingId) {
      throw new HttpsError("invalid-argument", "A bookingId is required.");
    }
    const submittedPhotoUrls = Array.isArray(req.data?.photoUrls)
      ? req.data.photoUrls.filter(
          (url: unknown): url is string =>
            typeof url === "string" && url.trim().length > 0
        )
      : [];

    const bookingRef = db.collection("bookings").doc(bookingId);
    const { summaryRef, sessionRef } = getBookingSessionRefs(bookingId, 1);
    let shopBalanceAmountCents = 0;

    await db.runTransaction(async (transaction) => {
      const [bookingSnap, sessionSnap] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(sessionRef),
      ]);
      if (!bookingSnap.exists || !sessionSnap.exists) {
        throw new HttpsError("not-found", "Flash appointment not found.");
      }

      const booking = bookingSnap.data() || {};
      const session = sessionSnap.data() || {};
      if (booking.sourceType !== "flash") {
        throw new HttpsError(
          "failed-precondition",
          "Only flash appointments are supported at launch."
        );
      }
      if (booking.artistId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the booked artist can complete this appointment."
        );
      }
      if (booking.status !== "deposit_paid" || session.depositStatus !== "paid") {
        throw new HttpsError(
          "failed-precondition",
          "The booking deposit must be paid before completion."
        );
      }
      if (
        booking.appointmentStatus === "completed" &&
        session.status === "completed"
      ) {
        shopBalanceAmountCents = getNonNegativeCents(
          booking.shopBalanceAmountCents,
          0
        );
        return;
      }
      if (
        booking.appointmentStatus !== "in_progress" ||
        session.status !== "in_progress"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Start the appointment before marking it complete."
        );
      }

      const priceCents = getBookingPriceCents(booking);
      const depositCents = getNonNegativeCents(
        booking.depositAmountCents,
        dollarsToCents(booking.depositAmount)
      );
      shopBalanceAmountCents = Math.max(priceCents - depositCents, 0);
      const existingPhotoUrls = Array.isArray(session.photoUrls)
        ? session.photoUrls.filter(
            (url: unknown): url is string => typeof url === "string"
          )
        : [];
      const photoUrls = Array.from(
        new Set([...existingPhotoUrls, ...submittedPhotoUrls])
      );
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const balanceStatus = shopBalanceAmountCents > 0 ? "due" : "paid";

      transaction.update(bookingRef, {
        appointmentStatus: "completed",
        sessionStatus: "completed",
        appointmentCompletedAt: timestamp,
        sessionCompletedAt: timestamp,
        shopBalanceAmountCents,
        shopBalanceAmount: centsToDollars(shopBalanceAmountCents),
        shopBalanceStatus: balanceStatus,
        remainingBalanceCents: shopBalanceAmountCents,
        remainingBalanceAmount: centsToDollars(shopBalanceAmountCents),
        remainingPaymentMethod: "external",
        remainingPaymentStatus:
          shopBalanceAmountCents > 0 ? "due" : "confirmed",
        externalRemainingAmountCents: shopBalanceAmountCents,
        externalRemainingAmount: centsToDollars(shopBalanceAmountCents),
        sessionPhotoUrls: photoUrls,
        ...(shopBalanceAmountCents === 0
          ? { status: "paid", paidAt: timestamp }
          : {}),
        updatedAt: timestamp,
      });
      transaction.set(
        sessionRef,
        {
          status: "completed",
          completedAt: timestamp,
          completedBy: uid,
          notes: getOptionalString(req.data?.notes),
          photoUrls,
          balanceStatus,
          selectedBalanceMethod:
            shopBalanceAmountCents > 0 ? "external" : null,
          paymentStatus:
            shopBalanceAmountCents > 0 ? "balance_due" : "confirmed",
          updatedAt: timestamp,
        },
        { merge: true }
      );
      transaction.set(
        summaryRef,
        {
          appointmentStatus: "completed",
          completedSessionCount: 1,
          remainingAmountCents: shopBalanceAmountCents,
          remainingAmount: centsToDollars(shopBalanceAmountCents),
          paymentStatus:
            shopBalanceAmountCents > 0 ? "balance_due" : "confirmed",
          updatedAt: timestamp,
        },
        { merge: true }
      );
    });

    return {
      status: "completed",
      shopBalanceAmountCents,
    };
  }
);

const recordFlashBalancePaidAtShop = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to record the shop payment."
      );
    }

    const bookingId = getOptionalString(req.data?.bookingId);
    if (!bookingId) {
      throw new HttpsError("invalid-argument", "A bookingId is required.");
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const { summaryRef, sessionRef } = getBookingSessionRefs(bookingId, 1);
    const paymentRef = bookingRef.collection("payments").doc("shop-balance");
    let shopBalanceAmountCents = 0;

    await db.runTransaction(async (transaction) => {
      const [bookingSnap, sessionSnap, paymentSnap] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(sessionRef),
        transaction.get(paymentRef),
      ]);
      if (!bookingSnap.exists || !sessionSnap.exists) {
        throw new HttpsError("not-found", "Flash appointment not found.");
      }

      const booking = bookingSnap.data() || {};
      const session = sessionSnap.data() || {};
      if (booking.sourceType !== "flash") {
        throw new HttpsError(
          "failed-precondition",
          "Only flash appointments are supported at launch."
        );
      }
      if (booking.artistId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the booked artist can record this payment."
        );
      }
      if (
        booking.appointmentStatus !== "completed" ||
        session.status !== "completed"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Complete the appointment before recording the remaining balance."
        );
      }

      const priceCents = getBookingPriceCents(booking);
      const depositCents = getNonNegativeCents(
        booking.depositAmountCents,
        dollarsToCents(booking.depositAmount)
      );
      shopBalanceAmountCents = Math.max(priceCents - depositCents, 0);
      if (paymentSnap.exists || booking.shopBalanceStatus === "paid") {
        return;
      }

      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      transaction.update(bookingRef, {
        status: "paid",
        shopBalanceAmountCents,
        shopBalanceAmount: centsToDollars(shopBalanceAmountCents),
        shopBalanceStatus: "paid",
        shopBalancePaidAt: timestamp,
        remainingBalanceCents: 0,
        remainingBalanceAmount: 0,
        remainingPaymentMethod: "external",
        remainingPaymentStatus: "confirmed",
        externalRemainingPaidAt: timestamp,
        totalArtistPaidCents: priceCents,
        totalArtistPaidAmount: centsToDollars(priceCents),
        artistPaidCents: priceCents,
        paidAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.set(
        sessionRef,
        {
          balanceStatus: "paid",
          balancePaidAt: timestamp,
          selectedBalanceMethod: "external",
          paidBalanceAmountCents: shopBalanceAmountCents,
          paidBalanceAmount: centsToDollars(shopBalanceAmountCents),
          paymentStatus: "confirmed",
          updatedAt: timestamp,
        },
        { merge: true }
      );
      transaction.set(
        summaryRef,
        {
          remainingAmountCents: 0,
          remainingAmount: 0,
          paymentStatus: "confirmed",
          updatedAt: timestamp,
        },
        { merge: true }
      );
      transaction.create(paymentRef, {
        bookingId,
        sessionNumber: 1,
        purpose: "shop_balance",
        method: "external",
        artistAmountCents: shopBalanceAmountCents,
        platformFeeCents: 0,
        stripeFeeCents: 0,
        clientTotalCents: shopBalanceAmountCents,
        status: "confirmed",
        recordedBy: uid,
        createdAt: timestamp,
      });
    });

    return {
      status: "paid",
      shopBalanceAmountCents,
    };
  }
);

const addFlashAppointmentPhoto = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to save an appointment photo."
      );
    }

    const bookingId = getOptionalString(req.data?.bookingId);
    const photoUrl = getOptionalString(req.data?.photoUrl);
    if (!bookingId || !photoUrl) {
      throw new HttpsError(
        "invalid-argument",
        "A booking and photo URL are required."
      );
    }

    let parsedPhotoUrl: URL;
    try {
      parsedPhotoUrl = new URL(photoUrl);
    } catch {
      throw new HttpsError("invalid-argument", "The photo URL is invalid.");
    }
    if (
      parsedPhotoUrl.protocol !== "https:" ||
      !["firebasestorage.googleapis.com", "storage.googleapis.com"].includes(
        parsedPhotoUrl.hostname
      ) ||
      photoUrl.length > 2048
    ) {
      throw new HttpsError(
        "invalid-argument",
        "The photo must come from SATX Ink storage."
      );
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const { summaryRef, sessionRef } = getBookingSessionRefs(bookingId, 1);
    await db.runTransaction(async (transaction) => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) {
        throw new HttpsError("not-found", "Flash appointment not found.");
      }

      const booking = bookingSnap.data() || {};
      if (booking.sourceType !== "flash") {
        throw new HttpsError(
          "failed-precondition",
          "Only flash appointments are supported at launch."
        );
      }
      if (booking.artistId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the booked artist can add appointment photos."
        );
      }

      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const photoUpdate = {
        bookingId,
        artistId: booking.artistId,
        clientId: booking.clientId,
        sessionNumber: 1,
        photoUrls: admin.firestore.FieldValue.arrayUnion(photoUrl),
        updatedAt: timestamp,
      };

      transaction.update(bookingRef, {
        sessionPhotoUrls: admin.firestore.FieldValue.arrayUnion(photoUrl),
        updatedAt: timestamp,
      });
      transaction.set(summaryRef, photoUpdate, { merge: true });
      transaction.set(sessionRef, photoUpdate, { merge: true });
    });

    return { sessionNumber: 1, photoUrl };
  }
);

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

    const isPlatformFeeCheckout = booking.checkoutPaymentMode === "platform_fee";
    let connectedAccountId =
      (booking.stripeConnectedAccountId as string | undefined) || undefined;

    if (!connectedAccountId && booking.artistId && !isPlatformFeeCheckout) {
      const artistSnap = await db.collection("users").doc(booking.artistId).get();
      const artist = artistSnap.data() || {};
      connectedAccountId = artist.stripeConnect?.accountId as string | undefined;
    }

    if (!connectedAccountId && !isPlatformFeeCheckout) {
      return { paid: false, status: booking.status || "pending_payment" };
    }

    const stripe = getStripeClient();
    const session = isPlatformFeeCheckout
      ? await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["payment_intent"],
        })
      : await stripe.checkout.sessions.retrieve(
          sessionId,
          { expand: ["payment_intent"] },
          { stripeAccount: connectedAccountId }
        );

    const paymentIntent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    if (session.payment_status === "paid" || session.status === "complete") {
      const result = await finalizeBookingPaymentAndFlash(
        bookingRef,
        {
          ...session,
          payment_intent: paymentIntent,
        } as Stripe.Checkout.Session,
        connectedAccountId
      );

      return { paid: true, status: result.status };
    }

    return {
      paid: false,
      status: booking.status || "pending_payment",
      stripeSessionStatus: session.status,
      stripePaymentStatus: session.payment_status,
    };
  }
);

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
    if (existing.exists && existing.data()?.status === "processed") {
      console.log(`Skipping duplicate event: ${event.id}`);
      res.status(200).send('Event already processed.');
      return;
    }

    // Record the attempt, but only mark it processed after fulfillment succeeds.
    await eventDoc.set({
      createdAt:
        existing.data()?.createdAt ||
        admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      type: event.type,
      status: "processing",
      attempts: admin.firestore.FieldValue.increment(1),
    }, { merge: true });

    // Handle specific event types
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
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

        const result = await finalizeBookingPaymentAndFlash(
          bookingRef,
          session,
          event.account ?? session.metadata?.stripeConnectedAccountId ?? null
        );

        console.log(`Booking ${bookingId} updated to ${result.status}.`);
        await eventDoc.set({
          status: "processed",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        res.status(200).send("Booking updated.");
      } catch (err) {
        console.error("Error updating booking:", err);
        await eventDoc.delete().catch(() => undefined);
        res.status(500).send("Failed to update booking.");
      }
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.bookingId;
      const flashId = session.metadata?.flashId;

      if (!bookingId) {
        console.warn("Missing bookingId in expired session metadata.");
        res.status(400).send("Missing bookingId.");
        return;
      }

      try {
        const released = await releaseOneOfOneFlashHold({
          flashId,
          bookingId,
          sessionId: session.id,
        });

        if (released) {
          await firestore.collection("bookings").doc(bookingId).set(
            {
              flashAvailabilityStatus: "available",
              checkoutExpiredAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
        const expiredSessionNumber = getPositiveInteger(
          session.metadata?.sessionNumber,
          1
        );
        const expiredSessionRef = getBookingSessionRefs(
          bookingId,
          expiredSessionNumber
        ).sessionRef;
        await expiredSessionRef.set(
          {
            checkoutStatus: "expired",
            checkoutAttemptNumber: admin.firestore.FieldValue.increment(1),
            checkoutExpiredAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        await eventDoc.set({
          status: "processed",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        console.log(`Checkout session ${session.id} expired. Flash hold released: ${released}.`);
        res.status(200).send("Checkout expiration handled.");
      } catch (err) {
        console.error("Error handling checkout expiration:", err);
        await eventDoc.delete().catch(() => undefined);
        res.status(500).send("Failed to handle checkout expiration.");
      }
    } else {
      console.log(`Unhandled event type: ${event.type}`);
      await eventDoc.set({
        status: "processed",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      res.status(200).json({ received: true });
    }
  }
);



const processArtistMedia = onObjectFinalized(
  { timeoutSeconds: 300, memory: "2GiB", concurrency: 2 },
  async (event) => {
    const filePath = event.data.name;
    if (!filePath) return;

    if (
      !filePath.startsWith("users/") ||
      (
        !filePath.includes("/gallery/") &&
        !filePath.includes("/galleryOriginals/") &&
        !filePath.includes("/flashes/") &&
        !filePath.includes("/flashSheets/") &&
        !filePath.includes("/homepageFeature/")
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
    const mediaType = parts[2]; // "gallery", "galleryOriginals", "flashes", "flashSheets", or "homepageFeature"
    const baseName = path.basename(fileName, path.extname(fileName));
    const bucketDir = path.dirname(filePath);
    const uuid = uuidv4();
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `satx-artist-media-${mediaType}-`)
    );
    const tempOriginal = path.join(tempDir, fileName);
    const tempThumb = path.join(tempDir, `${baseName}_thumb.webp`);
    const tempWebp90 = path.join(tempDir, `${baseName}_webp90.webp`);
    const tempFull = path.join(tempDir, `${baseName}_full.jpg`);
    const tempOriginalPreview = path.join(
      tempDir,
      `${baseName}_original_webp90.webp`
    );

    try {
      // Download the uploaded original to a temp directory
      await bucket.file(filePath).download({ destination: tempOriginal });
      const sourceMetadata = await sharp(tempOriginal).metadata();
      const sourceWidth = sourceMetadata.width || null;
      const sourceHeight = sourceMetadata.height || null;
      const sourceMegapixels =
        sourceWidth && sourceHeight
          ? getImageMegapixels(sourceWidth, sourceHeight)
          : null;
      const sourceFileSizeBytes = getStorageObjectSizeBytes(event.data.size);

      if (mediaType === "galleryOriginals") {
        let snapshot = await db.collection("gallery").where("fileName", "==", baseName).limit(1).get();
        if (snapshot.empty) {
          snapshot = await db.collection("gallery").where("originalFileName", "==", baseName).limit(1).get();
        }

        if (snapshot.empty) {
          console.warn(`No gallery doc found for original preview ${baseName}`);
          await bucket.file(filePath).delete().catch(() => {
            console.log(`Could not delete orphaned gallery original file: ${filePath}`);
          });
          return;
        }

        const docRef = snapshot.docs[0].ref;
        const docData = snapshot.docs[0].data();

        if (docData.originalWebp90Url || docData.originalPreviewPath) {
          console.log(`Skipping original preview for ${baseName} - already processed.`);
          await bucket.file(filePath).delete().catch(() => {
            console.log(`Could not delete duplicate gallery original file: ${filePath}`);
          });
          return;
        }

        await sharp(tempOriginal)
          .resize({ width: 1080, withoutEnlargement: true })
          .webp({ quality: 90 })
          .toFile(tempOriginalPreview);

        const originalPreviewPath = `${bucketDir}/${baseName}_webp90.webp`;
        await bucket.upload(tempOriginalPreview, {
          destination: originalPreviewPath,
          metadata: { contentType: "image/webp", metadata: { firebaseStorageDownloadTokens: uuid } },
        });

        const originalWebp90Url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
          originalPreviewPath
        )}?alt=media&token=${uuid}`;

        await docRef.update({
          originalWebp90Url,
          originalPreviewPath,
          originalFileName: baseName,
          originalProcessingStatus: "ready",
          originalProcessingError: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await bucket.file(filePath).delete().catch(() => {
          console.log(`Could not delete raw gallery original file: ${filePath}`);
        });

        console.log(`Processed uncropped gallery preview for ${baseName}.`);
        return;
      }

      // Process three image sizes: 300px thumb, 1080px webp, full JPEG
      await sharp(tempOriginal)
        .resize({ width: 300, withoutEnlargement: true })
        .webp({ quality: 70 })
        .toFile(tempThumb);
      await sharp(tempOriginal)
        .resize({ width: 1080, withoutEnlargement: true })
        .webp({ quality: 90 })
        .toFile(tempWebp90);
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

      if (mediaType === "homepageFeature") {
        await bucket.file(filePath).delete().catch(() => {
          console.log(`Could not delete original homepage feature file: ${filePath}`);
        });

        console.log(
          `Processed homepage feature image ${fileName}: ${thumbUrl}, ${webp90Url}, ${fullUrl}.`
        );
        return;
      }

      // Find the Firestore document created by UploadModal using fileName
      let snapshot = await db.collection(mediaType).where("fileName", "==", baseName).limit(1).get();
      if (snapshot.empty && mediaType === "gallery") {
        snapshot = await db.collection("gallery").where("originalFileName", "==", baseName).limit(1).get();
      }

      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        const docData = snapshot.docs[0].data();

        // Skip processing if already done (retry safety)
        if (docData.thumbUrl && docData.webp90Url && docData.fullUrl) {
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
          ...(mediaType === "flashSheets"
            ? {
                sourceWidth,
                sourceHeight,
                sourceMegapixels,
                sourceFileSizeBytes,
              }
            : {}),
          status: "ready",
          processingError: admin.firestore.FieldValue.delete(),
          processingFailedAt: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

      if (mediaType === "gallery" || mediaType === "galleryOriginals") {
        try {
          let snapshot = await db
            .collection("gallery")
            .where("fileName", "==", baseName)
            .limit(1)
            .get();
          if (snapshot.empty) {
            snapshot = await db
              .collection("gallery")
              .where("originalFileName", "==", baseName)
              .limit(1)
              .get();
          }

          if (!snapshot.empty) {
            const docRef = snapshot.docs[0].ref;
            const docData = snapshot.docs[0].data();

            if (mediaType === "galleryOriginals") {
              if (!docData.originalWebp90Url) {
                await docRef.set(
                  {
                    originalProcessingStatus: "failed",
                    originalProcessingError: "original_preview_failed",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  },
                  { merge: true }
                );
              }
            } else if (
              !(docData.thumbUrl && docData.webp90Url && docData.fullUrl)
            ) {
              await docRef.set(
                {
                  status: "failed",
                  processingError: "image_processing_failed",
                  processingFailedAt:
                    admin.firestore.FieldValue.serverTimestamp(),
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true }
              );
            }
          }
        } catch (statusError) {
          console.error(
            `Could not record processing failure for ${filePath}:`,
            statusError
          );
        }

        const failedAssetPaths =
          mediaType === "gallery"
            ? [
                filePath,
                `${bucketDir}/${baseName}_thumb.webp`,
                `${bucketDir}/${baseName}_webp90.webp`,
                `${bucketDir}/${baseName}_full.jpg`,
              ]
            : [filePath, `${bucketDir}/${baseName}_webp90.webp`];

        await Promise.allSettled(
          failedAssetPaths.map((failedPath) =>
            bucket.file(failedPath).delete({ ignoreNotFound: true })
          )
        );
      }
    } finally {
      // Each invocation owns its directory so concurrent image jobs cannot
      // overwrite or delete one another's Sharp inputs and derivatives.
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch((cleanupError) => {
          console.warn(
            `Could not clean temp directory ${tempDir}:`,
            cleanupError
          );
        });
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
      description,
      tags,
      repeatability,
      publicationStatus,
    } = (req.data || {}) as {
      sheetId?: string;
      crop?: CropAreaInput;
      title?: string;
      price?: number | null;
      description?: string | null;
      tags?: string[];
      repeatability?: FlashRepeatability;
      publicationStatus?: FlashPublicationStatus;
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
      sharp(cropped)
        .resize({ width: 300, withoutEnlargement: true })
        .webp({ quality: 70 })
        .toBuffer(),
      sharp(cropped)
        .resize({ width: 1080, withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer(),
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
    const normalizedRepeatability =
      repeatability === "one_of_one" || repeatability === "repeatable"
        ? repeatability
        : sheet.repeatabilityDefault === "one_of_one"
        ? "one_of_one"
        : "repeatable";
    const normalizedPublicationStatus =
      publicationStatus === "draft" ? "draft" : "published";
    if (normalizedPrice === null || normalizedPrice <= 0) {
      throw new HttpsError(
        "invalid-argument",
        normalizedPublicationStatus === "draft"
          ? "Add a price before saving this draft."
          : "Add a price before publishing marketplace flash."
      );
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    const titleValue =
      typeof title === "string" && title.trim() ? title.trim() : null;
    const descriptionValue = normalizeFlashDescription(description);
    const tagsValue = Array.isArray(tags)
      ? tags.filter((tag) => typeof tag === "string")
      : [];

    const flashRef = await db.collection("flashes").add({
      artistId: uid,
      fileName: baseName,
      sheetId,
      title: titleValue,
      description: descriptionValue,
      price: normalizedPrice,
      tags: tagsValue,
      fullUrl,
      thumbUrl,
      webp90Url,
      thumbPath,
      previewPath,
      fullPath,
      isFromSheet: true,
      isAvailable: true,
      repeatability: normalizedRepeatability,
      availabilityStatus: "available",
      artistStripeConnectReady: true,
      marketplaceVisible: normalizedPublicationStatus === "published",
      publicationStatus: normalizedPublicationStatus,
      status: "ready",
      createdAt: now,
      ...(normalizedPublicationStatus === "published" ? { publishedAt: now } : {}),
    });

    return {
      id: flashRef.id,
      artistId: uid,
      fileName: baseName,
      sheetId,
      title: titleValue,
      description: descriptionValue,
      price: normalizedPrice,
      tags: tagsValue,
      fullUrl,
      thumbUrl,
      webp90Url,
      thumbPath,
      previewPath,
      fullPath,
      isFromSheet: true,
      isAvailable: true,
      repeatability: normalizedRepeatability,
      availabilityStatus: "available",
      artistStripeConnectReady: true,
      marketplaceVisible: normalizedPublicationStatus === "published",
      publicationStatus: normalizedPublicationStatus,
      status: "ready",
    };
  }
);

const publishFlashDrafts = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to publish flash drafts.");
    }

    const { sheetId, flashIds } = (req.data || {}) as {
      sheetId?: string;
      flashIds?: unknown;
    };

    if (!sheetId || !Array.isArray(flashIds) || flashIds.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "A sheet and at least one flash draft are required."
      );
    }

    const uniqueFlashIds = Array.from(
      new Set(
        flashIds.filter(
          (id): id is string => typeof id === "string" && Boolean(id)
        )
      )
    );

    if (uniqueFlashIds.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "At least one valid flash draft is required."
      );
    }

    if (uniqueFlashIds.length > 100) {
      throw new HttpsError(
        "invalid-argument",
        "Publish up to 100 flash drafts at a time."
      );
    }

    const sheetRef = db.collection("flashSheets").doc(sheetId);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
      const sheetSnap = await transaction.get(sheetRef);
      if (!sheetSnap.exists) {
        throw new HttpsError("not-found", "Flash sheet not found.");
      }

      const sheet = sheetSnap.data() || {};
      if (sheet.artistId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "You can only publish drafts from your sheets."
        );
      }

      const flashRefs = uniqueFlashIds.map((flashId) =>
        db.collection("flashes").doc(flashId)
      );
      const flashSnaps = await Promise.all(
        flashRefs.map((flashRef) => transaction.get(flashRef))
      );

      flashSnaps.forEach((flashSnap, index) => {
        if (!flashSnap.exists) {
          throw new HttpsError("not-found", "Flash draft not found.");
        }

        const flash = flashSnap.data() || {};
        if (flash.artistId !== uid || flash.sheetId !== sheetId) {
          throw new HttpsError(
            "permission-denied",
            "You can only publish your own flash drafts."
          );
        }

        if (getFlashPublicationStatus(flash) !== "draft") {
          throw new HttpsError(
            "failed-precondition",
            "Only unpublished draft flash can be published."
          );
        }

        if (getFlashAvailabilityStatus(flash) !== "available") {
          throw new HttpsError(
            "failed-precondition",
            "Held or sold flash cannot be published as a draft."
          );
        }

        if (!hasValidMarketplacePrice(flash)) {
          throw new HttpsError(
            "failed-precondition",
            "Add a price before publishing marketplace flash."
          );
        }

        transaction.update(flashRefs[index], {
          publicationStatus: "published",
          marketplaceVisible: true,
          isAvailable: true,
          availabilityStatus: "available",
          publishedAt: timestamp,
          updatedAt: timestamp,
        });
      });
    });

    return { publishedCount: uniqueFlashIds.length };
  }
);

const discardFlashDraft = onCall(
  { cors: true, region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to discard flash drafts.");
    }

    const { flashId, sheetId } = (req.data || {}) as {
      flashId?: string;
      sheetId?: string;
    };

    if (!flashId) {
      throw new HttpsError("invalid-argument", "A flash draft is required.");
    }

    const flashRef = db.collection("flashes").doc(flashId);
    let storagePaths: string[] = [];

    await db.runTransaction(async (transaction) => {
      const flashSnap = await transaction.get(flashRef);
      if (!flashSnap.exists) {
        throw new HttpsError("not-found", "Flash draft not found.");
      }

      const flash = flashSnap.data() || {};
      if (flash.artistId !== uid || (sheetId && flash.sheetId !== sheetId)) {
        throw new HttpsError(
          "permission-denied",
          "You can only discard your own flash drafts."
        );
      }

      if (getFlashPublicationStatus(flash) !== "draft") {
        throw new HttpsError(
          "failed-precondition",
          "Only unpublished draft flash can be discarded."
        );
      }

      if (getFlashAvailabilityStatus(flash) !== "available") {
        throw new HttpsError(
          "failed-precondition",
          "Held or sold flash cannot be discarded as a draft."
        );
      }

      storagePaths = [flash.thumbPath, flash.previewPath, flash.fullPath].filter(
        (path): path is string => typeof path === "string" && Boolean(path)
      );

      transaction.delete(flashRef);
    });

    await Promise.all(
      storagePaths.map((storagePath) =>
        bucket.file(storagePath).delete({ ignoreNotFound: true })
      )
    );

    return { discarded: true };
  }
);

const syncFlashMarketplaceProjection = onDocumentWritten(
  { document: "flashes/{flashId}", region: "us-central1" },
  async (event) => {
    await syncMarketplaceProjectionDocument({
      kind: "flash",
      before: event.data?.before.exists
        ? (event.data.before as admin.firestore.QueryDocumentSnapshot)
        : undefined,
      after: event.data?.after.exists
        ? (event.data.after as admin.firestore.QueryDocumentSnapshot)
        : undefined,
    });
  }
);

const syncFlashSheetMarketplaceProjection = onDocumentWritten(
  { document: "flashSheets/{sheetId}", region: "us-central1" },
  async (event) => {
    await syncMarketplaceProjectionDocument({
      kind: "sheet",
      before: event.data?.before.exists
        ? (event.data.before as admin.firestore.QueryDocumentSnapshot)
        : undefined,
      after: event.data?.after.exists
        ? (event.data.after as admin.firestore.QueryDocumentSnapshot)
        : undefined,
    });
  }
);

const hasArtistMarketplaceProjectionChange = (
  before: admin.firestore.DocumentData | undefined,
  after: admin.firestore.DocumentData | undefined
) => {
  if (!before && !after) return false;

  const publicFields = [
    "name",
    "displayName",
    "avatarUrl",
    "avatar",
    "photoURL",
    "studioName",
    "shopName",
    "role",
  ];

  if (
    publicFields.some(
      (field) => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after?.[field] ?? null)
    )
  ) {
    return true;
  }

  return (
    isStripeConnectReadyForMarketplace(before) !==
    isStripeConnectReadyForMarketplace(after)
  );
};

const updateArtistMarketplaceItems = async (
  artistId: string,
  artist: admin.firestore.DocumentData | null | undefined
) => {
  const [flashSnapshot, sheetSnapshot] = await Promise.all([
    db.collection("flashes").where("artistId", "==", artistId).get(),
    db.collection("flashSheets").where("artistId", "==", artistId).get(),
  ]);
  let batch = db.batch();
  let writeCount = 0;
  let updatedFlashes = 0;
  let updatedSheets = 0;

  const commitIfNeeded = async () => {
    if (writeCount === 0) return;
    await batch.commit();
    batch = db.batch();
    writeCount = 0;
  };

  for (const flashDoc of flashSnapshot.docs) {
    const projection = buildFlashMarketplaceProjectionFromArtist(
      flashDoc.data(),
      artist
    );
    if (!projectionMatches(flashDoc.data(), projection)) {
      batch.update(flashDoc.ref, getProjectionUpdate(projection));
      writeCount += 1;
      updatedFlashes += 1;
    }
    if (writeCount >= MARKETPLACE_BATCH_LIMIT) await commitIfNeeded();
  }

  for (const sheetDoc of sheetSnapshot.docs) {
    const projection = buildSheetMarketplaceProjectionFromArtist(
      sheetDoc.data(),
      artist
    );
    if (!projectionMatches(sheetDoc.data(), projection)) {
      batch.update(sheetDoc.ref, getProjectionUpdate(projection));
      writeCount += 1;
      updatedSheets += 1;
    }
    if (writeCount >= MARKETPLACE_BATCH_LIMIT) await commitIfNeeded();
  }

  await commitIfNeeded();
  return { updatedFlashes, updatedSheets };
};

const syncArtistMarketplaceProjection = onDocumentWritten(
  { document: "users/{uid}", region: "us-central1" },
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : undefined;
    const after = event.data?.after.exists ? event.data.after.data() : undefined;
    if (!hasArtistMarketplaceProjectionChange(before, after)) return;

    const result = await updateArtistMarketplaceItems(
      event.params.uid,
      after || null
    );
    logger.info("Synced artist marketplace projection.", {
      artistId: event.params.uid,
      ...result,
    });
  }
);

const rebuildMarketplaceProjectionDocuments = async () => {
  const [flashSnapshot, sheetSnapshot] = await Promise.all([
    db.collection("flashes").get(),
    db.collection("flashSheets").get(),
  ]);
  const artistsById = new Map<string, admin.firestore.DocumentData | null>();
  let batch = db.batch();
  let writeCount = 0;
  let updatedFlashes = 0;
  let updatedSheets = 0;

  const getArtistForProjection = async (artistId: string) => {
    if (!artistId) return null;
    if (artistsById.has(artistId)) return artistsById.get(artistId) || null;
    const artist = await getMarketplaceArtist(artistId);
    artistsById.set(artistId, artist);
    return artist;
  };

  const commitIfNeeded = async () => {
    if (writeCount === 0) return;
    await batch.commit();
    batch = db.batch();
    writeCount = 0;
  };

  for (const flashDoc of flashSnapshot.docs) {
    const data = flashDoc.data();
    const projection = buildFlashMarketplaceProjectionFromArtist(
      data,
      await getArtistForProjection(getFirstString(data.artistId))
    );
    if (!projectionMatches(data, projection)) {
      batch.update(flashDoc.ref, getProjectionUpdate(projection));
      writeCount += 1;
      updatedFlashes += 1;
    }
    if (writeCount >= MARKETPLACE_BATCH_LIMIT) await commitIfNeeded();
  }

  for (const sheetDoc of sheetSnapshot.docs) {
    const data = sheetDoc.data();
    const projection = buildSheetMarketplaceProjectionFromArtist(
      data,
      await getArtistForProjection(getFirstString(data.artistId))
    );
    if (!projectionMatches(data, projection)) {
      batch.update(sheetDoc.ref, getProjectionUpdate(projection));
      writeCount += 1;
      updatedSheets += 1;
    }
    if (writeCount >= MARKETPLACE_BATCH_LIMIT) await commitIfNeeded();
  }

  await commitIfNeeded();

  return {
    scannedFlashes: flashSnapshot.size,
    scannedSheets: sheetSnapshot.size,
    updatedFlashes,
    updatedSheets,
  };
};

const markMarketplaceProjectionReady = async (
  result: Awaited<ReturnType<typeof rebuildMarketplaceProjectionDocuments>>
) => {
  await MARKETPLACE_METADATA_REF.set(
    {
      projectionVersion: MARKETPLACE_PROJECTION_VERSION,
      projectionState: "ready",
      projectionCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      projectionLeaseUntil: admin.firestore.FieldValue.delete(),
      projectionLastResult: result,
    },
    { merge: true }
  );
};

const rebuildMarketplaceProjection = onCall(
  { cors: true, region: "us-central1", timeoutSeconds: 540, memory: "1GiB" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in as an admin to rebuild marketplace projections.");
    }

    const adminSnap = await db.collection("users").doc(uid).get();
    if (adminSnap.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Only admins can rebuild marketplace projections.");
    }

    const result = await rebuildMarketplaceProjectionDocuments();
    await markMarketplaceProjectionReady(result);
    return result;
  }
);

const ensureMarketplaceProjection = onCall(
  { cors: true, region: "us-central1", timeoutSeconds: 540, memory: "1GiB" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to prepare the flash marketplace."
      );
    }

    const leaseState = await db.runTransaction(async (transaction) => {
      const metadataSnap = await transaction.get(MARKETPLACE_METADATA_REF);
      const metadata = metadataSnap.data() || {};
      if (Number(metadata.projectionVersion || 0) >= MARKETPLACE_PROJECTION_VERSION) {
        return "ready" as const;
      }

      const leaseUntil = toMillis(metadata.projectionLeaseUntil);
      if (metadata.projectionState === "running" && leaseUntil > Date.now()) {
        return "running" as const;
      }

      transaction.set(
        MARKETPLACE_METADATA_REF,
        {
          projectionState: "running",
          projectionStartedAt: admin.firestore.FieldValue.serverTimestamp(),
          projectionLeaseUntil: admin.firestore.Timestamp.fromMillis(
            Date.now() + MARKETPLACE_PROJECTION_LEASE_MS
          ),
        },
        { merge: true }
      );
      return "acquired" as const;
    });

    if (leaseState === "ready") {
      return { status: "ready", projectionVersion: MARKETPLACE_PROJECTION_VERSION };
    }
    if (leaseState === "running") {
      return { status: "running", projectionVersion: MARKETPLACE_PROJECTION_VERSION };
    }

    try {
      const result = await rebuildMarketplaceProjectionDocuments();
      await markMarketplaceProjectionReady(result);
      logger.info("Rebuilt legacy flash marketplace projections.", {
        requestedBy: uid,
        projectionVersion: MARKETPLACE_PROJECTION_VERSION,
        ...result,
      });
      return {
        status: "rebuilt",
        projectionVersion: MARKETPLACE_PROJECTION_VERSION,
        ...result,
      };
    } catch (error) {
      await MARKETPLACE_METADATA_REF.set(
        {
          projectionState: "failed",
          projectionLeaseUntil: admin.firestore.FieldValue.delete(),
          projectionFailedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      throw error;
    }
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

const deleteStoragePathIfPresent = async (storagePath: string) => {
  try {
    await bucket.file(storagePath).delete();
    return true;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? Number((error as { code?: unknown }).code)
        : null;

    if (code === 404) return false;
    throw error;
  }
};

const cleanupBookingRequestReferences = onSchedule("every 24 hours", async () => {
  const firestore = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const snapshot = await firestore
    .collection("bookingRequests")
    .where("referenceCleanupAt", "<=", now)
    .limit(BOOKING_REFERENCE_CLEANUP_BATCH_LIMIT)
    .get();

  if (snapshot.empty) {
    console.log("No booking request reference images eligible for cleanup.");
    return;
  }

  let cleanedRequests = 0;
  let deletedFiles = 0;
  let missingFiles = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() || {};

    if (data.referencesDeletedAt) {
      await docSnap.ref.update({
        referenceCleanupAt: admin.firestore.FieldValue.delete(),
      });
      continue;
    }

    const storagePaths = collectBookingReferenceStoragePaths(data);

    for (const storagePath of storagePaths) {
      const deleted = await deleteStoragePathIfPresent(storagePath);
      if (deleted) {
        deletedFiles += 1;
      } else {
        missingFiles += 1;
      }
    }

    await docSnap.ref.set(
      {
        fullUrl: admin.firestore.FieldValue.delete(),
        thumbUrl: admin.firestore.FieldValue.delete(),
        fullPath: admin.firestore.FieldValue.delete(),
        thumbPath: admin.firestore.FieldValue.delete(),
        referenceImages: [],
        referenceCleanupAt: admin.firestore.FieldValue.delete(),
        referenceImageCountAtCleanup: Array.isArray(data.referenceImages)
          ? data.referenceImages.length
          : storagePaths.length > 0
          ? 1
          : 0,
        referenceStoragePathsAtCleanup: storagePaths,
        referencesDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    cleanedRequests += 1;
  }

  console.log(
    `Cleaned ${cleanedRequests} booking request reference set(s); deleted ${deletedFiles} file(s), ${missingFiles} already missing.`
  );
});

const cleanupExpiredFlashHolds = onSchedule("every 15 minutes", async () => {
  const firestore = admin.firestore();
  const snapshot = await firestore
    .collection("flashes")
    .where("availabilityStatus", "==", "held")
    .get();

  if (snapshot.empty) {
    console.log("No expired flash holds to release.");
    return;
  }

  const batches: FirebaseFirestore.WriteBatch[] = [];
  let batch = firestore.batch();
  let writeCount = 0;
  let releasedCount = 0;

  snapshot.docs.forEach((docSnap) => {
    const flash = docSnap.data() || {};
    if (getFlashRepeatability(flash) !== "one_of_one") return;
    if (!isHeldUntilExpired(flash.heldUntil)) return;

    if (writeCount >= 450) {
      batches.push(batch);
      batch = firestore.batch();
      writeCount = 0;
    }

    batch.update(docSnap.ref, getFlashHoldReleaseUpdate());
    writeCount += 1;
    releasedCount += 1;
  });

  if (releasedCount > 0) {
    batches.push(batch);
    await Promise.all(batches.map((batchToCommit) => batchToCommit.commit()));
  }

  console.log(`Released ${releasedCount} expired one-of-one flash holds.`);
});





module.exports = {
  handleImageUpload,
  syncBookingRequestReferenceRetention,
  processAvatar,
  handleOfferImageUpload,
  createStripeConnectAccount,
  createStripeConnectOnboardingLink,
  getStripeConnectStatus,
  createStripeDashboardLoginLink,
  createFlashRequest,
  acceptFlashOffer,
  acceptProjectOffer,
  createCheckoutSession,
  proposeProjectAmendment,
  respondToProjectAmendment,
  prepareProjectSessionPayment,
  scheduleProjectSession,
  setProjectPaused,
  startProjectSession,
  completeProjectSession,
  addProjectSessionPhoto,
  startFlashAppointment,
  completeFlashAppointment,
  recordFlashBalancePaidAtShop,
  addFlashAppointmentPhoto,
  selectSessionBalanceMethod,
  attestExternalSessionPayment,
  syncBookingPaymentStatus,
  stripeWebhook,
  processArtistMedia,
  cropFlashFromSheet,
  publishFlashDrafts,
  discardFlashDraft,
  syncFlashMarketplaceProjection,
  syncFlashSheetMarketplaceProjection,
  syncArtistMarketplaceProjection,
  rebuildMarketplaceProjection,
  ensureMarketplaceProjection,
  cleanupProcessedEvents,
  cleanupBookingRequestReferences,
  cleanupExpiredFlashHolds,
  ...transactionalEmail,
};
 
