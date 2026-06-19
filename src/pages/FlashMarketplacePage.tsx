import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  Filter,
  Loader2,
  Search,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
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

const MARKETPLACE_BATCH_SIZE = 18;
const CLIENT_FILTER_MAX_FETCH_ROUNDS = 5;

const getMarketplaceTabFromSearch = (
  searchParams: URLSearchParams
): MarketplaceTab =>
  searchParams.get("tab") === "sheets" ? "sheets" : "flashes";

const FlashMarketplacePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<MarketplaceTab>(() =>
    getMarketplaceTabFromSearch(searchParams)
  );
  const [flashes, setFlashes] = useState<MarketFlash[]>([]);
  const [sheets, setSheets] = useState<MarketFlashSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreFlashes, setHasMoreFlashes] = useState(false);
  const [hasMoreSheets, setHasMoreSheets] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [priceSort, setPriceSort] = useState<PriceSort>("newest");
  const [client, setClient] = useState<FlashRequestClient | null>(null);
  const [selectedFlash, setSelectedFlash] = useState<MarketFlash | null>(null);
  const fetchSequenceRef = useRef(0);
  const flashCursorRef = useRef<MarketplaceCursor>(null);
  const sheetCursorRef = useRef<MarketplaceCursor>(null);

  const searchTokens = useMemo(() => getSearchTokens(searchTerm), [searchTerm]);
  const minPrice = useMemo(() => parseBudgetValue(minBudget), [minBudget]);
  const maxPrice = useMemo(() => parseBudgetValue(maxBudget), [maxBudget]);

  useEffect(() => {
    const tabFromUrl = getMarketplaceTabFromSearch(searchParams);
    setActiveTab((current) => (current === tabFromUrl ? current : tabFromUrl));
  }, [searchParams]);

  const handleTabChange = useCallback(
    (tab: MarketplaceTab) => {
      setActiveTab(tab);
      setSearchParams((currentSearchParams) => {
        const nextSearchParams = new URLSearchParams(currentSearchParams);

        if (tab === "sheets") {
          nextSearchParams.set("tab", "sheets");
        } else {
          nextSearchParams.delete("tab");
        }

        return nextSearchParams;
      });
    },
    [setSearchParams]
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
    [activeTab, maxPrice, minPrice, priceSort, searchTokens]
  );

  useEffect(() => {
    void fetchMarketplacePage("replace");
  }, [
    activeTab,
    maxPrice,
    minPrice,
    priceSort,
    searchTokens,
    fetchMarketplacePage,
  ]);

  return (
    <main className="min-h-screen bg-[var(--color-bg-base)] pb-20 text-white">
      <section className="relative isolate overflow-hidden border-b border-white/[0.08] bg-[#090909] px-4 pt-24 sm:pt-20 lg:pt-16">
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

        <div className="relative mx-auto flex min-h-[15rem] max-w-[1300px] items-end pb-8 pt-8 sm:min-h-[16rem] sm:pb-10 lg:min-h-[15rem] lg:pb-8">
          <div className="max-w-3xl">
            <h1 className="mb-0! text-[1.7rem]! font-bold leading-none text-white! text-4xl">
              Flash Marketplace
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-300! ">
              Browse flash designs and sheets from SATX artists. Search by
              subject, style, tag, or artist when you want to explore a
              collection.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1300px] px-4 pt-6">
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3 shadow-lg shadow-black/20">
          <div
            className={`grid gap-3 ${
              activeTab === "flashes"
                ? "lg:grid-cols-[minmax(0,1fr)_220px_360px]"
                : ""
            }`}
          >
            <label className="relative block">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35"
              />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by subject, style, artist, sheet, or flash title"
                className="h-12 w-full rounded-xl border border-white/10 bg-black/25 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/30 focus:bg-black/35"
              />
            </label>

            {activeTab === "flashes" && (
              <>
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
                    className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#151515] pl-11 pr-4 text-sm font-semibold text-white outline-none transition focus:border-white/30"
                  >
                    <option value="newest">Sort: newest</option>
                    <option value="price_asc">Price: low to high</option>
                    <option value="price_desc">Price: high to low</option>
                  </select>
                </label>

                <div className="rounded-xl border border-white/10 bg-black/25 p-2">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-white/35">
                      <Filter size={16} />
                    </div>
                    <BudgetInput
                      label="Min"
                      value={minBudget}
                      onChange={setMinBudget}
                    />
                    <span className="text-xs font-semibold text-white/35">
                      to
                    </span>
                    <BudgetInput
                      label="Max"
                      value={maxBudget}
                      onChange={setMaxBudget}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleTabChange("flashes")}
            className={`rounded-full border px-4! py-2! text-xs! font-semibold transition ${
              activeTab === "flashes"
                ? "border-white bg-white text-black"
                : "border-white/10 bg-white/[0.035] text-white/60 hover:border-white/25 hover:text-white"
            }`}
          >
            By design
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("sheets")}
            className={`rounded-full border px-4! py-2! text-xs! font-semibold transition ${
              activeTab === "sheets"
                ? "border-white bg-white text-black"
                : "border-white/10 bg-white/[0.035] text-white/60 hover:border-white/25 hover:text-white"
            }`}
          >
            By sheet
          </button>
        </div>

        <div className="sticky top-18 z-30 mt-3 flex flex-col gap-4 border-y border-white/10 bg-[#0d0d0d]/92 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
              {activeTab === "flashes" ? "Available designs" : "Browse sheets"}
            </p>
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

const BudgetInput = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
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
      onChange={(event) => onChange(event.target.value)}
      placeholder={label}
      className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.035] pl-5 pr-2 text-xs font-semibold text-white outline-none transition placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.06]"
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
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/12 bg-white/[0.055] px-5 py-2 text-sm font-semibold text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_38px_rgba(0,0,0,0.26)] backdrop-blur transition hover:border-white/25 hover:bg-white/[0.1] hover:text-white disabled:cursor-wait disabled:opacity-65"
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

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3 opacity-100 transition duration-200 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 md:pointer-events-none md:opacity-0">
          <Link
            to={`/artists/${flash.artistId}`}
            className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-white/10 bg-white/[0.035] px-2 text-[11px] font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          >
            View artist
          </Link>
          <button
            type="button"
            onClick={onRequest}
            className="!inline-flex !h-8 !items-center !justify-center !whitespace-nowrap !rounded-md !border !border-[color:rgba(232,82,67,0.34)] !bg-[color:rgba(232,82,67,0.12)] !px-2 !py-0 !text-[11px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:!border-[color:rgba(232,82,67,0.55)] hover:!bg-[color:rgba(232,82,67,0.2)] hover:text-white"
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
  searchTokens,
  priceSort,
  minPrice,
  maxPrice,
}: {
  tab: MarketplaceTab;
  cursor: MarketplaceCursor;
  searchTokens: string[];
  priceSort: PriceSort;
  minPrice: number | null;
  maxPrice: number | null;
}) => {
  const collectionName = tab === "flashes" ? "flashes" : "flashSheets";
  const constraints: QueryConstraint[] = [
    where("marketplaceReady", "==", true),
  ];

  if (tab === "flashes" && shouldUsePriceQuery(priceSort, minPrice, maxPrice)) {
    const direction: OrderByDirection =
      priceSort === "price_desc" ? "desc" : "asc";
    if (minPrice !== null) constraints.push(where("price", ">=", minPrice));
    if (maxPrice !== null) constraints.push(where("price", "<=", maxPrice));
    constraints.push(orderBy("price", direction), orderBy("createdAt", "desc"));
  } else {
    if (searchTokens[0]) {
      constraints.push(
        where("searchTokens", "array-contains", searchTokens[0])
      );
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
  searchTokens,
  priceSort,
  minPrice,
  maxPrice,
}: {
  tab: MarketplaceTab;
  searchTokens: string[];
  priceSort: PriceSort;
  minPrice: number | null;
  maxPrice: number | null;
}) => {
  if (tab === "flashes" && shouldUsePriceQuery(priceSort, minPrice, maxPrice)) {
    return searchTokens.length > 0;
  }

  return searchTokens.length > 1;
};

const matchesActiveMarketplaceFilters = ({
  item,
  tab,
  searchTokens,
  minPrice,
  maxPrice,
}: {
  item: MarketFlash | MarketFlashSheet;
  tab: MarketplaceTab;
  searchTokens: string[];
  minPrice: number | null;
  maxPrice: number | null;
}) => {
  const itemTokens = item.searchTokens || [];
  const matchesSearch =
    searchTokens.length === 0 ||
    searchTokens.every((token) => itemTokens.includes(token));

  if (tab === "sheets") return matchesSearch;

  const price = (item as MarketFlash).price;
  const matchesBudget =
    typeof price === "number" &&
    (minPrice === null || price >= minPrice) &&
    (maxPrice === null || price <= maxPrice);

  return matchesSearch && matchesBudget;
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

const dedupeById = <T extends { id: string }>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const getSearchTokens = (value: string) =>
  normalizeSearchValue(value).split(/\s+/).filter(Boolean).slice(0, 6);

const normalizeSearchValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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
