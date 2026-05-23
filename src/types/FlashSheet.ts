import { Timestamp, FieldValue } from "firebase/firestore";

export type FlashSheet = {
  id: string;
  artistId: string;
  imageUrl: string;
  thumbUrl?: string;
  fullPath?: string;
  tags?: string[];
  artistStripeConnectReady?: boolean;
  marketplaceVisible?: boolean;
  title?: string;
  createdAt?: Timestamp | Date | FieldValue | null;
};
