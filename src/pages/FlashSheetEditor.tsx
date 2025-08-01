// FlashSheetEditor.tsx — Crop flashes from a flash sheet

import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { db, storage } from "../firebase/firebaseConfig";
import {
  doc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import type { Flash } from "../types/Flash";
import type { FlashSheet } from "../types/FlashSheet";
import { getCroppedImgFromElement } from "../utils/getCroppedImgFromElement";

const FlashSheetEditor = () => {
  const { sheetId } = useParams();
  const [sheet, setSheet] = useState<FlashSheet | null>(null);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [tags, setTags] = useState("");
  const [showModal, setShowModal] = useState(false);
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchSheet = async () => {
      try {
        const docRef = doc(db, "flashSheets", sheetId!);
        const snap = await getDoc(docRef);
        if (!snap.exists()) throw new Error("FlashSheet not found");

        const data = snap.data();
        const fullRef = ref(storage, data.fullPath);
        const downloadUrl = await getDownloadURL(fullRef);

        setSheet({
          ...(data as FlashSheet),
          id: snap.id,
          imageUrl: downloadUrl, // ✅ Direct Firebase URL — do NOT fetch manually
        });

        uidRef.current = data.artistId;
      } catch (err) {
        console.error("fetchSheet error:", err);
        alert("Could not load image. Please try again.");
      }
    };

    const fetchFlashes = async () => {
      const q = query(
        collection(db, "flashes"),
        where("sheetId", "==", sheetId)
      );
      const snap = await getDocs(q);
      setFlashes(
        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Flash))
      );
    };

    if (sheetId) {
      fetchSheet();
      fetchFlashes();
    }
  }, [sheetId]);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const handleCropComplete = (_: any, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
    // Save the actual <img> from Cropper (in DOM)
    const cropperImage = document.querySelector(
      "img.reactEasyCrop_Image"
    ) as HTMLImageElement;
    if (cropperImage) {
      imageRef.current = cropperImage;
    }
  };

  const handleSaveCrop = async () => {
    if (!imageRef.current || !croppedAreaPixels) return;

    try {
      const blob = await getCroppedImgFromElement(
        imageRef.current,
        croppedAreaPixels
      );
      setPendingBlob(blob);
      setShowModal(true);
    } catch (err) {
      console.error("Cropping failed:", err);
      alert("Failed to crop image. Please try again.");
    }
  };

  const handleFlashSubmit = async () => {
    if (!pendingBlob || !uidRef.current) return;

    const timestamp = Date.now();
    const baseName = `flash-${timestamp}`;
    const basePath = `users/${uidRef.current}/flashes/${baseName}`;
    const originalRef = ref(storage, `${basePath}.jpg`);

    await uploadBytes(originalRef, pendingBlob);

    // Utility to retry fetching download URLs
    const waitForFile = async (path: string, maxRetries = 10) => {
      const fileRef = ref(storage, path);
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await getDownloadURL(fileRef);
        } catch (err) {
          await new Promise((res) => setTimeout(res, 1000)); // wait 1s
        }
      }
      throw new Error(`Failed to get download URL for ${path}`);
    };

    const [thumbUrl, webp90Url, fullUrl] = await Promise.all([
      waitForFile(`${basePath}_thumb.webp`),
      waitForFile(`${basePath}_webp90.webp`),
      waitForFile(`${basePath}_full.jpg`),
    ]);

    await addDoc(collection(db, "flashes"), {
      artistId: uidRef.current,
      fileName: baseName,
      thumbUrl,
      webp90Url,
      fullUrl,
      thumbPath: `${basePath}_thumb.webp`,
      previewPath: `${basePath}_webp90.webp`,
      fullPath: `${basePath}_full.jpg`,
      title,
      price: price ? parseFloat(price) : null,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      isFromSheet: true,
      sheetId,
      createdAt: serverTimestamp(),
    });

    setPendingBlob(null);
    setTitle("");
    setPrice("");
    setTags("");
    setShowModal(false);
    setCroppedAreaPixels(null);
    setZoom(1);
    await new Promise((res) => setTimeout(res, 500));
    location.reload();
  };

  if (!sheet?.imageUrl) return <p className="text-center">Loading...</p>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-4">Flash Sheet Editor</h1>

      <div className="relative w-full h-[600px] bg-black rounded overflow-hidden">
        <Cropper
          image={sheet.imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
        <div className="absolute bottom-4 left-4 flex gap-4 z-10">
          <button
            onClick={handleSaveCrop}
            className="bg-emerald-600 text-white px-4 py-2 rounded"
          >
            Save Crop as Flash
          </button>
        </div>
      </div>

      {/* Flash Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-80 z-30">
          <div className="bg-zinc-900 p-6 rounded w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold text-white">
              Add Flash Details
            </h2>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="bg-zinc-800 text-white px-3 py-2 rounded w-full"
            />
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price (optional)"
              className="bg-zinc-800 text-white px-3 py-2 rounded w-full"
            />
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags (comma separated)"
              className="bg-zinc-800 text-white px-3 py-2 rounded w-full"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
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

      {/* Existing Flashes */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-white mb-4">
          Flashes from This Sheet
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {flashes.map((f) => (
            <div
              key={f.id}
              className="bg-zinc-800 rounded overflow-hidden shadow"
            >
              <img
                src={f.thumbUrl || f.webp90Url}
                alt={f.title || "Flash"}
                className="w-full object-cover"
              />
              <div className="p-2 text-white">
                <p className="font-semibold">{f.title}</p>
                {f.price && <p className="text-sm text-gray-300">${f.price}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FlashSheetEditor;
