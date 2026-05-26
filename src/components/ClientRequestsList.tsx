import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  CalendarDays,
  Clock,
  DollarSign,
  Eye,
  ImageIcon,
  MapPin,
  MessageSquareText,
  Ruler,
  X,
} from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
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
  status?: string;
  createdAt?: Date | FirestoreTimestampLike | null;
};

interface Props {
  clientId: string;
}

const ClientRequestsList: React.FC<Props> = ({ clientId }) => {
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<BookingRequest | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;

    setLoading(true);
    const requestsQuery = query(
      collection(db, "bookingRequests"),
      where("clientId", "==", clientId),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      requestsQuery,
      (snap) => {
        const data = snap.docs.map((requestDoc) => ({
          id: requestDoc.id,
          ...requestDoc.data(),
        })) as BookingRequest[];
        setRequests(data);
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to client requests:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [clientId]);

  const sortedRequests = useMemo(
    () => [...requests].sort((a, b) => getItemTime(b) - getItemTime(a)),
    [requests]
  );
  const pendingCount = requests.length;
  const referencesCount = requests.filter((request) => request.thumbUrl || request.fullUrl).length;

  if (loading) {
    return <RequestsSkeleton />;
  }

  return (
    <section className="mt-6 w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <DashboardHeader
          eyebrow="Client inbox"
          title="My requests"
          description="Review the tattoo ideas you have sent and track whether an artist has responded."
        />
        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          <MetricCard label="Total" value={requests.length} />
          <MetricCard label="Pending" value={pendingCount} />
          <MetricCard label="References" value={referencesCount} />
        </div>
      </div>

      {sortedRequests.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText size={22} />}
          title="No requests yet"
          description="Requests you send from artist profiles will appear here with references, dates, and status."
        />
      ) : (
        <RequestTable requests={sortedRequests} onOpen={setSelectedRequest} />
      )}

      <RequestDetailsDialog
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
      />
    </section>
  );
};

const RequestTable = ({
  requests,
  onOpen,
}: {
  requests: BookingRequest[];
  onOpen: (request: BookingRequest) => void;
}) => {
  const columns =
    "minmax(180px,.9fr) 96px minmax(220px,1.15fr) minmax(260px,1.45fr) minmax(130px,.7fr) minmax(140px,.65fr)";

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
      <div className="request-modal-scrollbar overflow-x-auto">
        <div className="min-w-[1120px]">
          <div
            className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
            style={{ gridTemplateColumns: columns }}
          >
            <span>Request</span>
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
}: {
  request: BookingRequest;
  columns: string;
  onOpen: () => void;
}) => {
  const previewUrl = request.thumbUrl || request.fullUrl || "";

  return (
    <div
      className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
      style={{ gridTemplateColumns: columns }}
    >
      <button type="button" onClick={onOpen} className="min-w-0 p-0! text-left">
        <p className="truncate font-semibold text-white">Tattoo request</p>
        <p className="text-sm text-neutral-400">
          {formatShortDate(request.createdAt)}
        </p>
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
          {formatBudget(request.budget)}
        </p>
        <StatusBadge status={request.status || "pending"} />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white transition hover:bg-white/10"
        >
          <Eye size={14} />
          Details
        </button>
      </div>
    </div>
  );
};

const RequestDetailsDialog = ({
  request,
  onClose,
}: {
  request: BookingRequest | null;
  onClose: () => void;
}) => (
  <Transition appear show={!!request} as={Fragment}>
    <Dialog as="div" className="relative z-50" onClose={onClose}>
      <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />
      </Transition.Child>
      <div className="fixed inset-0 overflow-y-auto request-modal-scrollbar">
        <div className="flex min-h-full items-center justify-center p-4">
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="scale-95 opacity-0" enterTo="scale-100 opacity-100" leave="ease-in duration-150" leaveFrom="scale-100 opacity-100" leaveTo="scale-95 opacity-0">
            <Dialog.Panel className="w-full max-w-6xl overflow-hidden rounded-lg border border-white/10 bg-[#111111] text-white shadow-2xl">
              {request && (
                <>
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">Request details</p>
                      <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">Your tattoo request</Dialog.Title>
                    </div>
                    <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10" aria-label="Close request details">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="grid gap-0 lg:grid-cols-[1fr_0.95fr]">
                    <div className="border-b border-white/10 bg-black lg:border-b-0 lg:border-r">
                      {request.fullUrl || request.thumbUrl ? (
                        <img src={request.fullUrl || request.thumbUrl} alt="Tattoo request reference" className="h-full max-h-[72vh] min-h-[420px] w-full object-contain" />
                      ) : (
                        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
                          <ImageIcon size={34} />
                          <span>No reference image uploaded</span>
                        </div>
                      )}
                    </div>
                    <div className="p-5 sm:p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-white">Request sent</p>
                          <p className="text-sm text-neutral-500">{formatShortDate(request.createdAt)}</p>
                        </div>
                        <StatusBadge status={request.status || "pending"} />
                      </div>
                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <DetailTile icon={<MapPin size={17} />} label="Placement" value={request.bodyPlacement || "Not specified"} />
                        <DetailTile icon={<Ruler size={17} />} label="Size" value={request.size || "Not specified"} />
                        <DetailTile icon={<DollarSign size={17} />} label="Budget" value={formatBudget(request.budget)} />
                        <DetailTile icon={<CalendarDays size={17} />} label="Dates" value={request.preferredDateRange?.length === 2 ? formatDateRange(request.preferredDateRange) : "Flexible"} />
                        <DetailTile icon={<Clock size={17} />} label="Time" value={request.availableTime?.from && request.availableTime?.to ? `${formatTime(request.availableTime.from)} - ${formatTime(request.availableTime.to)}` : "Flexible"} />
                        <DetailTile icon={<CalendarDays size={17} />} label="Days" value={request.availableDays?.length ? request.availableDays.join(", ") : "Flexible"} />
                      </div>
                      <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                          <MessageSquareText size={17} />
                          Your message
                        </div>
                        <p className="whitespace-pre-line text-sm leading-6 text-neutral-300">{request.description || "No description provided."}</p>
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

const DashboardHeader = ({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) => (
  <div>
    <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">{eyebrow}</p>
    <h1 className="mt-2 text-3xl! font-semibold text-white">{title}</h1>
    <p className="mt-2 max-w-2xl text-sm text-neutral-400">{description}</p>
  </div>
);

const MetricCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const className =
    status === "offered"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : status === "declined"
      ? "border-red-300/25 bg-red-300/10 text-red-100"
      : "border-amber-300/20 bg-amber-300/10 text-amber-100";
  return <span className={`inline-flex w-fit justify-self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}>{status.replace("_", " ")}</span>;
};

const DetailTile = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <div className="rounded-lg border border-white/10 bg-black/25 p-3">
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-neutral-500">{icon}{label}</div>
    <p className="mt-2 text-sm font-medium text-white">{value}</p>
  </div>
);

const EmptyState = ({ icon, title, description }: { icon: ReactNode; title: string; description: string }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">{icon}</div>
    <h2 className="mt-4 text-xl! font-semibold! text-white">{title}</h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">{description}</p>
  </div>
);

const RequestsSkeleton = () => (
  <section className="mt-6 w-full max-w-7xl space-y-6">
    <div className="h-36 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-80 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />
      ))}
    </div>
  </section>
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

const formatDateRange = (dates: string[]) => {
  const [start, end] = dates;
  return `${formatDate(start, { month: "long", day: "numeric", year: "numeric" })} - ${formatDate(end, { month: "long", day: "numeric", year: "numeric" })}`;
};

const formatCompactDateRange = (dates: string[]) => {
  const [start, end] = dates;
  if (!start || !end) return "Flexible";
  return `${formatDate(start, { month: "short", day: "numeric" })} - ${formatDate(end, { month: "short", day: "numeric" })}`;
};

const formatDate = (dateStr: string, options: Intl.DateTimeFormatOptions) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", options);
};

const formatTime = (time: string) => {
  const [hourStr, minute] = time.split(":");
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return `${hour}:${minute}${ampm}`;
};

const getItemTime = (item: BookingRequest) => {
  const createdAt = item.createdAt;
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
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "New";
};

export default ClientRequestsList;
