import type { GalleryItem } from "../types/GalleryItem";

export const GALLERY_PREVIEW_ASPECT_RATIO = 4 / 5;

export const getGalleryPreviewUrl = (item: GalleryItem) =>
  item.webp90Url || item.thumbUrl || item.fullUrl || "";

export const getGalleryPreviewSrcSet = (item: GalleryItem) => {
  const sources = [
    item.thumbUrl ? `${item.thumbUrl} 300w` : "",
    item.webp90Url ? `${item.webp90Url} 1080w` : "",
  ].filter(Boolean);

  return sources.length > 1 ? sources.join(", ") : undefined;
};

export const GALLERY_PROFILE_CARD_SIZES =
  "(max-width: 639px) calc(100vw - 3rem), (max-width: 1023px) calc(50vw - 2rem), 24rem";

export const GALLERY_MANAGER_CARD_SIZES =
  "(max-width: 639px) calc(100vw - 2rem), (max-width: 1279px) calc(50vw - 2rem), 22rem";
