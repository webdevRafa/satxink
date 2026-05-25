export type Offer = {
    id: string;
    artistId: string;
    displayName: string;
    artistAvatar?: string; // <-- ensure this is always a string
    clientId: string;
    clientName?: string;
clientAvatar?: string;
    requestId: string;
    price: number;
    message: string;
    status: string;
    dateOptions: { date: string; time: string }[];
    fullUrl?: string;
    thumbUrl?: string;
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
    allowExternalRemainingPayment?: boolean;
    externalRemainingPaymentNote?: string;
    projectType?: "single_session" | "multi_session";
    estimatedSessionCount?: number;
    estimatedSessionPrice?: number;
    sessionPaymentPlan?: "single_balance" | "per_session";
    sessionScheduling?: "single_session" | "first_session_now_rest_later";
  };
  
