import { Timestamp, FieldValue } from "firebase/firestore";

export type FlashRepeatability = "repeatable" | "one_of_one";
export type FlashAvailabilityStatus = "available" | "held" | "sold";
export type FlashPublicationStatus = "draft" | "published";

export type Flash = {
  id: string;                      // Firestore document ID
  artistId: string;                // Linked artist
  fileName: string;                // Original filename (without extension)

  // Public URLs for frontend display
  thumbUrl: string;                // 300px WebP thumbnail
  webp90Url: string;               // 1080px WebP (90% quality preview)
  fullUrl: string;                 // Full-resolution image

  // Storage paths for internal cleanup or migration
  thumbPath: string;               // Firebase Storage path to thumbnail
  previewPath: string;             // Firebase Storage path to preview
  fullPath: string;                // Firebase Storage path to full image

  title?: string;                  // Optional artist-provided title
  caption?: string | null;         // Legacy upload modal title field
  description?: string | null;      // Optional short public note
  isAvailable?: boolean;           // Optional: mark flash as available or sold
  repeatability?: FlashRepeatability;
  availabilityStatus?: FlashAvailabilityStatus;
  heldByBookingId?: string | null;
  heldByClientId?: string | null;
  heldByCheckoutSessionId?: string | null;
  heldUntil?: Timestamp | Date | FieldValue | null;
  soldBookingId?: string | null;
  soldCheckoutSessionId?: string | null;
  soldAt?: Timestamp | Date | FieldValue | null;
  price?: number | null;           // Optional: for marketplace support
  tags?: string[];                 // Optional: for search/filter
  artistStripeConnectReady?: boolean;
  marketplaceVisible?: boolean;
  publicationStatus?: FlashPublicationStatus;
  publishedAt?: Timestamp | Date | FieldValue | null;
  status?: string;                 // Optional processing status for uploaded files
  isFromSheet: true | false
  createdAt?: Timestamp | Date | FieldValue | null; // Firestore timestamp
  sheetId?: string;
};
