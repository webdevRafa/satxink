import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Check, Minus, Plus, X } from "lucide-react";

type Props = {
  imageSrc: string;
  aspect?: number; // Default 1:1
  cropShape?: "round" | "rect";
  outputSize?: number;
  title?: string;
  description?: string;
  onCancel: () => void;
  onSave: (croppedFile: File) => void;
};

const getCroppedImg = async (
  imageSrc: string,
  cropAreaPixels: Area,
  outputSize?: number
): Promise<File> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas context not available");

  const targetWidth = outputSize || cropAreaPixels.width;
  const targetHeight = outputSize
    ? Math.round(outputSize * (cropAreaPixels.height / cropAreaPixels.width))
    : cropAreaPixels.height;

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  ctx.drawImage(
    image,
    cropAreaPixels.x,
    cropAreaPixels.y,
    cropAreaPixels.width,
    cropAreaPixels.height,
    0,
    0,
    targetWidth,
    targetHeight
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
  cropShape,
  outputSize,
  title = "Position your photo",
  description = "Drag to frame the image, then zoom until it feels right.",
  onCancel,
  onSave,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const isSquareCrop = Math.abs(aspect - 1) < 0.01;

  useEffect(() => {
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousOverscrollBehavior = body.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousOverflow;
      body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, []);

  const handleCropComplete = useCallback(
    (_croppedArea: Area, pixels: Area) => {
      setCroppedAreaPixels(pixels);
    },
    []
  );

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    const croppedFile = await getCroppedImg(
      imageSrc,
      croppedAreaPixels,
      outputSize
    );
    onSave(croppedFile);
  };

  const modal = (
    <div className="fixed inset-0 z-[160] overflow-hidden overscroll-none bg-black/95 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:bg-black/85 md:px-4 md:py-8 md:backdrop-blur-md">
      <div className="mx-auto flex h-full w-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-cropper-title"
          className="request-modal-scrollbar flex max-h-[calc(100svh-1.5rem-env(safe-area-inset-bottom))] w-full max-w-3xl flex-col overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-[#121212] text-white shadow-2xl md:max-h-[calc(100dvh-4rem)]"
        >
          <div className="flex shrink-0 items-start justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 id="image-cropper-title" className="mb-1! text-xl!">
                {title}
              </h2>
              <p className="text-sm text-neutral-400">
                {description}
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

          <div className="shrink-0 bg-black">
            <div
              className={`relative mx-auto w-full ${
                isSquareCrop ? "max-w-[34rem]" : "max-w-[45rem]"
              }`}
              style={{ aspectRatio: String(aspect) }}
            >
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape={cropShape || (isSquareCrop ? "round" : "rect")}
                objectFit="contain"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            </div>
          </div>

          <div className="shrink-0 space-y-4 px-5 py-4">
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
                className="modal-action-button rounded-lg! border border-white/10 px-3! py-2! text-xs! text-neutral-300 transition hover:border-white/25 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-[#0b0b0b]! transition hover:bg-white/85"
              >
                <Check size={16} className="text-[#0b0b0b]!" aria-hidden="true" />
                Use photo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default ImageCropperModal;
