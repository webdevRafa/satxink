// FlashManager.tsx — Reinvented UX, same helpers & imports kept

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

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
import type { FlashSheet } from "../types/FlashSheet";

import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getCroppedImg } from "../utils/cropImage";
import UploadModal from "./UploadModal";
import { Plus, Scissors } from "lucide-react";

// Optional but nice: tiny status toasts (Toaster already mounted in App.tsx)
import toast from "react-hot-toast";

const FlashManager = ({ uid }: { uid: string }) => {
  // ── State for modes & modals
  const [mode, setMode] = useState<"sheet" | "individual">("individual");
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // ── State for flash sheets
  const [flashSheets, setFlashSheets] = useState<FlashSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── State for new sheet upload + naming
  const [sheetDocId, setSheetDocId] = useState<string | null>(null);
  const [sheetImage, setSheetImage] = useState<string | null>(null);
  const [pendingSheetFile, setPendingSheetFile] = useState<File | null>(null);
  const [showSheetTitleModal, setShowSheetTitleModal] = useState(false);
  const [sheetTitleInput, setSheetTitleInput] = useState("");
  const [isUploadingSheet, setIsUploadingSheet] = useState(false);

  // ── State for cropping from uploaded sheet
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [currentCrop, setCurrentCrop] = useState<Area | null>(null);

  // ── State for creating a flash from a crop
  const [showFlashDetailsModal, setShowFlashDetailsModal] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [isSavingFlash, setIsSavingFlash] = useState(false);

  const navigate = useNavigate();

  // ──────────────────────────────────────────────────────────────
  // Helpers
  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const waitForFile = async (storageRef: any, retries = 10, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const url = await getDownloadURL(storageRef);
        return url;
      } catch (err) {
        if (i === retries - 1) throw err;
        await wait(delay);
      }
    }
    // Unreachable, but TS happy:
    throw new Error("Unable to get file after retries.");
  };

  const gridStyles = useMemo(
    () => ({
      display: "grid",
      gap: "1rem",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    }),
    []
  );

  // ──────────────────────────────────────────────────────────────
  // Load sheets
  const fetchFlashSheets = async () => {
    try {
      setLoadingSheets(true);
      setFetchError(null);
      const q = query(
        collection(db, "flashSheets"),
        where("artistId", "==", uid)
      );
      const snapshot = await getDocs(q);
      setFlashSheets(
        snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as FlashSheet)
        )
      );
    } catch (err: any) {
      setFetchError(err?.message || "Failed to load flash sheets.");
    } finally {
      setLoadingSheets(false);
    }
  };

  useEffect(() => {
    if (uid) fetchFlashSheets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // ──────────────────────────────────────────────────────────────
  // New sheet selection (kept identical behavior + better errors)
  const handleSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPendingSheetFile(file);
    setShowSheetTitleModal(true);

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;

      const testImg = new Image();
      testImg.crossOrigin = "anonymous";
      testImg.onload = () => setSheetImage(base64);
      testImg.onerror = () => {
        toast.error(
          "Your image failed to preview. It might be blocked by browser security."
        );
      };
      testImg.src = base64;
    };
    reader.readAsDataURL(file);
  };

  // ──────────────────────────────────────────────────────────────
  // Submit sheet to Storage -> wait for CF derivatives -> create doc
  const handleSubmitFlashSheet = async () => {
    if (!pendingSheetFile || !uid || !sheetTitleInput) {
      toast("Please provide a title and image.");
      return;
    }

    try {
      setIsUploadingSheet(true);
      const timestamp = Date.now();
      const baseName = `sheet_${timestamp}`;
      const storageBase = `users/${uid}/flashSheets/${baseName}`;
      const originalRef = ref(storage, `${storageBase}.jpg`);

      await uploadBytes(originalRef, pendingSheetFile);
      // Small buffer for CF to create _thumb / _full
      await wait(1200);

      const thumbRef = ref(storage, `${storageBase}_thumb.webp`);
      const fullRef = ref(storage, `${storageBase}_full.jpg`);

      const [thumbUrl, imageUrl] = await Promise.all([
        waitForFile(thumbRef),
        waitForFile(fullRef),
      ]);

      const docRef = await addDoc(collection(db, "flashSheets"), {
        artistId: uid,
        title: sheetTitleInput,
        fileName: baseName,
        imageUrl,
        thumbUrl,
        fullPath: `${storageBase}_full.jpg`,
        createdAt: serverTimestamp(),
      });

      setSheetDocId(docRef.id);
      setSheetTitleInput("");
      setPendingSheetFile(null);
      setShowSheetTitleModal(false);
      toast.success("Flash sheet uploaded!");

      // Refresh list immediately for crisp UX
      fetchFlashSheets();
    } catch (err: any) {
      toast.error(err?.message || "Upload failed. Please try again.");
    } finally {
      setIsUploadingSheet(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Crop from the sheet (same helper signature)
  const handleCropComplete = (_: any, croppedAreaPixels: Area) => {
    setCurrentCrop(croppedAreaPixels);
  };

  const handleSaveCropRequest = async () => {
    if (!sheetImage || !currentCrop) {
      toast("Choose an area to crop.");
      return;
    }
    try {
      const blob = await getCroppedImg(sheetImage, currentCrop);
      setPendingBlob(blob);
      setShowFlashDetailsModal(true);
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate crop.");
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Save cropped flash (same storage & Firestore logic you use)
  const handleFlashSubmit = async () => {
    if (!pendingBlob || !uid) return;

    try {
      setIsSavingFlash(true);

      const timestamp = Date.now();
      const baseName = `flash_${timestamp}`;
      const originalFilename = `${baseName}.jpg`;
      const storageBasePath = `users/${uid}/flashes/${baseName}`;
      const originalRef = ref(
        storage,
        `users/${uid}/flashes/${originalFilename}`
      );

      await uploadBytes(originalRef, pendingBlob);
      // Wait for CF thumbs/previews
      await wait(1200);

      const fullRef = ref(storage, `${storageBasePath}_full.jpg`);
      const thumbRef = ref(storage, `${storageBasePath}_thumb.webp`);
      const webp90Ref = ref(storage, `${storageBasePath}_webp90.webp`);

      const [fullUrl, thumbUrl, webp90Url] = await Promise.all([
        waitForFile(fullRef),
        waitForFile(thumbRef),
        waitForFile(webp90Ref),
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
        sheetId: sheetDocId,
        createdAt: serverTimestamp(),
      });

      // Reset UI
      setTitleInput("");
      setPriceInput("");
      setCurrentCrop(null);
      setPendingBlob(null);
      setShowFlashDetailsModal(false);

      toast.success("Flash saved!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save flash.");
    } finally {
      setIsSavingFlash(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Render
  return (
    <div className="space-y-6">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
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

      {/* Individual Upload Modal (unchanged behavior) */}
      {isUploadOpen && (
        <UploadModal
          uid={uid}
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          collectionType="flashes"
          onUploadComplete={() => toast.success("Flash uploaded!")}
        />
      )}

      {/* Name Sheet Modal */}
      {showSheetTitleModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-30">
          <div className="bg-zinc-900 p-6 rounded w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold text-white">
              Name This Flash Sheet
            </h2>
            <input
              type="text"
              value={sheetTitleInput}
              onChange={(e) => setSheetTitleInput(e.target.value)}
              placeholder="Flash Sheet Title"
              className="bg-zinc-800 text-white px-3 py-2 rounded w-full"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSheetTitleModal(false);
                  setSheetTitleInput("");
                  setPendingSheetFile(null);
                }}
                className="bg-rose-600 text-white px-4 py-2 rounded hover:bg-rose-700"
                disabled={isUploadingSheet}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitFlashSheet}
                className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 disabled:opacity-60"
                disabled={isUploadingSheet || !sheetTitleInput.trim()}
              >
                {isUploadingSheet ? "Uploading…" : "Upload Sheet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cropper (only after a sheet is loaded) */}
      {sheetImage && (
        <div className="relative w-full h-[560px] z-10 rounded overflow-hidden">
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

          {/* Simple controls overlay */}
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-3 justify-between z-20">
            <div className="flex items-center gap-2 bg-black/60 px-3 py-2 rounded">
              <span className="text-xs text-white/80">Zoom</span>
              <input
                aria-label="Zoom"
                type="range"
                min={1}
                max={8}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-40"
              />
            </div>

            <div className="flex gap-2">
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
                Done Cropping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flash Details Modal */}
      {showFlashDetailsModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-30">
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
                className="bg-zinc-700 text-white px-4 py-2 rounded"
                disabled={isSavingFlash}
              >
                Cancel
              </button>
              <button
                onClick={handleFlashSubmit}
                className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 disabled:opacity-60"
                disabled={isSavingFlash}
              >
                {isSavingFlash ? "Saving…" : "Save Flash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sheets List */}
      <h2 className="text-lg! font-bold text-white mb-2 mt-10">
        Your Flash Sheets
      </h2>

      {/* Loading state */}
      {loadingSheets && (
        <div style={gridStyles}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded overflow-hidden bg-zinc-900 animate-pulse"
            >
              <div className="w-full h-48 bg-zinc-800" />
              <div className="p-3">
                <div className="h-4 w-2/3 bg-zinc-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {fetchError && !loadingSheets && (
        <div className="text-rose-400 text-sm">{fetchError}</div>
      )}

      {/* Empty state */}
      {!loadingSheets && !fetchError && flashSheets.length === 0 && (
        <div className="text-zinc-400 text-sm">
          No flash sheets yet. Upload one to start cropping flashes.
        </div>
      )}

      {/* Grid of sheets */}
      {!loadingSheets && flashSheets.length > 0 && (
        <div style={gridStyles}>
          {flashSheets.map((sheet) => (
            <button
              key={sheet.id}
              onClick={() => navigate(`/flash-sheet/${sheet.id}`)}
              className="text-left cursor-pointer rounded overflow-hidden bg-zinc-900 hover:bg-zinc-800 transition shadow"
            >
              <img
                src={sheet.thumbUrl || sheet.imageUrl}
                alt={sheet.title}
                className="w-full h-48 object-cover"
                loading="lazy"
              />
              <div className="px-3 py-2">
                <h3 className="font-semibold truncate">{sheet.title}</h3>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FlashManager;
