import { useEffect, useRef, useState } from "react";
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
  Image as ImageIcon,
  MoreVertical,
  Plus,
  Upload,
  X,
} from "lucide-react";
import UploadModal from "./UploadModal";
import type { GalleryItem } from "../types/GalleryItem";

const GalleryManager = ({ uid }: { uid: string }) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [modalLoading, setModalLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [artistInfo, setArtistInfo] = useState<{
    avatarUrl?: string;
    displayName?: string;
  }>({});

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
      if (!selectedItem?.artistId) return;
      const artistRef = doc(db, "users", selectedItem.artistId);
      const artistSnap = await getDoc(artistRef);
      if (artistSnap.exists()) {
        const data = artistSnap.data() as any;
        setArtistInfo({
          avatarUrl: data.avatarUrl || "",
          displayName: data.displayName || "Unknown Artist",
        });
      }
    };

    fetchArtistData();
  }, [selectedItem]);

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
    <div className="space-y-8">
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
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-[#151515] text-left transition hover:-translate-y-0.5 hover:border-red-300/40 hover:bg-[#191919]"
                >
                  <button
                    type="button"
                    onClick={() => !isProcessing && setSelectedItem(item)}
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
                        onClick={() => !isProcessing && setSelectedItem(item)}
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
                          onClick={() => !isProcessing && setSelectedItem(item)}
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
        <div
          onClick={() => setSelectedItem(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/80 px-5 backdrop-blur-xs md:flex-row md:px-0"
        >
          <div className="relative flex max-h-[85%] max-w-[90%] flex-col">
            {modalLoading && (
              <div
                className="absolute inset-0 animate-pulse rounded-b-lg bg-black/70 shadow-lg"
                style={{ minHeight: "60vh", maxHeight: "80vh" }}
              />
            )}

            <img
              data-aos="zoom-out-up"
              src={selectedItem.fullUrl || selectedItem.webp90Url}
              alt={selectedItem.caption || "Full view"}
              className={`max-h-[70vh] max-w-full rounded-b-lg object-contain shadow-lg transition-opacity duration-300 lg:max-h-[60vh] ${
                modalLoading ? "opacity-0" : "opacity-100"
              }`}
              onLoad={() => setModalLoading(false)}
            />

            {selectedItem && !modalLoading && (
              <div className="absolute left-2 right-2 top-1 flex items-center gap-4 rounded-lg bg-[#121212]/20 py-0">
                {Array.isArray(selectedItem.tags) &&
                  selectedItem.tags.length > 0 && (
                    <TagMarqueeModal tags={selectedItem.tags} />
                  )}
                <button
                  type="button"
                  className="shrink-0 text-xl text-white transition hover:text-gray-300 md:text-2xl"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItem(null);
                  }}
                >
                  <X />
                </button>
              </div>
            )}

            {selectedItem && !modalLoading && (
              <div className="absolute bottom-3 left-3 flex items-center justify-start gap-2">
                <img
                  src={artistInfo.avatarUrl || "/default-avatar.png"}
                  alt={artistInfo.displayName || "Artist"}
                  className="h-8 w-8 rounded-full border border-white shadow-md opacity-100 transition-opacity duration-300 md:h-10 md:w-10"
                />
                <span className="text-lg font-semibold text-white opacity-100 transition-opacity duration-300">
                  {artistInfo.displayName || "Unknown Artist"}
                </span>
              </div>
            )}
          </div>

          {selectedItem && !modalLoading && (
            <>
              <h1 className="max-w-[300px] text-sm text-white! opacity-100 transition-opacity duration-500 md:hidden md:translate-x-[-40px] md:text-2xl!">
                {selectedItem.caption}
              </h1>
              <h1
                data-aos="fade-in"
                className="hidden max-w-[300px] text-sm font-light! text-white! opacity-100 transition-opacity duration-500 md:block md:translate-x-[-40px] md:text-2xl!"
              >
                {selectedItem.caption}
              </h1>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const TagMarqueeModal = ({ tags }: { tags: string[] }) => {
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
  const [newTag, setNewTag] = useState("");
  const [warning, setWarning] = useState<string | null>(null);

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    if (tags.length >= 6) {
      setWarning("You can only add up to 6 tags.");
      return;
    }
    setTags([...tags, trimmed]);
    setNewTag("");
    setWarning(null);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-xl">
      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111111] text-white shadow-2xl md:grid-cols-[0.9fr_1.1fr]">
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

        <div className="p-5 md:p-6">
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

          <div className="mt-4">
            <span className="text-sm font-semibold text-zinc-300">Tags</span>
            <div className="mt-2 flex max-h-24 flex-wrap gap-2 overflow-y-auto pr-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex min-h-8 max-w-[140px] items-center gap-1 truncate rounded-full border border-white/10 bg-white/5 px-3! py-1! text-xs text-white"
                  title={tag}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-red-300 transition hover:text-red-200"
                  >
                    X
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
              placeholder="Add tag"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="rounded-xl border border-white/10 bg-white/5 px-4! py-3! text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              Add
            </button>
          </div>
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
  );
};

export default GalleryManager;
