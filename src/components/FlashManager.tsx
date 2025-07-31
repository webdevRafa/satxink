// FlashManager.tsx with Proper Crop Flow UX

import { useState, useEffect } from "react";
import { db, storage } from "../firebase/firebaseConfig";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getCroppedImg } from "../utils/cropImage";
import UploadModal from "./UploadModal";
import { Plus, Scissors } from "lucide-react";
import type { Flash } from "../types/Flash";

const FlashManager = ({ uid }: { uid: string }) => {
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [sheetImage, setSheetImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [currentCrop, setCurrentCrop] = useState<Area | null>(null);
  const [mode, setMode] = useState<"sheet" | "individual">("individual");
  const [showFlashDetailsModal, setShowFlashDetailsModal] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);

  const fetchFlashes = async () => {
    const q = query(collection(db, "flashes"), where("artistId", "==", uid));
    const snapshot = await getDocs(q);
    setFlashes(
      snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Flash))
    );
  };

  useEffect(() => {
    if (uid) fetchFlashes();
  }, [uid]);

  const handleSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setSheetImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = (_: any, croppedAreaPixels: Area) => {
    setCurrentCrop(croppedAreaPixels);
  };

  const handleSaveCropRequest = async () => {
    if (!sheetImage || !currentCrop) return;
    const blob = await getCroppedImg(sheetImage, currentCrop);
    setPendingBlob(blob);
    setShowFlashDetailsModal(true);
  };

  const handleFlashSubmit = async () => {
    if (!pendingBlob || !uid) return;

    const timestamp = Date.now();
    const baseName = `flash_${timestamp}`;
    const originalFilename = `${baseName}.jpg`;
    const storageBasePath = `users/${uid}/flashes/${baseName}`;
    const originalRef = ref(
      storage,
      `users/${uid}/flashes/${originalFilename}`
    );

    await uploadBytes(originalRef, pendingBlob);
    await new Promise((res) => setTimeout(res, 1200));

    const fullRef = ref(storage, `${storageBasePath}_full.jpg`);
    const thumbRef = ref(storage, `${storageBasePath}_thumb.webp`);
    const webp90Ref = ref(storage, `${storageBasePath}_webp90.webp`);

    const [fullUrl, thumbUrl, webp90Url] = await Promise.all([
      getDownloadURL(fullRef),
      getDownloadURL(thumbRef),
      getDownloadURL(webp90Ref),
    ]);

    await addDoc(collection(db, "flashes"), {
      artistId: uid,
      title: titleInput || "Untitled Flash",
      price: priceInput ? parseFloat(priceInput) : null,
      tags: [],
      fullUrl,
      thumbUrl,
      webp90Url,
      isFromSheet: true,
      createdAt: serverTimestamp(),
    });

    setTitleInput("");
    setPriceInput("");
    setCurrentCrop(null);
    setPendingBlob(null);
    setShowFlashDetailsModal(false);
    fetchFlashes();
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 mb-4">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
          className="bg-gray-800 text-white px-3 py-2 rounded"
        >
          <option value="individual">Upload Individually</option>
          <option value="sheet">Upload Flash Sheet</option>
        </select>

        {mode === "individual" ? (
          <button
            onClick={() => setIsUploadOpen(true)}
            className="bg-black text-white px-4 py-2 rounded hover:bg-gray-700 flex items-center gap-2"
          >
            <Plus size={18} /> Add Flash
          </button>
        ) : (
          <label className="flex items-center gap-2 cursor-pointer bg-black text-white px-4 py-2 rounded hover:bg-gray-700">
            <Scissors size={18} /> Upload Flash Sheet
            <input
              type="file"
              onChange={handleSheetUpload}
              accept="image/*"
              className="hidden"
            />
          </label>
        )}
      </div>

      {isUploadOpen && (
        <UploadModal
          uid={uid}
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          collectionType="flashes"
          onUploadComplete={fetchFlashes}
        />
      )}

      {sheetImage && (
        <div className="relative w-full h-[600px] z-10">
          <Cropper
            image={sheetImage}
            crop={crop}
            zoom={zoom}
            maxZoom={8}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />

          <div className="absolute bottom-4 left-4 flex gap-4 z-20">
            <button
              onClick={handleSaveCropRequest}
              className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700"
            >
              Save Crop as Flash
            </button>
            <button
              onClick={() => setSheetImage(null)}
              className="bg-rose-600 text-white px-4 py-2 rounded hover:bg-rose-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showFlashDetailsModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-80 z-30">
          <div className="bg-zinc-900 p-6 rounded w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold text-white">
              Add Flash Details
            </h2>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Title"
              className="bg-zinc-800 text-white px-3 py-2 rounded w-full"
            />
            <input
              type="number"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="Price (optional)"
              className="bg-zinc-800 text-white px-3 py-2 rounded w-full"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowFlashDetailsModal(false)}
                className="bg-rose-600 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleFlashSubmit}
                className="bg-emerald-600 text-white px-4 py-2 rounded"
              >
                Save Flash
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="grid gap-4 justify-center md:justify-start"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 250px))",
        }}
      >
        {flashes.map((flash) => (
          <div key={flash.id} className="relative">
            <img
              src={flash.thumbUrl || flash.webp90Url}
              alt={flash.title || "Flash"}
              className="w-full rounded shadow hover:scale-105 transition"
            />
            <p>{flash.title}</p>
            <p>{flash.price}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FlashManager;
