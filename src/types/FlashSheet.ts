import { Timestamp, FieldValue } from "firebase/firestore";

export type FlashSheet = {
    id: string;             // Firestore doc ID
    artistId: string;       // UID of the artist
    imageUrl: string;       // Full uncropped image
    thumbUrl?: string;      // Optional thumb from Sharp
    fullPath?: string;
    title?: string;         // Optional title (e.g. “Traditional Snakes”)
    createdAt?: Timestamp | Date | FieldValue | null;
  };
  