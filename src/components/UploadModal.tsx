import { useState } from "react";
import { storage, db } from "../firebase/firebaseConfig";
import { ref, uploadBytes } from "firebase/storage";
import { collection, addDoc } from "firebase/firestore";
import ImageCropperModal from "./ImageCropperModal";
import { serverTimestamp } from "firebase/firestore";

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
    setFile(null);
    setCropSrc(null);
    setCroppedFile(null);
    setCaptionOrTitle("");
    setTagsInput("");
    setIsUploading(false);
    onClose();
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
    if (!uploadFile || isUploading) return;

    setIsUploading(true);

    try {
      const timestamp = Date.now();
      const ext = uploadFile.name.split(".").pop() || "jpg";
      const baseName = `upload-${timestamp}`;
      const uniqueName = `${baseName}.${ext}`;

      // Step 1: Create Firestore doc immediately with metadata
      const tags = tagsInput
        ? tagsInput
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      await addDoc(collection(db, collectionType), {
        artistId: uid,
        caption: captionOrTitle || null,
        tags,
        fileName: baseName,
        timestamp,
        status: "processing",
        createdAt: serverTimestamp(),
      });

      // Step 2: Upload file (Cloud Function will handle processing)
      const storageRef = ref(
        storage,
        `users/${uid}/${collectionType}/${uniqueName}`
      );
      await uploadBytes(storageRef, uploadFile);

      // Step 3: Close modal and trigger gallery refresh
      onUploadComplete();
      resetAndClose();
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
                className={`px-4 py-2 rounded ${
                  isUploading ? "bg-gray-500" : "bg-red-600 hover:bg-red-700"
                }`}
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
