import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db, storage } from "../firebase/firebaseConfig";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getCroppedImg } from "../utils/cropImage";
import { Plus } from "lucide-react";

import type { Flash } from "../types/Flash";
import type { FlashSheet } from "../types/FlashSheet";

// ─────────────────────────────────────────────
// Edit Modal
const EditFlashModal = ({
  flash,
  onClose,
  onSave,
}: {
  flash: Flash;
  onClose: () => void;
  onSave: (id: string, title: string, price: number | null) => void;
}) => {
  const [title, setTitle] = useState(flash.title || "");
  const [price, setPrice] = useState(flash.price?.toString() || "");

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-md text-white space-y-4">
        <span className="text-sm text-gray-400">Edit</span>

        <div className="flex justify-center">
          <img
            src={flash.thumbUrl || flash.webp90Url}
            alt={flash.title}
            className="w-48 h-48 object-cover rounded-md shadow"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded bg-zinc-800 text-whit text-sm"
            placeholder="Enter title"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Price</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="max-w-[100px] px-3 py-2 rounded bg-zinc-800 text-white text-sm"
            placeholder="$"
          />
        </div>

        <div className="flex justify-between mt-6">
          <button
            onClick={onClose}
            className="text-sm text-[var(--color-bg-footer)]! bg-rose-600 hover:bg-rose-700  px-2! py-1! rounded"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave(flash.id, title, price ? parseFloat(price) : null)
            }
            className="px-2! py-1! bg-emerald-600 hover:bg-emerald-700 text-[var(--color-bg-footer)]! rounded text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// FlashSheet Detail Page
const FlashSheetDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [sheet, setSheet] = useState<FlashSheet | null>(null);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [editingFlash, setEditingFlash] = useState<Flash | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<Area | null>(null);
  const [newFlashTitle, setNewFlashTitle] = useState("");
  const [newFlashPrice, setNewFlashPrice] = useState("");

  const fetchFlashes = async (sheetId: string) => {
    const q = query(collection(db, "flashes"), where("sheetId", "==", sheetId));
    const snapshot = await getDocs(q);
    setFlashes(
      snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Flash))
    );
  };

  const handleSaveEdit = async (
    flashId: string,
    title: string,
    price: number | null
  ) => {
    await updateDoc(doc(db, "flashes", flashId), { title, price });
    setEditingFlash(null);
    if (id) fetchFlashes(id);
  };

  const handleCropComplete = (_: any, areaPixels: Area) => {
    setCropArea(areaPixels);
  };

  const handleSaveNewFlash = async () => {
    if (!sheet || !cropArea) return;

    const croppedBlob = await getCroppedImg(sheet.imageUrl, cropArea);
    const timestamp = Date.now();
    const baseName = `flash_${timestamp}`;

    const originalRef = ref(
      storage,
      `users/${sheet.artistId}/flashes/${baseName}.jpg`
    );
    await uploadBytes(originalRef, croppedBlob);
    await new Promise((res) => setTimeout(res, 1200)); // wait for cloud function

    const [fullUrl, thumbUrl, webp90Url] = await Promise.all([
      getDownloadURL(
        ref(storage, `users/${sheet.artistId}/flashes/${baseName}_full.jpg`)
      ),
      getDownloadURL(
        ref(storage, `users/${sheet.artistId}/flashes/${baseName}_thumb.webp`)
      ),
      getDownloadURL(
        ref(storage, `users/${sheet.artistId}/flashes/${baseName}_webp90.webp`)
      ),
    ]);

    await addDoc(collection(db, "flashes"), {
      artistId: sheet.artistId,
      sheetId: sheet.id,
      title: newFlashTitle || "Untitled Flash",
      price: newFlashPrice ? parseFloat(newFlashPrice) : null,
      tags: [],
      fullUrl,
      thumbUrl,
      webp90Url,
      isFromSheet: true,
      createdAt: serverTimestamp(),
    });

    setShowCropModal(false);
    setNewFlashTitle("");
    setNewFlashPrice("");
    if (id) fetchFlashes(id);
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      const docSnap = await getDoc(doc(db, "flashSheets", id));
      if (docSnap.exists()) {
        setSheet({ id: docSnap.id, ...docSnap.data() } as FlashSheet);
      }
      fetchFlashes(id);
    };
    fetchData();
  }, [id]);

  if (!sheet) return <p className="text-white">Loading...</p>;

  return (
    <div className="p-6 text-white mt-20 min-h-screen">
      <h1 className="text-lg! text-center">{sheet.title}</h1>

      <img
        src={sheet.imageUrl}
        alt={sheet.title}
        className="max-h-[200px] mb-1 rounded shadow mx-auto"
      />
      <button
        onClick={() => setShowCropModal(true)}
        className="mb-10  p-1! text-xs! text-neutral-400 bg-black rounded hover:bg-zinc-800 mx-auto flex"
      >
        Add More
        <Plus className="h-4 text-white" />
      </button>
      <div
        className="grid gap-4 max-w-[1200px] mx-auto"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
      >
        {flashes.map((flash) => (
          <div key={flash.id} className="bg-zinc-900 shadow">
            <img
              src={flash.thumbUrl || flash.fullUrl}
              alt={flash.title}
              className="w-full h-40 object-cover rounded mb-2"
            />
            <p className="font-medium">{flash.title}</p>
            {flash.price && (
              <p className="text-sm text-zinc-400">${flash.price}</p>
            )}
            <button
              onClick={() => setEditingFlash(flash)}
              className="text-sm text-blue-400 mt-1 underline"
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      {editingFlash && (
        <EditFlashModal
          flash={editingFlash}
          onClose={() => setEditingFlash(null)}
          onSave={handleSaveEdit}
        />
      )}

      {showCropModal && sheet && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 p-4 w-full max-w-lg space-y-4 text-white">
            <div className="relative h-[400px] w-full">
              <Cropper
                image={sheet.imageUrl}
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
              value={newFlashTitle}
              onChange={(e) => setNewFlashTitle(e.target.value)}
              placeholder="Title"
              className=" bg-zinc-800 rounded px-3 py-2 text-sm w-[80%]"
            />
            <input
              type="number"
              value={newFlashPrice}
              onChange={(e) => setNewFlashPrice(e.target.value)}
              placeholder="$"
              className="w-full bg-zinc-800 rounded px-3 py-2 max-w-[100px] text-sm"
            />

            <div className="flex justify-between mt-4">
              <button
                onClick={() => setShowCropModal(false)}
                className="text-sm text-[var(--color-bg-footer)]! bg-rose-600 hover:bg-rose-700  px-2! py-1! rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewFlash}
                className="px-2! py-1! bg-emerald-600 hover:bg-emerald-700 text-[var(--color-bg-footer)]! rounded text-sm"
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlashSheetDetailPage;
