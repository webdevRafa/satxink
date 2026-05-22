import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
  DollarSign,
  Filter,
  ImageOff,
  MapPin,
  Search,
  Tag,
  Users,
} from "lucide-react";
import {
  collection,
  documentId,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import type { ArtistEvent, EventType } from "../types/Event";

type DateFilter = "all" | "today" | "this_week" | "this_month";

type PublicArtist = {
  id: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  specialties?: string[];
  studioName?: string;
  role?: string;
  isVerified?: boolean | "true" | "false";
};

type PublicEvent = ArtistEvent & {
  artist?: PublicArtist;
};

const eventTypeLabels: Record<EventType, string> = {
  flash_day: "Flash Day",
  guest_spot: "Guest Spot",
  convention: "Convention",
  pop_up: "Pop-up",
  walk_in_day: "Walk-in Day",
  shop_event: "Shop Event",
  other: "Other",
};

const eventTypeOptions: Array<"all" | EventType> = [
  "all",
  "flash_day",
  "guest_spot",
  "convention",
  "pop_up",
  "walk_in_day",
  "shop_event",
  "other",
];

const dateFilters: { label: string; value: DateFilter }[] = [
  { label: "All upcoming", value: "all" },
  { label: "Today", value: "today" },
  { label: "This week", value: "this_week" },
  { label: "This month", value: "this_month" },
];

export const EventsPage = () => {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<"all" | EventType>(
    "all"
  );
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let isMounted = true;

    const fetchEvents = async () => {
      try {
        setLoading(true);

        const eventsQuery = query(
          collection(db, "events"),
          where("status", "==", "published"),
          where("visibility", "==", "public")
        );

        const eventSnapshot = await getDocs(eventsQuery);

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
          new Set(rawEvents.map((event) => event.artistId).filter(Boolean))
        );

        const artistsById = await fetchVerifiedArtistsById(artistIds);

        const publicEvents = rawEvents
          .map((event) => ({
            ...event,
            artist: artistsById[event.artistId],
          }))
          .filter((event) => Boolean(event.artist))
          .filter((event) => !isPastEvent(event))
          .sort((a, b) => getEventTime(a) - getEventTime(b));

        if (isMounted) {
          setEvents(publicEvents);
        }
      } catch (err) {
        console.error("Failed to fetch public events:", err);
        if (isMounted) setEvents([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchEvents();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredEvents = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return events.filter((event) => {
      const matchesDate =
        dateFilter === "all" || eventMatchesDateFilter(event, dateFilter);

      const matchesType =
        eventTypeFilter === "all" || event.eventType === eventTypeFilter;

      const searchableText = [
        event.title,
        event.description,
        event.shopName,
        event.address,
        event.artist?.displayName,
        event.artist?.name,
        event.artist?.studioName,
        ...(event.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch || searchableText.includes(normalizedSearch);

      return matchesDate && matchesType && matchesSearch;
    });
  }, [events, dateFilter, eventTypeFilter, searchTerm]);

  const todayEvents = useMemo(
    () =>
      filteredEvents.filter((event) => eventMatchesDateFilter(event, "today")),
    [filteredEvents]
  );

  const weekEvents = useMemo(
    () =>
      filteredEvents.filter(
        (event) =>
          eventMatchesDateFilter(event, "this_week") &&
          !eventMatchesDateFilter(event, "today")
      ),
    [filteredEvents]
  );

  const laterEvents = useMemo(
    () =>
      filteredEvents.filter(
        (event) => !eventMatchesDateFilter(event, "this_week")
      ),
    [filteredEvents]
  );

  const heroEvent = filteredEvents[0];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#101010] via-[#0c0c0c] to-[#151515] px-4 pb-20 pt-28 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(190,54,46,0.22),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] p-6 shadow-2xl md:p-8">
          <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-[var(--color-primary)]/10 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">
                Events in San Antonio, TX
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl! font-bold leading-tight text-white md:text-6xl!">
                Find flash days, pop-ups, guest spots, and tattoo events.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/60">
                Browse public events posted by verified SATX Ink artists. Find
                upcoming opportunities, compare event types, and jump straight
                to the artist profile.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <HeroStat label="Upcoming events" value={events.length} />
                <HeroStat
                  label="Happening today"
                  value={
                    events.filter((event) =>
                      eventMatchesDateFilter(event, "today")
                    ).length
                  }
                />
                <HeroStat
                  label="This week"
                  value={
                    events.filter((event) =>
                      eventMatchesDateFilter(event, "this_week")
                    ).length
                  }
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
              {heroEvent ? (
                <FeaturedEvent event={heroEvent} />
              ) : (
                <div className="flex min-h-[260px] flex-col justify-end rounded-xl border border-white/10 bg-white/[0.035] p-5">
                  <CalendarDays className="mb-4 text-white/30" size={38} />
                  <p className="text-sm font-semibold text-white">
                    Events will appear here.
                  </p>
                  <p className="mt-2 text-sm text-white/45">
                    Once verified artists publish events, customers will be able
                    to discover them from this page.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-xl">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35"
              />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by event, artist, shop, location, or tag"
                className="h-12 w-full rounded-xl border border-white/10 bg-black/25 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/30 focus:bg-black/35"
              />
            </label>

            <label className="relative block">
              <Filter
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35"
              />
              <select
                value={eventTypeFilter}
                onChange={(event) =>
                  setEventTypeFilter(event.target.value as "all" | EventType)
                }
                className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#151515] pl-11 pr-4 text-sm font-semibold text-white outline-none transition focus:border-white/30"
              >
                {eventTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type === "all" ? "All event types" : eventTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {dateFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setDateFilter(filter.value)}
                className={`rounded-full border px-4! py-2! text-xs! font-semibold transition ${
                  dateFilter === filter.value
                    ? "border-white bg-white text-black"
                    : "border-white/10 bg-white/[0.035] text-white/60 hover:border-white/25 hover:text-white"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </section>

        {loading ? (
          <EventsPageSkeleton />
        ) : filteredEvents.length === 0 ? (
          <EmptyEventsState />
        ) : dateFilter === "all" ? (
          <div className="mt-10 space-y-12">
            {todayEvents.length > 0 && (
              <EventSection
                eyebrow="Happening now"
                title="Today"
                events={todayEvents}
              />
            )}

            {weekEvents.length > 0 && (
              <EventSection
                eyebrow="Coming up soon"
                title="This week"
                events={weekEvents}
              />
            )}

            {laterEvents.length > 0 && (
              <EventSection
                eyebrow="Plan ahead"
                title="Later events"
                events={laterEvents}
              />
            )}
          </div>
        ) : (
          <div className="mt-10">
            <EventSection
              eyebrow="Filtered results"
              title={getDateFilterTitle(dateFilter)}
              events={filteredEvents}
            />
          </div>
        )}
      </section>
    </main>
  );
};

const EventSection = ({
  eyebrow,
  title,
  events,
}: {
  eyebrow: string;
  title: string;
  events: PublicEvent[];
}) => (
  <section>
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-3xl! font-semibold text-white">{title}</h2>
      </div>
      <p className="text-sm text-white/45">
        {events.length} event{events.length === 1 ? "" : "s"}
      </p>
    </div>

    <div className="grid gap-5 lg:grid-cols-2">
      {events.map((event) => (
        <PublicEventCard key={event.id} event={event} />
      ))}
    </div>
  </section>
);

const PublicEventCard = ({ event }: { event: PublicEvent }) => {
  const artistName = getArtistName(event.artist);
  const locationLabel = getLocationLabel(event);
  const priceLabel = getPriceLabel(event);

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-transparent shadow-xl transition hover:-translate-y-0.5 hover:border-white/20 hover:shadow-2xl">
      <div className="grid min-h-[260px] sm:grid-cols-[210px_minmax(0,1fr)]">
        <div className="relative min-h-[220px] overflow-hidden bg-black/30">
          {event.thumbnailUrl ? (
            <img
              src={event.thumbnailUrl}
              alt={event.title}
              className="h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-105 group-hover:opacity-100"
            />
          ) : (
            <div className="flex h-full w-full items-end bg-gradient-to-br from-white/[0.09] via-white/[0.025] to-black p-5">
              <ImageOff className="text-white/25" size={36} />
            </div>
          )}

          <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/75 backdrop-blur">
            {eventTypeLabels[event.eventType] || "Event"}
          </span>
        </div>

        <div className="flex min-w-0 flex-col p-5">
          <div className="flex items-start gap-3">
            <img
              src={event.artist?.avatarUrl || "/default-avatar.png"}
              alt={artistName}
              className="h-11 w-11 rounded-full border border-white/10 object-cover"
            />
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-xl! font-semibold text-white">
                {event.title}
              </h3>
              <p className="mt-1 truncate text-sm text-white/50">
                by {artistName}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 text-sm text-white/60">
            <EventMeta
              icon={<CalendarDays size={16} />}
              text={formatEventDate(event)}
            />
            <EventMeta icon={<MapPin size={16} />} text={locationLabel} />
            <EventMeta icon={<DollarSign size={16} />} text={priceLabel} />
            <EventMeta
              icon={<Users size={16} />}
              text={`${event.spotsClaimed || 0}/${
                event.capacity || 0
              } spots claimed`}
            />
          </div>

          {event.description && (
            <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-white/45">
              {event.description}
            </p>
          )}

          {event.tags && event.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {event.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/50"
                >
                  <Tag size={12} />
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
            {event.mapLink ? (
              <a
                href={event.mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-white/55 transition hover:text-white"
              >
                View map
              </a>
            ) : (
              <span className="text-sm text-white/30">Map unavailable</span>
            )}

            <Link
              to={`/artists/${event.artistId}`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
            >
              View artist
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
};

const FeaturedEvent = ({ event }: { event: PublicEvent }) => (
  <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
    <div className="relative aspect-[16/11] bg-black/40">
      {event.thumbnailUrl ? (
        <img
          src={event.thumbnailUrl}
          alt={event.title}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <CalendarDays className="text-white/25" size={42} />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
          Next event
        </p>
        <h3 className="mt-1 line-clamp-2 text-xl! font-semibold text-white">
          {event.title}
        </h3>
      </div>
    </div>

    <div className="space-y-2 p-4 text-sm text-white/60">
      <EventMeta
        icon={<CalendarDays size={16} />}
        text={formatEventDate(event)}
      />
      <EventMeta icon={<MapPin size={16} />} text={getLocationLabel(event)} />
      <Link
        to={`/artists/${event.artistId}`}
        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white transition hover:text-[var(--color-primary)]"
      >
        View {getArtistName(event.artist)}
        <ChevronRight size={16} />
      </Link>
    </div>
  </div>
);

const HeroStat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
    <p className="text-sm text-white/45">{label}</p>
    <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
  </div>
);

const EventMeta = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <div className="flex min-w-0 items-center gap-2">
    <span className="shrink-0 text-white/35">{icon}</span>
    <span className="truncate">{text}</span>
  </div>
);

const EventsPageSkeleton = () => (
  <div className="mt-10 space-y-5">
    <div className="h-8 w-44 animate-pulse rounded-md bg-white/[0.06]" />
    <div className="grid gap-5 lg:grid-cols-2">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-[280px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]"
        />
      ))}
    </div>
  </div>
);

const EmptyEventsState = () => (
  <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.035] p-10 text-center shadow-xl">
    <CalendarDays className="mx-auto mb-4 text-white/25" size={42} />
    <h2 className="text-2xl! font-semibold text-white">No events found</h2>
    <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/50">
      Try changing your filters or checking back when verified artists publish
      new flash days, pop-ups, guest spots, or shop events.
    </p>
  </div>
);

const fetchVerifiedArtistsById = async (artistIds: string[]) => {
  const artistsById: Record<string, PublicArtist> = {};
  const chunks = chunkArray(artistIds, 30);

  for (const chunk of chunks) {
    if (!chunk.length) continue;

    const artistsQuery = query(
      collection(db, "users"),
      where(documentId(), "in", chunk),
      where("role", "==", "artist")
    );

    const snapshot = await getDocs(artistsQuery);

    snapshot.docs.forEach((artistDoc) => {
      const artist = {
        id: artistDoc.id,
        ...artistDoc.data(),
      } as PublicArtist;

      if (isArtistVerified(artist)) {
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

const isArtistVerified = (artist?: PublicArtist) =>
  artist?.role === "artist" &&
  (artist.isVerified === true || artist.isVerified === "true");

const getArtistName = (artist?: PublicArtist) =>
  artist?.displayName || artist?.name || "Verified artist";

const getEventTime = (event: ArtistEvent) => {
  if (!event.startDate) return Number.MAX_SAFE_INTEGER;
  return new Date(`${event.startDate}T${event.startTime || "00:00"}`).getTime();
};

const isPastEvent = (event: ArtistEvent) => {
  const endDate = event.endDate || event.startDate;
  const endTime = event.endTime || "23:59";
  return new Date(`${endDate}T${endTime}`).getTime() < startOfToday().getTime();
};

const eventMatchesDateFilter = (event: ArtistEvent, filter: DateFilter) => {
  const eventDate = new Date(
    `${event.startDate}T${event.startTime || "00:00"}`
  );

  if (filter === "today") {
    return isSameDay(eventDate, new Date());
  }

  if (filter === "this_week") {
    const start = startOfToday();
    const end = addDays(start, 7);
    return eventDate >= start && eventDate < end;
  }

  if (filter === "this_month") {
    const now = new Date();
    return (
      eventDate.getFullYear() === now.getFullYear() &&
      eventDate.getMonth() === now.getMonth()
    );
  }

  return true;
};

const formatEventDate = (event: ArtistEvent) => {
  if (!event.startDate) return "Date TBD";

  const start = new Date(`${event.startDate}T${event.startTime || "00:00"}`);

  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const startTime = event.startTime ? formatTime(event.startTime) : "";
  const endTime = event.endTime ? formatTime(event.endTime) : "";

  if (event.endDate && event.endDate !== event.startDate) {
    const end = new Date(`${event.endDate}T${event.endTime || "23:59"}`);
    const endLabel = end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    return `${dateLabel}${startTime ? ` at ${startTime}` : ""} – ${endLabel}${
      endTime ? ` at ${endTime}` : ""
    }`;
  }

  if (startTime && endTime) return `${dateLabel}, ${startTime} – ${endTime}`;
  if (startTime) return `${dateLabel} at ${startTime}`;

  return dateLabel;
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

const getPriceLabel = (event: ArtistEvent) => {
  const hasDeposit =
    Boolean(event.depositRequired) ||
    (typeof event.depositAmount === "number" && event.depositAmount > 0);

  const depositLabel =
    hasDeposit && event.depositAmount
      ? `$${event.depositAmount} deposit`
      : hasDeposit
      ? "Deposit required"
      : "";

  let priceLabel = "Price TBD";

  if (event.priceType === "free") priceLabel = "Free";
  else if (event.priceType === "varies") priceLabel = "Pricing varies";
  else if (event.priceType === "starting_at") {
    priceLabel = event.price
      ? `Starting at $${event.price}`
      : "Starting price TBD";
  } else {
    priceLabel = event.price ? `$${event.price}` : "Price TBD";
  }

  return depositLabel ? `${priceLabel} • ${depositLabel}` : priceLabel;
};

const getDateFilterTitle = (filter: DateFilter) => {
  if (filter === "today") return "Today";
  if (filter === "this_week") return "This week";
  if (filter === "this_month") return "This month";
  return "All upcoming";
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export default EventsPage;
