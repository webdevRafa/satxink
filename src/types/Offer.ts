export type Offer = {
    id: string;
    artistId: string;
    displayName: string;
    artistAvatar?: string; // <-- ensure this is always a string
    clientId: string;
    requestId: string;
    price: number;
    fallbackPrice?: number;
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
  };
  