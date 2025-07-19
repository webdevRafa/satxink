import { useState, useEffect } from "react";
import { db, storage } from "../firebase/firebaseConfig";
import {
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import UploadModal from "./UploadModal";
import { ImagePlus } from "lucide-react";

import type { GalleryItem } from "../types/GalleryItem";

const GalleryManager = ({ uid }: { uid: string }) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchGallery = async () => {
    const q = query(collection(db, "gallery"), where("artistId", "==", uid));
    const snapshot = await getDocs(q);
    setItems(
      snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as GalleryItem))
    );
  };

  useEffect(() => {
    fetchGallery();
  }, []);

  const handleDelete = async (item: GalleryItem) => {
    await deleteDoc(doc(db, "gallery", item.id));
    const paths = [item.thumbPath, item.previewPath, item.fullPath];
    await Promise.allSettled(
      paths.map((path) => deleteObject(ref(storage, path)))
    );
    fetchGallery();
  };

  return (
    <div>
      <h2 className="text-xl! font-bold mt-10 mb-4">Manage Tattoo Gallery</h2>

      <button
        onClick={() => setIsUploadOpen(true)}
        className="mb-4 px-4! py-2! bg-[var(--color-bg-card)] rounded-md text-white flex gap-1 "
      >
        Add <ImagePlus />
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item) => (
          <div key={item.id} className="relative">
            <img
              src={item.thumbUrl || item.webp90Url}
              alt={item.caption || "Gallery item"}
              className="rounded-lg"
            />
            {item.caption && (
              <p className="absolute bottom-2 left-2 text-sm bg-black/60 px-2 py-1 rounded">
                {item.caption}
              </p>
            )}
            <button
              onClick={() => handleDelete(item)}
              className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded-md"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GalleryManager;
