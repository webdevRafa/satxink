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
import { collection, getDocs, query, where } from "firebase/firestore";
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
    const fetchRequests = async () => {
      setLoading(true);
      try {
        const requestsQuery = query(
          collection(db, "bookingRequests"),
          where("clientId", "==", clientId)
        );
        const snap = await getDocs(requestsQuery);
        const data = snap.docs.map((requestDoc) => ({
          id: requestDoc.id,
          ...requestDoc.data(),
        })) as BookingRequest[];
        setRequests(data);
      } finally {
        setLoading(false);
      }
    };

    if (clientId) fetchRequests();
  }, [clientId]);

  const sortedRequests = useMemo(
    () => [...requests].sort((a, b) => getItemTime(b) - getItemTime(a)),
    [requests]
  );
  const pendingCount = requests.filter((request) => (request.status || "pending") === "pending").length;
  const withOffers = requests.filter((request) => request.status === "offered").length;

  if (loading) {
    return <RequestsSkeleton />;
  }

  return (
    <section className="mx-auto mt-6 max-w-7xl space-y-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <DashboardHeader
          eyebrow="Client inbox"
          title="My requests"
          description="Review the tattoo ideas you have sent and track whether an artist has responded."
        />
        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          <MetricCard label="Total" value={requests.length} />
          <MetricCard label="Pending" value={pendingCount} />
          <MetricCard label="Offered" value={withOffers} />
        </div>
      </div>

      {sortedRequests.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText size={22} />}
          title="No requests yet"
          description="Requests you send from artist profiles will appear here with references, dates, and status."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedRequests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onOpen={() => setSelectedRequest(request)}
            />
          ))}
        </div>
      )}

      <RequestDetailsDialog
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
      />
    </section>
  );
};

const RequestCard = ({
  request,
  onOpen,
}: {
  request: BookingRequest;
  onOpen: () => void;
}) => {
  const previewUrl = request.thumbUrl || request.fullUrl || "";

  return (
    <article className="group overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg transition hover:border-white/20 hover:bg-[#151515]">
      <button type="button" onClick={onOpen} className="block w-full p-0! text-left">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] p-4">
          <div>
            <p className="font-semibold text-white">Tattoo request</p>
            <p className="text-xs text-neutral-500">{formatShortDate(request.createdAt)}</p>
          </div>
          <StatusBadge status={request.status || "pending"} />
        </div>

        <div className="relative h-48 bg-black">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Tattoo request reference"
              className="h-full w-full object-cover opacity-85 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-100"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
              <ImageIcon size={26} />
              <span className="text-sm">No reference image</span>
            </div>
          )}
        </div>

        <div className="p-4">
          <p className="line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-neutral-300">
            {request.description || "No description provided."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <InfoPill icon={<MapPin size={14} />} label={request.bodyPlacement} />
            <InfoPill icon={<Ruler size={14} />} label={request.size} />
            <InfoPill
              icon={<CalendarDays size={14} />}
              label={
                request.preferredDateRange?.length === 2
                  ? formatCompactDateRange(request.preferredDateRange)
                  : "Flexible"
              }
            />
            <InfoPill icon={<DollarSign size={14} />} label={formatBudget(request.budget)} />
          </div>
        </div>
      </button>
      <div className="border-t border-white/10 p-4">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10"
        >
          <Eye size={16} />
          View details
        </button>
      </div>
    </article>
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
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}>{status.replace("_", " ")}</span>;
};

const InfoPill = ({ icon, label }: { icon: ReactNode; label?: string | number }) => (
  <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-2 text-xs text-neutral-300">
    <span className="text-neutral-500">{icon}</span>
    <span className="truncate">{label || "Not set"}</span>
  </span>
);

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
  <section className="mx-auto mt-6 max-w-7xl space-y-6">
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

const formatDateRange = (dates: string[]) => {
  const [start, end] = dates;
  return `${formatDate(start, { month: "long", day: "numeric", year: "numeric" })} - ${formatDate(end, { month: "long", day: "numeric", year: "numeric" })}`;
};

const formatCompactDateRange = (dates: string[]) => {
  const [start, end] = dates;
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
