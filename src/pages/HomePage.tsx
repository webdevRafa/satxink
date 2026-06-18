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
  ChevronRight,
  ImageOff,
  Layers,
  Quote,
  Search,
  Sparkles,
  Tag,
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
import heroImageMobile from "../assets/images/heroImageMobile.webp";
import type { Flash } from "../types/Flash";
import type { FlashSheet } from "../types/FlashSheet";
import { FEATURED_TATTOO_STYLES } from "../types/TattooStyle";
import {
  isStripeConnectReady,
  type StripeConnectLike,
} from "../utils/stripeConnect";
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

const HOME_FLASH_FETCH_LIMIT = 40;
const HOME_SHEET_FETCH_LIMIT = 24;
const HERO_FEATURED_ARTIST_SLIDE_DELAY_MS = 5200;
const loadedFeaturedArtistSlideUrls = new Set<string>();

function useViewportEntry<T extends Element>() {
  const targetRef = useRef<T | null>(null);
  const isInViewRef = useRef(false);
  const [entryCount, setEntryCount] = useState(0);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isInViewRef.current) {
          isInViewRef.current = true;
          setEntryCount((count) => count + 1);
        } else if (!entry.isIntersecting) {
          isInViewRef.current = false;
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
  const [loading, setLoading] = useState(true);
  const [isDesktopHeroImageReady, setIsDesktopHeroImageReady] = useState(false);
  const [isMobileHeroImageReady, setIsMobileHeroImageReady] = useState(false);
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
    let isCancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.src = heroImageMobile;

    const markReady = () => {
      if (!isCancelled) setIsMobileHeroImageReady(true);
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

        const [flashSnapshot, sheetSnapshot, homepageSettingsSnap] =
          await Promise.all([
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
      } catch (err) {
        console.error("Failed to fetch homepage preview data:", err);
        if (isMounted) {
          setFlashes([]);
          setSheets([]);
          setFeaturedArtist(null);
          setFeaturedPreviewItems([]);
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
  const isHeroCopyRevealed = heroCopyEntryCount > 0;
  const isStyleSectionRevealed = styleSectionEntryCount > 0;
  const isMarketplaceSectionRevealed = marketplaceSectionEntryCount > 0;

  return (
    <main className="bg-[#0d0d0d] text-white">
      <style>
        {`
          @keyframes satx-home-marquee {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }

          .satx-home-marquee-track {
            animation: satx-home-marquee 180s linear infinite;
            will-change: transform;
            width: max-content;
          }

          .satx-home-marquee:hover .satx-home-marquee-track,
          .satx-home-marquee:focus-within .satx-home-marquee-track {
            animation-play-state: paused;
          }

          @media (max-width: 767px) {
            .satx-home-marquee-track {
              animation: none;
              width: 100%;
            }
          }

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

          .satx-home-hero-mobile-image {
            position: absolute;
            inset: -12px;
            min-height: calc(100dvh + 24px);
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

          .satx-home-hero-mobile-image--ready {
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
              transform: translate3d(34px, 0, 0) scale(0.985);
              filter: blur(8px);
            }

            to {
              opacity: 1;
              transform: translate3d(0, 0, 0) scale(1);
              filter: blur(0);
            }
          }

          .satx-home-feature-panel {
            opacity: 0;
            transform: translate3d(34px, 0, 0) scale(0.985);
            filter: blur(8px);
            pointer-events: none;
            will-change: opacity, transform, filter;
          }

          .satx-home-feature-panel--visible {
            animation: satx-feature-panel-enter 760ms cubic-bezier(0.2, 0.86, 0.24, 1) both;
            pointer-events: auto;
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
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black md:hidden"
          aria-hidden="true"
        >
          <div
            className={`satx-home-hero-mobile-image${
              isMobileHeroImageReady
                ? " satx-home-hero-mobile-image--ready"
                : ""
            }`}
            style={{
              backgroundImage: isMobileHeroImageReady
                ? `url(${heroImageMobile})`
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
                Ready-to-request work from SATX artists.
              </h2>
              <p className="satx-market-motion satx-market-motion--body mt-3 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
                Browse individual flash pieces when you want one design, or open
                a full sheet when you want to explore a whole collection.
              </p>
            </div>
            <Link
              to="/flash"
              className="satx-market-motion satx-market-motion--cta inline-flex w-fit items-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85"
            >
              Browse marketplace
              <ArrowRight size={16} className="text-[#0b0b0b]!" />
            </Link>
          </div>

          <PreviewRail
            title="Individual flash"
            emptyLabel="No marketplace-ready flash yet."
            items={flashes}
            renderItem={(flash) => <FlashPreviewCard flash={flash} />}
            railIndex={0}
          />

          <PreviewRail
            title="Flash sheets"
            emptyLabel="No marketplace-ready sheets yet."
            items={sheets}
            reverse
            renderItem={(sheet) => <SheetPreviewCard sheet={sheet} />}
            railIndex={1}
          />
        </div>
      </section>

      <section className="border-t border-white/5 bg-[#171717] px-5 py-20 text-center md:px-8  z-50 relative">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
            Start the conversation
          </p>
          <h2 className="mt-3 text-3xl! font-semibold text-white md:text-4xl!">
            When the work feels right, reach out.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
            Compare artists, browse real flash, and send a focused request when
            you are ready to take the next step.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/artists"
              className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85"
            >
              Find artists
              <ArrowRight size={16} className="text-[#0b0b0b]!" />
            </Link>
          </div>
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

      <div className="relative isolate aspect-[4/3] overflow-hidden rounded-lg border border-white/10 bg-black">
        <HeroFeaturedArtistImageSlider slides={featureSlides} />
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
      </div>

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

const HeroFeaturedArtistImageSlider = ({
  slides,
}: {
  slides: FeaturedArtistSlide[];
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
    if (slides.length <= 1 || prefersReducedMotion) return;

    const timeoutId = window.setTimeout(() => {
      setActiveIndex((index) => {
        setPreviousIndex(index);
        return (index + 1) % slides.length;
      });
    }, HERO_FEATURED_ARTIST_SLIDE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeIndex,
    autoSlideResetKey,
    prefersReducedMotion,
    slides.length,
    slideSignature,
  ]);

  useEffect(() => {
    if (!nextSlide || slides.length <= 1) return;

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
  }, [nextSlide, slides.length]);

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
                state !== "hidden" || index === nextIndex || slides.length <= 2
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
      image.decode().then(markLoaded).catch(() => undefined);
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
      image.decode().then(markLoaded).catch(() => undefined);
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
            loading="eager"
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
  title,
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
  const trackItems = items.length > 0 ? [...items, ...items] : [];
  const railDelay = 700 + railIndex * 280;

  return (
    <div
      className="satx-market-rail-motion mt-10"
      style={{ "--market-rail-delay": `${railDelay}ms` } as CSSProperties}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl! font-semibold text-white">{title}</h3>
        <span className="text-sm text-white/35">
          {items.length} preview{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {items.length > 0 ? (
        <>
          <div className="satx-home-marquee hidden md:block md:overflow-hidden">
            <div
              className="satx-home-marquee-track flex items-stretch gap-4 pb-2"
              style={{
                animationDirection: reverse ? "reverse" : "normal",
              }}
            >
              {trackItems.map((item, index) => (
                <div
                  key={index}
                  className="satx-market-card-motion flex w-[220px] shrink-0 snap-start sm:w-[240px]"
                  style={
                    {
                      "--market-card-delay": `${
                        railDelay +
                        180 +
                        (index % Math.max(items.length, 1)) * 82
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

const SheetPreviewCard = ({ sheet }: { sheet: HomeFlashSheet }) => {
  const artistName = getArtistName(sheet.artist);

  return (
    <Link
      to={`/flash/sheets/${sheet.id}`}
      className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.055] via-[#111] to-[#0c0c0c] shadow-lg transition hover:border-white/20"
    >
      <div className="relative h-[180px] shrink-0 overflow-hidden bg-[#171717] sm:h-[184px]">
        {sheet.thumbUrl || sheet.imageUrl ? (
          <img
            src={sheet.thumbUrl || sheet.imageUrl}
            alt={sheet.title || "Flash sheet"}
            className="h-full w-full object-contain transition duration-500 group-hover:scale-[1.025]"
            loading="lazy"
          />
        ) : (
          <MissingImage />
        )}
      </div>
      <div className="flex min-h-[132px] flex-1 flex-col p-3">
        <div className="flex min-h-[46px] items-start gap-2">
          <ArtistAvatar artist={sheet.artist} name={artistName} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h4 className="my-0! min-w-0 flex-1 truncate text-sm! font-semibold text-white">
                {sheet.title || "Untitled flash sheet"}
              </h4>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.07] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/65">
                <Layers size={10} />
                Sheet
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-white/50">
              by {artistName}
            </p>
          </div>
        </div>
        <TagList tags={sheet.tags} />
      </div>
    </Link>
  );
};

const ArtistAvatar = ({
  artist,
  name,
}: {
  artist?: PublicArtist;
  name: string;
}) => {
  const artistName = getArtistName(artist);

  return (
    <span className="relative mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/[0.06] shadow-sm">
      {artist?.avatarUrl ? (
        <img
          src={artist.avatarUrl}
          alt={artistName}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-white/55">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
};

const TagList = ({ tags }: { tags?: string[] }) => {
  const visibleTags = tags?.slice(0, 2) || [];

  return (
    <div
      className="mt-auto flex h-6 min-w-0 flex-nowrap gap-1.5 overflow-hidden pt-1"
      aria-hidden={visibleTags.length === 0}
    >
      {visibleTags.map((tag) => (
        <span
          key={tag}
          className="inline-flex min-w-0 max-w-[104px] shrink items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-white/45"
        >
          <Tag size={11} className="shrink-0" />
          <span className="truncate">{tag}</span>
        </span>
      ))}
    </div>
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
