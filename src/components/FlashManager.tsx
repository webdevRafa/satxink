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

import type { Flash } from "../types/Flash";

const FlashManager = ({ uid }: { uid: string }) => {
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchFlashes = async () => {
    const q = query(collection(db, "flashes"), where("artistId", "==", uid));
    const snapshot = await getDocs(q);
    setFlashes(
      snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Flash))
    );
  };

  useEffect(() => {
    fetchFlashes();
  }, []);

  const handleDelete = async (flash: Flash) => {
    await deleteDoc(doc(db, "flashes", flash.id));
    const paths = [flash.thumbPath, flash.previewPath, flash.fullPath];
    await Promise.allSettled(
      paths.map((path) => deleteObject(ref(storage, path)))
    );
    fetchFlashes();
  };

  return (
    <div>
      <h2 className="text-xl! font-bold mt-10 mb-4">Manage Flash Designs</h2>

      <button
        onClick={() => setIsUploadOpen(true)}
        className="mb-4 px-4! py-2! bg-[var(--color-bg-card)] rounded-md text-white flex gap-1"
      >
        Add <ImagePlus />
      </button>

      {isUploadOpen && (
        <UploadModal
          uid={uid}
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          collectionType="flashes"
          onUploadComplete={fetchFlashes}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {flashes.map((flash) => (
          <div key={flash.id} className="relative">
            <img
              src={flash.thumbUrl || flash.webp90Url}
              alt={flash.title || "Flash design"}
              className="rounded-lg"
            />
            <button
              onClick={() => handleDelete(flash)}
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

export default FlashManager;
