export type ImageSourceMetadata = {
  width: number;
  height: number;
  fileSizeBytes?: number;
};

export type FlashQualityLevel = "great" | "usable" | "soft";

export const FLASH_DESCRIPTION_MAX_LENGTH = 180;

export const getImageMegapixels = (width?: number, height?: number) =>
  width && height ? Number(((width * height) / 1_000_000).toFixed(1)) : null;

export const getSheetQualityLevel = (
  metadata?: ImageSourceMetadata | null
): FlashQualityLevel => {
  if (!metadata?.width || !metadata.height) return "usable";

  const shortEdge = Math.min(metadata.width, metadata.height);
  const megapixels = getImageMegapixels(metadata.width, metadata.height) || 0;

  if (shortEdge >= 2400 && megapixels >= 8) return "great";
  if (shortEdge >= 1600 && megapixels >= 4) return "usable";
  return "soft";
};

export const getCropQualityLevel = (
  width?: number,
  height?: number
): FlashQualityLevel => {
  if (!width || !height) return "usable";

  const shortEdge = Math.min(width, height);
  if (shortEdge >= 1200) return "great";
  if (shortEdge >= 900) return "usable";
  return "soft";
};

export const getQualityLabel = (level: FlashQualityLevel) => {
  if (level === "great") return "Great";
  if (level === "usable") return "Usable";
  return "May crop soft";
};

export const getCropQualityLabel = (level: FlashQualityLevel) => {
  if (level === "great") return "Crisp";
  if (level === "usable") return "Good";
  return "May look soft";
};

export const getQualityClassName = (level: FlashQualityLevel) => {
  if (level === "great") {
    return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  }

  if (level === "usable") {
    return "border-white/10 bg-white/5 text-zinc-200";
  }

  return "border-amber-300/25 bg-amber-300/10 text-amber-100";
};

export const normalizeFlashDescription = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  return trimmedValue.slice(0, FLASH_DESCRIPTION_MAX_LENGTH);
};

export const formatFileSize = (bytes?: number) => {
  if (!bytes) return null;
  const megabytes = bytes / 1_000_000;
  if (megabytes >= 1) return `${megabytes.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
};
