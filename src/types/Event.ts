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
  | "deposit_required"
  | "varies";

export type EventStatus = "draft" | "published" | "cancelled" | "completed";

export type ArtistEvent = {
  id: string;
  artistId: string;

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
  depositAmount?: number | null;

  capacityType: "unlimited" | "limited";
  capacity?: number | null;
  spotsClaimed?: number;

  thumbnailUrl?: string;
  thumbnailPath?: string;

  tags?: string[];

  status: EventStatus;
  visibility: "public" | "private";

  createdAt?: Timestamp | Date | FieldValue | null;
  updatedAt?: Timestamp | Date | FieldValue | null;
};
