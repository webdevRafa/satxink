# Stripe Connect Production Checklist

This note captures the current Stripe Connect production plan for SATX Ink.

## Current Understanding

- Stripe Connect is already functioning in test mode for artist onboarding, Stripe account connection, and publishing flash.
- Current connected artist accounts are dummy/test accounts only.
- No real artists should be onboarded until production Stripe keys are set in Firebase and Functions are redeployed.
- Once production is ready, real artists should onboard fresh through live Stripe Connect.

## Code Shape

- Stripe runs server-side through Firebase Functions.
- The app does not currently use a frontend Stripe publishable key.
- Functions read Stripe secrets from Firebase Secret Manager:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- Connected account IDs are stored on artist user documents under `stripeConnect.accountId`.
- Checkout for artist payments uses connected accounts via `stripeAccount: connectedAccountId`.
- Webhooks are handled by the `stripeWebhook` Firebase Function.

## Production Steps

1. Create or confirm the live Stripe Connect platform setup in Stripe.
2. Set the live Stripe secret key in Firebase:

   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   ```

3. Create a live Stripe webhook endpoint for the deployed webhook URL.
4. Configure the webhook to receive the needed Checkout events, especially:
   - `checkout.session.completed`
   - `checkout.session.expired`

5. Make sure the webhook is configured for connected-account events if direct charges on connected accounts are used.
6. Set the live webhook signing secret in Firebase:

   ```bash
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```

7. Redeploy Firebase Functions after changing secrets:

   ```bash
   firebase deploy --only functions
   ```

8. After deployment, onboard real artists through the live Stripe Connect flow.
9. Confirm a full live-mode payment flow with a small real transaction before opening the platform broadly.

## Important Launch Notes

- Test-mode connected account IDs cannot be reused in live mode.
- Because no real artists are currently using the platform, there is no need to migrate existing Stripe Connect accounts.
- If any dummy/test `stripeConnect` records remain in the production Firestore project, clear them before onboarding real artists.
- Firebase Functions must be redeployed after changing referenced secrets, otherwise deployed functions may continue using previous secret versions.

