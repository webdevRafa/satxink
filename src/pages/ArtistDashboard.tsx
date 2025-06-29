import { useEffect, useState } from "react";
import Cropper from "react-easy-crop";

import {
  doc,
  updateDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db, auth, storage } from "../firebase/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import Spinner from "../components/ui/Spinner";
import { FaFacebook } from "react-icons/fa";
import { RiInstagramFill } from "react-icons/ri";
import { SiWebmoney } from "react-icons/si";
import { useNavigate } from "react-router-dom";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { toast } from "react-hot-toast";

type Artist = {
  displayName: string;
  email: string;
  bio: string;
  avatarUrl: string;
  specialties: string[];
  socialLinks?: {
    instagram?: string;
    website?: string;
    facebook?: string;
  };
};

type BookingRequest = {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatar: string;
  description: string;
  preferredDateRange?: string[];
  bodyPlacement: string;
  size: "small" | "medium" | "large" | "Small" | "Medium" | "Large";
  fullUrl: string;
  thumbUrl: string;
};
const getCroppedImg = async (
  imageSrc: string,
  crop: { x: number; y: number },
  zoom: number,
  aspect: number,
  cropAreaPixels: any
): Promise<Blob> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas context not available");
  console.log(crop, zoom, aspect); // force TS to see them as used

  // Scale the image based on zoom
  const scale = image.naturalWidth / image.width;

  // Set canvas to desired cropped size
  canvas.width = cropAreaPixels.width;
  canvas.height = cropAreaPixels.height;

  // Draw the cropped image onto the canvas
  ctx.drawImage(
    image,
    cropAreaPixels.x * scale,
    cropAreaPixels.y * scale,
    cropAreaPixels.width * scale,
    cropAreaPixels.height * scale,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Canvas is empty"));
      resolve(blob);
    }, "image/jpeg");
  });
};

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

const ArtistDashboard = () => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [overrideAvatarUrl, setOverrideAvatarUrl] = useState<string | null>(
    null
  );
  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setArtist(null);
        setRequests([]);
        setLoading(false);
        navigate("/");
        return;
      }

      try {
        const artistRef = doc(db, "users", user.uid);
        const artistSnap = await getDoc(artistRef);

        if (artistSnap.exists()) {
          setArtist(artistSnap.data() as Artist);

          const q = query(
            collection(db, "bookingRequests"),
            where("artistId", "==", user.uid)
          );
          const querySnapshot = await getDocs(q);
          const result: BookingRequest[] = [];
          querySnapshot.forEach((doc) => {
            result.push({ id: doc.id, ...doc.data() } as BookingRequest);
          });
          setRequests(result);
        } else {
          setArtist(null);
          setRequests([]);
        }
      } catch (error) {
        console.error("Error loading artist dashboard:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setCropImageSrc(reader.result as string);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAvatar = async () => {
    const user = auth.currentUser;
    if (!user || !selectedFile) {
      toast.error("No avatar selected.");
      return;
    }

    const uid = user.uid;
    setSavingAvatar(true);

    const tempUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(tempUrl);

    const finalRef = ref(storage, `users/${uid}/avatar-original.jpg`);
    const processedRef = ref(storage, `users/${uid}/avatar.jpg`);

    try {
      // Delete previous avatar
      try {
        await deleteObject(finalRef);
      } catch {
        console.log("No previous avatar to delete.");
      }

      // Upload the selected file
      await uploadBytes(finalRef, selectedFile, {
        contentType: selectedFile.type,
      });

      // Wait for the processed avatar.jpg (via Cloud Function)
      let avatarUrl = "";
      let attempts = 0;
      while (attempts < 10) {
        try {
          avatarUrl = await getDownloadURL(processedRef);
          break;
        } catch {
          await new Promise((res) => setTimeout(res, 1000));
          attempts++;
        }
      }

      if (!avatarUrl) {
        throw new Error("Processed avatar not ready after waiting.");
      }

      // Update Firestore
      await updateDoc(doc(db, "users", uid), { avatarUrl });
      setOverrideAvatarUrl(tempUrl); // ← new local override

      setArtist((prev) =>
        prev ? { ...prev, avatarUrl: `${avatarUrl}?t=${Date.now()}` } : prev
      );
      setTimeout(() => {
        setPreviewUrl(null);
      }, 1000); // 1 second is usually enough
      setPreviewUrl(null);
      toast.success("Avatar saved!");
    } catch (error) {
      console.error("Saving avatar failed:", error);
      toast.error("Failed to save avatar.");
    } finally {
      setSavingAvatar(false);
      setSelectedFile(null);
      URL.revokeObjectURL(tempUrl);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center mt-10">
        <Spinner />
      </div>
    );

  if (!artist)
    return (
      <div className="text-center mt-10 text-red-500">
        Artist not found or not signed in.
      </div>
    );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <>
      {showCropper && cropImageSrc && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-80 flex flex-col justify-center items-center">
          <div className="relative w-[90vw] h-[60vh] bg-white rounded">
            <Cropper
              image={cropImageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, croppedPixels) =>
                setCroppedAreaPixels(croppedPixels)
              }
            />
          </div>
          <div className="mt-4 flex gap-4">
            <button
              onClick={async () => {
                if (!cropImageSrc || !croppedAreaPixels) return;
                const blob = await getCroppedImg(
                  cropImageSrc,
                  crop,
                  zoom,
                  1,
                  croppedAreaPixels
                );
                const preview = URL.createObjectURL(blob);
                setPreviewUrl(preview);
                setSelectedFile(
                  new File([blob], "avatar.jpg", { type: "image/jpeg" })
                );
                setOverrideAvatarUrl(preview);
                setShowCropper(false);
              }}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Save Crop
            </button>
            <button
              onClick={() => setShowCropper(false)}
              className="bg-gray-400 text-white px-4 py-2 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="relative bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#1a1a1a] rounded-xl p-6 shadow-lg max-w-6xl mx-auto mb-10">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          <div className="relative group w-fit mx-auto md:mx-0">
            <label className="relative group cursor-pointer block">
              <div className="relative w-32 h-32 md:w-40 md:h-40">
                <img
                  src={previewUrl || overrideAvatarUrl || artist.avatarUrl}
                  alt={artist.displayName}
                  className="w-full h-full object-cover rounded-full border-4 border-neutral-800 group-hover:scale-105 transition-transform"
                />
              </div>

              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleAvatarUpload}
              />
              <span className="absolute bottom-1 right-1 bg-black text-white text-[10px] px-2 py-0.5 rounded-full opacity-70">
                Artist
              </span>
            </label>

            {previewUrl ? (
              <div className="mt-2 text-center">
                {previewUrl && !savingAvatar ? (
                  <div className="mt-2 text-center">
                    <button
                      onClick={handleSaveAvatar}
                      className="transition  border-2 border-neutral-500 text-white text-xs px-4! py-1! rounded shadow  flex items-center justify-center gap-2"
                    >
                      Save Avatar
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 text-center">
                <p className="text-sm text-gray-400">Click to change avatar</p>
              </div>
            )}
          </div>

          <div className="text-center md:text-left flex-1">
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              Welcome, {artist.displayName}
            </h1>
            <p className="text-gray-400 mt-2 italic">{artist.bio}</p>

            <div className="flex justify-center md:justify-start gap-4 mt-4">
              {artist.socialLinks?.facebook && (
                <a
                  href={artist.socialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white hover:text-blue-500 transition transform hover:scale-110"
                >
                  <FaFacebook size={22} />
                </a>
              )}
              {artist.socialLinks?.instagram && (
                <a
                  href={artist.socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white hover:text-pink-500 transition transform hover:scale-110"
                >
                  <RiInstagramFill size={22} />
                </a>
              )}
              {artist.socialLinks?.website && (
                <a
                  href={artist.socialLinks.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white hover:text-green-400 transition transform hover:scale-110"
                >
                  <SiWebmoney size={22} />
                </a>
              )}
            </div>

            <div className="mt-6">
              <ul className="flex flex-wrap gap-2 justify-center md:justify-start">
                {artist.specialties.map((style, index) => (
                  <li
                    key={index}
                    className="px-4 py-1 text-sm rounded-full border border-white/10 bg-white/5 text-white backdrop-blur-sm hover:bg-white/10 transition"
                  >
                    {style}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 w-full mx-auto max-w-[1400px] pb-40">
        <h2 className="text-xl font-bold mb-4 text-center md:text-left">
          Booking Requests
        </h2>

        {requests.length === 0 ? (
          <p className="text-gray-500">No booking requests yet.</p>
        ) : (
          <div className="space-y-4 flex flex-wrap gap-4 justify-center md:justify-start">
            {requests.map((req) => (
              <div
                key={req.id}
                className="bg-[var(--color-bg-card)] rounded-md p-4 shadow-sm max-w-[400px]"
              >
                <p>
                  <strong>Description:</strong>{" "}
                  <span className="text-gray-400">{req.description}</span>
                </p>
                <p>
                  <strong>Placement:</strong>{" "}
                  <span className="text-gray-400">{req.bodyPlacement}</span>
                </p>
                <p>
                  <strong>Size:</strong>{" "}
                  <span className="text-gray-400">{req.size}</span>
                </p>
                {Array.isArray(req.preferredDateRange) &&
                  req.preferredDateRange.length > 0 && (
                    <p>
                      <strong>Preferred Dates:</strong>{" "}
                      <span className="text-gray-400">
                        {req.preferredDateRange.length === 2
                          ? `${formatDate(
                              req.preferredDateRange[0]
                            )} – ${formatDate(req.preferredDateRange[1])}`
                          : req.preferredDateRange.map(formatDate).join(", ")}
                      </span>
                    </p>
                  )}

                {req.thumbUrl && (
                  <div className="mt-2">
                    <strong>Reference:</strong>
                    <img
                      src={req.thumbUrl}
                      alt="reference"
                      className="w-full h-[200px] object-cover rounded mt-1"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default ArtistDashboard;
