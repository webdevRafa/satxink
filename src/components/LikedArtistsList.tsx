import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Heart,
  Layers,
  MessageCircle,
  Plus,
  Store,
  UserRound,
} from "lucide-react";
import {
  collection,
  documentId,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import {
  getBookingAvailabilityLabel,
  getBookingAvailabilityMonthKeys,
  getRollingBookingMonthOptions,
  type BookingAvailability,
} from "../utils/bookingAvailability";
import type { FlashSheet } from "../types/FlashSheet";

interface Artist {
  id: string;
  name: string;
  displayName?: string;
  avatarUrl: string;
  studioName?: string;
  shopName?: string;
  shopAddress?: string;
  shopId?: string;
  specialties?: string[];
  bio?: string;
  bookingAvailability?: BookingAvailability;
  latestSheet?: LatestSheetPreview;
}

type ShopLookup = {
  id: string;
  name?: string;
  address?: string;
};

type LatestSheetPreview = {
  id: string;
  title: string;
  imageUrl?: string;
  href: string;
  createdAtMs: number;
};

interface Props {
  client: {
    likedArtists: string[];
  };
  onRequest: (artist: Artist) => void;
}

const FOLLOWED_ARTISTS_PER_PAGE = 5;

const LikedArtistsList: React.FC<Props> = ({ client, onRequest }) => {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let ignore = false;

    const fetchFollowing = async () => {
      setLoading(true);
      try {
        const ids = Array.isArray(client.likedArtists)
          ? [...new Set(client.likedArtists.filter(Boolean))]
          : [];

        if (ids.length === 0) {
          if (!ignore) {
            setArtists([]);
          }
          return;
        }

        const chunks = chunkIds(ids, 10);
        const artistSnapshots = await Promise.all(
          chunks.map((chunk) =>
            getDocs(
              query(collection(db, "users"), where(documentId(), "in", chunk))
            )
          )
        );
        const nextArtists = artistSnapshots.flatMap((snapshot) =>
          snapshot.docs
            .map((artistDoc) => {
              const data = artistDoc.data();
              return {
                id: artistDoc.id,
                name: data.displayName || data.name || "Artist",
                displayName: data.displayName,
                avatarUrl: data.avatarUrl || "/fallback-avatar.jpg",
                studioName: data.studioName,
                shopName: data.shopName || data.studioName,
                shopAddress: data.shopAddress,
                shopId: data.shopId,
                specialties: Array.isArray(data.specialties)
                  ? data.specialties
                  : [],
                bio: data.bio,
                bookingAvailability: data.bookingAvailability,
              } as Artist;
            })
            .filter((artist) => artist.id)
        );

        const [shopsById, latestSheetByArtist] = await Promise.all([
          fetchShopsById(
            Array.from(
              new Set(
                nextArtists
                  .map((artist) => artist.shopId)
                  .filter((shopId): shopId is string => Boolean(shopId))
              )
            )
          ),
          fetchLatestSheetsByArtist(chunks),
        ]);

        const hydratedArtists = nextArtists
          .map((artist) => {
            const shop = artist.shopId ? shopsById.get(artist.shopId) : null;
            const shopName = artist.shopName || shop?.name || artist.studioName;

            return {
              ...artist,
              shopName,
              studioName: shopName || artist.studioName,
              shopAddress: artist.shopAddress || shop?.address,
              latestSheet: latestSheetByArtist.get(artist.id),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!ignore) {
          setArtists(hydratedArtists);
        }
      } catch (error) {
        console.error("Failed to load followed artists:", error);
        if (!ignore) {
          setArtists([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    fetchFollowing();
    return () => {
      ignore = true;
    };
  }, [client.likedArtists]);

  const totalPages = Math.max(
    1,
    Math.ceil(artists.length / FOLLOWED_ARTISTS_PER_PAGE)
  );
  const activePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (activePage - 1) * FOLLOWED_ARTISTS_PER_PAGE;
  const pageEndIndex = Math.min(
    pageStartIndex + FOLLOWED_ARTISTS_PER_PAGE,
    artists.length
  );
  const paginatedArtists = useMemo(
    () => artists.slice(pageStartIndex, pageEndIndex),
    [artists, pageEndIndex, pageStartIndex]
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  };

  if (loading) {
    return (
      <section className="w-full max-w-7xl space-y-6">
        <DashboardHeader title="Following" eyebrow="Client discovery" />
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <DashboardHeader
          eyebrow="Client discovery"
          title="Following"
          description="Keep up with the artists you follow and quickly start a new idea when their books line up with yours."
        />
        <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-neutral-300">
          {artists.length} following
        </span>
      </div>

      {artists.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
            <Heart size={22} />
          </div>
          <h2 className="mt-4 text-xl! font-semibold! text-white">
            Follow artists to build your list
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
            Followed artists will appear here with their shop, booking months,
            and a fast path to share your next idea.
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              to="/artists"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/85"
            >
              Browse artists
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="hidden space-y-3 md:block">
            <div className="request-modal-scrollbar max-h-[27rem] overflow-y-auto pr-1">
              <div className="space-y-3">
                {paginatedArtists.map((artist) => (
                  <FollowedArtistRow
                    key={artist.id}
                    artist={artist}
                    onRequest={() => onRequest(artist)}
                  />
                ))}
              </div>
            </div>

            {artists.length > FOLLOWED_ARTISTS_PER_PAGE && (
              <FollowingPagination
                currentPage={activePage}
                totalPages={totalPages}
                totalItems={artists.length}
                pageStart={pageStartIndex + 1}
                pageEnd={pageEndIndex}
                onPageChange={goToPage}
              />
            )}
          </div>

          <div className="-mx-6 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth px-6 pb-3 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-3">
              {artists.map((artist) => (
                <div
                  key={artist.id}
                  className="w-[min(21.5rem,calc(100vw-4.5rem))] shrink-0 snap-start"
                >
                  <FollowedArtistRow
                    artist={artist}
                    onRequest={() => onRequest(artist)}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

const FollowedArtistRow = ({
  artist,
  onRequest,
}: {
  artist: Artist;
  onRequest: () => void;
}) => {
  const availabilityDisplay = getCompactBookingAvailabilityDisplay(
    artist.bookingAvailability
  );

  return (
    <article className="grid gap-3 rounded-lg border border-white/10 bg-[#111111] p-3 transition hover:border-white/20 hover:bg-white/[0.035] md:grid-cols-[minmax(220px,1fr)_minmax(150px,210px)_minmax(280px,340px)_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={artist.avatarUrl || "/fallback-avatar.jpg"}
          alt={artist.name}
          className="h-14 w-14 rounded-full border border-white/15 object-cover"
        />
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-white">
            {artist.name}
          </h3>
          <p className="mt-1 flex items-center gap-2 truncate text-sm text-neutral-500">
            <Store size={14} className="shrink-0" />
            {artist.shopName || artist.studioName || "Studio not listed"}
          </p>
        </div>
      </div>

      <LatestSheetCell sheet={artist.latestSheet} artistId={artist.id} />

      <BookingAvailabilityCell
        artistId={artist.id}
        availabilityDisplay={availabilityDisplay}
      />

      <div className="grid gap-2 sm:grid-cols-2 md:min-w-[260px]">
        <Link
          to={`/artists/${artist.id}`}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          <UserRound size={16} />
          View profile
        </Link>
        <button
          type="button"
          onClick={onRequest}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-3! py-2.5! text-sm! font-semibold text-black transition hover:bg-white/85"
        >
          <MessageCircle size={16} />
          Send idea
        </button>
      </div>
    </article>
  );
};

const BookingAvailabilityCell = ({
  artistId,
  availabilityDisplay,
}: {
  artistId: string;
  availabilityDisplay: {
    label: string;
    fullLabel: string;
    extraCount: number;
  };
}) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    left: number;
    top: number;
    maxWidth: number;
    placement: "above" | "below";
  } | null>(null);
  const tooltipId = `booking-tooltip-${artistId}`;

  const showTooltip = () => {
    if (
      !availabilityDisplay.fullLabel ||
      !triggerRef.current ||
      typeof window === "undefined"
    ) {
      return;
    }

    const viewportPadding = 16;
    const rect = triggerRef.current.getBoundingClientRect();
    const maxWidth = Math.min(
      320,
      Math.max(180, window.innerWidth - viewportPadding * 2)
    );
    const halfWidth = maxWidth / 2;
    const centerX = rect.left + rect.width / 2;
    const left = Math.min(
      Math.max(centerX, viewportPadding + halfWidth),
      window.innerWidth - viewportPadding - halfWidth
    );
    const placement = rect.top > 72 ? "above" : "below";

    setTooltipPosition({
      left,
      top: placement === "above" ? rect.top - 10 : rect.bottom + 10,
      maxWidth,
      placement,
    });
  };

  useEffect(() => {
    if (!tooltipPosition || typeof window === "undefined") return;

    const hideTooltip = () => setTooltipPosition(null);

    window.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);

    return () => {
      window.removeEventListener("scroll", hideTooltip, true);
      window.removeEventListener("resize", hideTooltip);
    };
  }, [tooltipPosition]);

  return (
    <div
      ref={triggerRef}
      className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-white/20"
      tabIndex={availabilityDisplay.fullLabel ? 0 : -1}
      aria-describedby={tooltipPosition ? tooltipId : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setTooltipPosition(null)}
      onFocus={showTooltip}
      onBlur={() => setTooltipPosition(null)}
    >
      <CalendarDays size={13} className="shrink-0 text-neutral-500" />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-neutral-500">
          Booking
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-none text-white">
          <span className="min-w-0 truncate">{availabilityDisplay.label}</span>
          {availabilityDisplay.extraCount > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-neutral-300"
              aria-label={`${availabilityDisplay.extraCount} more booking months`}
            >
              <Plus size={10} />
              {availabilityDisplay.extraCount}
            </span>
          )}
        </span>
      </span>

      {tooltipPosition &&
        availabilityDisplay.fullLabel &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[1000] w-max rounded-md border border-white/10 bg-[#191919] px-3 py-2 text-xs font-medium leading-5 text-white shadow-2xl shadow-black/40"
            style={{
              left: tooltipPosition.left,
              top: tooltipPosition.top,
              maxWidth: tooltipPosition.maxWidth,
              transform:
                tooltipPosition.placement === "above"
                  ? "translate(-50%, -100%)"
                  : "translateX(-50%)",
            }}
          >
            {availabilityDisplay.fullLabel}
          </span>,
          document.body
        )}
    </div>
  );
};

const FollowingPagination = ({
  currentPage,
  totalPages,
  totalItems,
  pageStart,
  pageEnd,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageStart: number;
  pageEnd: number;
  onPageChange: (page: number) => void;
}) => {
  const pageItems = getPaginationItems(currentPage, totalPages);

  return (
    <nav
      aria-label="Followed artists pagination"
      className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-3! py-3! sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-neutral-500">
        Showing{" "}
        <span className="font-semibold text-neutral-300">
          {pageStart}-{pageEnd}
        </span>{" "}
        of <span className="font-semibold text-neutral-300">{totalItems}</span>{" "}
        artists
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Previous
        </button>

        <div className="flex items-center gap-1">
          {pageItems.map((item) =>
            typeof item === "number" ? (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === currentPage ? "page" : undefined}
                className={`h-9 min-w-9 rounded-md px-3! text-xs! font-semibold transition ${
                  item === currentPage
                    ? "bg-white text-black"
                    : "border border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                }`}
              >
                {item}
              </button>
            ) : (
              <span
                key={item}
                className="flex h-9 min-w-8 items-center justify-center text-xs font-semibold text-neutral-600"
              >
                ...
              </span>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};

const LatestSheetCell = ({
  artistId,
  sheet,
}: {
  artistId: string;
  sheet?: LatestSheetPreview;
}) => {
  const href = sheet?.href || `/artists/${artistId}`;

  return (
    <Link
      to={href}
      className="flex min-w-0 items-center gap-2 px-1 py-1 transition hover:text-white"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/[0.04] text-neutral-500">
        {sheet?.imageUrl ? (
          <img
            src={sheet.imageUrl}
            alt={sheet.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Layers size={16} />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-neutral-500">
          Latest sheet
        </span>
        <span className="mt-1 block truncate text-sm font-semibold leading-none text-white">
          {sheet?.title || "No sheet yet"}
        </span>
      </span>
    </Link>
  );
};

const fetchShopsById = async (shopIds: string[]) => {
  const shopsById = new Map<string, ShopLookup>();
  const chunks = chunkIds(shopIds, 10);
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
      shopsById.set(shopDoc.id, {
        id: shopDoc.id,
        name: typeof data.name === "string" ? data.name : undefined,
        address: typeof data.address === "string" ? data.address : undefined,
      });
    });
  });

  return shopsById;
};

const fetchLatestSheetsByArtist = async (artistChunks: string[][]) => {
  const snapshots = await Promise.all(
    artistChunks.map((chunk) =>
      getDocs(
        query(collection(db, "flashSheets"), where("artistId", "in", chunk))
      )
    )
  );
  const latestByArtist = new Map<string, LatestSheetPreview>();

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((sheetDoc) => {
      const sheet = {
        id: sheetDoc.id,
        ...sheetDoc.data(),
      } as FlashSheet;

      if (sheet.marketplaceVisible === false) return;

      const createdAtMs = timestampToMillis(sheet.createdAt);
      const current = latestByArtist.get(sheet.artistId);
      if (current && current.createdAtMs >= createdAtMs) return;

      latestByArtist.set(sheet.artistId, {
        id: sheet.id,
        title: sheet.title || "Latest flash sheet",
        imageUrl: sheet.thumbUrl || sheet.imageUrl,
        href: `/flash/sheets/${sheet.id}`,
        createdAtMs,
      });
    });
  });

  return latestByArtist;
};

const getCompactBookingAvailabilityDisplay = (
  availability?: BookingAvailability | null
) => {
  const options = getRollingBookingMonthOptions();
  const optionByKey = new Map(options.map((option) => [option.key, option]));
  const monthOptions = getBookingAvailabilityMonthKeys(
    availability,
    options.map((option) => option.key)
  )
    .map((key) => optionByKey.get(key))
    .filter((option): option is NonNullable<typeof option> => Boolean(option));

  if (monthOptions.length === 0) {
    return {
      label: getBookingAvailabilityLabel(availability),
      fullLabel: "",
      extraCount: 0,
    };
  }

  const visibleMonths = monthOptions.slice(0, 2);
  const sameVisibleYear = visibleMonths.every(
    (month) => month.year === visibleMonths[0].year
  );
  const visibleLabel = visibleMonths
    .map((month, index) =>
      sameVisibleYear && index < visibleMonths.length - 1
        ? getMonthName(month)
        : `${getMonthName(month)} ${month.year}`
    )
    .join(", ");
  const fullLabel = monthOptions
    .map((month) => `${getMonthName(month)} ${month.year}`)
    .join(", ");

  return {
    label: `Booking ${visibleLabel}`,
    fullLabel: `Booking ${fullLabel}`,
    extraCount: Math.max(monthOptions.length - visibleMonths.length, 0),
  };
};

const timestampToMillis = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds?: unknown }).seconds === "number"
  ) {
    return Number((value as { seconds: number }).seconds) * 1000;
  }
  return 0;
};

const getMonthName = (option: { year: number; monthIndex: number }) =>
  new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(option.year, option.monthIndex, 1)
  );

const DashboardHeader = ({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) => (
  <div>
    <p className="text-xs uppercase tracking-[0.18em] text-white/45">
      {eyebrow}
    </p>
    <h1 className="mt-2 text-3xl! font-semibold text-white">{title}</h1>
    {description && (
      <p className="mt-2 max-w-2xl text-sm text-neutral-400">{description}</p>
    )}
  </div>
);

const chunkIds = (ids: string[], size: number) =>
  Array.from({ length: Math.ceil(ids.length / size) }, (_, index) =>
    ids.slice(index * size, index * size + size)
  );

const getPaginationItems = (currentPage: number, totalPages: number) => {
  const items: Array<number | string> = [];
  const maxVisible = 5;

  if (totalPages <= maxVisible) {
    for (let page = 1; page <= totalPages; page += 1) {
      items.push(page);
    }
    return items;
  }

  items.push(1);

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    items.push("start-ellipsis");
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < totalPages - 1) {
    items.push("end-ellipsis");
  }

  items.push(totalPages);
  return items;
};

export default LikedArtistsList;
