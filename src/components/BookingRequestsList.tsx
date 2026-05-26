import { Fragment, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  CalendarDays,
  Check,
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
};

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
  const [declinedRequestIds, setDeclinedRequestIds] = useState<string[]>([]);
  const [isDeclining, setIsDeclining] = useState(false);

  const visibleRequests = useMemo(
    () =>
      bookingRequests
        .filter((request) => !declinedRequestIds.includes(request.id))
        .sort((a, b) => getRequestTime(b) - getRequestTime(a)),
    [bookingRequests, declinedRequestIds]
  );

  const filteredRequests = useMemo(
    () =>
      isFiltering
        ? visibleRequests.filter((request) =>
            requestMatchesMonth(request, selectedMonth, selectedYear)
          )
        : visibleRequests,
    [isFiltering, selectedMonth, selectedYear, visibleRequests]
  );

  const requestsWithReference = visibleRequests.filter(
    (request) => request.thumbUrl || request.fullUrl
  ).length;

  const newestRequest = visibleRequests[0];

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

  return (
    <section className="mt-6 w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Artist inbox
          </p>
          <h1 className="mt-2 text-3xl! font-semibold text-white">
            Tattoo requests
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Review new client ideas, check availability details, and move the
            right projects into offers.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          <MetricCard label="Pending" value={visibleRequests.length} />
          <MetricCard label="References" value={requestsWithReference} />
          <MetricCard
            label="Newest"
            value={newestRequest ? formatShortDate(newestRequest.createdAt) : "-"}
          />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
              <SlidersHorizontal size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 className="mb-0! text-lg!">Request filters</h2>
              <p className="text-sm text-neutral-400">
                Filter by the client's preferred date range.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
              className="h-11 rounded-md border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none transition focus:border-[var(--color-primary)]"
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
              className="h-11 rounded-md border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none transition focus:border-[var(--color-primary)]"
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
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-4! text-sm! font-semibold text-black transition hover:bg-white/85"
            >
              <Filter size={16} />
              Filter
            </button>

            {isFiltering && (
              <button
                type="button"
                onClick={() => setIsFiltering(false)}
                className="inline-flex h-11 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-4! text-sm! font-semibold text-white transition hover:bg-white/10"
              >
                Clear
              </button>
            )}

            <span className="text-sm text-neutral-500">
              Showing {filteredRequests.length} of {visibleRequests.length}
            </span>
          </div>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <EmptyRequests isFiltering={isFiltering} />
      ) : (
        <RequestTable
          requests={filteredRequests}
          onOpen={setSelectedRequest}
          onMakeOffer={handleMakeOffer}
        />
      )}

      <RequestDetailsDialog
        request={selectedRequest}
        isDeclining={isDeclining}
        onClose={() => setSelectedRequest(null)}
        onDecline={handleDecline}
        onMakeOffer={handleMakeOffer}
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
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
      {label}
    </p>
    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
  </div>
);

const RequestTable = ({
  requests,
  onOpen,
  onMakeOffer,
}: {
  requests: BookingRequest[];
  onOpen: (request: BookingRequest) => void;
  onMakeOffer: (request: BookingRequest) => void;
}) => {
  const columns =
    "minmax(220px,1.2fr) 96px minmax(210px,1.1fr) minmax(260px,1.45fr) minmax(130px,.7fr) minmax(190px,.8fr)";

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
      <div className="request-modal-scrollbar overflow-x-auto">
        <div className="min-w-[1180px]">
          <div
            className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
            style={{ gridTemplateColumns: columns }}
          >
            <span>Client</span>
            <span>Reference</span>
            <span>Availability</span>
            <span>Idea</span>
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
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const RequestRow = ({
  request,
  columns,
  onOpen,
  onMakeOffer,
}: {
  request: BookingRequest;
  columns: string;
  onOpen: () => void;
  onMakeOffer: () => void;
}) => {
  const previewUrl = request.thumbUrl || request.fullUrl || "";

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
          src={request.clientAvatar || "/default-avatar.png"}
          alt={request.clientName || "Client"}
          className="h-11 w-11 rounded-full border border-white/10 object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">
            {request.clientName || "Client"}
          </p>
          <p className="text-sm text-neutral-400">
            {formatShortDate(request.createdAt)}
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

      <div className="min-w-0 pr-4">
        <p className="truncate text-sm font-medium text-white">
          {formatCompactDateRange(request.preferredDateRange || [])}
        </p>
        <p className="mt-1 truncate text-xs text-neutral-500">
          {formatAvailabilitySummary(request)}
        </p>
      </div>

      <div className="min-w-0 pr-4">
        <p className="truncate text-sm text-neutral-300">
          {request.description || "No description provided."}
        </p>
        <p className="mt-1 truncate text-xs text-neutral-500">
          {request.bodyPlacement || "Placement open"} · {request.size || "Size open"}
        </p>
      </div>

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
      </div>

      <div className="flex justify-end gap-2">
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

const RequestDetailsDialog = ({
  request,
  isDeclining,
  onClose,
  onDecline,
  onMakeOffer,
}: {
  request: BookingRequest | null;
  isDeclining: boolean;
  onClose: () => void;
  onDecline: (request: BookingRequest) => void;
  onMakeOffer: (request: BookingRequest) => void;
}) => {
  if (request?.sourceType === "flash") {
    return (
      <FlashRequestDetailsDialog
        request={request}
        isDeclining={isDeclining}
        onClose={onClose}
        onDecline={onDecline}
        onMakeOffer={onMakeOffer}
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
                            className="h-full max-h-[72vh] min-h-[420px] w-full object-contain"
                          />
                        </Zoom>
                      ) : (
                        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
                          <ImageIcon size={34} />
                          <span>No reference image uploaded</span>
                        </div>
                      )}
                    </div>

                    <div className="p-5 sm:p-6">
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
                          className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-5! py-3! text-sm! font-semibold text-neutral-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isDeclining ? "Declining..." : "Decline"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onMakeOffer(request)}
                          className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85"
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
}: {
  request: BookingRequest | null;
  isDeclining: boolean;
  onClose: () => void;
  onDecline: (request: BookingRequest) => void;
  onMakeOffer: (request: BookingRequest) => void;
}) => (
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

                    <div className="p-5 sm:p-6">
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
                          className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-5! py-3! text-sm! font-semibold text-neutral-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isDeclining ? "Declining..." : "Decline"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onMakeOffer(request)}
                          className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85"
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
        </div>
      </div>
    </Dialog>
  </Transition>
);

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

const formatBudget = (budget?: string | number) => {
  if (typeof budget === "number") return `$${budget}`;
  if (!budget) return "Flexible";
  if (budget.endsWith("+")) return `$${budget}`;
  if (budget.includes("-")) {
    const [min, max] = budget.split("-");
    return `$${min}-$${max}`;
  }
  return budget;
};

const formatFlashPrice = (price?: number | null) =>
  typeof price === "number" && Number.isFinite(price) && price > 0
    ? `$${price}`
    : "Price not listed";

const formatAvailabilitySummary = (request: BookingRequest) => {
  const days = request.availableDays?.length
    ? request.availableDays.join(", ")
    : "Days flexible";
  const time =
    request.availableTime?.from || request.availableTime?.to
      ? `${request.availableTime?.from || "Any"}-${request.availableTime?.to || "Any"}`
      : "Any time";

  return `${days} · ${time}`;
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
