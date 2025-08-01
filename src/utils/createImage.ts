export function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // just in case
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      console.error("Image failed to load:", e);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}
