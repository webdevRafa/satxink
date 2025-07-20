import { useState } from "react";
import { storage, db } from "../firebase/firebaseConfig";
import { ref, uploadBytes } from "firebase/storage";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import ImageCropperModal from "./ImageCropperModal";

type Props = {
  uid: string;
  isOpen: boolean;
  onClose: () => void;
  collectionType: "flashes" | "gallery";
  onUploadComplete: () => void;
};

const UploadModal: React.FC<Props> = ({
  uid,
  isOpen,
  onClose,
  collectionType,
  onUploadComplete,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [captionOrTitle, setCaptionOrTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  if (!isOpen) return null;

  const resetAndClose = () => {
    // Clear all local states so modal is fresh next time
    setFile(null);
    setCropSrc(null);
    setCroppedFile(null);
    setCaptionOrTitle("");
    setTagsInput("");
    setIsUploading(false);
    onClose(); // Close modal in parent (GalleryManager)
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setCroppedFile(null);

    const reader = new FileReader();
    reader.onloadend = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const handleFinalUpload = async () => {
    const uploadFile = croppedFile || file;
    if (!uploadFile) return;
    setIsUploading(true);

    try {
      const timestamp = Date.now();
      const ext = uploadFile.name.split(".").pop() || "jpg";
      const uniqueName = `upload-${timestamp}.${ext}`;
      const storageRef = ref(
        storage,
        `users/${uid}/${collectionType}/${uniqueName}`
      );

      await uploadBytes(storageRef, uploadFile);

      const q = query(
        collection(db, collectionType),
        where("artistId", "==", uid),
        orderBy("timestamp", "desc"), // guaranteed to sort by actual upload time
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        await updateDoc(docRef, {
          caption: captionOrTitle || null,
          tags: tagsInput ? tagsInput.split(",").map((t) => t.trim()) : [],
        });
      }

      setIsUploading(false);
      resetAndClose(); // Close the modal first, so the overlay disappears
      onUploadComplete(); // Then refresh the gallery after closing
    } catch (err) {
      console.error("Upload failed:", err);
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-70 flex justify-center items-center">
      <div className="bg-gray-900 text-white p-6 rounded-lg w-[90%] max-w-lg relative">
        <h2 className="text-xl font-bold mb-4">
          Add to {collectionType === "flashes" ? "Flashes" : "Gallery"}
        </h2>

        {!file && (
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="mb-4 px-4! py-2! bg-[var(--color-bg-card)] rounded-md text-white"
          />
        )}

        {cropSrc && (
          <ImageCropperModal
            imageSrc={cropSrc}
            aspect={collectionType === "flashes" ? 1 : 4 / 5}
            onCancel={() => setCropSrc(null)}
            onSave={(cropped) => {
              setCroppedFile(cropped);
              setCropSrc(null);
            }}
          />
        )}

        {!cropSrc && (croppedFile || file) && (
          <>
            <input
              type="text"
              placeholder={
                collectionType === "flashes"
                  ? "Optional title"
                  : "Optional caption"
              }
              value={captionOrTitle}
              onChange={(e) => setCaptionOrTitle(e.target.value)}
              className="w-full px-3 py-2 rounded bg-gray-800 text-white mb-3"
            />
            <input
              type="text"
              placeholder="Optional tags (comma separated)"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 rounded bg-gray-800 text-white mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={resetAndClose}
                className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalUpload}
                disabled={isUploading}
                className="px-4 py-2 bg-red-600 rounded hover:bg-red-700"
              >
                {isUploading ? "Uploading..." : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UploadModal;
