import {
  type CSSProperties,
  type FC,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  ImageOff,
  Quote,
  Search,
  Sparkles,
  Store,
} from "lucide-react";
import CountUp from "react-countup";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import heroImage from "../assets/images/inkhero.webp";
import type { Flash } from "../types/Flash";
import type { FlashSheet } from "../types/FlashSheet";
import { FEATURED_TATTOO_STYLES } from "../types/TattooStyle";
import {
  isStripeConnectReady,
  type StripeConnectLike,
} from "../utils/stripeConnect";
import {
  getBookingAvailabilityMonthKeys,
  getRollingBookingMonthOptions,
  type BookingAvailability,
} from "../utils/bookingAvailability";
import { isFlashAvailableForClients } from "../utils/flashAvailability";
import {
  FlashPreviewImage,
  FlashPreviewMeta,
} from "../components/FlashPreviewCard";
import { flashPreviewCardClassName } from "../utils/flashPreview";

type PublicArtist = {
  id: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  shopId?: string;
  shopName?: string;
  studioName?: string;
  specialties?: string[];
  bookingAvailability?: BookingAvailability;
  homepageFeature?: {
    story?: string;
    quote?: string;
    imageUrl?: string;
    imageAlt?: string;
    images?: PublicHomepageFeatureImage[];
    updatedAt?: unknown;
  };
  role?: string;
  isVerified?: boolean | "true" | "false";
} & StripeConnectLike;

type PublicHomepageFeatureImage = {
  id?: string;
  imageUrl?: string;
  thumbUrl?: string | null;
  webp90Url?: string | null;
  fullUrl?: string | null;
  imageAlt?: string;
  order?: number;
};

type HomeFlash = Flash & {
  artist?: PublicArtist;
};

type HomeFlashSheet = FlashSheet & {
  artist?: PublicArtist;
};

type FeaturedPreviewItem = {
  id: string;
  href: string;
  imageUrl: string;
  label: string;
  type: "flash" | "sheet";
};

type FeaturedArtistSlide = {
  id: string;
  url: string;
  previewUrl: string;
  alt: string;
};

type ShopLookup = {
  id: string;
  name?: string;
};

const featuredStyles = FEATURED_TATTOO_STYLES;

const HOME_FLASH_FETCH_LIMIT = 24;
const HOME_SHEET_FETCH_LIMIT = 10;
const HOME_BOOKING_ARTIST_FETCH_LIMIT = 48;
const HOME_BOOKING_ARTIST_DISPLAY_LIMIT = 3;
const HERO_FEATURED_ARTIST_SLIDE_DELAY_MS = 5200;
const loadedFeaturedArtistSlideUrls = new Set<string>();

function useViewportEntry<T extends Element>() {
  const targetRef = useRef<T | null>(null);
  const hasEnteredRef = useRef(false);
  const [entryCount, setEntryCount] = useState(0);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasEnteredRef.current) {
          hasEnteredRef.current = true;
          setEntryCount((count) => count + 1);
          observer.disconnect();
        }
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.35,
      }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, []);

  return { targetRef, entryCount };
}

function useElementVisibility<T extends Element>({
  rootMargin = "0px",
  threshold = 0,
  initialValue = true,
}: {
  rootMargin?: string;
  threshold?: number;
  initialValue?: boolean;
} = {}) {
  const targetRef = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(initialValue);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin, threshold }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return { targetRef, isVisible };
}

function usePageVisibility() {
  const [isPageVisible, setIsPageVisible] = useState(true);

  useEffect(() => {
    const syncVisibility = () =>
      setIsPageVisible(document.visibilityState === "visible");

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    return () =>
      document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  return isPageVisible;
}

export const HomePage: FC = () => {
  const { targetRef: heroCopyRef, entryCount: heroCopyEntryCount } =
    useViewportEntry<HTMLDivElement>();
  const { targetRef: heroStatsRef, entryCount: heroStatsEntryCount } =
    useViewportEntry<HTMLDListElement>();
  const { targetRef: styleSectionRef, entryCount: styleSectionEntryCount } =
    useViewportEntry<HTMLDivElement>();
  const {
    targetRef: marketplaceSectionRef,
    entryCount: marketplaceSectionEntryCount,
  } = useViewportEntry<HTMLElement>();
  const [flashes, setFlashes] = useState<HomeFlash[]>([]);
  const [sheets, setSheets] = useState<HomeFlashSheet[]>([]);
  const [featuredArtist, setFeaturedArtist] = useState<PublicArtist | null>(
    null
  );
  const [featuredPreviewItems, setFeaturedPreviewItems] = useState<
    FeaturedPreviewItem[]
  >([]);
  const [bookingArtists, setBookingArtists] = useState<PublicArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDesktopHeroImageReady, setIsDesktopHeroImageReady] = useState(false);
  const [isFeaturedArtistPanelRevealed, setIsFeaturedArtistPanelRevealed] =
    useState(false);

  useEffect(() => {
    let isCancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.src = heroImage;

    const markReady = () => {
      if (!isCancelled) setIsDesktopHeroImageReady(true);
    };

    if (image.decode) {
      image.decode().then(markReady).catch(markReady);
    } else {
      image.onload = markReady;
      image.onerror = markReady;
    }

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchHomePreview = async () => {
      try {
        setLoading(true);
        const currentBookingMonthKey = getRollingBookingMonthOptions()[0]?.key;

        const [
          flashSnapshot,
          sheetSnapshot,
          homepageSettingsSnap,
          currentMonthBookingArtistsSnapshot,
          fallbackBookingArtistsSnapshot,
        ] = await Promise.all([
            getDocs(
              query(collection(db, "flashes"), limit(HOME_FLASH_FETCH_LIMIT))
            ),
            getDocs(
              query(
                collection(db, "flashSheets"),
                limit(HOME_SHEET_FETCH_LIMIT)
              )
            ),
            getDoc(doc(db, "siteSettings", "homepage")),
            currentBookingMonthKey
              ? getDocs(
                  query(
                    collection(db, "users"),
                    where(
                      "bookingAvailability.monthKeys",
                      "array-contains",
                      currentBookingMonthKey
                    ),
                    limit(HOME_BOOKING_ARTIST_FETCH_LIMIT)
                  )
                )
              : Promise.resolve(null),
            getDocs(
              query(
                collection(db, "users"),
                where("role", "==", "artist"),
                limit(HOME_BOOKING_ARTIST_FETCH_LIMIT)
              )
            ),
          ]);
        const homepageSettings = homepageSettingsSnap.data();
        const featuredArtistId =
          typeof homepageSettings?.featuredArtistId === "string"
            ? homepageSettings.featuredArtistId
            : "";

        const rawFlashes = flashSnapshot.docs
          .map((flashDoc) => ({
            id: flashDoc.id,
            ...flashDoc.data(),
          }))
          .filter((flash): flash is Flash => {
            const typedFlash = flash as Flash;
            return Boolean(
              typedFlash.artistId &&
                isFlashAvailableForClients(typedFlash) &&
                (typedFlash.thumbUrl ||
                  typedFlash.webp90Url ||
                  typedFlash.fullUrl)
            );
          });

        const rawSheets = sheetSnapshot.docs
          .map((sheetDoc) => ({
            id: sheetDoc.id,
            ...sheetDoc.data(),
          }))
          .filter((sheet): sheet is FlashSheet => {
            const typedSheet = sheet as FlashSheet;
            return Boolean(typedSheet.artistId && typedSheet.imageUrl);
          });

        const artistIds = Array.from(
          new Set(
            [...rawFlashes, ...rawSheets]
              .map((item) => item.artistId)
              .concat(featuredArtistId ? [featuredArtistId] : [])
              .filter(Boolean)
          )
        );

        const artistsById = await fetchArtistsById(artistIds);
        const readyBookingArtists = await getHomepageBookingArtists(
          getUniqueDocsById([
            ...(currentMonthBookingArtistsSnapshot?.docs ?? []),
            ...fallbackBookingArtistsSnapshot.docs,
          ])
            .map((artistDoc) => ({
              id: artistDoc.id,
              ...artistDoc.data(),
            }))
            .filter(isVisiblePublicArtist)
        );

        if (!isMounted) return;

        const readyFlashes = shuffleItems(
          rawFlashes
            .map((flash) => ({
              ...flash,
              artist: artistsById[flash.artistId],
            }))
            .filter(isMarketplaceReady)
        ).slice(0, 5);

        const readySheets = shuffleItems(
          rawSheets
            .map((sheet) => ({
              ...sheet,
              artist: artistsById[sheet.artistId],
            }))
            .filter(isMarketplaceReady)
        ).slice(0, 5);

        const selectedFeaturedArtist = featuredArtistId
          ? artistsById[featuredArtistId] || null
          : null;
        const featuredPreviews = selectedFeaturedArtist
          ? getFeaturedPreviewItems(
              rawFlashes
                .map((flash) => ({
                  ...flash,
                  artist: artistsById[flash.artistId],
                }))
                .filter(isMarketplaceReady),
              rawSheets
                .map((sheet) => ({
                  ...sheet,
                  artist: artistsById[sheet.artistId],
                }))
                .filter(isMarketplaceReady),
              selectedFeaturedArtist.id
            )
          : [];

        setFlashes(readyFlashes);
        setSheets(readySheets);
        setFeaturedArtist(selectedFeaturedArtist);
        setFeaturedPreviewItems(featuredPreviews);
        setBookingArtists(readyBookingArtists);
      } catch (err) {
        console.error("Failed to fetch homepage preview data:", err);
        if (isMounted) {
          setFlashes([]);
          setSheets([]);
          setFeaturedArtist(null);
          setFeaturedPreviewItems([]);
          setBookingArtists([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHomePreview();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const delay = prefersReducedMotion ? 0 : 800;
    const timeoutId = window.setTimeout(
      () => setIsFeaturedArtistPanelRevealed(true),
      delay
    );

    return () => window.clearTimeout(timeoutId);
  }, []);

  const heroStats = useMemo(
    () => [
      { label: "Styles to explore", value: featuredStyles.length, suffix: "+" },
      {
        label: "Flash previews",
        value: flashes.length,
        loading,
      },
      {
        label: "Flash sheets",
        value: sheets.length,
        loading,
      },
    ],
    [flashes.length, loading, sheets.length]
  );
  const bookingMonthOptions = useMemo(() => getRollingBookingMonthOptions(), []);
  const hasBookingArtistsThisMonth = bookingArtists.some((artist) =>
    artistHasBookingMonth(artist, bookingMonthOptions[0]?.key)
  );
  const hasBookingArtistsWithAvailability = bookingArtists.some(
    artistHasBookingAvailability
  );
  const bookingSectionCopy = hasBookingArtistsThisMonth
    ? {
        eyebrow: "Open books",
        title: "Artists ready to receive your ideas.",
        body: "Explore San Antonio artists with current availability, then open a profile when someone feels like the right fit.",
      }
    : hasBookingArtistsWithAvailability
      ? {
          eyebrow: "Booking soon",
          title: "Artists with books open soon.",
          body: "Availability shifts month to month. Start with artists who have upcoming booking windows listed on their profiles.",
        }
      : {
          eyebrow: "Local artists",
          title: "Artists taking requests.",
          body: "Browse artist profiles, compare shop details, and start a request from the profile that fits your idea.",
        };
  const isHeroCopyRevealed = heroCopyEntryCount > 0;
  const isStyleSectionRevealed = styleSectionEntryCount > 0;
  const isMarketplaceSectionRevealed = marketplaceSectionEntryCount > 0;

  return (
    <main className="bg-[#0d0d0d] text-white">
      <style>
        {`
          .satx-home-hero-fixed-image {
            position: absolute;
            inset: -12px;
            background-position: center center;
            background-repeat: no-repeat;
            background-size: cover;
            opacity: 0;
            filter: blur(3px);
            transform: scale(1.03);
            transform-origin: center;
            backface-visibility: hidden;
            contain: paint;
            transition: opacity 420ms ease;
            will-change: opacity;
          }

          .satx-home-hero-fixed-image--ready {
            opacity: 0.8;
          }

          .satx-home-hero-mobile-scrim {
            background:
              radial-gradient(circle at 72% 30%, rgba(255, 255, 255, 0.12), transparent 32%),
              linear-gradient(90deg, rgba(0, 0, 0, 0.94), rgba(0, 0, 0, 0.58), rgba(0, 0, 0, 0.86));
          }

          @media (min-width: 1024px) {
            .satx-home-hero-copy {
              align-self: start;
              padding-top: clamp(13.5rem, 24svh, 17rem);
            }
          }

          @keyframes satx-hero-headline-enter {
            from {
              opacity: 0;
              clip-path: inset(0 0 100% 0 round 0.25rem);
              transform: translate3d(0, 22px, 0) scale(0.985);
              filter: blur(10px);
            }

            to {
              opacity: 1;
              clip-path: inset(0 0 0 0 round 0.25rem);
              transform: translate3d(0, 0, 0) scale(1);
              filter: blur(0);
            }
          }

          @keyframes satx-hero-body-enter {
            from {
              opacity: 0;
              transform: translate3d(-18px, 14px, 0);
              filter: blur(7px);
            }

            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
              filter: blur(0);
            }
          }

          @keyframes satx-hero-action-enter {
            from {
              opacity: 0;
              transform: translate3d(0, 16px, 0) scale(0.96);
              filter: blur(6px);
            }

            to {
              opacity: 1;
              transform: translate3d(0, 0, 0) scale(1);
              filter: blur(0);
            }
          }

          @keyframes satx-hero-stat-enter {
            from {
              opacity: 0;
              transform: translate3d(0, 18px, 0) scale(0.92);
              filter: blur(6px);
            }

            to {
              opacity: 1;
              transform: translate3d(0, 0, 0) scale(1);
              filter: blur(0);
            }
          }

          .satx-home-copy-motion {
            opacity: 0;
            will-change: opacity, transform, filter, clip-path;
          }

          .satx-home-hero-copy[data-revealed="true"] .satx-home-copy-motion--headline {
            animation: satx-hero-headline-enter 860ms cubic-bezier(0.16, 1, 0.3, 1) 120ms both;
          }

          .satx-home-hero-copy[data-revealed="true"] .satx-home-copy-motion--body {
            animation: satx-hero-body-enter 720ms cubic-bezier(0.2, 0.86, 0.24, 1) 300ms both;
          }

          .satx-home-hero-copy[data-revealed="true"] .satx-home-copy-motion--actions {
            animation: satx-hero-action-enter 680ms cubic-bezier(0.18, 0.9, 0.2, 1) 470ms both;
          }

          .satx-home-hero-copy[data-revealed="true"] .satx-home-copy-motion--stat-0 {
            animation: satx-hero-stat-enter 620ms cubic-bezier(0.2, 0.86, 0.24, 1) 650ms both;
          }

          .satx-home-hero-copy[data-revealed="true"] .satx-home-copy-motion--stat-1 {
            animation: satx-hero-stat-enter 620ms cubic-bezier(0.2, 0.86, 0.24, 1) 780ms both;
          }

          .satx-home-hero-copy[data-revealed="true"] .satx-home-copy-motion--stat-2 {
            animation: satx-hero-stat-enter 620ms cubic-bezier(0.2, 0.86, 0.24, 1) 910ms both;
          }

          @keyframes satx-style-kicker-enter {
            from {
              opacity: 0;
              letter-spacing: 0.42em;
              transform: translate3d(-18px, 12px, 0);
              filter: blur(7px);
            }

            to {
              opacity: 1;
              letter-spacing: 0.22em;
              transform: translate3d(0, 0, 0);
              filter: blur(0);
            }
          }

          @keyframes satx-style-title-enter {
            from {
              opacity: 0;
              clip-path: inset(0 0 100% 0 round 0.25rem);
              transform: translate3d(0, 24px, 0) scale(0.985);
              filter: blur(10px);
            }

            to {
              opacity: 1;
              clip-path: inset(0 0 0 0 round 0.25rem);
              transform: translate3d(0, 0, 0) scale(1);
              filter: blur(0);
            }
          }

          @keyframes satx-style-body-enter {
            from {
              opacity: 0;
              transform: translate3d(-16px, 14px, 0);
              filter: blur(7px);
            }

            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
              filter: blur(0);
            }
          }

          @keyframes satx-style-chip-enter {
            0% {
              opacity: 0;
              transform: translate3d(var(--style-chip-x, -24px), 12px, 0) scale(0.94);
              filter: blur(9px);
            }

            58% {
              opacity: 1;
            }

            100% {
              opacity: 1;
              transform: translate3d(0, 0, 0) scale(1);
              filter: blur(0);
            }
          }

          .satx-style-motion,
          .satx-style-chip-motion {
            opacity: 0;
            will-change: opacity, transform, filter, clip-path;
          }

          .satx-style-section[data-revealed="true"] .satx-style-motion--kicker {
            animation: satx-style-kicker-enter 720ms cubic-bezier(0.16, 1, 0.3, 1) 80ms both;
          }

          .satx-style-section[data-revealed="true"] .satx-style-motion--title {
            animation: satx-style-title-enter 860ms cubic-bezier(0.16, 1, 0.3, 1) 190ms both;
          }

          .satx-style-section[data-revealed="true"] .satx-style-motion--body {
            animation: satx-style-body-enter 720ms cubic-bezier(0.2, 0.86, 0.24, 1) 360ms both;
          }

          .satx-style-section[data-revealed="true"] .satx-style-chip-motion {
            animation: satx-style-chip-enter 760ms cubic-bezier(0.18, 0.92, 0.2, 1) both;
            animation-delay: var(--style-chip-delay, 560ms);
          }

          @keyframes satx-market-kicker-enter {
            from {
              opacity: 0;
              letter-spacing: 0.46em;
              transform: translate3d(-20px, 12px, 0);
              filter: blur(8px);
            }

            to {
              opacity: 1;
              letter-spacing: 0.22em;
              transform: translate3d(0, 0, 0);
              filter: blur(0);
            }
          }

          @keyframes satx-market-title-enter {
            from {
              opacity: 0;
              clip-path: inset(0 100% 0 0 round 0.25rem);
              transform: translate3d(0, 22px, 0) scale(0.985);
              filter: blur(10px);
            }

            to {
              opacity: 1;
              clip-path: inset(0 0 0 0 round 0.25rem);
              transform: translate3d(0, 0, 0) scale(1);
              filter: blur(0);
            }
          }

          @keyframes satx-market-body-enter {
            from {
              opacity: 0;
              transform: translate3d(-18px, 14px, 0);
              filter: blur(7px);
            }

            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
              filter: blur(0);
            }
          }

          @keyframes satx-market-cta-enter {
            from {
              opacity: 0;
              transform: translate3d(28px, 10px, 0) scale(0.96);
              filter: blur(7px);
            }

            to {
              opacity: 1;
              transform: translate3d(0, 0, 0) scale(1);
              filter: blur(0);
            }
          }

          @keyframes satx-market-rail-enter {
            from {
              opacity: 0;
              transform: translate3d(0, 22px, 0);
              filter: blur(8px);
            }

            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
              filter: blur(0);
            }
          }

          @keyframes satx-market-card-enter {
            0% {
              opacity: 0;
              transform: translate3d(var(--market-card-x, 44px), 22px, 0) rotateZ(var(--market-card-tilt, 0.45deg)) scale(0.94);
              filter: blur(11px);
            }

            64% {
              opacity: 1;
            }

            100% {
              opacity: 1;
              transform: translate3d(0, 0, 0) rotateZ(0deg) scale(1);
              filter: blur(0);
            }
          }

          .satx-market-motion,
          .satx-market-rail-motion,
          .satx-market-card-motion {
            opacity: 0;
            will-change: opacity, transform, filter, clip-path;
          }

          .satx-market-section[data-revealed="true"] .satx-market-motion--kicker {
            animation: satx-market-kicker-enter 740ms cubic-bezier(0.16, 1, 0.3, 1) 80ms both;
          }

          .satx-market-section[data-revealed="true"] .satx-market-motion--title {
            animation: satx-market-title-enter 900ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both;
          }

          .satx-market-section[data-revealed="true"] .satx-market-motion--body {
            animation: satx-market-body-enter 720ms cubic-bezier(0.2, 0.86, 0.24, 1) 390ms both;
          }

          .satx-market-section[data-revealed="true"] .satx-market-motion--cta {
            animation: satx-market-cta-enter 760ms cubic-bezier(0.18, 0.9, 0.2, 1) 520ms both;
          }

          .satx-market-section[data-revealed="true"] .satx-market-rail-motion {
            animation: satx-market-rail-enter 780ms cubic-bezier(0.18, 0.9, 0.2, 1) both;
            animation-delay: var(--market-rail-delay, 680ms);
          }

          .satx-market-section[data-revealed="true"] .satx-market-card-motion {
            animation: satx-market-card-enter 860ms cubic-bezier(0.18, 0.92, 0.2, 1) both;
            animation-delay: var(--market-card-delay, 760ms);
          }

          @keyframes satx-feature-panel-enter {
            from {
              opacity: 0;
              transform: translate3d(28px, 0, 0) scale(0.99);
            }

            to {
              opacity: 1;
              transform: translate3d(0, 0, 0) scale(1);
            }
          }

          .satx-home-feature-panel {
            opacity: 0;
            transform: translate3d(28px, 0, 0) scale(0.99);
            transform-origin: center right;
            pointer-events: none;
            backface-visibility: hidden;
            will-change: opacity, transform;
          }

          .satx-home-feature-panel--visible {
            animation: satx-feature-panel-enter 620ms cubic-bezier(0.2, 0.86, 0.24, 1) both;
            pointer-events: auto;
          }

          @keyframes satx-market-mobile-enter {
            from {
              opacity: 0;
              transform: translate3d(0, 12px, 0);
            }

            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }

          @keyframes satx-feature-panel-mobile-enter {
            from {
              opacity: 0;
              transform: translate3d(0, 14px, 0) scale(0.99);
            }

            to {
              opacity: 1;
              transform: translate3d(0, 0, 0) scale(1);
            }
          }

          @media (max-width: 767px) {
            .satx-market-motion,
            .satx-market-rail-motion,
            .satx-market-card-motion {
              will-change: opacity, transform;
            }

            .satx-market-section[data-revealed="true"] .satx-market-motion--kicker,
            .satx-market-section[data-revealed="true"] .satx-market-motion--title,
            .satx-market-section[data-revealed="true"] .satx-market-motion--body,
            .satx-market-section[data-revealed="true"] .satx-market-motion--cta,
            .satx-market-section[data-revealed="true"] .satx-market-rail-motion,
            .satx-market-section[data-revealed="true"] .satx-market-card-motion {
              animation-name: satx-market-mobile-enter !important;
              animation-duration: 320ms !important;
              animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1) !important;
              filter: none !important;
              clip-path: none !important;
            }

            .satx-market-section[data-revealed="true"] .satx-market-motion--kicker {
              animation-delay: 40ms !important;
            }

            .satx-market-section[data-revealed="true"] .satx-market-motion--title {
              animation-delay: 90ms !important;
            }

            .satx-market-section[data-revealed="true"] .satx-market-motion--body,
            .satx-market-section[data-revealed="true"] .satx-market-motion--cta {
              animation-delay: 130ms !important;
            }

            .satx-market-section[data-revealed="true"] .satx-market-rail-motion,
            .satx-market-section[data-revealed="true"] .satx-market-card-motion {
              animation-delay: 170ms !important;
            }

            .satx-home-feature-panel {
              transform: translate3d(0, 14px, 0) scale(0.99);
              filter: none;
              will-change: opacity, transform;
            }

            .satx-home-feature-panel--visible {
              animation: satx-feature-panel-mobile-enter 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .satx-home-copy-motion {
              animation: none !important;
              opacity: 1;
              transform: none;
              filter: none;
              clip-path: none;
            }

            .satx-style-motion,
            .satx-style-chip-motion,
            .satx-market-motion,
            .satx-market-rail-motion,
            .satx-market-card-motion {
              animation: none !important;
              opacity: 1;
              transform: none;
              filter: none;
              clip-path: none;
            }

            .satx-home-feature-panel {
              opacity: 1;
              transform: none;
              filter: none;
              pointer-events: auto;
            }

            .satx-home-feature-panel--visible {
              animation: none;
            }
          }
        `}
      </style>

      <section className="satx-home-hero relative isolate overflow-hidden bg-black pt-30 md:pt-0">
        <div
          className="pointer-events-none fixed inset-0 z-0 hidden overflow-hidden bg-black md:block"
          aria-hidden="true"
        >
          <div
            className={`satx-home-hero-fixed-image${
              isDesktopHeroImageReady
                ? " satx-home-hero-fixed-image--ready"
                : ""
            }`}
            style={{
              backgroundImage: isDesktopHeroImageReady
                ? `url(${heroImage})`
                : undefined,
            }}
          />
        </div>
        <div
          className="satx-home-hero-mobile-scrim pointer-events-none fixed inset-0 z-[1] md:hidden"
          aria-hidden="true"
        />
        <div className="absolute inset-0 z-[1] hidden bg-[radial-gradient(circle_at_78%_28%,rgba(255,255,255,0.12),transparent_28%),linear-gradient(90deg,rgba(0,0,0,0.94),rgba(0,0,0,0.58),rgba(0,0,0,0.86))] md:block" />
        <div className="absolute inset-x-0 top-0 z-[2] h-32 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-[2] h-40 bg-gradient-to-t from-[#0d0d0d] to-transparent" />

        <div className="relative z-10 mx-auto grid min-h-[calc(100svh-72px)] max-w-7xl items-center gap-10 px-5 pb-12 pt-28 mt-10 md:mt-10 md:px-8 md:pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)] lg:gap-12 lg:pb-20 lg:pt-32">
          <div
            ref={heroCopyRef}
            className="satx-home-hero-copy max-w-3xl"
            data-revealed={isHeroCopyRevealed}
          >
            <h1 className="satx-home-copy-motion satx-home-copy-motion--headline max-w-3xl text-2xl! font-bold leading-[0.98] text-white md:text-5xl!">
              Find the best tattoo artists in San Antonio, Texas.
            </h1>
            <p className="satx-home-copy-motion satx-home-copy-motion--body mt-5 max-w-2xl text-base leading-7 text-white/70 md:text-lg">
              Browse verified artists, discover ready-to-request flash, compare
              styles, and move from discovery to a tattoo request with less
              guesswork.
            </p>
            <div className="satx-home-copy-motion satx-home-copy-motion--actions mt-8 flex flex-wrap gap-3">
              <Link
                to="/artists"
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-4 py-2 text-sm  text-white/80!  transition hover:border-white/30 hover:bg-white/[0.14]"
              >
                Browse artists
                <ArrowRight size={17} className="text-white" />
              </Link>
              <Link
                to="/flash"
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-4 py-2 text-sm  text-white/80! backdrop-blur transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
              >
                Explore flash
                <ChevronRight size={17} />
              </Link>
            </div>

            <dl
              ref={heroStatsRef}
              className="mt-10 inline-grid max-w-full grid-cols-[max-content_max-content_max-content] gap-x-5 gap-y-3 sm:mt-12 sm:gap-x-10"
            >
              {heroStats.map((stat, index) => (
                <div
                  key={stat.label}
                  className={`satx-home-copy-motion satx-home-copy-motion--stat-${index} flex min-w-0 flex-col`}
                >
                  <dt className="order-2 mt-1 text-[11px] font-medium leading-tight text-white/50 sm:text-sm">
                    {stat.label}
                  </dt>
                  <dd className="order-1 text-xl font-semibold leading-none text-white sm:text-2xl">
                    {stat.loading ? (
                      "..."
                    ) : heroStatsEntryCount > 0 && isHeroCopyRevealed ? (
                      <CountUp
                        key={`${stat.label}-${heroStatsEntryCount}-${isHeroCopyRevealed}-${stat.value}`}
                        end={stat.value}
                        duration={1.4}
                        delay={0.65 + index * 0.13}
                        separator=","
                        suffix={stat.suffix}
                      />
                    ) : (
                      `${stat.value}${stat.suffix || ""}`
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <HeroFeaturedArtistPanel
            artist={featuredArtist}
            previewItems={featuredPreviewItems}
            loading={loading}
            isRevealed={isFeaturedArtistPanelRevealed}
          />
        </div>
      </section>

      <section className="px-5 py-18 md:px-8 bg-[#0d0d0d] z-50 relative">
        <div
          ref={styleSectionRef}
          className="satx-style-section mx-auto max-w-7xl"
          data-revealed={isStyleSectionRevealed}
        >
          <div className="max-w-3xl">
            <p className="satx-style-motion satx-style-motion--kicker text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
              Browse by style
            </p>
            <h2 className="satx-style-motion satx-style-motion--title mt-3 text-3xl! font-semibold leading-tight text-white md:text-4xl!">
              Start with the look you already know you want.
            </h2>
            <p className="satx-style-motion satx-style-motion--body mt-3 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
              Use style as a shortcut into the artist directory, then compare
              portfolios until something feels right.
            </p>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            {featuredStyles.map((style, index) => (
              <span
                key={style}
                className="satx-style-chip-motion inline-flex"
                style={
                  {
                    "--style-chip-delay": `${560 + index * 72}ms`,
                    "--style-chip-x": `${index % 2 === 0 ? -28 : 28}px`,
                  } as CSSProperties
                }
              >
                <Link
                  to={`/artists?style=${encodeURIComponent(style)}`}
                  className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-sm font-semibold text-white/70 transition duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08] hover:text-white hover:shadow-[0_16px_34px_rgba(0,0,0,0.24)]"
                >
                  <Search
                    size={15}
                    className="text-white/35 transition group-hover:text-white/60"
                  />
                  {style}
                </Link>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section
        ref={marketplaceSectionRef}
        className="satx-market-section overflow-hidden bg-[#121212] z-50 relative px-5 py-18 md:px-8"
        data-revealed={isMarketplaceSectionRevealed}
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="satx-market-motion satx-market-motion--kicker text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
                Flash marketplace
              </p>
              <h2 className="satx-market-motion satx-market-motion--title mt-3 text-3xl! font-semibold leading-tight text-white md:text-4xl!">
                Designs ready for skin.
              </h2>
              <p className="satx-market-motion satx-market-motion--body mt-3 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
                Browse individual flash pieces when you want one design, or open
                a full sheet when you want to explore a whole collection.
              </p>
            </div>
            <Link
              to="/flash"
              className="satx-market-motion satx-market-motion--cta inline-flex w-fit items-center gap-2 rounded-md    px-4 py-2.5 text-sm font-semibold text-white/70! hover:text-white! transition "
            >
              Browse marketplace
              <ArrowRight size={16} className="text-[#0b0b0b]!" />
            </Link>
          </div>

          <PreviewRail
            title=""
            emptyLabel="No marketplace-ready flash yet."
            items={flashes}
            renderItem={(flash) => <FlashPreviewCard flash={flash} />}
            railIndex={0}
          />

          {sheets.length > 0 ? (
            <FeaturedSheetPanel sheet={sheets[0]} railIndex={1} />
          ) : (
            <div
              className="satx-market-rail-motion mt-10"
              style={{ "--market-rail-delay": "980ms" } as CSSProperties}
            >
              <EmptyPreview label="No marketplace-ready sheets yet." />
            </div>
          )}
        </div>
      </section>

      <section className="relative z-50 border-t border-white/5 bg-[#171717] px-5 py-18 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
                {bookingSectionCopy.eyebrow}
              </p>
              <h2 className="mt-3 text-3xl! font-semibold leading-tight text-white md:text-4xl!">
                {bookingSectionCopy.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
                {bookingSectionCopy.body}
              </p>
            </div>
            <Link
              to="/artists"
              className="inline-flex w-fit items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white/55 transition hover:text-white"
            >
              View all artists
              <ArrowRight size={16} />
            </Link>
          </div>

          {loading ? (
            <>
              <div className="mt-10 hidden grid-cols-3 gap-4 md:grid">
                {[0, 1, 2].map((item) => (
                  <BookingArtistCardSkeleton key={item} />
                ))}
              </div>

              <div className="-mx-5 mt-8 snap-x snap-mandatory scroll-px-5 overflow-x-auto overscroll-x-contain scroll-smooth px-5 pb-3 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
                <div className="flex gap-4">
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="w-[min(22rem,calc(100vw-3rem))] shrink-0 snap-start [scroll-snap-stop:always]"
                    >
                      <BookingArtistCardSkeleton />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : bookingArtists.length > 0 ? (
            <>
              <div className="mt-10 hidden grid-cols-3 gap-4 md:grid lg:gap-5">
                {bookingArtists.map((artist) => (
                  <BookingArtistCard key={artist.id} artist={artist} />
                ))}
              </div>

              <div className="-mx-5 mt-8 snap-x snap-mandatory scroll-px-5 overflow-x-auto overscroll-x-contain scroll-smooth px-5 pb-3 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
                <div className="flex gap-4">
                  {bookingArtists.map((artist) => (
                    <div
                      key={artist.id}
                      className="w-[min(22rem,calc(100vw-3rem))] shrink-0 snap-start [scroll-snap-stop:always]"
                    >
                      <BookingArtistCard artist={artist} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.035] p-8 text-center">
              <p className="text-sm text-white/45">
                Artist availability will appear here as profiles are updated.
              </p>
              <Link
                to="/artists"
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85"
              >
                Browse artists
                <ArrowRight size={16} className="text-[#0b0b0b]!" />
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

const HeroFeaturedArtistPanel = ({
  artist,
  previewItems,
  loading,
  isRevealed,
}: {
  artist: PublicArtist | null;
  previewItems: FeaturedPreviewItem[];
  loading: boolean;
  isRevealed: boolean;
}) => {
  const artistName = getArtistName(artist || undefined);
  const featureSlides = useMemo(
    () => getHomepageFeatureSlides(artist, artistName),
    [artist, artistName]
  );

  if (loading) {
    return <HeroFeaturedArtistPanelSkeleton isRevealed={isRevealed} />;
  }

  const feature = artist?.homepageFeature;
  const story =
    feature?.story?.trim() ||
    artist?.bio ||
    "A SATX Ink artist spotlight is coming soon. Until then, explore local artists, compare styles, and find the work that feels right.";
  const quote = feature?.quote?.trim();
  const shopLabel = artist ? getArtistStudioLabel(artist) : "Featured artist";
  const visibleStyles = artist?.specialties?.filter(Boolean).slice(0, 4) || [];
  const panelVisibilityClass = isRevealed
    ? " satx-home-feature-panel--visible"
    : "";

  return (
    <aside
      className={`satx-home-feature-panel${panelVisibilityClass} relative min-h-[640px] overflow-hidden rounded-xl p-3 shadow-2xl shadow-black/40 backdrop-blur-sm sm:min-h-[660px] lg:self-end`}
      aria-hidden={!isRevealed}
      inert={!isRevealed}
    >
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

      <HeroFeaturedArtistImageStage
        slides={featureSlides}
        isPanelRevealed={isRevealed}
      >
        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.76))]" />
        <div className="absolute left-3 top-3 z-20 inline-flex items-center gap-2 rounded-full  bg-black/45 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80 backdrop-blur">
          <Sparkles size={13} aria-hidden="true" />
          Artist Spotlight
        </div>
        <div className="absolute inset-x-0 bottom-0 z-20 p-4">
          <div className="max-w-md">
            <div className="flex gap-2 items-center justify-start">
              {artist?.avatarUrl && (
                <img
                  src={artist.avatarUrl}
                  alt={artistName}
                  className="h-10 md:h-11 w-10 md:w-11 shrink-0 rounded-full border border-white/15 object-cover"
                  loading="eager"
                  decoding="async"
                />
              )}
              <div className="flex flex-col gap-0">
                <h2 className="text-lg! md:text-2xl! font-semibold leading-tight text-white  mb-0!">
                  {artist ? artistName : "Meet the next artist spotlight."}
                </h2>
                <p className="mt-0 flex items-center gap-2 text-xs! md:text-sm font-medium text-white/60">
                  <span className="truncate">{shopLabel}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </HeroFeaturedArtistImageStage>

      <div className="px-3 md:px-4 py-1">
        {visibleStyles.length > 0 && (
          <div className="mt-0 flex flex-wrap gap-4 py-1">
            {visibleStyles.map((style) => (
              <span
                key={style}
                className="rounded-full   text-[11px] font-semibold text-white/65"
              >
                {style}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="mt-5 text-md font-semibold leading-tight text-white">
              {artist
                ? `Behind the work.`
                : "A local spotlight is getting inked in."}
            </h3>
          </div>
        </div>

        <p className="mt-1 min-h-10 line-clamp-4 text-sm leading-6 text-white/80! mb-4">
          {story}
        </p>

        {quote && (
          <blockquote className="mt-2 rounded-lg border border-white/10 bg-white/[0.035] p-3 ">
            <div className="flex items-start gap-2">
              <Quote
                size={16}
                className="mt-0.5 shrink-0 text-white/35"
                aria-hidden="true"
              />
              <p className="line-clamp-3 text-sm font-medium leading-6 text-white/[0.78]">
                {quote}
              </p>
            </div>
          </blockquote>
        )}

        {previewItems.length > 0 && (
          <div className="mt-0! grid grid-cols-4 gap-2">
            {previewItems.map((item) => (
              <HeroFeaturedPreviewTile
                key={`${item.type}-${item.id}`}
                item={item}
              />
            ))}
          </div>
        )}

        <div className="mt-5">
          {artist ? (
            <Link
              to={`/artists/${artist.id}`}
              className="inline-flex min-h-10 items-center gap-2  px-4 py-2 text-sm font-semibold bg-white/2 hover:bg-white/5 text-neutral-300! hover:text-white! shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(0,0,0,0.22)] transition group"
            >
              View artist profile
              <ArrowRight
                size={17}
                className="text-neutral-300 group-hover:text-white"
              />
            </Link>
          ) : (
            <Link
              to="/artists"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/20 bg-white/[0.09] px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(0,0,0,0.22)] transition hover:border-white/35 hover:bg-white/[0.14]"
            >
              Browse local artists
              <ArrowRight size={16} className="text-white!" />
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
};

const HeroFeaturedArtistImageStage = ({
  slides,
  isPanelRevealed,
  children,
}: {
  slides: FeaturedArtistSlide[];
  isPanelRevealed: boolean;
  children: ReactNode;
}) => {
  const { targetRef, isVisible } = useElementVisibility<HTMLDivElement>({
    threshold: 0.01,
  });
  const isPageVisible = usePageVisibility();
  const shouldMountSlider = isVisible && isPageVisible;

  return (
    <div
      ref={targetRef}
      className="relative isolate aspect-[4/3] overflow-hidden rounded-lg border border-white/10 bg-black"
    >
      {shouldMountSlider ? (
        <HeroFeaturedArtistImageSlider
          slides={slides}
          autoPlay={isPanelRevealed && isVisible && isPageVisible}
        />
      ) : (
        <div className="absolute inset-0 z-0 bg-black" aria-hidden="true" />
      )}
      {children}
    </div>
  );
};

const HeroFeaturedArtistImageSlider = ({
  slides,
  autoPlay,
}: {
  slides: FeaturedArtistSlide[];
  autoPlay: boolean;
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [autoSlideResetKey, setAutoSlideResetKey] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const slideSignature = useMemo(
    () => slides.map((slide) => slide.url).join("|"),
    [slides]
  );
  const nextIndex =
    slides.length > 1 ? (activeIndex + 1) % slides.length : activeIndex;
  const nextSlide = slides[nextIndex];
  const shouldWarmNextSlide =
    autoPlay && !prefersReducedMotion && slides.length > 1;

  useEffect(() => {
    setActiveIndex(0);
    setPreviousIndex(null);
    setAutoSlideResetKey((key) => key + 1);
  }, [slideSignature]);

  useEffect(() => {
    if (previousIndex === null) return;

    const timeoutId = window.setTimeout(() => setPreviousIndex(null), 1300);

    return () => window.clearTimeout(timeoutId);
  }, [previousIndex]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);

    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (!autoPlay || slides.length <= 1 || prefersReducedMotion) return;

    const timeoutId = window.setTimeout(() => {
      setActiveIndex((index) => {
        setPreviousIndex(index);
        return (index + 1) % slides.length;
      });
    }, HERO_FEATURED_ARTIST_SLIDE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeIndex,
    autoPlay,
    autoSlideResetKey,
    prefersReducedMotion,
    slides.length,
    slideSignature,
  ]);

  useEffect(() => {
    if (!nextSlide || !shouldWarmNextSlide) return;

    const image = new Image();
    image.decoding = "async";
    image.onload = () => loadedFeaturedArtistSlideUrls.add(nextSlide.url);
    image.src = nextSlide.url;
    if (image.complete && image.naturalWidth > 0) {
      loadedFeaturedArtistSlideUrls.add(nextSlide.url);
    }
    if (image.decode) {
      image
        .decode()
        .then(() => loadedFeaturedArtistSlideUrls.add(nextSlide.url))
        .catch(() => undefined);
    }

    if (nextSlide.previewUrl && nextSlide.previewUrl !== nextSlide.url) {
      const previewImage = new Image();
      previewImage.decoding = "async";
      previewImage.src = nextSlide.previewUrl;
    }
  }, [nextSlide, shouldWarmNextSlide]);

  if (slides.length === 0) {
    return (
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_34%_18%,rgba(255,255,255,0.12),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.018)_48%,rgba(0,0,0,0.38))]">
        <div className="flex h-full items-center justify-center">
          <ImageOff size={38} className="text-white/18" />
        </div>
      </div>
    );
  }

  const showSlide = (nextIndex: number) => {
    setAutoSlideResetKey((key) => key + 1);
    setActiveIndex((currentIndex) => {
      if (nextIndex === currentIndex) return currentIndex;

      setPreviousIndex(currentIndex);
      return nextIndex;
    });
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {slides.map((slide, index) => {
          const state =
            index === activeIndex
              ? "active"
              : index === previousIndex
              ? "previous"
              : "hidden";

          return (
            <HeroFeaturedArtistSlideImage
              key={slide.id}
              slide={slide}
              state={state}
              shouldLoad={
                state !== "hidden" || (shouldWarmNextSlide && index === nextIndex)
              }
              loading={index === activeIndex ? "eager" : "lazy"}
              fetchPriority={index === activeIndex ? "high" : "low"}
              prefersReducedMotion={prefersReducedMotion}
            />
          );
        })}
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-full   backdrop-blur">
          {slides.map((slide, index) => (
            <button
              key={`${slide.id}-dot`}
              type="button"
              onClick={() => showSlide(index)}
              className={`p-0! h-[15px] w-[20px] md:h-[20px] md:w-[30px] rounded-full transition-all duration-300 border-1 border-transparent  ${
                activeIndex === index
                  ? "w-5 border-white! border-1 bg-white/20"
                  : "w-1.5 bg-white/5 hover:bg-white/20"
              }`}
              aria-label={`Show featured artist image ${index + 1}`}
            />
          ))}
        </div>
      )}
    </>
  );
};

const HeroFeaturedArtistSlideImage = ({
  slide,
  state,
  shouldLoad,
  loading,
  fetchPriority,
  prefersReducedMotion,
}: {
  slide: FeaturedArtistSlide;
  state: "active" | "previous" | "hidden";
  shouldLoad: boolean;
  loading: "eager" | "lazy";
  fetchPriority: "high" | "low";
  prefersReducedMotion: boolean;
}) => {
  const [isLoaded, setIsLoaded] = useState(() =>
    loadedFeaturedArtistSlideUrls.has(slide.url)
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let isActive = true;
    const image = new Image();
    const markLoaded = () => {
      loadedFeaturedArtistSlideUrls.add(slide.url);
      if (isActive) setIsLoaded(true);
    };
    const markFailed = () => {
      if (isActive) setFailed(true);
    };

    setFailed(false);

    if (!shouldLoad) {
      setIsLoaded(loadedFeaturedArtistSlideUrls.has(slide.url));
      return () => {
        isActive = false;
      };
    }

    if (loadedFeaturedArtistSlideUrls.has(slide.url)) {
      setIsLoaded(true);
      return () => {
        isActive = false;
      };
    }

    setIsLoaded(false);

    image.decoding = "async";
    image.onload = markLoaded;
    image.onerror = markFailed;
    image.src = slide.url;

    if (image.complete) {
      if (image.naturalWidth > 0) {
        markLoaded();
      } else {
        markFailed();
      }
    } else if (image.decode) {
      image
        .decode()
        .then(markLoaded)
        .catch(() => undefined);
    }

    return () => {
      isActive = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [shouldLoad, slide.url]);

  const stateClassName =
    state === "active"
      ? "z-[2] opacity-100"
      : state === "previous"
      ? "z-[1] opacity-0"
      : "z-0 opacity-0";
  const transform =
    state === "active"
      ? "translate3d(0, 0, 0) scale(1)"
      : state === "previous"
      ? "translate3d(-2.75%, 0, 0) scale(1.018)"
      : "translate3d(2.75%, 0, 0) scale(1.018)";

  return (
    <div
      className={`absolute inset-0 h-full w-full overflow-hidden bg-black ${stateClassName}`}
      style={
        prefersReducedMotion
          ? { transform, transition: "none" }
          : {
              transform,
              transition:
                "opacity 980ms cubic-bezier(0.22, 1, 0.36, 1), transform 1280ms cubic-bezier(0.16, 1, 0.3, 1)",
              willChange: "opacity, transform",
            }
      }
      aria-hidden={state !== "active"}
    >
      {failed ? (
        <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_34%_18%,rgba(255,255,255,0.12),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.018)_48%,rgba(0,0,0,0.38))]">
          <ImageOff size={38} className="text-white/18" />
        </div>
      ) : (
        <>
          {shouldLoad && slide.previewUrl && slide.previewUrl !== slide.url && (
            <img
              src={slide.previewUrl}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                isLoaded
                  ? "scale-105 opacity-0 blur-xl"
                  : state === "active"
                  ? "scale-[1.02] opacity-80 blur-sm"
                  : "scale-105 opacity-45 blur-xl"
              }`}
              loading={loading}
              decoding="async"
              fetchPriority="low"
              aria-hidden="true"
            />
          )}
          <div
            className={`preview-loading-sheen preview-loading-sheen--fill transition-opacity duration-300 ${
              isLoaded ? "opacity-0" : "opacity-100"
            }`}
            aria-hidden="true"
          />
          {shouldLoad && (
            <img
              src={slide.url}
              alt={slide.alt}
              className={`relative z-[1] h-full w-full object-cover transition duration-700 ${
                isLoaded ? "opacity-100" : "opacity-0"
              }`}
              loading={loading}
              decoding="async"
              fetchPriority={fetchPriority}
              onLoad={() => setIsLoaded(true)}
              onError={() => setFailed(true)}
            />
          )}
        </>
      )}
    </div>
  );
};

const HeroFeaturedPreviewTile = ({ item }: { item: FeaturedPreviewItem }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let isActive = true;
    const image = new Image();
    const markLoaded = () => {
      if (isActive) setIsLoaded(true);
    };
    const markFailed = () => {
      if (isActive) setFailed(true);
    };

    setIsLoaded(false);
    setFailed(false);

    image.decoding = "async";
    image.onload = markLoaded;
    image.onerror = markFailed;
    image.src = item.imageUrl;

    if (image.complete) {
      if (image.naturalWidth > 0) {
        markLoaded();
      } else {
        markFailed();
      }
    } else if (image.decode) {
      image
        .decode()
        .then(markLoaded)
        .catch(() => undefined);
    }

    return () => {
      isActive = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [item.imageUrl]);

  return (
    <Link
      to={item.href}
      className="group relative aspect-square overflow-hidden rounded-md border border-white/10 bg-[#080808]"
      aria-label={item.label}
    >
      {failed ? (
        <MissingImage />
      ) : (
        <>
          <div
            className={`preview-loading-sheen preview-loading-sheen--fill transition-opacity duration-300 ${
              isLoaded ? "opacity-0" : "opacity-100"
            }`}
            aria-hidden="true"
          />
          <img
            src={item.imageUrl}
            alt=""
            className={`relative z-[1] h-full w-full object-cover transition duration-500 group-hover:scale-105 ${
              isLoaded ? "opacity-[0.86] group-hover:opacity-100" : "opacity-0"
            }`}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            onLoad={() => setIsLoaded(true)}
            onError={() => setFailed(true)}
          />
        </>
      )}
      <span className="absolute bottom-1 left-1 z-[2] rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white/75">
        {item.type}
      </span>
    </Link>
  );
};

const HeroFeaturedArtistPanelSkeleton = ({
  isRevealed,
}: {
  isRevealed: boolean;
}) => {
  const panelVisibilityClass = isRevealed
    ? " satx-home-feature-panel--visible"
    : "";

  return (
    <aside
      className={`satx-home-feature-panel${panelVisibilityClass} relative min-h-[640px] overflow-hidden rounded-xl border border-white/10 bg-[#101010]/80 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:min-h-[660px] lg:self-end`}
      aria-label="Loading featured SATX artist"
      aria-hidden={!isRevealed}
      inert={!isRevealed}
    >
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

      <div className="preview-loading-sheen relative aspect-[4/3] overflow-hidden rounded-lg border border-white/10 bg-black">
        <div className="absolute left-3 top-3 h-8 w-48 rounded-full border border-white/10 bg-black/35" />
        <div className="absolute inset-x-4 bottom-4">
          <div className="h-8 w-3/4 rounded-md bg-white/[0.12]" />
          <div className="mt-3 h-3 w-36 rounded-full bg-white/[0.09]" />
        </div>
      </div>

      <div className="p-3 pt-4 md:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="skeleton-sheen h-3 w-32 rounded-full bg-white/[0.08]" />
            <div className="skeleton-sheen mt-3 h-6 w-11/12 rounded-md bg-white/[0.11]" />
            <div className="skeleton-sheen mt-2 h-6 w-3/5 rounded-md bg-white/[0.08]" />
          </div>
          <div className="skeleton-sheen h-11 w-11 shrink-0 rounded-full border border-white/10 bg-white/[0.08]" />
        </div>

        <div className="mt-4 min-h-24 space-y-3">
          <div className="skeleton-sheen h-3 w-full rounded-full bg-white/[0.08]" />
          <div className="skeleton-sheen h-3 w-11/12 rounded-full bg-white/[0.075]" />
          <div className="skeleton-sheen h-3 w-10/12 rounded-full bg-white/[0.07]" />
          <div className="skeleton-sheen h-3 w-7/12 rounded-full bg-white/[0.06]" />
        </div>

        <div className="skeleton-sheen mt-4 min-h-[72px] rounded-lg border border-white/10 bg-white/[0.035]" />

        <div className="mt-4 flex min-h-7 flex-wrap gap-2">
          {[0, 1, 2, 3].map((item) => (
            <span
              key={item}
              className="skeleton-sheen h-7 w-20 rounded-full border border-white/10 bg-white/[0.06]"
            />
          ))}
        </div>

        <div className="mt-4 grid min-h-[96px] grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((item) => (
            <span
              key={item}
              className="preview-loading-sheen aspect-square rounded-md border border-white/10 bg-white/[0.045]"
            />
          ))}
        </div>

        <div className="skeleton-sheen mt-5 h-10 w-44 rounded-md bg-white/[0.12]" />
      </div>
    </aside>
  );
};

const PreviewRail = <T,>({
  emptyLabel,
  items,
  renderItem,
  reverse = false,
  railIndex = 0,
}: {
  title: string;
  emptyLabel: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  reverse?: boolean;
  railIndex?: number;
}) => {
  const desktopItems = items.slice(0, 5);
  const railDelay = 700 + railIndex * 280;

  return (
    <div
      className="satx-market-rail-motion mt-10"
      style={{ "--market-rail-delay": `${railDelay}ms` } as CSSProperties}
    >
      {items.length > 0 ? (
        <>
          <div className="hidden items-stretch gap-4 pb-2 md:grid md:grid-cols-4 xl:grid-cols-5">
            {desktopItems.map((item, index) => (
              <div
                key={index}
                className="satx-market-card-motion flex min-w-0"
                style={
                  {
                    "--market-card-delay": `${
                      railDelay + 180 + index * 82
                    }ms`,
                    "--market-card-x": reverse ? "-48px" : "48px",
                    "--market-card-tilt": reverse ? "-0.5deg" : "0.5deg",
                  } as CSSProperties
                }
              >
                {renderItem(item, index)}
              </div>
            ))}
          </div>

          <div className="-mx-5 snap-x snap-mandatory scroll-px-5 overflow-x-auto overscroll-x-contain scroll-smooth px-5 pb-3 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
            <div className="flex items-stretch gap-4">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="satx-market-card-motion flex w-[min(13.75rem,calc(100vw-5rem))] shrink-0 snap-start [scroll-snap-stop:always]"
                  style={
                    {
                      "--market-card-delay": `${
                        railDelay + 180 + index * 82
                      }ms`,
                      "--market-card-x": reverse ? "-48px" : "48px",
                      "--market-card-tilt": reverse ? "-0.5deg" : "0.5deg",
                    } as CSSProperties
                  }
                >
                  {renderItem(item, index)}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <EmptyPreview label={emptyLabel} />
      )}
    </div>
  );
};

const FlashPreviewCard = ({ flash }: { flash: HomeFlash }) => {
  return (
    <Link
      to={flash.sheetId ? `/flash/sheets/${flash.sheetId}` : "/flash"}
      className={`${flashPreviewCardClassName} flex h-full w-full flex-col`}
    >
      <FlashPreviewImage flash={flash} />
      <div className="flex min-h-[128px] flex-1 flex-col p-3">
        <FlashPreviewMeta flash={flash} artist={flash.artist} />
      </div>
    </Link>
  );
};

const FeaturedSheetPanel = ({
  sheet,
  railIndex,
}: {
  sheet: HomeFlashSheet;
  railIndex: number;
}) => {
  const artistName = getArtistName(sheet.artist);
  const sheetHref = `/flash/sheets/${sheet.id}`;
  const railDelay = 700 + railIndex * 280;

  return (
    <div
      className="satx-market-rail-motion mt-14 grid gap-8 md:grid-cols-[minmax(0,0.52fr)_minmax(20rem,0.48fr)] md:items-center md:gap-10"
      style={{ "--market-rail-delay": `${railDelay}ms` } as CSSProperties}
    >
      <div
        className="satx-market-card-motion order-1 max-w-xl md:order-2"
        style={
          {
            "--market-card-delay": `${railDelay + 300}ms`,
            "--market-card-x": "36px",
            "--market-card-tilt": "0deg",
          } as CSSProperties
        }
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
          Flash sheets
        </p>
        <h3 className="mt-3 text-3xl! font-semibold leading-tight text-white md:text-4xl!">
          Browse full sheets.
        </h3>
        <p className="mt-3 max-w-lg text-sm leading-7 text-white/55 md:text-base">
          Open a complete flash sheet when you want to explore a collection from
          one artist before choosing the design that feels right.
        </p>
        <Link
          to="/flash?tab=sheets"
          className="mt-6 hidden w-fit items-center gap-2 text-sm font-semibold text-white/45 transition hover:text-white md:inline-flex"
        >
          View more
          <ArrowRight size={16} />
        </Link>
      </div>

      <div
        className="satx-market-card-motion group order-2 grid overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.055] via-[#111] to-[#0c0c0c] shadow-lg transition hover:border-white/20 md:order-1 lg:min-h-[21rem] lg:grid-cols-[minmax(13rem,0.48fr)_minmax(0,0.52fr)]"
        style={
          {
            "--market-card-delay": `${railDelay + 180}ms`,
            "--market-card-x": "-48px",
            "--market-card-tilt": "-0.35deg",
          } as CSSProperties
        }
      >
        <Link
          to={sheetHref}
          className="relative block h-[18rem] overflow-hidden bg-[#171717] sm:h-[20rem] lg:h-auto lg:min-h-[21rem]"
          aria-label={`Open ${sheet.title || "flash sheet"}`}
        >
          {sheet.thumbUrl || sheet.imageUrl ? (
            <img
              src={sheet.thumbUrl || sheet.imageUrl}
              alt={sheet.title || "Flash sheet"}
              className="h-full w-full object-contain p-3 transition duration-500 group-hover:scale-[1.025]"
              loading="lazy"
            />
          ) : (
            <MissingImage />
          )}
        </Link>

        <div className="flex min-h-[15rem] flex-col items-center justify-center gap-8 p-5 text-center lg:min-h-[21rem] lg:p-6">
          <div className="flex flex-col items-center">
            <ArtistAvatar
              artist={sheet.artist}
              name={artistName}
              size="featured"
            />
            <p className="mt-5 max-w-full truncate text-xl font-semibold leading-tight text-white">
              {artistName}
            </p>
          </div>

          <div className="flex items-center justify-center gap-5">
            <Link
              to={sheetHref}
              className="inline-flex w-fit items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/70 transition group-hover:border-white/20 group-hover:bg-white/[0.08] group-hover:text-white"
            >
              Open sheet
              <ArrowRight size={15} />
            </Link>
            <Link
              to="/flash?tab=sheets"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/45 transition hover:text-white md:hidden"
            >
              View others
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

const BookingArtistCard = ({ artist }: { artist: PublicArtist }) => {
  const artistName = getArtistName(artist);
  const studioLabel = getArtistStudioLabel(artist);
  const bookingLabel = getHomeBookingLabel(artist);
  const artistInitial = artistName.charAt(0).toUpperCase();

  return (
    <article className="group relative flex min-h-[18.5rem] flex-col items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-[#111] to-[#0c0c0c] px-5 py-8 text-center shadow-lg shadow-black/20 transition duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.055]">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
      <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
        <CalendarDays size={12} />
        {bookingLabel}
      </div>

      <div className="mt-8 flex flex-col items-center">
        <span className="relative h-24 w-24 overflow-hidden rounded-full border border-white/15 bg-white/[0.06] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
          {artist.avatarUrl ? (
            <img
              src={artist.avatarUrl}
              alt={artistName}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-white/55">
              {artistInitial}
            </span>
          )}
        </span>

        <h3 className="mt-5 max-w-full truncate text-xl font-semibold leading-tight text-white">
          {artistName}
        </h3>
        <p className="mt-2 flex max-w-full items-center justify-center gap-1.5 truncate text-sm text-white/45">
          <Store size={14} className="shrink-0 text-white/30" />
          <span className="truncate">{studioLabel}</span>
        </p>
      </div>

      <Link
        to={`/artists/${artist.id}`}
        className="mt-7 inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/70 transition group-hover:border-white/20 group-hover:bg-white group-hover:text-[#0b0b0b]!"
      >
        View profile
        <ArrowRight size={15} />
      </Link>
    </article>
  );
};

const BookingArtistCardSkeleton = () => (
  <article
    aria-hidden="true"
    className="relative flex min-h-[18.5rem] flex-col items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] via-[#111] to-[#0c0c0c] px-5 py-8 text-center"
  >
    <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    <div className="absolute left-4 top-4 inline-flex h-6 w-36 items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2.5">
      <div className="skeleton-sheen h-3 w-3 rounded-sm bg-white/[0.08]" />
      <div className="skeleton-sheen h-2.5 w-24 rounded-full bg-white/[0.08]" />
    </div>

    <div className="mt-8 flex w-full flex-col items-center">
      <div className="skeleton-sheen h-24 w-24 rounded-full border border-white/10 bg-white/[0.06] shadow-[0_18px_40px_rgba(0,0,0,0.3)]" />
      <div className="skeleton-sheen mt-5 h-6 w-36 max-w-full rounded-md bg-white/[0.08]" />
      <div className="mt-3 flex w-full max-w-48 items-center justify-center gap-1.5">
        <div className="skeleton-sheen h-3.5 w-3.5 shrink-0 rounded-sm bg-white/[0.055]" />
        <div className="skeleton-sheen h-4 min-w-0 flex-1 rounded-md bg-white/[0.055]" />
      </div>
    </div>

    <div className="skeleton-sheen mt-7 h-10 w-32 rounded-md border border-white/10 bg-white/[0.08]" />
  </article>
);

const ArtistAvatar = ({
  artist,
  name,
  size = "default",
}: {
  artist?: PublicArtist;
  name: string;
  size?: "default" | "featured";
}) => {
  const artistName = getArtistName(artist);
  const avatarClassName =
    size === "featured"
      ? "relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/[0.06] shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
      : "relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/[0.06] shadow-sm";
  const fallbackClassName =
    size === "featured"
      ? "flex h-full w-full items-center justify-center text-3xl font-bold text-white/55"
      : "flex h-full w-full items-center justify-center text-xl font-bold text-white/55";

  return (
    <span className={avatarClassName}>
      {artist?.avatarUrl ? (
        <img
          src={artist.avatarUrl}
          alt={artistName}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className={fallbackClassName}>
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
};

const MissingImage = () => (
  <div className="flex h-full w-full items-center justify-center">
    <ImageOff size={34} className="text-white/20" />
  </div>
);

const EmptyPreview = ({ label }: { label: string }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.035] p-8 text-center">
    <p className="text-sm text-white/45">{label}</p>
  </div>
);

const getUniqueDocsById = <T extends { id: string }>(docs: T[]) => {
  const uniqueDocs = new Map<string, T>();

  docs.forEach((doc) => {
    if (!uniqueDocs.has(doc.id)) {
      uniqueDocs.set(doc.id, doc);
    }
  });

  return Array.from(uniqueDocs.values());
};

const getHomepageBookingArtists = async (artists: PublicArtist[]) => {
  const hydratedArtists = await hydratePublicArtistsWithShops(artists);
  const options = getRollingBookingMonthOptions();
  const allowedKeys = options.map((option) => option.key);
  const currentMonthKey = allowedKeys[0];
  const scoredArtists = hydratedArtists.map((artist, index) => {
    const bookingMonthKeys = getBookingAvailabilityMonthKeys(
      artist.bookingAvailability,
      allowedKeys
    );
    const bookingMonthRank =
      currentMonthKey && bookingMonthKeys.includes(currentMonthKey)
        ? 0
        : getFirstBookingMonthRank(bookingMonthKeys, allowedKeys);

    return {
      artist,
      index,
      bookingMonthRank,
      hasBookingAvailability: bookingMonthKeys.length > 0,
      name: getArtistName(artist),
    };
  });
  const artistsWithBookingAvailability = scoredArtists.filter(
    (item) => item.hasBookingAvailability
  );
  const source =
    artistsWithBookingAvailability.length > 0
      ? artistsWithBookingAvailability
      : scoredArtists;

  return source
    .sort((left, right) => {
      if (left.bookingMonthRank !== right.bookingMonthRank) {
        return left.bookingMonthRank - right.bookingMonthRank;
      }

      return left.name.localeCompare(right.name) || left.index - right.index;
    })
    .slice(0, HOME_BOOKING_ARTIST_DISPLAY_LIMIT)
    .map((item) => item.artist);
};

const hydratePublicArtistsWithShops = async (artists: PublicArtist[]) => {
  const shopsById = await fetchShopsById(
    Array.from(
      new Set(
        artists
          .map((artist) => artist.shopId)
          .filter((shopId): shopId is string => Boolean(shopId))
      )
    )
  );

  return artists.map((artist) => {
    if (!artist.shopId) return artist;

    const shop = shopsById[artist.shopId];
    if (!shop?.name) return artist;

    return {
      ...artist,
      shopName: artist.shopName || shop.name,
      studioName: artist.studioName || shop.name,
    };
  });
};

const isVisiblePublicArtist = (artist: PublicArtist): artist is PublicArtist =>
  artist.role === "artist" &&
  (artist.isVerified === true ||
    artist.isVerified === "true" ||
    typeof artist.isVerified === "undefined");

const artistHasBookingMonth = (
  artist: PublicArtist,
  monthKey?: string
) => {
  if (!monthKey) return false;

  return getBookingAvailabilityMonthKeys(artist.bookingAvailability).includes(
    monthKey
  );
};

const artistHasBookingAvailability = (artist: PublicArtist) =>
  getBookingAvailabilityMonthKeys(artist.bookingAvailability).length > 0;

const getFirstBookingMonthRank = (
  bookingMonthKeys: string[],
  allowedKeys: string[]
) => {
  const ranks = bookingMonthKeys
    .map((key) => allowedKeys.indexOf(key))
    .filter((rank) => rank >= 0);

  if (ranks.length === 0) return Number.MAX_SAFE_INTEGER;

  return Math.min(...ranks);
};

const getHomeBookingLabel = (artist: PublicArtist) => {
  const options = getRollingBookingMonthOptions();
  const allowedKeys = options.map((option) => option.key);
  const bookingMonthKeys = getBookingAvailabilityMonthKeys(
    artist.bookingAvailability,
    allowedKeys
  );
  const currentMonth = options[0];
  const selectedMonthKey =
    currentMonth && bookingMonthKeys.includes(currentMonth.key)
      ? currentMonth.key
      : bookingMonthKeys[0];
  const selectedMonth = options.find(
    (option) => option.key === selectedMonthKey
  );

  return selectedMonth ? `Booking ${selectedMonth.shortLabel}` : "Requests open";
};

const getFeaturedPreviewItems = (
  flashes: HomeFlash[],
  sheets: HomeFlashSheet[],
  artistId: string
): FeaturedPreviewItem[] => {
  const flashItems: FeaturedPreviewItem[] = flashes
    .filter((flash) => flash.artistId === artistId)
    .map((flash) => ({
      id: flash.id,
      href: flash.sheetId ? `/flash/sheets/${flash.sheetId}` : "/flash",
      imageUrl: flash.thumbUrl || flash.webp90Url || flash.fullUrl,
      label: flash.title || flash.caption || "Featured flash",
      type: "flash",
    }));

  const sheetItems: FeaturedPreviewItem[] = sheets
    .filter((sheet) => sheet.artistId === artistId)
    .map((sheet) => ({
      id: sheet.id,
      href: `/flash/sheets/${sheet.id}`,
      imageUrl: sheet.thumbUrl || sheet.imageUrl,
      label: sheet.title || "Featured flash sheet",
      type: "sheet",
    }));

  return [...flashItems, ...sheetItems]
    .filter((item) => item.imageUrl)
    .slice(0, 4);
};

const fetchArtistsById = async (artistIds: string[]) => {
  const artistsById: Record<string, PublicArtist> = {};
  const chunks = chunkArray(artistIds, 10);
  const snapshots = await Promise.all(
    chunks
      .filter((chunk) => chunk.length > 0)
      .map((chunk) =>
        getDocs(
          query(collection(db, "users"), where(documentId(), "in", chunk))
        )
      )
  );

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((artistDoc) => {
      const artist = {
        id: artistDoc.id,
        ...artistDoc.data(),
      } as PublicArtist;

      if (artist.role === "artist") {
        artistsById[artistDoc.id] = artist;
      }
    });
  });

  const shopsById = await fetchShopsById(
    Array.from(
      new Set(
        Object.values(artistsById)
          .map((artist) => artist.shopId)
          .filter((shopId): shopId is string => Boolean(shopId))
      )
    )
  );

  Object.values(artistsById).forEach((artist) => {
    if (!artist.shopId) return;

    const shop = shopsById[artist.shopId];
    if (!shop?.name) return;

    artist.shopName = artist.shopName || shop.name;
    artist.studioName = artist.studioName || shop.name;
  });

  return artistsById;
};

const fetchShopsById = async (shopIds: string[]) => {
  const shopsById: Record<string, ShopLookup> = {};
  const chunks = chunkArray(shopIds, 10);
  const snapshots = await Promise.all(
    chunks
      .filter((chunk) => chunk.length > 0)
      .map((chunk) =>
        getDocs(
          query(collection(db, "shops"), where(documentId(), "in", chunk))
        )
      )
  );

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((shopDoc) => {
      const data = shopDoc.data();
      shopsById[shopDoc.id] = {
        id: shopDoc.id,
        name: typeof data.name === "string" ? data.name : undefined,
      };
    });
  });

  return shopsById;
};

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const shuffleItems = <T,>(items: T[]) =>
  [...items].sort(() => Math.random() - 0.5);

const isMarketplaceReady = (item: HomeFlash | HomeFlashSheet) => {
  if (item.marketplaceVisible === false) return false;
  if (item.artistStripeConnectReady === true) return true;
  return isStripeConnectReady(item.artist);
};

const getArtistName = (artist?: PublicArtist) =>
  artist?.displayName || artist?.name || "SATX Ink artist";

const getArtistStudioLabel = (artist: PublicArtist) =>
  artist.shopName ||
  artist.studioName ||
  getShopIdLabel(artist.shopId) ||
  "San Antonio artist";

const getHomepageFeatureImageUrl = (image: PublicHomepageFeatureImage) =>
  image.webp90Url || image.imageUrl || image.fullUrl || image.thumbUrl || "";

const getHomepageFeaturePreviewUrl = (image: PublicHomepageFeatureImage) =>
  image.thumbUrl || image.webp90Url || image.imageUrl || image.fullUrl || "";

const getHomepageFeatureSlides = (
  artist: PublicArtist | null,
  artistName: string
): FeaturedArtistSlide[] => {
  const feature = artist?.homepageFeature;
  const fallbackAlt = artist
    ? `${artistName} featured artist image`
    : "SATX Ink artist work";
  const featureAlt = feature?.imageAlt?.trim() || fallbackAlt;
  const images = Array.isArray(feature?.images) ? [...feature.images] : [];
  const slides = images
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map((image, index) => {
      const url = getHomepageFeatureImageUrl(image);
      if (!url) return null;

      return {
        id: image.id || `homepage-feature-${index}`,
        url,
        previewUrl: getHomepageFeaturePreviewUrl(image),
        alt: image.imageAlt?.trim() || featureAlt,
      };
    })
    .filter((slide): slide is FeaturedArtistSlide => Boolean(slide))
    .slice(0, 4);

  if (slides.length > 0) return slides;

  if (feature?.imageUrl) {
    return [
      {
        id: "homepage-feature-legacy",
        url: feature.imageUrl,
        previewUrl: feature.imageUrl,
        alt: featureAlt,
      },
    ];
  }

  if (artist?.avatarUrl) {
    return [
      {
        id: "homepage-feature-avatar",
        url: artist.avatarUrl,
        previewUrl: artist.avatarUrl,
        alt: fallbackAlt,
      },
    ];
  }

  return [];
};

const getShopIdLabel = (shopId?: string) => {
  if (!shopId) return "";

  return shopId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
