import { Timestamp, FieldValue } from "firebase/firestore";
import type { FlashRepeatability } from "./Flash";

export type FlashSheet = {
  id: string;
  artistId: string;
  imageUrl: string;
  thumbUrl?: string;
  fullPath?: string;
  tags?: string[];
  artistStripeConnectReady?: boolean;
  marketplaceVisible?: boolean;
  repeatabilityDefault?: FlashRepeatability;
  title?: string;
  createdAt?: Timestamp | Date | FieldValue | null;
};
