// src/pages/DevAddDocs.tsx
import { useState } from "react";
import { collection, addDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { serverTimestamp } from "firebase/firestore";

const DevAddDocs = () => {
  const { user } = useAuth();
  const [jsonData, setJsonData] = useState<any[]>([]);
  const [collectionName, setCollectionName] = useState("users");
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [addingAvatars, setAddingAvatars] = useState(false);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result === "string") {
          const parsed = JSON.parse(result);
          if (Array.isArray(parsed)) {
            setJsonData(parsed);
            setStatus(`Loaded ${parsed.length} documents.`);
          } else {
            setStatus("JSON must be an array of objects.");
          }
        }
      } catch (err) {
        setStatus("Error parsing JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!jsonData.length) return;
    setUploading(true);
    try {
      for (const doc of jsonData) {
        await addDoc(collection(db, collectionName), {
          ...doc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setStatus(
        `Successfully uploaded ${jsonData.length} docs to "${collectionName}"`
      );
    } catch (err) {
      console.error(err);
      setStatus("Upload failed.");
    } finally {
      setUploading(false);
    }
  };
  const fixPlaceholderAvatars = async () => {
    setStatus("Scanning users…");
    try {
      const snap = await getDocs(collection(db, "users"));
      let batch = writeBatch(db);
      let counter = 0;

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const hasPlaceholder =
          !data.avatarUrl || data.avatarUrl.includes("placehold.co");

        if (hasPlaceholder) {
          batch.update(docSnap.ref, {
            avatarUrl: generateAvatarUrl(docSnap.id),
            updatedAt: serverTimestamp(),
          });
          counter++;

          // commit every 500 writes to stay under the limit
          if (counter % 500 === 0) {
            batch.commit();
            batch = writeBatch(db);
          }
        }
      });

      await batch.commit();
      setStatus(`✅ Replaced ${counter} placeholder avatar(s).`);
    } catch (err) {
      console.error(err);
      setStatus("❌ Avatar fix failed.");
    }
  };

  const handleAddAvatars = async () => {
    setAddingAvatars(true);
    try {
      // we always hit the real "users" collection regardless of the dropdown
      const snap = await getDocs(collection(db, "users"));
      let batch = writeBatch(db);
      let counter = 0;

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (!data.avatarUrl) {
          batch.update(docSnap.ref, {
            avatarUrl: generateAvatarUrl(docSnap.id),
            updatedAt: serverTimestamp(),
          });
          counter++;

          // Firestore allows 500 writes per batch
          if (counter % 500 === 0) {
            await batch.commit();
            batch = writeBatch(db);
          }
        }
      }
      await batch.commit(); // flush remainder
      setStatus(`Added avatars to ${counter} user(s) without one.`);
    } catch (err) {
      console.error(err);
      setStatus("Adding avatars failed.");
    } finally {
      setAddingAvatars(false);
    }
  };
  /** Returns a deterministic DiceBear “bottts” avatar based on a seed */
  const generateAvatarUrl = (seed: string) =>
    `https://api.dicebear.com/8.x/bottts/svg?seed=${seed}`;
  const collectionOptions = [
    "users",
    "posts",
    "messages",
    "comments",
    "galleries",
    "notifications",
    "upvotes",
    "bookings",
    "reports",
  ];

  if (!user)
    return <div className="p-8 text-center">You must be logged in.</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        📦 Dev Seeder: Push Dummy Data
      </h1>

      <label className="block mb-4">
        <span className="text-sm font-medium">Choose a collection:</span>
        <select
          className="w-full border p-2 rounded mt-1"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
        >
          {collectionOptions.map((name) => (
            <option className="bg-black" key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="block mb-4">
        <span className="text-sm font-medium">Upload JSON File:</span>
        <input
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="block mt-1"
        />
      </label>

      <button
        className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 disabled:opacity-50"
        onClick={handleUpload}
        disabled={uploading || !jsonData.length}
      >
        {uploading ? "Uploading..." : "Push to Firestore"}
      </button>
      <button
        className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 mt-2 disabled:opacity-50"
        onClick={handleAddAvatars}
        disabled={addingAvatars}
      >
        {addingAvatars ? "Adding Avatars..." : "Add Avatars to Users"}
      </button>
      <button
        className="bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700 mt-2 disabled:opacity-50"
        onClick={fixPlaceholderAvatars}
      >
        Fix Placeholder Avatars
      </button>
      {status && <p className="mt-4 text-sm text-gray-700">{status}</p>}
    </div>
  );
};

export default DevAddDocs;
