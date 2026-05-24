import { useEffect, useState } from "react";
import { storage, db } from "../firebase/firebaseConfig";
import { ref, uploadBytes } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import ImageCropperModal from "./ImageCropperModal";
import {
  DollarSign,
  Image as ImageIcon,
  Layers,
  Tag,
  Upload,
  X,
} from "lucide-react";
import { parseTags } from "../utils/tags";
import type { FlashSheet } from "../types/FlashSheet";

type Props = {
  uid: string;
  isOpen: boolean;
  onClose: () => void;
  collectionType: "flashes" | "gallery";
  artistStripeConnectReady?: boolean;
  onUploadComplete: () => void;
  availableSheets?: FlashSheet[];
  allowSheetLink?: boolean;
};

const UploadModal: React.FC<Props> = ({
  uid,
  isOpen,
  onClose,
  collectionType,
  artistStripeConnectReady = false,
  onUploadComplete,
  availableSheets = [],
  allowSheetLink = false,
}) => {
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captionOrTitle, setCaptionOrTitle] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const isFlashUpload = collectionType === "flashes";
  const selectedSheet = availableSheets.find(
    (sheet) => sheet.id === selectedSheetId
  );

  useEffect(() => {
    if (!croppedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(croppedFile);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [croppedFile]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setCropSrc(null);
    setCroppedFile(null);
    setPreviewUrl(null);
    setCaptionOrTitle("");
    setPriceInput("");
    setTagsInput("");
    setSelectedSheetId("");
    setIsUploading(false);
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setCroppedFile(null);
    setPreviewUrl(null);

    const reader = new FileReader();
    reader.onloadend = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const handleFinalUpload = async () => {
    if (!croppedFile || isUploading) return;
    if (isFlashUpload && !artistStripeConnectReady) {
      console.error("Stripe Connect is required before uploading flash.");
      return;
    }

    setIsUploading(true);

    try {
      const timestamp = Date.now();
      const ext = croppedFile.name.split(".").pop() || "jpg";
      const baseName = `upload-${timestamp}`;
      const uniqueName = `${baseName}.${ext}`;
      const tags = parseTags(tagsInput);
      const price = isFlashUpload && priceInput ? parseFloat(priceInput) : null;
      const isLinkedToSheet = isFlashUpload && Boolean(selectedSheetId);

      await addDoc(collection(db, collectionType), {
        artistId: uid,
        caption: captionOrTitle || null,
        title: isFlashUpload ? captionOrTitle || "Untitled Flash" : null,
        price,
        tags,
        artistStripeConnectReady: isFlashUpload
          ? artistStripeConnectReady
          : null,
        marketplaceVisible: isFlashUpload ? artistStripeConnectReady : null,
        fileName: baseName,
        timestamp,
        isAvailable: isFlashUpload ? true : null,
        isFromSheet: isFlashUpload ? isLinkedToSheet : null,
        sheetId: isFlashUpload ? selectedSheetId || null : null,
        status: "processing",
        createdAt: serverTimestamp(),
      });

      const storageRef = ref(
        storage,
        `users/${uid}/${collectionType}/${uniqueName}`
      );
      await uploadBytes(storageRef, croppedFile);

      onUploadComplete();
      resetAndClose();
    } catch (err) {
      console.error("Upload failed:", err);
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-xl">
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111111] text-white shadow-2xl md:grid-cols-[0.95fr_1.05fr]">
        <button
          type="button"
          onClick={resetAndClose}
          className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-white/5 p-2! text-zinc-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Close upload modal"
        >
          <X size={18} />
        </button>

        <div className="border-b border-white/10 bg-black/30 p-5 md:border-b-0 md:border-r md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            {isFlashUpload ? "Flash upload" : "Gallery upload"}
          </p>
          <h2 className="mt-3 text-2xl! font-bold text-white">
            {isFlashUpload ? "Add a flash design" : "Add gallery work"}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
            {isFlashUpload
              ? "Crop a clean square, add the details clients need, and choose whether this belongs to one of your sheets."
              : "Crop the image, add a caption and tags, then publish it to your portfolio."}
          </p>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black/35">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Upload preview"
                className="aspect-square w-full object-cover"
              />
            ) : (
              <label className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-4 text-center transition hover:bg-white/[0.03]">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-300">
                  <Upload size={26} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">
                    Choose image
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    Square crop opens after selection
                  </span>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {previewUrl && (
            <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4! py-3! text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
              <ImageIcon size={17} />
              Replace image
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          )}
        </div>

        <div className="p-5 md:p-6">
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-zinc-300">
                {isFlashUpload ? "Flash title" : "Caption"}
              </span>
              <input
                type="text"
                placeholder={
                  isFlashUpload ? "Dragon and peony" : "Fresh healed sleeve"
                }
                value={captionOrTitle}
                onChange={(e) => setCaptionOrTitle(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
              />
            </label>

            {isFlashUpload && (
              <label className="block">
                <span className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                  <DollarSign size={16} />
                  Price
                </span>
                <input
                  type="number"
                  placeholder="Optional"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
                />
              </label>
            )}

            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                <Tag size={16} />
                Tags
              </span>
              <input
                type="text"
                placeholder="dragon, color, anime"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
              />
            </label>

            {isFlashUpload && allowSheetLink && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-300">
                    <Layers size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">
                      Sheet relationship
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      Keep it standalone or attach it to a sheet so it also
                      appears when clients browse that collection.
                    </p>
                    <select
                      value={selectedSheetId}
                      onChange={(e) => setSelectedSheetId(e.target.value)}
                      className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3! py-3! text-sm text-white outline-none focus:border-red-400/70"
                    >
                      <option value="">Standalone flash</option>
                      {availableSheets.map((sheet) => (
                        <option key={sheet.id} value={sheet.id}>
                          {sheet.title || "Untitled sheet"}
                        </option>
                      ))}
                    </select>
                    {selectedSheet && (
                      <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-2">
                        <img
                          src={selectedSheet.thumbUrl || selectedSheet.imageUrl}
                          alt={selectedSheet.title || "Selected sheet"}
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                        <span className="truncate text-sm text-zinc-300">
                          Linked to {selectedSheet.title || "Untitled sheet"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-xl border border-white/10 bg-white/5 px-5! py-3! text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFinalUpload}
              disabled={!croppedFile || isUploading}
              className="rounded-xl bg-white px-5! py-3! text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isUploading ? "Uploading..." : "Publish"}
            </button>
          </div>
        </div>
      </div>

      {cropSrc && (
        <ImageCropperModal
          imageSrc={cropSrc}
          aspect={isFlashUpload ? 1 : 4 / 5}
          onCancel={() => {
            setCropSrc(null);
          }}
          onSave={(cropped) => {
            setCroppedFile(cropped);
            setCropSrc(null);
          }}
        />
      )}
    </div>
  );
};

export default UploadModal;
