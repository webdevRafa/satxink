import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { FaFacebook } from "react-icons/fa";
import { RiInstagramFill } from "react-icons/ri";
import { Camera, Expand, ImageOff, Layers, X } from "lucide-react";
import type { GalleryItem } from "../types/GalleryItem";
import type { FlashSheet } from "../types/FlashSheet";

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
  const [activeTab, setActiveTab] = useState<"portfolio" | "flashSheets">(
    "portfolio"
  );
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [flashSheets, setFlashSheets] = useState<FlashSheet[]>([]);
  const [flashSheetsLoading, setFlashSheetsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<FlashSheet | null>(null);
  const [modalLoading, setModalLoading] = useState(true);
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

  useEffect(() => {
    const fetchGallery = async () => {
      if (!id) return;

      setGalleryLoading(true);
      try {
        const galleryQuery = query(
          collection(db, "gallery"),
          where("artistId", "==", id)
        );
        const snapshot = await getDocs(galleryQuery);
        const items = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as GalleryItem))
          .filter((item) => item.status !== "processing")
          .sort((a, b) => getItemTime(b) - getItemTime(a));

        setGalleryItems(items);
      } catch (err) {
        console.error("Failed to fetch artist gallery:", err);
      } finally {
        setGalleryLoading(false);
      }
    };

    fetchGallery();
  }, [id]);

  useEffect(() => {
    const fetchFlashSheets = async () => {
      if (!id) return;

      setFlashSheetsLoading(true);
      try {
        const sheetsQuery = query(
          collection(db, "flashSheets"),
          where("artistId", "==", id)
        );
        const snapshot = await getDocs(sheetsQuery);
        const sheets = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as FlashSheet))
          .sort((a, b) => getItemTime(b) - getItemTime(a));

        setFlashSheets(sheets);
      } catch (err) {
        console.error("Failed to fetch artist flash sheets:", err);
      } finally {
        setFlashSheetsLoading(false);
      }
    };

    fetchFlashSheets();
  }, [id]);

  useEffect(() => {
    if (!selectedItem && !selectedSheet) return;

    setModalLoading(true);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedItem(null);
        setSelectedSheet(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedItem, selectedSheet]);

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
        <div
          data-aos="fade-up"
          className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/40 mb-2">
              Recent work
            </p>
            <div
              className="flex flex-wrap items-center gap-3"
              role="tablist"
              aria-label="Artist work"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "portfolio"}
                onClick={() => setActiveTab("portfolio")}
                className={`px-0! py-0! text-2xl! font-semibold! transition ${
                  activeTab === "portfolio"
                    ? "text-white"
                    : "text-white/40 hover:text-white/75"
                }`}
              >
                Portfolio
              </button>
              <span className="h-6 w-px bg-white/15" />
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "flashSheets"}
                onClick={() => setActiveTab("flashSheets")}
                className={`px-0! py-0! text-2xl! font-semibold! transition ${
                  activeTab === "flashSheets"
                    ? "text-white"
                    : "text-white/40 hover:text-white/75"
                }`}
              >
                Flash Sheets
              </button>
            </div>
          </div>
          {activeTab === "portfolio" && !galleryLoading && galleryItems.length > 0 && (
            <span className="inline-flex items-center gap-2 self-start sm:self-auto rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-sm text-white/70">
              <Camera size={15} />
              {galleryItems.length} piece{galleryItems.length === 1 ? "" : "s"}
            </span>
          )}
          {activeTab === "flashSheets" &&
            !flashSheetsLoading &&
            flashSheets.length > 0 && (
              <span className="inline-flex items-center gap-2 self-start sm:self-auto rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-sm text-white/70">
                <Layers size={15} />
                {flashSheets.length} sheet
                {flashSheets.length === 1 ? "" : "s"}
              </span>
            )}
        </div>

        {activeTab === "portfolio" ? (
          <PortfolioPanel
            galleryItems={galleryItems}
            galleryLoading={galleryLoading}
            onOpenItem={setSelectedItem}
          />
        ) : (
          <FlashSheetsPanel
            flashSheets={flashSheets}
            flashSheetsLoading={flashSheetsLoading}
            onOpenSheet={setSelectedSheet}
          />
        )}
      </div>

      {selectedItem && (
        <PortfolioLightbox
          item={selectedItem}
          artist={artist}
          modalLoading={modalLoading}
          onImageLoad={() => setModalLoading(false)}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {selectedSheet && (
        <FlashSheetLightbox
          sheet={selectedSheet}
          artist={artist}
          modalLoading={modalLoading}
          onImageLoad={() => setModalLoading(false)}
          onClose={() => setSelectedSheet(null)}
        />
      )}
    </div>
  );
};

const getItemTime = (item: GalleryItem | FlashSheet) => {
  const createdAt = item.createdAt as any;
  if (createdAt?.toMillis) return createdAt.toMillis();
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "number") return createdAt;

  const timestamp = (item as any).timestamp;
  return typeof timestamp === "number" ? timestamp : 0;
};

const getPreviewUrl = (item: GalleryItem) => item.webp90Url || item.thumbUrl || item.fullUrl;

const getSheetPreviewUrl = (sheet: FlashSheet) => sheet.thumbUrl || sheet.imageUrl;

const PortfolioPanel = ({
  galleryItems,
  galleryLoading,
  onOpenItem,
}: {
  galleryItems: GalleryItem[];
  galleryLoading: boolean;
  onOpenItem: (item: GalleryItem) => void;
}) => {
  if (galleryLoading) return <PortfolioSkeleton />;

  if (galleryItems.length === 0) {
    return (
      <EmptyWorkState
        title="No portfolio pieces yet"
        message="This artist has not published gallery work to their public portfolio."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {galleryItems.map((item, index) => (
        <PortfolioCard
          key={item.id}
          item={item}
          priority={index === 0}
          onOpen={() => onOpenItem(item)}
        />
      ))}
    </div>
  );
};

const FlashSheetsPanel = ({
  flashSheets,
  flashSheetsLoading,
  onOpenSheet,
}: {
  flashSheets: FlashSheet[];
  flashSheetsLoading: boolean;
  onOpenSheet: (sheet: FlashSheet) => void;
}) => {
  if (flashSheetsLoading) return <PortfolioSkeleton />;

  if (flashSheets.length === 0) {
    return (
      <EmptyWorkState
        title="No flash sheets yet"
        message="This artist has not published any flash sheets for browsing."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {flashSheets.map((sheet, index) => (
        <FlashSheetCard
          key={sheet.id}
          sheet={sheet}
          priority={index === 0}
          onOpen={() => onOpenSheet(sheet)}
        />
      ))}
    </div>
  );
};

const EmptyWorkState = ({
  title,
  message,
}: {
  title: string;
  message: string;
}) => (
  <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-6 text-center">
    <ImageOff className="mb-4 text-white/35" size={34} />
    <h3 className="text-lg! font-semibold! text-white my-0!">{title}</h3>
    <p className="mt-2 max-w-md text-sm text-white/50">{message}</p>
  </div>
);

const PortfolioSkeleton = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: 6 }).map((_, index) => (
      <div
        key={index}
        className="h-[320px] animate-pulse rounded-xl border border-white/10 bg-white/[0.04]"
      />
    ))}
  </div>
);

const PortfolioCard = ({
  item,
  priority,
  onOpen,
}: {
  item: GalleryItem;
  priority: boolean;
  onOpen: () => void;
}) => (
  <button
    type="button"
    data-aos="fade-up"
    onClick={onOpen}
    className={`group relative overflow-hidden rounded-xl border border-white/10 bg-[#111] p-0! text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition duration-300 hover:border-white/25 hover:shadow-[0_22px_70px_rgba(0,0,0,0.45)] ${
      priority ? "sm:col-span-2 lg:col-span-1" : ""
    }`}
  >
    <div className="relative aspect-[4/5] overflow-hidden bg-black">
      <img
        src={getPreviewUrl(item)}
        alt={item.caption || "Tattoo portfolio piece"}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        loading={priority ? "eager" : "lazy"}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-90" />
      <div className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white opacity-0 backdrop-blur-md transition group-hover:opacity-100">
        <Expand size={17} />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="line-clamp-2 text-base! font-semibold! leading-snug text-white my-0!">
          {item.caption || "Untitled piece"}
        </h3>
        {Array.isArray(item.tags) && item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-white/75 backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  </button>
);

const FlashSheetCard = ({
  sheet,
  priority,
  onOpen,
}: {
  sheet: FlashSheet;
  priority: boolean;
  onOpen: () => void;
}) => (
  <button
    type="button"
    data-aos="fade-up"
    onClick={onOpen}
    className={`group relative overflow-hidden rounded-xl border border-white/10 bg-[#111] p-0! text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition duration-300 hover:border-white/25 hover:shadow-[0_22px_70px_rgba(0,0,0,0.45)] ${
      priority ? "sm:col-span-2 lg:col-span-1" : ""
    }`}
  >
    <div className="relative aspect-[4/5] overflow-hidden bg-black">
      <img
        src={getSheetPreviewUrl(sheet)}
        alt={sheet.title || "Flash sheet"}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        loading={priority ? "eager" : "lazy"}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-90" />
      <div className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white opacity-0 backdrop-blur-md transition group-hover:opacity-100">
        <Expand size={17} />
      </div>
      <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-md">
        Flash Sheet
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="line-clamp-2 text-base! font-semibold! leading-snug text-white my-0!">
          {sheet.title || "Untitled flash sheet"}
        </h3>
        {Array.isArray(sheet.tags) && sheet.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sheet.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-white/75 backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  </button>
);

const PortfolioLightbox = ({
  item,
  artist,
  modalLoading,
  onImageLoad,
  onClose,
}: {
  item: GalleryItem;
  artist: Artist;
  modalLoading: boolean;
  onImageLoad: () => void;
  onClose: () => void;
}) => (
  <div
    onClick={onClose}
    className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/85 px-5 py-6 backdrop-blur-xs md:flex-row md:px-10"
    role="dialog"
    aria-modal="true"
  >
    <div className="relative flex max-h-[84vh] max-w-[94vw] flex-col md:max-w-[70vw]">
      {modalLoading && (
        <div className="absolute inset-0 min-h-[55vh] animate-pulse rounded-xl bg-white/10" />
      )}

      <img
        data-aos="zoom-out-up"
        src={item.fullUrl || item.webp90Url}
        alt={item.caption || "Full portfolio view"}
        className={`max-h-[72vh] max-w-full rounded-xl object-contain shadow-2xl transition-opacity duration-300 ${
          modalLoading ? "opacity-0" : "opacity-100"
        }`}
        onLoad={onImageLoad}
        onClick={(event) => event.stopPropagation()}
      />

      {!modalLoading && (
        <div
          className="absolute left-3 right-3 top-3 flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md"
          onClick={(event) => event.stopPropagation()}
        >
          {Array.isArray(item.tags) && item.tags.length > 0 && (
            <TagMarqueeModal tags={item.tags} />
          )}
          <button
            type="button"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 p-0! text-white transition hover:bg-white/20"
            onClick={onClose}
            aria-label="Close portfolio image"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {!modalLoading && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
          <img
            src={artist.avatarUrl || "/default-avatar.png"}
            alt={artist.name}
            className="h-9 w-9 rounded-full border border-white/40 object-cover"
          />
          <span className="text-sm font-semibold text-white">{artist.name}</span>
        </div>
      )}
    </div>

    {!modalLoading && (
      <div
        data-aos="fade-in"
        className="max-w-sm text-center md:text-left"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">
          Portfolio piece
        </p>
        <h1 className="mt-2 text-xl! font-light! leading-snug text-white md:text-2xl!">
          {item.caption || "Untitled piece"}
        </h1>
      </div>
    )}
  </div>
);

const FlashSheetLightbox = ({
  sheet,
  artist,
  modalLoading,
  onImageLoad,
  onClose,
}: {
  sheet: FlashSheet;
  artist: Artist;
  modalLoading: boolean;
  onImageLoad: () => void;
  onClose: () => void;
}) => (
  <div
    onClick={onClose}
    className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/85 px-5 py-6 backdrop-blur-xs md:flex-row md:px-10"
    role="dialog"
    aria-modal="true"
  >
    <div className="relative flex max-h-[84vh] max-w-[94vw] flex-col md:max-w-[70vw]">
      {modalLoading && (
        <div className="absolute inset-0 min-h-[55vh] animate-pulse rounded-xl bg-white/10" />
      )}

      <img
        data-aos="zoom-out-up"
        src={sheet.imageUrl}
        alt={sheet.title || "Full flash sheet view"}
        className={`max-h-[72vh] max-w-full rounded-xl object-contain shadow-2xl transition-opacity duration-300 ${
          modalLoading ? "opacity-0" : "opacity-100"
        }`}
        onLoad={onImageLoad}
        onClick={(event) => event.stopPropagation()}
      />

      {!modalLoading && (
        <div
          className="absolute left-3 right-3 top-3 flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md"
          onClick={(event) => event.stopPropagation()}
        >
          {Array.isArray(sheet.tags) && sheet.tags.length > 0 ? (
            <TagMarqueeModal tags={sheet.tags} />
          ) : (
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-white/65">
              Flash Sheet
            </span>
          )}
          <button
            type="button"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 p-0! text-white transition hover:bg-white/20"
            onClick={onClose}
            aria-label="Close flash sheet"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {!modalLoading && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
          <img
            src={artist.avatarUrl || "/default-avatar.png"}
            alt={artist.name}
            className="h-9 w-9 rounded-full border border-white/40 object-cover"
          />
          <span className="text-sm font-semibold text-white">{artist.name}</span>
        </div>
      )}
    </div>

    {!modalLoading && (
      <div
        data-aos="fade-in"
        className="max-w-sm text-center md:text-left"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">
          Flash sheet
        </p>
        <h1 className="mt-2 text-xl! font-light! leading-snug text-white md:text-2xl!">
          {sheet.title || "Untitled flash sheet"}
        </h1>
      </div>
    )}
  </div>
);

const TagMarqueeModal = ({ tags }: { tags: string[] }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState("60s");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (trackRef.current) {
      const totalWidth = trackRef.current.scrollWidth;
      const speed = 10;
      setDuration(`${totalWidth / 2 / speed}s`);
    }
  }, [tags]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => setIsVisible(entry.isIntersecting));
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-8 flex-1 overflow-hidden whitespace-nowrap"
    >
      <style>
        {`
          @keyframes scrollPortfolioTags {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .portfolio-tag-track {
            display: flex;
            width: max-content;
            animation: scrollPortfolioTags linear infinite;
            align-items: center;
          }
          .portfolio-tag-track:hover {
            animation-play-state: paused;
          }
        `}
      </style>

      <div
        ref={trackRef}
        className={`portfolio-tag-track ${!isVisible ? "pause" : ""}`}
        style={{ animationDuration: duration }}
      >
        {[...tags, ...tags].map((tag, idx) => (
          <span key={`${tag}-${idx}`} className="mx-3 text-xs font-medium text-white">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};
