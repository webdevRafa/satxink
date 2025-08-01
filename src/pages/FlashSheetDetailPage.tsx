import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../firebase/firebaseConfig";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import type { Flash } from "../types/Flash";
import type { FlashSheet } from "../types/FlashSheet";

const FlashSheetDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [sheet, setSheet] = useState<FlashSheet | null>(null);
  const [flashes, setFlashes] = useState<Flash[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      const docSnap = await getDoc(doc(db, "flashSheets", id));
      if (docSnap.exists()) {
        setSheet({ id: docSnap.id, ...docSnap.data() } as FlashSheet);
      }
      const q = query(collection(db, "flashes"), where("sheetId", "==", id));
      const snapshot = await getDocs(q);
      setFlashes(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Flash))
      );
    };
    fetchData();
  }, [id]);

  if (!sheet) return <p className="text-white">Loading...</p>;

  return (
    <div className="p-6 text-white mt-30 min-h-screen">
      <h1 className="text-lg!">{sheet.title}</h1>
      <img
        src={sheet.imageUrl}
        alt={sheet.title}
        className="max-h-[60px]  mb-6 rounded shadow"
      />
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
      >
        {flashes.map((flash) => (
          <div
            key={flash.id}
            className="bg-zinc-900 rounded shadow p-3 hover:scale-105 transition duration-200 ease-in-out"
          >
            <img
              src={flash.thumbUrl || flash.fullUrl}
              alt={flash.title}
              className="w-full h-40 object-cover rounded mb-2"
            />
            <p className="font-medium">{flash.title}</p>
            {flash.price && (
              <p className="text-sm text-zinc-400">${flash.price}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FlashSheetDetailPage;
