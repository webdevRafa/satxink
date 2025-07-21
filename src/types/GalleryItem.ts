import { Timestamp, FieldValue } from "firebase/firestore";

export type GalleryItem = {
  id: string;                      // Firestore document ID
  artistId: string;                // Linked artist
  fileName: string;                // Original filename (without extension)
  status: string;
  // Public URLs for frontend display
  thumbUrl: string;                // 300px WebP thumbnail
  webp90Url: string;               // 1080px WebP (90% quality preview)
  fullUrl: string;                 // Full-resolution image

  // Storage paths for internal cleanup or migration
  thumbPath: string;               // Firebase Storage path to thumbnail
  previewPath: string;             // Firebase Storage path to preview
  fullPath: string;                // Firebase Storage path to full image

  caption?: string;                // Optional artist-provided caption
  tags?: string[];                 // Optional: for search/filter

  createdAt?: Timestamp | Date | FieldValue | null; // Firestore timestamp
};
