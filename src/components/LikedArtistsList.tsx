interface Artist {
  id: string;
  name: string;
  avatarUrl: string;
  studioName: string;
}

interface Props {
  client: {
    likedArtists: string[];
  };
  onRequest: (artist: Artist) => void;
}

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

const LikedArtistsList: React.FC<Props> = ({ client, onRequest }) => {
  const [likedArtists, setLikedArtists] = useState<Artist[]>([]);

  useEffect(() => {
    const fetchLiked = async () => {
      const results = await Promise.all(
        client.likedArtists.map(async (id) => {
          const snap = await getDoc(doc(db, "users", id));
          if (snap.exists()) {
            const data = snap.data();
            return {
              id,
              name: data.name,
              avatarUrl: data.avatarUrl,
              studioName: data.studioName,
            };
          }
          return null;
        })
      );
      setLikedArtists(results.filter((a): a is Artist => a !== null));
    };

    fetchLiked();
  }, [client.likedArtists]);

  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold mb-4">Liked Artists</h2>
      {likedArtists.length === 0 ? (
        <p className="text-sm text-gray-400">
          You haven’t liked any artists yet.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {likedArtists.map((artist) => (
            <div
              key={artist.id}
              className="bg-[var(--color-bg-card)] border border-neutral-700 rounded-lg p-4"
            >
              <img
                src={artist.avatarUrl || "/fallback-avatar.jpg"}
                alt={artist.name}
                className="w-16 h-16 rounded-full object-cover mb-3"
              />
              <p className="font-semibold text-sm">{artist.name}</p>
              <p className="text-xs text-gray-400">{artist.studioName}</p>
              {/* Add more buttons if needed */}
              <button
                onClick={() => onRequest(artist)}
                className="mt-4 text-sm text-white! hover:text-[#121212]! bg-neutral-700 hover:bg-neutral-300 px-4 py-2 rounded"
              >
                Request a tattoo
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default LikedArtistsList;
