import { Timestamp } from "firebase/firestore";
import type { FlashAvailabilityStatus, FlashRepeatability } from "./Flash";

export type RemainingPaymentMethod = "stripe" | "external";
export type RemainingPaymentStatus =
    | "not_due"
    | "due"
    | "artist_confirmed"
    | "client_confirmed"
    | "confirmed"
    | "disputed";
export type BookingSessionStatus =
    | "not_started"
    | "in_progress"
    | "completed"
    | "awaiting_next_session";

export type Booking = {
    id: string;
  
    artistId: string;
    artistName: string;
    artistAvatar?: string;
  
    clientId: string;
    clientName?: string;
    clientAvatar?: string;
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
    remainingPaymentMethod?: RemainingPaymentMethod;
    remainingPaymentStatus?: RemainingPaymentStatus;
    externalRemainingAmount?: number;
    externalRemainingAmountCents?: number;
    externalRemainingPaymentNote?: string;
    externalRemainingDisputeReason?: string;
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
    projectType?: "single_session" | "multi_session";
    estimatedSessionCount?: number;
    estimatedSessionPrice?: number;
    sessionPaymentPlan?: "single_balance" | "per_session";
    sessionScheduling?: "single_session" | "first_session_now_rest_later";
    activeSessionNumber?: number;
    completedSessionCount?: number;
    pendingSessionPaymentAmount?: number;
    pendingSessionPaymentAmountCents?: number;
    pendingSessionNumber?: number;
    lastPaidSessionNumber?: number;
  
    shopId?: string;
    shopName?: string;
    shopAddress?: string;
    shopMapLink?: string;
  
    selectedDate: {
      date: string;
      time: string;
    };
  
    sampleImageUrl?: string;
    sourceType?: "custom" | "flash" | string;
    flashId?: string | null;
    flashTitle?: string | null;
    flashPrice?: number | null;
    flashSheetId?: string | null;
    flashRepeatability?: FlashRepeatability;
    flashAvailabilityStatus?: FlashAvailabilityStatus;
    isFromSheet?: boolean | null;
  
    status: "pending_payment" | "deposit_paid" | "paid" | "confirmed" | "cancelled";
    sessionStatus?: BookingSessionStatus;
    sessionId?: string;
    sessionPhotoUrls?: string[];
    createdAt: Timestamp; // or FirebaseFirestore.Timestamp if you're using strict typing
    paidAt?: Timestamp; 
    depositPaidAt?: Timestamp;
    remainingPaidAt?: Timestamp;
    sessionStartedAt?: Timestamp;
    sessionCompletedAt?: Timestamp;
    externalRemainingArtistConfirmedAt?: Timestamp;
    externalRemainingClientConfirmedAt?: Timestamp;
    externalRemainingDisputedAt?: Timestamp;
  };
  
