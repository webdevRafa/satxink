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
import type { FlashSheet } from "../types/FlashSheet";
import type { FlashRepeatability } from "../types/Flash";
import CustomSelect from "./ui/CustomSelect";
import type { SelectOption } from "../utils/timeOptions";
import AnimatedTagInput from "./ui/AnimatedTagInput";
import FlashRepeatabilityControl from "./FlashRepeatabilityControl";
import {
  FLASH_DESCRIPTION_MAX_LENGTH,
  normalizeFlashDescription,
} from "../utils/flashSourceQuality";

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

const parsePositivePrice = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
  const [originalGalleryFile, setOriginalGalleryFile] = useState<File | null>(
    null
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captionOrTitle, setCaptionOrTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [repeatability, setRepeatability] =
    useState<FlashRepeatability>("repeatable");
  const [sheetRelationshipMode, setSheetRelationshipMode] =
    useState<SheetRelationshipMode>("standalone");
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const isFlashUpload = collectionType === "flashes";
  const isGalleryUpload = collectionType === "gallery";
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
  const parsedFlashPrice = parsePositivePrice(priceInput);
  const canPublish =
    Boolean(croppedFile) &&
    (!isGalleryUpload || Boolean(originalGalleryFile)) &&
    (!isLinkingExistingSheet || Boolean(selectedSheetId)) &&
    (!isFlashUpload || parsedFlashPrice !== null);

  useEffect(() => {
    if (!croppedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(croppedFile);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [croppedFile]);

  useEffect(() => {
    if (!isFlashUpload || !selectedSheet || !isLinkingExistingSheet) return;

    setRepeatability(
      selectedSheet.repeatabilityDefault === "one_of_one"
        ? "one_of_one"
        : "repeatable"
    );
  }, [isFlashUpload, isLinkingExistingSheet, selectedSheet]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setCropSrc(null);
    setCroppedFile(null);
    setOriginalGalleryFile(null);
    setPreviewUrl(null);
    setCaptionOrTitle("");
    setDescription("");
    setPriceInput("");
    setTags([]);
    setRepeatability("repeatable");
    setSheetRelationshipMode("standalone");
    setSelectedSheetId("");
    setIsUploading(false);
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setCroppedFile(null);
    setOriginalGalleryFile(isGalleryUpload ? selected : null);
    setPreviewUrl(null);

    const reader = new FileReader();
    reader.onloadend = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const handleFinalUpload = async () => {
    if (
      !canPublish ||
      !croppedFile ||
      (isGalleryUpload && !originalGalleryFile) ||
      isUploading
    )
      return;
    if (isFlashUpload && !artistStripeConnectReady) {
      console.error("Stripe Connect is required before uploading flash.");
      return;
    }

    setIsUploading(true);

    try {
      const timestamp = Date.now();
      const ext = croppedFile.name.split(".").pop() || "jpg";
      const originalExt =
        originalGalleryFile?.name.split(".").pop()?.toLowerCase() || ext;
      const baseName = `upload-${timestamp}`;
      const uniqueName = `${baseName}.${ext}`;
      const originalUniqueName = `${baseName}.${originalExt}`;
      const price = isFlashUpload ? parsedFlashPrice : null;
      const linkedSheetId =
        isFlashUpload && isLinkingExistingSheet ? selectedSheetId : "";

      await addDoc(collection(db, collectionType), {
        artistId: uid,
        caption: captionOrTitle || null,
        title: isFlashUpload ? captionOrTitle || "Untitled Flash" : null,
        description: isFlashUpload ? normalizeFlashDescription(description) : null,
        price,
        tags,
        artistStripeConnectReady: isFlashUpload
          ? artistStripeConnectReady
          : null,
        marketplaceVisible: isFlashUpload ? artistStripeConnectReady : null,
        fileName: baseName,
        ...(isGalleryUpload ? { originalFileName: baseName } : {}),
        timestamp,
        isAvailable: isFlashUpload ? true : null,
        repeatability: isFlashUpload ? repeatability : null,
        availabilityStatus: isFlashUpload ? "available" : null,
        isFromSheet: isFlashUpload ? Boolean(linkedSheetId) : null,
        sheetId: isFlashUpload ? linkedSheetId || null : null,
        status: "processing",
        createdAt: serverTimestamp(),
      });

      const uploadTasks = [
        uploadBytes(
          ref(storage, `users/${uid}/${collectionType}/${uniqueName}`),
          croppedFile
        ),
      ];

      if (isGalleryUpload && originalGalleryFile) {
        uploadTasks.push(
          uploadBytes(
            ref(storage, `users/${uid}/galleryOriginals/${originalUniqueName}`),
            originalGalleryFile,
            { contentType: originalGalleryFile.type || "image/jpeg" }
          )
        );
      }

      await Promise.all(uploadTasks);

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
                  min={1}
                  placeholder="Required"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
                />
              </label>
            )}

            {isFlashUpload && (
              <label className="block">
                <span className="text-sm font-semibold text-zinc-300">
                  Short public note
                </span>
                <textarea
                  value={description}
                  onChange={(e) =>
                    setDescription(
                      e.target.value.slice(0, FLASH_DESCRIPTION_MAX_LENGTH)
                    )
                  }
                  placeholder="Optional context, placement idea, or what clients should focus on."
                  className="mt-2 min-h-20 w-full resize-none rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
                />
                <span className="mt-1 block text-right text-[11px] text-zinc-600">
                  {description.length}/{FLASH_DESCRIPTION_MAX_LENGTH}
                </span>
              </label>
            )}

            <AnimatedTagInput
              value={tags}
              onChange={setTags}
              label={
                <>
                  <Tag size={16} />
                  Tags
                </>
              }
            />

            {isFlashUpload && (
              <FlashRepeatabilityControl
                value={repeatability}
                onChange={setRepeatability}
                label="Availability"
                description="Use one of one for designs that should disappear once a client starts checkout."
                disabled={isUploading}
              />
            )}

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
                          setRepeatability("repeatable");
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
              className="modal-action-button rounded-lg! border border-white/10 bg-white/5 px-3! py-2! text-xs! font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFinalUpload}
              disabled={!canPublish || isUploading}
              className="modal-action-button rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-neutral-950! transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:text-neutral-900! disabled:opacity-45"
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
