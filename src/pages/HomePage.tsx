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
  Search,
  Tag,
} from "lucide-react";
import CountUp from "react-countup";
import {
  collection,
  documentId,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import heroImage from "../assets/images/satx-inked.webp";
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
  studioName?: string;
  role?: string;
  isVerified?: boolean | "true" | "false";
} & StripeConnectLike;

type HomeFlash = Flash & {
  artist?: PublicArtist;
};

type HomeFlashSheet = FlashSheet & {
  artist?: PublicArtist;
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
  const [loading, setLoading] = useState(true);

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

        setFlashes(readyFlashes);
        setSheets(readySheets);
      } catch (err) {
        console.error("Failed to fetch homepage preview data:", err);
        if (isMounted) {
          setFlashes([]);
          setSheets([]);
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
        `}
      </style>

      <section className="relative min-h-[calc(100vh-72px)] overflow-hidden bg-black">
        <img
          src={heroImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.9),rgba(0,0,0,0.44),rgba(0,0,0,0.78))]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0d0d0d] to-transparent" />

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-72px)] max-w-7xl flex-col justify-end px-5 pb-16 pt-24 md:px-8 lg:pb-20">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold leading-[0.98] text-white">
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
                className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85"
              >
                Browse artists
                <ArrowRight size={17} className="text-[#0b0b0b]!" />
              </Link>
              <Link
                to="/flash"
                className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/80 backdrop-blur transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
              >
                Explore flash
                <ChevronRight size={17} />
              </Link>
            </div>
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
      </section>

      <section className="border-y border-white/5 bg-[#121212] px-5 py-18 md:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            kicker="How SATX Ink works"
            title="A cleaner way to find your next tattoo."
            body="Start with the artist, the style, the flash, or the event. SATX Ink keeps the discovery path simple so clients can move from browsing to booking with less guesswork."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <HowItWorksCard
              step="01"
              title="Find local artists"
              body="Search San Antonio artists by portfolio, specialties, shop, and profile details."
            />
            <HowItWorksCard
              step="02"
              title="Browse real flash"
              body="See individual flash and full sheets from connected artists ready to receive requests."
            />
            <HowItWorksCard
              step="03"
              title="Book with intent"
              body="Send a focused request, reserve event spots when available, and keep the next step clear."
            />
          </div>
        </div>
      </section>

      <section className="px-5 py-18 md:px-8">
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

      <section className="overflow-hidden bg-[#121212] px-5 py-18 md:px-8">
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

      <section className="border-t border-white/5 bg-[#171717] px-5 py-20 text-center md:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
            Booking, simplified
          </p>
          <h2 className="mt-3 text-3xl! font-semibold text-white md:text-4xl!">
            Less digging, clearer next steps.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
            Compare artists, open flash sheets, and move toward a request when
            the work and artist feel right.
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

const HowItWorksCard = ({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) => (
  <article className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-transparent p-5 shadow-xl">
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-[#0b0b0b]!">
      {step}
    </span>
    <h3 className="mt-5 text-xl! font-semibold text-white">{title}</h3>
    <p className="mt-3 text-sm leading-6 text-white/55">{body}</p>
  </article>
);

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

  return artistsById;
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
