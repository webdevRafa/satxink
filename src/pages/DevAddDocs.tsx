// src/pages/DevAddDocs.tsx
import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { serverTimestamp } from "firebase/firestore";

const DevAddDocs = () => {
  const { user } = useAuth();
  const [jsonData, setJsonData] = useState<any[]>([]);
  const [collectionName, setCollectionName] = useState("users");
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");

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

      {status && <p className="mt-4 text-sm text-gray-700">{status}</p>}
    </div>
  );
};

export default DevAddDocs;
