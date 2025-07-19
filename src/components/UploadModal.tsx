import { useState } from "react";
import { storage } from "../firebase/firebaseConfig";
import { ref, uploadBytes } from "firebase/storage";
import ImageCropperModal from "./ImageCropperModal";

type Props = {
  uid: string;
  isOpen: boolean;
  onClose: () => void;
  collectionType: "flashes" | "gallery";
  onUploadComplete: () => void; // Callback to refresh items
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
  const [captionOrTitle, setCaptionOrTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);

    const reader = new FileReader();
    reader.onloadend = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const handleFinalUpload = async (croppedFile?: File) => {
    if (!croppedFile && !file) return;
    const uploadFile = croppedFile || file!;
    setIsUploading(true);

    try {
      // Upload to proper folder so Cloud Function handles resizing
      const storageRef = ref(
        storage,
        `${uid}/${collectionType}/${uploadFile.name}`
      );
      await uploadBytes(storageRef, uploadFile);

      // Optional: we could store `captionOrTitle` and `tags` in a separate doc here
      // For now, Cloud Function will create the base doc (image URLs & paths)
      // You can extend Firestore to merge these fields later if needed

      setIsUploading(false);
      onUploadComplete();
      onClose();
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
            className="mb-4"
          />
        )}

        {file && !cropSrc && (
          <div className="mb-4 text-sm text-gray-400">
            Preview and crop will show once the image is loaded...
          </div>
        )}

        {cropSrc && (
          <ImageCropperModal
            imageSrc={cropSrc}
            aspect={collectionType === "flashes" ? 1 : 4 / 5}
            onCancel={() => setCropSrc(null)}
            onSave={(cropped) => handleFinalUpload(cropped)}
          />
        )}

        {!cropSrc && file && (
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
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleFinalUpload()}
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
