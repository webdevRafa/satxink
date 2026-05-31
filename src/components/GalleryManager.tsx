import { useEffect, useMemo, useRef, useState } from "react";
import { db, storage } from "../firebase/firebaseConfig";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  MoreVertical,
  Plus,
  Upload,
  X,
} from "lucide-react";
import UploadModal from "./UploadModal";
import type { GalleryItem } from "../types/GalleryItem";
import AnimatedTagInput from "./ui/AnimatedTagInput";

type SlideDirection = "next" | "prev";

type GalleryArtistInfo = {
  avatarUrl?: string;
  displayName?: string;
};

const GalleryManager = ({ uid }: { uid: string }) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [modalLoading, setModalLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [slideDirection, setSlideDirection] = useState<SlideDirection>("next");
  const [artistInfo, setArtistInfo] = useState<GalleryArtistInfo>({});

  const previewItems = useMemo(
    () => items.filter((item) => item.status !== "processing"),
    [items]
  );

  const selectedItemIndex = selectedItem
    ? previewItems.findIndex((item) => item.id === selectedItem.id)
    : -1;
  const canNavigatePortfolio = previewItems.length > 1 && selectedItemIndex >= 0;

  const fetchGallery = async () => {
    const galleryQuery = query(
      collection(db, "gallery"),
      where("artistId", "==", uid)
    );
    const snapshot = await getDocs(galleryQuery);
    setItems(
      snapshot.docs.map((itemDoc) => ({
        id: itemDoc.id,
        ...itemDoc.data(),
      })) as GalleryItem[]
    );
  };

  useEffect(() => {
    const fetchArtistData = async () => {
      if (!uid) return;
      const artistRef = doc(db, "users", uid);
      const artistSnap = await getDoc(artistRef);
      if (artistSnap.exists()) {
        const data = artistSnap.data() as {
          avatarUrl?: unknown;
          displayName?: unknown;
          name?: unknown;
        };
        setArtistInfo({
          avatarUrl:
            typeof data.avatarUrl === "string" ? data.avatarUrl : "",
          displayName:
            typeof data.displayName === "string"
              ? data.displayName
              : typeof data.name === "string"
                ? data.name
                : "Unknown Artist",
        });
      }
    };

    fetchArtistData();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const galleryQuery = query(
      collection(db, "gallery"),
      where("artistId", "==", uid)
    );
    const unsubscribe = onSnapshot(galleryQuery, (snapshot) => {
      const galleryItems = snapshot.docs.map((itemDoc) => ({
        id: itemDoc.id,
        ...itemDoc.data(),
      })) as GalleryItem[];
      setItems(galleryItems);
    });

    fetchGallery();
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (selectedItem) setModalLoading(true);
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedItem(null);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigatePortfolio("next");
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigatePortfolio("prev");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem, selectedItemIndex, previewItems.length]);

  const openPortfolioItem = (item: GalleryItem) => {
    setSlideDirection("next");
    setSelectedItem(item);
  };

  const navigatePortfolio = (direction: SlideDirection) => {
    if (!canNavigatePortfolio) return;

    const offset = direction === "next" ? 1 : -1;
    const nextIndex =
      (selectedItemIndex + offset + previewItems.length) % previewItems.length;

    setSlideDirection(direction);
    setSelectedItem(previewItems[nextIndex]);
  };

  const handleUpdateItem = async (
    itemId: string,
    caption: string,
    tags: string[]
  ) => {
    await updateDoc(doc(db, "gallery", itemId), { caption, tags });
    setEditingItem(null);
  };

  const handleDelete = async (item: GalleryItem) => {
    await deleteDoc(doc(db, "gallery", item.id));
    const paths = [item.thumbPath, item.previewPath, item.fullPath].filter(
      Boolean
    );
    await Promise.allSettled(
      paths.map((path) => deleteObject(ref(storage, path)))
    );
    setEditingItem(null);
  };

  return (
    <div className="mt-6 space-y-8">
      <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#121212]">
        <div className="flex flex-col gap-5 border-b border-white/10 bg-white/[0.02] p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-300">
              Gallery library
            </p>
            <h2 className="mt-2 text-2xl! font-bold text-white">
              Your portfolio gallery
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Keep finished work polished, tagged, and ready for clients to
              explore from your public profile.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-3! py-1.5! text-xs font-semibold text-zinc-300">
              {items.length} total
            </span>
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5! py-3! text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              <Upload size={16} />
              Add work
            </button>
          </div>
        </div>
      </section>

      {isUploadOpen && (
        <UploadModal
          uid={uid}
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          collectionType="gallery"
          onUploadComplete={fetchGallery}
        />
      )}

      <section>
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-300">
              Portfolio pieces
            </p>
            <h2 className="mt-2 text-2xl! font-bold text-white">
              Gallery work
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Open any piece to preview it, or manage details from the card.
            </p>
          </div>
          {items.length > 0 && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3! py-1.5! text-xs font-semibold text-zinc-300">
              {items.length} total
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#121212] p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-red-300">
              <ImageIcon size={22} />
            </span>
            <h3 className="mt-4 text-xl! font-bold text-white">
              No gallery work yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
              Add healed pieces, fresh work, and portfolio highlights that help
              clients understand your range.
            </p>
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5! py-3! text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              <Plus size={16} />
              Add first piece
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => {
              const tags = Array.isArray(item.tags)
                ? item.tags.slice(0, 3)
                : [];
              const isProcessing = item.status === "processing";

              return (
                <article
                  key={item.id}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-[#151515] text-left transition hover:border-red-300/40 hover:bg-[#191919]"
                >
                  <button
                    type="button"
                    onClick={() => !isProcessing && openPortfolioItem(item)}
                    className="block w-full text-left"
                    disabled={isProcessing}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-black">
                      {isProcessing ? (
                        <div className="flex h-full w-full items-center justify-center bg-white/[0.03]">
                          <span className="rounded-full border border-white/10 bg-black/40 px-3! py-1.5! text-xs font-semibold text-zinc-300">
                            Processing...
                          </span>
                        </div>
                      ) : (
                        <img
                          src={item.thumbUrl || item.webp90Url || item.fullUrl}
                          alt={item.caption || "Gallery item"}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3! py-1.5! text-xs font-semibold text-white backdrop-blur">
                          <ImageIcon size={14} />
                          {isProcessing ? "Processing" : "Portfolio"}
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => !isProcessing && openPortfolioItem(item)}
                        className="min-w-0 flex-1 text-left"
                        disabled={isProcessing}
                      >
                        <h3 className="truncate text-lg! font-bold text-white">
                          {item.caption || "Untitled piece"}
                        </h3>
                      </button>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingItem(item)}
                          className="rounded-full border border-white/10 bg-white/5 p-2! text-zinc-300 transition hover:bg-white hover:text-black"
                          aria-label={`Manage ${item.caption || "gallery item"}`}
                        >
                          <MoreVertical size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => !isProcessing && openPortfolioItem(item)}
                          className="rounded-full border border-white/10 bg-white/5 p-2! text-zinc-300 transition group-hover:bg-white group-hover:text-black"
                          aria-label={`Open ${item.caption || "gallery item"}`}
                          disabled={isProcessing}
                        >
                          <ArrowRight size={15} />
                        </button>
                      </div>
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
                </article>
              );
            })}
          </div>
        )}
      </section>

      {editingItem && (
        <EditGalleryItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleUpdateItem}
          onDelete={handleDelete}
        />
      )}

      {selectedItem && (
        <PortfolioLightbox
          item={selectedItem}
          artist={artistInfo}
          slideDirection={slideDirection}
          canNavigate={canNavigatePortfolio}
          modalLoading={modalLoading}
          onImageLoad={() => setModalLoading(false)}
          onNext={() => navigatePortfolio("next")}
          onPrev={() => navigatePortfolio("prev")}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
};

const PortfolioLightbox = ({
  item,
  artist,
  slideDirection,
  canNavigate,
  modalLoading,
  onImageLoad,
  onNext,
  onPrev,
  onClose,
}: {
  item: GalleryItem;
  artist: GalleryArtistInfo;
  slideDirection: SlideDirection;
  canNavigate: boolean;
  modalLoading: boolean;
  onImageLoad: () => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) => {
  const slideClass =
    slideDirection === "next"
      ? "portfolio-slide-in-next"
      : "portfolio-slide-in-prev";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/85 px-5 py-6 backdrop-blur-xs md:flex-row md:px-10"
      role="dialog"
      aria-modal="true"
    >
      <style>
        {`
          @keyframes portfolioSlideInNext {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          @keyframes portfolioSlideInPrev {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
          .portfolio-slide-in-next {
            animation: portfolioSlideInNext 360ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .portfolio-slide-in-prev {
            animation: portfolioSlideInPrev 360ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          @keyframes portfolioMetaInNext {
            from { opacity: 0; transform: translateX(24px); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes portfolioMetaInPrev {
            from { opacity: 0; transform: translateX(-24px); }
            to { opacity: 1; transform: translateX(0); }
          }
          .portfolio-meta-in-next {
            animation: portfolioMetaInNext 260ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .portfolio-meta-in-prev {
            animation: portfolioMetaInPrev 260ms cubic-bezier(0.22, 1, 0.36, 1);
          }
        `}
      </style>

      <div className="relative flex max-h-[84vh] max-w-[94vw] flex-col md:max-w-[70vw]">
        <LightboxImageFrame
          imageKey={item.id}
          fullUrl={item.fullUrl || item.webp90Url}
          previewUrl={getLightboxPreviewUrl(item)}
          alt={item.caption || "Full portfolio view"}
          isLoading={modalLoading}
          loadingLabel="Loading full resolution"
          slideClass={slideClass}
          onImageLoad={onImageLoad}
        />

        {canNavigate && (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPrev();
              }}
              className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/45 p-0! text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
              aria-label="Previous portfolio image"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onNext();
              }}
              className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/45 p-0! text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
              aria-label="Next portfolio image"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}

        <div
          className="absolute right-3 top-3 z-20"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/45 p-0! text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
            onClick={onClose}
            aria-label="Close portfolio image"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        data-aos="fade-in"
        className="w-full max-w-sm text-center md:text-left"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-center gap-3 md:justify-start">
          <img
            src={artist.avatarUrl || "/default-avatar.png"}
            alt={getArtistDisplayName(artist)}
            className="h-11 w-11 rounded-full border border-white/20 object-cover shadow-[0_10px_28px_rgba(0,0,0,0.32)]"
          />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-white/35">
              Artist
            </p>
            <p className="mt-0.5 truncate text-sm! font-semibold! leading-tight text-white">
              {getArtistDisplayName(artist)}
            </p>
          </div>
        </div>

        <p className="text-xs uppercase tracking-[0.18em] text-white/45">
          Portfolio piece
        </p>
        <div
          key={item.id}
          className={
            slideDirection === "next"
              ? "portfolio-meta-in-next"
              : "portfolio-meta-in-prev"
          }
        >
          <h1 className="mt-2 text-xl! font-light! leading-snug text-white md:text-2xl!">
            {item.caption || "Untitled piece"}
          </h1>
          {Array.isArray(item.tags) && item.tags.length > 0 && (
            <div className="mt-5 max-w-sm">
              <TagMarqueeModal tags={item.tags} compact />
            </div>
          )}
          {modalLoading && (
            <div className="mt-4 space-y-2">
              <div className="h-2 w-28 animate-pulse rounded-full bg-white/10" />
              <div className="h-2 w-40 animate-pulse rounded-full bg-white/10" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const LightboxImageFrame = ({
  imageKey,
  fullUrl,
  previewUrl,
  alt,
  isLoading,
  loadingLabel,
  slideClass,
  onImageLoad,
}: {
  imageKey: string;
  fullUrl: string;
  previewUrl: string;
  alt: string;
  isLoading: boolean;
  loadingLabel: string;
  slideClass?: string;
  onImageLoad: () => void;
}) => (
  <div
    className="relative flex h-[min(72vh,760px)] w-[min(94vw,940px)] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#080808] shadow-2xl"
    onClick={(event) => event.stopPropagation()}
  >
    <div key={imageKey} className={`absolute inset-0 ${slideClass || ""}`}>
      <img
        src={previewUrl}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
          isLoading ? "opacity-100" : "opacity-0"
        }`}
        decoding="async"
      />
      <img
        src={fullUrl}
        alt={alt}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
          isLoading ? "opacity-0" : "opacity-100"
        }`}
        decoding="async"
        onLoad={onImageLoad}
        onError={onImageLoad}
      />
    </div>
    <div
      className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_55%),linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.08)_45%,transparent_70%)] transition-opacity duration-300 ${
        isLoading ? "opacity-25 animate-pulse" : "opacity-0"
      }`}
    />
    {isLoading && (
      <div className="absolute inset-x-0 bottom-5 z-20 mx-auto flex w-fit items-center gap-3 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-sm text-white/75 shadow-lg backdrop-blur-md">
        <span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        {loadingLabel}
      </div>
    )}
  </div>
);

const TagMarqueeModal = ({
  tags,
  compact = false,
}: {
  tags: string[];
  compact?: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState("60s");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (trackRef.current) {
      const totalWidth = trackRef.current.scrollWidth;
      const speed = 10;
      setDuration(`${totalWidth / 2 / speed}s`);
    }
  }, [tags]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => setIsVisible(entry.isIntersecting));
      },
      { threshold: 0.1 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-medium text-white/70"
          >
            {tag}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-8 flex-1 items-center overflow-hidden whitespace-nowrap"
    >
      <style>
        {`
          @keyframes scrollTagsModal {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .tag-track-modal {
            display: flex;
            flex-wrap: nowrap;
            white-space: nowrap;
            width: max-content;
            animation: scrollTagsModal linear infinite;
            align-items: center;
          }
          .tag-track-modal:hover {
            animation-play-state: paused;
          }
        `}
      </style>

      <div
        ref={trackRef}
        className={`tag-track-modal ${!isVisible ? "pause" : ""}`}
        style={{ animationDuration: duration }}
      >
        {[...tags, ...tags].map((tag, idx) => (
          <span
            key={`${tag}-${idx}`}
            className="mx-3 text-xs font-medium text-white"
            style={{ lineHeight: "1rem", maxHeight: "1.5rem" }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};

const EditGalleryItemModal = ({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: GalleryItem;
  onClose: () => void;
  onSave: (id: string, caption: string, tags: string[]) => void;
  onDelete: (item: GalleryItem) => void;
}) => {
  const [caption, setCaption] = useState(item.caption || "");
  const [tags, setTags] = useState<string[]>(item.tags || []);
  const [warning, setWarning] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-xl request-modal-scrollbar sm:py-8">
      <div className="flex min-h-full items-center justify-center">
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111111] text-white shadow-2xl md:min-h-[min(760px,88vh)] md:grid-cols-[0.9fr_1.15fr]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-white/5 p-2! text-zinc-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Close gallery editor"
        >
          <X size={18} />
        </button>

        <div className="border-b border-white/10 bg-black/30 p-5 md:border-b-0 md:border-r md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Manage gallery
          </p>
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/35">
            <img
              src={item.thumbUrl || item.webp90Url || item.fullUrl}
              alt={item.caption || "Gallery preview"}
              className="aspect-square w-full object-cover"
            />
          </div>
        </div>

        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto p-5 request-modal-scrollbar md:max-h-[88vh] md:p-6">
          <h2 className="text-2xl! font-bold text-white">Edit gallery work</h2>

          <label className="mt-6 block">
            <span className="text-sm font-semibold text-zinc-300">Title</span>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
              placeholder="Enter title"
            />
          </label>

          <AnimatedTagInput
            className="mt-4"
            value={tags}
            onChange={(nextTags) => {
              setTags(nextTags);
              setWarning(null);
            }}
            label="Tags"
            maxTags={6}
            onLimitExceeded={() => setWarning("You can only add up to 6 tags.")}
            emptyPlaceholder="Type a tag, then press comma or space"
          />
          {warning && <p className="mt-2 text-xs text-rose-200!">{warning}</p>}

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => onDelete(item)}
              className="rounded-xl border border-red-400/20 bg-red-500/10 px-4! py-3! text-sm font-semibold text-red-200 transition hover:bg-red-500/20"
            >
              Delete
            </button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/5 px-5! py-3! text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onSave(item.id, caption, tags)}
                className="rounded-xl bg-white px-5! py-3! text-sm font-semibold text-black transition hover:bg-zinc-200"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

const getLightboxPreviewUrl = (item: GalleryItem) =>
  item.webp90Url || item.thumbUrl || item.fullUrl;

const getArtistDisplayName = (artist: GalleryArtistInfo) =>
  artist.displayName || "Artist";

export default GalleryManager;
