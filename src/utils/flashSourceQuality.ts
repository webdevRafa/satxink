export type ImageSourceMetadata = {
  width: number;
  height: number;
  fileSizeBytes?: number;
};

export const FLASH_DESCRIPTION_MAX_LENGTH = 180;

export const getImageMegapixels = (width?: number, height?: number) =>
  width && height ? Number(((width * height) / 1_000_000).toFixed(1)) : null;

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
