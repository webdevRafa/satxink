import { useEffect, useState } from "react";
import { storage, db } from "../firebase/firebaseConfig";
import { ref, uploadBytes } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import ImageCropperModal from "./ImageCropperModal";
import {
  Check,
  DollarSign,
  Image as ImageIcon,
  Layers,
  Tag,
  Upload,
  X,
} from "lucide-react";
import { parseTags } from "../utils/tags";
import type { FlashSheet } from "../types/FlashSheet";
import CustomSelect from "./ui/CustomSelect";
import type { SelectOption } from "../utils/timeOptions";

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

type SheetRelationshipMode = "standalone" | "existing";

const mergeTags = (currentTags: string[], incomingTags: string[]) => {
  const existing = new Set(currentTags.map((tag) => tag.toLowerCase()));
  const merged = [...currentTags];

  incomingTags.forEach((tag) => {
    const normalized = tag.trim().replace(/^#/, "").toLowerCase();
    if (normalized && !existing.has(normalized)) {
      merged.push(normalized);
      existing.add(normalized);
    }
  });

  return merged;
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
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [sheetRelationshipMode, setSheetRelationshipMode] =
    useState<SheetRelationshipMode>("standalone");
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const isFlashUpload = collectionType === "flashes";
  const sheetRelationshipOptions: SelectOption[] = availableSheets.map(
    (sheet) => ({
      value: sheet.id,
      label: sheet.title || "Untitled sheet",
    })
  );
  const isLinkingExistingSheet = sheetRelationshipMode === "existing";
  const selectedSheet = availableSheets.find(
    (sheet) => sheet.id === selectedSheetId && isLinkingExistingSheet
  );
  const selectedSheetPreviewUrl =
    selectedSheet?.thumbUrl || selectedSheet?.imageUrl;
  const canPublish =
    Boolean(croppedFile) && (!isLinkingExistingSheet || Boolean(selectedSheetId));

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
    setTags([]);
    setTagDraft("");
    setSheetRelationshipMode("standalone");
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

  const addTags = (rawValue: string) => {
    const nextTags = parseTags(rawValue);
    if (nextTags.length === 0) return;

    setTags((currentTags) => mergeTags(currentTags, nextTags));
  };

  const handleTagDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (!/[\s,]/.test(value)) {
      setTagDraft(value);
      return;
    }

    const parts = value.split(/[\s,]+/);
    const endsWithSeparator = /[\s,]$/.test(value);
    const completedParts = endsWithSeparator ? parts : parts.slice(0, -1);

    addTags(completedParts.join(" "));
    setTagDraft(endsWithSeparator ? "" : parts[parts.length - 1] || "");
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === "Tab") && tagDraft.trim()) {
      e.preventDefault();
      addTags(tagDraft);
      setTagDraft("");
      return;
    }

    if (e.key === "Backspace" && !tagDraft && tags.length > 0) {
      setTags((currentTags) => currentTags.slice(0, -1));
    }
  };

  const handleTagBlur = () => {
    if (!tagDraft.trim()) return;
    addTags(tagDraft);
    setTagDraft("");
  };

  const removeTag = (tagToRemove: string) => {
    setTags((currentTags) => currentTags.filter((tag) => tag !== tagToRemove));
  };

  const handleFinalUpload = async () => {
    if (!canPublish || !croppedFile || isUploading) return;
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
      const uploadTags = mergeTags(tags, parseTags(tagDraft));
      const price = isFlashUpload && priceInput ? parseFloat(priceInput) : null;
      const linkedSheetId =
        isFlashUpload && isLinkingExistingSheet ? selectedSheetId : "";

      await addDoc(collection(db, collectionType), {
        artistId: uid,
        caption: captionOrTitle || null,
        title: isFlashUpload ? captionOrTitle || "Untitled Flash" : null,
        price,
        tags: uploadTags,
        artistStripeConnectReady: isFlashUpload
          ? artistStripeConnectReady
          : null,
        marketplaceVisible: isFlashUpload ? artistStripeConnectReady : null,
        fileName: baseName,
        timestamp,
        isAvailable: isFlashUpload ? true : null,
        isFromSheet: isFlashUpload ? Boolean(linkedSheetId) : null,
        sheetId: isFlashUpload ? linkedSheetId || null : null,
        status: "processing",
        createdAt: serverTimestamp(),
      });

      await uploadBytes(
        ref(storage, `users/${uid}/${collectionType}/${uniqueName}`),
        croppedFile
      );

      onUploadComplete();
      resetAndClose();
    } catch (err) {
      console.error("Upload failed:", err);
      setIsUploading(false);
    }
  };

  return (
    <div className="request-modal-scrollbar fixed inset-0 z-[120] overflow-y-auto bg-black/80 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-xl sm:px-4 sm:py-6 md:overflow-hidden md:px-4 md:py-0 md:pb-0">
      <div className="mx-auto flex min-h-full w-full items-start justify-center md:h-full md:min-h-0 md:items-end">
        <div className="relative grid w-full max-w-5xl overflow-visible rounded-[1.25rem] border border-white/10 bg-[#111111] text-white shadow-2xl md:h-[calc(100vh-5.25rem)] md:grid-cols-[0.95fr_1.05fr] md:rounded-b-none">
        <button
          type="button"
          onClick={resetAndClose}
          className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-white/5 p-2! text-zinc-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Close upload modal"
        >
          <X size={18} />
        </button>

        <div className="border-b border-white/10 bg-black/30 p-4 md:border-b-0 md:border-r md:p-6">
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

          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/35 md:mt-6">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Platform flash preview"
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

          {previewUrl && isFlashUpload && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
              <p className="text-xs font-semibold text-white">
                Platform preview
              </p>
              <p className="mt-1 text-xs leading-4 text-zinc-500">
                This 1:1 crop matches the square frame used by flash items
                cropped from sheets.
              </p>
            </div>
          )}

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

        <div className="p-4 md:p-6">
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

            <div>
              <span className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                <Tag size={16} />
                Tags
              </span>
              <div className="mt-2 flex min-h-[52px] w-full flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-3! py-2! transition focus-within:border-red-400/70">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flash-upload-tag-pill inline-flex items-center gap-1.5 rounded-full border border-red-200/20 bg-red-500/10 px-2.5! py-1.5! text-xs font-semibold text-red-100"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="rounded-full p-0.5! text-red-100/70 transition hover:bg-white/10 hover:text-white"
                      aria-label={`Remove ${tag} tag`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder={
                    tags.length > 0 ? "Add another" : "dragon, color, anime"
                  }
                  value={tagDraft}
                  onChange={handleTagDraftChange}
                  onKeyDown={handleTagKeyDown}
                  onBlur={handleTagBlur}
                  className="min-w-[9rem] flex-1 bg-transparent px-1! py-1.5! text-sm text-white outline-none placeholder:text-zinc-600"
                />
              </div>
              <p className="mt-1.5 text-xs leading-5 text-zinc-500">
                Press space or comma to create a tag.
              </p>
            </div>

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
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSheetRelationshipMode("standalone");
                          setSelectedSheetId("");
                        }}
                        className={`flex items-center justify-between rounded-xl border px-3! py-3! text-left transition ${
                          !isLinkingExistingSheet
                            ? "border-red-300/45 bg-red-500/10 text-white"
                            : "border-white/10 bg-black/25 text-zinc-300 hover:border-white/20 hover:bg-white/[0.05]"
                        }`}
                      >
                        <span className="text-sm font-semibold">
                          Standalone flash
                        </span>
                        {!isLinkingExistingSheet && (
                          <Check size={15} className="text-red-100" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetRelationshipMode("existing")}
                        disabled={availableSheets.length === 0}
                        className={`flex items-center justify-between rounded-xl border px-3! py-3! text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          isLinkingExistingSheet
                            ? "border-red-300/45 bg-red-500/10 text-white"
                            : "border-white/10 bg-black/25 text-zinc-300 hover:border-white/20 hover:bg-white/[0.05]"
                        }`}
                      >
                        <span className="text-sm font-semibold">
                          Existing sheet
                        </span>
                        {isLinkingExistingSheet && (
                          <Check size={15} className="text-red-100" />
                        )}
                      </button>
                    </div>
                    {isLinkingExistingSheet && (
                      <CustomSelect
                        value={selectedSheetId}
                        onChange={setSelectedSheetId}
                        options={sheetRelationshipOptions}
                        placeholder="Choose existing sheet"
                        className="mt-3"
                        buttonClassName="rounded-xl border-white/10 bg-black/40 py-3 focus:border-red-400/70"
                        optionsClassName="z-[70] max-h-44 sm:max-h-52"
                        optionsPlacement="top"
                      />
                    )}
                    {availableSheets.length === 0 && (
                      <p className="mt-2 text-xs leading-5 text-zinc-500">
                        Upload a flash sheet first when you want to link items to
                        a collection.
                      </p>
                    )}
                    {selectedSheet && (
                      <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-2">
                        {selectedSheetPreviewUrl ? (
                          <img
                            src={selectedSheetPreviewUrl}
                            alt={selectedSheet.title || "Selected sheet"}
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400">
                            <Layers size={18} />
                          </span>
                        )}
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
              disabled={!canPublish || isUploading}
              className="rounded-xl bg-white px-5! py-3! text-sm font-semibold text-neutral-950! transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:text-neutral-900! disabled:opacity-45"
            >
              {isUploading ? "Uploading..." : "Publish"}
            </button>
          </div>
        </div>
        </div>
      </div>

      {cropSrc && (
        <ImageCropperModal
          imageSrc={cropSrc}
          aspect={isFlashUpload ? 1 : 4 / 5}
          cropShape="rect"
          outputSize={isFlashUpload ? 1080 : undefined}
          title={isFlashUpload ? "Frame your flash" : "Position your photo"}
          description={
            isFlashUpload
              ? "Center the design inside the square marketplace crop used across SATX Ink."
              : "Drag to frame the image, then zoom until it feels right."
          }
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
