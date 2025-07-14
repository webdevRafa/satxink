// functions/src/index.ts
import type { CheckoutRequestData } from '../src/types/StripeCheckout';


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

// Bump memory + timeout for big HEICs
setGlobalOptions({ memory: '1GiB', timeoutSeconds: 120 });

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');




/**
 * One universal trigger for:
 * • portfolio uploads
 * • flash-sheet uploads
 * • client booking-request reference images
 */
const handleImageUpload = onObjectFinalized(async (event) => {
  const object      = event.data;
  const filePath    = object.name ?? '';          // e.g. users/UID/portfolio/originals/img.heic
  const contentType = object.contentType ?? '';

  // Ignore anything that isn’t an image
  if (!contentType.startsWith('image/')) return;

  /* ------------------------------------------------------------------ */
  /* 1.  Identify which bucket-subfolder was hit                         */
  /* ------------------------------------------------------------------ */
  const parts   = filePath.split('/');            // ['users','UID','portfolio','originals','foo.heic']
  const [root]  = parts;                          // 'users' | 'bookingRequests'
  let userId    = '';
  let requestId = '';
  let category: 'portfolio' | 'flashes' | 'bookingRequests' | 'offers' | null = null;

  if (
    root === 'users' &&
    (parts[2] === 'portfolio' || parts[2] === 'flashes') &&
    parts[3] === 'originals'
  ) {
    // users/{uid}/{category}/originals/{file}
    userId   = parts[1];
    category = parts[2] as 'portfolio' | 'flashes';
  } else if (root === 'bookingRequests' && parts[2] === 'originals') {
    // bookingRequests/{reqId}/originals/{file}
    requestId = parts[1];
    category  = 'bookingRequests';
  } else if (root === 'offers' && parts.length === 3) {
    userId = parts[1];
    category = 'offers';
  } else {
    return;
  }

  /* ------------------------------------------------------------------ */
  /* 2.  Download the raw upload to /tmp                                */
  /* ------------------------------------------------------------------ */
  const fileName = path.basename(filePath);        // foo.heic
  const tmpLocal = path.join(os.tmpdir(), fileName);
  await bucket.file(filePath).download({ destination: tmpLocal });

  /* ------------------------------------------------------------------ */
  /* 3.  Build FULL-res JPG & 300-px WebP THUMB                         */
  /* ------------------------------------------------------------------ */
  const isHeic = contentType === 'image/heic' || fileName.toLowerCase().endsWith('.heic');

  // 90 quality for artists, 80 for booking-request refs
  const fullJpegQuality = category === 'bookingRequests' ? 80 : 90;

  const inputBuffer = isHeic
    ? await sharp(tmpLocal).jpeg({ quality: fullJpegQuality }).toBuffer()
    : await sharp(tmpLocal)
        .jpeg({ quality: fullJpegQuality, mozjpeg: true })
        .toBuffer();

  const baseName = path.parse(fileName).name;      // foo

  let fullResPath = '';
  let thumbPath   = '';

  if (category === 'bookingRequests') {
    fullResPath = `bookingRequests/${requestId}/full/${baseName}.jpg`;
    thumbPath   = `bookingRequests/${requestId}/thumbs/${baseName}.webp`;
  } else {
    // portfolio | flashes
    fullResPath = `users/${userId}/${category}/full/${baseName}.jpg`;
    thumbPath   = `users/${userId}/${category}/thumbs/${baseName}.webp`;
  }

  // Save full-res JPG
  await bucket.file(fullResPath).save(inputBuffer, {
    metadata: {
      contentType: "image/jpeg",
      metadata: {
        firebaseStorageDownloadTokens: uuidv4(),
      },
    },
  });

  // Create & save 300-px WebP thumbnail
  const thumbBuffer = await sharp(inputBuffer)
    .resize({ width: 300 })
    .webp({ quality: 80 })
    .toBuffer();

    await bucket.file(thumbPath).save(thumbBuffer, {
      metadata: {
        contentType: "image/webp",
        metadata: {
          firebaseStorageDownloadTokens: uuidv4(),
        },
      },
    });
    const [fullDownloadUrl] = await bucket.file(fullResPath).getSignedUrl({
      action: 'read',
      expires: '03-01-2030', // pick your expiration
    });
    
    const [thumbDownloadUrl] = await bucket.file(thumbPath).getSignedUrl({
      action: 'read',
      expires: '03-01-2030',
    });

  /* ------------------------------------------------------------------ */
  /* 4.  Clean up                                                       */
  /* ------------------------------------------------------------------ */
  await bucket.file(filePath).delete().catch(() => {}); // delete raw
  await fs.unlink(tmpLocal).catch(() => {});            // delete /tmp copy

  /* ------------------------------------------------------------------ */
  /* 5.  Write URLs back to Firestore                                   */
  /* ------------------------------------------------------------------ */
  const fullUrl = fullDownloadUrl;
  const thumbUrl = thumbDownloadUrl;
  const firestore = admin.firestore();

  if (category === 'bookingRequests') {
    await firestore
      .collection('bookingRequests')
      .doc(requestId)
      .set(
        {
          fullUrl,
          thumbUrl,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } else {
    await firestore
      .collection('users')
      .doc(userId)
      .collection(category) // 'portfolio' | 'flashes'
      .doc(baseName)
      .set(
        {
          fullUrl,
          thumbUrl,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      // ⬇️ add THIS block right below
      if (category === 'portfolio') {
        await firestore
          .collection('users')
          .doc(userId)
          .update({
            portfolioUrls: admin.firestore.FieldValue.arrayUnion(fullUrl),
          });
      }
  }
});
const processAvatar = onObjectFinalized(async (event) => {
  const object = event.data;
  const filePath = object.name;

  if (!filePath || (!filePath.startsWith('users/') && !filePath.startsWith('tempAvatars/')) || !filePath.includes('avatar-original.jpg')) {
    console.log(`⏭️ Skipping file: ${filePath}`);
    return;
  }


  const bucket = admin.storage().bucket(object.bucket);
  const fileName = path.basename(filePath);
  const tempFilePath = path.join(os.tmpdir(), fileName);
  const uid = filePath.split('/')[1]; // expects: users/{uid}/avatar-original.jpg

  // Download original
  await bucket.file(filePath).download({ destination: tempFilePath });

  // Create avatar.jpg
  const avatarPath = path.join(os.tmpdir(), 'avatar.jpg');
  await sharp(tempFilePath)
    .resize(512, 512)
    .jpeg({ quality: 80 })
    .toFile(avatarPath);

  await bucket.upload(avatarPath, {
    destination: `users/${uid}/avatar.jpg`,
    metadata: { contentType: 'image/jpeg' },
  });

  // Optional: create avatar-thumb.jpg
  const thumbPath = path.join(os.tmpdir(), 'avatar-thumb.jpg');
  await sharp(tempFilePath)
    .resize(128, 128)
    .jpeg({ quality: 70 })
    .toFile(thumbPath);

  await bucket.upload(thumbPath, {
    destination: `users/${uid}/avatar-thumb.jpg`,
    metadata: { contentType: 'image/jpeg' },
  });

  // Cleanup temp files
  await fs.unlink(tempFilePath);
  await fs.unlink(avatarPath);
  await fs.unlink(thumbPath);

  console.log(`✅ Avatar processed for user: ${uid}`);
});

const handleOfferImageUpload = onObjectFinalized(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60 }, // optional settings
  async (event) => {
    const filePath = event.data.name || "";
    const fileName = path.basename(filePath);

    const isOffer = filePath.startsWith("users/") && filePath.includes("/offers/full/");
    if (!isOffer) {
      console.log("Skipping non-offer upload:", filePath);
      return;
    }

    const bucket = admin.storage().bucket(event.data.bucket);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    await bucket.file(filePath).download({ destination: tempFilePath });

    const thumbBuffer = await sharp(tempFilePath)
      .resize(400)
      .jpeg({ quality: 75 })
      .toBuffer();

    const thumbPath = filePath.replace("/offers/full/", "/offers/thumbs/");
    const thumbFile = bucket.file(thumbPath);
    await thumbFile.save(thumbBuffer, {
      metadata: { contentType: "image/jpeg" },
    });

    const [fullUrl] = await bucket.file(filePath).getSignedUrl({
      action: "read",
      expires: "03-01-2030",
    });

    const [thumbUrl] = await thumbFile.getSignedUrl({
      action: "read",
      expires: "03-01-2030",
    });

    const offersRef = admin.firestore().collection("offers");
    const snapshot = await offersRef
      .where("imageFilename", "==", fileName)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.warn("⚠️ No offer document found for:", fileName);
      return;
    }

    const offerRef = snapshot.docs[0].ref;
    await offerRef.update({ fullUrl, thumbUrl });

    await fs.unlink(tempFilePath);
    console.log(`✅ Offer doc updated with fullUrl + thumbUrl for: ${fileName}`);
  }
);

const createCheckoutSession = onCall({ cors: true, region: "us-central1", secrets: [STRIPE_SECRET_KEY] }, async (req) => {

  const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

  const stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
    apiVersion: '2023-10-16' as any,
  });

  try {
    const data = req.data as CheckoutRequestData;

    const {
      offerId,
      clientId,
      artistId,
      price,
      displayName,
      artistAvatar,
      shopName,
      shopAddress,
      selectedDate,
      bookingId,
    } = data;
    
    let formattedDateTime = '';

    if (selectedDate?.date && selectedDate?.time) {
      const combinedDateTime = new Date(`${selectedDate.date}T${selectedDate.time}`);
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
            unit_amount: price * 100, // Convert dollars to cents
            product_data: {
              name: `${displayName}'s Tattoo Offer`,
              description: `Studio: ${shopName || 'N/A'} | Address: ${shopAddress || 'N/A'} | Date: ${selectedDate?.date} at ${selectedDate?.time}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        offerId: offerId ?? '',
        bookingId: bookingId ?? "",
        clientId: clientId ?? '',
        artistId: artistId ?? '',
        artistAvatar: artistAvatar ?? '', // convert to string explicitly
        displayName: displayName ?? '',
        shopName: shopName ?? '',
        shopAddress: shopAddress ?? '',
        selectedDate: formattedDateTime ?? '',
      },
      success_url: 'http://localhost:5173/success',
      cancel_url: 'http://localhost:5173/cancel',
    });

    return { sessionUrl: session.url };
  } catch (error) {
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
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
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

    // ✅ handle event
    if (event.type === 'checkout.session.completed') {
      // Your logic here
    }

    res.status(200).json({ received: true });
  }
);

module.exports = {
  handleImageUpload,
  processAvatar,
  handleOfferImageUpload,
  createCheckoutSession,
  stripeWebhook,
};
 