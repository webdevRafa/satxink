import { useState, useEffect } from "react";
import { storage, db } from "../firebase/firebaseConfig";
import { ref, uploadBytes } from "firebase/storage";
import { collection, addDoc } from "firebase/firestore";
import ImageCropperModal from "./ImageCropperModal";
import { serverTimestamp } from "firebase/firestore";
import { X, Upload } from "lucide-react";

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captionOrTitle, setCaptionOrTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Create and clean up preview URL for cropped file
  useEffect(() => {
    if (!croppedFile) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(croppedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl); // cleanup when file changes or modal closes
    };
  }, [croppedFile]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setFile(null);
    setCropSrc(null);
    setCroppedFile(null);
    setPreviewUrl(null);
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
    setPreviewUrl(null);

    const reader = new FileReader();
    reader.onloadend = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const handleFinalUpload = async () => {
    // Only allow cropped files
    if (!croppedFile || isUploading) return;

    setIsUploading(true);

    try {
      const timestamp = Date.now();
      const ext = croppedFile.name.split(".").pop() || "jpg";
      const baseName = `upload-${timestamp}`;
      const uniqueName = `${baseName}.${ext}`;

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

      const storageRef = ref(
        storage,
        `users/${uid}/${collectionType}/${uniqueName}`
      );
      await uploadBytes(storageRef, croppedFile);

      onUploadComplete();
      resetAndClose();
    } catch (err) {
      console.error("Upload failed:", err);
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex justify-center items-center">
      <div className="bg-[var(--color-bg-footer)] text-white p-6 rounded-lg w-[90%] max-w-lg relative">
        {/* Close Button */}
        <button
          onClick={resetAndClose}
          className="absolute top-3 right-3 text-white hover:text-gray-300 transition"
        >
          <X size={24} />
        </button>

        <h2 className="text-lg! font-bold mb-4">
          Add to {collectionType === "flashes" ? "Flashes" : "Gallery"}
        </h2>

        {/* Upload Button (if no file yet) */}
        {!file && !cropSrc && (
          <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-500 rounded-lg cursor-pointer hover:border-gray-300 transition">
            <Upload size={36} className="mb-2 text-gray-300" />
            <span className="text-gray-400 text-sm">
              Click to upload an image
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        )}

        {/* Cropping UI */}
        {cropSrc && (
          <ImageCropperModal
            imageSrc={cropSrc}
            aspect={collectionType === "flashes" ? 1 : 4 / 5}
            onCancel={() => {
              setCropSrc(null);
              setFile(null); // force re-select to avoid uncropped uploads
            }}
            onSave={(cropped) => {
              setCroppedFile(cropped);
              setCropSrc(null);
            }}
          />
        )}

        {/* Only show preview & inputs if croppedFile exists */}
        {!cropSrc && croppedFile && (
          <>
            {previewUrl && (
              <div className="mb-4">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="rounded-lg max-h-64 w-auto mx-auto object-cover shadow-md"
                />
              </div>
            )}

            <input
              type="text"
              placeholder={
                collectionType === "flashes"
                  ? "Optional title"
                  : "Optional caption"
              }
              value={captionOrTitle}
              onChange={(e) => setCaptionOrTitle(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--color-bg-card)] text-white mb-3"
            />

            <input
              type="text"
              placeholder="Optional tags (comma separated)"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--color-bg-card)] text-white mb-4"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={resetAndClose}
                className="px-4! py-1! bg-[var(--color-bg-button)] rounded hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalUpload}
                disabled={isUploading}
                className={`px-4 py-1! rounded text-black ${
                  isUploading ? "bg-gray-500" : "bg-emerald-400"
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
