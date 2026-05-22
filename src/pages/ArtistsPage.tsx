import { useCallback, useEffect, useRef, useState } from "react";

// @ts-ignore
import AOS from "aos";
import "aos/dist/aos.css";

import { collection, getDocs, query, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import ArtistCard from "../components/ArtistCard";
import gun from "../assets/white-gun.svg";
import sa from "../assets/san-antonio.svg";
import { db } from "../firebase/firebaseConfig";
import type { Artist } from "../types/Artist";
import type { GalleryItem } from "../types/GalleryItem";

type ArtistPreview = {
  url: string;
  alt?: string;
};

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

const getArtistDisplayName = (artist: Artist) =>
  artist.displayName || artist.name || artist.email || "Artist";

const isVisibleArtist = (artist: Artist) =>
  artist.role === "artist" &&
  (artist.isVerified === true ||
    artist.isVerified === "true" ||
    typeof artist.isVerified === "undefined");

const getGalleryItemTime = (item: GalleryItem) => {
  const createdAt = item.createdAt as any;
  if (createdAt?.toMillis) return createdAt.toMillis();
  if (createdAt instanceof Date) return createdAt.getTime();
  return 0;
};

const getGalleryPreviewUrl = (item: GalleryItem) =>
  item.thumbUrl || item.webp90Url || item.fullUrl;

const chunkArray = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size)
  );

function useStickyReveal(threshold = 10) {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(window.scrollY);
  const lastDirection = useRef<"up" | "down">("up");

  useEffect(() => {
    const update = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastY.current;
      const goingDown = delta > threshold;
      const goingUp = delta < -threshold;

      if (goingDown && lastDirection.current !== "down") {
        setVisible(false);
        lastDirection.current = "down";
      } else if (goingUp && lastDirection.current !== "up") {
        setVisible(true);
        lastDirection.current = "up";
      }

      lastY.current = currentY;
    };

    const handleScroll = () => requestAnimationFrame(update);

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  return visible;
}

export const ArtistsPage = () => {
  const isStylesVisible = useStickyReveal(5);

  const [artists, setArtists] = useState<Artist[]>([]);
  const [galleryPreviewByArtist, setGalleryPreviewByArtist] = useState<
    Record<string, ArtistPreview | null>
  >({});
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [specialtyFilter, setSpecialtyFilter] = useState("");

  useEffect(() => {
    if (!loading) {
      const timeout = setTimeout(() => AOS.refreshHard(), 50);
      return () => clearTimeout(timeout);
    }
  }, [artists.length, loading, visibleCount]);

  useEffect(() => {
    const initialFetch = async () => {
      setLoading(true);

      try {
        const artistsQuery = query(
          collection(db, "users"),
          where("role", "==", "artist")
        );
        const snapshot = await getDocs(artistsQuery);
        const docs = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<Artist, "id">),
          }))
          .filter(isVisibleArtist)
          .sort((a, b) =>
            getArtistDisplayName(a).localeCompare(getArtistDisplayName(b))
          );

        setArtists(docs);
        setVisibleCount(PAGE_SIZE);
        console.log("Artists fetched:", docs.length, "visible artist docs");
      } catch (err) {
        console.error("Initial fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    initialFetch();
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [specialtyFilter]);

  const filteredArtists = specialtyFilter
    ? artists.filter((artist) =>
        artist.specialties?.some((tag) =>
          tag.toLowerCase().includes(specialtyFilter.toLowerCase())
        )
      )
    : artists;

  const visibleArtists = filteredArtists.slice(0, visibleCount);
  const hasMore = visibleCount < filteredArtists.length;
  const visibleArtistIdKey = visibleArtists.map((artist) => artist.id).join("|");

  useEffect(() => {
    const artistIds = visibleArtistIdKey.split("|").filter(Boolean);
    const missingArtistIds = artistIds.filter(
      (artistId) => !(artistId in galleryPreviewByArtist)
    );

    if (missingArtistIds.length === 0) return;

    let ignore = false;

    const fetchGalleryPreviews = async () => {
      try {
        const previewByArtist: Record<string, ArtistPreview | null> = {};
        missingArtistIds.forEach((artistId) => {
          previewByArtist[artistId] = null;
        });

        const chunks = chunkArray(missingArtistIds, 10);
        const snapshots = await Promise.all(
          chunks.map((artistIdChunk) =>
            getDocs(
              query(
                collection(db, "gallery"),
                where("artistId", "in", artistIdChunk)
              )
            )
          )
        );

        snapshots
          .flatMap((snapshot) =>
            snapshot.docs.map(
              (doc) => ({ id: doc.id, ...doc.data() } as GalleryItem)
            )
          )
          .filter((item) => item.status !== "processing")
          .sort((a, b) => getGalleryItemTime(b) - getGalleryItemTime(a))
          .forEach((item) => {
            const previewUrl = getGalleryPreviewUrl(item);
            if (!previewUrl || previewByArtist[item.artistId]) return;

            previewByArtist[item.artistId] = {
              url: previewUrl,
              alt: item.caption,
            };
          });

        if (!ignore) {
          setGalleryPreviewByArtist((current) => ({
            ...current,
            ...previewByArtist,
          }));
        }
      } catch (err) {
        console.error("Failed to fetch artist gallery previews:", err);
      }
    };

    fetchGalleryPreviews();

    return () => {
      ignore = true;
    };
  }, [galleryPreviewByArtist, visibleArtistIdKey]);

  const fetchMore = useCallback(() => {
    if (loading || !hasMore) return;

    setVisibleCount((count) =>
      Math.min(count + PAGE_SIZE, filteredArtists.length)
    );
  }, [filteredArtists.length, hasMore, loading]);

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

  return (
    <main className="px-4 py-12 max-w-[1300px] mx-auto relative">
      <div data-aos="fade-in">
        <div
          className="flex gap-0 flex-col items-center mt-30
        justify-center"
        >
          <img
            className="relative z-40 w-48 opacity-20 blur-[1px]"
            src={sa}
            alt=""
          />
          <div className="flex gap-0 flex-row">
            <h1 className="text-3xl!  text-neutral-200! translate-y-[-12px] font-bold z-40 mb-0">
              FIND YOUR ARTIST
            </h1>
            <img className="h-8 translate-y-[-14px]" src={gun} alt="" />
          </div>
        </div>
        <p className="text-neutral-500! mb-0 text-center translate-y-[-15px]">
          Discover talented artists from San Antonio, browse by style, and view
          their work.
        </p>
      </div>

      <div
        className={`sticky top-18 z-30 transition-transform duration-300 backdrop-blur bg-[var(--color-bg-base)] border-b border-white/5 ${
          !isStylesVisible ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="flex flex-wrap gap-2 px-4 py-3 max-w-6xl mx-auto">
          {SPECIALTIES.map((tag) => (
            <button
              key={tag}
              className={`px-1! md:px-3! py-1!  md:py-2! rounded-full border text-xs! font-medium hover:scale-110 ease-in-out duration-300 transition-all ${
                specialtyFilter === tag
                  ? "bg-neutral-300 text-black border-white"
                  : "text-white border-gray-500 hover:border-white"
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-5">
        {visibleArtists.map((artist, index) => {
          const isLast = index === visibleArtists.length - 1;
          const galleryPreview = galleryPreviewByArtist[artist.id] || undefined;

          return (
            <div
              data-aos="fade-in"
              key={artist.id}
              ref={isLast ? lastArtistRef : null}
            >
              <Link to={`/artists/${artist.id}`}>
                <ArtistCard
                  name={getArtistDisplayName(artist)}
                  avatarUrl={artist.avatarUrl}
                  specialties={artist.specialties}
                  likedBy={artist.likedBy || []}
                  previewUrl={galleryPreview?.url}
                  previewAlt={galleryPreview?.alt}
                />
              </Link>
            </div>
          );
        })}
      </div>

      {loading && (
        <p className="text-center text-gray-400 mt-6">Loading artists...</p>
      )}
      {!hasMore && !loading && (
        <p className="text-center text-gray-500 mt-6">
          No more artists to show.
        </p>
      )}
    </main>
  );
};
