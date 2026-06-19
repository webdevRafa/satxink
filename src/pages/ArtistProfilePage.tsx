import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
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
  CalendarDays,
  ChevronDown,
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
import {
  isStripeConnectReady,
  type StripeConnectLike,
} from "../utils/stripeConnect";
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
import { getClientNameParts } from "../utils/clientDisplayName";
import {
  getBookingAvailabilityLabel,
  type BookingAvailability,
} from "../utils/bookingAvailability";

const flashSizeOptions = [
  { value: "Small", label: "Small" },
  { value: "Medium", label: "Medium" },
  { value: "Large", label: "Large" },
];

const profileBackdropMediaQuery = "(min-width: 768px)";

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
  bookingAvailability?: BookingAvailability;
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
  firstName?: string;
  lastName?: string;
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

const FEATURED_WORK_LIMIT = 9;
const PORTFOLIO_FADE_DURATION_MS = 220;
const PORTFOLIO_FADE_STAGGER_MS = 90;
const PORTFOLIO_FADE_PHASE_GAP_MS = 40;
const PORTFOLIO_FADE_SETTLE_BUFFER_MS = 48;

export const ArtistProfilePage = () => {
  const { id } = useParams();
  const [artist, setArtist] = useState<StripeReadyArtist | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [client, setClient] = useState<ClientProfile | null>(null);
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
  const [isRequestTransitioning, setIsRequestTransitioning] = useState(false);
  const [showProfileBackdrop, setShowProfileBackdrop] = useState(() =>
    canShowProfileBackdrop()
  );
  const requestFlowTopRef = useRef<HTMLDivElement | null>(null);
  const flashSectionRef = useRef<HTMLElement | null>(null);
  const requestOpenTimerRef = useRef<number | null>(null);
  const [shouldPromptForFlash, setShouldPromptForFlash] = useState(false);

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
        const clientNameParts = getClientNameParts(
          data,
          user.displayName || "Client"
        );

        setClient({
          id: user.uid,
          name: clientNameParts.fullName,
          firstName: clientNameParts.firstName,
          lastName: clientNameParts.lastName,
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
        const clientNameParts = getClientNameParts(
          { displayName: user.displayName },
          "Client"
        );
        setClient({
          id: user.uid,
          name: clientNameParts.fullName,
          firstName: clientNameParts.firstName,
          lastName: clientNameParts.lastName,
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
    return () => {
      if (requestOpenTimerRef.current !== null) {
        window.clearTimeout(requestOpenTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(profileBackdropMediaQuery);
    const handleChange = (event: MediaQueryListEvent) => {
      setShowProfileBackdrop(event.matches);
    };

    setShowProfileBackdrop(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!id) return;

    setGalleryLoading(true);
    const galleryQuery = query(
      collection(db, "gallery"),
      where("artistId", "==", id)
    );
    const unsubscribe = onSnapshot(
      galleryQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as GalleryItem))
          .filter((item) => item.status !== "processing")
          .sort((a, b) => getItemTime(b) - getItemTime(a));

        setGalleryItems(items);
        setGalleryLoading(false);
      },
      (err) => {
        console.error("Failed to fetch artist gallery:", err);
        setGalleryLoading(false);
      }
    );

    return () => unsubscribe();
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

  const updateFlashCueVisibility = useCallback(() => {
    const section = flashSectionRef.current;
    const hasFlashSheets = !flashSheetsLoading && flashSheets.length > 0;
    const hasOverlayOpen = Boolean(
      selectedItem ||
        selectedSheet ||
        selectedFlash ||
        isRequestModalOpen ||
        isRequestTransitioning
    );
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches;

    if (!section || !hasFlashSheets || hasOverlayOpen || !isDesktop) {
      setShouldPromptForFlash(false);
      return;
    }

    const rect = section.getBoundingClientRect();
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;

    setShouldPromptForFlash(rect.top > viewportHeight - 128);
  }, [
    flashSheets.length,
    flashSheetsLoading,
    isRequestModalOpen,
    isRequestTransitioning,
    selectedFlash,
    selectedItem,
    selectedSheet,
  ]);

  useEffect(() => {
    let frameId = 0;

    const scheduleVisibilityCheck = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateFlashCueVisibility);
    };

    scheduleVisibilityCheck();
    window.addEventListener("scroll", scheduleVisibilityCheck, {
      passive: true,
    });
    window.addEventListener("resize", scheduleVisibilityCheck);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", scheduleVisibilityCheck);
      window.removeEventListener("resize", scheduleVisibilityCheck);
    };
  }, [updateFlashCueVisibility]);

  const featuredGalleryItems = useMemo(
    () => galleryItems.slice(0, FEATURED_WORK_LIMIT),
    [galleryItems]
  );
  const selectedItemIndex = selectedItem
    ? featuredGalleryItems.findIndex((item) => item.id === selectedItem.id)
    : -1;
  const canNavigatePortfolio =
    featuredGalleryItems.length > 1 && selectedItemIndex >= 0;

  const refreshPortfolioItem = useCallback(async (itemId: string) => {
    try {
      const itemRef = doc(db, "gallery", itemId);
      const itemSnap = await getDoc(itemRef);
      if (!itemSnap.exists()) return;

      const updatedItem = {
        id: itemSnap.id,
        ...itemSnap.data(),
      } as GalleryItem;

      setSelectedItem((currentItem) => {
        if (!currentItem || currentItem.id !== updatedItem.id) {
          return currentItem;
        }

        if (
          getPortfolioLightboxUrl(updatedItem) !==
            getPortfolioLightboxUrl(currentItem) ||
          getLightboxPreviewUrl(updatedItem) !==
            getLightboxPreviewUrl(currentItem)
        ) {
          setModalLoading(true);
        }

        return updatedItem;
      });
    } catch (err) {
      console.error("Failed to refresh portfolio item:", err);
    }
  }, []);

  useEffect(() => {
    if (!selectedItem) return;

    const updatedItem = featuredGalleryItems.find(
      (item) => item.id === selectedItem.id
    );
    if (!updatedItem) return;

    const hasUpdatedImage =
      getPortfolioLightboxUrl(updatedItem) !==
        getPortfolioLightboxUrl(selectedItem) ||
      getLightboxPreviewUrl(updatedItem) !==
        getLightboxPreviewUrl(selectedItem);
    const hasUpdatedMetadata =
      updatedItem.caption !== selectedItem.caption ||
      JSON.stringify(updatedItem.tags || []) !==
        JSON.stringify(selectedItem.tags || []);

    if (hasUpdatedImage || hasUpdatedMetadata) {
      if (hasUpdatedImage) {
        setModalLoading(true);
      }
      setSelectedItem(updatedItem);
    }
  }, [featuredGalleryItems, selectedItem]);

  const navigatePortfolio = useCallback(
    (direction: SlideDirection) => {
      if (!canNavigatePortfolio) return;

      const offset = direction === "next" ? 1 : -1;
      const nextIndex =
        (selectedItemIndex + offset + featuredGalleryItems.length) %
        featuredGalleryItems.length;

      setSlideDirection(direction);
      const nextItem = featuredGalleryItems[nextIndex];
      setModalLoading(true);
      setSelectedItem(nextItem);
      void refreshPortfolioItem(nextItem.id);
    },
    [
      canNavigatePortfolio,
      featuredGalleryItems,
      refreshPortfolioItem,
      selectedItemIndex,
    ]
  );

  const openPortfolioItem = (item: GalleryItem) => {
    setSlideDirection("next");
    setModalLoading(true);
    setSelectedItem(item);
    void refreshPortfolioItem(item.id);
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
  }, [selectedItem, selectedSheet, navigatePortfolio]);

  const handleSelectSheet = (sheet: FlashSheet) => {
    setFocusedSheet(sheet);
    setSelectedFlash(null);
    window.setTimeout(() => {
      document
        .getElementById("flash-sheet-items")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const handleViewFlashCue = () => {
    setShouldPromptForFlash(false);
    window.requestAnimationFrame(() => {
      flashSectionRef.current?.scrollIntoView({
        behavior: prefersReducedProfileMotion() ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  const handleRequestTattoo = () => {
    if (!client) {
      toast.error("Please sign in as a client before requesting a tattoo.");
      return;
    }

    if (requestOpenTimerRef.current !== null) {
      window.clearTimeout(requestOpenTimerRef.current);
    }

    const shouldOpenImmediately =
      isCompactProfileViewport() || prefersReducedProfileMotion();

    if (shouldOpenImmediately) {
      setIsRequestTransitioning(false);
      setIsRequestModalOpen(true);
      scrollRequestFlowIntoView(requestFlowTopRef, "auto");
      return;
    }

    setIsRequestTransitioning(true);
    requestOpenTimerRef.current = window.setTimeout(() => {
      setIsRequestModalOpen(true);
      setIsRequestTransitioning(false);
      requestOpenTimerRef.current = null;

      scrollRequestFlowIntoView(requestFlowTopRef, "smooth");
    }, 180);
  };

  const handleCloseRequestFlow = () => {
    if (requestOpenTimerRef.current !== null) {
      window.clearTimeout(requestOpenTimerRef.current);
      requestOpenTimerRef.current = null;
    }

    setIsRequestTransitioning(false);
    setIsRequestModalOpen(false);
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
                ? current.likedArtists.filter(
                    (artistId) => artistId !== artist.id
                  )
                : [...new Set([...current.likedArtists, artist.id])],
            }
          : current
      );
      setArtist((current) =>
        current
          ? {
              ...current,
              likedBy: currentlyFollowing
                ? (current.likedBy || []).filter(
                    (clientId) => clientId !== client.id
                  )
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
  const artistBookingAvailabilityLabel = getBookingAvailabilityLabel(
    artist.bookingAvailability,
    ""
  );
  const socialLinks = getArtistSocialLinks(artist);
  const profileBackdropUrl = getProfileBackdropUrl(galleryItems[0]);
  const isRequestFlowActive = isRequestModalOpen || isRequestTransitioning;
  const flashSheetCountLabel = `${flashSheets.length} sheet${
    flashSheets.length === 1 ? "" : "s"
  }`;
  const shouldShowFlashCue =
    shouldPromptForFlash &&
    !isRequestFlowActive &&
    !selectedItem &&
    !selectedSheet &&
    !selectedFlash;

  return (
    <div className="relative isolate mx-auto mt-20 min-h-[80vh] max-w-6xl px-4 py-10">
      {showProfileBackdrop && profileBackdropUrl && (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0d0d0d]">
          <div
            className="absolute inset-[-10%] bg-cover bg-center opacity-[0.5] blur-[15px] saturate-[2]"
            style={{ backgroundImage: `url(${profileBackdropUrl})` }}
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-[#0d0d0d]/82" />
          <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-black/55 to-transparent" />
        </div>
      )}

      <div className="relative z-10">
        <div className="relative isolate mx-auto mb-8 w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.025] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-md sm:p-5 lg:mb-10">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

          <div className="relative z-10 grid gap-5 lg:min-h-[152px] lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-center">
            <div className="flex min-w-0 items-start gap-4 sm:gap-5">
              <div className="relative shrink-0">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 via-white/5 to-transparent blur-md" />
                <img
                  src={artist.avatarUrl || "/fallback-avatar.jpg"}
                  alt={artistDisplayName}
                  decoding="async"
                  className="relative aspect-square h-20 w-20 rounded-full border border-white/15 object-cover shadow-[0_18px_38px_rgba(0,0,0,0.4)] sm:h-32 sm:w-32 md:h-40 md:w-40"
                />
              </div>

              <div className="min-w-0 flex-1 pt-0.5 text-left sm:pt-2 md:pt-4">
                <div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <h1 className="min-w-0 break-words text-2xl! font-semibold leading-tight text-white sm:text-3xl!">
                      {artistDisplayName}
                    </h1>
                    {socialLinks.length > 0 && (
                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        {socialLinks.map((link) => (
                          <a
                            key={link.label}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={link.label}
                            title={link.label}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-white transition duration-300 ease-in-out hover:bg-white/5 hover:text-white/80"
                          >
                            {link.icon}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {artistShopName &&
                    (shop?.mapLink ? (
                      <a
                        href={shop.mapLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex text-sm! font-medium leading-5 text-neutral-200 transition hover:text-white"
                      >
                        {artistShopName}
                      </a>
                    ) : (
                      <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm! font-medium leading-5 text-neutral-300">
                        <MapPin size={14} />
                        {artistShopName}
                      </p>
                    ))}

                  {artistStyles.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 sm:mt-2">
                      {artistStyles.map((style) => (
                        <li
                          key={style}
                          className="inline-flex items-center rounded-full text-[11px] font-semibold leading-4 text-neutral-400"
                        >
                          {style}
                        </li>
                      ))}
                    </ul>
                  )}

                  {artistBookingAvailabilityLabel && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs! font-semibold leading-5 text-neutral-300">
                      <CalendarDays size={14} />
                      {artistBookingAvailabilityLabel}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div
              className={`w-full transition-all duration-300 ease-out lg:justify-self-end ${
                isRequestFlowActive
                  ? "pointer-events-none -translate-y-2 opacity-0 sm:blur-sm"
                  : "translate-y-0 opacity-100 blur-0"
              }`}
              aria-hidden={isRequestFlowActive}
            >
              <ArtistHeaderActionCard
                isFollowingArtist={isFollowingArtist}
                isFollowUpdating={isFollowUpdating}
                isDisabled={isRequestFlowActive}
                onRequestTattoo={handleRequestTattoo}
                onToggleFollow={handleToggleFollow}
              />
            </div>
          </div>
        </div>

        <div
          ref={requestFlowTopRef}
          className="mt-6 scroll-mt-24 pb-60 lg:mt-8"
        >
          {isRequestModalOpen && client ? (
            <RequestTattooModal
              isOpen={isRequestModalOpen}
              onClose={handleCloseRequestFlow}
              client={client}
              artist={{
                id: artist.id,
                name: artistDisplayName,
                avatarUrl: artist.avatarUrl,
                studioName: artistShopName,
              }}
            />
          ) : (
            <div
              className={`satx-profile-work-shell ${
                isRequestTransitioning ? "satx-profile-work-shell--exiting" : ""
              }`}
            >
              <section aria-label="Artist portfolio">
                <PortfolioPanel
                  galleryItems={featuredGalleryItems}
                  galleryLoading={galleryLoading}
                  onOpenItem={openPortfolioItem}
                />
              </section>

              <section
                ref={flashSectionRef}
                aria-labelledby="artist-flash-heading"
                className="mt-10 border-t border-white/10 pt-8"
              >
                <div
                  data-aos="fade-up"
                  className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
                >
                  <h2
                    id="artist-flash-heading"
                    className="my-0! text-2xl! font-semibold! text-white"
                  >
                    Flash
                  </h2>
                  {!flashSheetsLoading && flashSheets.length > 0 && (
                    <span className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-sm text-white/70 sm:self-auto">
                      <Layers size={15} />
                      {flashSheets.length} sheet
                      {flashSheets.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <FlashSheetsPanel
                  flashSheets={flashSheets}
                  flashSheetsLoading={flashSheetsLoading}
                  focusedSheetId={focusedSheet?.id}
                  onOpenSheet={handleSelectSheet}
                />
              </section>

              {focusedSheet && (
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
          )}
        </div>
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
          onRequestTattoo={() => {
            setSelectedItem(null);
            window.requestAnimationFrame(handleRequestTattoo);
          }}
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

      {shouldShowFlashCue && (
        <button
          type="button"
          onClick={handleViewFlashCue}
          className="satx-profile-flash-cue fixed bottom-6 right-6 z-30 hidden items-center gap-3 overflow-hidden rounded-full border border-white/12 bg-[#121212]/88 px-3.5 py-2.5 text-left text-white shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl transition hover:border-white/25 hover:bg-[#181818]/95 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white/60 lg:flex"
          aria-label={`View flash designs, ${flashSheetCountLabel}`}
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.07]">
            <Layers size={15} />
          </span>
          <span className="relative min-w-0 leading-tight">
            <span className="block text-sm font-semibold">Flash available</span>
            <span className="block text-xs text-white/55">
              {flashSheetCountLabel}
            </span>
          </span>
          <ChevronDown className="relative shrink-0 text-white/65" size={16} />
        </button>
      )}
    </div>
  );
};

const ArtistProfilePageSkeleton = () => (
  <div
    className="relative isolate mx-auto mt-20 min-h-[80vh] max-w-6xl px-4 py-10"
    aria-busy="true"
    aria-live="polite"
  >
    <div className="relative z-10">
      <div className="relative isolate mx-auto mb-8 w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.025] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-md sm:p-5 lg:mb-10">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="grid animate-pulse gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <div className="h-24 w-24 shrink-0 rounded-full border border-white/10 bg-white/[0.07] shadow-[0_18px_50px_rgba(0,0,0,0.34)] sm:h-36 sm:w-36" />
            <div className="min-w-0 flex-1">
              <div className="h-8 w-44 max-w-full rounded-md bg-white/[0.1] sm:h-10 sm:w-56" />
              <div className="mt-3 h-4 w-40 max-w-full rounded-full bg-white/[0.075]" />
              <div className="mt-4 flex flex-wrap gap-2">
                {[72, 64, 80].map((width) => (
                  <div
                    key={width}
                    className="h-4 rounded-full bg-white/[0.055]"
                    style={{ width }}
                  />
                ))}
              </div>
              <div className="mt-4 h-4 w-36 rounded-full bg-white/[0.065]" />
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 lg:w-[380px]">
            <div className="h-11 rounded-md border border-white/10 bg-white/[0.075] sm:h-12" />
            <div className="h-11 rounded-md border border-[#19d69b]/25 bg-[#19d69b]/10 sm:h-12" />
          </div>
        </div>
      </div>

      <div className="scroll-mt-24 pb-60">
        <div className="satx-profile-work-shell animate-pulse">
          <PortfolioSkeleton count={3} />
        </div>
      </div>
    </div>

    <span className="sr-only">Loading artist profile</span>
  </div>
);

const ArtistHeaderActionCard = ({
  isFollowingArtist,
  isFollowUpdating,
  isDisabled = false,
  onRequestTattoo,
  onToggleFollow,
}: {
  isFollowingArtist: boolean;
  isFollowUpdating: boolean;
  isDisabled?: boolean;
  onRequestTattoo: () => void;
  onToggleFollow: () => void;
}) => (
  <div className="grid w-full grid-cols-2 gap-2 lg:w-[380px]">
    <button
      type="button"
      onClick={onRequestTattoo}
      disabled={isDisabled}
      className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.075] px-2 py-2.5 text-[0.7rem]! font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-white/20 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-12 sm:gap-2 sm:px-4 sm:text-sm!"
    >
      <MessageCircle size={16} />
      <span className="sm:hidden">Send idea</span>
      <span className="hidden sm:inline">Send your idea</span>
    </button>
    <button
      type="button"
      onClick={onToggleFollow}
      disabled={isDisabled || isFollowUpdating}
      className={`inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border px-2 py-2.5 text-[0.7rem]! font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-12 sm:gap-2 sm:px-4 sm:text-sm! ${
        isFollowingArtist
          ? "border-[#19d69b]/45 bg-[#19d69b]/12 text-white hover:bg-[#19d69b]/18"
          : "border-white/10 bg-black/25 text-white hover:border-white/20 hover:bg-white/[0.08]"
      }`}
    >
      <Heart
        size={16}
        className={isFollowingArtist ? "fill-[#19d69b] text-[#19d69b]" : ""}
      />
      {isFollowingArtist ? (
        "Following"
      ) : (
        <>
          <span className="sm:hidden">Follow</span>
          <span className="hidden sm:inline">Follow</span>
        </>
      )}
    </button>
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

const getProfileBackdropUrl = (item?: GalleryItem) =>
  item?.thumbUrl || item?.webp90Url || "";

const canShowProfileBackdrop = () =>
  typeof window !== "undefined" &&
  window.matchMedia(profileBackdropMediaQuery).matches;

const isCompactProfileViewport = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(max-width: 767px)").matches;

const prefersReducedProfileMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const scrollRequestFlowIntoView = (
  targetRef: { current: HTMLDivElement | null },
  behavior: ScrollBehavior
) => {
  window.requestAnimationFrame(() => {
    targetRef.current?.scrollIntoView({
      behavior,
      block: "start",
    });
  });
};

const getLightboxPreviewUrl = (item: GalleryItem) =>
  item.webp90Url ||
  item.thumbUrl ||
  item.fullUrl ||
  item.originalWebp90Url ||
  "";

const getPortfolioLightboxUrl = (item: GalleryItem) =>
  item.originalWebp90Url || item.fullUrl || item.webp90Url || item.thumbUrl;

const getSheetPreviewUrl = (sheet: FlashSheet) =>
  sheet.thumbUrl || sheet.imageUrl;

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
  return /^https?:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;
};

const preloadImage = (src?: string) => {
  if (!src) return;
  const image = new Image();
  image.src = src;
};

const getPortfolioItemsPerPage = () => {
  if (typeof window === "undefined") return 3;
  if (window.matchMedia("(min-width: 1024px)").matches) return 3;
  if (window.matchMedia("(min-width: 640px)").matches) return 2;
  return 1;
};

const getPortfolioPageItems = (
  galleryItems: GalleryItem[],
  pageIndex: number,
  itemsPerPage: number
) => {
  const startIndex = pageIndex * itemsPerPage;
  return galleryItems.slice(startIndex, startIndex + itemsPerPage);
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
  const [itemsPerPage, setItemsPerPage] = useState(getPortfolioItemsPerPage);
  const [pageIndex, setPageIndex] = useState(0);
  const [previousItems, setPreviousItems] = useState<GalleryItem[] | null>(
    null
  );
  const [transitionDirection, setTransitionDirection] =
    useState<SlideDirection>("next");
  const fadeTimerRef = useRef<number | null>(null);
  const mobileRailRef = useRef<HTMLDivElement | null>(null);
  const [mobileActiveIndex, setMobileActiveIndex] = useState(0);
  const pageCount = Math.max(1, Math.ceil(galleryItems.length / itemsPerPage));
  const visibleItems = getPortfolioPageItems(
    galleryItems,
    pageIndex,
    itemsPerPage
  );
  const transitionSlotCount = previousItems
    ? Math.max(visibleItems.length, previousItems.length)
    : visibleItems.length;
  const isTransitioning = Boolean(previousItems);

  useEffect(() => {
    const handleResize = () => {
      setItemsPerPage(getPortfolioItemsPerPage());
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    galleryItems.forEach((item) => preloadImage(getCardPreviewUrl(item)));
  }, [galleryItems]);

  const updateMobileActiveIndex = useCallback(() => {
    const rail = mobileRailRef.current;
    if (!rail) return;

    const items = Array.from(
      rail.querySelectorAll<HTMLElement>("[data-portfolio-snap-item]")
    );
    if (items.length === 0) return;

    const railCenter = rail.scrollLeft + rail.clientWidth / 2;
    const nextIndex = items.reduce((closestIndex, item, index) => {
      const closestItem = items[closestIndex];
      const itemCenter = item.offsetLeft + item.offsetWidth / 2;
      const closestCenter =
        closestItem.offsetLeft + closestItem.offsetWidth / 2;

      return Math.abs(itemCenter - railCenter) <
        Math.abs(closestCenter - railCenter)
        ? index
        : closestIndex;
    }, 0);

    setMobileActiveIndex((current) =>
      current === nextIndex ? current : nextIndex
    );
  }, []);

  useEffect(() => {
    setMobileActiveIndex(0);
    mobileRailRef.current?.scrollTo({ left: 0 });
  }, [galleryItems]);

  useEffect(() => {
    const rail = mobileRailRef.current;
    if (!rail) return;

    let frameId: number | null = null;
    const queueUpdate = () => {
      if (frameId !== null) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateMobileActiveIndex();
      });
    };

    queueUpdate();
    rail.addEventListener("scroll", queueUpdate, { passive: true });
    window.addEventListener("resize", queueUpdate);

    return () => {
      rail.removeEventListener("scroll", queueUpdate);
      window.removeEventListener("resize", queueUpdate);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [galleryItems.length, updateMobileActiveIndex]);

  useEffect(() => {
    if (!previousItems) return;

    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
    }

    const transitionedItemCount = Math.max(
      visibleItems.length,
      previousItems.length
    );
    const fadeOutPhaseTime =
      PORTFOLIO_FADE_DURATION_MS +
      Math.max(0, transitionedItemCount - 1) * PORTFOLIO_FADE_STAGGER_MS;
    const fadeSettleTime =
      fadeOutPhaseTime +
      PORTFOLIO_FADE_PHASE_GAP_MS +
      fadeOutPhaseTime +
      PORTFOLIO_FADE_SETTLE_BUFFER_MS;

    fadeTimerRef.current = window.setTimeout(() => {
      setPreviousItems(null);
      fadeTimerRef.current = null;
    }, fadeSettleTime);

    return () => {
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
  }, [previousItems, visibleItems.length]);

  if (galleryLoading) return <PortfolioSkeleton count={3} />;

  if (galleryItems.length === 0) {
    return (
      <EmptyWorkState
        title="No portfolio pieces yet"
        message="This artist has not published gallery work to their public portfolio."
      />
    );
  }

  const goToPage = (nextPageIndex: number, direction: SlideDirection) => {
    if (isTransitioning || pageCount <= 1 || nextPageIndex === pageIndex)
      return;

    setPreviousItems(visibleItems);
    setTransitionDirection(direction);
    setPageIndex(nextPageIndex);
  };

  const goToNextPage = () => {
    goToPage((pageIndex + 1) % pageCount, "next");
  };

  const goToPreviousPage = () => {
    goToPage((pageIndex - 1 + pageCount) % pageCount, "prev");
  };

  const scrollToMobileItem = (index: number) => {
    const rail = mobileRailRef.current;
    if (!rail) return;

    const items = Array.from(
      rail.querySelectorAll<HTMLElement>("[data-portfolio-snap-item]")
    );
    const item = items[index];
    if (!item) return;

    item.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "start",
    });
    setMobileActiveIndex(index);
  };

  const arrowButtonClassName =
    "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-0! text-white shadow-[0_14px_38px_rgba(0,0,0,0.28)] backdrop-blur-md transition hover:border-white/25 hover:bg-white/[0.1] disabled:pointer-events-none disabled:opacity-45";

  const desktopPageDots = (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: pageCount }).map((_, index) => (
        <button
          key={index}
          type="button"
          onClick={() => goToPage(index, index > pageIndex ? "next" : "prev")}
          disabled={isTransitioning}
          className={`h-2.5 rounded-full p-0! transition ${
            index === pageIndex
              ? "w-8 bg-white"
              : "w-2.5 bg-white/25 hover:bg-white/45 disabled:hover:bg-white/25"
          }`}
          aria-label={`Show portfolio page ${index + 1}`}
          aria-current={index === pageIndex ? "page" : undefined}
        />
      ))}
    </div>
  );

  const mobileDots = (
    <div className="mt-4 flex items-center justify-center gap-2 sm:hidden">
      {galleryItems.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => scrollToMobileItem(index)}
          className={`h-2.5 rounded-full p-0! transition ${
            index === mobileActiveIndex
              ? "w-8 bg-white"
              : "w-2.5 bg-white/25 hover:bg-white/45"
          }`}
          aria-label={`Show portfolio item ${index + 1}`}
          aria-current={index === mobileActiveIndex ? "true" : undefined}
        />
      ))}
    </div>
  );

  return (
    <div className="satx-profile-work-carousel">
      <div className="relative">
        {pageCount > 1 && (
          <button
            type="button"
            onClick={goToPreviousPage}
            disabled={isTransitioning}
            className={`${arrowButtonClassName} absolute -left-14 top-1/2 z-10 hidden -translate-y-1/2 xl:flex`}
            aria-label="Previous portfolio page"
          >
            <ChevronLeft size={18} />
          </button>
        )}

        <div
          ref={mobileRailRef}
          className="-mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-3 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex gap-4">
            {galleryItems.map((item, index) => (
              <div
                key={item.id}
                data-portfolio-snap-item
                className="w-[min(28rem,calc(100vw-3rem))] shrink-0 snap-start [scroll-snap-stop:always]"
              >
                <PortfolioCard
                  item={item}
                  priority={index === 0}
                  onOpen={() => onOpenItem(item)}
                />
              </div>
            ))}
          </div>
        </div>

        <div
          className={`satx-profile-work-carousel-grid satx-profile-work-grid hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3 ${
            isTransitioning ? "satx-profile-work-carousel-grid--fading" : ""
          }`}
          data-direction={transitionDirection}
        >
          {Array.from({ length: transitionSlotCount }).map((_, index) => {
            const item = visibleItems[index];
            const previousItem = previousItems?.[index];
            const isSlotTransitioning = Boolean(
              previousItems && item?.id !== previousItem?.id
            );
            const transitionOrder =
              transitionDirection === "next"
                ? index
                : Math.max(0, transitionSlotCount - 1 - index);
            const fadeOutDelay = transitionOrder * PORTFOLIO_FADE_STAGGER_MS;
            const fadeInDelay =
              PORTFOLIO_FADE_DURATION_MS +
              Math.max(0, transitionSlotCount - 1) * PORTFOLIO_FADE_STAGGER_MS +
              PORTFOLIO_FADE_PHASE_GAP_MS +
              fadeOutDelay;

            return (
              <div
                key={`${pageIndex}-${item?.id || previousItem?.id || index}`}
                className={`satx-profile-work-fade-slot ${
                  isSlotTransitioning
                    ? "satx-profile-work-fade-slot--active"
                    : ""
                }`}
                style={
                  {
                    "--satx-fade-out-delay": `${fadeOutDelay}ms`,
                    "--satx-fade-in-delay": `${fadeInDelay}ms`,
                  } as CSSProperties
                }
              >
                {isSlotTransitioning && previousItem && (
                  <div className="satx-profile-work-card-face satx-profile-work-card-face--previous">
                    <PortfolioCard
                      item={previousItem}
                      priority={false}
                      disableImageFade
                      onOpen={() => onOpenItem(previousItem)}
                    />
                  </div>
                )}
                {item && (
                  <div className="satx-profile-work-card-face satx-profile-work-card-face--current">
                    <PortfolioCard
                      item={item}
                      priority={pageIndex === 0 && index === 0}
                      disableImageFade={isTransitioning}
                      onOpen={() => onOpenItem(item)}
                    />
                  </div>
                )}
                {!item && previousItem && (
                  <div
                    className="satx-profile-work-card-face satx-profile-work-card-face--current satx-profile-work-card-face--placeholder"
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
        </div>

        {pageCount > 1 && (
          <button
            type="button"
            onClick={goToNextPage}
            disabled={isTransitioning}
            className={`${arrowButtonClassName} absolute -right-14 top-1/2 z-10 hidden -translate-y-1/2 xl:flex`}
            aria-label="Next portfolio page"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      {galleryItems.length > 1 && mobileDots}

      {pageCount > 1 && (
        <div className="mt-4 hidden items-center justify-between gap-3 sm:flex xl:justify-center">
          <button
            type="button"
            onClick={goToPreviousPage}
            disabled={isTransitioning}
            className={`${arrowButtonClassName} xl:hidden`}
            aria-label="Previous portfolio page"
          >
            <ChevronLeft size={18} />
          </button>

          {desktopPageDots}

          <button
            type="button"
            onClick={goToNextPage}
            disabled={isTransitioning}
            className={`${arrowButtonClassName} xl:hidden`}
            aria-label="Next portfolio page"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
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
    <div className="satx-profile-work-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

const PortfolioSkeleton = ({ count = 6 }: { count?: number }) => (
  <>
    <div className="-mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-hidden px-4 pb-3 sm:hidden">
      <div className="flex gap-4">
        {Array.from({ length: Math.max(2, Math.min(count, 3)) }).map(
          (_, index) => (
            <div
              key={index}
              className="h-[28rem] w-[min(28rem,calc(100vw-3rem))] shrink-0 snap-start animate-pulse rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.035] to-transparent"
            />
          )
        )}
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        {Array.from({ length: Math.max(2, Math.min(count, 6)) }).map(
          (_, index) => (
            <span
              key={index}
              className={`h-2.5 rounded-full ${
                index === 0 ? "w-8 bg-white/80" : "w-2.5 bg-white/25"
              }`}
            />
          )
        )}
      </div>
    </div>

    <div className="hidden grid-cols-2 gap-4 sm:grid lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-[320px] animate-pulse rounded-xl border border-white/10 bg-white/[0.04]"
        />
      ))}
    </div>
  </>
);

const PortfolioCard = ({
  item,
  priority,
  disableImageFade = false,
  onOpen,
}: {
  item: GalleryItem;
  priority: boolean;
  disableImageFade?: boolean;
  onOpen: () => void;
}) => (
  <button
    type="button"
    onClick={onOpen}
    onMouseEnter={() => preloadImage(getPortfolioLightboxUrl(item))}
    onFocus={() => preloadImage(getPortfolioLightboxUrl(item))}
    className={`group relative block w-full overflow-hidden rounded-xl border border-white/10 bg-[#111] p-0! text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition duration-300 hover:border-white/25 hover:shadow-[0_22px_70px_rgba(0,0,0,0.45)] ${
      priority ? "sm:col-span-2 lg:col-span-1" : ""
    }`}
  >
    <div className="relative aspect-[4/5] overflow-hidden bg-black">
      <FadeInImage
        src={getCardPreviewUrl(item)}
        alt={item.caption || "Tattoo portfolio piece"}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        loading={priority ? "eager" : "lazy"}
        disableFade={disableImageFade}
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
    } ${priority ? "sm:col-span-2 lg:col-span-1" : ""}`}
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
  disableFade = false,
}: {
  src: string;
  alt: string;
  className: string;
  loading?: "eager" | "lazy";
  disableFade?: boolean;
}) => {
  const [loaded, setLoaded] = useState(disableFade);
  const previousSrcRef = useRef(src);

  useEffect(() => {
    if (previousSrcRef.current !== src) {
      previousSrcRef.current = src;
      setLoaded(disableFade);
      return;
    }

    if (disableFade) {
      setLoaded(true);
    }
  }, [src, disableFade]);

  const isVisible = disableFade || loaded;

  return (
    <>
      {!disableFade && (
        <div
          className={`absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,0.04),rgba(255,255,255,0.11),rgba(255,255,255,0.04))] bg-[length:220%_100%] transition-opacity duration-300 ${
            loaded ? "opacity-0" : "opacity-100 animate-pulse"
          }`}
        />
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} ${isVisible ? "opacity-100" : "opacity-0"}`}
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
  onRequestTattoo,
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
  onRequestTattoo: () => void;
  onClose: () => void;
}) => {
  const slideClass =
    slideDirection === "next"
      ? "portfolio-slide-in-next"
      : "portfolio-slide-in-prev";
  const artistName = getArtistDisplayName(artist);
  const pieceTitle = item.caption || "Untitled piece";
  const hasTags = Array.isArray(item.tags) && item.tags.length > 0;
  const metaAnimationClass =
    slideDirection === "next"
      ? "portfolio-meta-in-next"
      : "portfolio-meta-in-prev";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/90 px-4 pb-6 pt-[calc(5.75rem+env(safe-area-inset-top))] backdrop-blur-md md:px-8 md:pb-10 md:pt-28"
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

      <div
        className="mx-auto flex w-full max-w-6xl flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-end md:hidden">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] p-0! text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
            onClick={onClose}
            aria-label="Close portfolio image"
          >
            <X size={18} />
          </button>
        </div>

        <div className="hidden items-center justify-between gap-5 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-md md:flex">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={artist.avatarUrl || "/default-avatar.png"}
              alt={artistName}
              className="h-11 w-11 rounded-full border border-white/20 object-cover shadow-[0_10px_28px_rgba(0,0,0,0.32)]"
            />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                Artist
              </p>
              <p className="mt-0.5 truncate text-sm! font-semibold! leading-tight text-white">
                {artistName}
              </p>
            </div>
          </div>

          <div
            key={`desktop-${item.id}`}
            className={`${metaAnimationClass} min-w-0 flex-1 text-center`}
          >
            <p className="text-xs uppercase tracking-[0.18em] text-white/35">
              Portfolio piece
            </p>
            <h1 className="mx-auto mt-1 max-w-2xl truncate text-xl! font-semibold! leading-tight text-white">
              {pieceTitle}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRequestTattoo();
              }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.075] px-4! py-0! text-sm! font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-white/20 hover:bg-white/[0.12]"
            >
              <MessageCircle size={16} />
              Send your idea
            </button>
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.07] p-0! text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
              onClick={onClose}
              aria-label="Close portfolio image"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-5xl">
          <LightboxImageFrame
            imageKey={`${item.id}-${getPortfolioLightboxUrl(item)}`}
            fullUrl={getPortfolioLightboxUrl(item)}
            previewUrl={getLightboxPreviewUrl(item)}
            alt={item.caption || "Full portfolio view"}
            isLoading={modalLoading}
            loadingLabel="Loading portfolio piece"
            slideClass={slideClass}
            frameClassName="h-[min(56dvh,34rem)] w-full md:h-[min(68vh,760px)]"
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
                className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/50 p-0! text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
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
                className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/50 p-0! text-white shadow-lg backdrop-blur-md transition hover:bg-white/15"
                aria-label="Next portfolio image"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}
        </div>

        {hasTags && (
          <div
            key={`desktop-tags-${item.id}`}
            className={`${metaAnimationClass} hidden justify-center md:flex`}
          >
            <TagMarqueeModal tags={item.tags || []} compact />
          </div>
        )}

        <div
          key={`mobile-${item.id}`}
          className={`${metaAnimationClass} rounded-xl border border-white/10 bg-white/[0.035] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-md md:hidden`}
        >
          <div className="flex items-center gap-3">
            <img
              src={artist.avatarUrl || "/default-avatar.png"}
              alt={artistName}
              className="h-12 w-12 rounded-full border border-white/20 object-cover shadow-[0_10px_28px_rgba(0,0,0,0.32)]"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Artist
              </p>
              <p className="mt-0.5 truncate text-sm! font-semibold! leading-tight text-white">
                {artistName}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
              Portfolio piece
            </p>
            <h1 className="mt-1 text-xl! font-semibold! leading-tight text-white">
              {pieceTitle}
            </h1>
          </div>

          {hasTags && (
            <div className="mt-4">
              <TagMarqueeModal tags={item.tags || []} compact />
            </div>
          )}

          {modalLoading && (
            <div className="mt-4 space-y-2">
              <div className="h-2 w-28 animate-pulse rounded-full bg-white/10" />
              <div className="h-2 w-40 animate-pulse rounded-full bg-white/10" />
            </div>
          )}

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRequestTattoo();
            }}
            className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.075] px-4! py-3! text-sm! font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-white/20 hover:bg-white/[0.12]"
          >
            <MessageCircle size={16} />
            Send your idea
          </button>
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
  frameClassName,
  onImageLoad,
}: {
  imageKey: string;
  fullUrl: string;
  previewUrl: string;
  alt: string;
  isLoading: boolean;
  loadingLabel: string;
  slideClass?: string;
  frameClassName?: string;
  onImageLoad: () => void;
}) => {
  const fullImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = fullImageRef.current;
    if (!image) return;

    if (image.complete) {
      onImageLoad();
      return;
    }

    const timeoutId = window.setTimeout(onImageLoad, 8000);
    return () => window.clearTimeout(timeoutId);
  }, [fullUrl, imageKey, onImageLoad]);

  return (
    <div
      className={`relative flex ${
        frameClassName || "h-[min(72vh,760px)] w-[min(94vw,940px)]"
      } items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#080808] shadow-2xl`}
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
          ref={fullImageRef}
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
};

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
    `I would like to request this flash design: ${
      flash.title || "Untitled flash"
    }.`
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
      toast.error(
        "Latest date must be the same day or after the earliest date."
      );
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
        clientFirstName: client.firstName || "",
        clientLastName: client.lastName || "",
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
        flashDescription: latestFlash.description || null,
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
              {flash.description && (
                <p className="mt-4 rounded-lg border border-white/10 bg-black/25 p-3 text-sm leading-6 text-white/70">
                  {flash.description}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {!client && (
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                Sign in as a client to send this request.
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-sm text-white/70">Message</span>
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
                <span className="mb-1 block text-sm text-white/70">From</span>
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
          <span
            key={`${tag}-${idx}`}
            className="mx-3 text-xs font-medium text-white"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};
