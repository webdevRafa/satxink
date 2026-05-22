import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  DollarSign,
  Filter,
  ImageOff,
  Search,
  Tag,
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

type MarketplaceTab = "flashes" | "sheets";
type PriceFilter = "all" | "under_100" | "under_200" | "under_400";

type PublicArtist = {
  id: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string;
  studioName?: string;
  role?: string;
};

type MarketFlash = Flash & {
  artist?: PublicArtist;
};

type MarketFlashSheet = FlashSheet & {
  artist?: PublicArtist;
};

const priceFilters: { label: string; value: PriceFilter; max?: number }[] = [
  { label: "Any price", value: "all" },
  { label: "$100 and under", value: "under_100", max: 100 },
  { label: "$200 and under", value: "under_200", max: 200 },
  { label: "$400 and under", value: "under_400", max: 400 },
];

const FlashMarketplacePage = () => {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("flashes");
  const [flashes, setFlashes] = useState<MarketFlash[]>([]);
  const [sheets, setSheets] = useState<MarketFlashSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");

  useEffect(() => {
    let isMounted = true;

    const fetchMarketplace = async () => {
      try {
        setLoading(true);

        const [flashSnapshot, sheetSnapshot] = await Promise.all([
          getDocs(collection(db, "flashes")),
          getDocs(collection(db, "flashSheets")),
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
                  typedFlash.fullUrl ||
                  typedFlash.status === "processing")
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

        setFlashes(
          rawFlashes
            .map((flash) => ({
              ...flash,
              artist: artistsById[flash.artistId],
            }))
            .sort(sortByNewest)
        );
        setSheets(
          rawSheets
            .map((sheet) => ({
              ...sheet,
              artist: artistsById[sheet.artistId],
            }))
            .sort(sortByNewest)
        );
      } catch (err) {
        console.error("Failed to fetch flash marketplace:", err);
        if (isMounted) {
          setFlashes([]);
          setSheets([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchMarketplace();

    return () => {
      isMounted = false;
    };
  }, []);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    [...flashes, ...sheets].forEach((item) => {
      (item.tags || []).forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b)).slice(0, 18);
  }, [flashes, sheets]);

  const filteredFlashes = useMemo(() => {
    return flashes.filter((flash) => {
      const maxPrice = priceFilters.find(
        (filter) => filter.value === priceFilter
      )?.max;

      const matchesPrice =
        !maxPrice ||
        (typeof flash.price === "number" && flash.price <= maxPrice);

      return matchesPrice && matchesSearchAndTag(flash, searchTerm, selectedTag);
    });
  }, [flashes, priceFilter, searchTerm, selectedTag]);

  const filteredSheets = useMemo(
    () =>
      sheets.filter((sheet) =>
        matchesSearchAndTag(sheet, searchTerm, selectedTag)
      ),
    [sheets, searchTerm, selectedTag]
  );

  const visibleItems =
    activeTab === "flashes" ? filteredFlashes.length : filteredSheets.length;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#101010] via-[#0c0c0c] to-[#151515] px-4 pb-20 pt-24 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] p-5 shadow-xl md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/45">
            Flash marketplace
          </p>
          <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="max-w-3xl text-3xl! font-bold leading-tight text-white md:text-4xl!">
                Browse flash designs and sheets from SATX artists.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">
                Search by subject, style, tag, or artist. Compare individual
                flash pieces by price, or open full sheets when you want to
                explore a collection.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
              <MarketStat label="Flash items" value={flashes.length} />
              <MarketStat label="Flash sheets" value={sheets.length} />
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
                placeholder="Search by tag, artist, sheet, or flash title"
                className="h-12 w-full rounded-xl border border-white/10 bg-black/25 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/30 focus:bg-black/35"
              />
            </label>

            <label className="relative block">
              <Filter
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35"
              />
              <select
                value={priceFilter}
                onChange={(event) =>
                  setPriceFilter(event.target.value as PriceFilter)
                }
                disabled={activeTab === "sheets"}
                className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#151515] pl-11 pr-4 text-sm font-semibold text-white outline-none transition disabled:cursor-not-allowed disabled:opacity-40 focus:border-white/30"
              >
                {priceFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("flashes")}
              className={`rounded-full border px-4! py-2! text-xs! font-semibold transition ${
                activeTab === "flashes"
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-white/[0.035] text-white/60 hover:border-white/25 hover:text-white"
              }`}
            >
              Individual flash
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sheets")}
              className={`rounded-full border px-4! py-2! text-xs! font-semibold transition ${
                activeTab === "sheets"
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-white/[0.035] text-white/60 hover:border-white/25 hover:text-white"
              }`}
            >
              Flash sheets
            </button>
          </div>

          {allTags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <TagButton
                active={!selectedTag}
                label="All tags"
                onClick={() => setSelectedTag("")}
              />
              {allTags.map((tag) => (
                <TagButton
                  key={tag}
                  active={selectedTag === tag}
                  label={`#${tag}`}
                  onClick={() => setSelectedTag(tag)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="mt-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
              {activeTab === "flashes" ? "Available designs" : "Browse sheets"}
            </p>
            <h2 className="mt-2 text-3xl! font-semibold text-white">
              {activeTab === "flashes" ? "Flash items" : "Flash sheets"}
            </h2>
          </div>
          <p className="text-sm text-white/45">
            {visibleItems} result{visibleItems === 1 ? "" : "s"}
          </p>
        </div>

        {loading ? (
          <MarketplaceSkeleton />
        ) : activeTab === "flashes" ? (
          filteredFlashes.length > 0 ? (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredFlashes.map((flash) => (
                <FlashCard key={flash.id} flash={flash} />
              ))}
            </div>
          ) : (
            <EmptyMarketplaceState />
          )
        ) : filteredSheets.length > 0 ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSheets.map((sheet) => (
              <FlashSheetMarketCard key={sheet.id} sheet={sheet} />
            ))}
          </div>
        ) : (
          <EmptyMarketplaceState />
        )}
      </section>
    </main>
  );
};

const MarketStat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-white/10 bg-black/25 p-4">
    <p className="text-sm text-white/45">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
  </div>
);

const TagButton = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full border px-3! py-1.5! text-xs! font-semibold transition ${
      active
        ? "border-white bg-white text-black"
        : "border-white/10 bg-white/[0.035] text-white/55 hover:border-white/25 hover:text-white"
    }`}
  >
    {label}
  </button>
);

const FlashCard = ({ flash }: { flash: MarketFlash }) => {
  const previewUrl = getFlashPreviewUrl(flash);
  const artistName = getArtistName(flash.artist);

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-transparent shadow-xl transition hover:border-white/20">
      <div className="relative aspect-square bg-black/30">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={getFlashTitle(flash)}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="text-white/25" size={36} />
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <img
            src={flash.artist?.avatarUrl || "/default-avatar.png"}
            alt={artistName}
            className="h-10 w-10 rounded-full border border-white/10 object-cover"
          />
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-lg! font-semibold text-white">
              {getFlashTitle(flash)}
            </h3>
            <p className="mt-1 truncate text-sm text-white/50">
              by {artistName}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-white/70">
          <DollarSign size={15} className="text-white/35" />
          {typeof flash.price === "number" ? `$${flash.price}` : "Price TBD"}
        </div>

        <TagList tags={flash.tags} />

        <div className="mt-5 flex justify-end">
          <Link
            to={`/artists/${flash.artistId}`}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
          >
            View artist
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
};

const FlashSheetMarketCard = ({ sheet }: { sheet: MarketFlashSheet }) => {
  const artistName = getArtistName(sheet.artist);

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-transparent shadow-xl transition hover:border-white/20">
      <Link to={`/flash/sheets/${sheet.id}`} className="block">
        <div className="relative aspect-[4/5] bg-black/30">
          <img
            src={sheet.thumbUrl || sheet.imageUrl}
            alt={sheet.title || "Flash sheet"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/75 backdrop-blur">
            Sheet
          </span>
        </div>
      </Link>

      <div className="p-4">
        <h3 className="line-clamp-2 text-lg! font-semibold text-white">
          {sheet.title || "Untitled flash sheet"}
        </h3>
        <p className="mt-1 truncate text-sm text-white/50">by {artistName}</p>
        <TagList tags={sheet.tags} />
        <div className="mt-5 flex justify-end">
          <Link
            to={`/flash/sheets/${sheet.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/85"
          >
            View sheet
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
};

const TagList = ({ tags }: { tags?: string[] }) => {
  if (!tags?.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {tags.slice(0, 5).map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/50"
        >
          <Tag size={12} />
          {tag}
        </span>
      ))}
    </div>
  );
};

const MarketplaceSkeleton = () => (
  <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
    {[0, 1, 2, 3, 4, 5].map((item) => (
      <div
        key={item}
        className="h-[420px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]"
      />
    ))}
  </div>
);

const EmptyMarketplaceState = () => (
  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center">
    <Tag className="mx-auto mb-4 text-white/25" size={38} />
    <h3 className="text-2xl! font-semibold text-white">No flash found</h3>
    <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/50">
      Try a different tag, search term, or price filter.
    </p>
  </div>
);

const matchesSearchAndTag = (
  item: MarketFlash | MarketFlashSheet,
  searchTerm: string,
  selectedTag: string
) => {
  const tags = item.tags || [];
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const matchesTag = !selectedTag || tags.includes(selectedTag);
  const searchableText = [
    "title" in item ? item.title : "",
    "caption" in item ? item.caption : "",
    item.artist?.displayName,
    item.artist?.name,
    item.artist?.studioName,
    ...tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return matchesTag && (!normalizedSearch || searchableText.includes(normalizedSearch));
};

const fetchArtistsById = async (artistIds: string[]) => {
  const artistsById: Record<string, PublicArtist> = {};
  const chunks = chunkArray(artistIds, 30);

  for (const chunk of chunks) {
    if (!chunk.length) continue;

    const artistsQuery = query(
      collection(db, "users"),
      where(documentId(), "in", chunk)
    );

    const snapshot = await getDocs(artistsQuery);

    snapshot.docs.forEach((artistDoc) => {
      artistsById[artistDoc.id] = {
        id: artistDoc.id,
        ...artistDoc.data(),
      } as PublicArtist;
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

const getArtistName = (artist?: PublicArtist) =>
  artist?.displayName || artist?.name || "SATX Ink artist";

const getFlashTitle = (flash: Flash) =>
  flash.title || flash.caption || "Untitled flash";

const getFlashPreviewUrl = (flash: Flash) =>
  flash.thumbUrl || flash.webp90Url || flash.fullUrl || "";

const getCreatedTime = (item: Flash | FlashSheet) => {
  const createdAt = item.createdAt;

  if (!createdAt) return 0;
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

  return 0;
};

const sortByNewest = <T extends Flash | FlashSheet>(a: T, b: T) =>
  getCreatedTime(b) - getCreatedTime(a);

export default FlashMarketplacePage;
