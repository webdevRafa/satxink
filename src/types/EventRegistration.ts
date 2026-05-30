import type { FieldValue, Timestamp } from "firebase/firestore";

export type EventRegistrationStatus =
  | "pending_payment"
  | "reserved"
  | "paid"
  | "checked_in"
  | "cancelled"
  | "refunded";

export type EventRegistrationPaymentStatus =
  | "free"
  | "pending"
  | "paid"
  | "refunded"
  | "none";

export type EventRegistration = {
  id: string;
  eventId: string;
  eventTitle?: string;
  eventStartDate?: string;
  eventStartTime?: string;
  eventEndDate?: string;
  eventEndTime?: string;
  eventThumbnailUrl?: string;
  eventType?: string;
  bookingMode?: string;
  clientActionType?: string;
  clientId: string;
  clientName?: string;
  clientAvatarUrl?: string;
  hostUserId: string;
  artistId?: string;
  shopId?: string;
  ownerType?: "artist" | "shop";
  hostName?: string;
  locationName?: string;
  address?: string;
  mapLink?: string;
  status: EventRegistrationStatus;
  paymentStatus: EventRegistrationPaymentStatus;
  qrToken?: string;
  qrTokenHash?: string;
  ticketPriceCents?: number;
  clientPaymentAmountCents?: number;
  hostPayoutCents?: number;
  platformFeeCents?: number;
  estimatedStripeFeeCents?: number;
  stripeCheckoutSessionId?: string;
  stripeConnectedAccountId?: string;
  stripePaymentIntentId?: string;
  checkedInAt?: Timestamp | Date | FieldValue | null;
  checkedInBy?: string;
  cancelledAt?: Timestamp | Date | FieldValue | null;
  createdAt?: Timestamp | Date | FieldValue | null;
  updatedAt?: Timestamp | Date | FieldValue | null;
};
