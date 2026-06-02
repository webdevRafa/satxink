import { type FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import toast from "react-hot-toast";
import { auth, db } from "../firebase/firebaseConfig";
import { FaFacebook } from "react-icons/fa";
import { RiInstagramFill } from "react-icons/ri";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Expand,
  Globe2,
  Heart,
  ImageOff,
  Layers,
  MapPin,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import type { GalleryItem } from "../types/GalleryItem";
import type { FlashSheet } from "../types/FlashSheet";
import type { Flash } from "../types/Flash";
import { isStripeConnectReady, type StripeConnectLike } from "../utils/stripeConnect";
import {
  getFlashAvailabilityStatus,
  getFlashRepeatability,
  isFlashAvailableForClients,
} from "../utils/flashAvailability";
import {
  FlashPreviewImage,
  FlashPreviewMeta,
} from "../components/FlashPreviewCard";
import { flashPreviewCardClassName } from "../utils/flashPreview";
import RequestTattooModal from "../components/RequestTattooModal";
import CustomSelect from "../components/ui/CustomSelect";
import QuarterHourTimeSelect from "../components/ui/QuarterHourTimeSelect";
import { bodyPlacementOptions } from "../utils/tattooOptions";
import {
  getTodayDateInputValue,
  hasPastDateInputValue,
  isDateRangeBackwards,
} from "../utils/dateInputGuards";

const flashSizeOptions = [
  { value: "Small", label: "Small" },
  { value: "Medium", label: "Medium" },
  { value: "Large", label: "Large" },
];

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
type StripeReadyArtist = Artist & StripeConnectLike;
interface SocialLinks {
  facebook?: string;
  instagram?: string;
  website?: string;
}
type ClientProfile = {
  id: string;
  name: string;
  avatarUrl: string;
  likedArtists: string[];
};
type Shop = {
  id: string;
  name: string;
  address?: string;
  mapLink?: string;
};
type SlideDirection = "next" | "prev";
type ArtistWorkTab = "portfolio" | "flashSheets";

export const ArtistProfilePage = () => {
  const { id } = useParams();
  const [artist, setArtist] = useState<StripeReadyArtist | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [activeTab, setActiveTab] = useState<ArtistWorkTab>("portfolio");
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
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isFollowUpdating, setIsFollowUpdating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<SlideDirection>("next");
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
          likedArtists: Array.isArray(data.likedArtists)
            ? (data.likedArtists as string[])
            : [],
        });
      } catch (err) {
        console.error("Failed to fetch client profile:", err);
        setClient({
          id: user.uid,
          name: user.displayName || "Client",
          avatarUrl: user.photoURL || "/default-avatar.png",
          likedArtists: [],
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
          const artistData = snap.data() as Omit<StripeReadyArtist, "id">;
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
          .filter((sheet) => isMarketplaceReady(sheet, artist))
          .sort((a, b) => getItemTime(b) - getItemTime(a));

        setFlashSheets(sheets);
      } catch (err) {
        console.error("Failed to fetch artist flash sheets:", err);
      } finally {
        setFlashSheetsLoading(false);
      }
    };

    fetchFlashSheets();
  }, [id, artist]);

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
          .filter((flash) => isMarketplaceReady(flash, artist))
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
  }, [focusedSheet, id, artist]);

  const selectedItemIndex = selectedItem
    ? galleryItems.findIndex((item) => item.id === selectedItem.id)
    : -1;
  const canNavigatePortfolio = galleryItems.length > 1 && selectedItemIndex >= 0;

  const navigatePortfolio = (direction: SlideDirection) => {
    if (!canNavigatePortfolio) return;

    const offset = direction === "next" ? 1 : -1;
    const nextIndex =
      (selectedItemIndex + offset + galleryItems.length) % galleryItems.length;

    setSlideDirection(direction);
    setSelectedItem(galleryItems[nextIndex]);
  };

  const openPortfolioItem = (item: GalleryItem) => {
    setSlideDirection("next");
    setSelectedItem(item);
  };

  useEffect(() => {
    if (!selectedItem && !selectedSheet) return;

    setModalLoading(true);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedItem(null);
        setSelectedSheet(null);
      }
      if (selectedItem && event.key === "ArrowRight") {
        event.preventDefault();
        navigatePortfolio("next");
      }
      if (selectedItem && event.key === "ArrowLeft") {
        event.preventDefault();
        navigatePortfolio("prev");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedItem, selectedSheet, selectedItemIndex, galleryItems.length]);

  const handleSelectSheet = (sheet: FlashSheet) => {
    setFocusedSheet(sheet);
    setSelectedFlash(null);
    window.setTimeout(() => {
      document
        .getElementById("flash-sheet-items")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const handleRequestTattoo = () => {
    if (!client) {
      toast.error("Please sign in as a client before requesting a tattoo.");
      return;
    }

    setIsRequestModalOpen(true);
  };

  const handleToggleFollow = async () => {
    if (!artist) return;

    if (!client) {
      toast.error("Please sign in as a client to follow artists.");
      return;
    }

    if (client.id === artist.id) {
      toast.error("You are viewing your own artist profile.");
      return;
    }

    const currentlyFollowing = client.likedArtists.includes(artist.id);

    try {
      setIsFollowUpdating(true);
      await Promise.all([
        updateDoc(doc(db, "users", client.id), {
          likedArtists: currentlyFollowing
            ? arrayRemove(artist.id)
            : arrayUnion(artist.id),
        }),
        updateDoc(doc(db, "users", artist.id), {
          likedBy: currentlyFollowing
            ? arrayRemove(client.id)
            : arrayUnion(client.id),
        }),
      ]);

      setClient((current) =>
        current
          ? {
              ...current,
              likedArtists: currentlyFollowing
                ? current.likedArtists.filter((artistId) => artistId !== artist.id)
                : [...new Set([...current.likedArtists, artist.id])],
            }
          : current
      );
      setArtist((current) =>
        current
          ? {
              ...current,
              likedBy: currentlyFollowing
                ? (current.likedBy || []).filter((clientId) => clientId !== client.id)
                : [...new Set([...(current.likedBy || []), client.id])],
            }
          : current
      );

      toast.success(
        currentlyFollowing
          ? "Artist removed from your liked artists."
          : "Artist added to your liked artists."
      );
    } catch (err) {
      console.error("Failed to update liked artist:", err);
      toast.error("Could not update this artist right now.");
    } finally {
      setIsFollowUpdating(false);
    }
  };

  if (loading) return <ArtistProfilePageSkeleton />;

  if (!artist)
    return <p className="text-center text-gray-400 mt-10">Artist not found.</p>;

  const artistDisplayName = getArtistDisplayName(artist);
  const artistShopName = shop?.name || artist.studioName;
  const isFollowingArtist = Boolean(client?.likedArtists.includes(artist.id));
  const artistStyles = Array.isArray(artist.specialties)
    ? artist.specialties.filter(Boolean)
    : [];
  const socialLinks = getArtistSocialLinks(artist);

  return (
    <div className="mx-auto mt-20 min-h-[80vh] max-w-6xl px-4 py-10">
      <div className="relative mx-auto mb-10 w-full overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-black/20 p-6 shadow-lg">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col items-center gap-5 text-center md:flex-row md:text-left">
            <div className="relative shrink-0">
              <img
                src={artist.avatarUrl || "/fallback-avatar.jpg"}
                alt={artistDisplayName}
                className="aspect-square h-32 w-32 rounded-full border border-white/10 object-cover shadow-lg md:h-40 md:w-40"
              />
              <span className="absolute bottom-2 right-1 rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/10">
                Artist
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Artist profile
              </p>
              <h1 className="mt-2 text-3xl! font-semibold text-white">
                {artistDisplayName}
              </h1>
              {artistShopName &&
                (shop?.mapLink ? (
                  <a
                    href={shop.mapLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center justify-center gap-2 text-sm! font-medium text-neutral-300 transition hover:text-white md:justify-start"
                  >
                    <MapPin size={15} />
                    {artistShopName}
                  </a>
                ) : (
                  <p className="mt-2 inline-flex items-center justify-center gap-2 text-sm! font-medium text-neutral-300 md:justify-start">
                    <MapPin size={15} />
                    {artistShopName}
                  </p>
                ))}
              {artist.bio && (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-400">
                  {artist.bio}
                </p>
              )}

              {socialLinks.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
                  {socialLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={link.label}
                      title={link.label}
                      className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-black/20 text-white transition hover:border-white/25 hover:bg-white/[0.08]"
                    >
                      {link.icon}
                    </a>
                  ))}
                </div>
              )}

              {artistStyles.length > 0 && (
                <ul className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
                  {artistStyles.map((style) => (
                    <li
                      key={style}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-200"
                    >
                      {style}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="w-full lg:w-[280px]">
            <ArtistHeaderActionCard
              isFollowingArtist={isFollowingArtist}
              isFollowUpdating={isFollowUpdating}
              onRequestTattoo={handleRequestTattoo}
              onToggleFollow={handleToggleFollow}
            />
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
            onOpenItem={openPortfolioItem}
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
          slideDirection={slideDirection}
          canNavigate={canNavigatePortfolio}
          modalLoading={modalLoading}
          onImageLoad={() => setModalLoading(false)}
          onNext={() => navigatePortfolio("next")}
          onPrev={() => navigatePortfolio("prev")}
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

      {client && (
        <RequestTattooModal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          client={client}
          artist={{
            id: artist.id,
            name: artistDisplayName,
            avatarUrl: artist.avatarUrl,
            studioName: artistShopName,
          }}
        />
      )}
    </div>
  );
};

const ArtistProfilePageSkeleton = () => (
  <div
    className="max-w-5xl mx-auto px-4 py-10 mt-20 min-h-[calc(100vh-5rem)]"
    aria-busy="true"
    aria-live="polite"
  >
    <div className="rounded-xl border border-white/5 bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#1a1a1a] p-6 shadow-lg">
      <div className="flex animate-pulse flex-col items-center gap-6 md:flex-row md:items-start">
        <div className="h-32 w-32 rounded-full border-4 border-neutral-800 bg-white/[0.07] md:h-40 md:w-40" />
        <div className="flex w-full flex-1 flex-col items-center md:items-start">
          <div className="h-8 w-44 rounded-md bg-white/[0.08]" />
          <div className="mt-3 h-4 w-36 rounded-full bg-white/[0.06]" />
          <div className="mt-5 h-4 w-full max-w-sm rounded-full bg-white/[0.06]" />
          <div className="mt-3 h-4 w-2/3 max-w-xs rounded-full bg-white/[0.04]" />
          <div className="mt-5 flex gap-3">
            <div className="h-6 w-6 rounded-full bg-white/[0.08]" />
            <div className="h-6 w-6 rounded-full bg-white/[0.08]" />
          </div>
          <div className="mt-6 flex w-full flex-wrap justify-center gap-2 md:justify-start">
            {[96, 84, 92, 88, 76, 124].map((width) => (
              <div
                key={width}
                className="h-8 rounded-full border border-white/10 bg-white/[0.04]"
                style={{ width }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>

    <div className="mt-10 animate-pulse">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-4 w-32 rounded-full bg-white/[0.06]" />
          <div className="mt-4 flex items-center gap-3">
            <div className="h-8 w-28 rounded-md bg-white/[0.08]" />
            <div className="h-6 w-px bg-white/10" />
            <div className="h-8 w-32 rounded-md bg-white/[0.05]" />
          </div>
        </div>
        <div className="h-8 w-24 rounded-full border border-white/10 bg-white/[0.04]" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="aspect-[4/5] rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent"
          />
        ))}
      </div>
    </div>

    <span className="sr-only">Loading artist profile</span>
  </div>
);

const ArtistHeaderActionCard = ({
  isFollowingArtist,
  isFollowUpdating,
  onRequestTattoo,
  onToggleFollow,
}: {
  isFollowingArtist: boolean;
  isFollowUpdating: boolean;
  onRequestTattoo: () => void;
  onToggleFollow: () => void;
}) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3 shadow-lg">
    <div className="space-y-2">
      <button
        type="button"
        onClick={onRequestTattoo}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-3! py-2.5! text-sm! font-semibold text-black transition hover:bg-white/85"
      >
        <MessageCircle size={16} />
        Request tattoo
      </button>
      <button
        type="button"
        onClick={onToggleFollow}
        disabled={isFollowUpdating}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-md border px-3! py-2.5! text-sm! font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
          isFollowingArtist
            ? "border-[#19d69b]/45 bg-[#19d69b]/12 text-white hover:bg-[#19d69b]/18"
            : "border-white/10 bg-black/25 text-white hover:bg-white/[0.08]"
        }`}
      >
        <Heart
          size={16}
          className={isFollowingArtist ? "fill-[#19d69b] text-[#19d69b]" : ""}
        />
        {isFollowingArtist ? "Following" : "Follow artist"}
      </button>
    </div>
  </div>
);

const getItemTime = (item: GalleryItem | FlashSheet | Flash) => {
  const createdAt = item.createdAt as
    | Date
    | number
    | { toMillis?: () => number }
    | null
    | undefined;
  if (
    createdAt &&
    typeof createdAt === "object" &&
    "toMillis" in createdAt &&
    typeof createdAt.toMillis === "function"
  ) {
    return createdAt.toMillis();
  }
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "number") return createdAt;

  const timestamp = (item as { timestamp?: number }).timestamp;
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

const getArtistSocialLinks = (artist: Artist) =>
  [
    {
      label: "Instagram",
      value: artist.socialLinks?.instagram,
      icon: <RiInstagramFill size={20} />,
    },
    {
      label: "Facebook",
      value: artist.socialLinks?.facebook,
      icon: <FaFacebook size={19} />,
    },
    {
      label: "Website",
      value: artist.socialLinks?.website,
      icon: <Globe2 size={19} />,
    },
  ]
    .filter((link) => Boolean(link.value?.trim()))
    .map((link) => ({
      label: link.label,
      href: getExternalHref(link.value as string),
      icon: link.icon,
    }));

const getExternalHref = (url: string) => {
  const trimmedUrl = url.trim();
  return /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
};

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
      {Array.isArray(item.tags) && item.tags.length > 0 && (
        <div className="absolute inset-x-0 top-0 p-4 opacity-0 transition duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/75 via-black/35 to-transparent" />
          <div className="relative flex flex-wrap gap-2">
            {item.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-xs font-medium text-white/80 backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="line-clamp-2 text-base! font-semibold! leading-snug text-white my-0!">
          {item.caption || "Untitled piece"}
        </h3>
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
}) => {
  return (
    <button
      type="button"
      data-aos="fade-up"
      onClick={onClick}
      className={`${flashPreviewCardClassName} p-0! text-left hover:shadow-[0_18px_54px_rgba(0,0,0,0.36)]`}
    >
      <FlashPreviewImage flash={flash}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
        <div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-xs text-white/75 opacity-0 backdrop-blur-md transition duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          Request
        </div>
      </FlashPreviewImage>
      <div className="p-4">
        <FlashPreviewMeta flash={flash} showArtist={false} />
      </div>
    </button>
  );
};

const PortfolioLightbox = ({
  item,
  artist,
  slideDirection,
  canNavigate,
  modalLoading,
  onImageLoad,
  onNext,
  onPrev,
  onClose,
}: {
  item: GalleryItem;
  artist: Artist;
  slideDirection: SlideDirection;
  canNavigate: boolean;
  modalLoading: boolean;
  onImageLoad: () => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) => {
  const slideClass =
    slideDirection === "next"
      ? "portfolio-slide-in-next"
      : "portfolio-slide-in-prev";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/85 px-5 py-6 backdrop-blur-xs md:flex-row md:px-10"
      role="dialog"
      aria-modal="true"
    >
      <style>
        {`
          @keyframes portfolioSlideInNext {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          @keyframes portfolioSlideInPrev {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
          .portfolio-slide-in-next {
            animation: portfolioSlideInNext 360ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .portfolio-slide-in-prev {
            animation: portfolioSlideInPrev 360ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          @keyframes portfolioMetaInNext {
            from { opacity: 0; transform: translateX(24px); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes portfolioMetaInPrev {
            from { opacity: 0; transform: translateX(-24px); }
            to { opacity: 1; transform: translateX(0); }
          }
          .portfolio-meta-in-next {
            animation: portfolioMetaInNext 260ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .portfolio-meta-in-prev {
            animation: portfolioMetaInPrev 260ms cubic-bezier(0.22, 1, 0.36, 1);
          }
        `}
      </style>

      <div className="relative flex max-h-[84vh] max-w-[94vw] flex-col md:max-w-[70vw]">
        <LightboxImageFrame
          imageKey={item.id}
          fullUrl={item.fullUrl || item.webp90Url}
          previewUrl={getLightboxPreviewUrl(item)}
          alt={item.caption || "Full portfolio view"}
          isLoading={modalLoading}
          loadingLabel="Loading full resolution"
          slideClass={slideClass}
          onImageLoad={onImageLoad}
        />

        {canNavigate && (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPrev();
              }}
              className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/45 p-0! text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
              aria-label="Previous portfolio image"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onNext();
              }}
              className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/45 p-0! text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
              aria-label="Next portfolio image"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}

        <div
          className="absolute right-3 top-3 z-20"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/45 p-0! text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
            onClick={onClose}
            aria-label="Close portfolio image"
          >
            <X size={18} />
          </button>
        </div>

      </div>

      <div
        data-aos="fade-in"
        className="w-full max-w-sm text-center md:text-left"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-center gap-3 md:justify-start">
          <img
            src={artist.avatarUrl || "/default-avatar.png"}
            alt={getArtistDisplayName(artist)}
            className="h-11 w-11 rounded-full border border-white/20 object-cover shadow-[0_10px_28px_rgba(0,0,0,0.32)]"
          />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-white/35">
              Artist
            </p>
            <p className="mt-0.5 truncate text-sm! font-semibold! leading-tight text-white">
              {getArtistDisplayName(artist)}
            </p>
          </div>
        </div>

        <p className="text-xs uppercase tracking-[0.18em] text-white/45">
          Portfolio piece
        </p>
        <div
          key={item.id}
          className={
            slideDirection === "next"
              ? "portfolio-meta-in-next"
              : "portfolio-meta-in-prev"
          }
        >
          <h1 className="mt-2 text-xl! font-light! leading-snug text-white md:text-2xl!">
            {item.caption || "Untitled piece"}
          </h1>
          {Array.isArray(item.tags) && item.tags.length > 0 && (
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
    </div>
  );
};

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
  imageKey,
  fullUrl,
  previewUrl,
  alt,
  isLoading,
  loadingLabel,
  slideClass,
  onImageLoad,
}: {
  imageKey: string;
  fullUrl: string;
  previewUrl: string;
  alt: string;
  isLoading: boolean;
  loadingLabel: string;
  slideClass?: string;
  onImageLoad: () => void;
}) => (
  <div
    className="relative flex h-[min(72vh,760px)] w-[min(94vw,940px)] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#080808] shadow-2xl"
    onClick={(event) => event.stopPropagation()}
  >
    <div key={imageKey} className={`absolute inset-0 ${slideClass || ""}`}>
      <img
        src={previewUrl}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
          isLoading ? "opacity-100" : "opacity-0"
        }`}
        decoding="async"
      />
      <img
        src={fullUrl}
        alt={alt}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
          isLoading ? "opacity-0" : "opacity-100"
        }`}
        decoding="async"
        onLoad={onImageLoad}
        onError={onImageLoad}
      />
    </div>
    <div
      className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_55%),linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.08)_45%,transparent_70%)] transition-opacity duration-300 ${
        isLoading ? "opacity-25 animate-pulse" : "opacity-0"
      }`}
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const todayDateInput = getTodayDateInputValue();

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

    if (hasPastDateInputValue(preferredDateRange, todayDateInput)) {
      toast.error("Preferred dates must be today or later.");
      return;
    }

    if (isDateRangeBackwards(preferredDateRange[0], preferredDateRange[1])) {
      toast.error("Latest date must be the same day or after the earliest date.");
      return;
    }

    try {
      setIsSubmitting(true);

      const flashSnap = await getDoc(doc(db, "flashes", flash.id));
      const latestFlash = flashSnap.exists()
        ? ({ id: flashSnap.id, ...flashSnap.data() } as Flash)
        : flash;

      if (!isFlashAvailableForClients(latestFlash)) {
        toast.error(
          getFlashRepeatability(latestFlash) === "one_of_one"
            ? "This one-of-one flash is no longer available."
            : "This flash is no longer available."
        );
        return;
      }

      await addDoc(collection(db, "bookingRequests"), {
        artistId: artist.id,
        artistName: getArtistDisplayName(artist),
        artistAvatar: artist.avatarUrl || "/default-avatar.png",
        clientId: client.id,
        clientName: client.name,
        clientAvatar: client.avatarUrl,
        description,
        bodyPlacement,
        size,
        preferredDateRange,
        availableTime,
        availableDays,
        status: "pending",
        createdAt: serverTimestamp(),

        fullUrl:
          latestFlash.fullUrl || latestFlash.webp90Url || latestFlash.thumbUrl,
        thumbUrl:
          latestFlash.thumbUrl || latestFlash.webp90Url || latestFlash.fullUrl,
        sourceType: "flash",
        flashId: latestFlash.id,
        flashTitle: latestFlash.title || "Untitled flash",
        flashPrice: latestFlash.price ?? null,
        flashSheetId: latestFlash.sheetId || null,
        flashRepeatability: getFlashRepeatability(latestFlash),
        flashAvailabilityStatus: getFlashAvailabilityStatus(latestFlash),
        isFromSheet: latestFlash.isFromSheet,
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
      <div className="request-modal-scrollbar max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#121212] text-white shadow-2xl">
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
                <CustomSelect
                  value={bodyPlacement}
                  onChange={setBodyPlacement}
                  options={bodyPlacementOptions}
                  placeholder="Forearm, thigh, shoulder..."
                  buttonClassName="rounded-xl"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-white/70">Size</span>
                <CustomSelect
                  value={size}
                  onChange={setSize}
                  options={flashSizeOptions}
                  placeholder="Select size"
                  buttonClassName="rounded-xl"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">
                  Earliest date
                </span>
                <input
                  type="date"
                  min={todayDateInput}
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
                  min={preferredDateRange[0] || todayDateInput}
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">
                  From
                </span>
                <QuarterHourTimeSelect
                  value={availableTime.from}
                  onChange={(value) =>
                    setAvailableTime((prev) => ({
                      ...prev,
                      from: value,
                    }))
                  }
                  placeholder="Select time"
                  buttonClassName="rounded-xl"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">To</span>
                <QuarterHourTimeSelect
                  value={availableTime.to}
                  onChange={(value) =>
                    setAvailableTime((prev) => ({
                      ...prev,
                      to: value,
                    }))
                  }
                  placeholder="Select time"
                  buttonClassName="rounded-xl"
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

const isMarketplaceReady = (
  item: Flash | FlashSheet,
  artist?: StripeReadyArtist | null
) => {
  if ("isAvailable" in item && !isFlashAvailableForClients(item as Flash)) {
    return false;
  }
  if (item.marketplaceVisible === false) return false;
  if (item.artistStripeConnectReady === true) return true;
  return isStripeConnectReady(artist);
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
