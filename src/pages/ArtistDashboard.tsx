import { useEffect, useState } from "react";
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
import { useNavigate } from "react-router-dom"; // ✅ At the top of the file
import {
  ref,
  uploadBytes,
  getDownloadURL,
  getBlob,
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

const ArtistDashboard = () => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const navigate = useNavigate();
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const user = auth.currentUser;
    if (!file || !user) return;

    const uid = user.uid;
    const tempRef = ref(storage, `tempAvatars/${uid}/avatar-original.jpg`);

    try {
      // Upload to temporary location only
      await uploadBytes(tempRef, file);

      // Generate preview for UI
      const tempUrl = URL.createObjectURL(file);
      setPreviewUrl(tempUrl);
      setSelectedFile(file); // Store selected file for later use on save
    } catch (error) {
      console.error("Avatar upload failed:", error);
      toast.error("Avatar upload failed");
    }
  };

  const handleSaveAvatar = async () => {
    const user = auth.currentUser;
    if (!user || !selectedFile) {
      toast.error("No avatar selected.");
      return;
    }

    const uid = user.uid;
    setSavingAvatar(true);

    const tempRef = ref(storage, `tempAvatars/${uid}/avatar-original.jpg`);
    const finalRef = ref(storage, `users/${uid}/avatar-original.jpg`);

    try {
      try {
        await deleteObject(finalRef);
      } catch {
        console.log("No previous avatar to delete.");
      }

      const blob = await getBlob(tempRef);
      await uploadBytes(finalRef, blob, {
        contentType: selectedFile.type,
      });

      toast.success("Avatar uploaded. Processing...");

      const processedRef = ref(storage, `users/${uid}/avatar.jpg`);
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
        throw new Error("Processed avatar.jpg not found after waiting.");
      }

      await updateDoc(doc(db, "users", uid), {
        avatarUrl: `${avatarUrl}?t=${Date.now()}`,
      });

      const updatedSnap = await getDoc(doc(db, "users", uid));
      if (updatedSnap.exists()) {
        const updatedArtist = updatedSnap.data() as Artist;
        const timestampedUrl = `${updatedArtist.avatarUrl}?t=${Date.now()}`;
        setArtist({ ...updatedArtist, avatarUrl: timestampedUrl });
      }

      setPreviewUrl(null);
      setSelectedFile(null);
    } catch (error) {
      console.error("Saving avatar failed:", error);
      toast.error("Failed to save avatar.");
    } finally {
      setSavingAvatar(false);
      setLoading(false);

      // 🔥 FORCEFUL FULL PAGE RELOAD
      console.log("✅ Forcing hard reload...");
      setTimeout(() => {
        // Try the cleanest reload
        window.location.reload();

        // Fallback if that fails
        window.location.href = "/";
      }, 1000);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setArtist(null); // clear the artist
        setRequests([]); // clear requests
        setLoading(false); // stop spinner
        navigate("/"); // ✅ Redirect to homepage on sign out
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
          setArtist(null); // handle missing artist
          setRequests([]);
        }
      } catch (error) {
        console.error("Error loading artist dashboard:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe(); // cleanup
  }, []);

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
      <div className="relative bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#1a1a1a] rounded-xl p-6 shadow-lg max-w-6xl mx-auto mb-10">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          {/* Avatar */}
          <div className="relative group w-fit mx-auto md:mx-0">
            <label className="relative group cursor-pointer block">
              <div className="relative w-32 h-32 md:w-40 md:h-40">
                <img
                  src={previewUrl || artist.avatarUrl}
                  alt={artist.displayName}
                  className="w-full h-full object-cover rounded-full border-4 border-neutral-800 group-hover:scale-105 transition-transform"
                />
                {savingAvatar && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
                    <Spinner className="w-6 h-6 text-white" />
                  </div>
                )}
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

            {/* Show only when preview is active */}
            {previewUrl && (
              <div className="mt-2 text-center">
                <button
                  onClick={handleSaveAvatar}
                  disabled={savingAvatar}
                  className={`border-2 border-neutral-500 text-white text-xs px-4 py-1 rounded shadow transition flex items-center justify-center gap-2 ${
                    savingAvatar ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                >
                  Save Avatar
                </button>
              </div>
            )}

            {!previewUrl && (
              <div className="mt-2 text-center">
                <p className="text-sm text-gray-400">Click to change avatar</p>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="text-center md:text-left flex-1">
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              Welcome, {artist.displayName}
            </h1>
            <p className="text-gray-400 mt-2 italic">{artist.bio}</p>

            {/* Socials */}
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

            {/* Styles */}
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
          <div
            data-aos="fade-up"
            className="space-y-4 flex flex-wrap gap-4 justify-center md:justify-start"
          >
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
