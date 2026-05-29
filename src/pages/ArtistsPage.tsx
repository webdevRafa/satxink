import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// @ts-expect-error aos does not ship the type shape used by this app.
import AOS from "aos";
import "aos/dist/aos.css";

import { collection, getDocs, query, where } from "firebase/firestore";
import {
  ArrowRight,
  Image as ImageIcon,
  Palette,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import CountUp from "react-countup";
import { Link, useSearchParams } from "react-router-dom";
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

type TimestampLike = {
  toMillis: () => number;
};

type ArtistGridItem =
  | {
      type: "artist";
      artist: Artist;
    }
  | {
      type: "spotlight";
      id: string;
      artist: Artist;
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

const hasToMillis = (value: unknown): value is TimestampLike =>
  typeof value === "object" &&
  value !== null &&
  "toMillis" in value &&
  typeof (value as TimestampLike).toMillis === "function";

const getGalleryItemTime = (item: GalleryItem) => {
  const { createdAt } = item;
  if (hasToMillis(createdAt)) return createdAt.toMillis();
  if (createdAt instanceof Date) return createdAt.getTime();
  return 0;
};

const getGalleryPreviewUrl = (item: GalleryItem) =>
  item.thumbUrl || item.webp90Url || item.fullUrl;

const chunkArray = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size)
  );

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const shuffleArray = <T,>(items: T[]) => {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
};

const getHashNumber = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
};

const getStableRandomUnit = (value: string) =>
  (getHashNumber(value) % 10000) / 10000;

const getSpotlightInterval = (seed: string) =>
  getStableRandomUnit(seed) < 0.5 ? 9 : 12;

const getArtistGridItems = (artists: Artist[]): ArtistGridItem[] => {
  const items: ArtistGridItem[] = [];
  let cycle = 0;
  const sequenceSeed = artists[0]?.id || "artists";
  let standardCardsUntilSpotlight = getSpotlightInterval(
    `${sequenceSeed}-initial`
  );
  let standardCardsInSegment = 0;

  artists.forEach((artist) => {
    if (standardCardsInSegment >= standardCardsUntilSpotlight) {
      items.push({
        type: "spotlight",
        id: `spotlight-${cycle}-${artist.id}`,
        artist,
      });

      cycle += 1;
      standardCardsInSegment = 0;
      standardCardsUntilSpotlight = getSpotlightInterval(
        `${sequenceSeed}-${artist.id}-${cycle}`
      );
      return;
    }

    items.push({ type: "artist", artist });
    standardCardsInSegment += 1;
  });

  return items;
};

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

function useScrollScaledOpacity() {
  const targetRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const shouldTrackRef = useRef(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const updateProgress = () => {
      const rect = target.getBoundingClientRect();
      const targetTop = rect.top + window.scrollY;
      const fadeDistance = Math.max(target.offsetHeight * 0.78, 340);
      const scrollDistance = window.scrollY - targetTop;
      const nextProgress = clamp(scrollDistance / fadeDistance, 0, 1);

      setProgress((current) =>
        Math.abs(current - nextProgress) > 0.005 ? nextProgress : current
      );
    };

    const scheduleProgressUpdate = () => {
      if (!shouldTrackRef.current || frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        updateProgress();
      });
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        shouldTrackRef.current =
          entry.isIntersecting || entry.boundingClientRect.top < 0;
        scheduleProgressUpdate();
      },
      {
        rootMargin: "0px 0px 35% 0px",
        threshold: [0, 0.15, 0.35, 0.6, 0.85, 1],
      }
    );

    observer.observe(target);
    updateProgress();

    window.addEventListener("scroll", scheduleProgressUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleProgressUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scheduleProgressUpdate);
      window.removeEventListener("resize", scheduleProgressUpdate);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return { targetRef, progress };
}

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

function useScrollParallax(strength = 48) {
  const targetRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const shouldTrackRef = useRef(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const updateOffset = () => {
      const rect = target.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      const progress = clamp(
        (viewportHeight - rect.top) / (viewportHeight + rect.height),
        0,
        1
      );
      const nextOffset = (progress - 0.5) * strength;

      setOffset((current) =>
        Math.abs(current - nextOffset) > 0.25 ? nextOffset : current
      );
    };

    const scheduleOffsetUpdate = () => {
      if (!shouldTrackRef.current || frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        updateOffset();
      });
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        shouldTrackRef.current = entry.isIntersecting;
        scheduleOffsetUpdate();
      },
      {
        rootMargin: "35% 0px 35% 0px",
        threshold: 0,
      }
    );

    observer.observe(target);
    updateOffset();

    window.addEventListener("scroll", scheduleOffsetUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleOffsetUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scheduleOffsetUpdate);
      window.removeEventListener("resize", scheduleOffsetUpdate);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [strength]);

  return { targetRef, offset };
}

export const ArtistsPage = () => {
  const isStylesVisible = useStickyReveal(5);
  const { targetRef: heroRef, progress: heroFadeProgress } =
    useScrollScaledOpacity();
  const { targetRef: metricsRef, entryCount: metricEntryCount } =
    useViewportEntry<HTMLDivElement>();
  const [searchParams] = useSearchParams();
  const styleFromUrl = searchParams.get("style") || "";

  const [artists, setArtists] = useState<Artist[]>([]);
  const [galleryPreviewByArtist, setGalleryPreviewByArtist] = useState<
    Record<string, ArtistPreview | null>
  >({});
  const [loading, setLoading] = useState(true);
  const [showInitialSkeleton, setShowInitialSkeleton] = useState(true);
  const [isSkeletonExiting, setIsSkeletonExiting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [specialtyFilter, setSpecialtyFilter] = useState(styleFromUrl);

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
        const docs = shuffleArray(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<Artist, "id">),
          }))
        ).filter(isVisibleArtist);

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

  useEffect(() => {
    setSpecialtyFilter(styleFromUrl);
  }, [styleFromUrl]);

  const filteredArtists = useMemo(
    () =>
      specialtyFilter
        ? artists.filter((artist) =>
            artist.specialties?.some((tag) =>
              tag.toLowerCase().includes(specialtyFilter.toLowerCase())
            )
          )
        : artists,
    [artists, specialtyFilter]
  );

  const visibleArtists = useMemo(
    () => filteredArtists.slice(0, visibleCount),
    [filteredArtists, visibleCount]
  );
  const artistGridItems = useMemo(
    () => getArtistGridItems(visibleArtists),
    [visibleArtists]
  );
  const hasMore = visibleCount < filteredArtists.length;
  const visibleArtistIdKey = useMemo(
    () => visibleArtists.map((artist) => artist.id).join("|"),
    [visibleArtists]
  );
  const isInitialLoading = loading && artists.length === 0;
  const previewLookupsPending =
    visibleArtists.length > 0 &&
    visibleArtists.some((artist) => !(artist.id in galleryPreviewByArtist));
  const shouldHoldInitialSkeleton =
    isInitialLoading || (showInitialSkeleton && previewLookupsPending);
  const activeStyleLabel = specialtyFilter || "All styles";
  const filteredArtistLabel =
    loading && artists.length === 0
      ? "Loading artists"
      : `${filteredArtists.length} ${
          filteredArtists.length === 1 ? "artist" : "artists"
        }`;
  const totalArtistValue =
    loading && artists.length === 0 ? "..." : String(artists.length);
  const totalArtistCount = loading && artists.length === 0 ? 0 : artists.length;
  const heroOpacity = 1 - heroFadeProgress;
  const heroFadeStyle = {
    opacity: heroOpacity,
    transform: `translate3d(0, -${heroFadeProgress * 18}px, 0) scale(${
      1 - heroFadeProgress * 0.025
    })`,
    transformOrigin: "center top",
    willChange: "opacity, transform",
  };
  const heroArtworkStyle = {
    opacity: heroOpacity,
    transform: `translate3d(0, ${heroFadeProgress * 22}px, 0) scale(${
      1 + heroFadeProgress * 0.035
    })`,
    transformOrigin: "center bottom",
    willChange: "opacity, transform",
  };
  const heroMetrics = [
    {
      label: "Verified artists",
      value: totalArtistValue,
      countValue: totalArtistCount,
      icon: Users,
    },
    {
      label: "Style paths",
      value: String(SPECIALTIES.length),
      countValue: SPECIALTIES.length,
      icon: Palette,
    },
    {
      label: "Current view",
      value: activeStyleLabel,
      icon: Search,
    },
  ];

  useEffect(() => {
    if (shouldHoldInitialSkeleton) {
      setShowInitialSkeleton(true);
      setIsSkeletonExiting(false);
      return;
    }

    if (!showInitialSkeleton) return;

    setIsSkeletonExiting(true);
    const timeout = window.setTimeout(() => {
      setShowInitialSkeleton(false);
    }, 360);

    return () => clearTimeout(timeout);
  }, [shouldHoldInitialSkeleton, showInitialSkeleton]);

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
        if (!ignore) {
          setGalleryPreviewByArtist((current) => ({
            ...current,
            ...Object.fromEntries(
              missingArtistIds.map((artistId) => [artistId, null])
            ),
          }));
        }
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
    <main className="relative min-h-[calc(100vh-4rem)] bg-[var(--color-bg-base)] pb-12">
      <section
        ref={heroRef}
        data-aos="fade-in"
        className="relative isolate overflow-hidden border-b border-white/[0.08] bg-[#090909] px-4 pt-20 sm:pt-24 lg:pt-20"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "54px 54px",
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black via-black/70 to-transparent"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[var(--color-bg-base)] via-[#090909]/75 to-transparent"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent opacity-80"
          aria-hidden="true"
        />
        <img
          className="pointer-events-none absolute left-1/2 top-14 w-[min(94vw,700px)] -translate-x-1/2 opacity-[0.055] blur-[0.5px] sm:top-10 lg:top-4"
          style={{ opacity: 0.055 * heroOpacity }}
          src={sa}
          alt=""
          aria-hidden="true"
        />

        <div className="relative mx-auto grid min-h-[320px] max-w-[1300px] gap-8 pb-7 pt-0 lg:min-h-[340px] lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end lg:pb-8">
          <div className="max-w-3xl pb-2" style={heroFadeStyle}>
            <div>
              <div className="flex flex-nowrap items-center gap-2 sm:gap-3">
                <h1 className="mb-0! whitespace-nowrap text-[2rem]! font-bold leading-none text-white! sm:text-5xl! lg:text-6xl!">
                  Find Your Artist
                </h1>
                <span className="inline-flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.05] shadow-[0_16px_45px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-12 sm:w-20 lg:hidden">
                  <img
                    className="h-6 w-10 object-contain sm:h-8 sm:w-14"
                    src={gun}
                    alt=""
                    aria-hidden="true"
                  />
                </span>
              </div>

              <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-300! sm:text-lg">
                Browse verified San Antonio tattooers by style, portfolio
                preview, and the kind of work you want to wear next.
              </p>
            </div>

            <div
              ref={metricsRef}
              className="mt-5 grid max-w-2xl grid-cols-3 gap-2 sm:mt-6 sm:gap-3"
            >
              {heroMetrics.map((metric) => {
                const Icon = metric.icon;
                const shouldAnimateCount =
                  typeof metric.countValue === "number" && metricEntryCount > 0;

                return (
                  <div
                    key={metric.label}
                    className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.035] px-2 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-4 sm:py-3"
                  >
                    <dt className="flex items-start gap-1.5 text-[10px] font-medium leading-tight text-neutral-400 sm:items-center sm:gap-2 sm:text-xs">
                      <Icon
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary-hover)] sm:mt-0 sm:h-4 sm:w-4"
                        aria-hidden="true"
                      />
                      {metric.label}
                    </dt>
                    <dd className="mt-1 truncate text-base font-semibold leading-tight text-white sm:text-lg">
                      {shouldAnimateCount ? (
                        <CountUp
                          key={`${metric.label}-${metricEntryCount}-${metric.countValue}`}
                          end={metric.countValue}
                          duration={1.4}
                          separator=","
                        />
                      ) : (
                        metric.value
                      )}
                    </dd>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className="relative hidden h-[270px] lg:block"
            style={heroArtworkStyle}
            aria-hidden="true"
          >
            <img
              className="absolute bottom-16 left-1/2 w-[360px] -translate-x-1/2 opacity-35 drop-shadow-[0_26px_32px_rgba(0,0,0,0.7)]"
              src={sa}
              alt=""
            />
            <div className="absolute right-2 top-8 inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#101010]/80 px-3 py-2 text-xs font-semibold text-neutral-200 shadow-2xl shadow-black/40 backdrop-blur">
              <Sparkles
                className="h-4 w-4 text-[var(--color-primary-hover)]"
                aria-hidden="true"
              />
              Curated Local Work
            </div>
            <img
              className="absolute bottom-3 right-3 h-20 rotate-[-10deg] opacity-90 drop-shadow-[0_24px_32px_rgba(182,56,45,0.26)]"
              src={gun}
              alt=""
            />
          </div>
        </div>
      </section>

      <div
        className={`sticky top-18 z-30 border-b border-white/[0.08] bg-[#0b0b0b]/90 backdrop-blur-xl transition-transform duration-300 ${
          !isStylesVisible ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="mx-auto max-w-[1300px] px-4 py-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-neutral-300">
              <Palette
                className="h-4 w-4 text-[var(--color-primary-hover)]"
                aria-hidden="true"
              />
              Style filters
            </div>
            <div className="inline-flex items-center gap-2 text-xs text-neutral-400">
              <span className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-neutral-200">
                {activeStyleLabel}
              </span>
              <span>{filteredArtistLabel}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {SPECIALTIES.map((tag) => {
              const selected = specialtyFilter === tag;

              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={selected}
                  className={`min-h-9 rounded-lg border px-3! py-2! text-xs! font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-hover)]/50 ${
                    selected
                      ? "border-[var(--color-primary-hover)] bg-[var(--color-primary)]/24 text-white shadow-[0_0_24px_rgba(182,56,45,0.24),inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "border-white/[0.14] bg-white/[0.035] text-neutral-200 hover:-translate-y-0.5 hover:border-white/35 hover:bg-white/[0.08] hover:text-white"
                  }`}
                  onClick={() =>
                    setSpecialtyFilter(specialtyFilter === tag ? "" : tag)
                  }
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section className="relative mx-auto mt-6 max-w-[1300px] px-4">
        <div className="relative min-h-[520px]">
          {!isInitialLoading && (
            <>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                {artistGridItems.map((item) => {
                  if (item.type === "spotlight") {
                    const galleryPreview =
                      galleryPreviewByArtist[item.artist.id] || undefined;

                    return (
                      <div
                        data-aos="fade-in"
                        key={item.id}
                        className="sm:col-span-2 md:col-span-3"
                      >
                        <ArtistSpotlightCard
                          artist={item.artist}
                          preview={galleryPreview}
                        />
                      </div>
                    );
                  }

                  const { artist } = item;
                  const galleryPreview =
                    galleryPreviewByArtist[artist.id] || undefined;

                  return (
                    <div data-aos="fade-in" key={artist.id}>
                      <ArtistPreviewCard
                        artist={artist}
                        preview={galleryPreview}
                      />
                    </div>
                  );
                })}
              </div>
              {visibleArtists.length > 0 && (
                <div
                  ref={lastArtistRef}
                  className="h-px"
                  aria-hidden="true"
                />
              )}
            </>
          )}

          {showInitialSkeleton && (
            <div
              className={`transition-opacity duration-300 ease-out ${
                isSkeletonExiting
                  ? "pointer-events-none absolute inset-0 opacity-0"
                  : "opacity-100"
              }`}
            >
              <ArtistsPageSkeleton />
            </div>
          )}
        </div>

        {loading && !isInitialLoading && (
          <p className="mt-6 text-center text-gray-400">Loading artists...</p>
        )}
        {!hasMore && !loading && visibleArtists.length > 0 && (
          <p className="mt-6 text-center text-gray-500">
            No more artists to show.
          </p>
        )}
      </section>
    </main>
  );
};

type ArtistSpotlightCardProps = {
  artist: Artist;
  preview?: ArtistPreview;
};

const ArtistPreviewCard = ({
  artist,
  preview,
}: ArtistSpotlightCardProps) => (
  <Link to={`/artists/${artist.id}`}>
    <ArtistCard
      name={getArtistDisplayName(artist)}
      avatarUrl={artist.avatarUrl}
      specialties={artist.specialties}
      likedBy={artist.likedBy || []}
      previewUrl={preview?.url}
      previewAlt={preview?.alt}
    />
  </Link>
);

const ArtistSpotlightCard = ({ artist, preview }: ArtistSpotlightCardProps) => {
  const { targetRef, offset } = useScrollParallax(80);
  const displayName = getArtistDisplayName(artist);
  const visibleSpecialties = artist.specialties?.slice(0, 5) || [];

  return (
    <Link to={`/artists/${artist.id}`} className="group block">
      <article
        ref={targetRef}
        className="relative isolate min-h-[440px] overflow-hidden rounded-lg border border-white/[0.08] bg-[#111] shadow-[0_24px_90px_rgba(0,0,0,0.45)] transition duration-500 hover:border-white/20 sm:min-h-[480px] lg:min-h-[360px]"
      >
        {preview?.url ? (
          <img
            src={preview.url}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-x-0 -top-12 h-[calc(100%+6rem)] w-full scale-110 object-cover opacity-30 blur-[1px] saturate-[0.82] transition duration-700 group-hover:opacity-[0.38]"
            style={{
              transform: `translate3d(0, ${offset}px, 0) scale(1.12)`,
              willChange: "transform",
            }}
          />
        ) : (
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(182,56,45,0.26),transparent_35%),linear-gradient(135deg,#151515,#080808)]"
            aria-hidden="true"
          />
        )}

        <div
          className="absolute inset-0 bg-gradient-to-r from-black/86 via-black/70 to-black/86"
          aria-hidden="true"
        />
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          aria-hidden="true"
        />
        <span
          className="spotlight-border-glint spotlight-border-glint--left"
          aria-hidden="true"
        />
        <span
          className="spotlight-border-glint spotlight-border-glint--right"
          aria-hidden="true"
        />

        <div className="relative z-10 grid min-h-[440px] grid-cols-1 items-center gap-6 px-5 py-7 sm:min-h-[480px] sm:px-8 lg:min-h-[360px] lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-10 lg:px-12 lg:py-10">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <img
              src={artist.avatarUrl || "/fallback.jpg"}
              alt={displayName}
              className="h-16 w-16 rounded-full border border-white/20 object-cover shadow-[0_18px_40px_rgba(0,0,0,0.45)] sm:h-20 sm:w-20"
            />

            <h2 className="mb-0! mt-4 text-3xl! font-bold leading-tight text-white! sm:text-4xl!">
              {displayName}
            </h2>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {visibleSpecialties.length > 0 ? (
                visibleSpecialties.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-neutral-100"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-neutral-300">
                  Style details coming soon
                </span>
              )}
            </div>

            <span className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.07] px-4 py-2 text-sm font-semibold text-white transition duration-300 group-hover:border-[var(--color-primary-hover)]/70 group-hover:bg-[var(--color-primary)]/20">
              View artist profile
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>

          <div className="relative mx-auto h-[210px] w-full max-w-[420px] overflow-hidden rounded-lg border border-white/[0.1] bg-white/[0.045] shadow-[0_22px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] sm:h-[260px] lg:mx-0">
            {preview?.url ? (
              <img
                src={preview.url}
                alt={preview.alt || `${displayName} portfolio preview`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-neutral-400">
                <ImageIcon
                  className="h-9 w-9 text-[var(--color-primary-hover)]/80"
                  aria-hidden="true"
                />
                <span className="max-w-44 text-sm font-medium">
                  Portfolio feature image pending
                </span>
              </div>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
};

const ArtistsPageSkeleton = () => (
  <div
    className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3"
    aria-busy="true"
  >
    {Array.from({ length: 9 }).map((_, index) => (
      <div
        key={index}
        className="skeleton-sheen h-[148px] rounded-lg border border-white/5 bg-gradient-to-r from-[#121212] via-[#181818] to-[#202020] p-4 shadow-md"
      >
        <div className="grid h-full grid-cols-[72px_minmax(0,1fr)_72px] gap-4 sm:grid-cols-[72px_minmax(0,1fr)_86px]">
          <div className="my-auto h-16 w-16 rounded-full border border-white/10 bg-gradient-to-br from-white/[0.11] to-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />
          <div className="flex h-full min-w-0 flex-col justify-center">
            <div className="h-5 w-36 rounded-md bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" />
            <div className="mt-3 flex h-[48px] flex-wrap content-start gap-1.5 overflow-hidden">
              <div className="h-6 w-20 rounded-full border border-white/10 bg-white/[0.05]" />
              <div className="h-6 w-16 rounded-full border border-white/10 bg-white/[0.05]" />
              <div className="hidden h-6 w-24 rounded-full border border-white/10 bg-white/[0.05] sm:block" />
            </div>
            <div className="h-9 w-24 rounded-md bg-white/[0.06] opacity-0" />
          </div>
          <div className="h-full overflow-hidden rounded-md border border-white/10 bg-gradient-to-br from-white/[0.09] via-white/[0.035] to-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" />
        </div>
      </div>
    ))}
    <span className="sr-only">Loading artists</span>
  </div>
);
