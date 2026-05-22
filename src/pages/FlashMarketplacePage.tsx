import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  ImageOff,
  Search,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import {
  collection,
  documentId,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase/firebaseConfig";
import FlashRequestModal, {
  type FlashRequestArtist,
  type FlashRequestClient,
} from "../components/FlashRequestModal";
import type { Flash } from "../types/Flash";
import type { FlashSheet } from "../types/FlashSheet";

type MarketplaceTab = "flashes" | "sheets";
type PriceSort = "newest" | "price_asc" | "price_desc";

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

const DEFAULT_FLASH_ITEMS_PER_PAGE = 18;
const FLASH_ITEMS_PER_PAGE_OPTIONS = [18, 36, 54];

const FlashMarketplacePage = () => {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("flashes");
  const [flashes, setFlashes] = useState<MarketFlash[]>([]);
  const [sheets, setSheets] = useState<MarketFlashSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [priceSort, setPriceSort] = useState<PriceSort>("newest");
  const [client, setClient] = useState<FlashRequestClient | null>(null);
  const [selectedFlash, setSelectedFlash] = useState<MarketFlash | null>(null);
  const [flashPage, setFlashPage] = useState(0);
  const [flashItemsPerPage, setFlashItemsPerPage] = useState(
    DEFAULT_FLASH_ITEMS_PER_PAGE
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setClient(null);
        return;
      }

      try {
        const clientRef = doc(db, "users", user.uid);
        const clientSnap = await getDoc(clientRef);
        const data = clientSnap.exists() ? clientSnap.data() : {};

        setClient({
          id: user.uid,
          name:
            (data.name as string) ||
            (data.displayName as string) ||
            user.displayName ||
            "Client",
          avatarUrl:
            (data.avatarUrl as string) ||
            user.photoURL ||
            "/default-avatar.png",
        });
      } catch (err) {
        console.error("Failed to fetch client profile:", err);
        setClient({
          id: user.uid,
          name: user.displayName || "Client",
          avatarUrl: user.photoURL || "/default-avatar.png",
        });
      }
    });

    return () => unsubscribe();
  }, []);

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
    const minPrice = parseBudgetValue(minBudget);
    const maxPrice = parseBudgetValue(maxBudget);

    return flashes
      .filter((flash) => {
        const matchesBudget = matchesBudgetRange(flash, minPrice, maxPrice);
        return (
          matchesBudget && matchesSearchAndTag(flash, searchTerm, selectedTag)
        );
      })
      .sort((a, b) => sortFlashes(a, b, priceSort));
  }, [flashes, maxBudget, minBudget, priceSort, searchTerm, selectedTag]);

  const filteredSheets = useMemo(
    () =>
      sheets.filter((sheet) =>
        matchesSearchAndTag(sheet, searchTerm, selectedTag)
      ),
    [sheets, searchTerm, selectedTag]
  );

  const visibleItems =
    activeTab === "flashes" ? filteredFlashes.length : filteredSheets.length;
  const flashPageCount = Math.max(
    1,
    Math.ceil(filteredFlashes.length / flashItemsPerPage)
  );
  const pagedFlashes = filteredFlashes.slice(
    flashPage * flashItemsPerPage,
    flashPage * flashItemsPerPage + flashItemsPerPage
  );

  useEffect(() => {
    setFlashPage(0);
  }, [activeTab, maxBudget, minBudget, priceSort, searchTerm, selectedTag]);

  useEffect(() => {
    if (flashPage >= flashPageCount) {
      setFlashPage(Math.max(0, flashPageCount - 1));
    }
  }, [flashPage, flashPageCount]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#101010] via-[#0c0c0c] to-[#151515] px-4 pb-20 pt-24 text-white">
      <section className="mx-auto max-w-7xl">
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
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_360px]">
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
              <SlidersHorizontal
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35"
              />
              <select
                value={priceSort}
                onChange={(event) => setPriceSort(event.target.value as PriceSort)}
                disabled={activeTab === "sheets"}
                className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#151515] pl-11 pr-4 text-sm font-semibold text-white outline-none transition disabled:cursor-not-allowed disabled:opacity-40 focus:border-white/30"
              >
                <option value="newest">Sort: newest</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label>

            <div
              className={`rounded-xl border border-white/10 bg-black/25 p-2 transition ${
                activeTab === "sheets" ? "opacity-40" : ""
              }`}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-white/35">
                  <Filter size={16} />
                </div>
                <BudgetInput
                  label="Min"
                  value={minBudget}
                  disabled={activeTab === "sheets"}
                  onChange={setMinBudget}
                />
                <span className="text-xs font-semibold text-white/35">to</span>
                <BudgetInput
                  label="Max"
                  value={maxBudget}
                  disabled={activeTab === "sheets"}
                  onChange={setMaxBudget}
                />
              </div>
            </div>
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

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
              {activeTab === "flashes" ? "Available designs" : "Browse sheets"}
            </p>
            <h2 className="mt-2 text-3xl! font-semibold text-white">
              {activeTab === "flashes" ? "Flash items" : "Flash sheets"}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-white/45">
              {visibleItems} result{visibleItems === 1 ? "" : "s"}
            </p>
            {activeTab === "flashes" &&
              filteredFlashes.length > DEFAULT_FLASH_ITEMS_PER_PAGE && (
                <FlashPager
                  currentPage={flashPage}
                  pageCount={flashPageCount}
                  totalItems={filteredFlashes.length}
                  pageSize={flashItemsPerPage}
                  onPrevious={() =>
                    setFlashPage((page) => Math.max(0, page - 1))
                  }
                  onNext={() =>
                    setFlashPage((page) =>
                      Math.min(flashPageCount - 1, page + 1)
                    )
                  }
                  onPageSizeChange={(pageSize) => {
                    setFlashItemsPerPage(pageSize);
                    setFlashPage(0);
                  }}
                />
              )}
          </div>
        </div>

        {loading ? (
          <MarketplaceSkeleton />
        ) : activeTab === "flashes" ? (
          filteredFlashes.length > 0 ? (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {pagedFlashes.map((flash) => (
                <FlashCard
                  key={flash.id}
                  flash={flash}
                  onRequest={() => setSelectedFlash(flash)}
                />
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

      {selectedFlash && (
        <FlashRequestModal
          artist={getRequestArtist(selectedFlash)}
          client={client}
          flash={selectedFlash}
          onClose={() => setSelectedFlash(null)}
        />
      )}
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

const BudgetInput = ({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) => (
  <label className="relative block">
    <span className="sr-only">{label} budget</span>
    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/35">
      $
    </span>
    <input
      type="number"
      min={0}
      inputMode="numeric"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={label}
      className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.035] pl-5 pr-2 text-xs font-semibold text-white outline-none transition placeholder:text-white/30 disabled:cursor-not-allowed focus:border-white/30 focus:bg-white/[0.06]"
    />
  </label>
);

const FlashPager = ({
  currentPage,
  pageCount,
  totalItems,
  pageSize,
  onPrevious,
  onNext,
  onPageSizeChange,
}: {
  currentPage: number;
  pageCount: number;
  totalItems: number;
  pageSize: number;
  onPrevious: () => void;
  onNext: () => void;
  onPageSizeChange: (pageSize: number) => void;
}) => {
  const firstItem = currentPage * pageSize + 1;
  const lastItem = Math.min(totalItems, (currentPage + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-2 py-1">
      <span className="px-2 text-xs font-semibold text-white/50">
        {firstItem}-{lastItem} of {totalItems}
      </span>
      <span className="hidden h-4 w-px bg-white/10 sm:block" />
      <span className="hidden px-1 text-xs font-semibold text-white/35 sm:inline">
        Page {currentPage + 1} of {pageCount}
      </span>
      <label className="relative">
        <span className="sr-only">Items per page</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-8 appearance-none rounded-full border border-white/10 bg-black/30 pl-3 pr-7 text-xs font-semibold text-white/60 outline-none transition hover:border-white/20 focus:border-white/35"
        >
          {FLASH_ITEMS_PER_PAGE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}/page
            </option>
          ))}
        </select>
        <ChevronRight
          size={13}
          className="pointer-events-none absolute right-2 top-1/2 rotate-90 -translate-y-1/2 text-white/35"
        />
      </label>
      <button
        type="button"
        onClick={onPrevious}
        disabled={currentPage === 0}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white p-0! text-black shadow-sm transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/25"
        aria-label="Previous flash page"
      >
        <ChevronLeft size={16} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={currentPage >= pageCount - 1}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white p-0! text-black shadow-sm transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/25"
        aria-label="Next flash page"
      >
        <ChevronRight size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
};

const FlashCard = ({
  flash,
  onRequest,
}: {
  flash: MarketFlash;
  onRequest: () => void;
}) => {
  const previewUrl = getFlashPreviewUrl(flash);
  const artistName = getArtistName(flash.artist);

  return (
    <article
      tabIndex={0}
      className="group overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.055] via-[#111] to-[#0c0c0c] shadow-lg transition hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/20"
    >
      <div className="relative aspect-[3/2] bg-black/30">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={getFlashTitle(flash)}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="text-white/25" size={36} />
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex min-h-[42px] items-start gap-2">
          <img
            src={flash.artist?.avatarUrl || "/default-avatar.png"}
            alt={artistName}
            className="mt-0.5 h-7 w-7 shrink-0 rounded-full border border-white/15 object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h3 className="my-0! min-w-0 flex-1 truncate text-sm! font-semibold text-white">
                {getFlashTitle(flash)}
              </h3>
              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-2 py-0.5 text-[11px] font-bold leading-none text-white/80">
                {formatFlashPrice(flash.price)}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-white/50">
              by {artistName}
            </p>
          </div>
        </div>

        <TagList tags={flash.tags} />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            to={`/artists/${flash.artistId}`}
            className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2 text-[11px] font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          >
            View artist
          </Link>
          <button
            type="button"
            onClick={onRequest}
            className="pointer-events-none !inline-flex !h-8 !items-center !justify-center !whitespace-nowrap !rounded-full bg-[var(--color-primary)] !px-2 !py-0 !text-[11px] font-semibold text-white opacity-0 transition hover:bg-[var(--color-primary-hover)] group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 [@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:opacity-100"
            aria-label={`Request this flash: ${getFlashTitle(flash)}`}
          >
            Request
          </button>
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
    <div className="mt-3 flex flex-wrap gap-1.5">
      {tags.slice(0, 3).map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-white/50"
        >
          <Tag size={11} />
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

const getRequestArtist = (flash: MarketFlash): FlashRequestArtist => ({
  id: flash.artist?.id || flash.artistId,
  name: flash.artist?.name,
  displayName: flash.artist?.displayName,
  avatarUrl: flash.artist?.avatarUrl,
});

const getFlashTitle = (flash: Flash) =>
  flash.title || flash.caption || "Untitled flash";

const formatFlashPrice = (price?: number | null) =>
  typeof price === "number" ? `$${price}` : "Price TBD";

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

const parseBudgetValue = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const matchesBudgetRange = (
  flash: Flash,
  minPrice: number | null,
  maxPrice: number | null
) => {
  if (minPrice === null && maxPrice === null) return true;
  if (typeof flash.price !== "number") return false;

  const meetsMin = minPrice === null || flash.price >= minPrice;
  const meetsMax = maxPrice === null || flash.price <= maxPrice;

  return meetsMin && meetsMax;
};

const getSortablePrice = (flash: Flash) =>
  typeof flash.price === "number" ? flash.price : null;

const sortFlashes = (a: Flash, b: Flash, priceSort: PriceSort) => {
  if (priceSort === "newest") return sortByNewest(a, b);

  const aPrice = getSortablePrice(a);
  const bPrice = getSortablePrice(b);
  if (aPrice === null && bPrice === null) return sortByNewest(a, b);
  if (aPrice === null) return 1;
  if (bPrice === null) return -1;

  const priceDifference =
    priceSort === "price_asc" ? aPrice - bPrice : bPrice - aPrice;

  return priceDifference || sortByNewest(a, b);
};

export default FlashMarketplacePage;
