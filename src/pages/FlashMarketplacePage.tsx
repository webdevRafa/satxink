import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Image as ImageIcon,
  ImageOff,
  Layers,
  Search,
  SlidersHorizontal,
  Tag,
  type LucideIcon,
} from "lucide-react";
import CountUp from "react-countup";
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
import { isStripeConnectReady, type StripeConnectLike } from "../utils/stripeConnect";
import {
  getFlashBadgeLabel,
  isFlashAvailableForClients,
} from "../utils/flashAvailability";

type MarketplaceTab = "flashes" | "sheets";
type PriceSort = "newest" | "price_asc" | "price_desc";

type PublicArtist = {
  id: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string;
  studioName?: string;
  role?: string;
} & StripeConnectLike;

type MarketFlash = Flash & {
  artist?: PublicArtist;
};

type MarketFlashSheet = FlashSheet & {
  artist?: PublicArtist;
};

const DEFAULT_FLASH_ITEMS_PER_PAGE = 18;
const FLASH_ITEMS_PER_PAGE_OPTIONS = [18, 36, 54];

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
                isFlashAvailableForClients(typedFlash) &&
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
            .filter(isMarketplaceReady)
            .sort(sortByNewest)
        );
        setSheets(
          rawSheets
            .map((sheet) => ({
              ...sheet,
              artist: artistsById[sheet.artistId],
            }))
            .filter(isMarketplaceReady)
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
  const marketStats = useMemo(
    () => [
      {
        label: "Flash items",
        value: flashes.length,
        icon: ImageIcon,
      },
      {
        label: "Flash sheets",
        value: sheets.length,
        icon: Layers,
      },
    ],
    [flashes.length, sheets.length]
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
            <h1 className="mb-0! text-[2rem]! font-bold leading-none text-white! sm:text-5xl! lg:text-6xl!">
              Flash Marketplace
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-300! sm:text-lg">
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

          <div className="relative hidden h-[240px] lg:block" aria-hidden="true">
            <div className="absolute right-0 top-2 z-10 inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#101010]/80 px-3 py-2 text-xs font-semibold text-neutral-200 shadow-2xl shadow-black/40 backdrop-blur">
              <Tag
                className="h-4 w-4 text-[var(--color-primary-hover)]"
                aria-hidden="true"
              />
              Ready-to-Claim Flash
            </div>
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
  <div className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.035] px-2 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-4 sm:py-3">
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
  const [pageSizeMenuOpen, setPageSizeMenuOpen] = useState(false);
  const firstItem = currentPage * pageSize + 1;
  const lastItem = Math.min(totalItems, (currentPage + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-[#151515]/95 px-2 py-1 shadow-xl shadow-black/25">
      <span className="px-2 text-xs font-semibold text-white/50">
        {firstItem}-{lastItem} of {totalItems}
      </span>
      <span className="hidden h-4 w-px bg-white/10 sm:block" />
      <span className="hidden px-1 text-xs font-semibold text-white/35 sm:inline">
        Page {currentPage + 1} of {pageCount}
      </span>
      <div
        className="relative"
        onBlur={(event) => {
          const nextFocusedElement = event.relatedTarget as Node | null;
          if (!event.currentTarget.contains(nextFocusedElement)) {
            setPageSizeMenuOpen(false);
          }
        }}
      >
        <button
          type="button"
          onClick={() => setPageSizeMenuOpen((open) => !open)}
          className="!inline-flex !h-8 !items-center !justify-center !gap-1.5 !rounded-full !border !border-white/10 !bg-black/30 !px-3 !py-0 !text-xs font-semibold text-white/65 outline-none transition hover:!border-white/20 hover:!bg-white/[0.06] focus:!border-white/35"
          aria-haspopup="listbox"
          aria-expanded={pageSizeMenuOpen}
        >
          {pageSize}/page
          <ChevronRight
            size={13}
            className={`transition ${pageSizeMenuOpen ? "-rotate-90" : "rotate-90"}`}
          />
        </button>
        {pageSizeMenuOpen && (
          <div
            role="listbox"
            className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[9rem] overflow-hidden rounded-xl border border-white/10 bg-[#151515] p-1 shadow-2xl shadow-black/40"
          >
            {FLASH_ITEMS_PER_PAGE_OPTIONS.map((option) => {
              const active = option === pageSize;

              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onPageSizeChange(option);
                    setPageSizeMenuOpen(false);
                  }}
                  className={`!flex !h-9 !w-full !items-center !justify-between !rounded-lg !px-3 !py-0 !text-xs font-semibold transition ${
                    active
                      ? "!bg-white !text-black"
                      : "!bg-transparent text-white/65 hover:!bg-white/[0.08] hover:text-white"
                  }`}
                >
                  {option}/page
                  {active && (
                    <span className="text-[10px] uppercase tracking-[0.16em]">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
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
  const badgeLabel = getFlashBadgeLabel(flash);

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
        {badgeLabel && (
          <span className="absolute left-3 top-3 rounded-full border border-red-300/30 bg-red-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-red-100 backdrop-blur">
            {badgeLabel}
          </span>
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

const isMarketplaceReady = (item: MarketFlash | MarketFlashSheet) => {
  if (item.marketplaceVisible === false) return false;
  if (item.artistStripeConnectReady === true) return true;
  return isStripeConnectReady(item.artist);
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
