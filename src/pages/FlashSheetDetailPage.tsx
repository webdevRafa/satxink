import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  DollarSign,
  Edit3,
  Grid2X2,
  Layers,
  Scissors,
  Tag,
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
import type { Flash } from "../types/Flash";
import type { FlashSheet } from "../types/FlashSheet";
import { parseTags } from "../utils/tags";
import EditFlashModal from "../components/EditFlashModal";

const FlashSheetDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<FlashSheet | null>(null);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [editingFlash, setEditingFlash] = useState<Flash | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<Area | null>(null);
  const [newFlashTitle, setNewFlashTitle] = useState("");
  const [newFlashPrice, setNewFlashPrice] = useState("");
  const [newFlashTags, setNewFlashTags] = useState("");

  const sheetTags = useMemo(
    () => (Array.isArray(sheet?.tags) ? sheet.tags.slice(0, 5) : []),
    [sheet?.tags]
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
    } catch (err: any) {
      toast.error(err?.message || "Failed to load flash sheet.");
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
    tags: string[]
  ) => {
    await updateDoc(doc(db, "flashes", flashId), { title, price, tags });
    setEditingFlash(null);
    if (id) fetchFlashes(id);
    toast.success("Flash updated.");
  };

  const handleCropComplete = (_: Area, areaPixels: Area) => {
    setCropArea(areaPixels);
  };

  const handleSaveNewFlash = async () => {
    if (!sheet || !cropArea || isPublishing) return;

    try {
      setIsPublishing(true);

      const cropFlashFromSheet = httpsCallable(functions, "cropFlashFromSheet");
      await cropFlashFromSheet({
        sheetId: sheet.id,
        crop: cropArea,
        title: newFlashTitle.trim() || "Untitled Flash",
        price: newFlashPrice ? parseFloat(newFlashPrice) : null,
        tags: parseTags(newFlashTags),
      });

      setShowCropModal(false);
      setNewFlashTitle("");
      setNewFlashPrice("");
      setNewFlashTags("");
      setCropArea(null);
      setZoom(1);
      if (id) fetchFlashes(id);
      toast.success("Flash published.");
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong while publishing.");
    } finally {
      setIsPublishing(false);
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
            className="mt-5 rounded-xl bg-white px-5! py-3! text-sm font-semibold text-black"
          >
            Back to flashes
          </button>
        </div>
      </div>
    );
  }

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
                <MiniStat label="Items" value={flashes.length} />
                <MiniStat label="Sheet" value="Live" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCropModal(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5! py-3! text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              <Scissors size={16} />
              Add flash from sheet
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
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {flashes.map((flash) => (
              <article
                key={flash.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-[#151515]"
              >
                <div className="aspect-square overflow-hidden bg-black">
                  <img
                    src={flash.thumbUrl || flash.webp90Url || flash.fullUrl}
                    alt={flash.title || "Flash"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base! font-bold text-white">
                        {flash.title || "Untitled Flash"}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        {flash.price ? `$${flash.price}` : "Price not set"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingFlash(flash)}
                      className="rounded-full border border-white/10 bg-white/5 p-2! text-zinc-300 transition hover:bg-white hover:text-black"
                      aria-label={`Edit ${flash.title || "flash"}`}
                    >
                      <Edit3 size={15} />
                    </button>
                  </div>
                  {Array.isArray(flash.tags) && flash.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {flash.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5! py-1! text-xs text-zinc-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
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
          title={newFlashTitle}
          price={newFlashPrice}
          tags={newFlashTags}
          isPublishing={isPublishing}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
          onTitleChange={setNewFlashTitle}
          onPriceChange={setNewFlashPrice}
          onTagsChange={setNewFlashTags}
          onClose={() => setShowCropModal(false)}
          onPublish={handleSaveNewFlash}
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

const CropFlashModal = ({
  sheet,
  crop,
  zoom,
  title,
  price,
  tags,
  isPublishing,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onTitleChange,
  onPriceChange,
  onTagsChange,
  onClose,
  onPublish,
}: {
  sheet: FlashSheet;
  crop: { x: number; y: number };
  zoom: number;
  title: string;
  price: string;
  tags: string;
  isPublishing: boolean;
  onCropChange: (value: { x: number; y: number }) => void;
  onZoomChange: (value: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  onTitleChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onClose: () => void;
  onPublish: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 py-6 backdrop-blur-xl">
    <div className="relative grid h-[min(900px,92vh)] w-full max-w-7xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111111] text-white shadow-2xl lg:grid-cols-[minmax(0,1fr)_360px]">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/50 p-2! text-zinc-300 transition hover:bg-white/10 hover:text-white"
        aria-label="Close crop modal"
        disabled={isPublishing}
      >
        <X size={18} />
      </button>

      <div className="flex min-h-0 flex-col">
        <div className="border-b border-white/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Crop from sheet
          </p>
          <h2 className="mt-2 text-2xl! font-bold text-white">
            {sheet.title || "Untitled sheet"}
          </h2>
        </div>
        <div className="relative min-h-[420px] flex-1 bg-black">
          <Cropper
            image={sheet.imageUrl}
            crop={crop}
            zoom={zoom}
            maxZoom={8}
            aspect={1}
            objectFit="cover"
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropComplete}
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
                Keep the crop tight around one flash design. The saved item will
                stay linked to this sheet.
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
              onChange={(e) => onZoomChange(parseFloat(e.target.value))}
              className="mt-3 w-full accent-red-400"
            />
          </label>

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

          <label className="block">
            <span className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <Tag size={16} />
              Tags
            </span>
            <input
              type="text"
              value={tags}
              onChange={(e) => onTagsChange(e.target.value)}
              placeholder="anime, color, dragon"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
            />
          </label>
        </div>

        <div className="border-t border-white/10 p-5">
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
              className="rounded-xl bg-white px-5! py-3! text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isPublishing}
            >
              {isPublishing ? "Publishing..." : "Publish flash"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  </div>
);

export default FlashSheetDetailPage;
