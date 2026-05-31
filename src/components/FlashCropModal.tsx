import { useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { DollarSign, Scissors, Tag, X } from "lucide-react";
import toast from "react-hot-toast";

import { getCroppedImg } from "../utils/cropImage";
import { db, storage } from "../firebase/firebaseConfig";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import AnimatedTagInput from "./ui/AnimatedTagInput";

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
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleCropComplete = (_: Area, areaPixels: Area) => {
    setCropArea(areaPixels);
  };

  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const waitForFile = async (
    storageRef: ReturnType<typeof ref>,
    retries = 10,
    delay = 1000
  ) => {
    for (let i = 0; i < retries; i += 1) {
      try {
        return await getDownloadURL(storageRef);
      } catch (err) {
        if (i === retries - 1) throw err;
        await wait(delay);
      }
    }

    throw new Error("File was not ready after retries.");
  };

  const handleSubmit = async () => {
    if (!cropArea || isSaving) return;

    try {
      setIsSaving(true);
      const croppedBlob = await getCroppedImg(sheetImageUrl, cropArea);
      const timestamp = Date.now();
      const baseName = `flash_${timestamp}`;
      const storageBase = `users/${uid}/flashes/${baseName}`;
      const originalRef = ref(storage, `${storageBase}.jpg`);

      await uploadBytes(originalRef, croppedBlob);
      await wait(1200);

      const thumbRef = ref(storage, `${storageBase}_thumb.webp`);
      const fullRef = ref(storage, `${storageBase}_full.jpg`);
      const webpRef = ref(storage, `${storageBase}_webp90.webp`);

      const [thumbUrl, fullUrl, webp90Url] = await Promise.all([
        waitForFile(thumbRef),
        waitForFile(fullRef),
        waitForFile(webpRef),
      ]);

      await addDoc(collection(db, "flashes"), {
        artistId: uid,
        sheetId,
        title: title.trim() || "Untitled Flash",
        price: price ? parseFloat(price) : null,
        tags,
        fullUrl,
        thumbUrl,
        webp90Url,
        isFromSheet: true,
        artistStripeConnectReady: true,
        marketplaceVisible: true,
        createdAt: serverTimestamp(),
      });

      toast.success("Flash saved.");
      onFlashAdded();
      onClose();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save flash."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 py-6 backdrop-blur-xl">
      <div className="relative grid h-[min(900px,92vh)] w-full max-w-7xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111111] text-white shadow-2xl lg:grid-cols-[minmax(0,1fr)_360px]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/50 p-2! text-zinc-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Close crop modal"
          disabled={isSaving}
        >
          <X size={18} />
        </button>

        <div className="flex min-h-0 flex-col">
          <div className="border-b border-white/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
              Crop from sheet
            </p>
            <h2 className="mt-2 text-2xl! font-bold text-white">
              Create a flash item
            </h2>
          </div>
          <div className="relative min-h-[420px] flex-1 bg-black">
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
        </div>

        <aside className="flex min-h-0 flex-col border-t border-white/10 bg-black/30 lg:border-l lg:border-t-0">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-300">
                  <Scissors size={18} />
                </span>
                <p className="text-sm leading-6 text-zinc-400">
                  Crop around one design. The item will stay connected to this
                  flash sheet for future editing and browsing.
                </p>
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-zinc-300">Zoom</span>
              <input
                aria-label="Zoom"
                type="range"
                min={1}
                max={8}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="mt-3 w-full accent-red-400"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-zinc-300">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Dragon"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
              />
            </label>

            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                <DollarSign size={16} />
                Price
              </span>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Optional"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
              />
            </label>

            <AnimatedTagInput
              value={tags}
              onChange={setTags}
              label={
                <>
                  <Tag size={16} />
                  Tags
                </>
              }
              emptyPlaceholder="anime, color, dragon"
            />
          </div>

          <div className="border-t border-white/10 p-5">
            <div className="flex flex-col-reverse gap-3 sm:flex-row lg:flex-col-reverse">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/5 px-5! py-3! text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="rounded-xl bg-white px-5! py-3! text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={isSaving || !cropArea}
              >
                {isSaving ? "Saving..." : "Save flash"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default FlashCropModal;
