import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db, auth } from "../firebase/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import Spinner from "../components/ui/Spinner";
import { FaFacebook } from "react-icons/fa";
import { RiInstagramFill } from "react-icons/ri";
import { SiWebmoney } from "react-icons/si";
import { useNavigate } from "react-router-dom"; // ✅ At the top of the file

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
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const navigate = useNavigate();

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
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">
          Welcome, {artist.displayName}
        </h1>

        <div className="flex items-start gap-6">
          <img
            src={artist.avatarUrl}
            alt={artist.displayName}
            className="w-32 h-32 object-cover rounded-full"
          />
          <div>
            <p className="font-semibold text-lg">{artist.bio}</p>
            <div className="mt-2 space-x-3 flex">
              {artist.socialLinks?.facebook && (
                <a
                  href={artist.socialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FaFacebook className="text-xl hover:text-blue-500 transition" />
                </a>
              )}
              {artist.socialLinks?.instagram && (
                <a
                  href={artist.socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <RiInstagramFill className="text-xl hover:text-pink-500 transition" />
                </a>
              )}
              {artist.socialLinks?.website && (
                <a
                  href={artist.socialLinks.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <SiWebmoney className="text-xl hover:text-green-500 transition" />
                </a>
              )}
            </div>

            <div className="mt-4">
              <h2 className="font-bold">Specialties:</h2>
              <ul className="list-disc list-inside text-sm">
                {artist.specialties.map((style, index) => (
                  <li key={index}>{style}</li>
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
