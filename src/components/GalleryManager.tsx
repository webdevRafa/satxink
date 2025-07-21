import { useState, useEffect } from "react";
import { db, storage } from "../firebase/firebaseConfig";
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import UploadModal from "./UploadModal";
import { Plus, MoreVertical } from "lucide-react";

import type { GalleryItem } from "../types/GalleryItem";

const GalleryManager = ({ uid }: { uid: string }) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);

  const fetchGallery = async () => {
    const q = query(collection(db, "gallery"), where("artistId", "==", uid));
    const snapshot = await getDocs(q);
    setItems(
      snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as GalleryItem))
    );
  };

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
      <h2 className="text-xl! font-bold mt-10 mb-4">Manage Tattoo Gallery</h2>

      <button
        onClick={() => setIsUploadOpen(true)}
        className="mb-4 px-4! py-2! bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-button)] rounded-md text-white flex gap-1 "
      >
        Add <Plus />
      </button>

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
        className="grid gap-4 justify-center"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 250px))", // each item is 200–225px
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-[var(--color-bg-card)] rounded-lg shadow-lg overflow-hidden relative hover:shadow-xl transition-shadow duration-300"
          >
            {/* Header Row */}
            <div className="flex justify-between items-center px-3 py-2 bg-black/50">
              <h2 className="text-sm font-semibold text-white truncate max-w-[70%] leading-none m-0">
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
              <div className="w-full max-h-64 overflow-hidden">
                <img
                  src={item.thumbUrl || item.webp90Url}
                  alt={item.caption || "Gallery item"}
                  className="w-full object-cover max-h-64 hover:scale-105 transition duration-300 ease-in-out"
                />
              </div>
            )}

            {/* Tags Section */}
            {item.status === "ready" &&
              Array.isArray(item.tags) &&
              item.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3">
                  {item.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="bg-[var(--color-bg-base)] hover:bg-[var(--color-bg-button)] text-white text-xs px-3 py-1 rounded-full shadow-sm transition-colors duration-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
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
    </div>
  );
};

// Modal component for editing
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
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[var(--color-bg-card)] rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">Edit Gallery Item</h3>

        <label className="block mb-3 text-sm">Title</label>
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full px-3 py-2 rounded bg-[var(--color-bg-base)] text-white mb-4"
          placeholder="Enter title"
        />

        <label className="block mb-2 text-sm">Tags</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-2 bg-[var(--color-bg-base)] text-white text-xs px-3 py-1 rounded-full shadow-sm"
            >
              {tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="text-red-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2 mb-4">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-[var(--color-bg-base)] text-white"
            placeholder="Add tag"
          />
          <button
            onClick={handleAddTag}
            className="bg-[var(--color-bg-button)] text-white px-4 rounded"
          >
            Add
          </button>
        </div>

        <div className="flex justify-between items-center mt-6">
          <button
            onClick={() => onDelete(item)}
            className="text-sm bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(item.id, caption, tags)}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded"
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
