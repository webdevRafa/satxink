import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  DollarSign,
  Edit3,
  Grid2X2,
  Layers,
  Plus,
  Scissors,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import toast from "react-hot-toast";
import { httpsCallable } from "firebase/functions";

import { db, functions, storage } from "../firebase/firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import type { Flash, FlashRepeatability } from "../types/Flash";
import type { FlashSheet } from "../types/FlashSheet";
import EditFlashModal from "../components/EditFlashModal";
import AnimatedTagInput from "../components/ui/AnimatedTagInput";
import FlashRepeatabilityControl from "../components/FlashRepeatabilityControl";
import {
  FlashPreviewImage,
  FlashTinyTag,
} from "../components/FlashPreviewCard";
import {
  formatFlashPrice,
  getFlashTitle,
} from "../utils/flashPreview";
import {
  getFlashAvailabilityStatus,
  getFlashPublicationStatus,
  getFlashRepeatability,
} from "../utils/flashAvailability";

const getErrorMessage = (err: unknown, fallback: string) => {
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message?: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }

  return fallback;
};

const getSerializableCropArea = (area: Area | null): Area | null => {
  if (
    !area ||
    !Number.isFinite(area.x) ||
    !Number.isFinite(area.y) ||
    !Number.isFinite(area.width) ||
    !Number.isFinite(area.height) ||
    area.width <= 0 ||
    area.height <= 0
  ) {
    return null;
  }

  return {
    x: Math.max(0, Math.round(area.x)),
    y: Math.max(0, Math.round(area.y)),
    width: Math.max(1, Math.round(area.width)),
    height: Math.max(1, Math.round(area.height)),
  };
};

const parseOptionalPrice = (value: string) => {
  if (!value.trim()) return null;

  const parsedValue = parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const useMediaQuery = (queryString: string) => {
  const getMatches = () =>
    typeof window !== "undefined"
      ? window.matchMedia(queryString).matches
      : false;

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQueryList = window.matchMedia(queryString);
    const handleChange = () => setMatches(mediaQueryList.matches);

    handleChange();
    mediaQueryList.addEventListener("change", handleChange);

    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, [queryString]);

  return matches;
};

const FlashSheetDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<FlashSheet | null>(null);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [editingFlash, setEditingFlash] = useState<Flash | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishingDrafts, setIsPublishingDrafts] = useState(false);
  const [isApplyingSheetDefault, setIsApplyingSheetDefault] = useState(false);
  const [discardingDraftId, setDiscardingDraftId] = useState<string | null>(null);
  const [createdDraftIds, setCreatedDraftIds] = useState<string[]>([]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<Area | null>(null);
  const [newFlashTitle, setNewFlashTitle] = useState("");
  const [newFlashPrice, setNewFlashPrice] = useState("");
  const [newFlashTags, setNewFlashTags] = useState<string[]>([]);
  const [newFlashRepeatability, setNewFlashRepeatability] =
    useState<FlashRepeatability>("repeatable");

  const sheetTags = useMemo(
    () => (Array.isArray(sheet?.tags) ? sheet.tags.slice(0, 5) : []),
    [sheet?.tags]
  );
  const draftFlashes = useMemo(
    () => flashes.filter((flash) => getFlashPublicationStatus(flash) === "draft"),
    [flashes]
  );
  const publishedFlashes = useMemo(
    () =>
      flashes.filter((flash) => getFlashPublicationStatus(flash) === "published"),
    [flashes]
  );
  const createdDraftFlashes = useMemo(
    () =>
      createdDraftIds
        .map((draftId) => flashes.find((flash) => flash.id === draftId))
        .filter((flash): flash is Flash => Boolean(flash)),
    [createdDraftIds, flashes]
  );

  const fetchFlashes = async (sheetId: string) => {
    const flashesQuery = query(
      collection(db, "flashes"),
      where("sheetId", "==", sheetId)
    );
    const snapshot = await getDocs(flashesQuery);
    setFlashes(
      snapshot.docs.map((flashDoc) => ({
        id: flashDoc.id,
        ...flashDoc.data(),
      })) as Flash[]
    );
  };

  const fetchData = async () => {
    if (!id) return;

    try {
      setIsLoading(true);
      const docSnap = await getDoc(doc(db, "flashSheets", id));
      if (docSnap.exists()) {
        const sheetData = docSnap.data() as Omit<FlashSheet, "id">;
        let imageUrl = sheetData.imageUrl;

        if (sheetData.fullPath) {
          imageUrl = await getDownloadURL(ref(storage, sheetData.fullPath));
        }

        setSheet({ id: docSnap.id, ...sheetData, imageUrl } as FlashSheet);
      } else {
        toast.error("Flash sheet not found.");
      }
      await fetchFlashes(id);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to load flash sheet."));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSaveEdit = async (
    flashId: string,
    title: string,
    price: number | null,
    tags: string[],
    repeatability: FlashRepeatability
  ) => {
    await updateDoc(doc(db, "flashes", flashId), {
      title,
      price,
      tags,
      repeatability,
    });
    setEditingFlash(null);
    if (id) fetchFlashes(id);
    toast.success("Flash updated.");
  };

  const handleOpenCropModal = () => {
    setCreatedDraftIds([]);
    setNewFlashTitle("");
    setNewFlashPrice("");
    setNewFlashTags([]);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropArea(null);
    setNewFlashRepeatability(
      sheet?.repeatabilityDefault === "one_of_one" ? "one_of_one" : "repeatable"
    );
    setShowCropModal(true);
  };

  const handleUpdateSheetRepeatabilityDefault = async (
    repeatabilityDefault: FlashRepeatability
  ) => {
    if (!sheet) return;

    await updateDoc(doc(db, "flashSheets", sheet.id), {
      repeatabilityDefault,
    });
    setSheet({ ...sheet, repeatabilityDefault });
    toast.success("Sheet default updated.");
  };

  const handleApplySheetDefaultToCurrentDesigns = async () => {
    if (!sheet || isApplyingSheetDefault) return;

    const repeatabilityDefault =
      sheet.repeatabilityDefault === "one_of_one" ? "one_of_one" : "repeatable";
    const eligibleFlashes = flashes.filter((flash) => {
      const status = getFlashAvailabilityStatus(flash);
      return status !== "held" && status !== "sold";
    });

    if (eligibleFlashes.length === 0) {
      toast("No available designs to update.");
      return;
    }

    try {
      setIsApplyingSheetDefault(true);
      await Promise.all(
        eligibleFlashes.map((flash) =>
          updateDoc(doc(db, "flashes", flash.id), {
            repeatability: repeatabilityDefault,
            availabilityStatus: "available",
            isAvailable: true,
          })
        )
      );
      setFlashes((current) =>
        current.map((flash) =>
          eligibleFlashes.some((eligible) => eligible.id === flash.id)
            ? {
                ...flash,
                repeatability: repeatabilityDefault,
                availabilityStatus: "available",
                isAvailable: true,
              }
            : flash
        )
      );
      toast.success("Current designs updated.");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Could not update current designs."));
    } finally {
      setIsApplyingSheetDefault(false);
    }
  };

  const handleCropComplete = (_: Area, areaPixels: Area) => {
    setCropArea((currentCropArea) =>
      getSerializableCropArea(areaPixels) || currentCropArea
    );
  };

  const handleSaveNewFlash = async (
    publicationStatus: "draft" | "published" = "published"
  ) => {
    const validCropArea = getSerializableCropArea(cropArea);

    if (!sheet || !validCropArea || isPublishing) {
      if (!validCropArea) {
        toast("Adjust the crop before creating flash.");
      }
      return false;
    }

    try {
      setIsPublishing(true);

      const cropFlashFromSheet = httpsCallable(functions, "cropFlashFromSheet");
      const result = await cropFlashFromSheet({
        sheetId: sheet.id,
        crop: validCropArea,
        title: newFlashTitle.trim() || "Untitled Flash",
        price: parseOptionalPrice(newFlashPrice),
        tags: newFlashTags,
        repeatability: newFlashRepeatability,
        publicationStatus,
      });
      const createdFlash = result.data as Flash;

      setFlashes((current) => [
        createdFlash,
        ...current.filter((flash) => flash.id !== createdFlash.id),
      ]);
      if (publicationStatus === "draft") {
        setCreatedDraftIds((current) => [
          createdFlash.id,
          ...current.filter((draftId) => draftId !== createdFlash.id),
        ]);
      } else {
        setShowCropModal(false);
      }
      setNewFlashTitle("");
      setNewFlashPrice("");
      setNewFlashTags([]);
      setNewFlashRepeatability(
        sheet.repeatabilityDefault === "one_of_one" ? "one_of_one" : "repeatable"
      );
      setCropArea(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      if (publicationStatus === "published" && id) fetchFlashes(id);
      toast.success(
        publicationStatus === "draft" ? "Flash draft created." : "Flash published."
      );
      return true;
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Something went wrong while saving flash."));
      return false;
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublishDrafts = async (
    draftIds: string[],
    closeCropper = false
  ) => {
    if (!sheet || draftIds.length === 0 || isPublishingDrafts) return;

    try {
      setIsPublishingDrafts(true);
      const publishFlashDrafts = httpsCallable(functions, "publishFlashDrafts");
      await publishFlashDrafts({
        sheetId: sheet.id,
        flashIds: draftIds,
      });

      setFlashes((current) =>
        current.map((flash) =>
          draftIds.includes(flash.id)
            ? {
                ...flash,
                publicationStatus: "published",
                marketplaceVisible: true,
                isAvailable: true,
                availabilityStatus: "available",
              }
            : flash
        )
      );
      setCreatedDraftIds((current) =>
        current.filter((draftId) => !draftIds.includes(draftId))
      );
      if (id) await fetchFlashes(id);
      if (closeCropper) setShowCropModal(false);
      toast.success(
        draftIds.length === 1 ? "Flash published." : "Flash drafts published."
      );
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Could not publish flash drafts."));
    } finally {
      setIsPublishingDrafts(false);
    }
  };

  const handleDiscardDraft = async (flash: Flash) => {
    if (!sheet || discardingDraftId) return;

    try {
      setDiscardingDraftId(flash.id);
      const discardFlashDraft = httpsCallable(functions, "discardFlashDraft");
      await discardFlashDraft({
        sheetId: sheet.id,
        flashId: flash.id,
      });
      setFlashes((current) =>
        current.filter((currentFlash) => currentFlash.id !== flash.id)
      );
      setCreatedDraftIds((current) =>
        current.filter((draftId) => draftId !== flash.id)
      );
      if (editingFlash?.id === flash.id) setEditingFlash(null);
      toast.success("Draft discarded.");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Could not discard this draft."));
    } finally {
      setDiscardingDraftId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto mt-28 min-h-screen max-w-6xl px-5 text-white">
        <div className="h-80 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.03]" />
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="mx-auto mt-28 min-h-screen max-w-4xl px-5 text-white">
        <div className="rounded-[1.5rem] border border-white/10 bg-[#121212] p-8 text-center">
          <h1 className="text-2xl! font-bold">Flash sheet not found</h1>
          <button
            type="button"
            onClick={() => navigate("/dashboard?tab=flashes")}
            className="mt-5 rounded-xl bg-white px-5! py-3! text-sm font-semibold text-[#0b0b0b]!"
          >
            Back to flashes
          </button>
        </div>
      </div>
    );
  }

  const sheetRepeatabilityDefault =
    sheet.repeatabilityDefault === "one_of_one" ? "one_of_one" : "repeatable";

  return (
    <div className="mx-auto mt-24 min-h-screen max-w-7xl px-5 pb-16 text-white md:px-8">
      <button
        type="button"
        onClick={() => navigate("/dashboard?tab=flashes")}
        className="mb-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4! py-3! text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft size={16} />
        Back to flashes
      </button>

      <section className="grid overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#121212] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-300">
            Flash sheet editor
          </p>
          <h1 className="mt-3 text-3xl! font-bold text-white">
            {sheet.title || "Untitled sheet"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Review the full sheet, crop individual pieces, and keep each design
            ready for clients to request.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {sheetTags.length > 0 ? (
              sheetTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/5 px-3! py-1.5! text-xs font-semibold text-zinc-300"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-3! py-1.5! text-xs font-semibold text-zinc-500">
                No sheet tags yet
              </span>
            )}
          </div>

          <div className="mt-6 overflow-hidden rounded-[1.25rem] border border-white/10 bg-black">
            <img
              src={sheet.imageUrl}
              alt={sheet.title || "Flash sheet"}
              className="max-h-[72vh] w-full object-contain"
            />
          </div>
        </div>

        <aside className="border-t border-white/10 bg-black/25 p-5 lg:border-l lg:border-t-0 md:p-6">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Status
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MiniStat label="Published" value={publishedFlashes.length} />
                <MiniStat label="Drafts" value={draftFlashes.length} />
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenCropModal}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5! py-3! text-sm font-semibold text-[#0b0b0b]! transition hover:bg-zinc-200"
            >
              <Scissors size={16} />
              Add flash from sheet
            </button>

            <FlashRepeatabilityControl
              value={sheetRepeatabilityDefault}
              onChange={handleUpdateSheetRepeatabilityDefault}
              label="Sheet default"
              description="New designs cropped from this sheet start with this setting."
              disabled={isApplyingSheetDefault}
            />

            <button
              type="button"
              onClick={handleApplySheetDefaultToCurrentDesigns}
              disabled={isApplyingSheetDefault || flashes.length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5! py-3! text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isApplyingSheetDefault
                ? "Applying..."
                : "Apply default to current designs"}
            </button>

            <button
              type="button"
              onClick={() =>
                handlePublishDrafts(draftFlashes.map((flash) => flash.id))
              }
              disabled={isPublishingDrafts || draftFlashes.length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-5! py-3! text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <CheckCircle2 size={16} />
              {isPublishingDrafts ? "Publishing..." : "Publish all drafts"}
            </button>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-300">
                  <Layers size={18} />
                </span>
                <p className="text-sm leading-6 text-zinc-400">
                  Crop one design at a time, then add a title, price, and tags
                  that make it easy to find later.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-10">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-300">
              Itemized flash
            </p>
            <h2 className="mt-2 text-2xl! font-bold text-white">
              Designs from this sheet
            </h2>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3! py-1.5! text-xs font-semibold text-zinc-300">
            {flashes.length} items
          </span>
        </div>

        {flashes.length === 0 ? (
          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#121212] p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-red-300">
              <Grid2X2 size={22} />
            </span>
            <h3 className="mt-4 text-xl! font-bold text-white">
              Nothing cropped yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
              Start by cropping the first design from this sheet. It will show
              here as an editable marketplace item.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-10">
            {draftFlashes.length > 0 && (
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
                      Unpublished drafts
                    </p>
                    <h3 className="mt-2 text-xl! font-bold text-white">
                      Hidden from clients
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handlePublishDrafts(draftFlashes.map((flash) => flash.id))
                    }
                    disabled={isPublishingDrafts}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4! py-2.5! text-sm font-semibold text-[#0b0b0b]! transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-white/60 disabled:text-[#0b0b0b]! disabled:opacity-100"
                  >
                    <CheckCircle2 size={16} />
                    {isPublishingDrafts ? "Publishing..." : "Publish all drafts"}
                  </button>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {draftFlashes.map((flash) => (
                    <FlashItemCard
                      key={flash.id}
                      flash={flash}
                      onEdit={() => setEditingFlash(flash)}
                      onDiscard={() => handleDiscardDraft(flash)}
                      isDiscarding={discardingDraftId === flash.id}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
                  Published flash
                </p>
                <h3 className="mt-2 text-xl! font-bold text-white">
                  Visible marketplace items
                </h3>
              </div>

              {publishedFlashes.length === 0 ? (
                <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-[#121212] p-6 text-sm text-zinc-400">
                  Publish a draft to make it visible to clients.
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {publishedFlashes.map((flash) => (
                    <FlashItemCard
                      key={flash.id}
                      flash={flash}
                      onEdit={() => setEditingFlash(flash)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {editingFlash && (
        <EditFlashModal
          flash={editingFlash}
          onClose={() => setEditingFlash(null)}
          onSave={handleSaveEdit}
        />
      )}

      {showCropModal && (
        <CropFlashModal
          sheet={sheet}
          crop={crop}
          zoom={zoom}
          cropArea={cropArea}
          title={newFlashTitle}
          price={newFlashPrice}
          tags={newFlashTags}
          repeatability={newFlashRepeatability}
          draftFlashes={createdDraftFlashes}
          isPublishing={isPublishing}
          isPublishingDrafts={isPublishingDrafts}
          discardingDraftId={discardingDraftId}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
          onTitleChange={setNewFlashTitle}
          onPriceChange={setNewFlashPrice}
          onTagsChange={setNewFlashTags}
          onRepeatabilityChange={setNewFlashRepeatability}
          onClose={() => {
            setShowCropModal(false);
            setCreatedDraftIds([]);
          }}
          onCreateDraft={() => handleSaveNewFlash("draft")}
          onPublish={() => handleSaveNewFlash("published")}
          onPublishDrafts={() => handlePublishDrafts(createdDraftIds, true)}
          onEditDraft={(flash) => {
            setShowCropModal(false);
            setCreatedDraftIds([]);
            setEditingFlash(flash);
          }}
          onDiscardDraft={handleDiscardDraft}
        />
      )}
    </div>
  );
};

const MiniStat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
      {label}
    </p>
    <p className="mt-2 text-lg! font-bold text-white">{value}</p>
  </div>
);

const PreviewPlaceholder = () => (
  <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-red-300">
    <Scissors size={22} />
  </span>
);

const FlashItemCard = ({
  flash,
  onEdit,
  onDiscard,
  isDiscarding = false,
}: {
  flash: Flash;
  onEdit: () => void;
  onDiscard?: () => void;
  isDiscarding?: boolean;
}) => {
  const repeatability = getFlashRepeatability(flash);
  const availabilityStatus = getFlashAvailabilityStatus(flash);
  const isDraft = getFlashPublicationStatus(flash) === "draft";

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-[#151515]">
      <FlashPreviewImage flash={flash} showBadge={false}>
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {isDraft && (
            <span className="rounded-full border border-emerald-300/30 bg-emerald-500/20 px-2.5! py-1! text-[11px] font-semibold text-emerald-100 backdrop-blur">
              Draft
            </span>
          )}
          {repeatability === "one_of_one" && (
            <span className="rounded-full border border-red-300/30 bg-red-500/20 px-2.5! py-1! text-[11px] font-semibold text-red-100 backdrop-blur">
              One of one
            </span>
          )}
          {availabilityStatus !== "available" && (
            <span className="rounded-full border border-white/15 bg-black/55 px-2.5! py-1! text-[11px] font-semibold capitalize text-white/80 backdrop-blur">
              {availabilityStatus}
            </span>
          )}
        </div>
      </FlashPreviewImage>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base! font-bold text-white">
              {getFlashTitle(flash)}
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              {formatFlashPrice(flash.price)}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-full border border-white/10 bg-white/5 p-2! text-zinc-300 transition hover:bg-white hover:text-black"
              aria-label={`Edit ${flash.title || "flash"}`}
            >
              <Edit3 size={15} />
            </button>
            {onDiscard && (
              <button
                type="button"
                onClick={onDiscard}
                disabled={isDiscarding}
                className="rounded-full border border-red-400/20 bg-red-500/10 p-2! text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label={`Discard ${flash.title || "flash"} draft`}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
        {Array.isArray(flash.tags) && flash.tags.length > 0 && (
          <div className="mt-3 flex min-w-0">
            <FlashTinyTag tags={flash.tags} className="text-zinc-300" />
          </div>
        )}
      </div>
    </article>
  );
};

const CroppedFlashPreview = ({
  imageUrl,
  cropArea,
}: {
  imageUrl: string;
  cropArea: Area;
}) => {
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const previewStyle = useMemo(() => {
    if (!imageSize || cropArea.width <= 0 || cropArea.height <= 0) {
      return undefined;
    }

    return {
      width: `${(imageSize.width / cropArea.width) * 100}%`,
      height: `${(imageSize.height / cropArea.height) * 100}%`,
      left: `-${(cropArea.x / cropArea.width) * 100}%`,
      top: `-${(cropArea.y / cropArea.height) * 100}%`,
    };
  }, [cropArea, imageSize]);

  if (imageFailed) return <PreviewPlaceholder />;

  return (
    <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black">
      <img
        src={imageUrl}
        alt="Cropped flash preview"
        onLoad={(event) => {
          setImageFailed(false);
          setImageSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          });
        }}
        onError={() => setImageFailed(true)}
        className={`absolute ${
          previewStyle ? "max-w-none" : "h-full w-full object-cover"
        }`}
        style={previewStyle}
      />
    </span>
  );
};

const CropFlashModal = ({
  sheet,
  crop,
  zoom,
  cropArea,
  title,
  price,
  tags,
  repeatability,
  draftFlashes,
  isPublishing,
  isPublishingDrafts,
  discardingDraftId,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onTitleChange,
  onPriceChange,
  onTagsChange,
  onRepeatabilityChange,
  onClose,
  onCreateDraft,
  onPublish,
  onPublishDrafts,
  onEditDraft,
  onDiscardDraft,
}: {
  sheet: FlashSheet;
  crop: { x: number; y: number };
  zoom: number;
  cropArea: Area | null;
  title: string;
  price: string;
  tags: string[];
  repeatability: FlashRepeatability;
  draftFlashes: Flash[];
  isPublishing: boolean;
  isPublishingDrafts: boolean;
  discardingDraftId: string | null;
  onCropChange: (value: { x: number; y: number }) => void;
  onZoomChange: (value: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  onTitleChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onTagsChange: (value: string[]) => void;
  onRepeatabilityChange: (value: FlashRepeatability) => void;
  onClose: () => void;
  onCreateDraft: () => Promise<boolean>;
  onPublish: () => Promise<boolean>;
  onPublishDrafts: () => void;
  onEditDraft: (flash: Flash) => void;
  onDiscardDraft: (flash: Flash) => void;
}) => {
  const [mobileStep, setMobileStep] = useState<"crop" | "details">("crop");
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const isDesktopCropper = useMediaQuery("(min-width: 1024px)");
  const validCropArea = getSerializableCropArea(cropArea);
  const cropperObjectFit = isDesktopCropper ? "cover" : "contain";
  const cropperStyle = isDesktopCropper
    ? undefined
    : {
        containerStyle: { backgroundColor: "#000" },
        mediaStyle: {
          height: "auto",
          maxHeight: "100%",
          maxWidth: "100%",
          width: "auto",
        },
      };

  const handleContinueToDetails = () => {
    if (!validCropArea) {
      toast("Choose a crop area first.");
      return;
    }

    setMobileStep("details");
  };

  const handleOpenDesktopDetails = () => {
    if (!validCropArea) {
      toast("Choose a crop area first.");
      return;
    }

    setShowDetailsModal(true);
  };

  const handleSubmitDesktopDetails = async () => {
    const created = await onCreateDraft();
    if (created) setShowDetailsModal(false);
  };

  const cropPanel = (
    <div
      className={`${
        mobileStep === "details" ? "hidden lg:flex" : "flex"
      } min-h-0 flex-col`}
    >
      <div className="border-b border-white/10 p-5 pr-16 lg:flex lg:items-center lg:justify-between lg:gap-5 lg:pr-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Crop from sheet
          </p>
          <h2 className="mt-2 truncate text-2xl! font-bold text-white">
            {sheet.title || "Untitled sheet"}
          </h2>
        </div>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <button
            type="button"
            onClick={handleOpenDesktopDetails}
            disabled={!validCropArea || isPublishing || isPublishingDrafts}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4! py-2.5! text-sm font-semibold text-[#0b0b0b]! transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-white/60 disabled:text-[#0b0b0b]! disabled:opacity-100"
          >
            <Plus size={16} />
            Create flash
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black lg:min-h-[420px]">
        <Cropper
          image={sheet.imageUrl}
          crop={crop}
          zoom={zoom}
          maxZoom={8}
          aspect={1}
          objectFit={cropperObjectFit}
          style={cropperStyle}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropComplete}
        />
      </div>
      <div className="hidden border-t border-white/10 bg-black/40 p-4 lg:block">
        <label className="block">
          <span className="text-sm font-semibold text-zinc-300">Zoom</span>
          <input
            aria-label="Zoom"
            type="range"
            min={1}
            max={8}
            step={0.1}
            value={zoom}
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            className="mt-3 w-full accent-red-400"
          />
        </label>
      </div>
      <div className="border-t border-white/10 p-4 lg:hidden">
        <div className="flex">
          <button
            type="button"
            onClick={handleContinueToDetails}
            className="w-full rounded-xl bg-white px-5! py-3! text-sm font-semibold text-[#0b0b0b]! transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-white/60 disabled:text-[#0b0b0b]! disabled:opacity-100"
            disabled={!validCropArea || isPublishing}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );

  const renderDetailsFields = () => (
    <>
      <label className="block">
        <span className="text-sm font-semibold text-zinc-300">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
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
          onChange={(e) => onPriceChange(e.target.value)}
          placeholder="Optional"
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
        />
      </label>

      <AnimatedTagInput
        value={tags}
        onChange={onTagsChange}
        label={
          <>
            <Tag size={16} />
            Tags
          </>
        }
        emptyPlaceholder="anime, color, dragon"
      />

      <FlashRepeatabilityControl
        value={repeatability}
        onChange={onRepeatabilityChange}
        label="Availability"
        disabled={isPublishing}
        compact
      />
    </>
  );

  const renderActionButtons = () => (
    <div className="flex flex-col-reverse gap-3 sm:flex-row lg:flex-col-reverse">
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl border border-white/10 bg-white/5 px-5! py-3! text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
        disabled={isPublishing}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onPublish}
        className="rounded-xl bg-white px-5! py-3! text-sm font-semibold text-[#0b0b0b]! transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-white/60 disabled:text-[#0b0b0b]! disabled:opacity-100"
        disabled={isPublishing || !validCropArea}
      >
        {isPublishing ? "Publishing..." : "Publish flash"}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-x-0 bottom-0 top-20 z-[120] flex items-start justify-center overflow-hidden bg-black/85 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl md:inset-0 md:items-center md:px-4 md:py-6">
      <div className="relative grid h-full w-full max-w-7xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111111] text-white shadow-2xl md:h-[min(900px,92vh)] lg:grid-cols-[minmax(0,1fr)_360px]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/50 p-2! text-zinc-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Close crop modal"
          disabled={isPublishing}
        >
          <X size={18} />
        </button>

        {cropPanel}

        <div
          className={`${
            mobileStep === "details" ? "flex lg:hidden" : "hidden"
          } min-h-0 flex-col`}
        >
          <div className="border-b border-white/10 p-5 pr-16">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
              Flash details
            </p>
            <h2 className="mt-2 text-2xl! font-bold text-white">
              Publish cropped flash
            </h2>
          </div>

          <div className="request-modal-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-4">
                {validCropArea ? (
                  <CroppedFlashPreview
                    imageUrl={sheet.imageUrl}
                    cropArea={validCropArea}
                  />
                ) : (
                  <PreviewPlaceholder />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    Crop preview
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">
                    This square preview uses the crop area that will be
                    published from this sheet.
                  </p>
                </div>
              </div>
            </div>

            {renderDetailsFields()}

            <button
              type="button"
              onClick={() => setMobileStep("crop")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5! py-3! text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
              disabled={isPublishing}
            >
              <ArrowLeft size={16} />
              Back to crop
            </button>
          </div>

          <div className="border-t border-white/10 p-4">
            {renderActionButtons()}
          </div>
        </div>

        <aside className="hidden min-h-0 flex-col border-t border-white/10 bg-black/30 lg:flex lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4 pr-14">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-red-300">
                Draft queue
              </p>
              <h3 className="mt-1 truncate text-base! font-bold text-white">
                Added flash
              </h3>
            </div>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5! py-1! text-xs font-semibold text-zinc-300">
              {draftFlashes.length}
            </span>
          </div>

          <div className="request-modal-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            {draftFlashes.length === 0 ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-5 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-red-300">
                  <Scissors size={22} />
                </span>
                <h4 className="mt-4 text-base! font-bold text-white">
                  No drafts yet
                </h4>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Choose a crop, then create flash to add it here before
                  publishing.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {draftFlashes.map((flash) => {
                  const repeatability = getFlashRepeatability(flash);
                  return (
                    <article
                      key={flash.id}
                      className="overflow-hidden rounded-xl border border-white/10 bg-[#151515] shadow-[0_12px_28px_rgba(0,0,0,0.28)]"
                    >
                      <FlashPreviewImage flash={flash} showBadge={false}>
                        {repeatability === "one_of_one" && (
                          <span className="absolute left-2 top-2 rounded-full border border-red-300/30 bg-red-500/20 px-2! py-0.5! text-[9px] font-bold uppercase tracking-[0.08em] text-red-100 backdrop-blur">
                            One of one
                          </span>
                        )}
                      </FlashPreviewImage>
                      <div className="p-2.5">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="truncate text-xs! font-bold text-white sm:text-sm!">
                              {getFlashTitle(flash)}
                            </h4>
                            <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-500">
                              {formatFlashPrice(flash.price)}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => onEditDraft(flash)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 p-0! text-zinc-300 transition hover:bg-white hover:text-black"
                              aria-label={`Edit ${getFlashTitle(flash)} draft`}
                              title="Edit draft"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDiscardDraft(flash)}
                              disabled={discardingDraftId === flash.id}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 p-0! text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                              aria-label={`Discard ${getFlashTitle(flash)} draft`}
                              title="Discard draft"
                            >
                              {discardingDraftId === flash.id ? (
                                <span className="text-[11px] font-bold">
                                  ...
                                </span>
                              ) : (
                                <Trash2 size={13} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 bg-[#0d0d0d]/95 p-4 shadow-[0_-18px_40px_rgba(0,0,0,0.32)]">
            <button
              type="button"
              onClick={onPublishDrafts}
              disabled={draftFlashes.length === 0 || isPublishingDrafts || isPublishing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4! py-3! text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <CheckCircle2 size={16} />
              {isPublishingDrafts ? "Publishing..." : "Publish added flash"}
            </button>
          </div>
        </aside>

        {showDetailsModal && (
          <div className="absolute inset-0 z-30 hidden items-center justify-center bg-black/70 px-6 backdrop-blur-sm lg:flex">
            <div className="w-full max-w-xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#151515] shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
                    Flash details
                  </p>
                  <h3 className="mt-2 text-2xl! font-bold text-white">
                    Create hidden draft
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDetailsModal(false)}
                  disabled={isPublishing}
                  className="rounded-full border border-white/10 bg-white/5 p-2! text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Close flash details"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="request-modal-scrollbar max-h-[70vh] space-y-5 overflow-y-auto p-5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-4">
                    {validCropArea ? (
                      <CroppedFlashPreview
                        imageUrl={sheet.imageUrl}
                        cropArea={validCropArea}
                      />
                    ) : (
                      <PreviewPlaceholder />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        Crop preview
                      </p>
                      <p className="mt-1 text-sm leading-6 text-zinc-400">
                        This draft stays hidden until you publish the added
                        flash.
                      </p>
                    </div>
                  </div>
                </div>

                {renderDetailsFields()}
              </div>

              <div className="grid gap-3 border-t border-white/10 p-5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShowDetailsModal(false)}
                  disabled={isPublishing}
                  className="rounded-xl border border-white/10 bg-white/5 px-5! py-3! text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitDesktopDetails}
                  disabled={!validCropArea || isPublishing}
                  className="rounded-xl bg-white px-5! py-3! text-sm font-semibold text-[#0b0b0b]! transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-white/60 disabled:text-[#0b0b0b]! disabled:opacity-100"
                >
                  {isPublishing ? "Creating..." : "Submit draft"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlashSheetDetailPage;
