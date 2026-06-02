import type { Flash } from "../types/Flash";

export type FlashPreviewArtist = {
  name?: string;
  displayName?: string;
  avatarUrl?: string;
};

export type FlashPreviewShape = Pick<
  Flash,
  | "availabilityStatus"
  | "caption"
  | "fullUrl"
  | "isAvailable"
  | "marketplaceVisible"
  | "price"
  | "publicationStatus"
  | "repeatability"
  | "tags"
  | "thumbUrl"
  | "title"
  | "webp90Url"
>;

export const flashPreviewCardClassName =
  "group overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.055] via-[#111] to-[#0c0c0c] shadow-lg transition hover:border-white/20";

export const getFlashTitle = (flash: Pick<Flash, "title" | "caption">) =>
  flash.title || flash.caption || "Untitled flash";

export const getFlashPreviewUrl = (
  flash: Pick<Flash, "thumbUrl" | "webp90Url" | "fullUrl">
) => flash.thumbUrl || flash.webp90Url || flash.fullUrl || "";

export const formatFlashPrice = (price?: number | null) =>
  typeof price === "number" ? `$${price}` : "Price TBD";

export const getFlashArtistName = (artist?: FlashPreviewArtist | null) =>
  artist?.displayName || artist?.name || "SATX Ink artist";
