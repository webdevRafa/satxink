// src/pages/ArtistDashboard.tsx
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig"; // adjust path as needed
import Spinner from "../components/ui/Spinner"; // optional loading spinner
import { FaFacebook } from "react-icons/fa";
import { RiInstagramFill } from "react-icons/ri";
import { SiWebmoney } from "react-icons/si";

type Artist = {
  name: string;
  email: string;
  bio: string;
  avatarUrl: string;
  specialties: string[];
  studioName: string;
  location: string;
  socialLinks?: {
    instagram?: string;
    website?: string;
    facebook?: string;
  };
};

const ArtistDashboard = () => {
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArtist = async () => {
      try {
        const artistRef = doc(db, "users", "c2wHd6HlCIulOTjycyxl");
        const artistSnap = await getDoc(artistRef);

        if (artistSnap.exists()) {
          setArtist(artistSnap.data() as Artist);
        } else {
          console.error("Artist not found.");
        }
      } catch (error) {
        console.error("Error fetching artist:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchArtist();
  }, []);

  if (loading)
    return (
      <div className="flex justify-center mt-10">
        <Spinner />
      </div>
    );

  if (!artist)
    return (
      <div className="text-center mt-10 text-red-500">Artist not found.</div>
    );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Welcome, {artist.name}</h1>

      <div className="flex items-start gap-6">
        <img
          src={artist.avatarUrl}
          alt={artist.name}
          className="w-32 h-32 object-cover rounded-full"
        />
        <div>
          <p className="font-semibold text-lg">{artist.studioName}</p>
          <p>{artist.bio}</p>
          <p className="text-sm text-gray-500 mt-2">{artist.location}</p>
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
                <RiInstagramFill className="text-xl hover:text-blue-500 transition" />
              </a>
            )}
            {artist.socialLinks?.website && (
              <a
                href={artist.socialLinks.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                <SiWebmoney className="text-xl hover:text-blue-500 transition" />
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
  );
};

export default ArtistDashboard;
