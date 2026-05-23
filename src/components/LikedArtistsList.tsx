import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, ImageIcon, MessageCircle, Store, UserRound } from "lucide-react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

interface Artist {
  id: string;
  name: string;
  displayName?: string;
  avatarUrl: string;
  studioName?: string;
  shopId?: string;
  specialties?: string[];
  bio?: string;
  previewUrl?: string;
}

interface Props {
  client: {
    likedArtists: string[];
  };
  onRequest: (artist: Artist) => void;
}

const LikedArtistsList: React.FC<Props> = ({ client, onRequest }) => {
  const [likedArtists, setLikedArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    const fetchLiked = async () => {
      setLoading(true);
      try {
        const ids = Array.isArray(client.likedArtists) ? client.likedArtists : [];
        const results = await Promise.all(
          ids.map(async (id) => {
            const snap = await getDoc(doc(db, "users", id));
            if (!snap.exists()) return null;

            const data = snap.data();
            const previewSnap = await getDocs(
              query(collection(db, "gallery"), where("artistId", "==", id))
            );
            const previewItem = previewSnap.docs
              .map((galleryDoc) => galleryDoc.data())
              .find((item) => item.thumbUrl || item.webp90Url || item.fullUrl);

            return {
              id,
              name: data.displayName || data.name || "Artist",
              displayName: data.displayName,
              avatarUrl: data.avatarUrl,
              studioName: data.studioName,
              shopId: data.shopId,
              specialties: Array.isArray(data.specialties) ? data.specialties : [],
              bio: data.bio,
              previewUrl:
                previewItem?.thumbUrl || previewItem?.webp90Url || previewItem?.fullUrl,
            } as Artist;
          })
        );

        if (!ignore) setLikedArtists(results.filter((artist): artist is Artist => artist !== null));
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    fetchLiked();
    return () => {
      ignore = true;
    };
  }, [client.likedArtists]);

  const artistsWithSpecialties = useMemo(
    () => likedArtists.filter((artist) => artist.specialties?.length).length,
    [likedArtists]
  );

  if (loading) {
    return (
      <section className="mx-auto mt-6 max-w-7xl space-y-6">
        <DashboardHeader title="Liked artists" eyebrow="Client collection" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-80 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-6 max-w-7xl space-y-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <DashboardHeader
          eyebrow="Client collection"
          title="Liked artists"
          description="Keep your favorite artists close and start a new tattoo request when inspiration hits."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
          <MetricCard label="Saved" value={likedArtists.length} />
          <MetricCard label="Styled" value={artistsWithSpecialties} />
        </div>
      </div>

      {likedArtists.length === 0 ? (
        <EmptyState
          icon={<Heart size={22} />}
          title="No liked artists yet"
          description="Follow artists from their profile pages and they will appear here for quick requests."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {likedArtists.map((artist) => (
            <article
              key={artist.id}
              className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg transition hover:border-white/20 hover:bg-[#151515]"
            >
              <div className="relative h-44 bg-black">
                {artist.previewUrl ? (
                  <img
                    src={artist.previewUrl}
                    alt={`${artist.name} work preview`}
                    className="h-full w-full object-cover opacity-85"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
                    <ImageIcon size={26} />
                    <span className="text-sm">No portfolio preview</span>
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
                  {artist.studioName || "Studio not listed"}
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
                  onClick={() => onRequest(artist)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-3! py-2.5! text-sm! font-semibold text-black transition hover:bg-white/85"
                >
                  <MessageCircle size={16} />
                  Request
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
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
    <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">{eyebrow}</p>
    <h1 className="mt-2 text-3xl! font-semibold text-white">{title}</h1>
    {description && <p className="mt-2 max-w-2xl text-sm text-neutral-400">{description}</p>}
  </div>
);

const MetricCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
  </div>
);

const EmptyState = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
      {icon}
    </div>
    <h2 className="mt-4 text-xl! font-semibold! text-white">{title}</h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">{description}</p>
  </div>
);

export default LikedArtistsList;
