import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Heart,
  ImageIcon,
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
}

type DigestPreview = {
  id: string;
  title: string;
  imageUrl?: string;
  href: string;
  createdAtMs: number;
};

type ArtistDigest = Artist & {
  latestGallery?: DigestPreview;
  latestSheet?: DigestPreview;
  latestActivityMs: number;
};

interface Props {
  client: {
    likedArtists: string[];
  };
  onRequest: (artist: Artist) => void;
}

const LikedArtistsList: React.FC<Props> = ({ client, onRequest }) => {
  const [artistDigests, setArtistDigests] = useState<ArtistDigest[]>([]);
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
            setArtistDigests([]);
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

        const [sheetSnapshots, gallerySnapshots] = await Promise.all([
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

        const sheets = sheetSnapshots.flatMap((snapshot) =>
          snapshot.docs.map((sheetDoc) => ({
            id: sheetDoc.id,
            ...sheetDoc.data(),
          })) as FlashSheet[]
        );
        const galleryItems = gallerySnapshots.flatMap((snapshot) =>
          snapshot.docs.map((galleryDoc) => ({
            id: galleryDoc.id,
            ...galleryDoc.data(),
          })) as GalleryItem[]
        );

        const latestSheetByArtist = getLatestSheetByArtist(sheets);
        const latestGalleryByArtist = getLatestGalleryByArtist(galleryItems);

        const digests = artists
          .map((artist) => {
            const latestGallery = latestGalleryByArtist.get(artist.id);
            const latestSheet = latestSheetByArtist.get(artist.id);
            return {
              ...artist,
              latestGallery,
              latestSheet,
              latestActivityMs: Math.max(
                latestGallery?.createdAtMs || 0,
                latestSheet?.createdAtMs || 0
              ),
            };
          })
          .sort((a, b) => {
            if (b.latestActivityMs !== a.latestActivityMs) {
              return b.latestActivityMs - a.latestActivityMs;
            }
            return a.name.localeCompare(b.name);
          });

        if (!ignore) {
          setArtistDigests(digests);
        }
      } catch (error) {
        console.error("Failed to load following feed:", error);
        if (!ignore) {
          setArtistDigests([]);
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

  const artistsWithNewWork = useMemo(
    () =>
      artistDigests.filter(
        (artist) => artist.latestGallery || artist.latestSheet
      ).length,
    [artistDigests]
  );
  const latestSheetCount = useMemo(
    () => artistDigests.filter((artist) => artist.latestSheet).length,
    [artistDigests]
  );

  if (loading) {
    return (
      <section className="w-full max-w-7xl space-y-6">
        <DashboardHeader title="Following" eyebrow="Client discovery" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-96 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]"
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
          description="One clean update per followed artist: latest work, latest sheet, and a direct path back to their profile."
        />
        <div className="grid gap-3 sm:grid-cols-4 lg:min-w-[720px]">
          <MetricCard label="Following" value={artistDigests.length} />
          <MetricCard label="Artists with new work" value={artistsWithNewWork} />
          <MetricCard label="Latest sheets" value={latestSheetCount} />
          <MetricCard label="Ready to request" value={artistDigests.length} />
        </div>
      </div>

      {artistDigests.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
            <Heart size={22} />
          </div>
          <h2 className="mt-4 text-xl! font-semibold! text-white">
            Follow artists to build your feed
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
            Followed artists will appear here with their latest gallery image and latest flash sheet.
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
        <div className="rounded-lg border border-white/10 bg-[#111111] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                Artist updates
              </p>
              <h2 className="mt-1 text-xl! font-semibold! text-white">
                From artists you follow
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

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {artistDigests.map((artist) => (
              <ArtistDigestCard
                key={artist.id}
                artist={artist}
                onRequest={() => onRequest(artist)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

const ArtistDigestCard = ({
  artist,
  onRequest,
}: {
  artist: ArtistDigest;
  onRequest: () => void;
}) => (
  <article className="overflow-hidden rounded-lg border border-white/10 bg-black/25 shadow-lg transition hover:border-white/20 hover:bg-white/[0.04]">
    <div className="flex flex-col gap-4 border-b border-white/10 p-4 sm:flex-row sm:items-start sm:justify-between">
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
      <div className="flex flex-wrap gap-2 sm:max-w-[220px] sm:justify-end">
        {(artist.specialties || []).slice(0, 3).map((specialty) => (
          <span
            key={specialty}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-neutral-300"
          >
            {specialty}
          </span>
        ))}
      </div>
    </div>

    <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_190px]">
      <PreviewPanel
        label="Latest gallery"
        title={artist.latestGallery?.title || "No gallery update yet"}
        imageUrl={artist.latestGallery?.imageUrl}
        href={artist.latestGallery?.href || `/artists/${artist.id}`}
        emptyText="Gallery work from this artist will appear here."
        large
      />
      <PreviewPanel
        label="Latest sheet"
        title={artist.latestSheet?.title || "No flash sheet yet"}
        imageUrl={artist.latestSheet?.imageUrl}
        href={artist.latestSheet?.href || `/artists/${artist.id}`}
        emptyText="Their newest flash sheet will show here."
      />
    </div>

    <div className="flex flex-col gap-2 border-t border-white/10 p-4 sm:flex-row">
      <Link
        to={`/artists/${artist.id}`}
        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-3 py-2.5 text-sm font-semibold text-black transition hover:bg-white/85"
      >
        <UserRound size={16} />
        View profile
      </Link>
      <button
        type="button"
        onClick={onRequest}
        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10"
      >
        <MessageCircle size={16} />
        Request
      </button>
      {artist.latestSheet && (
        <Link
          to={artist.latestSheet.href}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          <Layers size={16} />
          View latest sheet
        </Link>
      )}
    </div>
  </article>
);

const PreviewPanel = ({
  emptyText,
  href,
  imageUrl,
  label,
  large = false,
  title,
}: {
  emptyText: string;
  href: string;
  imageUrl?: string;
  label: string;
  large?: boolean;
  title: string;
}) => (
  <Link
    to={href}
    className={`group overflow-hidden rounded-lg border border-white/10 bg-[#0b0b0b] transition hover:border-white/20 ${
      large ? "min-h-[260px]" : "min-h-[260px] md:min-h-0"
    }`}
  >
    <div className={large ? "aspect-[5/4] bg-black" : "aspect-[4/3] bg-black"}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.06] to-black p-5 text-center text-neutral-500">
          {large ? <ImageIcon size={26} /> : <Layers size={24} />}
          <span className="text-sm">{emptyText}</span>
        </div>
      )}
    </div>
    <div className="p-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {large ? <ImageIcon size={13} /> : <Layers size={13} />}
        {label}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold text-white">
        {title}
      </p>
    </div>
  </Link>
);

const getLatestSheetByArtist = (sheets: FlashSheet[]) => {
  const latestByArtist = new Map<string, DigestPreview>();

  sheets
    .filter((sheet) => sheet.marketplaceVisible !== false)
    .forEach((sheet) => {
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

  return latestByArtist;
};

const getLatestGalleryByArtist = (items: GalleryItem[]) => {
  const latestByArtist = new Map<string, DigestPreview>();

  items
    .filter((item) => item.status !== "hidden")
    .forEach((item) => {
      const createdAtMs = timestampToMillis(item.createdAt);
      const current = latestByArtist.get(item.artistId);
      if (current && current.createdAtMs >= createdAtMs) return;

      latestByArtist.set(item.artistId, {
        id: item.id,
        title: item.caption || "Latest gallery work",
        imageUrl: item.thumbUrl || item.webp90Url || item.fullUrl,
        href: `/artists/${item.artistId}`,
        createdAtMs,
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
