import type { FlashAvailabilityStatus, FlashRepeatability } from "./Flash";
import type {
  ExternalPaymentMethod,
  FinalPaymentDeadlineHours,
} from "./PaymentPreferences";
import type {
  DepositApplication,
  SessionInstallmentTiming,
} from "./Booking";

export type Offer = {
    id: string;
    artistId: string;
    displayName: string;
    artistAvatar?: string; // <-- ensure this is always a string
    clientId: string;
    clientFirstName?: string;
    clientLastName?: string;
    clientName?: string;
clientAvatar?: string;
    requestId: string;
    price: number;
    message: string;
    status: string;
    declinedReason?: string | null;
    declinedReasonLabel?: string | null;
    dateOptions: { date: string; time: string }[];
    imageFilename?: string | null;
    fullUrl?: string | null;
    thumbUrl?: string | null;
    previousOfferId?: string | null;
    revisionOfOfferId?: string | null;
    revisedByOfferId?: string | null;
    sourceType?: "custom" | "flash" | string;
    flashId?: string | null;
    flashTitle?: string | null;
    flashDescription?: string | null;
    flashPrice?: number | null;
    flashSheetId?: string | null;
    flashRepeatability?: FlashRepeatability;
    flashAvailabilityStatus?: FlashAvailabilityStatus;
    isFromSheet?: boolean | null;
    shopName?: string;
    shopAddress?: string;
    shopMapLink?: string;
    shopId?: string;
    depositPolicy: {
      amount: number;
      depositRequired: boolean;
      nonRefundable: boolean;
    };
    paymentType: "internal" | "external";
    externalPaymentDetails?: {
      handle: string;
      method: string;
    };
    finalPaymentTiming: "before" | "after";
    finalPaymentDeadlineHours?: FinalPaymentDeadlineHours | null;
    allowExternalRemainingPayment?: boolean;
    externalRemainingPaymentMethods?: ExternalPaymentMethod[];
    externalRemainingPaymentNote?: string;
    depositApplication?: DepositApplication;
    projectType?: "single_session" | "multi_session";
    estimatedSessionCount?: number;
    estimatedSessionPrice?: number;
    estimatedHoursPerSession?: number | null;
    sessionPaymentPlan?: "single_balance" | "per_session";
    sessionScheduling?: "single_session" | "first_session_now_rest_later";
    sessionInstallmentTiming?: SessionInstallmentTiming;
  };
  
