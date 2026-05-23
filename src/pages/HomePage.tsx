import { type FC, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  ImageOff,
  Layers,
  MapPin,
  Search,
  Sparkles,
  Tag,
} from "lucide-react";
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
import type { ArtistEvent, EventBookingMode, EventType } from "../types/Event";
import {
  isStripeConnectReady,
  type StripeConnectLike,
} from "../utils/stripeConnect";

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

type HomeEvent = ArtistEvent & {
  artist?: PublicArtist;
};

const featuredStyles = [
  "Blackwork",
  "Realism",
  "Dotwork",
  "Linework",
  "Color",
  "Neo-Traditional",
  "Traditional",
  "Fine Line",
];

const eventTypeLabels: Record<EventType, string> = {
  flash_day: "Flash Day",
  guest_spot: "Guest Spot",
  convention: "Convention",
  pop_up: "Pop-up",
  walk_in_day: "Walk-in Day",
  shop_event: "Shop Event",
  other: "Event",
};

const HOME_FLASH_FETCH_LIMIT = 40;
const HOME_SHEET_FETCH_LIMIT = 24;
const HOME_EVENT_FETCH_LIMIT = 12;

export const HomePage: FC = () => {
  const [flashes, setFlashes] = useState<HomeFlash[]>([]);
  const [sheets, setSheets] = useState<HomeFlashSheet[]>([]);
  const [events, setEvents] = useState<HomeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchHomePreview = async () => {
      try {
        setLoading(true);

        const [flashSnapshot, sheetSnapshot, eventSnapshot] =
          await Promise.all([
            getDocs(
              query(
                collection(db, "flashes"),
                limit(HOME_FLASH_FETCH_LIMIT)
              )
            ),
            getDocs(
              query(
                collection(db, "flashSheets"),
                limit(HOME_SHEET_FETCH_LIMIT)
              )
            ),
            getDocs(
              query(
                collection(db, "events"),
                where("status", "==", "published"),
                where("visibility", "==", "public"),
                limit(HOME_EVENT_FETCH_LIMIT)
              )
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
                typedFlash.isAvailable !== false &&
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

        const rawEvents = eventSnapshot.docs
          .map((eventDoc) => ({
            id: eventDoc.id,
            ...eventDoc.data(),
          }))
          .filter((event): event is ArtistEvent => {
            const typedEvent = event as ArtistEvent;
            return Boolean(typedEvent.artistId && typedEvent.startDate);
          });

        const artistIds = Array.from(
          new Set(
            [...rawFlashes, ...rawSheets, ...rawEvents]
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

        const readyEvents = rawEvents
          .map((event) => ({
            ...event,
            artist: artistsById[event.artistId],
          }))
          .filter((event) => Boolean(event.artist))
          .filter(isPublicEventBookable)
          .filter((event) => !isPastEvent(event))
          .sort((a, b) => getEventTime(a) - getEventTime(b));

        setFlashes(readyFlashes);
        setSheets(readySheets);
        setEvents(shuffleItems(readyEvents.slice(0, 8)).slice(0, 3));
      } catch (err) {
        console.error("Failed to fetch homepage preview data:", err);
        if (isMounted) {
          setFlashes([]);
          setSheets([]);
          setEvents([]);
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
      { label: "Styles to explore", value: `${featuredStyles.length}+` },
      { label: "Flash previews", value: loading ? "..." : flashes.length },
      { label: "Upcoming events", value: loading ? "..." : events.length },
    ],
    [events.length, flashes.length, loading]
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
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/65 backdrop-blur">
              <Sparkles size={14} />
              San Antonio tattoo discovery
            </p>
            <h1 className="mt-6 max-w-4xl text-5xl! font-bold leading-[0.98] text-white md:text-7xl!">
              Find the best tattoo artists in San Antonio, Texas.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/70 md:text-lg">
              Browse verified artists, discover ready-to-request flash, compare
              styles, and find public tattoo events from local SATX shops and
              artists.
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

          <div className="mt-14 grid gap-3 sm:grid-cols-3">
            {heroStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/10 bg-black/35 p-4 backdrop-blur"
              >
                <p className="text-2xl font-semibold text-white">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-white/50">{stat.label}</p>
              </div>
            ))}
          </div>
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
                <Search size={15} className="text-white/35 group-hover:text-white/60" />
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

      <section className="px-5 py-18 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <SectionHeader
              kicker="Events"
              title="Flash days, guest spots, and pop-ups worth catching."
              body="SATX Ink also highlights public tattoo events so clients can find time-sensitive opportunities without digging through social feeds."
            />
            <Link
              to="/events"
              className="inline-flex w-fit items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
            >
              View all events
              <CalendarDays size={16} />
            </Link>
          </div>

          {events.length > 0 ? (
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {events.map((event) => (
                <EventTeaserCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <EmptyPreview label="No upcoming public events are ready yet." />
          )}
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
            Compare artists, open flash sheets, watch for local events, and move
            toward a request when the work and artist feel right.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/artists"
              className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85"
            >
              Find artists
              <ArrowRight size={16} className="text-[#0b0b0b]!" />
            </Link>
            <Link
              to="/events"
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/75 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
            >
              See events
              <CalendarDays size={16} />
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
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-black">
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

const FlashPreviewCard = ({ flash }: { flash: HomeFlash }) => (
  <Link
    to={flash.sheetId ? `/flash/sheets/${flash.sheetId}` : "/flash"}
    className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-xl transition hover:border-white/25"
  >
    <div className="relative aspect-[4/3] shrink-0 bg-black/30">
      {getFlashPreviewUrl(flash) ? (
        <img
          src={getFlashPreviewUrl(flash)}
          alt={getFlashTitle(flash)}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          loading="lazy"
        />
      ) : (
        <MissingImage />
      )}
    </div>
    <div className="flex min-h-[136px] flex-1 flex-col p-3">
      <div className="flex min-h-[42px] items-start gap-2">
        <h4 className="min-w-0 flex-1 truncate text-sm! font-semibold text-white">
          {getFlashTitle(flash)}
        </h4>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-2 py-0.5 text-[11px] font-bold text-white/75">
          {formatFlashPrice(flash.price)}
        </span>
      </div>
      <ArtistByline artist={flash.artist} />
      <TagList tags={flash.tags} />
    </div>
  </Link>
);

const SheetPreviewCard = ({ sheet }: { sheet: HomeFlashSheet }) => (
  <Link
    to={`/flash/sheets/${sheet.id}`}
    className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-xl transition hover:border-white/25"
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
    <div className="flex min-h-[136px] flex-1 flex-col p-3">
      <div className="flex min-h-[42px] items-start gap-2">
        <h4 className="min-w-0 flex-1 truncate text-sm! font-semibold text-white">
          {sheet.title || "Untitled flash sheet"}
        </h4>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.07] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/60">
          <Layers size={11} />
          Sheet
        </span>
      </div>
      <ArtistByline artist={sheet.artist} />
      <TagList tags={sheet.tags} />
    </div>
  </Link>
);

const ArtistByline = ({ artist }: { artist?: PublicArtist }) => {
  const artistName = getArtistName(artist);
  const artistSubtitle = artist?.studioName || "SATX Ink artist";

  return (
    <div className="mt-3 flex h-11 min-w-0 items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.045] px-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition group-hover:border-white/[0.14] group-hover:bg-white/[0.065]">
      {artist?.avatarUrl ? (
        <img
          src={artist.avatarUrl}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full border border-white/15 object-cover shadow-sm"
          loading="lazy"
        />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-xs font-bold text-white/55 shadow-sm">
          {artistName.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold leading-4 text-white/80">
          {artistName}
        </span>
        <span className="block truncate text-[10px] font-medium leading-3 text-white/35">
          {artistSubtitle}
        </span>
      </span>
    </div>
  );
};

const EventTeaserCard = ({ event }: { event: HomeEvent }) => (
  <Link
    to="/events"
    className="group overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-transparent shadow-xl transition hover:border-white/25"
  >
    <div className="relative aspect-[16/10] bg-black/30">
      {event.thumbnailUrl ? (
        <img
          src={event.thumbnailUrl}
          alt={event.title}
          className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.04] group-hover:opacity-100"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <CalendarDays size={38} className="text-white/25" />
        </div>
      )}
      <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/65 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/75 backdrop-blur">
        {eventTypeLabels[event.eventType] || "Event"}
      </span>
    </div>
    <div className="p-4">
      <h3 className="line-clamp-2 text-xl! font-semibold text-white">
        {event.title}
      </h3>
      <div className="mt-4 space-y-2 text-sm text-white/55">
        <MetaRow icon={<CalendarDays size={15} />} text={formatEventDate(event)} />
        <MetaRow icon={<MapPin size={15} />} text={getLocationLabel(event)} />
      </div>
      <p className="mt-4 truncate text-sm text-white/40">
        by {getArtistName(event.artist)}
      </p>
    </div>
  </Link>
);

const MetaRow = ({ icon, text }: { icon: ReactNode; text: string }) => (
  <div className="flex items-center gap-2">
    <span className="text-white/30">{icon}</span>
    <span className="truncate">{text}</span>
  </div>
);

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

const eventModeRequiresPayment = (bookingMode?: EventBookingMode) =>
  bookingMode === "deposit_required" ||
  bookingMode === "flash_reservation" ||
  bookingMode === "paid_ticket";

const isPublicEventBookable = (event: HomeEvent) => {
  if (!eventModeRequiresPayment(event.bookingMode)) return true;
  return isStripeConnectReady(event.artist);
};

const isPastEvent = (event: ArtistEvent) => {
  const endDate = event.endDate || event.startDate;
  if (!endDate) return false;
  return new Date(`${endDate}T${event.endTime || "23:59"}`).getTime() <
    startOfToday().getTime();
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const getEventTime = (event: ArtistEvent) => {
  if (!event.startDate) return Number.MAX_SAFE_INTEGER;
  return new Date(`${event.startDate}T${event.startTime || "00:00"}`).getTime();
};

const formatEventDate = (event: ArtistEvent) => {
  if (!event.startDate) return "Date TBD";
  const date = new Date(`${event.startDate}T${event.startTime || "00:00"}`);
  const dateLabel = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return event.startTime
    ? `${dateLabel} at ${formatTime(event.startTime)}`
    : dateLabel;
};

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes || 0));
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getLocationLabel = (event: ArtistEvent) => {
  if (event.locationType === "online") return "Online";
  if (event.locationType === "tbd") return "Location TBD";
  return event.shopName || event.address || "Location TBD";
};

const getArtistName = (artist?: PublicArtist) =>
  artist?.displayName || artist?.name || "SATX Ink artist";

const getFlashTitle = (flash: Flash) =>
  flash.title || flash.caption || "Untitled flash";

const getFlashPreviewUrl = (flash: Flash) =>
  flash.thumbUrl || flash.webp90Url || flash.fullUrl || "";

const formatFlashPrice = (price?: number | null) =>
  typeof price === "number" ? `$${price}` : "Price TBD";
