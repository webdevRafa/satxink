// functions/src/stripeWebhooks.ts
import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

export const handleStripeWebhook = onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = 'your-stripe-webhook-secret';

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig as string, endpointSecret);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed.', err);
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    const {
      offerId,
      clientId,
      artistId,
    } = session.metadata || {};

    const firestore = admin.firestore();

    // Update booking status to "paid"
    const snapshot = await firestore
      .collection('bookings')
      .where('offerId', '==', offerId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const bookingRef = snapshot.docs[0].ref;
      await bookingRef.update({ status: 'paid' });
    }

    console.log(`Received payment for offer ${offerId} by client ${clientId} and artist ${artistId}`);

  }

  res.status(200).json({ received: true });
});
