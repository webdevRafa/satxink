import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Filter,
  Image as ImageIcon,
  Layers,
  Loader2,
  Search,
  SlidersHorizontal,
  Tag,
  type LucideIcon,
} from "lucide-react";
import CountUp from "react-countup";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type OrderByDirection,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase/firebaseConfig";
import FlashRequestModal, {
  type FlashRequestArtist,
  type FlashRequestClient,
} from "../components/FlashRequestModal";
import type { Flash } from "../types/Flash";
import type { FlashSheet } from "../types/FlashSheet";
import { getClientNameParts } from "../utils/clientDisplayName";
import {
  flashPreviewCardClassName,
  getFlashTitle,
} from "../utils/flashPreview";
import {
  FlashPreviewImage,
  FlashPreviewMeta,
} from "../components/FlashPreviewCard";

type MarketplaceTab = "flashes" | "sheets";
type PriceSort = "newest" | "price_asc" | "price_desc";
type MarketplaceCursor = QueryDocumentSnapshot<DocumentData> | null;

type PublicArtist = {
  id: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string;
  studioName?: string;
};

type MarketFlash = Flash & {
  artist?: PublicArtist | null;
};

type MarketFlashSheet = FlashSheet & {
  artist?: PublicArtist | null;
};

type MarketplaceTopTag = {
  key: string;
  tag: string;
  count?: number;
};

type MarketplaceMetadata = {
  flashCount: number;
  sheetCount: number;
  topTags: MarketplaceTopTag[];
};

const MARKETPLACE_BATCH_SIZE = 18;
const CLIENT_FILTER_MAX_FETCH_ROUNDS = 5;

const emptyMetadata: MarketplaceMetadata = {
  flashCount: 0,
  sheetCount: 0,
  topTags: [],
};

function useViewportEntry<T extends Element>() {
  const targetRef = useRef<T | null>(null);
  const isInViewRef = useRef(false);
  const [entryCount, setEntryCount] = useState(0);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isInViewRef.current) {
          isInViewRef.current = true;
          setEntryCount((count) => count + 1);
        } else if (!entry.isIntersecting) {
          isInViewRef.current = false;
        }
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.35,
      }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, []);

  return { targetRef, entryCount };
}

const FlashMarketplacePage = () => {
  const { targetRef: marketStatsRef, entryCount: marketStatsEntryCount } =
    useViewportEntry<HTMLDListElement>();
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("flashes");
  const [flashes, setFlashes] = useState<MarketFlash[]>([]);
  const [sheets, setSheets] = useState<MarketFlashSheet[]>([]);
  const [metadata, setMetadata] = useState<MarketplaceMetadata>(emptyMetadata);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreFlashes, setHasMoreFlashes] = useState(false);
  const [hasMoreSheets, setHasMoreSheets] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [priceSort, setPriceSort] = useState<PriceSort>("newest");
  const [client, setClient] = useState<FlashRequestClient | null>(null);
  const [selectedFlash, setSelectedFlash] = useState<MarketFlash | null>(null);
  const fetchSequenceRef = useRef(0);
  const flashCursorRef = useRef<MarketplaceCursor>(null);
  const sheetCursorRef = useRef<MarketplaceCursor>(null);

  const searchTokens = useMemo(
    () => getSearchTokens(searchTerm),
    [searchTerm]
  );
  const minPrice = useMemo(() => parseBudgetValue(minBudget), [minBudget]);
  const maxPrice = useMemo(() => parseBudgetValue(maxBudget), [maxBudget]);

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
        const clientNameParts = getClientNameParts(
          data,
          user.displayName || "Client"
        );

        setClient({
          id: user.uid,
          name: clientNameParts.fullName,
          firstName: clientNameParts.firstName,
          lastName: clientNameParts.lastName,
          avatarUrl:
            (data.avatarUrl as string) ||
            user.photoURL ||
            "/default-avatar.png",
        });
      } catch (err) {
        console.error("Failed to fetch client profile:", err);
        const clientNameParts = getClientNameParts(
          { displayName: user.displayName },
          "Client"
        );
        setClient({
          id: user.uid,
          name: clientNameParts.fullName,
          firstName: clientNameParts.firstName,
          lastName: clientNameParts.lastName,
          avatarUrl: user.photoURL || "/default-avatar.png",
        });
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchMetadata = async () => {
      try {
        const metadataSnap = await getDoc(
          doc(db, "siteSettings", "flashMarketplace")
        );
        if (!isMounted) return;
        setMetadata(parseMarketplaceMetadata(metadataSnap.data()));
      } catch (err) {
        console.error("Failed to fetch marketplace metadata:", err);
        if (isMounted) setMetadata(emptyMetadata);
      }
    };

    fetchMetadata();

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchMarketplacePage = useCallback(
    async (mode: "replace" | "append" = "replace") => {
      const sequence = ++fetchSequenceRef.current;
      const tab = activeTab;
      const isAppend = mode === "append";
      const startingCursor =
        isAppend && tab === "flashes"
          ? flashCursorRef.current
          : isAppend
          ? sheetCursorRef.current
          : null;
      const collected: Array<MarketFlash | MarketFlashSheet> = [];
      let nextCursor: MarketplaceCursor = startingCursor;
      let nextHasMore = false;
      let fetchRounds = 0;

      if (isAppend) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setSelectedFlash(null);
        if (tab === "flashes") {
          setFlashes([]);
          flashCursorRef.current = null;
          setHasMoreFlashes(false);
        } else {
          setSheets([]);
          sheetCursorRef.current = null;
          setHasMoreSheets(false);
        }
      }

      try {
        do {
          fetchRounds += 1;
          const marketplaceQuery = buildMarketplaceQuery({
            tab,
            cursor: nextCursor,
            selectedTag,
            searchTokens,
            priceSort,
            minPrice,
            maxPrice,
          });
          const snapshot = await getDocs(marketplaceQuery);
          const docs = snapshot.docs;

          if (docs.length === 0) {
            nextHasMore = false;
            break;
          }

          nextCursor = docs[docs.length - 1];
          nextHasMore = docs.length === MARKETPLACE_BATCH_SIZE;
          collected.push(
            ...docs
              .map((marketDoc) =>
                tab === "flashes"
                  ? toMarketFlash(marketDoc)
                  : toMarketFlashSheet(marketDoc)
              )
              .filter((item) =>
                matchesActiveMarketplaceFilters({
                  item,
                  tab,
                  selectedTag,
                  searchTokens,
                  minPrice,
                  maxPrice,
                })
              )
          );
        } while (
          nextHasMore &&
          needsClientSideFiltering({
            tab,
            selectedTag,
            searchTokens,
            priceSort,
            minPrice,
            maxPrice,
          }) &&
          collected.length < MARKETPLACE_BATCH_SIZE &&
          fetchRounds < CLIENT_FILTER_MAX_FETCH_ROUNDS
        );

        if (sequence !== fetchSequenceRef.current) return;

        if (tab === "flashes") {
          setFlashes((current) =>
            isAppend
              ? dedupeById([...current, ...(collected as MarketFlash[])])
              : (collected as MarketFlash[])
          );
          flashCursorRef.current = nextCursor;
          setHasMoreFlashes(nextHasMore);
        } else {
          setSheets((current) =>
            isAppend
              ? dedupeById([...current, ...(collected as MarketFlashSheet[])])
              : (collected as MarketFlashSheet[])
          );
          sheetCursorRef.current = nextCursor;
          setHasMoreSheets(nextHasMore);
        }
      } catch (err) {
        console.error("Failed to fetch flash marketplace:", err);
        if (sequence === fetchSequenceRef.current && !isAppend) {
          if (tab === "flashes") setFlashes([]);
          else setSheets([]);
        }
      } finally {
        if (sequence === fetchSequenceRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [
      activeTab,
      maxPrice,
      minPrice,
      priceSort,
      searchTokens,
      selectedTag,
    ]
  );

  useEffect(() => {
    void fetchMarketplacePage("replace");
  }, [
    activeTab,
    maxPrice,
    minPrice,
    priceSort,
    searchTokens,
    selectedTag,
    fetchMarketplacePage,
  ]);

  const activeItems = activeTab === "flashes" ? flashes : sheets;
  const hasMore = activeTab === "flashes" ? hasMoreFlashes : hasMoreSheets;
  const activeTotal =
    activeTab === "flashes" ? metadata.flashCount : metadata.sheetCount;
  const hasActiveFilters = Boolean(
    selectedTag ||
      searchTokens.length > 0 ||
      (activeTab === "flashes" && (minPrice !== null || maxPrice !== null))
  );
  const resultLabel = getResultLabel({
    loadedCount: activeItems.length,
    totalCount: activeTotal,
    hasFilters: hasActiveFilters,
    hasMore,
  });

  const marketStats = useMemo(
    () => [
      {
        label: "Items",
        value: metadata.flashCount,
        icon: ImageIcon,
      },
      {
        label: "Sheets",
        value: metadata.sheetCount,
        icon: Layers,
      },
    ],
    [metadata.flashCount, metadata.sheetCount]
  );

  return (
    <main className="min-h-screen bg-[var(--color-bg-base)] pb-20 text-white">
      <section className="relative isolate overflow-hidden border-b border-white/[0.08] bg-[#090909] px-4 pt-28 sm:pt-24 lg:pt-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "54px 54px",
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black via-black/70 to-transparent"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[var(--color-bg-base)] via-[#090909]/75 to-transparent"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent opacity-80"
          aria-hidden="true"
        />

        <div className="relative mx-auto grid min-h-[288px] max-w-[1300px] gap-8 pb-7 pt-0 sm:min-h-[320px] lg:min-h-[300px] lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end lg:pb-6">
          <div className="max-w-3xl pb-2">
            <h1 className="mb-0! text-[1.7rem]! font-bold leading-none text-white! text-4xl">
              Flash Marketplace
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-300! ">
              Browse flash designs and sheets from SATX artists. Search by
              subject, style, tag, or artist when you want to explore a
              collection.
            </p>

            <dl
              ref={marketStatsRef}
              className="mt-5 grid max-w-md grid-cols-2 gap-2 sm:mt-6 sm:gap-3"
            >
              {marketStats.map((stat) => (
                <MarketStat
                  key={stat.label}
                  icon={stat.icon}
                  label={stat.label}
                  value={stat.value}
                  entryCount={marketStatsEntryCount}
                />
              ))}
            </dl>
          </div>

          <div
            className="relative hidden h-[240px] lg:block"
            aria-hidden="true"
          >
            <div className="absolute bottom-0 left-5 right-2 h-[190px]">
              {[
                {
                  left: "0.25rem",
                  bottom: "0.4rem",
                  rotate: "-7deg",
                  opacity: 0.64,
                },
                {
                  left: "6.4rem",
                  bottom: "1.55rem",
                  rotate: "4deg",
                  opacity: 0.82,
                },
                {
                  left: "12.55rem",
                  bottom: "0.95rem",
                  rotate: "-2deg",
                  opacity: 0.72,
                },
              ].map((card, index) => (
                <div
                  key={index}
                  className="absolute h-36 w-24 rounded-lg border border-white/[0.1] bg-white/[0.045] shadow-[0_20px_55px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.06)]"
                  style={{
                    left: card.left,
                    bottom: card.bottom,
                    opacity: card.opacity,
                    transform: `rotate(${card.rotate})`,
                  }}
                >
                  <div className="absolute left-3.5 top-3.5 h-9 w-9 rounded-full border border-white/[0.13]" />
                  <div className="absolute right-3.5 top-7 h-7 w-7 rounded-full border border-white/[0.1]" />
                  <div className="absolute left-5 top-14 h-11 w-11 rotate-45 rounded-lg border border-white/[0.09]" />
                  <div className="absolute bottom-4 left-3.5 h-1.5 w-12 rounded-full bg-[var(--color-primary)]/80" />
                  <div className="absolute bottom-8 left-3.5 h-1.5 w-[4.25rem] rounded-full bg-white/[0.12]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1300px] px-4 pt-6">
        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-xl">
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
                onChange={(event) =>
                  setPriceSort(event.target.value as PriceSort)
                }
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

          {metadata.topTags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <TagButton
                active={!selectedTag}
                label="All tags"
                onClick={() => setSelectedTag("")}
              />
              {metadata.topTags.map((tag) => (
                <TagButton
                  key={tag.key}
                  active={selectedTag === tag.key}
                  label={`#${tag.tag}`}
                  onClick={() => setSelectedTag(tag.key)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="sticky top-20 z-30 mt-10 flex flex-col gap-4 border-y border-white/10 bg-[#0d0d0d]/92 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
              {activeTab === "flashes" ? "Available designs" : "Browse sheets"}
            </p>
            <h2 className="mt-2 text-3xl! font-semibold text-white">
              {activeTab === "flashes" ? "Flash items" : "Flash sheets"}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-white/45">{resultLabel}</p>
          </div>
        </div>

        {loading ? (
          <MarketplaceSkeleton />
        ) : activeTab === "flashes" ? (
          flashes.length > 0 ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {flashes.map((flash) => (
                  <FlashCard
                    key={flash.id}
                    flash={flash}
                    onRequest={() => setSelectedFlash(flash)}
                  />
                ))}
              </div>
              {hasMoreFlashes && (
                <LoadMoreButton
                  loading={loadingMore}
                  onClick={() => void fetchMarketplacePage("append")}
                />
              )}
            </>
          ) : (
            <EmptyMarketplaceState />
          )
        ) : sheets.length > 0 ? (
          <>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sheets.map((sheet) => (
                <FlashSheetMarketCard key={sheet.id} sheet={sheet} />
              ))}
            </div>
            {hasMoreSheets && (
              <LoadMoreButton
                loading={loadingMore}
                onClick={() => void fetchMarketplacePage("append")}
              />
            )}
          </>
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

const MarketStat = ({
  icon: Icon,
  label,
  value,
  entryCount,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  entryCount: number;
}) => (
  <div className="min-w-0 rounded-lg px-2 py-1! sm:px-4 sm:py-3">
    <dt className="flex items-start gap-1.5 text-[10px] font-medium leading-tight text-neutral-400 sm:items-center sm:gap-2 sm:text-xs">
      <Icon
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary-hover)] sm:mt-0 sm:h-4 sm:w-4"
        aria-hidden="true"
      />
      {label}
    </dt>
    <dd className="mt-1 truncate text-base font-semibold leading-tight text-white sm:text-lg">
      {entryCount > 0 ? (
        <CountUp
          key={`${label}-${entryCount}-${value}`}
          end={value}
          duration={1.4}
          separator=","
        />
      ) : (
        value
      )}
    </dd>
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

const LoadMoreButton = ({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) => (
  <div className="mt-8 flex justify-center">
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-white/85 disabled:cursor-wait disabled:opacity-65"
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {loading ? "Loading" : "Load more"}
    </button>
  </div>
);

const FlashCard = ({
  flash,
  onRequest,
}: {
  flash: MarketFlash;
  onRequest: () => void;
}) => {
  return (
    <article
      tabIndex={0}
      className={`${flashPreviewCardClassName} focus:outline-none focus:ring-2 focus:ring-white/20`}
    >
      <FlashPreviewImage flash={flash} />

      <div className="p-3">
        <FlashPreviewMeta flash={flash} artist={flash.artist} />

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

const buildMarketplaceQuery = ({
  tab,
  cursor,
  selectedTag,
  searchTokens,
  priceSort,
  minPrice,
  maxPrice,
}: {
  tab: MarketplaceTab;
  cursor: MarketplaceCursor;
  selectedTag: string;
  searchTokens: string[];
  priceSort: PriceSort;
  minPrice: number | null;
  maxPrice: number | null;
}) => {
  const collectionName = tab === "flashes" ? "flashes" : "flashSheets";
  const constraints: QueryConstraint[] = [where("marketplaceReady", "==", true)];

  if (tab === "flashes" && shouldUsePriceQuery(priceSort, minPrice, maxPrice)) {
    const direction: OrderByDirection =
      priceSort === "price_desc" ? "desc" : "asc";
    if (minPrice !== null) constraints.push(where("price", ">=", minPrice));
    if (maxPrice !== null) constraints.push(where("price", "<=", maxPrice));
    constraints.push(orderBy("price", direction), orderBy("createdAt", "desc"));
  } else {
    if (selectedTag) {
      constraints.push(where("searchTags", "array-contains", selectedTag));
    } else if (searchTokens[0]) {
      constraints.push(where("searchTokens", "array-contains", searchTokens[0]));
    }
    constraints.push(orderBy("createdAt", "desc"));
  }

  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(firestoreLimit(MARKETPLACE_BATCH_SIZE));

  return query(collection(db, collectionName), ...constraints);
};

const shouldUsePriceQuery = (
  priceSort: PriceSort,
  minPrice: number | null,
  maxPrice: number | null
) => priceSort !== "newest" || minPrice !== null || maxPrice !== null;

const needsClientSideFiltering = ({
  tab,
  selectedTag,
  searchTokens,
  priceSort,
  minPrice,
  maxPrice,
}: {
  tab: MarketplaceTab;
  selectedTag: string;
  searchTokens: string[];
  priceSort: PriceSort;
  minPrice: number | null;
  maxPrice: number | null;
}) => {
  if (tab === "flashes" && shouldUsePriceQuery(priceSort, minPrice, maxPrice)) {
    return Boolean(selectedTag || searchTokens.length > 0);
  }

  if (selectedTag) return searchTokens.length > 0;
  return searchTokens.length > 1;
};

const matchesActiveMarketplaceFilters = ({
  item,
  tab,
  selectedTag,
  searchTokens,
  minPrice,
  maxPrice,
}: {
  item: MarketFlash | MarketFlashSheet;
  tab: MarketplaceTab;
  selectedTag: string;
  searchTokens: string[];
  minPrice: number | null;
  maxPrice: number | null;
}) => {
  const itemTags = item.searchTags || [];
  const itemTokens = item.searchTokens || [];
  const matchesTag = !selectedTag || itemTags.includes(selectedTag);
  const matchesSearch =
    searchTokens.length === 0 ||
    searchTokens.every((token) => itemTokens.includes(token));

  if (tab === "sheets") return matchesTag && matchesSearch;

  const price = (item as MarketFlash).price;
  const matchesBudget =
    typeof price === "number" &&
    (minPrice === null || price >= minPrice) &&
    (maxPrice === null || price <= maxPrice);

  return matchesTag && matchesSearch && matchesBudget;
};

const toMarketFlash = (
  marketDoc: QueryDocumentSnapshot<DocumentData>
): MarketFlash => {
  const data = marketDoc.data();
  return {
    id: marketDoc.id,
    ...data,
    artist: toPublicArtist(data.artistPublic),
  } as MarketFlash;
};

const toMarketFlashSheet = (
  marketDoc: QueryDocumentSnapshot<DocumentData>
): MarketFlashSheet => {
  const data = marketDoc.data();
  return {
    id: marketDoc.id,
    ...data,
    artist: toPublicArtist(data.artistPublic),
  } as MarketFlashSheet;
};

const toPublicArtist = (value: unknown): PublicArtist | null => {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const id = typeof data.id === "string" ? data.id : "";
  if (!id) return null;

  return {
    id,
    name: typeof data.name === "string" ? data.name : undefined,
    displayName:
      typeof data.displayName === "string" ? data.displayName : undefined,
    avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : undefined,
    studioName:
      typeof data.studioName === "string" ? data.studioName : undefined,
  };
};

const parseMarketplaceMetadata = (
  data: DocumentData | undefined
): MarketplaceMetadata => ({
  flashCount: getFiniteNumber(data?.flashCount),
  sheetCount: getFiniteNumber(data?.sheetCount),
  topTags: Array.isArray(data?.topTags)
    ? data.topTags
        .map((tag): MarketplaceTopTag | null => {
          if (typeof tag === "string") {
            return { key: normalizeTagKey(tag), tag };
          }
          if (!tag || typeof tag !== "object") return null;
          const record = tag as Record<string, unknown>;
          const label =
            typeof record.tag === "string" && record.tag.trim()
              ? record.tag.trim()
              : "";
          const key =
            typeof record.key === "string" && record.key.trim()
              ? record.key.trim()
              : normalizeTagKey(label);
          return key && label
            ? {
                key,
                tag: label,
                count: getFiniteNumber(record.count),
              }
            : null;
        })
        .filter((tag): tag is MarketplaceTopTag => Boolean(tag))
    : [],
});

const getFiniteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

const dedupeById = <T extends { id: string }>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const getSearchTokens = (value: string) =>
  normalizeSearchValue(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);

const normalizeSearchValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeTagKey = (tag: string) =>
  normalizeSearchValue(tag).split(/\s+/).filter(Boolean).join("-");

const getResultLabel = ({
  loadedCount,
  totalCount,
  hasFilters,
  hasMore,
}: {
  loadedCount: number;
  totalCount: number;
  hasFilters: boolean;
  hasMore: boolean;
}) => {
  if (!hasFilters && totalCount > 0) {
    return hasMore
      ? `${loadedCount} loaded of ${totalCount}`
      : `${totalCount} result${totalCount === 1 ? "" : "s"}`;
  }

  return `${loadedCount}${hasMore ? "+" : ""} result${
    loadedCount === 1 && !hasMore ? "" : "s"
  }`;
};

const parseBudgetValue = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const getArtistName = (artist?: PublicArtist | null) =>
  artist?.displayName || artist?.name || "SATX Ink artist";

const getRequestArtist = (flash: MarketFlash): FlashRequestArtist => ({
  id: flash.artist?.id || flash.artistId,
  name: flash.artist?.name || undefined,
  displayName: flash.artist?.displayName || undefined,
  avatarUrl: flash.artist?.avatarUrl || undefined,
});

export default FlashMarketplacePage;
