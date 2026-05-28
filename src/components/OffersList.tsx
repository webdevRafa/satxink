import {
  Fragment,
  type ComponentProps,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
  ImageIcon,
  Layers,
  MapPin,
  MessageSquareText,
  ReceiptText,
  Send,
  Store,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import MakeOfferModal from "./MakeOfferModal";
import type { Offer } from "../types/Offer";
import { toast } from "react-hot-toast";

type FirestoreTimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

type DashboardOffer = Offer & {
  createdAt?: Date | FirestoreTimestampLike | null;
  status: "pending" | "accepted" | "declined" | "expired" | string;
  artistDismissedAt?: FirestoreTimestampLike | Date | null;
  declinedReason?: string | null;
  declinedReasonLabel?: string | null;
  revisionOfOfferId?: string;
  revisedByOfferId?: string;
};

type OfferStatusFilter = "all" | "pending" | "declined";

type OffersListArtist = ComponentProps<typeof MakeOfferModal>["artist"];
type RevisionRequest = ComponentProps<typeof MakeOfferModal>["selectedRequest"];

const statusFilters: { label: string; value: OfferStatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Waiting", value: "pending" },
  { label: "Declined", value: "declined" },
];

const MOBILE_FILTERS_DOCK_TOP = 142;
const MOBILE_FILTERS_REVEAL_DISTANCE = 196;
const MOBILE_FILTERS_HIDE_DISTANCE = 10;
const OFFERS_PER_PAGE = 6;
const MOBILE_PAGINATION_SCROLL_OFFSET = 154;
const DESKTOP_PAGINATION_SCROLL_OFFSET = 96;

const OffersList = ({ uid, artist }: { uid: string; artist: OffersListArtist }) => {
  const [offers, setOffers] = useState<DashboardOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<DashboardOffer | null>(
    null
  );
  const [statusFilter, setStatusFilter] = useState<OfferStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [revisionSourceOffer, setRevisionSourceOffer] =
    useState<DashboardOffer | null>(null);
  const [revisionRequest, setRevisionRequest] = useState<RevisionRequest>(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const [offerPrice, setOfferPrice] = useState(0);
  const [offerMessage, setOfferMessage] = useState("");
  const [dateOptions, setDateOptions] = useState<
    { date: string; time: string }[]
  >([
    { date: "", time: "" },
    { date: "", time: "" },
    { date: "", time: "" },
  ]);
  const filtersAnchorRef = useRef<HTMLDivElement | null>(null);
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
  const offersPageTopRef = useRef<HTMLDivElement | null>(null);
  const lastScrollYRef = useRef(0);
  const mobileFilterHiddenScrollPeakRef = useRef(0);
  const mobileFilterHideDistanceRef = useRef(0);
  const suppressMobileFilterRevealUntilRef = useRef(0);
  const [mobileFiltersDocked, setMobileFiltersDocked] = useState(false);
  const [mobileFiltersVisible, setMobileFiltersVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!uid) return;

    setLoading(true);
    const offersQuery = query(
      collection(db, "offers"),
      where("artistId", "==", uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      offersQuery,
      (snapshot) => {
        const data = snapshot.docs.map((offerDoc) => ({
          id: offerDoc.id,
          ...offerDoc.data(),
        })) as DashboardOffer[];

        setOffers(data);
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to offers:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const activeOffers = useMemo(
    () =>
      offers.filter(
        (offer) =>
          offer.status !== "accepted" &&
          offer.status !== "revised" &&
          !offer.artistDismissedAt
      ),
    [offers]
  );

  const sortedOffers = useMemo(
    () => [...activeOffers].sort((a, b) => getOfferTime(b) - getOfferTime(a)),
    [activeOffers]
  );

  const filteredOffers = useMemo(
    () =>
      statusFilter === "all"
        ? sortedOffers
        : sortedOffers.filter((offer) => offer.status === statusFilter),
    [sortedOffers, statusFilter]
  );

  const pendingCount = activeOffers.filter((offer) => offer.status === "pending").length;
  const declinedCount = activeOffers.filter((offer) => offer.status === "declined").length;
  const newestOffer = sortedOffers[0];
  const totalPages = Math.max(1, Math.ceil(filteredOffers.length / OFFERS_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (activePage - 1) * OFFERS_PER_PAGE;
  const pageEndIndex = Math.min(pageStartIndex + OFFERS_PER_PAGE, filteredOffers.length);
  const paginatedOffers = useMemo(
    () => filteredOffers.slice(pageStartIndex, pageEndIndex),
    [filteredOffers, pageEndIndex, pageStartIndex]
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    let frameId = 0;

    const updateFilterPosition = () => {
      frameId = 0;
      const currentScrollY = window.scrollY;

      if (!mediaQuery.matches || !filtersAnchorRef.current) {
        setMobileFiltersDocked(false);
        setMobileFiltersVisible(false);
        mobileFilterHiddenScrollPeakRef.current = currentScrollY;
        mobileFilterHideDistanceRef.current = 0;
        lastScrollYRef.current = currentScrollY;
        return;
      }

      const hasPassedFilters =
        filtersAnchorRef.current.getBoundingClientRect().top <=
        MOBILE_FILTERS_DOCK_TOP;
      const previousScrollY = lastScrollYRef.current;
      const scrollDelta = currentScrollY - previousScrollY;

      setMobileFiltersDocked(hasPassedFilters);

      if (Date.now() < suppressMobileFilterRevealUntilRef.current) {
        setMobileFiltersVisible(false);
        mobileFilterHiddenScrollPeakRef.current = currentScrollY;
        mobileFilterHideDistanceRef.current = 0;
      } else if (!hasPassedFilters) {
        setMobileFiltersVisible(false);
        mobileFilterHiddenScrollPeakRef.current = currentScrollY;
        mobileFilterHideDistanceRef.current = 0;
      } else if (scrollDelta < -1) {
        mobileFilterHideDistanceRef.current = 0;
        const upwardTravel =
          mobileFilterHiddenScrollPeakRef.current - currentScrollY;

        if (upwardTravel >= MOBILE_FILTERS_REVEAL_DISTANCE) {
          setMobileFiltersVisible(true);
        }
      } else if (scrollDelta > 2) {
        mobileFilterHideDistanceRef.current += scrollDelta;
        mobileFilterHiddenScrollPeakRef.current = currentScrollY;

        if (
          mobileFilterHideDistanceRef.current >= MOBILE_FILTERS_HIDE_DISTANCE
        ) {
          setMobileFiltersVisible(false);
        }
      }

      lastScrollYRef.current = currentScrollY;
    };

    const queueUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateFilterPosition);
    };

    lastScrollYRef.current = window.scrollY;
    updateFilterPosition();

    window.addEventListener("scroll", queueUpdate, { passive: true });
    window.addEventListener("resize", queueUpdate);
    mediaQuery.addEventListener("change", queueUpdate);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", queueUpdate);
      window.removeEventListener("resize", queueUpdate);
      mediaQuery.removeEventListener("change", queueUpdate);
    };
  }, []);

  const goToPage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const scrollTarget = offersPageTopRef.current;

    setCurrentPage(nextPage);

    if (isMobile) {
      suppressMobileFilterRevealUntilRef.current = Date.now() + 900;
      setMobileFiltersVisible(false);
      mobileFilterHiddenScrollPeakRef.current = window.scrollY;
      mobileFilterHideDistanceRef.current = 0;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!scrollTarget) return;

        const offset = isMobile
          ? MOBILE_PAGINATION_SCROLL_OFFSET
          : DESKTOP_PAGINATION_SCROLL_OFFSET;
        const targetTop =
          scrollTarget.getBoundingClientRect().top + window.scrollY - offset;

        window.scrollTo({
          top: Math.max(targetTop, 0),
          behavior: "smooth",
        });
      });
    });
  };

  const handleReviseOffer = (offer: DashboardOffer) => {
    setSelectedOffer(null);
    setRevisionSourceOffer(offer);
    setRevisionRequest(getRevisionRequestFromOffer(offer));
    setOfferPrice(Number(offer.price || 0));
    setDepositAmount(Number(offer.depositPolicy?.amount || 0));
    setOfferMessage(offer.message || "");
    setDateOptions(normalizeDateOptions(offer.dateOptions));
  };

  const handleCloseRevisionModal = () => {
    setRevisionSourceOffer(null);
    setRevisionRequest(null);
  };

  const handleRevisionSent = async (_requestId: string, revisedOfferId?: string) => {
    if (!revisionSourceOffer) return;
    await updateDoc(doc(db, "offers", revisionSourceOffer.id), {
      status: "revised",
      artistDismissedAt: serverTimestamp(),
      revisedAt: serverTimestamp(),
      revisedByOfferId: revisedOfferId || null,
    });
  };

  const handleDismissOffer = async (offer: DashboardOffer) => {
    try {
      await updateDoc(doc(db, "offers", offer.id), {
        artistDismissedAt: serverTimestamp(),
        artistDismissedReason: "artist_cleared_declined_offer",
      });
      if (selectedOffer?.id === offer.id) setSelectedOffer(null);
      toast.success("Offer cleared from your list.");
    } catch (error) {
      console.error("Failed to dismiss offer", error);
      toast.error("Could not clear this offer.");
    }
  };

  if (loading) {
    return (
      <section className="mt-6 w-full max-w-7xl space-y-6">
        <div className="h-36 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />
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
    <section className="mt-6 w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Artist inbox
          </p>
          <h1 className="mt-2 text-3xl! font-semibold text-white">
            Sent offers
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Track every offer you have sent, review proposed dates, and keep an
            eye on client responses.
          </p>
        </div>

        <div className="grid w-full grid-cols-3 gap-2 lg:w-auto lg:min-w-[420px]">
          <MetricCard label="Waiting" value={pendingCount} />
          <MetricCard label="Declined" value={declinedCount} />
          <MetricCard
            label="Newest"
            value={newestOffer ? formatShortDate(newestOffer.createdAt) : "-"}
          />
        </div>
      </div>

      <div ref={filtersAnchorRef} className="h-px md:hidden" aria-hidden="true" />
      <div
        ref={filtersPanelRef}
        className={`rounded-lg border border-white/10 p-3 backdrop-blur will-change-transform motion-safe:transition-[transform,box-shadow,background-color] motion-safe:duration-[360ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:p-4 md:static md:translate-y-0 md:bg-white/[0.03] md:will-change-auto ${
          mobileFiltersDocked
            ? "sticky top-[8.875rem] z-30 bg-[#111111]/95 shadow-2xl shadow-black/45"
            : "bg-white/[0.03]"
        } ${
          mobileFiltersDocked && !mobileFiltersVisible
            ? "pointer-events-none -translate-y-[calc(100%+9rem)]"
            : "translate-y-0"
        }`}
      >
        <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)] sm:h-10 sm:w-10">
              <ReceiptText size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 className="mb-0! text-base! sm:text-lg!">Offer filters</h2>
              <p className="text-sm text-neutral-400">
                Filter sent offers by current client response.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-3 xl:justify-end">
            <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              {statusFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={`inline-flex h-9 items-center justify-center rounded-md border px-2! text-[11px]! font-semibold transition sm:h-10 sm:px-3! sm:text-xs! ${
                    statusFilter === filter.value
                      ? "border-white bg-white text-black"
                      : "border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <span className="whitespace-nowrap text-xs text-neutral-500 sm:ml-1 sm:text-sm">
              Showing {filteredOffers.length} of {activeOffers.length}
            </span>
          </div>
        </div>
      </div>

      {filteredOffers.length === 0 ? (
        <EmptyOffers statusFilter={statusFilter} />
      ) : (
        <div ref={offersPageTopRef} className="space-y-3">
          <OffersTable
            offers={paginatedOffers}
            onOpen={setSelectedOffer}
            onRevise={handleReviseOffer}
            onDismiss={handleDismissOffer}
          />
          {totalPages > 1 && (
            <OfferPagination
              currentPage={activePage}
              totalPages={totalPages}
              totalItems={filteredOffers.length}
              pageStart={pageStartIndex + 1}
              pageEnd={pageEndIndex}
              onPageChange={goToPage}
            />
          )}
        </div>
      )}

      <OfferDetailsDialog
        offer={selectedOffer}
        onClose={() => setSelectedOffer(null)}
        onRevise={handleReviseOffer}
        onDismiss={handleDismissOffer}
      />

      <MakeOfferModal
        isOpen={!!revisionRequest && !!revisionSourceOffer}
        onClose={handleCloseRevisionModal}
        selectedRequest={revisionRequest}
        depositAmount={depositAmount}
        setDepositAmount={setDepositAmount}
        offerPrice={offerPrice}
        setOfferPrice={setOfferPrice}
        offerMessage={offerMessage}
        setOfferMessage={setOfferMessage}
        dateOptions={dateOptions}
        setDateOptions={setDateOptions}
        artist={artist}
        uid={uid}
        shouldUpdateRequestStatus={false}
        additionalOfferData={
          revisionSourceOffer
            ? {
                previousOfferId: revisionSourceOffer.id,
                revisionOfOfferId:
                  revisionSourceOffer.revisionOfOfferId || revisionSourceOffer.id,
                revisionReason: "client_declined",
              }
            : undefined
        }
        onOfferSent={handleRevisionSent}
      />
    </section>
  );
};

const OffersTable = ({
  offers,
  onOpen,
  onRevise,
  onDismiss,
}: {
  offers: DashboardOffer[];
  onOpen: (offer: DashboardOffer) => void;
  onRevise: (offer: DashboardOffer) => void;
  onDismiss: (offer: DashboardOffer) => void;
}) => {
  const columns =
    "minmax(210px,1.1fr) 96px minmax(180px,.88fr) minmax(220px,1.08fr) minmax(170px,.72fr) minmax(270px,1fr)";

  return (
    <>
      <div className="space-y-3 md:hidden">
        {offers.map((offer) => (
          <OfferMobileCard
            key={offer.id}
            offer={offer}
            onOpen={() => onOpen(offer)}
            onRevise={() => onRevise(offer)}
            onDismiss={() => onDismiss(offer)}
          />
        ))}
      </div>

      <div className="hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg md:block">
        <div className="request-modal-scrollbar overflow-x-auto rounded-lg 2xl:overflow-visible">
          <div className="min-w-[1200px]">
            <div
              className="grid items-center border-b border-white/10 bg-[#171717]/95 px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500 backdrop-blur 2xl:sticky 2xl:top-20 2xl:z-40 2xl:shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
              style={{ gridTemplateColumns: columns }}
            >
              <span>Client</span>
              <span>Sample</span>
              <span>Pricing</span>
              <span>Schedule</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-white/10">
              {offers.map((offer) => (
                <OfferRow
                  key={offer.id}
                  offer={offer}
                  columns={columns}
                  onOpen={() => onOpen(offer)}
                  onRevise={() => onRevise(offer)}
                  onDismiss={() => onDismiss(offer)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const OfferPagination = ({
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
      aria-label="Sent offers pagination"
      className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-3! py-3! sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-neutral-500">
        Showing{" "}
        <span className="font-semibold text-neutral-300">
          {pageStart}-{pageEnd}
        </span>{" "}
        of <span className="font-semibold text-neutral-300">{totalItems}</span>{" "}
        offers
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

const OfferRow = ({
  offer,
  columns,
  onOpen,
  onRevise,
  onDismiss,
}: {
  offer: DashboardOffer;
  columns: string;
  onOpen: () => void;
  onRevise: () => void;
  onDismiss: () => void;
}) => {
  const previewUrl = offer.thumbUrl || offer.fullUrl || "";
  const firstDateOption = offer.dateOptions?.find(
    (option) => option.date && option.time
  );
  const isFlashOffer = offer.sourceType === "flash";
  const isMultiSessionOffer = offer.projectType === "multi_session";

  return (
    <div
      className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
      style={{ gridTemplateColumns: columns }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 items-center gap-3 p-0! text-left"
      >
        <img
          src={offer.clientAvatar || "/default-avatar.png"}
          alt={offer.clientName || "Client"}
          className="h-11 w-11 rounded-full border border-white/10 object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">
            {offer.clientName || "Client"}
          </p>
          <p className="text-sm text-neutral-400">
            Sent {formatShortDate(offer.createdAt)}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="relative h-14 w-16 overflow-hidden rounded-md border border-white/10 bg-white/[0.035] p-0!"
        aria-label="View offer sample"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={isFlashOffer ? offer.flashTitle || "Flash offer" : "Offer sample"}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-neutral-500">
            <ImageIcon size={18} />
          </span>
        )}
      </button>

      <div className="min-w-0 pr-4">
        <p className="truncate text-sm font-semibold text-white">
          ${offer.price}
        </p>
        <p className="mt-1 truncate text-xs text-neutral-500">
          Deposit {formatDeposit(offer)}
        </p>
      </div>

      <div className="min-w-0 pr-4">
        <p className="truncate text-sm font-medium text-white">
          {firstDateOption ? formatAppointment(firstDateOption, "compact") : "No date set"}
        </p>
        <p className="mt-1 truncate text-xs text-neutral-500">
          {isFlashOffer
            ? offer.flashTitle || "Flash item"
            : isMultiSessionOffer
            ? `${offer.estimatedSessionCount || 2} sessions`
            : offer.shopName || "Shop not set"}
        </p>
      </div>

      <div className="min-w-0">
        <StatusBadge status={offer.status} />
        {offer.status === "declined" && (
          <p className="mt-2 truncate text-xs text-red-100/75">
            Reason: {getDeclineReasonLabel(offer)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {offer.status === "declined" && (
          <button
            type="button"
            onClick={onRevise}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3! text-xs! font-semibold text-black transition hover:bg-white/85"
          >
            <Send size={14} />
            Send new
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white transition hover:bg-white/10"
        >
          <Eye size={14} />
          Details
        </button>
        {offer.status === "declined" && (
          <button
            type="button"
            onClick={onDismiss}
            className="group relative ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] p-0! text-neutral-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Dismiss declined offer"
            title="Dismiss and remove from feed"
          >
            <X size={14} />
            <span className="pointer-events-none absolute right-0 top-[-2.4rem] z-20 w-max max-w-[220px] rounded-md border border-white/10 bg-[#1b1b1b] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-visible:opacity-100">
              Dismiss and remove from feed
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

const OfferMobileCard = ({
  offer,
  onOpen,
  onRevise,
  onDismiss,
}: {
  offer: DashboardOffer;
  onOpen: () => void;
  onRevise: () => void;
  onDismiss: () => void;
}) => {
  const previewUrl = offer.thumbUrl || offer.fullUrl || "";
  const firstDateOption = offer.dateOptions?.find(
    (option) => option.date && option.time
  );
  const isDeclined = offer.status === "declined";
  const isFlashOffer = offer.sourceType === "flash";
  const isMultiSessionOffer = offer.projectType === "multi_session";
  const scopeTile = isFlashOffer
    ? {
        label: "Flash",
        value: offer.flashTitle || "Flash item",
      }
    : isMultiSessionOffer
    ? {
        label: "Sessions",
        value: `${offer.estimatedSessionCount || 2} sessions`,
      }
    : {
        label: "Session",
        value: "Single session",
      };

  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 p-3! text-left transition hover:bg-white/[0.025]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-neutral-500">
            <span>Sent {formatShortDate(offer.createdAt)}</span>
            {isDeclined && (
              <span className="rounded-full border border-red-200/25 bg-red-300/10 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-red-50">
                Declined
              </span>
            )}
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-3">
            <img
              src={offer.clientAvatar || "/default-avatar.png"}
              alt={offer.clientName || "Client"}
              className="h-10 w-10 rounded-full border border-white/10 object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">
                {offer.clientName || "Client"}
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold text-neutral-400">
                ${offer.price} - Deposit {formatDeposit(offer)}
              </p>
            </div>
          </div>
        </div>

        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.035]">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={isFlashOffer ? offer.flashTitle || "Flash offer" : "Offer sample"}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-neutral-500">
              <ImageIcon size={20} />
            </span>
          )}
        </div>
      </button>

      <div className="space-y-2.5 border-t border-white/10 px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          <MobileSummaryTile
            label="Schedule"
            value={
              firstDateOption
                ? formatAppointment(firstDateOption, "compact")
                : "No date set"
            }
          />
          <MobileSummaryTile label={scopeTile.label} value={scopeTile.value} />
        </div>

        <MobileOfferMetaRows
          rows={[
            {
              label: "Price",
              value: `$${offer.price}`,
            },
            {
              label: "Status",
              value: getOfferStatusLabel(offer.status || "pending"),
            },
            {
              label: "Message",
              value: offer.message || "No message included.",
            },
          ]}
        />

        {isDeclined && (
          <div className="rounded-md border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs font-medium text-red-50">
            Reason: {getDeclineReasonLabel(offer)}
          </div>
        )}
      </div>

      <div
        className={`grid gap-2 border-t border-white/10 p-3 ${
          isDeclined ? "grid-cols-3" : "grid-cols-1"
        }`}
      >
        {isDeclined && (
          <button
            type="button"
            onClick={onRevise}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-white px-2! text-[11px]! font-semibold text-black transition hover:bg-white/85"
          >
            <Send size={13} />
            New
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2! text-[11px]! font-semibold text-white transition hover:bg-white/10"
        >
          <Eye size={13} />
          Details
        </button>
        {isDeclined && (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2! text-[11px]! font-semibold text-white transition hover:bg-white/10"
          >
            <X size={13} />
            Clear
          </button>
        )}
      </div>
    </article>
  );
};

const MobileSummaryTile = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.025] px-2 py-1">
    <p className="text-[8px] uppercase tracking-[0.1em] text-neutral-500">
      {label}
    </p>
    <p className="mt-px truncate text-[10px] font-semibold leading-3 text-white">
      {value}
    </p>
  </div>
);

const MobileOfferMetaRows = ({
  rows,
}: {
  rows: { label: string; value: string }[];
}) => (
  <dl className="grid min-w-0 gap-1.5 pr-1 text-xs leading-5">
    {rows.map((row) => {
      const isMessage = row.label === "Message";

      return (
        <div
          key={row.label}
          className="grid min-w-0 items-start gap-2"
          style={{ gridTemplateColumns: "4.75rem minmax(0, 1fr)" }}
        >
          <dt className="whitespace-nowrap uppercase tracking-[0.08em] text-neutral-500">
            {row.label}
          </dt>
          <dd
            className={`font-medium text-neutral-200 ${
              isMessage ? "line-clamp-2 leading-5" : "truncate"
            }`}
          >
            {row.value}
          </dd>
        </div>
      );
    })}
  </dl>
);

const OfferDetailsDialog = ({
  offer,
  onClose,
  onRevise,
  onDismiss,
}: {
  offer: DashboardOffer | null;
  onClose: () => void;
  onRevise: (offer: DashboardOffer) => void;
  onDismiss: (offer: DashboardOffer) => void;
}) => (
  <Transition appear show={!!offer} as={Fragment}>
    <Dialog as="div" className="relative z-50" onClose={onClose}>
      <Transition.Child
        as={Fragment}
        enter="ease-out duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-in duration-150"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />
      </Transition.Child>

      <div className="fixed inset-0 overflow-y-auto request-modal-scrollbar">
        <div className="flex min-h-full items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="scale-95 opacity-0"
            enterTo="scale-100 opacity-100"
            leave="ease-in duration-150"
            leaveFrom="scale-100 opacity-100"
            leaveTo="scale-95 opacity-0"
          >
            <Dialog.Panel className="w-full max-w-6xl overflow-hidden rounded-lg border border-white/10 bg-[#111111] text-white shadow-2xl">
              {offer && (
                <>
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                        {offer.sourceType === "flash"
                          ? "Flash offer details"
                          : "Offer details"}
                      </p>
                      <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                        {offer.sourceType === "flash"
                          ? `Flash offer sent to ${offer.clientName || "Client"}`
                          : `Offer sent to ${offer.clientName || "Client"}`}
                      </Dialog.Title>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                      aria-label="Close offer details"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="grid gap-0 lg:grid-cols-[1fr_0.95fr]">
                    <div className="border-b border-white/10 bg-black lg:border-b-0 lg:border-r">
                      {offer.fullUrl || offer.thumbUrl ? (
                        <img
                          src={offer.fullUrl || offer.thumbUrl}
                          alt={offer.sourceType === "flash" ? offer.flashTitle || "Flash offer" : "Offer sample"}
                          className="h-full max-h-[72vh] min-h-[420px] w-full object-contain"
                        />
                      ) : (
                        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
                          <ImageIcon size={34} />
                          <span>No sample image uploaded</span>
                        </div>
                      )}
                    </div>

                    <div className="p-5 sm:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-4">
                          <img
                            src={offer.clientAvatar || "/default-avatar.png"}
                            alt={offer.clientName || "Client"}
                            className="h-14 w-14 rounded-full border border-white/10 object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-white">
                              {offer.clientName || "Client"}
                            </p>
                            <p className="text-sm text-neutral-500">
                              Sent {formatShortDate(offer.createdAt)}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={offer.status} />
                      </div>

                      {offer.status === "declined" && (
                        <div className="mt-5 rounded-lg border border-red-300/20 bg-red-300/10 p-4">
                          <p className="text-sm font-semibold text-white">
                            Client declined this offer
                          </p>
                          <p className="mt-1 text-sm leading-6 text-red-50/75">
                            You can send a fresh offer with updated price, deposit,
                            message, or appointment options. Clearing it only removes
                            it from your list.
                          </p>
                          <div className="mt-3 inline-flex rounded-md border border-red-100/20 bg-black/20 px-3 py-2 text-sm font-semibold text-red-50">
                            Reason: {getDeclineReasonLabel(offer)}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => onRevise(offer)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-3! text-sm! font-semibold text-black transition hover:bg-white/85"
                            >
                              <Send size={15} />
                              Send new offer
                            </button>
                            <button
                              type="button"
                              onClick={() => onDismiss(offer)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3! text-sm! font-semibold text-white transition hover:bg-white/10"
                            >
                              <X size={15} />
                              Clear
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {offer.sourceType === "flash" && (
                          <DetailTile
                            icon={<ReceiptText size={17} />}
                            label="Flash item"
                            value={offer.flashTitle || "Untitled flash"}
                          />
                        )}
                        <DetailTile
                          icon={<DollarSign size={17} />}
                          label={
                            offer.sourceType === "flash"
                              ? "Listed flash price"
                              : "Offer price"
                          }
                          value={`$${offer.price}`}
                        />
                        <DetailTile
                          icon={<ReceiptText size={17} />}
                          label="Deposit"
                          value={formatDeposit(offer)}
                        />
                        <DetailTile
                          icon={<Store size={17} />}
                          label="Shop"
                          value={offer.shopName || "Unavailable"}
                        />
                        {offer.projectType === "multi_session" && (
                          <>
                            <DetailTile
                              icon={<Layers size={17} />}
                              label="Sessions"
                              value={`${offer.estimatedSessionCount || 2}`}
                            />
                            <DetailTile
                              icon={<DollarSign size={17} />}
                              label="Per session"
                              value={`$${offer.estimatedSessionPrice || 0}`}
                            />
                          </>
                        )}
                      </div>

                      <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                          <CalendarDays size={17} />
                          Proposed appointment options
                        </div>
                        {offer.dateOptions?.length ? (
                          <div className="grid gap-2">
                            {offer.dateOptions.map((option, index) => (
                              <div
                                key={`${option.date}-${option.time}-${index}`}
                                className="flex items-center justify-between rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm"
                              >
                                <span className="text-neutral-500">
                                  Option {index + 1}
                                </span>
                                <span className="font-medium text-white">
                                  {formatAppointment(option)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-500">
                            No appointment options were included.
                          </p>
                        )}
                      </div>

                      <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                          <MessageSquareText size={17} />
                          Artist message
                        </div>
                        <p className="whitespace-pre-line text-sm leading-6 text-neutral-300">
                          {offer.message || "No message included."}
                        </p>
                      </div>

                      {offer.shopAddress && (
                        <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                            <MapPin size={17} />
                            Location
                          </div>
                          <p className="text-sm text-neutral-300">
                            {offer.shopAddress}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </div>
    </Dialog>
  </Transition>
);

const MetricCard = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.025] px-2.5! py-2! sm:px-3! sm:py-2.5!">
    <p className="truncate text-[9px]! uppercase tracking-[0.1em] text-neutral-500 sm:text-[10px]! sm:tracking-[0.14em]">
      {label}
    </p>
    <p className="mt-1 truncate text-base! font-semibold leading-none text-white sm:text-lg!">
      {value}
    </p>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const normalized = status || "pending";
  const className =
    normalized === "accepted"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : normalized === "declined"
      ? "border-red-300/25 bg-red-300/10 text-red-100"
      : "border-amber-300/20 bg-amber-300/10 text-amber-100";

  return (
    <span
      className={`inline-flex w-fit justify-self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {getOfferStatusLabel(normalized)}
    </span>
  );
};

const DetailTile = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) => (
  <div className="rounded-lg border border-white/10 bg-black/25 p-3">
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-neutral-500">
      {icon}
      {label}
    </div>
    <p className="mt-2 text-sm font-medium text-white">{value}</p>
  </div>
);

const EmptyOffers = ({ statusFilter }: { statusFilter: OfferStatusFilter }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
      <ReceiptText size={22} />
    </div>
    <h2 className="mt-4 text-xl! font-semibold! text-white">
      {statusFilter === "all"
        ? "No offers sent yet"
        : statusFilter === "pending"
        ? "No offers waiting on clients"
        : `No ${statusFilter} offers`}
    </h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
      {statusFilter === "all"
        ? "Once you make offers from tattoo requests, they will appear here with status, pricing, and appointment details."
        : "Try a different status filter to review the rest of your sent offers."}
    </p>
  </div>
);

const getOfferStatusLabel = (status: string) => {
  if (status === "pending") return "Waiting client response";
  if (status === "declined") return "Declined";
  if (status === "accepted") return "Accepted";
  return status.replace("_", " ");
};

const getDeclineReasonLabel = (offer: DashboardOffer) => {
  if (offer.declinedReasonLabel) return offer.declinedReasonLabel;
  if (offer.declinedReason === "appointment_timing") {
    return "Appointment timing";
  }
  if (offer.declinedReason === "price") return "Price";
  if (offer.declinedReason === "changed_mind") return "Changed my mind";
  if (offer.declinedReason === "other") return "Other";
  return "Reason not provided";
};

const getRevisionRequestFromOffer = (offer: DashboardOffer): RevisionRequest => ({
  id: offer.requestId || offer.id,
  clientId: offer.clientId,
  clientName: offer.clientName || "Client",
  clientAvatar: offer.clientAvatar || "/default-avatar.png",
  description: offer.message || "",
  bodyPlacement: "",
  size: "",
  fullUrl: offer.fullUrl,
  thumbUrl: offer.thumbUrl,
  sourceType: offer.sourceType,
  flashId: offer.flashId || undefined,
  flashTitle: offer.flashTitle || undefined,
  flashPrice: offer.flashPrice ?? undefined,
  flashSheetId: offer.flashSheetId || undefined,
  isFromSheet: Boolean(offer.isFromSheet),
});

const normalizeDateOptions = (
  options: { date: string; time: string }[] | undefined
) => {
  const next = options?.length
    ? options.slice(0, 3)
    : [{ date: "", time: "" }];

  while (next.length < 3) next.push({ date: "", time: "" });
  return next;
};

const getPaginationItems = (
  currentPage: number,
  totalPages: number
): Array<number | "start-ellipsis" | "end-ellipsis"> => {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | "start-ellipsis" | "end-ellipsis"> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) items.push("start-ellipsis");
  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }
  if (end < totalPages - 1) items.push("end-ellipsis");
  items.push(totalPages);

  return items;
};

const formatDeposit = (offer: DashboardOffer) => {
  const amount = offer.depositPolicy?.amount;
  if (!offer.depositPolicy?.depositRequired) return "Not required";
  return typeof amount === "number" ? `$${amount}` : "$0";
};

const formatAppointment = (
  option: { date: string; time: string },
  mode: "compact" | "long" = "long"
) => {
  if (!option.date || !option.time) return "Not set";
  const [year, month, day] = option.date.split("-").map(Number);
  const [hours, minutes] = option.time.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);

  return date.toLocaleString("en-US", {
    month: mode === "compact" ? "short" : "long",
    day: "numeric",
    year: mode === "compact" ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getOfferTime = (offer: DashboardOffer) => {
  const createdAt = offer.createdAt;
  if (!createdAt) return 0;
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt.toDate === "function") return createdAt.toDate().getTime();
  if (typeof createdAt.seconds === "number") return createdAt.seconds * 1000;
  return 0;
};

const formatShortDate = (createdAt?: DashboardOffer["createdAt"]) => {
  if (!createdAt) return "New";
  const date =
    createdAt instanceof Date
      ? createdAt
      : typeof createdAt.toDate === "function"
      ? createdAt.toDate()
      : typeof createdAt.seconds === "number"
      ? new Date(createdAt.seconds * 1000)
      : null;

  if (!date) return "New";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

export default OffersList;
