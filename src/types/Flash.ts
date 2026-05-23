import { Timestamp, FieldValue } from "firebase/firestore";

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
  isAvailable?: boolean;           // Optional: mark flash as available or sold
  price?: number | null;           // Optional: for marketplace support
  tags?: string[];                 // Optional: for search/filter
  artistStripeConnectReady?: boolean;
  marketplaceVisible?: boolean;
  status?: string;                 // Optional processing status for uploaded files
  isFromSheet: true | false
  createdAt?: Timestamp | Date | FieldValue | null; // Firestore timestamp
  sheetId?: string;
};
