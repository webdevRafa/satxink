import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import toast from "react-hot-toast";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Filter,
  ImageOff,
  MapPin,
  Search,
  Store,
  Tag,
  Ticket,
  Users,
} from "lucide-react";
import {
  collection,
  documentId,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { auth, db, functions } from "../firebase/firebaseConfig";
import type { ArtistEvent, EventBookingMode, EventType } from "../types/Event";
import type { EventRegistration } from "../types/EventRegistration";
import { isStripeConnectReady, type StripeConnectLike } from "../utils/stripeConnect";

type DateFilter = "all" | "today" | "this_week" | "this_month";
type EventHostFilter = "artist" | "shop";

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
} & StripeConnectLike;

type PublicEvent = ArtistEvent & {
  artist?: PublicArtist;
  shop?: PublicShop;
};

type PublicShop = {
  id: string;
  name?: string;
  address?: string;
  mapLink?: string;
  logoUrl?: string;
  avatarUrl?: string;
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

const EVENT_CARD_WIDTH = "min(88vw, 590px)";
const EVENT_RAIL_END_PADDING = `max(0px, calc(100% - ${EVENT_CARD_WIDTH}))`;

export const EventsPage = () => {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [registrationsByEventId, setRegistrationsByEventId] = useState<
    Record<string, EventRegistration>
  >({});
  const [reservingEventId, setReservingEventId] = useState("");
  const [purchasingEventId, setPurchasingEventId] = useState("");
  const [hostFilter, setHostFilter] = useState<EventHostFilter>("artist");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<"all" | EventType>(
    "all"
  );
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let unsubscribeRegistrations: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeRegistrations?.();
      unsubscribeRegistrations = undefined;
      setCurrentUserId(user?.uid || "");
      setRegistrationsByEventId({});

      if (!user) return;

      unsubscribeRegistrations = onSnapshot(
        query(
          collection(db, "eventRegistrations"),
          where("clientId", "==", user.uid)
        ),
        (snapshot) => {
          const nextRegistrations: Record<string, EventRegistration> = {};
          snapshot.docs.forEach((registrationDoc) => {
            const registration = {
              id: registrationDoc.id,
              ...registrationDoc.data(),
            } as EventRegistration;

            if (registration.status !== "cancelled" && registration.status !== "refunded") {
              nextRegistrations[registration.eventId] = registration;
            }
          });
          setRegistrationsByEventId(nextRegistrations);
        },
        (error) => console.error("Event registration listener failed:", error)
      );
    });

    return () => {
      unsubscribeRegistrations?.();
      unsubscribeAuth();
    };
  }, []);

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
            return Boolean(
              typedEvent.startDate &&
                (typedEvent.artistId ||
                  typedEvent.shopId ||
                  typedEvent.ownerType === "shop")
            );
          });

        const artistIds = Array.from(
          new Set(rawEvents.map((event) => event.artistId).filter(Boolean))
        );

        const artistsById = await fetchVerifiedArtistsById(artistIds);
        const shopIds = Array.from(
          new Set(
            rawEvents
              .map((event) => event.shopId)
              .filter((shopId): shopId is string => Boolean(shopId))
          )
        );
        const shopsById = await fetchShopsById(shopIds);

        const publicEvents = rawEvents
          .map((event) => ({
            ...event,
            artist: event.artistId ? artistsById[event.artistId] : undefined,
            shop: event.shopId ? shopsById[event.shopId] : undefined,
          }))
          .filter((event) =>
            Boolean(event.artist || event.shop || event.ownerType === "shop")
          )
          .filter((event) => isPublicEventBookable(event))
          .filter((event) => !isPastEvent(event))
          .sort(sortEventsChronologically);

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

  const handleFreeRsvp = async (event: PublicEvent) => {
    if (!currentUserId) {
      toast.error("Sign in as a client to RSVP for events.");
      return;
    }

    if (event.bookingMode !== "rsvp") return;

    setReservingEventId(event.id);
    try {
      const createRsvp = httpsCallable<{ eventId: string }, { registrationId: string }>(
        functions,
        "createEventRsvp"
      );
      await createRsvp({ eventId: event.id });
      toast.success("Event pass added to your dashboard.");
    } catch (error) {
      console.error("Event RSVP failed:", error);
      toast.error(getCallableErrorMessage(error, "Could not reserve this event."));
    } finally {
      setReservingEventId("");
    }
  };

  const handlePaidTicket = async (event: PublicEvent) => {
    if (!currentUserId) {
      toast.error("Sign in as a client to buy event tickets.");
      return;
    }

    if (event.bookingMode !== "paid_ticket") return;

    setPurchasingEventId(event.id);
    try {
      const createCheckout = httpsCallable<
        {
          eventId: string;
          origin: string;
          successUrl: string;
          cancelUrl: string;
        },
        { url?: string; registrationId: string }
      >(functions, "createEventCheckoutSession");
      const origin = window.location.origin;
      const response = await createCheckout({
        eventId: event.id,
        origin,
        successUrl: `${origin}/dashboard?tab=eventPasses&eventCheckout=success`,
        cancelUrl: `${origin}/events?eventCheckout=cancelled`,
      });

      if (!response.data.url) {
        throw new Error("Missing Stripe checkout URL.");
      }

      window.location.href = response.data.url;
    } catch (error) {
      console.error("Event ticket checkout failed:", error);
      toast.error(getCallableErrorMessage(error, "Could not start ticket checkout."));
    } finally {
      setPurchasingEventId("");
    }
  };

  const hostCounts = useMemo(
    () => ({
      artist: events.filter((event) => getEventHostType(event) === "artist")
        .length,
      shop: events.filter((event) => getEventHostType(event) === "shop").length,
    }),
    [events]
  );

  const filteredEventsByHost = useMemo<Record<EventHostFilter, PublicEvent[]>>(
    () => {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      const groupedEvents: Record<EventHostFilter, PublicEvent[]> = {
        artist: [],
        shop: [],
      };

      events.forEach((event) => {
        const matchesDate =
          dateFilter === "all" || eventMatchesDateFilter(event, dateFilter);

        const matchesType =
          eventTypeFilter === "all" || event.eventType === eventTypeFilter;

        const searchableText = [
          event.title,
          event.description,
          event.shopName,
          event.shop?.name,
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

        if (matchesDate && matchesType && matchesSearch) {
          groupedEvents[getEventHostType(event)].push(event);
        }
      });

      return groupedEvents;
    },
    [events, dateFilter, eventTypeFilter, searchTerm]
  );

  const eventDateGroupsByHost = useMemo(
    () => ({
      artist: getEventDateGroups(filteredEventsByHost.artist),
      shop: getEventDateGroups(filteredEventsByHost.shop),
    }),
    [filteredEventsByHost]
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#101010] via-[#0c0c0c] to-[#151515] px-4 pb-20 pt-20 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.065),rgba(255,255,255,0.02))] p-4 shadow-xl md:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/45">
                Events in San Antonio, TX
              </p>
              <h1 className="mt-2 max-w-3xl text-2xl! font-bold leading-tight text-white md:text-3xl!">
                Find tattoo events from verified artists and local shops.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
                Browse flash days, pop-ups, guest spots, conventions, and shop
                events without losing your place in the calendar.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
              <HeroStat label="Artist events" value={hostCounts.artist} />
              <HeroStat label="Shop events" value={hostCounts.shop} />
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
        </div>

        <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.035] p-4 shadow-xl">
          <HostToggle
            value={hostFilter}
            counts={hostCounts}
            onChange={setHostFilter}
          />

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

        <EventHostStage activeHost={hostFilter}>
          {(["artist", "shop"] as const).map((host) => (
            <div key={host} className="min-w-0">
              {renderEventContent({
                loading,
                filteredEvents: filteredEventsByHost[host],
                todayEvents: eventDateGroupsByHost[host].todayEvents,
                weekEvents: eventDateGroupsByHost[host].weekEvents,
                laterEvents: eventDateGroupsByHost[host].laterEvents,
                dateFilter,
                registrationsByEventId,
                reservingEventId,
                purchasingEventId,
                onFreeRsvp: handleFreeRsvp,
                onPaidTicket: handlePaidTicket,
              })}
            </div>
          ))}
        </EventHostStage>
      </section>
    </main>
  );
};

const getEventDateGroups = (events: PublicEvent[]) => ({
  todayEvents: events.filter((event) => eventMatchesDateFilter(event, "today")),
  weekEvents: events.filter(
    (event) =>
      eventMatchesDateFilter(event, "this_week") &&
      !eventMatchesDateFilter(event, "today")
  ),
  laterEvents: events.filter(
    (event) => !eventMatchesDateFilter(event, "this_week")
  ),
});

const renderEventContent = ({
  loading,
  filteredEvents,
  todayEvents,
  weekEvents,
  laterEvents,
  dateFilter,
  registrationsByEventId,
  reservingEventId,
  purchasingEventId,
  onFreeRsvp,
  onPaidTicket,
}: {
  loading: boolean;
  filteredEvents: PublicEvent[];
  todayEvents: PublicEvent[];
  weekEvents: PublicEvent[];
  laterEvents: PublicEvent[];
  dateFilter: DateFilter;
  registrationsByEventId: Record<string, EventRegistration>;
  reservingEventId: string;
  purchasingEventId: string;
  onFreeRsvp: (event: PublicEvent) => void;
  onPaidTicket: (event: PublicEvent) => void;
}) => {
  if (loading) return <EventsPageSkeleton />;
  if (filteredEvents.length === 0) return <EmptyEventsState />;

  if (dateFilter !== "all") {
    return (
      <div className="mt-10">
        <EventSection
          eyebrow="Filtered results"
          title={getDateFilterTitle(dateFilter)}
          events={filteredEvents}
          layout="rail"
          registrationsByEventId={registrationsByEventId}
          reservingEventId={reservingEventId}
          purchasingEventId={purchasingEventId}
          onFreeRsvp={onFreeRsvp}
          onPaidTicket={onPaidTicket}
        />
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-12">
      {todayEvents.length > 0 && (
        <EventSection
          eyebrow="Happening now"
          title="Today"
          events={todayEvents}
          layout="rail"
          registrationsByEventId={registrationsByEventId}
          reservingEventId={reservingEventId}
          purchasingEventId={purchasingEventId}
          onFreeRsvp={onFreeRsvp}
          onPaidTicket={onPaidTicket}
        />
      )}

      {weekEvents.length > 0 && (
        <EventSection
          eyebrow="Coming up soon"
          title="This week"
          events={weekEvents}
          layout="rail"
          registrationsByEventId={registrationsByEventId}
          reservingEventId={reservingEventId}
          purchasingEventId={purchasingEventId}
          onFreeRsvp={onFreeRsvp}
          onPaidTicket={onPaidTicket}
        />
      )}

      {laterEvents.length > 0 && (
        <EventSection
          eyebrow="Plan ahead"
          title="Later events"
          events={laterEvents}
          layout="rail"
          registrationsByEventId={registrationsByEventId}
          reservingEventId={reservingEventId}
          purchasingEventId={purchasingEventId}
          onFreeRsvp={onFreeRsvp}
          onPaidTicket={onPaidTicket}
        />
      )}
    </div>
  );
};

const EventHostStage = ({
  activeHost,
  children,
}: {
  activeHost: EventHostFilter;
  children: React.ReactNode;
}) => (
  <div className="overflow-hidden">
    <div
      className="grid w-[200%] grid-cols-2 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      style={{
        transform:
          activeHost === "artist" ? "translateX(0%)" : "translateX(-50%)",
      }}
    >
      {children}
    </div>
  </div>
);

const HostToggle = ({
  value,
  counts,
  onChange,
}: {
  value: EventHostFilter;
  counts: Record<EventHostFilter, number>;
  onChange: (value: EventHostFilter) => void;
}) => (
  <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="inline-grid w-full grid-cols-2 rounded-lg border border-white/10 bg-black/25 p-1 sm:w-[340px]">
      {(["artist", "shop"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3! text-sm! font-semibold capitalize transition ${
            value === item
              ? "bg-white text-black shadow-lg"
              : "text-white/55 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          {item === "artist" ? <Users size={15} /> : <Store size={15} />}
          {item === "artist" ? "Artists" : "Shops"}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              value === item
                ? "bg-black/10 text-black"
                : "bg-white/[0.08] text-white/55"
            }`}
          >
            {counts[item]}
          </span>
        </button>
      ))}
    </div>
    <p className="text-sm text-white/45">
      {value === "artist"
        ? "Browsing events published by individual artists."
        : "Browsing events hosted directly by shops."}
    </p>
  </div>
);

const EventSection = ({
  eyebrow,
  title,
  events,
  layout = "grid",
  registrationsByEventId,
  reservingEventId,
  purchasingEventId,
  onFreeRsvp,
  onPaidTicket,
}: {
  eyebrow: string;
  title: string;
  events: PublicEvent[];
  layout?: "grid" | "rail";
  registrationsByEventId: Record<string, EventRegistration>;
  reservingEventId: string;
  purchasingEventId: string;
  onFreeRsvp: (event: PublicEvent) => void;
  onPaidTicket: (event: PublicEvent) => void;
}) => {
  const railRef = useRef<HTMLDivElement>(null);
  const hasRailControls = layout === "rail" && events.length > 1;

  const scrollRail = (direction: "previous" | "next") => {
    const rail = railRef.current;
    if (!rail) return;

    const cards = Array.from(rail.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement
    );

    if (!cards.length) return;

    const railLeft = rail.getBoundingClientRect().left;
    const cardPositions = cards.map(
      (card) => card.getBoundingClientRect().left - railLeft + rail.scrollLeft
    );

    const currentIndex = cardPositions.reduce((closestIndex, position, index) =>
      Math.abs(position - rail.scrollLeft) <
      Math.abs(cardPositions[closestIndex] - rail.scrollLeft)
        ? index
        : closestIndex
    , 0);

    const targetIndex =
      direction === "previous"
        ? Math.max(currentIndex - 1, 0)
        : Math.min(currentIndex + 1, cards.length - 1);

    rail.scrollTo({
      left: cardPositions[targetIndex],
      behavior: "smooth",
    });
  };

  return (
    <section className="min-w-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-3xl! font-semibold text-white">{title}</h2>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-sm text-white/45">
            {events.length} event{events.length === 1 ? "" : "s"}
          </p>

          {hasRailControls && (
            <div className="flex items-center gap-2">
              <RailButton
                label={`Scroll ${title} events backward`}
                onClick={() => scrollRail("previous")}
              >
                <ChevronLeft
                  aria-hidden="true"
                  className="h-4 w-4 stroke-current"
                  strokeWidth={2.75}
                />
              </RailButton>
              <RailButton
                label={`Scroll ${title} events forward`}
                onClick={() => scrollRail("next")}
              >
                <ChevronRight
                  aria-hidden="true"
                  className="h-4 w-4 stroke-current"
                  strokeWidth={2.75}
                />
              </RailButton>
            </div>
          )}
        </div>
      </div>

      {layout === "rail" ? (
        <div
          ref={railRef}
          className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent]"
          style={{ paddingRight: EVENT_RAIL_END_PADDING }}
        >
          {events.map((event) => (
            <PublicEventCard
              key={event.id}
              event={event}
              registration={registrationsByEventId[event.id]}
              isReserving={reservingEventId === event.id}
              isPurchasing={purchasingEventId === event.id}
              onFreeRsvp={onFreeRsvp}
              onPaidTicket={onPaidTicket}
              className="shrink-0 snap-start"
              style={{ width: EVENT_CARD_WIDTH }}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {events.map((event) => (
            <PublicEventCard
              key={event.id}
              event={event}
              registration={registrationsByEventId[event.id]}
              isReserving={reservingEventId === event.id}
              isPurchasing={purchasingEventId === event.id}
              onFreeRsvp={onFreeRsvp}
              onPaidTicket={onPaidTicket}
            />
          ))}
        </div>
      )}
    </section>
  );
};

const RailButton = ({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="!flex !h-9 !w-9 !items-center !justify-center !rounded-full !border !border-white/25 !bg-white !p-0 !text-black !shadow-lg !shadow-black/35 transition hover:!bg-white/85 focus:!outline-none focus:!ring-2 focus:!ring-white/55"
    aria-label={label}
    title={label}
  >
    {children}
  </button>
);

const PublicEventCard = ({
  event,
  registration,
  isReserving,
  isPurchasing,
  onFreeRsvp,
  onPaidTicket,
  className = "",
  style,
}: {
  event: PublicEvent;
  registration?: EventRegistration;
  isReserving: boolean;
  isPurchasing: boolean;
  onFreeRsvp: (event: PublicEvent) => void;
  onPaidTicket: (event: PublicEvent) => void;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const hostName = getEventHostName(event);
  const isShopHosted = getEventHostType(event) === "shop";
  const locationLabel = getLocationLabel(event);
  const priceLabel = getPriceLabel(event);
  const isRsvpEvent = event.bookingMode === "rsvp";
  const isPaidTicketEvent = event.bookingMode === "paid_ticket";
  const isReserved = Boolean(
    registration &&
      registration.status !== "cancelled" &&
      registration.status !== "refunded"
  );
  const isPaid = registration?.status === "paid" || registration?.status === "checked_in";
  const isPendingPayment = registration?.status === "pending_payment";

  return (
    <article
      className={`group overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-transparent shadow-xl transition hover:border-white/20 hover:shadow-2xl ${className}`}
      style={style}
    >
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
            {isShopHosted ? (
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/60">
                <Store size={19} />
              </span>
            ) : (
              <img
                src={event.artist?.avatarUrl || "/default-avatar.png"}
                alt={hostName}
                className="h-11 w-11 rounded-full border border-white/10 object-cover"
              />
            )}
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-xl! font-semibold text-white">
                {event.title}
              </h3>
              <p className="mt-1 truncate text-sm text-white/50">
                by {hostName}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 text-sm text-white/60">
            <EventMeta
              icon={<CalendarDays size={16} />}
              text={formatEventDate(event)}
            />
            <EventMeta
              href={event.mapLink}
              icon={<MapPin size={16} />}
              text={locationLabel}
            />
            <EventMeta icon={<DollarSign size={16} />} text={priceLabel} />
            <EventMeta
              icon={<Users size={16} />}
              text={getEventCapacityLabel(event)}
            />
            {isRsvpEvent && (
              <EventMeta
                icon={<CalendarDays size={16} />}
                text="Free RSVP pass available"
              />
            )}
            {isPaidTicketEvent && (
              <EventMeta
                icon={<Ticket size={16} />}
                text="Paid SATX Ink pass with QR check-in"
              />
            )}
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

          <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5">
            {isRsvpEvent && (
              <button
                type="button"
                onClick={() => onFreeRsvp(event)}
                disabled={isReserved || isReserving}
                className={`inline-flex items-center gap-2 rounded-full px-4! py-2! text-sm! font-semibold transition disabled:cursor-not-allowed ${
                  isReserved
                    ? "border border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                    : "bg-white text-black hover:bg-white/85 disabled:opacity-60"
                }`}
              >
                {isReserving ? "Reserving..." : isReserved ? "Pass reserved" : "RSVP free"}
              </button>
            )}
            {isPaidTicketEvent && (
              <button
                type="button"
                onClick={() => onPaidTicket(event)}
                disabled={isPaid || isPurchasing}
                className={`inline-flex items-center gap-2 rounded-full px-4! py-2! text-sm! font-semibold transition disabled:cursor-not-allowed ${
                  isPaid
                    ? "border border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                    : "bg-white text-black hover:bg-white/85 disabled:opacity-60"
                }`}
                title={
                  isPendingPayment
                    ? "Resume checkout to finish reserving your paid event pass."
                    : "Buy a ticket and receive a QR pass in your dashboard."
                }
              >
                {isPurchasing
                  ? "Opening checkout..."
                  : isPaid
                  ? "Ticket purchased"
                  : isPendingPayment
                  ? "Resume checkout"
                  : "Buy ticket"}
              </button>
            )}
            {!isShopHosted && event.artistId ? (
              <Link
                to={`/artists/${event.artistId}`}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
              >
                View artist
                <ChevronRight size={16} />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70">
                Shop event
                <ChevronRight size={16} />
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

const HeroStat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
    <p className="text-sm text-white/45">{label}</p>
    <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
  </div>
);

const EventMeta = ({
  href,
  icon,
  text,
}: {
  href?: string;
  icon: React.ReactNode;
  text: string;
}) => (
  <div className="flex min-w-0 items-center gap-2">
    <span className="shrink-0 text-white/35">{icon}</span>
    {href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate transition hover:text-white hover:underline"
      >
        {text}
      </a>
    ) : (
      <span className="truncate">{text}</span>
    )}
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
      Try changing your filters or checking back when artists and shops publish
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

const fetchShopsById = async (shopIds: string[]) => {
  const shopsById: Record<string, PublicShop> = {};
  const chunks = chunkArray(shopIds, 30);

  for (const chunk of chunks) {
    if (!chunk.length) continue;

    const shopsQuery = query(
      collection(db, "shops"),
      where(documentId(), "in", chunk)
    );

    const snapshot = await getDocs(shopsQuery);

    snapshot.docs.forEach((shopDoc) => {
      shopsById[shopDoc.id] = {
        id: shopDoc.id,
        ...shopDoc.data(),
      } as PublicShop;
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

const isArtistVerified = (artist?: PublicArtist) =>
  artist?.role === "artist" &&
  (artist.isVerified === true || artist.isVerified === "true");

const getArtistName = (artist?: PublicArtist) =>
  artist?.displayName || artist?.name || "Verified artist";

const getEventHostType = (event: PublicEvent): EventHostFilter =>
  event.ownerType === "shop" || (!event.artistId && Boolean(event.shopId))
    ? "shop"
    : "artist";

const getEventHostName = (event: PublicEvent) => {
  if (getEventHostType(event) === "shop") {
    return event.shop?.name || event.shopName || "Verified shop";
  }

  return event.artist ? getArtistName(event.artist) : "Verified artist";
};

const eventModeRequiresPayment = (bookingMode?: EventBookingMode) =>
  bookingMode === "deposit_required" ||
  bookingMode === "flash_reservation" ||
  bookingMode === "paid_ticket";

const isPublicEventBookable = (event: PublicEvent) => {
  if (event.bookingMode === "paid_ticket") return true;
  if (!eventModeRequiresPayment(event.bookingMode)) return true;
  if (event.ownerType === "shop" && !event.artist) return false;
  return isStripeConnectReady(event.artist);
};

const getEventTime = (event: ArtistEvent) => {
  if (!event.startDate) return Number.MAX_SAFE_INTEGER;
  return new Date(`${event.startDate}T${event.startTime || "00:00"}`).getTime();
};

const getCreatedTime = (event: ArtistEvent) => {
  const createdAt = event.createdAt;

  if (!createdAt) return Number.MAX_SAFE_INTEGER;
  if (createdAt instanceof Date) return createdAt.getTime();

  const maybeTimestamp = createdAt as {
    seconds?: number;
    toDate?: () => Date;
  };

  if (typeof maybeTimestamp.toDate === "function") {
    return maybeTimestamp.toDate().getTime();
  }

  if (typeof maybeTimestamp.seconds === "number") {
    return maybeTimestamp.seconds * 1000;
  }

  return Number.MAX_SAFE_INTEGER;
};

const sortEventsChronologically = (a: PublicEvent, b: PublicEvent) =>
  getEventTime(a) - getEventTime(b) ||
  getCreatedTime(a) - getCreatedTime(b) ||
  a.title.localeCompare(b.title);

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

const getEventCapacityLabel = (event: ArtistEvent) => {
  if (event.bookingMode === "info_only") {
    return event.capacity ? `Venue capacity ${event.capacity}` : "Details only";
  }

  return `${event.spotsClaimed || 0}/${event.capacity || 0} spots claimed`;
};

const getPriceLabel = (event: ArtistEvent) => {
  const hasDeposit =
    event.bookingMode !== "info_only" &&
    (Boolean(event.depositRequired) ||
      (typeof event.depositAmount === "number" && event.depositAmount > 0));

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

const getCallableErrorMessage = (error: unknown, fallback: string) => {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
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
