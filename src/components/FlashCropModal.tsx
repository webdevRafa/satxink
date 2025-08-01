import { useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getCroppedImg } from "../utils/cropImage";
import { db, storage } from "../firebase/firebaseConfig";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

type Props = {
  uid: string;
  sheetId: string;
  sheetImageUrl: string;
  onClose: () => void;
  onFlashAdded: () => void;
};

const FlashCropModal = ({
  uid,
  sheetId,
  sheetImageUrl,
  onClose,
  onFlashAdded,
}: Props) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<Area | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");

  const handleCropComplete = (_: any, areaPixels: Area) => {
    setCropArea(areaPixels);
  };

  const handleSubmit = async () => {
    if (!cropArea) return;

    const croppedBlob = await getCroppedImg(sheetImageUrl, cropArea);
    const timestamp = Date.now();
    const baseName = `flash_${timestamp}`;
    const originalRef = ref(storage, `users/${uid}/flashes/${baseName}.jpg`);
    await uploadBytes(originalRef, croppedBlob);
    await new Promise((res) => setTimeout(res, 1200)); // Wait for Cloud Function

    const thumbRef = ref(
      storage,
      `users/${uid}/flashes/${baseName}_thumb.webp`
    );
    const fullRef = ref(storage, `users/${uid}/flashes/${baseName}_full.jpg`);
    const webpRef = ref(
      storage,
      `users/${uid}/flashes/${baseName}_webp90.webp`
    );

    const [thumbUrl, fullUrl, webp90Url] = await Promise.all([
      getDownloadURL(thumbRef),
      getDownloadURL(fullRef),
      getDownloadURL(webpRef),
    ]);

    await addDoc(collection(db, "flashes"), {
      artistId: uid,
      sheetId,
      title: title || "Untitled Flash",
      price: price ? parseFloat(price) : null,
      tags: [],
      fullUrl,
      thumbUrl,
      webp90Url,
      isFromSheet: true,
      createdAt: serverTimestamp(),
    });

    onFlashAdded();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded p-4 w-full max-w-lg space-y-4 text-white">
        <div className="relative h-[400px] w-full">
          <Cropper
            image={sheetImageUrl}
            crop={crop}
            zoom={zoom}
            maxZoom={8}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full bg-zinc-800 rounded px-3 py-2"
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price (optional)"
          className="w-full bg-zinc-800 rounded px-3 py-2"
        />

        <div className="flex justify-between mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-rose-600 rounded">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-emerald-600 rounded"
          >
            Save Flash
          </button>
        </div>
      </div>
    </div>
  );
};

export default FlashCropModal;
