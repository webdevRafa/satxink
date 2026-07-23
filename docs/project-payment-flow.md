# Protected custom-project payments

## Payment model

New custom offers use payment model version 2:

- The artist enters a total quote, estimated session count, and one deposit amount used for each session.
- The quote is split evenly in integer cents. Any remainder cents are assigned to the earliest sessions.
- A session deposit must be greater than zero and cannot exceed 50% of the smallest session allocation.
- The first session deposit is the only artist payment collected when the offer is accepted.
- The SATX Ink fee is 10% of the full quote, with a $5 minimum and $10 maximum. It is collected with the first deposit.
- A session's remaining balance becomes due only after the artist marks that session complete.
- The client can settle that exact balance through Stripe or at the shop.
- An at-shop payment changes the ledger only after the artist and client independently confirm it.
- The next session can be scheduled only after the prior session balance is settled. Scheduling makes that next session's fixed deposit due.

Accepted offers create an immutable allocation snapshot on the booking and one ledger document per session under:

`bookingSessions/{bookingId}/sessions/session-{number}`

Confirmed Stripe and at-shop payments are recorded under:

`bookings/{bookingId}/payments/{paymentId}`

Client and artist applications can read these records. Only trusted Admin SDK code can write version-2 booking financial state.

## Stripe idempotency

No new Stripe Dashboard key or secret is required.

The Cloud Function sends Stripe's `idempotencyKey` request option when it creates Checkout. The key is derived from:

`booking + session number + payment purpose + checkout attempt`

This prevents rapid retries or double-clicks from creating duplicate Checkout Sessions. When Stripe reports `checkout.session.expired`, the session ledger increments its attempt number so a later retry receives a new idempotency key.

The existing secrets remain:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

The webhook must receive:

- `checkout.session.completed`
- `checkout.session.expired`

Because artist payments are created on connected accounts, the Stripe webhook destination must continue receiving events from connected accounts. No additional event type is introduced by this implementation.

## Required Firebase deployment

The frontend deployment alone does not publish the new callable functions or security rules. From the repository root, deploy both after the branch is merged or selected:

```bash
npx firebase-tools deploy --only functions,firestore:rules
```

The repository rules preserve legacy participant updates for existing version-1 bookings. Version-2 financial fields, session ledgers, and payment records are server-authoritative.

## Operational verification

Before production:

1. Accept an $800, two-session offer with a $200 session deposit.
2. Confirm the first Checkout collects $200 for the artist, the one-time capped platform fee, and Stripe processing.
3. Start and complete session 1; confirm exactly $200 becomes due.
4. Test the Stripe balance path and verify the payment ledger advances the project to session 2.
5. Repeat with payment at the shop; verify one confirmation leaves the payment pending and the second confirmation settles it.
6. Schedule session 2 and verify only its $200 deposit can be paid before the appointment.
7. Complete and settle session 2; verify the booking and project become paid/completed with a zero outstanding balance.
