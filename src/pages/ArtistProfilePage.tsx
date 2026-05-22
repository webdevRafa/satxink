import { type FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import toast from "react-hot-toast";
import { auth, db } from "../firebase/firebaseConfig";
import { FaFacebook } from "react-icons/fa";
import { RiInstagramFill } from "react-icons/ri";
import { Camera, DollarSign, Expand, ImageOff, Layers, Send, X } from "lucide-react";
import type { GalleryItem } from "../types/GalleryItem";
import type { FlashSheet } from "../types/FlashSheet";
import type { Flash } from "../types/Flash";

interface Artist {
  id: string;
  name?: string;
  displayName?: string;
  email: string;
  bio: string;
  avatarUrl: string;
  location?: string;
  specialties: string[];
  portfolioUrls: string[];
  studioName?: string;
  shopId?: string;
  likedBy: string[];
  isAvailable: boolean;
  socialLinks?: SocialLinks;
}
interface SocialLinks {
  facebook?: string;
  instagram?: string;
  website?: string;
}
type ClientProfile = {
  id: string;
  name: string;
  avatarUrl: string;
};
type Shop = {
  id: string;
  name: string;
  address?: string;
  mapLink?: string;
};

export const ArtistProfilePage = () => {
  const { id } = useParams();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [activeTab, setActiveTab] = useState<"portfolio" | "flashSheets">(
    "portfolio"
  );
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [flashSheets, setFlashSheets] = useState<FlashSheet[]>([]);
  const [flashSheetsLoading, setFlashSheetsLoading] = useState(true);
  const [focusedSheet, setFocusedSheet] = useState<FlashSheet | null>(null);
  const [sheetFlashes, setSheetFlashes] = useState<Flash[]>([]);
  const [sheetFlashesLoading, setSheetFlashesLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<FlashSheet | null>(null);
  const [selectedFlash, setSelectedFlash] = useState<Flash | null>(null);
  const [modalLoading, setModalLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setClient(null);
        return;
      }

      try {
        const clientRef = doc(db, "users", user.uid);
        const clientSnap = await getDoc(clientRef);
        const data = clientSnap.exists() ? clientSnap.data() : {};

        setClient({
          id: user.uid,
          name:
            (data.name as string) ||
            (data.displayName as string) ||
            user.displayName ||
            "Client",
          avatarUrl:
            (data.avatarUrl as string) ||
            user.photoURL ||
            "/default-avatar.png",
        });
      } catch (err) {
        console.error("Failed to fetch client profile:", err);
        setClient({
          id: user.uid,
          name: user.displayName || "Client",
          avatarUrl: user.photoURL || "/default-avatar.png",
        });
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchArtist = async () => {
      try {
        const ref = doc(db, "users", id as string);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const artistData = snap.data() as Omit<Artist, "id">;
          setArtist({ id: snap.id, ...artistData });

          if (artistData.shopId) {
            const shopRef = doc(db, "shops", artistData.shopId);
            const shopSnap = await getDoc(shopRef);
            setShop(
              shopSnap.exists()
                ? ({ id: shopSnap.id, ...shopSnap.data() } as Shop)
                : null
            );
          } else {
            setShop(null);
          }
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
    const fetchSheetFlashes = async () => {
      if (!focusedSheet || !id) return;

      setSheetFlashesLoading(true);
      try {
        const flashesQuery = query(
          collection(db, "flashes"),
          where("artistId", "==", id),
          where("sheetId", "==", focusedSheet.id)
        );
        const snapshot = await getDocs(flashesQuery);
        const flashes = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as Flash))
          .sort((a, b) => getItemTime(b) - getItemTime(a));

        setSheetFlashes(flashes);
      } catch (err) {
        console.error("Failed to fetch flash sheet items:", err);
        setSheetFlashes([]);
      } finally {
        setSheetFlashesLoading(false);
      }
    };

    fetchSheetFlashes();
  }, [focusedSheet, id]);

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

  const handleSelectSheet = (sheet: FlashSheet) => {
    setFocusedSheet(sheet);
    setSelectedFlash(null);
    window.setTimeout(() => {
      document
        .getElementById("flash-sheet-items")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  if (loading)
    return (
      <p className="text-center text-gray-400 mt-10">Loading profile...</p>
    );
  if (!artist)
    return <p className="text-center text-gray-400 mt-10">Artist not found.</p>;

  const artistDisplayName = getArtistDisplayName(artist);
  const artistShopName = shop?.name || artist.studioName;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 mt-20 min-h-[80vh]">
      <div className="relative bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#1a1a1a] rounded-xl p-6 shadow-lg max-w-6xl mx-auto mb-10">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          {/* Avatar */}
          <div className="relative group">
            <img
              src={artist.avatarUrl}
              alt={artistDisplayName}
              className="w-32 h-32 md:w-40 md:h-40 object-cover rounded-full border-4 border-neutral-800 group-hover:scale-105 transition-transform"
            />
            <span className="font-bold absolute bottom-1 right-1 bg-black text-white text-[10px] px-2 py-0.5 rounded-full opacity-70">
              Artist
            </span>
          </div>

          {/* Info */}
          <div className="text-center md:text-left flex-1">
            <h1 className="text-3xl! font-bold text-white my-0!">
              {artistDisplayName}
            </h1>
            {artistShopName &&
              (shop?.mapLink ? (
                <a
                  href={shop.mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-sm! font-medium text-white/70 transition hover:text-white"
                >
                  {artistShopName}
                </a>
              ) : (
                <p className="mt-1 text-sm! font-medium text-white/70">
                  {artistShopName}
                </p>
              ))}
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
            focusedSheetId={focusedSheet?.id}
            onOpenSheet={handleSelectSheet}
          />
        )}

        {activeTab === "flashSheets" && focusedSheet && (
          <FlashSheetItemsSection
            sheet={focusedSheet}
            flashes={sheetFlashes}
            loading={sheetFlashesLoading}
            onClose={() => {
              setFocusedSheet(null);
              setSheetFlashes([]);
            }}
            onPreviewSheet={() => setSelectedSheet(focusedSheet)}
            onSelectFlash={setSelectedFlash}
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

      {selectedFlash && artist && (
        <FlashRequestModal
          flash={selectedFlash}
          artist={artist}
          client={client}
          onClose={() => setSelectedFlash(null)}
        />
      )}
    </div>
  );
};

const getItemTime = (item: GalleryItem | FlashSheet | Flash) => {
  const createdAt = item.createdAt as any;
  if (createdAt?.toMillis) return createdAt.toMillis();
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "number") return createdAt;

  const timestamp = (item as any).timestamp;
  return typeof timestamp === "number" ? timestamp : 0;
};

const getCardPreviewUrl = (item: GalleryItem) =>
  item.thumbUrl || item.webp90Url || item.fullUrl;

const getLightboxPreviewUrl = (item: GalleryItem) =>
  item.webp90Url || item.thumbUrl || item.fullUrl;

const getSheetPreviewUrl = (sheet: FlashSheet) => sheet.thumbUrl || sheet.imageUrl;

const getFlashPreviewUrl = (flash: Flash) =>
  flash.webp90Url || flash.thumbUrl || flash.fullUrl;

const getArtistDisplayName = (artist: Artist) =>
  artist.displayName || artist.name || "Artist";

const preloadImage = (src?: string) => {
  if (!src) return;
  const image = new Image();
  image.src = src;
};

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
  focusedSheetId,
  onOpenSheet,
}: {
  flashSheets: FlashSheet[];
  flashSheetsLoading: boolean;
  focusedSheetId?: string;
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
          isSelected={focusedSheetId === sheet.id}
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
    onMouseEnter={() => preloadImage(item.fullUrl || item.webp90Url)}
    onFocus={() => preloadImage(item.fullUrl || item.webp90Url)}
    className={`group relative overflow-hidden rounded-xl border border-white/10 bg-[#111] p-0! text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition duration-300 hover:border-white/25 hover:shadow-[0_22px_70px_rgba(0,0,0,0.45)] ${
      priority ? "sm:col-span-2 lg:col-span-1" : ""
    }`}
  >
    <div className="relative aspect-[4/5] overflow-hidden bg-black">
      <FadeInImage
        src={getCardPreviewUrl(item)}
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
  isSelected,
  onOpen,
}: {
  sheet: FlashSheet;
  priority: boolean;
  isSelected: boolean;
  onOpen: () => void;
}) => (
  <button
    type="button"
    data-aos="fade-up"
    onClick={onOpen}
    className={`group relative overflow-hidden rounded-xl border bg-[#111] p-0! text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition duration-300 hover:border-white/25 hover:shadow-[0_22px_70px_rgba(0,0,0,0.45)] ${
      isSelected ? "border-white/40 ring-1 ring-white/25" : "border-white/10"
    } ${
      priority ? "sm:col-span-2 lg:col-span-1" : ""
    }`}
  >
    <div className="relative aspect-[4/5] overflow-hidden bg-black">
      <FadeInImage
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

const FadeInImage = ({
  src,
  alt,
  className,
  loading = "lazy",
}: {
  src: string;
  alt: string;
  className: string;
  loading?: "eager" | "lazy";
}) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <div
        className={`absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,0.04),rgba(255,255,255,0.11),rgba(255,255,255,0.04))] bg-[length:220%_100%] transition-opacity duration-300 ${
          loaded ? "opacity-0" : "opacity-100 animate-pulse"
        }`}
      />
      <img
        src={src}
        alt={alt}
        className={`${className} ${loaded ? "opacity-100" : "opacity-0"}`}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </>
  );
};

const FlashSheetItemsSection = ({
  sheet,
  flashes,
  loading,
  onClose,
  onPreviewSheet,
  onSelectFlash,
}: {
  sheet: FlashSheet;
  flashes: Flash[];
  loading: boolean;
  onClose: () => void;
  onPreviewSheet: () => void;
  onSelectFlash: (flash: Flash) => void;
}) => (
  <section
    id="flash-sheet-items"
    className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.22)] md:p-5"
  >
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <button
          type="button"
          onClick={onPreviewSheet}
          className="group relative h-44 w-full overflow-hidden rounded-xl border border-white/10 bg-black p-0! sm:w-36"
        >
          <img
            src={getSheetPreviewUrl(sheet)}
            alt={sheet.title || "Selected flash sheet"}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/20" />
          <div className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
            <Expand size={16} />
          </div>
        </button>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">
            Selected sheet
          </p>
          <h3 className="mt-2 text-2xl! font-semibold! text-white">
            {sheet.title || "Untitled flash sheet"}
          </h3>
          <p className="mt-2 max-w-xl text-sm text-white/55">
            Pick an available design below to send this artist a request with
            the flash details attached.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="self-start rounded-full border border-white/10 bg-white/[0.04] px-3! py-1.5! text-sm! text-white/70 transition hover:bg-white/10 hover:text-white lg:self-auto"
      >
        Close sheet
      </button>
    </div>

    {loading ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-[250px] animate-pulse rounded-xl border border-white/10 bg-white/[0.05]"
          />
        ))}
      </div>
    ) : flashes.length > 0 ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {flashes.map((flash) => (
          <FlashItemCard
            key={flash.id}
            flash={flash}
            onClick={() => onSelectFlash(flash)}
          />
        ))}
      </div>
    ) : (
      <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-white/10 bg-black/20 px-5 text-center">
        <ImageOff className="mb-3 text-white/30" size={30} />
        <h4 className="text-base! font-semibold! text-white">
          No itemized flashes yet
        </h4>
        <p className="mt-2 max-w-md text-sm text-white/50">
          This sheet is available to view, but the artist has not published
          individual flash items from it yet.
        </p>
      </div>
    )}
  </section>
);

const FlashItemCard = ({
  flash,
  onClick,
}: {
  flash: Flash;
  onClick: () => void;
}) => (
  <button
    type="button"
    data-aos="fade-up"
    onClick={onClick}
    className="group overflow-hidden rounded-xl border border-white/10 bg-[#111] p-0! text-left shadow-[0_14px_40px_rgba(0,0,0,0.25)] transition duration-300 hover:border-white/25 hover:shadow-[0_18px_54px_rgba(0,0,0,0.36)]"
  >
    <div className="relative aspect-[4/3] overflow-hidden bg-black">
      <img
        src={getFlashPreviewUrl(flash)}
        alt={flash.title || "Flash tattoo design"}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
      <div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-xs text-white/75 opacity-0 backdrop-blur-md transition duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        Request
      </div>
    </div>
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="line-clamp-2 text-base! font-semibold! text-white my-0!">
          {flash.title || "Untitled flash"}
        </h4>
        {typeof flash.price === "number" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs text-white/75">
            <DollarSign size={12} />
            {flash.price}
          </span>
        )}
      </div>
      {Array.isArray(flash.tags) && flash.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {flash.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs text-white/60"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
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
      <LightboxImageFrame
        fullUrl={item.fullUrl || item.webp90Url}
        previewUrl={getLightboxPreviewUrl(item)}
        alt={item.caption || "Full portfolio view"}
        isLoading={modalLoading}
        loadingLabel="Loading full resolution"
        onImageLoad={onImageLoad}
      />

      <div className="absolute right-3 top-3" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/45 p-0! text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
          onClick={onClose}
          aria-label="Close portfolio image"
        >
          <X size={18} />
        </button>
      </div>

      {!modalLoading && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
          <img
            src={artist.avatarUrl || "/default-avatar.png"}
            alt={getArtistDisplayName(artist)}
            className="h-9 w-9 rounded-full border border-white/40 object-cover"
          />
          <span className="text-sm font-semibold text-white">
            {getArtistDisplayName(artist)}
          </span>
        </div>
      )}
    </div>

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
      {!modalLoading && Array.isArray(item.tags) && item.tags.length > 0 && (
        <div className="mt-5 max-w-sm">
          <TagMarqueeModal tags={item.tags} compact />
        </div>
      )}
      {modalLoading && (
        <div className="mt-4 space-y-2">
          <div className="h-2 w-28 animate-pulse rounded-full bg-white/10" />
          <div className="h-2 w-40 animate-pulse rounded-full bg-white/10" />
        </div>
      )}
    </div>
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
            alt={getArtistDisplayName(artist)}
            className="h-9 w-9 rounded-full border border-white/40 object-cover"
          />
          <span className="text-sm font-semibold text-white">
            {getArtistDisplayName(artist)}
          </span>
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

const LightboxImageFrame = ({
  fullUrl,
  previewUrl,
  alt,
  isLoading,
  loadingLabel,
  onImageLoad,
}: {
  fullUrl: string;
  previewUrl: string;
  alt: string;
  isLoading: boolean;
  loadingLabel: string;
  onImageLoad: () => void;
}) => (
  <div
    data-aos="zoom-out-up"
    className="relative flex h-[min(72vh,760px)] w-[min(94vw,940px)] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#080808] shadow-2xl"
    onClick={(event) => event.stopPropagation()}
  >
    <img
      src={previewUrl}
      alt=""
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full object-contain transition duration-500 ${
        isLoading
          ? "scale-100 opacity-100 blur-0"
          : "scale-100 opacity-0 blur-none"
      }`}
      decoding="async"
    />
    <div
      className={`absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_55%),linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.08)_45%,transparent_70%)] transition-opacity duration-300 ${
        isLoading ? "opacity-40 animate-pulse" : "opacity-0"
      }`}
    />
    <img
      src={fullUrl}
      alt={alt}
      className={`relative z-10 h-full w-full object-contain transition duration-500 ${
        isLoading ? "scale-[0.995] opacity-0" : "scale-100 opacity-100"
      }`}
      decoding="async"
      onLoad={onImageLoad}
      onError={onImageLoad}
    />
    {isLoading && (
      <div className="absolute inset-x-0 bottom-5 z-20 mx-auto flex w-fit items-center gap-3 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-sm text-white/75 shadow-lg backdrop-blur-md">
        <span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        {loadingLabel}
      </div>
    )}
  </div>
);

const FlashRequestModal = ({
  flash,
  artist,
  client,
  onClose,
}: {
  flash: Flash;
  artist: Artist;
  client: ClientProfile | null;
  onClose: () => void;
}) => {
  const [description, setDescription] = useState(
    `I would like to request this flash design: ${flash.title || "Untitled flash"}.`
  );
  const [bodyPlacement, setBodyPlacement] = useState("");
  const [size, setSize] = useState("");
  const [preferredDateRange, setPreferredDateRange] = useState(["", ""]);
  const [availableTime, setAvailableTime] = useState({ from: "", to: "" });
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [budget, setBudget] = useState(
    typeof flash.price === "number" ? String(flash.price) : ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!client) {
      toast.error("Please sign in as a client before requesting this flash.");
      return;
    }

    if (!bodyPlacement || !size) {
      toast.error("Please add placement and size.");
      return;
    }

    try {
      setIsSubmitting(true);
      const numericBudget = Number(budget);
      const finalBudget =
        budget.trim() && !Number.isNaN(numericBudget) ? numericBudget : null;

      await addDoc(collection(db, "bookingRequests"), {
        artistId: artist.id,
        clientId: client.id,
        clientName: client.name,
        clientAvatar: client.avatarUrl,
        description,
        bodyPlacement,
        size,
        preferredDateRange,
        budget: finalBudget,
        availableTime,
        availableDays,
        status: "pending",
        createdAt: serverTimestamp(),

        fullUrl: flash.fullUrl || flash.webp90Url || flash.thumbUrl,
        thumbUrl: flash.thumbUrl || flash.webp90Url || flash.fullUrl,
        sourceType: "flash",
        flashId: flash.id,
        flashTitle: flash.title || "Untitled flash",
        flashPrice: flash.price ?? null,
        flashSheetId: flash.sheetId || null,
        isFromSheet: flash.isFromSheet,
      });

      toast.success("Flash request sent!");
      onClose();
    } catch (err) {
      console.error("Failed to submit flash request:", err);
      toast.error("Something went wrong while sending your request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#121212] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/40">
              Flash request
            </p>
            <h2 className="mt-1 text-xl! font-semibold! text-white">
              {flash.title || "Untitled flash"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 p-0! text-white transition hover:bg-white/20"
            aria-label="Close flash request"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-6 p-5 md:grid-cols-[0.9fr_1.1fr]"
        >
          <div>
            <img
              src={getFlashPreviewUrl(flash)}
              alt={flash.title || "Selected flash"}
              className="max-h-[420px] w-full rounded-xl border border-white/10 object-contain bg-black"
            />
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-3">
                <img
                  src={artist.avatarUrl || "/default-avatar.png"}
                  alt={getArtistDisplayName(artist)}
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div>
                  <p className="text-sm font-semibold text-white">
                    {getArtistDisplayName(artist)}
                  </p>
                  {typeof flash.price === "number" && (
                    <p className="text-sm text-white/55">
                      Listed at ${flash.price}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {!client && (
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                Sign in as a client to send this request.
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-sm text-white/70">
                Message
              </span>
              <textarea
                required
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-white/35"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">
                  Body placement
                </span>
                <input
                  required
                  value={bodyPlacement}
                  onChange={(event) => setBodyPlacement(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-white/35"
                  placeholder="Forearm, thigh, shoulder..."
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-white/70">Size</span>
                <select
                  required
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-white/35"
                >
                  <option value="">Select size</option>
                  <option value="Small">Small</option>
                  <option value="Medium">Medium</option>
                  <option value="Large">Large</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">
                  Earliest date
                </span>
                <input
                  type="date"
                  value={preferredDateRange[0]}
                  onChange={(event) =>
                    setPreferredDateRange([
                      event.target.value,
                      preferredDateRange[1],
                    ])
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-white/35"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">
                  Latest date
                </span>
                <input
                  type="date"
                  value={preferredDateRange[1]}
                  onChange={(event) =>
                    setPreferredDateRange([
                      preferredDateRange[0],
                      event.target.value,
                    ])
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-white/35"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">
                  From
                </span>
                <input
                  type="time"
                  value={availableTime.from}
                  onChange={(event) =>
                    setAvailableTime((prev) => ({
                      ...prev,
                      from: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-white/35"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">To</span>
                <input
                  type="time"
                  value={availableTime.to}
                  onChange={(event) =>
                    setAvailableTime((prev) => ({
                      ...prev,
                      to: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-white/35"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">
                  Budget
                </span>
                <input
                  type="number"
                  min={0}
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-white/35"
                  placeholder="$"
                />
              </label>
            </div>

            <div>
              <span className="mb-2 block text-sm text-white/70">
                Available days
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ].map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={`rounded-full border px-3! py-1! text-sm! transition ${
                      availableDays.includes(day)
                        ? "border-white/40 bg-white text-black"
                        : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10"
                    }`}
                    onClick={() =>
                      setAvailableDays((prev) =>
                        prev.includes(day)
                          ? prev.filter((item) => item !== day)
                          : [...prev, day]
                      )
                    }
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !client}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#b6382d] px-4! py-3! text-sm! font-semibold text-white transition hover:bg-[#cf4639] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Send flash request"}
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const TagMarqueeModal = ({
  tags,
  compact = false,
}: {
  tags: string[];
  compact?: boolean;
}) => {
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

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-medium text-white/70"
          >
            {tag}
          </span>
        ))}
      </div>
    );
  }

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
