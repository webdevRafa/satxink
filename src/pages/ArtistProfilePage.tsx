import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { FaFacebook } from "react-icons/fa";
import { RiInstagramFill } from "react-icons/ri";
import { SiWebmoney } from "react-icons/si";

interface Artist {
  id: string;
  name: string;
  email: string;
  bio: string;
  avatarUrl: string;
  location: string;
  specialties: string[];
  portfolioUrls: string[];
  studioName: string;
  likedBy: string[];
  isAvailable: boolean;
  socialLinks?: SocialLinks;
}
interface SocialLinks {
  facebook?: string;
  instagram?: string;
  website?: string;
}

export const ArtistProfilePage = () => {
  const { id } = useParams();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArtist = async () => {
      try {
        const ref = doc(db, "users", id as string);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setArtist({ id: snap.id, ...(snap.data() as Omit<Artist, "id">) });
        }
      } catch (err) {
        console.error("Failed to fetch artist:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchArtist();
  }, [id]);

  if (loading)
    return (
      <p className="text-center text-gray-400 mt-10">Loading profile...</p>
    );
  if (!artist)
    return <p className="text-center text-gray-400 mt-10">Artist not found.</p>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div
        data-aos="fade-up"
        className="flex flex-col md:flex-row gap-6 items-start"
      >
        <img
          src={artist.avatarUrl}
          alt={artist.name}
          className="w-40 h-40 object-cover rounded-full "
        />
        <div className="flex-1">
          <h1 className="text-3xl! font-bold text-white">{artist.name}</h1>
          <p className="text-gray-400 mb-2">{artist.location}</p>
          <p className="text-sm! text-gray-300 mb-4">{artist.bio}</p>

          <div className="flex flex-wrap gap-2 mb-4">
            {artist.specialties.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-white text-black text-xs! rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>

          <p className="text-sm! text-gray-400 mb-1">
            <span className="font-medium! text-white">Studio:</span>{" "}
            {artist.studioName}
          </p>

          <p className="text-sm! text-gray-400 mb-1">
            <span className="font-medium text-white">Likes:</span>{" "}
            {artist.likedBy?.length || 0}
          </p>
          <p className="text-sm! text-gray-400 mb-1">
            <span className="font-medium text-white">Availability:</span>{" "}
            <span
              className={artist.isAvailable ? "text-green-400" : "text-red-400"}
            >
              {artist.isAvailable ? "Available" : "Unavailable"}
            </span>
          </p>
          {artist.socialLinks && (
            <div className="flex items-center gap-4 mt-4">
              {artist.socialLinks.facebook && (
                <a
                  href={artist.socialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FaFacebook className="text-xl hover:text-blue-500 transition" />
                </a>
              )}
              {artist.socialLinks.instagram && (
                <a
                  href={artist.socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <RiInstagramFill className="text-xl hover:text-pink-500 transition" />
                </a>
              )}
              {artist.socialLinks.website && (
                <a
                  href={artist.socialLinks.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <SiWebmoney className="text-xl hover:text-green-400 transition" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-10">
        <h2
          data-aos="fade-up"
          className="text-xl! font-semibold! text-white mb-4"
        >
          Portfolio
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {artist.portfolioUrls.map((url, i) => (
            <img
              data-aos="fade-up"
              key={i}
              src={url}
              alt={`Portfolio ${i + 1}`}
              className="w-full object-cover rounded-lg border border-gray-700"
            />
          ))}
        </div>
      </div>
    </div>
  );
};
