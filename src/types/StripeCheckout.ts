export interface CheckoutRequestData {
  bookingId: string;
  successUrl?: string;
  cancelUrl?: string;
  paymentMode?: "deposit" | "full" | "remaining";
  sessionPaymentAmountCents?: number;

  // Legacy fields are still accepted by older callers, but the function now
  // reads booking/payment details from Firestore before creating Checkout.
  offerId?: string;
  clientId?: string;
  artistId?: string;
  price?: number;
  displayName?: string;
  artistAvatar?: string;
  shopName?: string;
  shopAddress?: string;
  fullUrl?: string;
  selectedDate?: {
    date: string;
    time: string;
  };
}

export type StripeConnectStatus = {
  accountId?: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingComplete: boolean;
  disabledReason?: string | null;
};
  
