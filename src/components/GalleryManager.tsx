// GalleryManager.tsx
import { useState, useEffect, useRef } from "react";
import { db, storage } from "../firebase/firebaseConfig";
import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import UploadModal from "./UploadModal";
import { Plus, MoreVertical, X } from "lucide-react";
import type { GalleryItem } from "../types/GalleryItem";

const GalleryManager = ({ uid }: { uid: string }) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [artistInfo, setArtistInfo] = useState<{
    avatarUrl?: string;
    displayName?: string;
  }>({});

  const fetchGallery = async () => {
    const q = query(collection(db, "gallery"), where("artistId", "==", uid));
    const snapshot = await getDocs(q);
    setItems(
      snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as GalleryItem))
    );
  };

  // Fetch artist details for full modal
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
    const q = query(collection(db, "gallery"), where("artistId", "==", uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const galleryItems = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as GalleryItem)
      );
      setItems(galleryItems);
    });
    fetchGallery();
    return () => unsubscribe();
  }, [uid]);

  const handleUpdateItem = async (
    itemId: string,
    caption: string,
    tags: string[]
  ) => {
    await updateDoc(doc(db, "gallery", itemId), {
      caption,
      tags,
    });
    setEditingItem(null);
  };

  const handleDelete = async (item: GalleryItem) => {
    await deleteDoc(doc(db, "gallery", item.id));
    const paths = [item.thumbPath, item.previewPath, item.fullPath];
    await Promise.allSettled(
      paths.map((path) => deleteObject(ref(storage, path)))
    );
    setEditingItem(null);
  };

  return (
    <div>
      <div className="flex gap-2 items-center my-5">
        <button
          onClick={() => setIsUploadOpen(true)}
          className="mb-4 px-3! py-1! bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-button)] rounded-none! text-white flex gap-1 "
        >
          Add <Plus />
        </button>
      </div>

      {isUploadOpen && (
        <UploadModal
          uid={uid}
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          collectionType="gallery"
          onUploadComplete={fetchGallery}
        />
      )}

      {/* Grid of gallery items */}
      <div
        className="grid gap-4 justify-center md:justify-start"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 250px))",
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg shadow-lg overflow-hidden relative hover:shadow-xl transition-shadow duration-300"
          >
            {/* Header Row */}
            <div className="flex justify-between items-center px-2 py-1 bg-[var(--color-bg-base)]">
              <h2 className="text-sm font-semibold text-white! truncate max-w-[70%] leading-none my-0!">
                {item.caption || "Untitled"}
              </h2>
              <button
                onClick={() => setEditingItem(item)}
                className="text-white hover:text-gray-300 transition flex items-center"
              >
                <MoreVertical size={18} />
              </button>
            </div>

            {/* Image Section */}
            {item.status === "processing" ? (
              <div className="flex items-center justify-center bg-[var(--color-bg-base)] h-48">
                <span className="text-white text-sm">Processing…</span>
              </div>
            ) : (
              <div
                className="w-full max-h-50 overflow-hidden cursor-pointer"
                onClick={() => setSelectedItem(item)}
              >
                <img
                  src={item.thumbUrl || item.webp90Url}
                  alt={item.caption || "Gallery item"}
                  className="w-full object-cover max-h-50 hover:scale-105 transition duration-300 ease-in-out"
                />
              </div>
            )}

            {/* Tag marquee for gallery (unchanged) */}
            {item.status === "ready" &&
              Array.isArray(item.tags) &&
              item.tags.length > 0 && (
                <TagMarquee tags={item.tags} variant="gallery" />
              )}
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <EditGalleryItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleUpdateItem}
          onDelete={handleDelete}
        />
      )}

      {/* Full Image Modal */}
      {selectedItem && (
        <div
          onClick={() => setSelectedItem(null)}
          className="fixed inset-0 bg-black/80 z-50 backdrop-blur-xs flex flex-col md:flex-row gap-5 items-center justify-center"
        >
          <div className="relative max-w-[90%] max-h-[85%] flex flex-col">
            <div className="absolute top-1 left-2 right-2 flex items-center gap-4 py-0 rounded-lg bg-[#121212]/40 px-2">
              {/* Tag Marquee (flexible width in between) */}
              {Array.isArray(selectedItem.tags) &&
                selectedItem.tags.length > 0 && (
                  <TagMarqueeModal tags={selectedItem.tags} />
                )}

              {/* Close Button */}
              <button
                className="text-white text-xl md:text-2xl hover:text-gray-300 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedItem(null);
                }}
              >
                <X />
              </button>
            </div>
            {/* bottom section for artist avatar and image */}
            <div className="absolute bottom-3 left-3 flex gap-2 justify-start items-center">
              <img
                src={artistInfo.avatarUrl || "/default-avatar.png"}
                alt={artistInfo.displayName || "Artist"}
                className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-white shadow-md animate-pulse"
              />
              <span className="text-white font-semibold text-lg animate-pulse">
                {artistInfo.displayName || "Unknown Artist"}
              </span>
            </div>
            {/* Image below header */}
            <img
              src={selectedItem.fullUrl || selectedItem.webp90Url}
              alt={selectedItem.caption || "Full view"}
              className="object-contain rounded-b-lg shadow-lg max-h-[80vh] md:max-h-[70vh] lg:max-h-[60vh] max-w-full"
            />
          </div>
          <h1 className="max-w-[300px] text-sm! md:text-xl! lg:text-2xl!">
            {selectedItem.caption}
          </h1>
        </div>
      )}
    </div>
  );
};

// TagMarquee component with variant support
const TagMarquee = ({
  tags,
  variant = "gallery",
}: {
  tags: string[];
  variant?: "gallery" | "modal";
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState("60s");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (trackRef.current) {
      const width = trackRef.current.scrollWidth;
      const speed = 10;
      const calculatedDuration = `${width / speed}s`;
      setDuration(calculatedDuration);
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

  const baseContainer =
    variant === "gallery" ? "bg-[var(--color-bg-base)]/90" : "bg-transparent";

  const tagClasses =
    variant === "gallery"
      ? "hover:bg-[var(--color-bg-button)] text-neutral-400 text-xs px-3 py-1 shadow-sm"
      : "text-gray-200 text-xs font-medium px-2";

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden h-8 px-4 ${baseContainer}`}
    >
      {/* Fade edges (hide for modal) */}
      {variant === "gallery" && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[var(--color-bg-footer)] to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[var(--color-bg-footer)] to-transparent z-10" />
        </>
      )}

      <style>
        {`
          @keyframes scrollTags {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .tag-track {
            display: flex;
            width: max-content;
            animation: scrollTags linear infinite;
          }
          .tag-track:hover {
            animation-play-state: paused;
          }
        `}
      </style>

      <div
        ref={trackRef}
        className={`py-1 tag-track ${!isVisible ? "pause" : ""}`}
        style={{ animationDuration: duration }}
      >
        {[...tags, ...tags].map((tag, idx) => (
          <span key={idx} className={`mx-2 ${tagClasses}`}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};
const TagMarqueeModal = ({ tags }: { tags: string[] }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState("60s");
  const [isVisible, setIsVisible] = useState(false);

  // Calculate duration based on the doubled track width
  useEffect(() => {
    if (trackRef.current) {
      const totalWidth = trackRef.current.scrollWidth;
      const speed = 10; // pixels per second
      const calculatedDuration = `${totalWidth / 2 / speed}s`;
      // divide by 2 because we doubled the tags, so we only want one full cycle time
      setDuration(calculatedDuration);
    }
  }, [tags]);

  // Pause animation when not visible
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
      className="relative overflow-hidden h-8 flex-1 flex items-center whitespace-nowrap"
    >
      <style>
        {`
          @keyframes scrollTagsModal {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); } /* Only half, so it loops seamlessly */
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
        {/* Double the tags to create seamless loop */}
        {[...tags, ...tags].map((tag, idx) => (
          <span
            key={idx}
            className="mx-3 text-white text-xs font-medium"
            style={{
              lineHeight: "1rem",
              maxHeight: "1.5rem",
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};

// Edit modal unchanged
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

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      if (tags.length >= 6) {
        setWarning("You can only add up to 6 tags.");
        return;
      }
      setTags([...tags, newTag.trim()]);
      setNewTag("");
      setWarning(null); // Clear any existing warning when successful
    }
  };
  const [warning, setWarning] = useState<string | null>(null);

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[var(--color-bg-footer)] rounded-lg p-6 w-full max-w-md">
        <span className="text-sm text-white!">Manage</span>
        {/* Image Preview */}
        <div className="mb-4">
          <img
            src={item.thumbUrl || item.webp90Url}
            alt={item.caption || "Preview"}
            className="max-w-[200px] mx-auto object-cover rounded-md shadow"
          />
        </div>

        {/* Title Input */}
        <label className="block mb-3 text-sm">Title</label>
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full px-3 py-2 rounded bg-[var(--color-bg-base)] text-white mb-4"
          placeholder="Enter title"
        />

        {/* Tags Section */}
        <label className="block mb-2 text-sm">Tags</label>
        <div className="flex flex-wrap gap-2 mb-3 max-h-16 overflow-y-auto pr-2 custom-scrollbar scrollbar-thin">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 bg-[var(--color-bg-base)] text-white text-xs px-3 py-1 rounded-full shadow-sm min-h-[28px] max-w-[120px] truncate"
              title={tag}
            >
              {tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="text-red-400 leading-none text-sm hover:text-red-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {/* Add Tag Input */}
        <div className="flex gap-2 mb-4">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-[var(--color-bg-base)] text-white text-sm"
            placeholder="Add tag"
          />

          <button
            onClick={handleAddTag}
            className="bg-[var(--color-bg-button)] text-white px-2! py-1! rounded text-sm"
          >
            Add
          </button>
        </div>
        {warning && <p className="text-rose-200! text-xs! mt-1">{warning}</p>}
        {/* Action Buttons */}
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={() => onDelete(item)}
            className="text-sm text-[var(--color-bg-footer)]! bg-rose-600 hover:bg-rose-700  px-2! py-1! rounded"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-2! py-1! bg-[var(--color-bg-card)] text-white rounded text-sm"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(item.id, caption, tags)}
              className="px-2! py-1! bg-emerald-600 hover:bg-emerald-700 text-[var(--color-bg-footer)]! rounded text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GalleryManager;
