import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Eye,
  Filter,
  ImageIcon,
  MapPin,
  MessageSquareText,
  Ruler,
  Send,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "../firebase/firebaseConfig";

type FirestoreTimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

type BookingRequest = {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatar: string;
  description: string;
  preferredDateRange?: string[];
  availableDays?: string[];
  availableTime?: {
    from: string;
    to: string;
  };
  bodyPlacement: string;
  size: "small" | "medium" | "large" | "Small" | "Medium" | "Large" | string;
  fullUrl?: string;
  thumbUrl?: string;
  budget?: string | number;
  createdAt?: Date | FirestoreTimestampLike | null;
  sourceType?: string;
  flashId?: string;
  flashTitle?: string;
  flashPrice?: number | null;
  flashSheetId?: string | null;
  isFromSheet?: boolean;
  offerPreparationStatus?: string;
  offerPreparationEta?: string;
  offerPreparationUpdatedAt?: Date | FirestoreTimestampLike | null;
};

type PreparationFilter = "all" | "preparing" | "not_started";

const OFFER_PREPARATION_ETA_OPTIONS = [
  "Later today",
  "Tomorrow",
  "2-3 days",
  "This week",
  "Next week",
];

const PREPARATION_FILTERS: { label: string; value: PreparationFilter }[] = [
  { label: "All", value: "all" },
  { label: "Preparing", value: "preparing" },
  { label: "Not started", value: "not_started" },
];

const REQUESTS_PER_PAGE = 6;
const MOBILE_FILTERS_DOCK_TOP = 142;
const MOBILE_FILTERS_REVEAL_DISTANCE = 176;
const MOBILE_FILTERS_HIDE_DISTANCE = 10;
const MOBILE_PAGINATION_SCROLL_OFFSET = 154;
const DESKTOP_PAGINATION_SCROLL_OFFSET = 96;
const MOBILE_MODAL_ACTION_DOCK_TRIGGER = 120;

interface Props {
  bookingRequests: BookingRequest[];
  onMakeOffer: (request: BookingRequest) => void;
  onRequestResolved?: (requestId: string) => void;
}

const BookingRequestsList: React.FC<Props> = ({
  bookingRequests,
  onMakeOffer,
  onRequestResolved,
}) => {
  const [selectedRequest, setSelectedRequest] = useState<BookingRequest | null>(
    null
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(
    new Date().getMonth()
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [isFiltering, setIsFiltering] = useState(false);
  const [preparationFilter, setPreparationFilter] =
    useState<PreparationFilter>("all");
  const [declinedRequestIds, setDeclinedRequestIds] = useState<string[]>([]);
  const [isDeclining, setIsDeclining] = useState(false);
  const [preparingRequestIds, setPreparingRequestIds] = useState<string[]>([]);
  const [prepareOfferRequest, setPrepareOfferRequest] =
    useState<BookingRequest | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const filtersAnchorRef = useRef<HTMLDivElement | null>(null);
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
  const requestPageTopRef = useRef<HTMLDivElement | null>(null);
  const lastScrollYRef = useRef(0);
  const mobileFilterHiddenScrollPeakRef = useRef(0);
  const mobileFilterHideDistanceRef = useRef(0);
  const suppressMobileFilterRevealUntilRef = useRef(0);
  const [mobileFiltersDocked, setMobileFiltersDocked] = useState(false);
  const [mobileFiltersVisible, setMobileFiltersVisible] = useState(false);

  const visibleRequests = useMemo(
    () =>
      bookingRequests
        .filter((request) => !declinedRequestIds.includes(request.id))
        .sort((a, b) => getRequestTime(b) - getRequestTime(a)),
    [bookingRequests, declinedRequestIds]
  );

  const filteredRequests = useMemo(
    () => {
      const dateFilteredRequests = isFiltering
        ? visibleRequests.filter((request) =>
            requestMatchesMonth(request, selectedMonth, selectedYear)
          )
        : visibleRequests;

      if (preparationFilter === "all") return dateFilteredRequests;

      return dateFilteredRequests.filter((request) =>
        preparationFilter === "preparing"
          ? request.offerPreparationStatus === "preparing"
          : request.offerPreparationStatus !== "preparing"
      );
    },
    [
      isFiltering,
      preparationFilter,
      selectedMonth,
      selectedYear,
      visibleRequests,
    ]
  );

  const preparingCount = visibleRequests.filter(
    (request) => request.offerPreparationStatus === "preparing"
  ).length;
  const filtersAreActive = isFiltering || preparationFilter !== "all";

  const newestRequest = visibleRequests[0];
  const totalPages = Math.max(
    1,
    Math.ceil(filteredRequests.length / REQUESTS_PER_PAGE)
  );
  const activePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (activePage - 1) * REQUESTS_PER_PAGE;
  const pageEndIndex = Math.min(
    pageStartIndex + REQUESTS_PER_PAGE,
    filteredRequests.length
  );
  const paginatedRequests = useMemo(
    () => filteredRequests.slice(pageStartIndex, pageEndIndex),
    [filteredRequests, pageEndIndex, pageStartIndex]
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [isFiltering, preparationFilter, selectedMonth, selectedYear]);

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

  const clearFilters = () => {
    setIsFiltering(false);
    setPreparationFilter("all");
  };

  const goToPage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const scrollTarget = isMobile
      ? requestPageTopRef.current
      : filtersPanelRef.current || requestPageTopRef.current;

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

  const handleMakeOffer = (request: BookingRequest) => {
    onMakeOffer(request);
    setSelectedRequest(null);
  };

  const handleDecline = async (request: BookingRequest) => {
    try {
      setIsDeclining(true);
      await updateDoc(doc(db, "bookingRequests", request.id), {
        status: "declined",
        declinedAt: serverTimestamp(),
      });
      setDeclinedRequestIds((current) => [...current, request.id]);
      onRequestResolved?.(request.id);
      setSelectedRequest(null);
      toast.success("Request declined.");
    } catch (error) {
      console.error("Failed to decline request:", error);
      toast.error("Could not decline this request.");
    } finally {
      setIsDeclining(false);
    }
  };

  const handleMarkPreparing = async (request: BookingRequest, eta: string) => {
    if (!eta) return false;
    try {
      setPreparingRequestIds((current) => [...current, request.id]);
      await updateDoc(doc(db, "bookingRequests", request.id), {
        status: "pending",
        offerPreparationStatus: "preparing",
        offerPreparationEta: eta,
        offerPreparationUpdatedAt: serverTimestamp(),
      });
      setSelectedRequest((current) =>
        current?.id === request.id
          ? {
              ...current,
              offerPreparationStatus: "preparing",
              offerPreparationEta: eta,
            }
          : current
      );
      toast.success("Client will see that you are preparing an offer.");
      return true;
    } catch (error) {
      console.error("Failed to update offer timing:", error);
      toast.error("Could not update this request.");
      return false;
    } finally {
      setPreparingRequestIds((current) =>
        current.filter((requestId) => requestId !== request.id)
      );
    }
  };

  return (
    <section className="mt-6 w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl! font-semibold text-white">
            Tattoo requests
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Review new client ideas, check availability details, and move the
            right projects into offers.
          </p>
        </div>

        <div className="grid w-full grid-cols-3 gap-2 lg:w-auto lg:min-w-[420px]">
          <MetricCard label="Pending" value={visibleRequests.length} />
          <MetricCard label="Preparing" value={preparingCount} />
          <MetricCard
            label="Newest"
            value={newestRequest ? formatShortDate(newestRequest.createdAt) : "-"}
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
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)] sm:h-10 sm:w-10">
              <SlidersHorizontal size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 className="mb-0! text-base! sm:text-lg!">Request filters</h2>
              <p className="hidden text-sm text-neutral-400 sm:block">
                Filter by client update status or preferred date range.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-3 xl:justify-end">
            <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              {PREPARATION_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setPreparationFilter(filter.value)}
                  className={`inline-flex h-9 items-center justify-center rounded-md border px-2! text-[11px]! font-semibold transition sm:h-10 sm:px-3! sm:text-xs! ${
                    preparationFilter === filter.value
                      ? "border-white bg-white text-black"
                      : "border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
              className="h-9 w-[7rem] rounded-md border border-white/10 bg-[#101010] px-2.5 text-[11px]! font-semibold text-white outline-none transition focus:border-[var(--color-primary)] sm:h-10 sm:w-[7.5rem] sm:px-3 sm:text-xs!"
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index} value={index}>
                  {new Date(0, index).toLocaleString("en-US", {
                    month: "long",
                  })}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className="h-9 w-[4.75rem] rounded-md border border-white/10 bg-[#101010] px-2.5 text-[11px]! font-semibold text-white outline-none transition focus:border-[var(--color-primary)] sm:h-10 sm:w-20 sm:px-3 sm:text-xs!"
            >
              {[2025, 2026, 2027].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setIsFiltering(true)}
              className="inline-flex h-9 w-[5.25rem] items-center justify-center gap-1.5 rounded-md bg-white px-2.5! text-[11px]! font-semibold text-black transition hover:bg-white/85 sm:h-10 sm:w-[5.5rem] sm:gap-2 sm:px-3! sm:text-xs!"
            >
              <Filter size={16} />
              Filter
            </button>

            <div
              className={`overflow-hidden motion-safe:transition-[width,opacity,transform,margin] motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none ${
                filtersAreActive
                  ? "ml-0 w-[5.25rem] translate-x-0 opacity-100"
                  : "-ml-3 w-0 translate-x-2 opacity-0"
              }`}
              aria-hidden={!filtersAreActive}
            >
              <button
                type="button"
                onClick={clearFilters}
                tabIndex={filtersAreActive ? 0 : -1}
                className="inline-flex h-9 w-[5.25rem] items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-2.5! text-[11px]! font-semibold text-white transition hover:bg-white/10 sm:h-10 sm:px-3! sm:text-xs!"
              >
                Clear
              </button>
            </div>

            <span className="min-w-[5.75rem] whitespace-nowrap text-xs text-neutral-500 sm:min-w-[6.5rem] sm:text-sm">
              Showing {filteredRequests.length} of {visibleRequests.length}
            </span>
          </div>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <EmptyRequests isFiltering={filtersAreActive} />
      ) : (
        <div ref={requestPageTopRef} className="space-y-3">
          <RequestTable
            requests={paginatedRequests}
            onOpen={setSelectedRequest}
            onMakeOffer={handleMakeOffer}
            onPrepareOffer={setPrepareOfferRequest}
          />
          {totalPages > 1 && (
            <RequestPagination
              currentPage={activePage}
              totalPages={totalPages}
              totalItems={filteredRequests.length}
              pageStart={pageStartIndex + 1}
              pageEnd={pageEndIndex}
              onPageChange={goToPage}
            />
          )}
        </div>
      )}

      <RequestDetailsDialog
        request={selectedRequest}
        isDeclining={isDeclining}
        onClose={() => setSelectedRequest(null)}
        onDecline={handleDecline}
        onMakeOffer={handleMakeOffer}
        onPrepareOffer={(request) => setPrepareOfferRequest(request)}
      />
      <PrepareOfferDialog
        request={prepareOfferRequest}
        isSaving={Boolean(
          prepareOfferRequest &&
            preparingRequestIds.includes(prepareOfferRequest.id)
        )}
        onClose={() => setPrepareOfferRequest(null)}
        onConfirm={async (request, eta) => {
          const didUpdate = await handleMarkPreparing(request, eta);
          if (didUpdate) setPrepareOfferRequest(null);
        }}
      />
    </section>
  );
};

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

const PrepareOfferDialog = ({
  request,
  isSaving,
  onClose,
  onConfirm,
}: {
  request: BookingRequest | null;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: (request: BookingRequest, eta: string) => void | Promise<void>;
}) => {
  const [selectedEta, setSelectedEta] = useState("");

  useEffect(() => {
    setSelectedEta(request?.offerPreparationEta || "");
  }, [request?.id, request?.offerPreparationEta]);

  return (
    <Transition appear show={!!request} as={Fragment}>
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
              <Dialog.Panel className="w-full max-w-md rounded-lg border border-white/10 bg-[#111111] p-5 text-white shadow-2xl">
                {request && (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
                          Client update
                        </p>
                        <Dialog.Title className="mt-2 text-xl! font-semibold! text-white">
                          {request.offerPreparationStatus === "preparing"
                            ? `Update offer timing for ${
                                request.clientName || "Client"
                              }`
                            : `Prepare offer for ${
                                request.clientName || "Client"
                              }`}
                        </Dialog.Title>
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                        aria-label="Close prepare offer dialog"
                      >
                        <X size={17} />
                      </button>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-neutral-400">
                      Let {request.clientName || "the client"} know you are
                      preparing an offer. This keeps the request active on their
                      dashboard and shows when they can expect your offer.
                    </p>

                    <label className="mt-5 block">
                      <span className="text-sm font-semibold text-white">
                        When should they expect the offer?
                      </span>
                      <select
                        value={selectedEta}
                        onChange={(event) => setSelectedEta(event.target.value)}
                        className="mt-2 h-11 w-full rounded-md border border-white/10 bg-[#101010] px-3 text-sm font-semibold text-white outline-none transition focus:border-[var(--color-primary)]"
                      >
                        <option value="">Choose expected timing</option>
                        {OFFER_PREPARATION_ETA_OPTIONS.map((eta) => (
                          <option key={eta} value={eta} className="bg-[#111]">
                            {eta}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={onClose}
                        className="modal-action-button inline-flex items-center justify-center rounded-lg! border border-white/10 bg-white/[0.03] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!selectedEta || isSaving}
                        onClick={() => onConfirm(request, selectedEta)}
                        className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send size={15} />
                        {isSaving ? "Updating..." : "Notify client"}
                      </button>
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
};

const RequestTable = ({
  requests,
  onOpen,
  onMakeOffer,
  onPrepareOffer,
}: {
  requests: BookingRequest[];
  onOpen: (request: BookingRequest) => void;
  onMakeOffer: (request: BookingRequest) => void;
  onPrepareOffer: (request: BookingRequest) => void;
}) => {
  const columns =
    "minmax(92px,.38fr) minmax(205px,.88fr) 88px minmax(235px,.98fr) minmax(225px,.9fr) minmax(118px,.42fr) minmax(268px,1fr)";

  return (
    <>
      <div className="space-y-3 md:hidden">
        {requests.map((request) => (
          <RequestMobileCard
            key={request.id}
            request={request}
            onOpen={() => onOpen(request)}
            onMakeOffer={() => onMakeOffer(request)}
            onPrepareOffer={() => onPrepareOffer(request)}
          />
        ))}
      </div>

      <div className="hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg md:block">
        <div className="request-modal-scrollbar overflow-x-auto rounded-lg 2xl:overflow-visible">
          <div className="min-w-[1240px]">
            <div
              className="grid items-center border-b border-white/10 bg-[#171717]/95 px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500 backdrop-blur 2xl:sticky 2xl:top-20 2xl:z-40 2xl:shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
              style={{ gridTemplateColumns: columns }}
            >
              <span>Created</span>
              <span>Client</span>
              <span>Reference</span>
              <span>Idea</span>
              <span>Availability</span>
              <span>Budget</span>
              <span className="text-right">Actions</span>
            </div>

            <div className="divide-y divide-white/10">
              {requests.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  columns={columns}
                  onOpen={() => onOpen(request)}
                  onMakeOffer={() => onMakeOffer(request)}
                  onPrepareOffer={() => onPrepareOffer(request)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const RequestPagination = ({
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
      aria-label="Tattoo requests pagination"
      className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-3! py-3! sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-neutral-500">
        Showing{" "}
        <span className="font-semibold text-neutral-300">
          {pageStart}-{pageEnd}
        </span>{" "}
        of{" "}
        <span className="font-semibold text-neutral-300">{totalItems}</span>{" "}
        requests
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

const RequestRow = ({
  request,
  columns,
  onOpen,
  onMakeOffer,
  onPrepareOffer,
}: {
  request: BookingRequest;
  columns: string;
  onOpen: () => void;
  onMakeOffer: () => void;
  onPrepareOffer: () => void;
}) => {
  const previewUrl = request.thumbUrl || request.fullUrl || "";
  const isPreparingOffer = request.offerPreparationStatus === "preparing";

  return (
    <div
      className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
      style={{ gridTemplateColumns: columns }}
    >
      <button type="button" onClick={onOpen} className="min-w-0 p-0! text-left">
        <p className="truncate text-sm font-semibold text-white">
          {formatShortDate(request.createdAt)}
        </p>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 items-center gap-3 p-0! text-left"
      >
        <img
          src={request.clientAvatar || "/default-avatar.png"}
          alt={request.clientName || "Client"}
          className="h-11 w-11 rounded-full border border-white/10 object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">
            {request.clientName || "Client"}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="relative h-14 w-16 overflow-hidden rounded-md border border-white/10 bg-white/[0.035] p-0!"
        aria-label="View request reference"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Tattoo request reference"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-neutral-500">
            <ImageIcon size={18} />
          </span>
        )}
      </button>

      <PreviewMetaRows
        rows={[
          {
            label: "Placement",
            value: request.bodyPlacement || "Placement open",
          },
          {
            label: "Size",
            value: request.size || "Size open",
          },
          {
            label: "Message",
            value: request.description || "No message provided.",
          },
        ]}
      />

      <PreviewMetaRows
        labelWidth="3.75rem"
        rows={[
          {
            label: "Dates",
            value: formatCompactDateRange(request.preferredDateRange || []),
          },
          {
            label: "Days",
            value: formatAvailableDaysSummary(request),
          },
          {
            label: "Time",
            value: formatAvailableTimeWindow(request),
          },
        ]}
      />

      <div className="min-w-0 pr-3">
        <p className="truncate text-sm font-semibold text-white">
          {request.sourceType === "flash"
            ? formatFlashPrice(request.flashPrice)
            : formatBudget(request.budget)}
        </p>
        {request.sourceType === "flash" && (
          <p className="mt-1 truncate text-xs text-neutral-500">
            {request.flashTitle || "Flash request"}
          </p>
        )}
        {isPreparingOffer && (
          <div className="mt-2 flex min-w-0">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-200/30 bg-amber-300/10 px-2 py-1 text-[11px] font-medium text-amber-50">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-200" />
              <span className="truncate">
                {request.offerPreparationEta
                  ? `Preparing: ${request.offerPreparationEta}`
                  : "Preparing offer"}
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pr-2">
        <button
          type="button"
          onClick={onPrepareOffer}
          className={`group relative inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-amber-200/55 bg-amber-300/10 px-3! text-xs! font-semibold text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(252,211,77,0.08)] backdrop-blur transition hover:border-amber-100/75 hover:bg-amber-300/16 hover:text-white ${
            isPreparingOffer ? "min-w-[88px]" : "min-w-[96px]"
          }`}
          aria-label={
            isPreparingOffer
              ? "Update offer preparation timing"
              : "Prepare offer and notify client"
          }
        >
          <Send size={14} className="text-amber-200" />
          {isPreparingOffer ? "Timing" : "Prepare"}
          <span className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] right-0 z-30 w-max max-w-[240px] rounded-md border border-amber-100/20 bg-[#1b1b1b] px-2.5 py-1.5 text-left text-xs font-medium leading-5 text-white opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-visible:opacity-100">
            {isPreparingOffer
              ? "Update when the client should expect your offer."
              : "Let the client know you are preparing an offer."}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white transition hover:bg-white/10"
        >
          <Eye size={14} />
          Details
        </button>
        <button
          type="button"
          onClick={onMakeOffer}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3! text-xs! font-semibold text-black transition hover:bg-white/85"
        >
          <Send size={14} />
          Offer
        </button>
      </div>
    </div>
  );
};

const RequestMobileCard = ({
  request,
  onOpen,
  onMakeOffer,
  onPrepareOffer,
}: {
  request: BookingRequest;
  onOpen: () => void;
  onMakeOffer: () => void;
  onPrepareOffer: () => void;
}) => {
  const previewUrl = request.thumbUrl || request.fullUrl || "";
  const isPreparingOffer = request.offerPreparationStatus === "preparing";
  const budgetLabel =
    request.sourceType === "flash"
      ? formatFlashPrice(request.flashPrice)
      : formatBudget(request.budget);

  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 p-3! text-left transition hover:bg-white/[0.025]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-neutral-500">
            <span>{formatShortDate(request.createdAt)}</span>
            {isPreparingOffer && (
              <span className="rounded-full border border-amber-200/25 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-50">
                Preparing
              </span>
            )}
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-3">
            <img
              src={request.clientAvatar || "/default-avatar.png"}
              alt={request.clientName || "Client"}
              className="h-10 w-10 rounded-full border border-white/10 object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">
                {request.clientName || "Client"}
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold text-neutral-400">
                {budgetLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.035]">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Tattoo request reference"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-neutral-500">
              <ImageIcon size={20} />
            </span>
          )}
        </div>
      </button>

      <div className="space-y-2 border-t border-white/10 px-3 py-2.5">
        <div className="grid grid-cols-2 gap-1.5">
          <MobileSummaryTile
            label="Dates"
            value={formatCompactDateRange(request.preferredDateRange || [])}
          />
          <MobileSummaryTile
            label="Time"
            value={formatAvailableTimeWindow(request)}
          />
        </div>

        <MobilePreviewMetaRows
          rows={[
            {
              label: "Placement",
              value: request.bodyPlacement || "Placement open",
            },
            {
              label: "Size",
              value: request.size || "Size open",
            },
            {
              label: "Message",
              value: request.description || "No message provided.",
            },
          ]}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onPrepareOffer}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-amber-200/55 bg-amber-300/10 px-2! text-[11px]! font-semibold text-amber-50 transition hover:bg-amber-300/16"
        >
          <Send size={13} className="text-amber-200" />
          {isPreparingOffer ? "Timing" : "Prepare"}
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2! text-[11px]! font-semibold text-white transition hover:bg-white/10"
        >
          <Eye size={13} />
          Details
        </button>
        <button
          type="button"
          onClick={onMakeOffer}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-white px-2! text-[11px]! font-semibold text-black transition hover:bg-white/85"
        >
          <Send size={13} />
          Offer
        </button>
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
  <div className="flex min-h-12 min-w-0 flex-col justify-center rounded-md border border-white/10 bg-white/[0.025] px-2.5 py-1.5">
    <span className="block truncate text-xs uppercase leading-none tracking-[0.08em] text-neutral-500">
      {label}
    </span>
    <span className="mt-1 block truncate text-xs font-semibold leading-4 text-white">
      {value}
    </span>
  </div>
);

const MobilePreviewMetaRows = ({
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
          style={{ gridTemplateColumns: "5.35rem minmax(0, 1fr)" }}
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

const PreviewMetaRows = ({
  labelWidth = "5.25rem",
  rows,
}: {
  labelWidth?: string;
  rows: { label: string; value: string }[];
}) => (
  <dl className="grid min-w-0 gap-1 pr-3 text-xs leading-5">
    {rows.map((row) => (
      <div
        key={row.label}
        className="grid min-w-0 items-baseline gap-2"
        style={{ gridTemplateColumns: `${labelWidth} minmax(0, 1fr)` }}
      >
        <dt className="truncate uppercase tracking-[0.12em] text-neutral-500">
          {row.label}
        </dt>
        <dd className="truncate font-medium text-neutral-200">{row.value}</dd>
      </div>
    ))}
  </dl>
);

const useMobileModalActionDock = (isOpen: boolean) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const [mobileActionsVisible, setMobileActionsVisible] = useState(false);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (!isOpen || !scrollContainer) {
      setMobileActionsVisible(false);
      lastScrollTopRef.current = 0;
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 639px)");
    let frameId = 0;

    const updateActionDock = () => {
      frameId = 0;

      if (!mediaQuery.matches) {
        setMobileActionsVisible(false);
        lastScrollTopRef.current = scrollContainer.scrollTop;
        return;
      }

      const currentScrollTop = scrollContainer.scrollTop;
      const previousScrollTop = lastScrollTopRef.current;
      const scrollingDown = currentScrollTop > previousScrollTop + 6;
      const scrollingUp = currentScrollTop < previousScrollTop - 6;
      const pastIntro = currentScrollTop > MOBILE_MODAL_ACTION_DOCK_TRIGGER;
      const nearBottom =
        currentScrollTop + scrollContainer.clientHeight >=
        scrollContainer.scrollHeight - 120;

      if (!pastIntro || scrollingUp || nearBottom) {
        setMobileActionsVisible(false);
      } else if (scrollingDown) {
        setMobileActionsVisible(true);
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    const queueUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateActionDock);
    };

    lastScrollTopRef.current = scrollContainer.scrollTop;
    updateActionDock();

    scrollContainer.addEventListener("scroll", queueUpdate, { passive: true });
    mediaQuery.addEventListener("change", queueUpdate);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      scrollContainer.removeEventListener("scroll", queueUpdate);
      mediaQuery.removeEventListener("change", queueUpdate);
    };
  }, [isOpen]);

  return { scrollContainerRef, mobileActionsVisible };
};

const MobileRequestActionDock = ({
  request,
  visible,
  isDeclining,
  primaryLabel,
  onDecline,
  onMakeOffer,
  onPrepareOffer,
}: {
  request: BookingRequest;
  visible: boolean;
  isDeclining: boolean;
  primaryLabel: string;
  onDecline: (request: BookingRequest) => void;
  onMakeOffer: (request: BookingRequest) => void;
  onPrepareOffer: (request: BookingRequest) => void;
}) => (
  <div
    className={`fixed inset-x-0 bottom-0 z-[60] px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-4 sm:hidden motion-safe:transition-[transform,opacity] motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none ${
      visible
        ? "pointer-events-auto translate-y-0 opacity-100"
        : "pointer-events-none translate-y-[calc(100%+1rem)] opacity-0"
    }`}
  >
    <div className="rounded-t-lg border border-white/10 bg-[#111111]/95 p-3 shadow-[0_-18px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <button
        type="button"
        onClick={() => onMakeOffer(request)}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-white px-4! text-sm! font-semibold text-black transition hover:bg-white/85"
      >
        <Send size={16} />
        {primaryLabel}
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onPrepareOffer(request)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-amber-200/55 bg-amber-300/10 px-3! text-xs! font-semibold text-amber-50 transition hover:bg-amber-300/16"
        >
          <Send size={14} className="text-amber-200" />
          Prepare
        </button>
        <button
          type="button"
          disabled={isDeclining}
          onClick={() => onDecline(request)}
          className="inline-flex h-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-neutral-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeclining ? "Declining..." : "Decline"}
        </button>
      </div>
    </div>
  </div>
);

const RequestDetailsDialog = ({
  request,
  isDeclining,
  onClose,
  onDecline,
  onMakeOffer,
  onPrepareOffer,
}: {
  request: BookingRequest | null;
  isDeclining: boolean;
  onClose: () => void;
  onDecline: (request: BookingRequest) => void;
  onMakeOffer: (request: BookingRequest) => void;
  onPrepareOffer: (request: BookingRequest) => void;
}) => {
  const { scrollContainerRef, mobileActionsVisible } =
    useMobileModalActionDock(Boolean(request));

  if (request?.sourceType === "flash") {
    return (
      <FlashRequestDetailsDialog
        request={request}
        isDeclining={isDeclining}
        onClose={onClose}
        onDecline={onDecline}
        onMakeOffer={onMakeOffer}
        onPrepareOffer={onPrepareOffer}
      />
    );
  }

  return (
  <Transition appear show={!!request} as={Fragment}>
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

      <div
        ref={scrollContainerRef}
        className="fixed inset-0 overflow-y-auto request-modal-scrollbar"
      >
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
              {request && (
                <>
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                        Request details
                      </p>
                      <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                        {request.clientName || "Client"} wants to work with you
                      </Dialog.Title>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                      aria-label="Close request details"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="grid gap-0 lg:grid-cols-[1fr_0.95fr]">
                    <div className="border-b border-white/10 bg-black lg:border-b-0 lg:border-r">
                      {request.fullUrl || request.thumbUrl ? (
                        <Zoom>
                          <img
                            src={request.fullUrl || request.thumbUrl}
                            alt="Tattoo request reference"
                            className="h-full max-h-[72vh] min-h-[360px] w-full object-contain sm:min-h-[420px]"
                          />
                        </Zoom>
                      ) : (
                        <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500 sm:min-h-[420px]">
                          <ImageIcon size={34} />
                          <span>No reference image uploaded</span>
                        </div>
                      )}
                    </div>

                    <div className="p-5 pb-28 sm:p-6">
                      <div className="flex items-center gap-4">
                        <img
                          src={request.clientAvatar || "/default-avatar.png"}
                          alt={request.clientName}
                          className="h-14 w-14 rounded-full border border-white/10 object-cover"
                        />
                        <div>
                          <p className="font-semibold text-white">
                            {request.clientName || "Client"}
                          </p>
                          <p className="text-sm text-neutral-500">
                            Sent {formatShortDate(request.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <DetailTile
                          icon={<MapPin size={17} />}
                          label="Placement"
                          value={request.bodyPlacement || "Not specified"}
                        />
                        <DetailTile
                          icon={<Ruler size={17} />}
                          label="Size"
                          value={request.size || "Not specified"}
                        />
                        <DetailTile
                          icon={<DollarSign size={17} />}
                          label="Budget"
                          value={formatBudget(request.budget)}
                        />
                        <DetailTile
                          icon={<CalendarDays size={17} />}
                          label="Preferred dates"
                          value={
                            request.preferredDateRange?.length === 2
                              ? formatDateRange(request.preferredDateRange)
                              : "Flexible"
                          }
                        />
                        <DetailTile
                          icon={<Clock size={17} />}
                          label="Preferred time"
                          value={
                            request.availableTime?.from &&
                            request.availableTime?.to
                              ? `${formatTime(
                                  request.availableTime.from
                                )} - ${formatTime(request.availableTime.to)}`
                              : "Flexible"
                          }
                        />
                        <DetailTile
                          icon={<Check size={17} />}
                          label="Available days"
                          value={
                            request.availableDays?.length
                              ? getFormattedAvailableDays(request.availableDays)
                              : "Flexible"
                          }
                        />
                      </div>

                      <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                          <MessageSquareText size={17} />
                          Client message
                        </div>
                        <p className="whitespace-pre-line text-sm leading-6 text-neutral-300">
                          {request.description || "No description provided."}
                        </p>
                      </div>

                      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={isDeclining}
                          onClick={() => onDecline(request)}
                          className="modal-action-button inline-flex items-center justify-center rounded-lg! border border-white/10 bg-white/[0.03] px-3! py-2! text-xs! font-semibold text-neutral-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isDeclining ? "Declining..." : "Decline"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onPrepareOffer(request)}
                          className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! border border-amber-200/55 bg-amber-300/10 px-3! py-2! text-xs! font-semibold text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(252,211,77,0.08)] backdrop-blur transition hover:border-amber-100/75 hover:bg-amber-300/16 hover:text-white"
                        >
                          <Send size={16} className="text-amber-200" />
                          Prepare offer
                        </button>
                        <button
                          type="button"
                          onClick={() => onMakeOffer(request)}
                          className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85"
                        >
                          <Send size={16} />
                          Make an offer
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </Dialog.Panel>
          </Transition.Child>
          {request && (
            <MobileRequestActionDock
              request={request}
              visible={mobileActionsVisible}
              isDeclining={isDeclining}
              primaryLabel="Make an offer"
              onDecline={onDecline}
              onMakeOffer={onMakeOffer}
              onPrepareOffer={onPrepareOffer}
            />
          )}
        </div>
      </div>
    </Dialog>
  </Transition>
  );
};

const FlashRequestDetailsDialog = ({
  request,
  isDeclining,
  onClose,
  onDecline,
  onMakeOffer,
  onPrepareOffer,
}: {
  request: BookingRequest | null;
  isDeclining: boolean;
  onClose: () => void;
  onDecline: (request: BookingRequest) => void;
  onMakeOffer: (request: BookingRequest) => void;
  onPrepareOffer: (request: BookingRequest) => void;
}) => {
  const { scrollContainerRef, mobileActionsVisible } =
    useMobileModalActionDock(Boolean(request));

  return (
  <Transition appear show={!!request} as={Fragment}>
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

      <div
        ref={scrollContainerRef}
        className="fixed inset-0 overflow-y-auto request-modal-scrollbar"
      >
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
              {request && (
                <>
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                        Flash request
                      </p>
                      <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                        {request.clientName || "Client"} requested a flash item
                      </Dialog.Title>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                      aria-label="Close flash request details"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
                    <div className="border-b border-white/10 bg-black/40 p-5 lg:border-b-0 lg:border-r lg:p-6">
                      <FlashRequestPreviewCard request={request} />
                    </div>

                    <div className="p-5 pb-28 sm:p-6">
                      <div className="flex items-center gap-4">
                        <img
                          src={request.clientAvatar || "/default-avatar.png"}
                          alt={request.clientName}
                          className="h-14 w-14 rounded-full border border-white/10 object-cover"
                        />
                        <div>
                          <p className="font-semibold text-white">
                            {request.clientName || "Client"}
                          </p>
                          <p className="text-sm text-neutral-500">
                            Sent {formatShortDate(request.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <DetailTile
                          icon={<DollarSign size={17} />}
                          label="Listed flash price"
                          value={formatFlashPrice(request.flashPrice)}
                        />
                        <DetailTile
                          icon={<MapPin size={17} />}
                          label="Placement"
                          value={request.bodyPlacement || "Not specified"}
                        />
                        <DetailTile
                          icon={<Ruler size={17} />}
                          label="Size"
                          value={request.size || "Not specified"}
                        />
                        <DetailTile
                          icon={<CalendarDays size={17} />}
                          label="Preferred dates"
                          value={
                            request.preferredDateRange?.length === 2
                              ? formatDateRange(request.preferredDateRange)
                              : "Flexible"
                          }
                        />
                        <DetailTile
                          icon={<Clock size={17} />}
                          label="Preferred time"
                          value={
                            request.availableTime?.from &&
                            request.availableTime?.to
                              ? `${formatTime(
                                  request.availableTime.from
                                )} - ${formatTime(request.availableTime.to)}`
                              : "Flexible"
                          }
                        />
                        <DetailTile
                          icon={<Check size={17} />}
                          label="Available days"
                          value={
                            request.availableDays?.length
                              ? getFormattedAvailableDays(request.availableDays)
                              : "Flexible"
                          }
                        />
                      </div>

                      <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                          <MessageSquareText size={17} />
                          Client note
                        </div>
                        <p className="whitespace-pre-line text-sm leading-6 text-neutral-300">
                          {request.description || "No note provided."}
                        </p>
                      </div>

                      <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm leading-6 text-emerald-50/80">
                        This request is tied to one listed flash design. The
                        offer should use the listed flash price and a single
                        appointment flow.
                      </div>

                      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={isDeclining}
                          onClick={() => onDecline(request)}
                          className="modal-action-button inline-flex items-center justify-center rounded-lg! border border-white/10 bg-white/[0.03] px-3! py-2! text-xs! font-semibold text-neutral-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isDeclining ? "Declining..." : "Decline"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onPrepareOffer(request)}
                          className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! border border-amber-200/55 bg-amber-300/10 px-3! py-2! text-xs! font-semibold text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(252,211,77,0.08)] backdrop-blur transition hover:border-amber-100/75 hover:bg-amber-300/16 hover:text-white"
                        >
                          <Send size={16} className="text-amber-200" />
                          Prepare offer
                        </button>
                        <button
                          type="button"
                          onClick={() => onMakeOffer(request)}
                          className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85"
                        >
                          <Send size={16} />
                          Make flash offer
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </Dialog.Panel>
          </Transition.Child>
          {request && (
            <MobileRequestActionDock
              request={request}
              visible={mobileActionsVisible}
              isDeclining={isDeclining}
              primaryLabel="Make flash offer"
              onDecline={onDecline}
              onMakeOffer={onMakeOffer}
              onPrepareOffer={onPrepareOffer}
            />
          )}
        </div>
      </div>
    </Dialog>
  </Transition>
  );
};

const FlashRequestPreviewCard = ({ request }: { request: BookingRequest }) => {
  const previewUrl = request.fullUrl || request.thumbUrl || "";

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-2xl">
      <div className="relative aspect-[4/5] bg-black">
        {previewUrl ? (
          <Zoom>
            <img
              src={previewUrl}
              alt={request.flashTitle || "Requested flash design"}
              className="h-full w-full object-cover"
            />
          </Zoom>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
            <ImageIcon size={34} />
            <span>No flash image available</span>
          </div>
        )}
        <span className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/75 px-3 py-1 text-xs uppercase tracking-[0.14em] text-white backdrop-blur">
          Flash item
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg! font-semibold! text-white">
              {request.flashTitle || "Untitled flash"}
            </h3>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-neutral-500">
              {request.isFromSheet ? "From flash sheet" : "Standalone flash"}
            </p>
          </div>
          <p className="shrink-0 text-lg font-semibold text-white">
            {formatFlashPrice(request.flashPrice)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <InfoPill icon={<MapPin size={14} />} label={request.bodyPlacement} />
          <InfoPill icon={<Ruler size={14} />} label={request.size} />
        </div>
      </div>
    </div>
  );
};

const DetailTile = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
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

const InfoPill = ({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label?: string | number;
}) => (
  <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-2 text-xs text-neutral-300">
    <span className="text-neutral-500">{icon}</span>
    <span className="truncate">{label || "Not set"}</span>
  </span>
);

const EmptyRequests = ({ isFiltering }: { isFiltering: boolean }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
      <MessageSquareText size={22} />
    </div>
    <h2 className="mt-4 text-xl! font-semibold! text-white">
      {isFiltering ? "No requests match this filter" : "No pending requests"}
    </h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
      {isFiltering
        ? "Try another month or clear the filter to return to all pending requests."
        : "New tattoo requests will appear here with client details, references, and availability."}
    </p>
  </div>
);

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

const formatBudget = (budget?: string | number) => {
  if (typeof budget === "number") return `$${budget}`;
  if (!budget) return "Flexible";
  if (budget.endsWith("+")) return `$${budget}`;
  if (budget.includes("-")) {
    const [min, max] = budget.split("-");
    const minAmount = min.trim().replace(/^\$/, "");
    const maxAmount = max.trim().replace(/^\$/, "");
    return `$${minAmount} - $${maxAmount}`;
  }
  return budget;
};

const formatFlashPrice = (price?: number | null) =>
  typeof price === "number" && Number.isFinite(price) && price > 0
    ? `$${price}`
    : "Price not listed";

const formatAvailableDaysSummary = (request: BookingRequest) =>
  request.availableDays?.length
    ? getFormattedAvailableDays(request.availableDays)
    : "Days flexible";

const formatAvailableTimeWindow = (request: BookingRequest) => {
  const from = request.availableTime?.from;
  const to = request.availableTime?.to;

  if (from && to) return `${formatTime(from)} - ${formatTime(to)}`;
  if (from) return `${formatTime(from)} - Any time`;
  if (to) return `Any time - ${formatTime(to)}`;
  return "Any time";
};

const formatDateRange = (dates: string[]): string => {
  const [start, end] = dates;
  if (!start || !end) return "Flexible";

  return `${formatDate(start, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })} - ${formatDate(end, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`;
};

const formatCompactDateRange = (dates: string[]) => {
  const [start, end] = dates;
  if (!start || !end) return "Flexible";

  return `${formatDate(start, { month: "short", day: "numeric" })} - ${formatDate(
    end,
    { month: "short", day: "numeric" }
  )}`;
};

const formatDate = (
  dateStr: string,
  options: Intl.DateTimeFormatOptions
): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  return localDate.toLocaleDateString("en-US", options);
};

const formatTime = (time: string): string => {
  const [hourStr, minute] = time.split(":");
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return `${hour}:${minute}${ampm}`;
};

const getFormattedAvailableDays = (days: string[]): string => {
  const dayOrder = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const abbreviations: Record<string, string> = {
    Sunday: "Sun",
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thu",
    Friday: "Fri",
    Saturday: "Sat",
  };

  return [...days]
    .sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b))
    .map((day) => abbreviations[day] || day)
    .join(", ");
};

const requestMatchesMonth = (
  request: BookingRequest,
  selectedMonth: number,
  selectedYear: number
) => {
  if (!request.preferredDateRange?.length) return false;
  const [startStr, endStr] = request.preferredDateRange;
  const requestDates = [parseLocalDate(startStr), parseLocalDate(endStr)].filter(
    Boolean
  ) as Date[];

  return requestDates.some(
    (date) =>
      date.getMonth() === selectedMonth && date.getFullYear() === selectedYear
  );
};

const parseLocalDate = (dateStr?: string) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const getRequestTime = (request: BookingRequest) => {
  const createdAt = request.createdAt;
  if (!createdAt) return 0;
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt.toDate === "function") return createdAt.toDate().getTime();
  if (typeof createdAt.seconds === "number") return createdAt.seconds * 1000;
  return 0;
};

const formatShortDate = (createdAt?: BookingRequest["createdAt"]) => {
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

export default BookingRequestsList;
