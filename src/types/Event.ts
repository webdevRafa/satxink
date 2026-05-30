import { Timestamp, FieldValue } from "firebase/firestore";

export type EventType =
  | "flash_day"
  | "guest_spot"
  | "convention"
  | "pop_up"
  | "walk_in_day"
  | "shop_event"
  | "other";

export type EventLocationType = "shop" | "custom" | "online" | "tbd";

export type EventPriceType =
  | "free"
  | "fixed"
  | "starting_at"
  | "varies";

export type EventStatus = "draft" | "published" | "cancelled" | "completed";

export type EventBookingMode =
  | "info_only"
  | "rsvp"
  | "deposit_required"
  | "flash_reservation"
  | "paid_ticket";

export type EventClientActionType =
  | "details_only"
  | "free_rsvp"
  | "paid_event_pass"
  | "flash_reservation"
  | "appointment_request"
  | "waitlist"
  | "external_link";

export type FlashReservationSize = "small" | "medium" | "large";

export type FlashReservationPaymentType = "deposit" | "full_price";

export type FlashEventDurationRules = Record<FlashReservationSize, number> & {
  buffer: number;
};

export type FlashEventSlot = {
  id: string;
  startTime: string;
  endTime: string;
};

export type ArtistEvent = {
  id: string;
  artistId: string;
  createdBy?: string;
  ownerType?: "artist" | "shop";

  title: string;
  description?: string;
  eventType: EventType;

  startDate: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timezone?: string;

  locationType: EventLocationType;
  shopId?: string;
  shopName?: string;
  address?: string;
  mapLink?: string;

  priceType: EventPriceType;
  price?: number | null;
  bookingMode?: EventBookingMode;
  clientActionType?: EventClientActionType;
  externalUrl?: string;
  externalLabel?: string;
  depositRequired?: boolean;
  depositAmount?: number | null;

  capacity: number;
  spotsClaimed?: number;
  participantArtistIds?: string[];
  satxActionNote?: string;

  includedFlashSheetIds?: string[];
  flashReservationPaymentType?: FlashReservationPaymentType;
  flashDepositAmount?: number | null;
  flashDurationRules?: FlashEventDurationRules;
  flashReservationSlots?: FlashEventSlot[];

  thumbnailUrl?: string;
  thumbnailPath?: string;

  tags?: string[];

  status: EventStatus;
  visibility: "public" | "private";

  createdAt?: Timestamp | Date | FieldValue | null;
  updatedAt?: Timestamp | Date | FieldValue | null;
};
