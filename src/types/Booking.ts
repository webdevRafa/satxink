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
export type ProjectStatus = "active" | "paused" | "completed";

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
    priceCents?: number;
    depositAmount: number;
    originalPrice?: number;
    originalPriceCents?: number;
    originalEstimatedSessionCount?: number;
    projectStatus?: ProjectStatus;
    projectRevision?: number;
    platformFeeAmount?: number;
    platformFeeCents?: number;
    platformFeeCollectedAmount?: number;
    platformFeeCollectedCents?: number;
    pendingPlatformFeeAmount?: number;
    pendingPlatformFeeCents?: number;
    clientPaymentAmount?: number;
    clientPaymentAmountCents?: number;
    artistQuotedAmount?: number;
    artistQuotedAmountCents?: number;
    estimatedStripeFeeAmount?: number;
    estimatedStripeFeeCents?: number;
    artistPayoutAmount?: number;
    artistPayoutCents?: number;
    paymentMode?: "deposit" | "full" | "remaining" | "platform_fee";
    checkoutPaymentMode?: "deposit" | "full" | "remaining" | "platform_fee";
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
    stripeCheckoutExpiresAt?: Timestamp;
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
    flashDescription?: string | null;
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
    pausedAt?: Timestamp;
    pausedBy?: string;
    pausedReason?: string | null;
    pausedUntil?: string | null;
    resumedAt?: Timestamp;
    resumedBy?: string;
    nextSessionScheduledAt?: Timestamp;
    nextSessionScheduledBy?: string;
    externalRemainingArtistConfirmedAt?: Timestamp;
    externalRemainingClientConfirmedAt?: Timestamp;
    externalRemainingDisputedAt?: Timestamp;
    platformFeeOnlyPaidAt?: Timestamp;
  };

export type ProjectAmendmentType =
    | "add_sessions"
    | "schedule_next_session"
    | "pause_project"
    | "resume_project";

export type ProjectAmendmentStatus =
    | "proposed"
    | "accepted"
    | "declined"
    | "cancelled";

export type ProjectAmendment = {
    id: string;
    bookingId: string;
    type: ProjectAmendmentType;
    status: ProjectAmendmentStatus;
    proposedById: string;
    proposedByRole: "artist" | "client";
    message?: string | null;
    additionalSessionCount?: number;
    addedArtistAmount?: number;
    addedArtistAmountCents?: number;
    proposedPrice?: number;
    proposedPriceCents?: number;
    proposedEstimatedSessionCount?: number;
    proposedRemainingBalanceAmount?: number;
    proposedRemainingBalanceCents?: number;
    platformFeeDeltaAmount?: number;
    platformFeeDeltaCents?: number;
    proposedSelectedDate?: {
      date: string;
      time: string;
    };
    sessionNumber?: number;
    reason?: string | null;
    pausedUntil?: string | null;
    createdAt?: Timestamp;
    respondedAt?: Timestamp;
    respondedById?: string;
    respondedByRole?: "artist" | "client";
  };
  
