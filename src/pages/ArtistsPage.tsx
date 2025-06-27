import { useEffect, useState, useRef, useCallback } from "react";

// @ts-ignore
import AOS from "aos";
import "aos/dist/aos.css";

import {
  collection,
  query,
  where,
  getDocs,
  startAfter,
  limit,
  orderBy,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import type { DocumentData } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import ArtistCard from "../components/ArtistCard";
import { Link } from "react-router-dom";

interface Artist {
  id: string;
  name: string;
  avatarUrl: string;
  specialties: string[];
  likedBy: [];
  socialLinks?: SocialLinks;
}
interface SocialLinks {
  facebook?: string;
  instagram?: string;
  website?: string;
}

const PAGE_SIZE = 6;
const SPECIALTIES = [
  "Blackwork",
  "Linework",
  "Dotwork",
  "Color",
  "Realism",
  "Neo-Traditional",
  "Micro",
  "Geometric",
  "Anime",
  "Traditional",
  "Japanese",
  "Ornamental",
  "Fine Line",
  "Color Realism",
];

export const ArtistsPage = () => {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [lastDoc, setLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  // ⬇️ add this right under the existing hooks in ArtistsPage.tsx
  useEffect(() => {
    if (!loading) {
      // give React time to paint the newly-fetched cards
      const t = setTimeout(() => AOS.refreshHard(), 50);
      return () => clearTimeout(t);
    }
  }, [artists.length, loading]);
  // ✅ Fetch first page (only once)
  useEffect(() => {
    const initialFetch = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "users"),
          where("role", "==", "artist"),
          orderBy("name"),
          limit(PAGE_SIZE)
        );
        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Artist, "id">),
        }));
        setArtists(docs);
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.docs.length === PAGE_SIZE);
        console.log("🔰 Initial fetch:", docs.length, "docs");
      } catch (err) {
        console.error("Initial fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    initialFetch();
  }, []);

  // ✅ Fetch more when scrolling
  const fetchMore = useCallback(async () => {
    if (loading || !hasMore || !lastDoc) return;

    setLoading(true);
    try {
      const q = query(
        collection(db, "users"),
        where("role", "==", "artist"),
        orderBy("name"),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );
      const snapshot = await getDocs(q);
      const newDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Artist, "id">),
      }));
      setArtists((prev) => [...prev, ...newDocs]);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
      console.log("📦 Fetched more:", newDocs.length, "docs");
    } catch (err) {
      console.error("Fetch more error:", err);
    } finally {
      setLoading(false);
    }
  }, [lastDoc, loading, hasMore]);

  // ✅ Infinite scroll observer
  const observer = useRef<IntersectionObserver | null>(null);
  const lastArtistRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          fetchMore();
        }
      });
      if (node) observer.current.observe(node);
    },
    [fetchMore, loading]
  );

  const filteredArtists = specialtyFilter
    ? artists.filter((a) =>
        a.specialties?.some((tag) =>
          tag.toLowerCase().includes(specialtyFilter.toLowerCase())
        )
      )
    : artists;

  return (
    <main className="px-4 py-12 max-w-6xl mx-auto relative">
      <div className="relative bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#1a1a1a] rounded-xl px-4 py-6 md:p-6 shadow-lg max-w-6xl mx-auto mb-8">
        <div className="text-center md:text-left">
          <h1 className="text-2xl md:text-4xl font-bold text-white">
            Find Your Artist
          </h1>
          <p className="text-sm md:text-base text-gray-400 mt-1 md:mt-2 italic max-w-xl mx-auto md:mx-0">
            Discover talented artists from San Antonio. Filter by style and
            explore their portfolios.
          </p>

          <div className="mt-4 md:mt-6 flex flex-wrap gap-2 justify-center md:justify-start">
            {SPECIALTIES.map((tag) => (
              <button
                key={tag}
                className={`px-3 py-1 text-sm rounded-full border border-white/10 bg-white/5 text-white backdrop-blur-sm hover:bg-white/10 transition ${
                  specialtyFilter === tag
                    ? "bg-white text-black font-semibold"
                    : ""
                }`}
                onClick={() =>
                  setSpecialtyFilter(specialtyFilter === tag ? "" : tag)
                }
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {filteredArtists.map((artist, index) => {
          const isLast = index === filteredArtists.length - 1;
          return (
            <div
              data-aos="fade-in"
              key={artist.id}
              ref={isLast ? lastArtistRef : null}
            >
              <Link to={`/artists/${artist.id}`}>
                <ArtistCard
                  name={artist.name}
                  avatarUrl={artist.avatarUrl}
                  specialties={artist.specialties}
                  likedBy={artist.likedBy || []}
                />
              </Link>
            </div>
          );
        })}
      </div>

      {loading && (
        <p className="text-center text-gray-400 mt-6">
          Loading more artists...
        </p>
      )}
      {!hasMore && !loading && (
        <p className="text-center text-gray-500 mt-6">
          No more artists to show.
        </p>
      )}
    </main>
  );
};
