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
const PLATFORM_FEE_CENTS = 1000;
const MIN_ARTIST_PAYOUT_CENTS = 100;
const DEFAULT_APP_URL = "https://satxink.com";




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
    apiVersion: '2023-10-16' as any,
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
    if (artist.role !== "artist") {
      throw new HttpsError("permission-denied", "Only artists can connect payouts.");
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

    if (artist.role !== "artist") {
      throw new HttpsError("permission-denied", "Only artists can connect payouts.");
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

    const amount = Number(booking.depositAmount || booking.price || 0);
    const amountCents = Math.round(amount * 100);

    if (!Number.isFinite(amountCents) || amountCents <= PLATFORM_FEE_CENTS) {
      throw new HttpsError(
        "failed-precondition",
        "The payment amount must be greater than the SATX Ink platform fee."
      );
    }

    const applicationFeeAmount = PLATFORM_FEE_CENTS;
    const artistPayoutCents = amountCents - applicationFeeAmount;

    if (artistPayoutCents < MIN_ARTIST_PAYOUT_CENTS) {
      throw new HttpsError(
        "failed-precondition",
        "The artist payout would be too small after the platform fee."
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

    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: `${booking.artistName || artist.displayName || "Artist"}'s Tattoo Booking`,
              description: `Studio: ${booking.shopName || 'N/A'} | Address: ${booking.shopAddress || 'N/A'} | Date: ${booking.selectedDate?.date || "TBD"} at ${booking.selectedDate?.time || "TBD"}`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        metadata: {
          bookingId,
          artistId: booking.artistId ?? '',
          clientId: booking.clientId ?? '',
          platformFeeCents: String(applicationFeeAmount),
        },
      },
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
        platformFeeCents: String(applicationFeeAmount),
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
        platformFeeAmount: applicationFeeAmount / 100,
        platformFeeCents: applicationFeeAmount,
        artistPayoutAmount: artistPayoutCents / 100,
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
 

const stripeWebhook = onRequest(
  {
    region: 'us-central1',
    secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  },
  async (req: any, res: any): Promise<void> => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
      apiVersion: '2023-10-16' as any,
    });

    const sig = req.headers['stripe-signature'] as string;
    const endpointSecret = STRIPE_WEBHOOK_SECRET.value();

    let event;

    try {
      const rawBody = (req as any).rawBody;
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } catch (err: any) {
      console.error('❌ Webhook verification failed:', err);
      res.status(400).send(`Webhook Error: ${err.message}`);
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
      const bookingId = session.metadata?.bookingId;

      if (!bookingId) {
        console.warn("Missing bookingId in session metadata.");
        res.status(400).send("Missing bookingId.");
        return;
      }

      try {
        const bookingRef = firestore.collection("bookings").doc(bookingId);

        await bookingRef.update({
          status: "paid",
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: session.payment_intent,
          stripeConnectedAccountId: event.account ?? session.metadata?.stripeConnectedAccountId ?? null,
          platformFeeCents: session.metadata?.platformFeeCents
            ? Number(session.metadata.platformFeeCents)
            : PLATFORM_FEE_CENTS,
        });

        console.log(`Booking ${bookingId} marked as paid.`);
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
  stripeWebhook,
  processArtistMedia,
  cleanupProcessedEvents,
};
 
