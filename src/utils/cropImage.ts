import type { Area } from "react-easy-crop";
import { createImage } from "./createImage";

export async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  let image: HTMLImageElement | undefined;

  // Retry to wait for Firebase to finish serving the file
  for (let i = 0; i < 5; i++) {
    try {
      image = await createImage(imageSrc);
      break;
    } catch (err) {
      console.warn(`Retrying to load image... (${i + 1}/5)`);
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  if (!image) throw new Error("Image still failed to load after retries");

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed — possibly due to CORS or image loading issue."));
    }, "image/jpeg", 0.95);
  });
}
