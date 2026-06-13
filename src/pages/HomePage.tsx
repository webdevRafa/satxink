import {
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
  MapPin,
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
    updatedAt?: unknown;
  };
  role?: string;
  isVerified?: boolean | "true" | "false";
} & StripeConnectLike;

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

type ShopLookup = {
  id: string;
  name?: string;
};

const featuredStyles = FEATURED_TATTOO_STYLES;

const HOME_FLASH_FETCH_LIMIT = 40;
const HOME_SHEET_FETCH_LIMIT = 24;

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
  const { targetRef: heroStatsRef, entryCount: heroStatsEntryCount } =
    useViewportEntry<HTMLDListElement>();
  const [flashes, setFlashes] = useState<HomeFlash[]>([]);
  const [sheets, setSheets] = useState<HomeFlashSheet[]>([]);
  const [featuredArtist, setFeaturedArtist] = useState<PublicArtist | null>(
    null
  );
  const [featuredPreviewItems, setFeaturedPreviewItems] = useState<
    FeaturedPreviewItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isDesktopHeroImageReady, setIsDesktopHeroImageReady] =
    useState(false);
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

        const [flashSnapshot, sheetSnapshot] = await Promise.all([
          getDocs(
            query(collection(db, "flashes"), limit(HOME_FLASH_FETCH_LIMIT))
          ),
          getDocs(
            query(collection(db, "flashSheets"), limit(HOME_SHEET_FETCH_LIMIT))
          ),
        ]);
        const homepageSettingsSnap = await getDoc(
          doc(db, "siteSettings", "homepage")
        );
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
    const delay = prefersReducedMotion ? 0 : 3000;
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

          @media (min-width: 1024px) {
            .satx-home-hero-copy {
              align-self: start;
              padding-top: clamp(13.5rem, 24svh, 17rem);
            }
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
        <img
          src={heroImageMobile}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-80 blur-[3px] md:hidden"
        />
        <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_78%_28%,rgba(255,255,255,0.12),transparent_28%),linear-gradient(90deg,rgba(0,0,0,0.94),rgba(0,0,0,0.58),rgba(0,0,0,0.86))]" />
        <div className="absolute inset-x-0 top-0 z-[2] h-32 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-[2] h-40 bg-gradient-to-t from-[#0d0d0d] to-transparent" />

        <div className="relative z-10 mx-auto grid min-h-[calc(100svh-72px)] max-w-7xl items-center gap-10 px-5 pb-12 pt-28 mt-10 md:mt-10 md:px-8 md:pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)] lg:gap-12 lg:pb-20 lg:pt-32">
          <div className="satx-home-hero-copy max-w-3xl">
            <h1 className="max-w-3xl text-2xl! font-bold leading-[0.98] text-white md:text-5xl!">
              Find the best tattoo artists in San Antonio, Texas.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/70 md:text-lg">
              Browse verified artists, discover ready-to-request flash, compare
              styles, and move from discovery to a tattoo request with less
              guesswork.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/artists"
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/20 bg-white/[0.09] px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(0,0,0,0.22)] transition hover:border-white/35 hover:bg-white/[0.14]"
              >
                Browse artists
                <ArrowRight size={17} className="text-white" />
              </Link>
              <Link
                to="/flash"
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/80 backdrop-blur transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
              >
                Explore flash
                <ChevronRight size={17} />
              </Link>
            </div>

            <dl
              ref={heroStatsRef}
              className="mt-10 inline-grid max-w-full grid-cols-[max-content_max-content_max-content] gap-x-5 gap-y-3 sm:mt-12 sm:gap-x-10"
            >
              {heroStats.map((stat) => (
                <div key={stat.label} className="flex min-w-0 flex-col">
                  <dt className="order-2 mt-1 text-[11px] font-medium leading-tight text-white/50 sm:text-sm">
                    {stat.label}
                  </dt>
                  <dd className="order-1 text-xl font-semibold leading-none text-white sm:text-2xl">
                    {stat.loading ? (
                      "..."
                    ) : heroStatsEntryCount > 0 ? (
                      <CountUp
                        key={`${stat.label}-${heroStatsEntryCount}-${stat.value}`}
                        end={stat.value}
                        duration={1.4}
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
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            kicker="Browse by style"
            title="Start with the look you already know you want."
            body="Use style as a shortcut into the artist directory, then compare portfolios until something feels right."
          />
          <div className="mt-7 flex flex-wrap gap-3">
            {featuredStyles.map((style) => (
              <Link
                key={style}
                to={`/artists?style=${encodeURIComponent(style)}`}
                className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
              >
                <Search
                  size={15}
                  className="text-white/35 group-hover:text-white/60"
                />
                {style}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden bg-[#121212] z-50 relative px-5 py-18 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <SectionHeader
              kicker="Flash marketplace"
              title="Ready-to-request work from SATX artists."
              body="Browse individual flash pieces when you want one design, or open a full sheet when you want to explore a whole collection."
            />
            <Link
              to="/flash"
              className="inline-flex w-fit items-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85"
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
          />

          <PreviewRail
            title="Flash sheets"
            emptyLabel="No marketplace-ready sheets yet."
            items={sheets}
            reverse
            renderItem={(sheet) => <SheetPreviewCard sheet={sheet} />}
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

const SectionHeader = ({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) => (
  <div className="max-w-3xl">
    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
      {kicker}
    </p>
    <h2 className="mt-3 text-3xl! font-semibold leading-tight text-white md:text-4xl!">
      {title}
    </h2>
    <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
      {body}
    </p>
  </div>
);

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
  if (loading) {
    return <HeroFeaturedArtistPanelSkeleton isRevealed={isRevealed} />;
  }

  const artistName = getArtistName(artist || undefined);
  const feature = artist?.homepageFeature;
  const story =
    feature?.story?.trim() ||
    artist?.bio ||
    "A SATX Ink artist spotlight is coming soon. Until then, explore local artists, compare styles, and find the work that feels right.";
  const quote = feature?.quote?.trim();
  const featureImage = feature?.imageUrl || artist?.avatarUrl || "";
  const featureImageAlt =
    feature?.imageAlt?.trim() ||
    (artist ? `${artistName} featured artist image` : "SATX Ink artist work");
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

      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-white/10 bg-black">
        <HeroFeaturedArtistImage src={featureImage} alt={featureImageAlt} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.78))]" />
        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80 backdrop-blur">
          <Sparkles size={13} aria-hidden="true" />
          Featured SATX Artist
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="max-w-md">
            <h2 className="text-2xl! font-semibold leading-tight text-white md:text-3xl!">
              {artist ? artistName : "Meet the next artist spotlight."}
            </h2>
            <p className="mt-2 flex items-center gap-2 text-sm font-medium text-white/60">
              <MapPin size={15} aria-hidden="true" />
              <span className="truncate">{shopLabel}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="p-3 pt-4 md:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="mt-2 text-xl! font-semibold leading-tight text-white md:text-2xl!">
              {artist
                ? `A closer look at ${artistName}.`
                : "A local spotlight is getting inked in."}
            </h3>
          </div>
          {artist?.avatarUrl && (
            <img
              src={artist.avatarUrl}
              alt={artistName}
              className="h-11 w-11 shrink-0 rounded-full border border-white/15 object-cover"
              loading="lazy"
            />
          )}
        </div>

        <p className="mt-3 min-h-24 line-clamp-4 text-sm leading-6 text-white/[0.62]">
          {story}
        </p>

        {quote && (
          <blockquote className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3">
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

        {visibleStyles.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {visibleStyles.map((style) => (
              <span
                key={style}
                className="rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-1 text-[11px] font-semibold text-white/65"
              >
                {style}
              </span>
            ))}
          </div>
        )}

        {previewItems.length > 0 && (
          <div className="mt-4 grid grid-cols-4 gap-2">
            {previewItems.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                to={item.href}
                className="group relative aspect-square overflow-hidden rounded-md border border-white/10 bg-black"
                aria-label={item.label}
              >
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-full w-full object-cover opacity-[0.82] transition duration-500 group-hover:scale-105 group-hover:opacity-100"
                  loading="lazy"
                />
                <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white/75">
                  {item.type}
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-5">
          {artist ? (
            <Link
              to={`/artists/${artist.id}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#0b0b0b]! shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(0,0,0,0.22)] transition hover:bg-white/85"
            >
              View artist profile
              <ArrowRight size={16} className="text-[#0b0b0b]!" />
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

const HeroFeaturedArtistImage = ({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) => {
  const [decodedSrc, setDecodedSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setDecodedSrc("");
    setFailed(false);

    if (!src) return;

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";

    const markDecoded = () => {
      if (!cancelled) setDecodedSrc(src);
    };

    const markFailed = () => {
      if (!cancelled) setFailed(true);
    };

    image.src = src;

    if (image.decode) {
      image
        .decode()
        .then(markDecoded)
        .catch(() => {
          if (image.complete && image.naturalWidth > 0) {
            markDecoded();
          } else {
            markFailed();
          }
        });
    } else {
      image.onload = markDecoded;
      image.onerror = markFailed;
    }

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src || failed) {
    return (
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_34%_18%,rgba(255,255,255,0.12),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.018)_48%,rgba(0,0,0,0.38))]">
        <div className="flex h-full items-center justify-center">
          <ImageOff size={38} className="text-white/18" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`preview-loading-sheen absolute inset-0 transition-opacity duration-300 ${
          decodedSrc ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden="true"
      />
      {decodedSrc && (
        <img
          key={decodedSrc}
          src={decodedSrc}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover opacity-[0.88] transition-opacity duration-500"
          loading="eager"
          decoding="async"
        />
      )}
    </>
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
}: {
  title: string;
  emptyLabel: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  reverse?: boolean;
}) => {
  const trackItems = items.length > 0 ? [...items, ...items] : [];

  return (
    <div className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl! font-semibold text-white">{title}</h3>
        <span className="text-sm text-white/35">
          {items.length} preview{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {items.length > 0 ? (
        <div className="satx-home-marquee overflow-x-auto md:overflow-hidden">
          <div
            className="satx-home-marquee-track flex snap-x items-stretch gap-4 pb-2"
            style={{
              animationDirection: reverse ? "reverse" : "normal",
            }}
          >
            {trackItems.map((item, index) => (
              <div
                key={index}
                className="flex w-[220px] shrink-0 snap-start sm:w-[240px]"
              >
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        </div>
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
      <div className="flex min-h-[118px] flex-1 flex-col p-3">
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
      <div className="relative h-[180px] shrink-0 overflow-hidden bg-[#f4f1ea] sm:h-[184px]">
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

  for (const chunk of chunks) {
    if (!chunk.length) continue;

    const artistsQuery = query(
      collection(db, "users"),
      where(documentId(), "in", chunk)
    );

    const snapshot = await getDocs(artistsQuery);

    snapshot.docs.forEach((artistDoc) => {
      const artist = {
        id: artistDoc.id,
        ...artistDoc.data(),
      } as PublicArtist;

      if (artist.role === "artist") {
        artistsById[artistDoc.id] = artist;
      }
    });
  }

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

  for (const chunk of chunks) {
    if (!chunk.length) continue;

    const shopsQuery = query(
      collection(db, "shops"),
      where(documentId(), "in", chunk)
    );
    const snapshot = await getDocs(shopsQuery);

    snapshot.docs.forEach((shopDoc) => {
      const data = shopDoc.data();
      shopsById[shopDoc.id] = {
        id: shopDoc.id,
        name: typeof data.name === "string" ? data.name : undefined,
      };
    });
  }

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

const getShopIdLabel = (shopId?: string) => {
  if (!shopId) return "";

  return shopId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
