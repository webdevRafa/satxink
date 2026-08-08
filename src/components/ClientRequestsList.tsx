import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  CalendarDays,
  Clock3,
  Eye,
  ImageOff,
  Layers,
  MapPin,
  Ruler,
  Store,
  X,
} from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

type FirestoreTimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

type FlashRequest = {
  id: string;
  sourceType?: string;
  flashId?: string;
  flashTitle?: string;
  flashDescription?: string | null;
  flashPrice?: number | null;
  flashRepeatability?: string;
  artistId?: string;
  artistName?: string;
  artistAvatar?: string;
  clientId: string;
  bodyPlacement?: string;
  size?: string;
  preferredDateRange?: string[];
  availableDays?: string[];
  availableTime?: { from?: string; to?: string };
  description?: string;
  fullUrl?: string;
  thumbUrl?: string;
  status?: string;
  createdAt?: Date | FirestoreTimestampLike | null;
};

type RequestFilter = "all" | "waiting" | "closed";

const PAGE_SIZE = 6;
const CLOSED_STATUSES = new Set([
  "cancelled",
  "canceled",
  "closed",
  "declined",
  "expired",
  "rejected",
  "withdrawn",
]);
const OFFER_SENT_STATUSES = new Set([
  "offer_sent",
  "offered",
  "accepted",
  "completed",
]);

const ClientRequestsList = ({ clientId }: { clientId: string }) => {
  const [requests, setRequests] = useState<FlashRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<FlashRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RequestFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!clientId) return;

    setLoading(true);
    return onSnapshot(
      query(collection(db, "bookingRequests"), where("clientId", "==", clientId)),
      (snapshot) => {
        const next = snapshot.docs
          .filter((requestDoc) => requestDoc.data().sourceType === "flash")
          .map((requestDoc) => ({
            id: requestDoc.id,
            ...requestDoc.data(),
          })) as FlashRequest[];
        setRequests(next.sort((a, b) => getCreatedTime(b) - getCreatedTime(a)));
        setLoading(false);
      },
      (error) => {
        console.error("Flash request listener failed:", error);
        setLoading(false);
      }
    );
  }, [clientId]);

  const counts = useMemo(
    () => ({
      total: requests.length,
      waiting: requests.filter((request) => getStatusCategory(request) === "waiting").length,
      closed: requests.filter((request) => getStatusCategory(request) === "closed").length,
    }),
    [requests]
  );
  const filtered = useMemo(
    () =>
      filter === "all"
        ? requests
        : requests.filter((request) => getStatusCategory(request) === filter),
    [filter, requests]
  );
  const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => setPage(1), [clientId, filter]);

  if (loading) return <RequestSkeleton />;

  return (
    <section className="mt-6 w-full max-w-7xl space-y-5">
      <header className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Client inbox</p>
          <h2 className="mt-1 text-2xl! font-semibold! text-white">Flash requests</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Track the flash designs you requested and see when an artist responds.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 lg:min-w-[390px]">
          <Metric label="Total" value={counts.total} />
          <Metric label="Waiting" value={counts.waiting} />
          <Metric label="Closed" value={counts.closed} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        {(["all", "waiting", "closed"] as RequestFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-md px-4! py-2! text-xs! font-semibold capitalize transition ${
              filter === value
                ? "bg-white text-black"
                : "border border-white/10 bg-black/25 text-neutral-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {value}
          </button>
        ))}
        <span className="ml-auto text-xs text-neutral-500">
          Showing {filtered.length} of {requests.length}
        </span>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          title="No flash requests yet"
          description="Choose an available design in the flash marketplace to start a request."
        />
      ) : visible.length === 0 ? (
        <EmptyState title="No matching requests" description="Choose another filter to see more request history." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-white/10 lg:block">
            <div className="grid grid-cols-[1.25fr_1fr_1fr_.85fr_auto] gap-4 border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">
              <span>Flash</span><span>Artist</span><span>Requested timing</span><span>Status</span><span>Action</span>
            </div>
            {visible.map((request) => (
              <RequestRow key={request.id} request={request} onOpen={() => setSelectedRequest(request)} />
            ))}
          </div>

          <div className="space-y-3 lg:hidden">
            {visible.map((request) => (
              <RequestCard key={request.id} request={request} onOpen={() => setSelectedRequest(request)} />
            ))}
          </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.025] p-3">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(value - 1, 1))}
            className="rounded-md border border-white/10 px-3! py-2! text-xs! font-semibold text-white disabled:opacity-35"
          >
            Previous
          </button>
          <span className="text-xs text-neutral-500">Page {currentPage} of {totalPages}</span>
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setPage((value) => Math.min(value + 1, totalPages))}
            className="rounded-md border border-white/10 px-3! py-2! text-xs! font-semibold text-white disabled:opacity-35"
          >
            Next
          </button>
        </div>
      )}

      <RequestDetails request={selectedRequest} onClose={() => setSelectedRequest(null)} />
    </section>
  );
};

const RequestRow = ({ request, onOpen }: { request: FlashRequest; onOpen: () => void }) => {
  const status = getStatusPresentation(request);
  return (
    <div className="grid grid-cols-[1.25fr_1fr_1fr_.85fr_auto] items-center gap-4 border-b border-white/10 bg-[#111111] px-4 py-4 last:border-b-0">
      <FlashIdentity request={request} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{request.artistName || "Artist"}</p>
        <p className="mt-1 text-xs text-neutral-500">{formatDate(request.createdAt)}</p>
      </div>
      <div className="text-xs leading-5 text-neutral-400">
        <p>{formatDateRange(request.preferredDateRange)}</p>
        <p>{formatTimeWindow(request.availableTime)}</p>
      </div>
      <StatusBadge label={status.label} tone={status.tone} />
      <DetailsButton onClick={onOpen} />
    </div>
  );
};

const RequestCard = ({ request, onOpen }: { request: FlashRequest; onOpen: () => void }) => {
  const status = getStatusPresentation(request);
  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-[#111111]">
      <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 p-3">
        <RequestImage request={request} className="h-24 w-21 rounded-md" />
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{request.flashTitle || "Flash design"}</p>
              <p className="mt-1 truncate text-xs text-neutral-400">{request.artistName || "Artist"}</p>
            </div>
            <StatusBadge label={status.compactLabel} tone={status.tone} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-neutral-500">
            <span>{request.bodyPlacement || "Placement pending"}</span>
            <span>{request.size || "Size pending"}</span>
            <span className="col-span-2 truncate">{formatDateRange(request.preferredDateRange)}</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex w-full items-center justify-center gap-2 border-t border-white/10 bg-white/[0.025] px-4! py-3! text-xs! font-semibold text-white transition hover:bg-white/[0.06]"
      >
        <Eye size={15} /> View request
      </button>
    </article>
  );
};

const FlashIdentity = ({ request }: { request: FlashRequest }) => (
  <div className="flex min-w-0 items-center gap-3">
    <RequestImage request={request} className="h-14 w-14 rounded-md" />
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-white">{request.flashTitle || "Flash design"}</p>
      <p className="mt-1 text-xs text-neutral-500">
        {formatMoney(request.flashPrice)} · {formatRepeatability(request.flashRepeatability)}
      </p>
    </div>
  </div>
);

const RequestImage = ({ request, className }: { request: FlashRequest; className: string }) => {
  const [failed, setFailed] = useState(false);
  const src = request.thumbUrl || request.fullUrl || "";
  if (!src || failed) {
    return (
      <div className={`flex shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] text-neutral-600 ${className}`}>
        <ImageOff size={18} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={request.flashTitle || "Requested flash"}
      className={`shrink-0 border border-white/10 bg-black object-cover ${className}`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
};

const RequestDetails = ({ request, onClose }: { request: FlashRequest | null; onClose: () => void }) => {
  const status = request ? getStatusPresentation(request) : null;
  return (
    <Transition appear show={!!request} as={Fragment}>
      <Dialog as="div" className="relative z-[80]" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto request-modal-scrollbar">
          <div className="flex min-h-full items-start justify-center p-3 pt-20 sm:items-center sm:p-6">
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="scale-95 opacity-0" enterTo="scale-100 opacity-100" leave="ease-in duration-150" leaveFrom="scale-100 opacity-100" leaveTo="scale-95 opacity-0">
              <Dialog.Panel className="w-full max-w-4xl overflow-hidden rounded-lg border border-white/10 bg-[#111111] text-white shadow-2xl">
                {request && status && (
                  <>
                    <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Flash request</p>
                        <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">{request.flashTitle || "Flash design"}</Dialog.Title>
                      </div>
                      <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white" aria-label="Close request details"><X size={18} /></button>
                    </header>
                    <div className="grid lg:grid-cols-[1fr_.95fr]">
                      <div className="flex min-h-72 items-center justify-center bg-black p-3 lg:min-h-[560px]">
                        <RequestImage request={request} className="max-h-[70vh] h-auto w-full rounded-md object-contain!" />
                      </div>
                      <div className="space-y-5 border-t border-white/10 p-5 lg:border-l lg:border-t-0">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{request.artistName || "Artist"}</p>
                            <p className="mt-1 text-xs text-neutral-500">Sent {formatDate(request.createdAt)}</p>
                          </div>
                          <StatusBadge label={status.label} tone={status.tone} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Detail icon={<MapPin size={16} />} label="Placement" value={request.bodyPlacement || "Not selected"} />
                          <Detail icon={<Ruler size={16} />} label="Size" value={request.size || "Not selected"} />
                          <Detail icon={<CalendarDays size={16} />} label="Preferred dates" value={formatDateRange(request.preferredDateRange)} />
                          <Detail icon={<Clock3 size={16} />} label="Preferred time" value={formatTimeWindow(request.availableTime)} />
                          <Detail icon={<Store size={16} />} label="Listed price" value={formatMoney(request.flashPrice)} />
                          <Detail icon={<Layers size={16} />} label="Availability" value={formatRepeatability(request.flashRepeatability)} />
                        </div>
                        {request.availableDays && request.availableDays.length > 0 && (
                          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
                            <p className="text-xs uppercase tracking-[0.15em] text-white/40">Days that work</p>
                            <p className="mt-2 text-sm text-neutral-300">{request.availableDays.join(", ")}</p>
                          </div>
                        )}
                        {request.description && (
                          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
                            <p className="text-xs uppercase tracking-[0.15em] text-white/40">Note</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-300">{request.description}</p>
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
};

const DetailsButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"><Eye size={14} />Details</button>
);

const Detail = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
    <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-white/40">{icon}{label}</p>
    <p className="mt-2 text-sm font-medium text-white">{value}</p>
  </div>
);

const Metric = ({ label, value }: { label: string; value: number }) => (
  <div className="min-w-0 border-l border-white/10 pl-3 first:border-l-0 first:pl-0 sm:pl-5">
    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</p>
    <p className="mt-1 text-lg font-semibold text-white">{value}</p>
  </div>
);

const StatusBadge = ({ label, tone }: { label: string; tone: "waiting" | "offer" | "closed" }) => (
  <span className={`inline-flex max-w-full shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
    tone === "offer"
      ? "border-sky-300/25 bg-sky-300/10 text-sky-100"
      : tone === "closed"
      ? "border-white/10 bg-white/[0.04] text-neutral-400"
      : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
  }`}>{label}</span>
);

const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-lg border border-white/10 bg-[#111111] px-5 py-14 text-center">
    <Layers className="mx-auto text-[var(--color-primary)]" size={24} />
    <h3 className="mt-4 text-lg! font-semibold! text-white">{title}</h3>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400">{description}</p>
    <a href="/flash" className="mt-5 inline-flex rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-black">Browse flash</a>
  </div>
);

const RequestSkeleton = () => (
  <div className="mt-6 w-full max-w-7xl animate-pulse space-y-5">
    <div className="h-24 rounded-lg bg-white/[0.04]" />
    <div className="h-14 rounded-lg bg-white/[0.04]" />
    <div className="h-56 rounded-lg bg-white/[0.04]" />
  </div>
);

const getStatusCategory = (request: FlashRequest): Exclude<RequestFilter, "all"> =>
  CLOSED_STATUSES.has(String(request.status || "").toLowerCase()) ? "closed" : "waiting";

const getStatusPresentation = (request: FlashRequest) => {
  const status = String(request.status || "pending").toLowerCase();
  if (CLOSED_STATUSES.has(status)) {
    return { label: status === "declined" || status === "rejected" ? "Artist unavailable" : "Request closed", compactLabel: "Closed", tone: "closed" as const };
  }
  if (OFFER_SENT_STATUSES.has(status)) {
    return { label: "Offer sent", compactLabel: "Offer sent", tone: "offer" as const };
  }
  return { label: "Awaiting artist", compactLabel: "Waiting", tone: "waiting" as const };
};

const getCreatedTime = (request: FlashRequest) => {
  const value = request.createdAt;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  if (value && typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
};

const formatDate = (value?: Date | FirestoreTimestampLike | null) => {
  const time = value instanceof Date
    ? value
    : value && typeof value.toDate === "function"
    ? value.toDate()
    : value && typeof value.seconds === "number"
    ? new Date(value.seconds * 1000)
    : null;
  return time ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(time) : "Recently";
};

const formatDateRange = (range?: string[]) => {
  if (!range?.[0] && !range?.[1]) return "Flexible dates";
  const format = (value: string) => {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  };
  if (range[0] && range[1]) return `${format(range[0])} – ${format(range[1])}`;
  return format(range[0] || range[1]);
};

const formatTimeWindow = (window?: FlashRequest["availableTime"]) =>
  window?.from && window?.to ? `${window.from} – ${window.to}` : "Flexible time";

const formatMoney = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
    : "See flash listing";

const formatRepeatability = (value?: string) =>
  value === "one_of_one" ? "One of one" : "Repeatable";

export default ClientRequestsList;
