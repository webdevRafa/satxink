import { Timestamp } from "firebase/firestore";


export type Booking = {
    id: string;
  
    artistId: string;
    artistName: string;
    artistAvatar?: string;
  
    clientId: string;
    offerId: string;
  
    price: number;
    depositAmount: number;
    platformFeeAmount?: number;
    platformFeeCents?: number;
    clientPaymentAmount?: number;
    clientPaymentAmountCents?: number;
    artistQuotedAmount?: number;
    artistQuotedAmountCents?: number;
    estimatedStripeFeeAmount?: number;
    estimatedStripeFeeCents?: number;
    artistPayoutAmount?: number;
    artistPayoutCents?: number;
    paymentMode?: "deposit" | "full" | "remaining";
    checkoutPaymentMode?: "deposit" | "full" | "remaining";
    depositPaidAmount?: number;
    depositPaidAmountCents?: number;
    remainingPaidAmount?: number;
    remainingPaidAmountCents?: number;
    totalArtistPaidAmount?: number;
    totalArtistPaidCents?: number;
    remainingBalanceAmount?: number;
    remainingBalanceCents?: number;
    stripeCheckoutSessionId?: string;
    lastCompletedCheckoutSessionId?: string;
    stripePaymentIntentId?: string;
    stripeConnectedAccountId?: string;
  
    paymentType: "internal" | "external";
    externalPaymentDetails?: {
      method: string;
      handle: string;
    };
  
    finalPaymentTiming: "before" | "after";
  
    shopId?: string;
    shopName?: string;
    shopAddress?: string;
    shopMapLink?: string;
  
    selectedDate: {
      date: string;
      time: string;
    };
  
    sampleImageUrl?: string;
  
    status: "pending_payment" | "deposit_paid" | "paid" | "confirmed" | "cancelled";
    createdAt: Timestamp; // or FirebaseFirestore.Timestamp if you're using strict typing
    paidAt?: Timestamp; 
    depositPaidAt?: Timestamp;
    remainingPaidAt?: Timestamp;
  };
  
