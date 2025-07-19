import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { FaFacebook } from "react-icons/fa";
import { RiInstagramFill } from "react-icons/ri";

interface Artist {
  id: string;
  name: string;
  email: string;
  bio: string;
  avatarUrl: string;
  location?: string;
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
    <div className="max-w-5xl mx-auto px-4 py-10 mt-20 min-h-[80vh]">
      <div className="relative bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#1a1a1a] rounded-xl p-6 shadow-lg max-w-6xl mx-auto mb-10">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          {/* Avatar */}
          <div className="relative group">
            <img
              src={artist.avatarUrl}
              alt={artist.name}
              className="w-32 h-32 md:w-40 md:h-40 object-cover rounded-full border-4 border-neutral-800 group-hover:scale-105 transition-transform"
            />
            <span className="font-bold absolute bottom-1 right-1 bg-black text-white text-[10px] px-2 py-0.5 rounded-full opacity-70">
              Artist
            </span>
          </div>

          {/* Info */}
          <div className="text-center md:text-left flex-1">
            <h1 className="text-3xl! font-bold text-white">{artist.name}</h1>
            <p className="text-white text-md!">{artist.studioName}</p>
            <p className="text-gray-300 mt-2 italic text-sm">{artist.bio}</p>

            {/* Socials */}
            <div className="flex justify-center md:justify-start gap-4 mt-4 mb-0!">
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
            </div>

            {/* Styles */}
            <div className="mt-6">
              <ul className="flex flex-wrap gap-2 justify-center md:justify-start">
                {artist.specialties.map((style) => (
                  <li
                    key={style}
                    className="px-4 py-1 text-sm rounded-full border border-white/10 bg-[var(--color-bg-footer)] text-white backdrop-blur-sm hover:bg-white/10 transition"
                  >
                    {style}
                  </li>
                ))}
              </ul>
            </div>
          </div>
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
