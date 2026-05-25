export interface CheckoutRequestData {
  bookingId: string;
  successUrl?: string;
  cancelUrl?: string;
  paymentMode?: "deposit" | "full" | "remaining";
  sessionPaymentAmountCents?: number;

  offerId?: string;
  clientId?: string;
  artistId?: string;
  price?: number;
  displayName?: string;
  artistAvatar?: string;
  shopName?: string;
  shopAddress?: string;
  selectedDate?: {
    date: string;
    time: string;
  };
}
