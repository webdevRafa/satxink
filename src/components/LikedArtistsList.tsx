import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Heart,
  ImageIcon,
  Images,
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
import type { Flash } from "../types/Flash";
import type { FlashSheet } from "../types/FlashSheet";
import type { GalleryItem } from "../types/GalleryItem";

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
  previewUrl?: string;
}

type FollowingActivityItem = {
  id: string;
  artistId: string;
  artistName: string;
  artistAvatar?: string;
  title: string;
  type: "flash" | "sheet" | "gallery";
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

const FOLLOWING_ACTIVITY_LIMIT = 24;

const LikedArtistsList: React.FC<Props> = ({ client, onRequest }) => {
  const [followedArtists, setFollowedArtists] = useState<Artist[]>([]);
  const [activity, setActivity] = useState<FollowingActivityItem[]>([]);
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
            setFollowedArtists([]);
            setActivity([]);
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
        const artists = artistSnapshots
          .flatMap((snapshot) =>
            snapshot.docs.map((artistDoc) => {
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
              } as Artist;
            })
          )
          .sort((a, b) => a.name.localeCompare(b.name));
        const artistById = Object.fromEntries(
          artists.map((artist) => [artist.id, artist])
        );

        const [flashSnapshots, sheetSnapshots, gallerySnapshots] =
          await Promise.all([
            Promise.all(
              chunks.map((chunk) =>
                getDocs(
                  query(collection(db, "flashes"), where("artistId", "in", chunk))
                )
              )
            ),
            Promise.all(
              chunks.map((chunk) =>
                getDocs(
                  query(
                    collection(db, "flashSheets"),
                    where("artistId", "in", chunk)
                  )
                )
              )
            ),
            Promise.all(
              chunks.map((chunk) =>
                getDocs(
                  query(collection(db, "gallery"), where("artistId", "in", chunk))
                )
              )
            ),
          ]);

        const flashActivity = flashSnapshots
          .flatMap((snapshot) =>
            snapshot.docs.map((flashDoc) => ({
              id: flashDoc.id,
              ...flashDoc.data(),
            })) as Flash[]
          )
          .filter((flash) => flash.publicationStatus !== "draft")
          .filter((flash) => flash.availabilityStatus !== "sold")
          .map((flash) =>
            createActivityItem({
              artist: artistById[flash.artistId],
              artistId: flash.artistId,
              createdAt: flash.publishedAt || flash.createdAt,
              href: flash.sheetId ? `/flash/sheets/${flash.sheetId}` : "/flash",
              id: flash.id,
              imageUrl: flash.thumbUrl || flash.webp90Url || flash.fullUrl,
              title: flash.title || flash.caption || "New flash design",
              type: "flash",
            })
          );

        const sheetActivity = sheetSnapshots
          .flatMap((snapshot) =>
            snapshot.docs.map((sheetDoc) => ({
              id: sheetDoc.id,
              ...sheetDoc.data(),
            })) as FlashSheet[]
          )
          .map((sheet) =>
            createActivityItem({
              artist: artistById[sheet.artistId],
              artistId: sheet.artistId,
              createdAt: sheet.createdAt,
              href: `/flash/sheets/${sheet.id}`,
              id: sheet.id,
              imageUrl: sheet.thumbUrl || sheet.imageUrl,
              title: sheet.title || "New flash sheet",
              type: "sheet",
            })
          );

        const galleryActivity = gallerySnapshots
          .flatMap((snapshot) =>
            snapshot.docs.map((galleryDoc) => ({
              id: galleryDoc.id,
              ...galleryDoc.data(),
            })) as GalleryItem[]
          )
          .filter((item) => item.status !== "hidden")
          .map((item) =>
            createActivityItem({
              artist: artistById[item.artistId],
              artistId: item.artistId,
              createdAt: item.createdAt,
              href: `/artists/${item.artistId}`,
              id: item.id,
              imageUrl: item.thumbUrl || item.webp90Url || item.fullUrl,
              title: item.caption || "New gallery work",
              type: "gallery",
            })
          );

        const mergedActivity = [
          ...flashActivity,
          ...sheetActivity,
          ...galleryActivity,
        ]
          .filter((item): item is FollowingActivityItem => Boolean(item))
          .sort((a, b) => b.createdAtMs - a.createdAtMs)
          .slice(0, FOLLOWING_ACTIVITY_LIMIT);

        const previewByArtist = new Map<string, string>();
        mergedActivity.forEach((item) => {
          if (item.imageUrl && !previewByArtist.has(item.artistId)) {
            previewByArtist.set(item.artistId, item.imageUrl);
          }
        });

        if (!ignore) {
          setFollowedArtists(
            artists.map((artist) => ({
              ...artist,
              previewUrl: previewByArtist.get(artist.id),
            }))
          );
          setActivity(mergedActivity);
        }
      } catch (error) {
        console.error("Failed to load following feed:", error);
        if (!ignore) {
          setFollowedArtists([]);
          setActivity([]);
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

  const flashCount = useMemo(
    () => activity.filter((item) => item.type === "flash").length,
    [activity]
  );
  const sheetCount = useMemo(
    () => activity.filter((item) => item.type === "sheet").length,
    [activity]
  );
  const galleryCount = useMemo(
    () => activity.filter((item) => item.type === "gallery").length,
    [activity]
  );

  if (loading) {
    return (
      <section className="w-full max-w-7xl space-y-6">
        <DashboardHeader title="Following" eyebrow="Client discovery" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-80 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <DashboardHeader
          eyebrow="Client discovery"
          title="Following"
          description="Keep up with artists you follow, including recent flash drops, sheets, and portfolio updates."
        />
        <div className="grid gap-3 sm:grid-cols-4 lg:min-w-[720px]">
          <MetricCard label="Artists" value={followedArtists.length} />
          <MetricCard label="Flash" value={flashCount} />
          <MetricCard label="Sheets" value={sheetCount} />
          <MetricCard label="Gallery" value={galleryCount} />
        </div>
      </div>

      {followedArtists.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
            <Heart size={22} />
          </div>
          <h2 className="mt-4 text-xl! font-semibold! text-white">
            Follow artists to build your feed
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
            Artists, flash sheets, and new work will appear here after you follow profiles.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/artists"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/85"
            >
              Browse artists
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/flash"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-black/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Browse flash
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {followedArtists.map((artist) => (
              <ArtistCard
                key={artist.id}
                artist={artist}
                onRequest={() => onRequest(artist)}
              />
            ))}
          </div>

          <div className="rounded-lg border border-white/10 bg-[#111111] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Latest drops
                </p>
                <h2 className="mt-1 text-xl! font-semibold! text-white">
                  Followed artist activity
                </h2>
              </div>
              <Link
                to="/flash"
                className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
              >
                Browse all flash
                <ArrowRight size={14} />
              </Link>
            </div>

            {activity.length === 0 ? (
              <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-5 text-sm text-neutral-400">
                No recent followed artist activity yet.
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {activity.map((item) => (
                  <ActivityCard key={`${item.type}-${item.id}`} item={item} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};

const ArtistCard = ({
  artist,
  onRequest,
}: {
  artist: Artist;
  onRequest: () => void;
}) => (
  <article className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg transition hover:border-white/20 hover:bg-[#151515]">
    <div className="relative h-44 bg-black">
      {artist.previewUrl ? (
        <img
          src={artist.previewUrl}
          alt={`${artist.name} recent work`}
          className="h-full w-full object-cover opacity-85"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
          <ImageIcon size={26} />
          <span className="text-sm">No recent activity</span>
        </div>
      )}
      <img
        src={artist.avatarUrl || "/fallback-avatar.jpg"}
        alt={artist.name}
        className="absolute bottom-4 left-4 h-16 w-16 rounded-full border border-white/15 object-cover shadow-lg"
      />
    </div>

    <div className="p-4">
      <h3 className="text-lg font-semibold text-white">{artist.name}</h3>
      <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
        <Store size={14} />
        {artist.shopName || artist.studioName || "Studio not listed"}
      </p>
      <p className="mt-3 line-clamp-2 min-h-12 text-sm leading-6 text-neutral-300">
        {artist.bio || "No artist bio yet."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(artist.specialties || []).slice(0, 4).map((specialty) => (
          <span
            key={specialty}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-neutral-300"
          >
            {specialty}
          </span>
        ))}
      </div>
    </div>

    <div className="flex gap-3 border-t border-white/10 p-4">
      <Link
        to={`/artists/${artist.id}`}
        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
      >
        <UserRound size={16} />
        Profile
      </Link>
      <button
        type="button"
        onClick={onRequest}
        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-3! py-2.5! text-sm! font-semibold text-black transition hover:bg-white/85"
      >
        <MessageCircle size={16} />
        Request
      </button>
    </div>
  </article>
);

const ActivityCard = ({ item }: { item: FollowingActivityItem }) => (
  <Link
    to={item.href}
    className="group overflow-hidden rounded-lg border border-white/10 bg-black/25 transition hover:border-white/20 hover:bg-white/[0.04]"
  >
    <div className="aspect-[4/3] bg-black">
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.title}
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-neutral-500">
          <ImageIcon size={24} />
        </div>
      )}
    </div>
    <div className="p-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {item.type === "sheet" ? (
          <Layers size={13} />
        ) : item.type === "gallery" ? (
          <Images size={13} />
        ) : (
          <ImageIcon size={13} />
        )}
        {item.type === "sheet"
          ? "Flash sheet"
          : item.type === "gallery"
          ? "Gallery"
          : "Flash"}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold text-white">
        {item.title}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <img
          src={item.artistAvatar || "/fallback-avatar.jpg"}
          alt={item.artistName}
          className="h-6 w-6 rounded-full border border-white/10 object-cover"
        />
        <span className="truncate text-xs text-neutral-400">
          {item.artistName}
        </span>
      </div>
    </div>
  </Link>
);

const createActivityItem = ({
  artist,
  artistId,
  createdAt,
  href,
  id,
  imageUrl,
  title,
  type,
}: {
  artist?: Artist;
  artistId: string;
  createdAt: unknown;
  href: string;
  id: string;
  imageUrl?: string;
  title: string;
  type: FollowingActivityItem["type"];
}): FollowingActivityItem | null => {
  if (!artist) return null;

  return {
    id,
    artistId,
    artistName: artist.name,
    artistAvatar: artist.avatarUrl,
    title,
    type,
    imageUrl,
    href,
    createdAtMs: timestampToMillis(createdAt),
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

const chunkIds = (ids: string[], size: number) =>
  Array.from({ length: Math.ceil(ids.length / size) }, (_, index) =>
    ids.slice(index * size, index * size + size)
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
    <p className="text-xs uppercase tracking-[0.18em] text-white/45">{eyebrow}</p>
    <h1 className="mt-2 text-3xl! font-semibold text-white">{title}</h1>
    {description && (
      <p className="mt-2 max-w-2xl text-sm text-neutral-400">{description}</p>
    )}
  </div>
);

const MetricCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
  </div>
);

export default LikedArtistsList;
