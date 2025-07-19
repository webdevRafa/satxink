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

import type { Flash } from "../types/Flash";

const FlashManager = ({ uid }: { uid: string }) => {
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");

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

  const handleUpload = async () => {
    if (!file) return;
    const storageRef = ref(storage, `flashes/${uid}/${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    await addDoc(collection(db, "flashes"), {
      artistId: uid,
      imageUrl: url,
      title,
    });
    setFile(null);
    setTitle("");
    fetchFlashes();
  };

  const handleDelete = async (flashId: string, url: string) => {
    await deleteDoc(doc(db, "flashes", flashId));
    await deleteObject(ref(storage, url));
    fetchFlashes();
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Manage Flash Designs</h2>
      <div className="flex gap-2 mb-4">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <input
          type="text"
          placeholder="Optional title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
        {flashes.map((flash) => (
          <div key={flash.id} className="relative">
            <img
              src={flash.imageUrl}
              alt={flash.title}
              className="rounded-lg"
            />
            <button
              onClick={() => handleDelete(flash.id, flash.imageUrl)}
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
