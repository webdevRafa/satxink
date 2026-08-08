import type { FlashSheet } from "../types/FlashSheet";

/**
 * Use the 1080px WebP for cards and carousels. The 300px thumbnail is only a
 * last-resort fallback because these surfaces commonly render wider than
 * 300px (and wider still in device pixels on high-DPI screens).
 *
 * Older sheets may not have webp90Url/fullUrl, but imageUrl points at the
 * processed full-size JPEG, so they still receive a sharp preview.
 */
export const getFlashSheetPreviewUrl = (sheet: FlashSheet) =>
  sheet.webp90Url || sheet.fullUrl || sheet.imageUrl || sheet.thumbUrl || "";

export const getFlashSheetFullUrl = (sheet: FlashSheet) =>
  sheet.fullUrl || sheet.imageUrl || sheet.webp90Url || sheet.thumbUrl || "";
