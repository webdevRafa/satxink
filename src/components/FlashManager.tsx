import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
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
import type { Flash, FlashRepeatability } from "../types/Flash";
import {
  isStripeConnectReady,
  type StripeConnectLike,
} from "../utils/stripeConnect";
import {
  formatFileSize,
  getImageMegapixels,
  getQualityClassName,
  getQualityLabel,
  getSheetQualityLevel,
  type ImageSourceMetadata,
} from "../utils/flashSourceQuality";
import UploadModal from "./UploadModal";
import AnimatedTagInput from "./ui/AnimatedTagInput";
import FlashRepeatabilityControl from "./FlashRepeatabilityControl";

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

  const [mode, setMode] = useState<UploadMode>("sheet");
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const [flashSheets, setFlashSheets] = useState<FlashSheet[]>([]);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [sheetImage, setSheetImage] = useState<string | null>(null);
  const [sheetSourceMetadata, setSheetSourceMetadata] =
    useState<ImageSourceMetadata | null>(null);
  const [pendingSheetFile, setPendingSheetFile] = useState<File | null>(null);
  const [showSheetTitleModal, setShowSheetTitleModal] = useState(false);
  const [sheetTitleInput, setSheetTitleInput] = useState("");
  const [sheetTags, setSheetTags] = useState<string[]>([]);
  const [sheetRepeatabilityDefault, setSheetRepeatabilityDefault] =
    useState<FlashRepeatability>("repeatable");
  const [isUploadingSheet, setIsUploadingSheet] = useState(false);

  const linkedFlashCount = useMemo(
    () => flashes.filter((flash) => flash.isFromSheet || flash.sheetId).length,
    [flashes]
  );

  const canSaveSheetDetails =
    sheetTitleInput.trim().length > 0 && sheetTags.length > 0;

  const standaloneFlashCount = Math.max(flashes.length - linkedFlashCount, 0);
  const sheetQualityLevel = getSheetQualityLevel(sheetSourceMetadata);
  const sheetMegapixels = getImageMegapixels(
    sheetSourceMetadata?.width,
    sheetSourceMetadata?.height
  );

  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  useEffect(() => {
    if (!showSheetTitleModal || typeof document === "undefined") {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showSheetTitleModal]);

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
    setSheetSourceMetadata(null);
    setShowSheetTitleModal(true);

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const testImg = new Image();
      testImg.crossOrigin = "anonymous";
      testImg.onload = () => {
        setSheetSourceMetadata({
          width: testImg.naturalWidth,
          height: testImg.naturalHeight,
          fileSizeBytes: file.size,
        });
        setSheetImage(base64);
      };
      testImg.onerror = () =>
        toast.error("This image could not be previewed. Try another file.");
      testImg.src = base64;
    };
    reader.readAsDataURL(file);
  };

  const closeSheetTitleModal = () => {
    setShowSheetTitleModal(false);
    setSheetTitleInput("");
    setSheetTags([]);
    setSheetRepeatabilityDefault("repeatable");
    setPendingSheetFile(null);
    setSheetImage(null);
    setSheetSourceMetadata(null);
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
        tags: sheetTags,
        repeatabilityDefault: sheetRepeatabilityDefault,
        artistStripeConnectReady: true,
        marketplaceVisible: true,
        fileName: baseName,
        imageUrl,
        thumbUrl,
        fullPath: `${storageBase}_full.jpg`,
        sourceWidth: sheetSourceMetadata?.width || null,
        sourceHeight: sheetSourceMetadata?.height || null,
        sourceMegapixels: sheetMegapixels,
        sourceFileSizeBytes: sheetSourceMetadata?.fileSizeBytes || null,
        createdAt: serverTimestamp(),
      });

      setSheetTitleInput("");
      setSheetTags([]);
      setSheetRepeatabilityDefault("repeatable");
      setPendingSheetFile(null);
      setSheetImage(null);
      setSheetSourceMetadata(null);
      setShowSheetTitleModal(false);
      toast.success("Flash sheet uploaded. Opening editor.");
      void fetchFlashData();
      navigate(`/flash-sheet/${docRef.id}`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Upload failed. Please try again."));
    } finally {
      setIsUploadingSheet(false);
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

          <div className="grid w-full grid-cols-3 gap-2 md:w-auto md:min-w-[420px]">
            <StatCard label="Sheets" value={flashSheets.length} />
            <StatCard label="Itemized" value={linkedFlashCount} />
            <StatCard label="Solo" value={standaloneFlashCount} />
          </div>
        </div>

        <div className="grid gap-2.5 p-2.5 md:p-3 lg:w-fit lg:grid-cols-[20rem_minmax(0,32rem)] lg:items-start">
          <div className="grid grid-cols-2 gap-1.5 md:gap-2 lg:w-80">
            <ModeCard
              active={mode === "sheet"}
              icon={<Layers size={15} />}
              title="Flash sheet"
              onClick={() => setMode("sheet")}
            />
            <ModeCard
              active={mode === "individual"}
              icon={<Plus size={15} />}
              title="Individual flash"
              onClick={() => setMode("individual")}
            />
          </div>

          <div className="p-0">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-start sm:gap-3">
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
                  className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white p-2! text-xs! font-bold text-neutral-950! shadow-sm transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/90 disabled:text-neutral-900! disabled:opacity-100 sm:w-[9.75rem]"
                  disabled={!stripeReady}
                >
                  <Upload size={15} className="text-current" />
                  Upload item
                </button>
              ) : (
                <label
                  className={`inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white p-2! text-xs! font-bold text-neutral-950! shadow-sm transition hover:bg-white/85 sm:w-[9.75rem] ${
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

      {showSheetTitleModal &&
        createPortal(
          <div className="request-modal-scrollbar fixed bottom-0 left-0 right-0 top-0 z-[120] h-dvh min-h-screen w-screen overflow-y-auto bg-black text-white backdrop-blur-xl md:px-4 md:py-8">
            <div className="mx-auto flex min-h-full w-full items-stretch justify-center md:items-center">
              <div className="relative grid min-h-full w-full max-w-4xl overflow-y-auto border border-white/10 bg-[#111111] text-white shadow-2xl md:min-h-0 md:overflow-hidden md:rounded-[1.25rem] md:grid-cols-[0.9fr_1.1fr]">
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
                    <div className="mt-4 flex max-h-[38dvh] min-h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-black md:mt-5 md:aspect-square md:max-h-none">
                      <img
                        src={sheetImage}
                        alt="Flash sheet preview"
                        className="h-full w-full object-contain md:object-cover"
                      />
                    </div>
                  )}
                  {sheetSourceMetadata && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">
                          Source quality
                        </p>
                        <span
                          className={`rounded-full border px-2.5! py-1! text-[11px] font-bold uppercase tracking-[0.12em] ${getQualityClassName(
                            sheetQualityLevel
                          )}`}
                        >
                          {getQualityLabel(sheetQualityLevel)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-zinc-400">
                        {sheetSourceMetadata.width} x {sheetSourceMetadata.height}
                        {sheetMegapixels ? ` - ${sheetMegapixels} MP` : ""}
                        {formatFileSize(sheetSourceMetadata.fileSizeBytes)
                          ? ` - ${formatFileSize(sheetSourceMetadata.fileSizeBytes)}`
                          : ""}
                      </p>
                      <p className="mt-3 text-xs leading-5 text-zinc-500">
                        Original camera photos or scans crop best. Avoid
                        screenshots or social downloads, photograph the sheet flat
                        in even light, and leave breathing room between designs.
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-5 pb-0 md:p-6">
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

                  <AnimatedTagInput
                    className="mt-4"
                    value={sheetTags}
                    onChange={setSheetTags}
                    label={
                      <>
                        <Tag size={16} />
                        Sheet tags
                      </>
                    }
                    emptyPlaceholder="anime, color, dragon"
                  />

                  <div className="mt-4">
                    <FlashRepeatabilityControl
                      value={sheetRepeatabilityDefault}
                      onChange={setSheetRepeatabilityDefault}
                      label="Default for this sheet"
                      description="New flash cropped from this sheet starts with this setting, and each design can still be changed later."
                      disabled={isUploadingSheet}
                    />
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-300">
                        <Scissors size={18} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">
                          Continue in sheet editor
                        </p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                          Once the sheet is saved, the full editor opens so you can
                          crop designs and review itemized flash beneath it.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="sticky bottom-0 -mx-5 mt-6 grid grid-cols-2 gap-2.5 border-t border-white/10 bg-[#111111]/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur md:static md:mx-0 md:mt-7 md:flex md:justify-end md:border-t-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
                    <button
                      type="button"
                      onClick={closeSheetTitleModal}
                      className="modal-action-button min-w-0 rounded-lg! border border-white/10 bg-white/5 px-3! py-2! text-xs! font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white md:px-4!"
                      disabled={isUploadingSheet}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitFlashSheet}
                      className={`modal-action-button min-w-0 rounded-lg! px-3! py-2! text-xs! font-semibold transition disabled:cursor-not-allowed md:px-4! ${
                        canSaveSheetDetails && !isUploadingSheet
                          ? "bg-white text-black shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_14px_32px_rgba(255,255,255,0.08)] hover:bg-zinc-200"
                          : "bg-white/55 text-zinc-500"
                      }`}
                      disabled={isUploadingSheet || !canSaveSheetDetails}
                    >
                      {isUploadingSheet ? "Saving..." : "Save & continue"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
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
          <div className="mt-6 grid grid-cols-2 gap-2.5 min-[520px]:grid-cols-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-56 animate-pulse rounded-xl border border-white/10 bg-white/[0.03] sm:h-80 sm:rounded-2xl"
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
          <div className="mt-6 grid grid-cols-2 gap-2.5 min-[520px]:grid-cols-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
            {flashSheets.map((sheet) => {
              const itemCount = flashes.filter(
                (flash) => flash.sheetId === sheet.id
              ).length;
              const tags = Array.isArray(sheet.tags) ? sheet.tags.slice(0, 3) : [];
              const sheetPreviewUrl = sheet.thumbUrl || sheet.imageUrl;

              return (
                <button
                  key={sheet.id}
                  type="button"
                  onClick={() => navigate(`/flash-sheet/${sheet.id}`)}
                  className="group overflow-hidden rounded-xl border border-white/10 bg-[#151515] text-left transition hover:border-red-300/40 hover:bg-[#191919] sm:rounded-2xl"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-black">
                    {sheetPreviewUrl ? (
                      <img
                        src={sheetPreviewUrl}
                        alt={sheet.title || "Flash sheet"}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-500">
                        <Grid2X2 size={24} />
                        <span className="text-xs font-semibold">
                          Processing cover
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5 sm:p-4">
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2! py-1! text-[10px] font-semibold text-white backdrop-blur sm:gap-2 sm:px-3! sm:py-1.5! sm:text-xs">
                        <Scissors size={12} className="shrink-0 sm:size-3.5" />
                        {itemCount} itemized
                      </span>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <h3 className="min-w-0 truncate text-sm! font-bold text-white sm:text-lg!">
                        {sheet.title || "Untitled sheet"}
                      </h3>
                      <span className="mt-0.5 rounded-full border border-white/10 bg-white/5 p-1.5 text-zinc-300 transition group-hover:bg-white group-hover:text-black sm:mt-1 sm:p-2">
                        <ArrowRight size={13} className="sm:size-[15px]" />
                      </span>
                    </div>
                    <div className="mt-2 flex min-h-6 flex-wrap gap-1.5 sm:mt-3 sm:min-h-7 sm:gap-2">
                      {tags.length > 0 ? (
                        tags.map((tag) => (
                          <span
                            key={tag}
                            className="max-w-full truncate rounded-full border border-white/10 bg-white/5 px-2! py-0.5! text-[10px] text-zinc-300 sm:px-2.5! sm:py-1! sm:text-xs"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="max-w-full truncate rounded-full border border-white/10 bg-white/5 px-2! py-0.5! text-[10px] text-zinc-500 sm:px-2.5! sm:py-1! sm:text-xs">
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
    className={`min-w-0 rounded-lg border p-2! text-left transition md:p-2! ${
      active
        ? "border-red-300/45 bg-red-500/10"
        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
    }`}
  >
    <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
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
  <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.025] px-2.5! py-2! sm:px-3! sm:py-2.5!">
    <p className="truncate text-[9px]! uppercase tracking-[0.1em] text-zinc-500 sm:text-[10px]! sm:tracking-[0.14em]">
      {label}
    </p>
    <p className="mt-1 truncate text-base! font-semibold leading-none text-white sm:text-lg!">
      {value}
    </p>
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
