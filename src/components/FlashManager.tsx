import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Grid2X2,
  Image as ImageIcon,
  Layers,
  Plus,
  Scissors,
  Sparkles,
  Tag,
  Upload,
  X,
} from "lucide-react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import toast from "react-hot-toast";

import { db, storage } from "../firebase/firebaseConfig";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { FlashSheet } from "../types/FlashSheet";
import type { Flash } from "../types/Flash";
import { getCroppedImg } from "../utils/cropImage";
import { parseTags } from "../utils/tags";
import {
  isStripeConnectReady,
  type StripeConnectLike,
} from "../utils/stripeConnect";
import UploadModal from "./UploadModal";

type FlashManagerProps = {
  uid: string;
  artist?: StripeConnectLike | null;
  onOpenPayments?: () => void;
};

type UploadMode = "individual" | "sheet";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const FlashManager = ({ uid, artist, onOpenPayments }: FlashManagerProps) => {
  const navigate = useNavigate();
  const stripeReady = isStripeConnectReady(artist);

  const [mode, setMode] = useState<UploadMode>("individual");
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const [flashSheets, setFlashSheets] = useState<FlashSheet[]>([]);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [sheetDocId, setSheetDocId] = useState<string | null>(null);
  const [sheetImage, setSheetImage] = useState<string | null>(null);
  const [pendingSheetFile, setPendingSheetFile] = useState<File | null>(null);
  const [showSheetTitleModal, setShowSheetTitleModal] = useState(false);
  const [sheetTitleInput, setSheetTitleInput] = useState("");
  const [sheetTagsInput, setSheetTagsInput] = useState("");
  const [isUploadingSheet, setIsUploadingSheet] = useState(false);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [currentCrop, setCurrentCrop] = useState<Area | null>(null);
  const [showFlashDetailsModal, setShowFlashDetailsModal] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [flashTagsInput, setFlashTagsInput] = useState("");
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [isSavingFlash, setIsSavingFlash] = useState(false);

  const linkedFlashCount = useMemo(
    () => flashes.filter((flash) => flash.isFromSheet || flash.sheetId).length,
    [flashes]
  );

  const standaloneFlashCount = Math.max(flashes.length - linkedFlashCount, 0);

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

    throw new Error("Unable to get file after retries.");
  };

  const fetchFlashData = async () => {
    try {
      setLoading(true);
      setFetchError(null);

      const sheetsQuery = query(
        collection(db, "flashSheets"),
        where("artistId", "==", uid)
      );
      const flashesQuery = query(
        collection(db, "flashes"),
        where("artistId", "==", uid)
      );

      const [sheetSnapshot, flashSnapshot] = await Promise.all([
        getDocs(sheetsQuery),
        getDocs(flashesQuery),
      ]);

      setFlashSheets(
        sheetSnapshot.docs.map(
          (sheetDoc) => ({ id: sheetDoc.id, ...sheetDoc.data() } as FlashSheet)
        )
      );
      setFlashes(
        flashSnapshot.docs.map(
          (flashDoc) => ({ id: flashDoc.id, ...flashDoc.data() } as Flash)
        )
      );
    } catch (err: unknown) {
      setFetchError(getErrorMessage(err, "Failed to load flash."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (uid) fetchFlashData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const handleSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!stripeReady) {
      toast.error("Connect Stripe before adding flash to the marketplace.");
      e.target.value = "";
      return;
    }

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
      testImg.onerror = () =>
        toast.error("This image could not be previewed. Try another file.");
      testImg.src = base64;
    };
    reader.readAsDataURL(file);
  };

  const closeSheetTitleModal = () => {
    setShowSheetTitleModal(false);
    setSheetTitleInput("");
    setSheetTagsInput("");
    setPendingSheetFile(null);
    setSheetImage(null);
  };

  const handleSubmitFlashSheet = async () => {
    if (!stripeReady) {
      toast.error("Connect Stripe before adding flash sheets.");
      return;
    }

    if (!pendingSheetFile || !uid || !sheetTitleInput.trim()) {
      toast("Add a sheet title before uploading.");
      return;
    }

    try {
      setIsUploadingSheet(true);
      const timestamp = Date.now();
      const baseName = `sheet_${timestamp}`;
      const storageBase = `users/${uid}/flashSheets/${baseName}`;
      const originalRef = ref(storage, `${storageBase}.jpg`);

      await uploadBytes(originalRef, pendingSheetFile);
      await wait(1200);

      const thumbRef = ref(storage, `${storageBase}_thumb.webp`);
      const fullRef = ref(storage, `${storageBase}_full.jpg`);

      const [thumbUrl, imageUrl] = await Promise.all([
        waitForFile(thumbRef),
        waitForFile(fullRef),
      ]);

      const docRef = await addDoc(collection(db, "flashSheets"), {
        artistId: uid,
        title: sheetTitleInput.trim(),
        tags: parseTags(sheetTagsInput),
        artistStripeConnectReady: true,
        marketplaceVisible: true,
        fileName: baseName,
        imageUrl,
        thumbUrl,
        fullPath: `${storageBase}_full.jpg`,
        createdAt: serverTimestamp(),
      });

      setSheetDocId(docRef.id);
      setSheetTitleInput("");
      setSheetTagsInput("");
      setPendingSheetFile(null);
      setShowSheetTitleModal(false);
      setMode("sheet");
      toast.success("Flash sheet uploaded.");
      fetchFlashData();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Upload failed. Please try again."));
    } finally {
      setIsUploadingSheet(false);
    }
  };

  const handleCropComplete = (_: Area, croppedAreaPixels: Area) => {
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
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to generate crop."));
    }
  };

  const handleFlashSubmit = async () => {
    if (!pendingBlob || !uid) return;
    if (!stripeReady) {
      toast.error("Connect Stripe before adding flash to the marketplace.");
      return;
    }

    try {
      setIsSavingFlash(true);

      const timestamp = Date.now();
      const baseName = `flash_${timestamp}`;
      const storageBasePath = `users/${uid}/flashes/${baseName}`;
      const originalRef = ref(storage, `${storageBasePath}.jpg`);

      await uploadBytes(originalRef, pendingBlob);
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
        title: titleInput.trim() || "Untitled Flash",
        price: priceInput ? parseFloat(priceInput) : null,
        tags: parseTags(flashTagsInput),
        artistStripeConnectReady: true,
        marketplaceVisible: true,
        fullUrl,
        thumbUrl,
        webp90Url,
        isFromSheet: true,
        sheetId: sheetDocId,
        createdAt: serverTimestamp(),
      });

      setTitleInput("");
      setPriceInput("");
      setFlashTagsInput("");
      setCurrentCrop(null);
      setPendingBlob(null);
      setShowFlashDetailsModal(false);
      toast.success("Flash saved.");
      fetchFlashData();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to save flash."));
    } finally {
      setIsSavingFlash(false);
    }
  };

  const openIndividualUpload = () => {
    if (!stripeReady) {
      toast.error("Connect Stripe before adding flash to the marketplace.");
      return;
    }
    setIsUploadOpen(true);
  };

  return (
    <div className="mt-6 w-full max-w-7xl space-y-8">
      {!stripeReady && <StripeRequiredNotice onOpenPayments={onOpenPayments} />}

      <section className="overflow-hidden rounded-lg border border-white/10 bg-[#121212]">
        <div className="grid gap-2.5 border-b border-white/10 bg-white/[0.02] p-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-red-300 md:text-[11px]">
              Flash studio
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-4 text-zinc-400 md:text-sm md:leading-5">
              Let clients discover and seamlessly request your flash.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5 md:min-w-[300px] md:gap-2">
            <StatCard label="Sheets" value={flashSheets.length} />
            <StatCard label="Itemized" value={linkedFlashCount} />
            <StatCard label="Solo" value={standaloneFlashCount} />
          </div>
        </div>

        <div className="grid gap-2.5 p-2.5 md:p-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="grid grid-cols-2 gap-1.5 md:gap-2">
            <ModeCard
              active={mode === "individual"}
              icon={<Plus size={15} />}
              title="Individual flash"
              onClick={() => setMode("individual")}
            />
            <ModeCard
              active={mode === "sheet"}
              icon={<Layers size={15} />}
              title="Flash sheet"
              onClick={() => setMode("sheet")}
            />
          </div>

          <div className="rounded-lg border border-white/10 bg-black/25 p-2.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-red-300 md:h-8 md:w-8">
                  {mode === "individual" ? (
                    <ImageIcon size={15} />
                  ) : (
                    <Scissors size={15} />
                  )}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm! font-bold text-white">
                    {mode === "individual"
                      ? "Upload a flash item"
                      : "Upload a flash sheet"}
                  </h3>
                  <p className="mt-1 text-xs leading-4 text-zinc-400">
                    {mode === "individual"
                      ? "Add a one-off piece clients can request."
                      : "Upload a sheet, then crop requestable pieces."}
                  </p>
                </div>
              </div>

              {mode === "individual" ? (
                <button
                  type="button"
                  onClick={openIndividualUpload}
                  className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-md bg-white px-3! text-xs! font-bold text-neutral-950! shadow-sm transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/90 disabled:text-neutral-900! disabled:opacity-100 md:h-9"
                  disabled={!stripeReady}
                >
                  <Upload size={15} className="text-current" />
                  Upload item
                </button>
              ) : (
                <label
                  className={`inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-md bg-white px-3! text-xs! font-bold text-neutral-950! shadow-sm transition hover:bg-white/85 md:h-9 ${
                    stripeReady
                      ? "cursor-pointer"
                      : "cursor-not-allowed bg-white/90 text-neutral-900! opacity-100"
                  }`}
                >
                  <Upload size={15} className="text-current" />
                  Upload sheet
                  {stripeReady && (
                    <input
                      type="file"
                      onChange={handleSheetUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  )}
                </label>
              )}
            </div>
          </div>
        </div>
      </section>

      {isUploadOpen && (
        <UploadModal
          uid={uid}
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          collectionType="flashes"
          artistStripeConnectReady={stripeReady}
          availableSheets={flashSheets}
          allowSheetLink
          onUploadComplete={() => {
            toast.success("Flash uploaded.");
            fetchFlashData();
          }}
        />
      )}

      {showSheetTitleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-xl">
          <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111111] text-white shadow-2xl md:grid-cols-[0.9fr_1.1fr]">
            <button
              type="button"
              onClick={closeSheetTitleModal}
              className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-white/5 p-2! text-zinc-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Close sheet upload modal"
              disabled={isUploadingSheet}
            >
              <X size={18} />
            </button>

            <div className="border-b border-white/10 bg-black/30 p-5 md:border-b-0 md:border-r md:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
                New flash sheet
              </p>
              <h2 className="mt-3 text-2xl! font-bold text-white">
                Name the collection
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                This title appears on your dashboard, public profile, and the
                sheet editor where you crop individual flash.
              </p>
              {sheetImage && (
                <img
                  src={sheetImage}
                  alt="Flash sheet preview"
                  className="mt-5 aspect-square w-full rounded-2xl border border-white/10 object-cover"
                />
              )}
            </div>

            <div className="p-5 md:p-6">
              <label className="block">
                <span className="text-sm font-semibold text-zinc-300">
                  Sheet title
                </span>
                <input
                  type="text"
                  value={sheetTitleInput}
                  onChange={(e) => setSheetTitleInput(e.target.value)}
                  placeholder="Dragon Ball sheet"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
                />
              </label>

              <label className="mt-4 block">
                <span className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                  <Tag size={16} />
                  Sheet tags
                </span>
                <input
                  type="text"
                  value={sheetTagsInput}
                  onChange={(e) => setSheetTagsInput(e.target.value)}
                  placeholder="anime, color, dragon"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
                />
              </label>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-300">
                    <Scissors size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Crop after upload
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      Once the sheet is saved, you can crop designs here or open
                      the dedicated sheet editor any time.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeSheetTitleModal}
                  className="rounded-xl border border-white/10 bg-white/5 px-5! py-3! text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
                  disabled={isUploadingSheet}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitFlashSheet}
                  className="rounded-xl bg-white px-5! py-3! text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={isUploadingSheet || !sheetTitleInput.trim()}
                >
                  {isUploadingSheet ? "Uploading..." : "Save sheet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sheetImage && sheetDocId && (
        <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#121212]">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between md:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
                Freshly uploaded
              </p>
              <h3 className="mt-2 text-2xl! font-bold text-white">
                Crop items from this sheet
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Drag the crop box over a design, zoom if needed, then save it as
                an individual flash item.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetImage(null)}
              className="rounded-xl border border-white/10 bg-white/5 px-4! py-3! text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              Done
            </button>
          </div>
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_280px] md:p-6">
            <div className="relative h-[540px] overflow-hidden rounded-2xl border border-white/10 bg-black">
              <Cropper
                image={sheetImage}
                crop={crop}
                zoom={zoom}
                maxZoom={8}
                aspect={1}
                objectFit="cover"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            </div>
            <aside className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm font-semibold text-white">Crop controls</p>
              <label className="mt-5 block">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Zoom
                </span>
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
              <button
                type="button"
                onClick={handleSaveCropRequest}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4! py-3! text-sm font-semibold text-black transition hover:bg-zinc-200"
              >
                <Scissors size={16} />
                Create flash
              </button>
            </aside>
          </div>
        </section>
      )}

      {showFlashDetailsModal && (
        <FlashDetailsModal
          titleInput={titleInput}
          priceInput={priceInput}
          tagsInput={flashTagsInput}
          isSaving={isSavingFlash}
          onTitleChange={setTitleInput}
          onPriceChange={setPriceInput}
          onTagsChange={setFlashTagsInput}
          onClose={() => {
            setShowFlashDetailsModal(false);
            setFlashTagsInput("");
          }}
          onSave={handleFlashSubmit}
        />
      )}

      <section>
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-300">
              Sheet library
            </p>
            <h2 className="mt-2 text-2xl! font-bold text-white">
              Your flash sheets
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Open any sheet to review the full artwork and keep itemizing it.
            </p>
          </div>
          {flashSheets.length > 0 && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3! py-1.5! text-xs font-semibold text-zinc-300">
              {flashSheets.length} total
            </span>
          )}
        </div>

        {loading && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-80 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
              />
            ))}
          </div>
        )}

        {fetchError && !loading && (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            {fetchError}
          </div>
        )}

        {!loading && !fetchError && flashSheets.length === 0 && (
          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#121212] p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-red-300">
              <Grid2X2 size={22} />
            </span>
            <h3 className="mt-4 text-xl! font-bold text-white">
              No flash sheets yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
              Upload a full sheet when you want clients to browse a complete
              collection and request specific designs from it.
            </p>
          </div>
        )}

        {!loading && flashSheets.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {flashSheets.map((sheet) => {
              const itemCount = flashes.filter(
                (flash) => flash.sheetId === sheet.id
              ).length;
              const tags = Array.isArray(sheet.tags) ? sheet.tags.slice(0, 3) : [];

              return (
                <button
                  key={sheet.id}
                  type="button"
                  onClick={() => navigate(`/flash-sheet/${sheet.id}`)}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-[#151515] text-left transition hover:border-red-300/40 hover:bg-[#191919]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-black">
                    <img
                      src={sheet.thumbUrl || sheet.imageUrl}
                      alt={sheet.title || "Flash sheet"}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4">
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3! py-1.5! text-xs font-semibold text-white backdrop-blur">
                        <Scissors size={14} />
                        {itemCount} itemized
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 truncate text-lg! font-bold text-white">
                        {sheet.title || "Untitled sheet"}
                      </h3>
                      <span className="mt-1 rounded-full border border-white/10 bg-white/5 p-2 text-zinc-300 transition group-hover:bg-white group-hover:text-black">
                        <ArrowRight size={15} />
                      </span>
                    </div>
                    <div className="mt-3 flex min-h-7 flex-wrap gap-2">
                      {tags.length > 0 ? (
                        tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-white/10 bg-white/5 px-2.5! py-1! text-xs text-zinc-300"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5! py-1! text-xs text-zinc-500">
                          No tags yet
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

const ModeCard = ({
  active,
  icon,
  title,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-w-0 rounded-lg border p-2! text-left transition md:p-2.5! ${
      active
        ? "border-red-300/45 bg-red-500/10"
        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
    }`}
  >
    <div className="flex min-w-0 items-center gap-1.5 md:gap-2.5">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md md:h-7 md:w-7 ${
          active ? "bg-red-500/15 text-red-200" : "bg-white/5 text-zinc-300"
        }`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 items-center gap-1 text-[11px] font-bold text-white md:gap-1.5 md:text-xs">
        <span className="truncate">{title}</span>
        {active && <Check size={13} className="shrink-0 text-red-200" />}
      </span>
    </div>
  </button>
);

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 md:px-2.5 md:py-2">
    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500 md:text-[10px] md:tracking-[0.16em]">
      {label}
    </p>
    <p className="mt-0.5 text-sm! font-bold leading-none text-white md:text-base!">
      {value}
    </p>
  </div>
);

const FlashDetailsModal = ({
  titleInput,
  priceInput,
  tagsInput,
  isSaving,
  onTitleChange,
  onPriceChange,
  onTagsChange,
  onClose,
  onSave,
}: {
  titleInput: string;
  priceInput: string;
  tagsInput: string;
  isSaving: boolean;
  onTitleChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-xl">
    <div className="relative w-full max-w-lg rounded-[1.25rem] border border-white/10 bg-[#111111] p-5 text-white shadow-2xl md:p-6">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 p-2! text-zinc-300 transition hover:bg-white/10 hover:text-white"
        aria-label="Close flash details modal"
        disabled={isSaving}
      >
        <X size={18} />
      </button>
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
        New flash item
      </p>
      <h2 className="mt-3 text-2xl! font-bold text-white">
        Add the marketplace details
      </h2>
      <div className="mt-6 space-y-4">
        <input
          type="text"
          value={titleInput}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Title"
          className="w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
        />
        <input
          type="number"
          value={priceInput}
          onChange={(e) => onPriceChange(e.target.value)}
          placeholder="Price (optional)"
          className="w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
        />
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => onTagsChange(e.target.value)}
          placeholder="Tags (comma or space separated)"
          className="w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
        />
      </div>
      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
          onClick={onSave}
          className="rounded-xl bg-white px-5! py-3! text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Publish flash"}
        </button>
      </div>
    </div>
  </div>
);

const StripeRequiredNotice = ({
  onOpenPayments,
}: {
  onOpenPayments?: () => void;
}) => (
  <div className="rounded-[1.25rem] border border-amber-300/20 bg-amber-300/10 p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-100">
          <Sparkles size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-100">
            Connect Stripe before adding marketplace flash.
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-100/70">
            Flash items and flash sheets can be requested by clients, so artists
            need Stripe Connect ready before new designs appear publicly.
          </p>
        </div>
      </div>
      {onOpenPayments && (
        <button
          type="button"
          onClick={onOpenPayments}
          className="shrink-0 rounded-xl bg-white px-4! py-3! text-sm font-semibold text-black transition hover:bg-white/85"
        >
          Go to Payments
        </button>
      )}
    </div>
  </div>
);

export default FlashManager;
