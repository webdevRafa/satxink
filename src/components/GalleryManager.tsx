import { useState, useEffect } from "react";
import { db, storage } from "../firebase/firebaseConfig";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

import type { GalleryItem } from "../types/GalleryItem";

const GalleryManager = ({ uid }: { uid: string }) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");

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

  const handleUpload = async () => {
    if (!file) return;
    const storageRef = ref(storage, `gallery/${uid}/${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    await addDoc(collection(db, "gallery"), {
      artistId: uid,
      imageUrl: url,
      caption,
    });
    setFile(null);
    setCaption("");
    fetchGallery();
  };

  const handleDelete = async (itemId: string, url: string) => {
    await deleteDoc(doc(db, "gallery", itemId));
    await deleteObject(ref(storage, url));
    fetchGallery();
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Manage Tattoo Gallery</h2>
      <div className="flex gap-2 mb-4">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <input
          type="text"
          placeholder="Optional caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="px-2 py-1 rounded-md bg-gray-800 text-white"
        />
        <button
          onClick={handleUpload}
          className="bg-red-600 px-4 py-2 rounded-md text-white"
        >
          Upload
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item) => (
          <div key={item.id} className="relative">
            <img
              src={item.imageUrl}
              alt={item.caption}
              className="rounded-lg"
            />
            {item.caption && (
              <p className="absolute bottom-2 left-2 text-sm bg-black/60 px-2 py-1 rounded">
                {item.caption}
              </p>
            )}
            <button
              onClick={() => handleDelete(item.id, item.imageUrl)}
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
