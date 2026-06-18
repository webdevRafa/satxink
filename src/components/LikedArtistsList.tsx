import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Heart,
  Layers,
  MessageCircle,
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

const LikedArtistsList: React.FC<Props> = ({ client, onRequest }) => {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

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
        <div className="space-y-3">
          {artists.map((artist) => (
            <FollowedArtistRow
              key={artist.id}
              artist={artist}
              onRequest={() => onRequest(artist)}
            />
          ))}
        </div>
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
  const availabilityLabel = getBookingAvailabilityLabel(
    artist.bookingAvailability
  );

  return (
    <article className="grid gap-3 rounded-lg border border-white/10 bg-[#111111] p-3 transition hover:border-white/20 hover:bg-white/[0.035] md:grid-cols-[minmax(220px,1fr)_minmax(180px,240px)_minmax(160px,220px)_auto] md:items-center">
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

      <div className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2">
        <CalendarDays size={13} className="shrink-0 text-neutral-500" />
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-neutral-500">
            Booking
          </span>
          <span className="mt-1 block truncate text-sm font-semibold leading-none text-white">
            {availabilityLabel}
          </span>
        </span>
      </div>

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
      className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-2 transition hover:border-white/20 hover:bg-white/[0.04]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/[0.04] text-neutral-500">
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

export default LikedArtistsList;
