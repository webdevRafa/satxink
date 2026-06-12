import { Timestamp, FieldValue } from "firebase/firestore";
import type { FlashRepeatability, MarketplaceArtistPublic } from "./Flash";

export type FlashSheet = {
  id: string;
  artistId: string;
  imageUrl: string;
  thumbUrl?: string;
  fullPath?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceMegapixels?: number;
  sourceFileSizeBytes?: number;
  tags?: string[];
  artistStripeConnectReady?: boolean;
  marketplaceVisible?: boolean;
  marketplaceReady?: boolean;
  artistPublic?: MarketplaceArtistPublic | null;
  searchTokens?: string[];
  searchTags?: string[];
  marketplaceUpdatedAt?: Timestamp | Date | FieldValue | null;
  repeatabilityDefault?: FlashRepeatability;
  title?: string;
  createdAt?: Timestamp | Date | FieldValue | null;
};
