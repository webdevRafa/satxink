// FlashManager.tsx with Title & Price Prompt for Flash Sheet Crops

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
  const [titleInput, setTitleInput] = useState("");
  const [priceInput, setPriceInput] = useState("");

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

  const saveCurrentCrop = async () => {
    if (!sheetImage || !currentCrop || !uid) return;
    const blob = await getCroppedImg(sheetImage, currentCrop);

    const timestamp = Date.now();
    const filename = `flash_${timestamp}.jpg`;
    const storagePath = `users/${uid}/flashes/${filename}`;
    const fileRef = ref(storage, storagePath);

    await uploadBytes(fileRef, blob);
    const downloadURL = await getDownloadURL(fileRef);

    await addDoc(collection(db, "flashes"), {
      artistId: uid,
      title: titleInput || "Untitled Flash",
      price: priceInput ? parseFloat(priceInput) : null,
      tags: [],
      fullUrl: downloadURL,
      thumbUrl: downloadURL,
      webp90Url: downloadURL,
      isFromSheet: true,
      createdAt: serverTimestamp(),
    });

    setTitleInput("");
    setPriceInput("");
    setCurrentCrop(null);
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
        <div className="relative w-full h-[500px]">
          <div className="absolute inset-0 z-10">
            <Cropper
              image={sheetImage}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
            />
          </div>

          <div className="relative z-20 mt-[520px] space-y-4">
            <div className="flex flex-col md:flex-row gap-2">
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Title"
                className="bg-gray-800 text-white px-3 py-2 rounded w-full md:w-1/2"
              />
              <input
                type="number"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="Price (optional)"
                className="bg-gray-800 text-white px-3 py-2 rounded w-full md:w-1/2"
              />
            </div>
            <div className="flex gap-4">
              <button
                onClick={saveCurrentCrop}
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
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {flashes.map((flash) => (
          <div key={flash.id} className="relative">
            <img
              src={flash.thumbUrl || flash.webp90Url}
              alt={flash.title || "Flash"}
              className="w-full rounded shadow hover:scale-105 transition"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FlashManager;
