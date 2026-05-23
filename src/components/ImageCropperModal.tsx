import { useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Check, Minus, Plus, X } from "lucide-react";

type Props = {
  imageSrc: string;
  aspect?: number; // Default 1:1
  onCancel: () => void;
  onSave: (croppedFile: File) => void;
};

const getCroppedImg = async (
  imageSrc: string,
  cropAreaPixels: Area
): Promise<File> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas context not available");

  canvas.width = cropAreaPixels.width;
  canvas.height = cropAreaPixels.height;

  ctx.drawImage(
    image,
    cropAreaPixels.x,
    cropAreaPixels.y,
    cropAreaPixels.width,
    cropAreaPixels.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Canvas is empty"));
      resolve(new File([blob], "cropped-image.jpg", { type: "image/jpeg" }));
    }, "image/jpeg");
  });
};

const createImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
};

const ImageCropperModal: React.FC<Props> = ({
  imageSrc,
  aspect = 1,
  onCancel,
  onSave,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels);
    onSave(croppedFile);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 backdrop-blur-md">
      <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-white/10 bg-[#121212] text-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="mb-1! text-xl!">Position your photo</h2>
            <p className="text-sm text-neutral-400">
              Drag to frame the image, then zoom until it feels right.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-2 text-neutral-400 transition hover:bg-white/5 hover:text-white"
            aria-label="Close cropper"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="relative h-[52vh] min-h-[360px] bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={aspect === 1 ? "round" : "rect"}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
          />
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <Minus size={16} className="text-neutral-500" aria-hidden="true" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="h-2 min-w-0 flex-1 accent-white"
              aria-label="Zoom image"
            />
            <Plus size={16} className="text-neutral-500" aria-hidden="true" />
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:border-white/25 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5 py-2 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85"
            >
              <Check size={16} className="text-[#0b0b0b]!" aria-hidden="true" />
              Use photo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCropperModal;
