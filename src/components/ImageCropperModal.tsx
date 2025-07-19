import { useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

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
    <div className="fixed inset-0 z-50 bg-black bg-opacity-80 flex flex-col justify-center items-center">
      <div className="relative w-[90vw] h-[60vh] bg-white rounded">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
        />
      </div>
      <div className="mt-4 flex gap-4">
        <button
          onClick={handleSave}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Save Crop
        </button>
        <button
          onClick={onCancel}
          className="bg-gray-500 text-white px-4 py-2 rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ImageCropperModal;
