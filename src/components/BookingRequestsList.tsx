import { Fragment, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  CalendarDays,
  Clock,
  DollarSign,
  Eye,
  ImageIcon,
  MapPin,
  Ruler,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "../firebase/firebaseConfig";

type FirestoreTimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

export type FlashBookingRequest = {
  id: string;
  sourceType?: string;
  flashId?: string;
  flashTitle?: string;
  flashDescription?: string | null;
  flashPrice?: number | null;
  flashRepeatability?: "repeatable" | "one_of_one";
  clientId: string;
  clientFirstName?: string;
  clientLastName?: string;
  clientName: string;
  clientAvatar: string;
  artistId?: string;
  bodyPlacement: string;
  size: string;
  preferredDateRange?: string[];
  availableDays?: string[];
  availableTime?: { from?: string; to?: string };
  fullUrl?: string;
  thumbUrl?: string;
  createdAt?: Date | FirestoreTimestampLike | null;
};

type Props = {
  bookingRequests: FlashBookingRequest[];
  onMakeOffer: (request: FlashBookingRequest) => void;
  onRequestResolved?: (requestId: string) => void;
};

const BookingRequestsList = ({
  bookingRequests,
  onMakeOffer,
  onRequestResolved,
}: Props) => {
  const [selectedRequest, setSelectedRequest] =
    useState<FlashBookingRequest | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const flashRequests = useMemo(
    () =>
      bookingRequests
        .filter(
          (request) =>
            request.sourceType === "flash" && Boolean(request.flashId)
        )
        .sort((left, right) => getCreatedAtMs(right) - getCreatedAtMs(left)),
    [bookingRequests]
  );

  const declineRequest = async (request: FlashBookingRequest) => {
    if (
      !window.confirm(
        "Let the client know this flash is not available for their request?"
      )
    ) {
      return;
    }
    try {
      setDecliningId(request.id);
      await updateDoc(doc(db, "bookingRequests", request.id), {
        status: "declined",
        declinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onRequestResolved?.(request.id);
      if (selectedRequest?.id === request.id) setSelectedRequest(null);
      toast.success("The client will see that this flash is unavailable.");
    } catch (error) {
      console.error("Failed to decline flash request:", error);
      toast.error("Could not update this request.");
    } finally {
      setDecliningId(null);
    }
  };

  return (
    <section className="mt-6 w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Artist inbox
          </p>
          <h1 className="mt-1 text-3xl! font-semibold! text-white">
            Flash requests
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Review clients who want to book one of your published flash designs.
          </p>
        </div>
        <div className="min-w-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Awaiting you
          </p>
          <p className="mt-1 text-xl! font-semibold! text-white">
            {flashRequests.length}
          </p>
        </div>
      </div>

      {flashRequests.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.025] px-5 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.05] text-[var(--color-primary)]">
            <ImageIcon size={21} />
          </span>
          <h2 className="mt-4 text-xl! font-semibold! text-white">
            No new flash requests
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400">
            New requests for your available flash will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {flashRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                declining={decliningId === request.id}
                onDetails={() => setSelectedRequest(request)}
                onOffer={() => onMakeOffer(request)}
                onDecline={() => void declineRequest(request)}
              />
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-white/10 bg-[#111] md:block">
            <div className="grid grid-cols-[minmax(240px,1.2fr)_minmax(180px,.8fr)_minmax(190px,.85fr)_minmax(280px,1fr)] border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              <span>Flash</span><span>Client</span><span>Requested timing</span><span className="text-right">Actions</span>
            </div>
            {flashRequests.map((request) => (
              <div key={request.id} className="grid grid-cols-[minmax(240px,1.2fr)_minmax(180px,.8fr)_minmax(190px,.85fr)_minmax(280px,1fr)] items-center gap-4 border-b border-white/8 px-4 py-4 last:border-b-0">
                <FlashIdentity request={request} />
                <ClientIdentity request={request} />
                <p className="text-sm text-neutral-300">{formatDateWindow(request.preferredDateRange)}</p>
                <div className="flex justify-end gap-2">
                  <ActionButton onClick={() => setSelectedRequest(request)} icon={<Eye size={14} />} label="Details" />
                  <ActionButton onClick={() => void declineRequest(request)} label={decliningId === request.id ? "Updating…" : "Unavailable"} disabled={decliningId === request.id} />
                  <ActionButton primary onClick={() => onMakeOffer(request)} icon={<Send size={14} />} label="Make offer" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <RequestDetailsDialog
        request={selectedRequest}
        declining={decliningId === selectedRequest?.id}
        onClose={() => setSelectedRequest(null)}
        onDecline={(request) => void declineRequest(request)}
        onOffer={(request) => {
          setSelectedRequest(null);
          onMakeOffer(request);
        }}
      />
    </section>
  );
};

const RequestCard = ({ request, declining, onDetails, onOffer, onDecline }: { request: FlashBookingRequest; declining: boolean; onDetails: () => void; onOffer: () => void; onDecline: () => void }) => (
  <article className="rounded-xl border border-white/10 bg-[#121212] p-3 shadow-lg">
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <RequestImage request={request} className="h-24 w-[88px]" />
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{getFlashTitle(request)}</p>
        <p className="mt-1 text-sm text-neutral-400">{formatPrice(request.flashPrice)}</p>
        <div className="mt-3"><ClientIdentity request={request} /></div>
      </div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-400">
      <InfoLine icon={<MapPin size={13} />} value={request.bodyPlacement || "Placement not set"} />
      <InfoLine icon={<Ruler size={13} />} value={request.size || "Size not set"} />
      <InfoLine icon={<CalendarDays size={13} />} value={formatDateWindow(request.preferredDateRange)} className="col-span-2" />
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2">
      <ActionButton onClick={onDetails} label="Details" />
      <ActionButton onClick={onDecline} label={declining ? "Updating…" : "Unavailable"} disabled={declining} />
      <ActionButton primary onClick={onOffer} label="Offer" />
    </div>
  </article>
);

const RequestDetailsDialog = ({ request, declining, onClose, onDecline, onOffer }: { request: FlashBookingRequest | null; declining: boolean; onClose: () => void; onDecline: (request: FlashBookingRequest) => void; onOffer: (request: FlashBookingRequest) => void }) => (
  <Transition appear show={Boolean(request)} as={Fragment}>
    <Dialog as="div" className="relative z-[90]" onClose={onClose}>
      <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"><div className="fixed inset-0 bg-black/80 backdrop-blur-sm" /></Transition.Child>
      <div className="fixed inset-0 overflow-y-auto p-3 pt-[max(1rem,env(safe-area-inset-top))] md:p-6">
        <div className="flex min-h-full items-start justify-center md:items-center">
          <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 translate-y-3" enterTo="opacity-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 translate-y-0" leaveTo="opacity-0 translate-y-3">
            <Dialog.Panel className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#111] text-white shadow-2xl">
              {request && <>
                <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Flash request</p><Dialog.Title className="mt-1 text-xl! font-semibold! text-white">{request.clientName || "Client"} wants to book your flash</Dialog.Title></div><button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] p-0! text-neutral-300" aria-label="Close request details"><X size={17} /></button></header>
                <div className="grid md:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
                  <div className="border-b border-white/10 bg-black/35 p-4 md:border-b-0 md:border-r"><img src={request.fullUrl || request.thumbUrl || "/default-avatar.png"} alt={getFlashTitle(request)} className="max-h-[62vh] w-full rounded-xl bg-black object-contain" /></div>
                  <div className="space-y-4 p-4 sm:p-6">
                    <FlashIdentity request={request} />
                    <div className="grid grid-cols-2 gap-2"><DetailTile icon={<MapPin size={15} />} label="Placement" value={request.bodyPlacement || "Not provided"} /><DetailTile icon={<Ruler size={15} />} label="Size" value={request.size || "Not provided"} /><DetailTile icon={<CalendarDays size={15} />} label="Preferred dates" value={formatDateWindow(request.preferredDateRange)} /><DetailTile icon={<Clock size={15} />} label="Preferred time" value={formatTimeWindow(request.availableTime)} /></div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Days that usually work</p><p className="mt-2 text-sm text-neutral-300">{request.availableDays?.join(", ") || "Not provided"}</p></div>
                    <div className="grid grid-cols-2 gap-2"><ActionButton onClick={() => onDecline(request)} label={declining ? "Updating…" : "Flash unavailable"} disabled={declining} /><ActionButton primary onClick={() => onOffer(request)} icon={<Send size={14} />} label="Make offer" /></div>
                  </div>
                </div>
              </>}
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </div>
    </Dialog>
  </Transition>
);

const FlashIdentity = ({ request }: { request: FlashBookingRequest }) => <div className="flex min-w-0 items-center gap-3"><RequestImage request={request} className="h-14 w-14" /><div className="min-w-0"><p className="truncate font-semibold text-white">{getFlashTitle(request)}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-400"><DollarSign size={13} />{formatPrice(request.flashPrice)}</p></div></div>;
const ClientIdentity = ({ request }: { request: FlashBookingRequest }) => <div className="flex min-w-0 items-center gap-2"><img src={request.clientAvatar || "/default-avatar.png"} alt="" className="h-8 w-8 rounded-full object-cover" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{request.clientName || "Client"}</p><p className="flex items-center gap-1 text-xs text-neutral-500"><UserRound size={11} />Client</p></div></div>;
const RequestImage = ({ request, className }: { request: FlashBookingRequest; className: string }) => <div className={`shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black ${className}`}><img src={request.thumbUrl || request.fullUrl || "/default-avatar.png"} alt="" className="h-full w-full object-contain" /></div>;
const ActionButton = ({ label, icon, primary = false, disabled = false, onClick }: { label: string; icon?: React.ReactNode; primary?: boolean; disabled?: boolean; onClick: () => void }) => <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3! py-2! text-[11px]! font-semibold transition disabled:opacity-50 ${primary ? "border-white bg-white text-black hover:bg-neutral-200" : "border-white/10 bg-white/[0.035] text-neutral-300 hover:bg-white/10"}`}>{icon}{label}</button>;
const DetailTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{icon}{label}</p><p className="mt-2 text-sm text-neutral-200">{value}</p></div>;
const InfoLine = ({ icon, value, className = "" }: { icon: React.ReactNode; value: string; className?: string }) => <p className={`flex min-w-0 items-center gap-1.5 ${className}`}>{icon}<span className="truncate">{value}</span></p>;
const getFlashTitle = (request: FlashBookingRequest) => request.flashTitle || "Untitled flash";
const formatPrice = (value?: number | null) => typeof value === "number" ? `$${value.toFixed(2)}` : "Price unavailable";
const formatDateWindow = (dates?: string[]) => !dates?.[0] ? "Flexible dates" : dates[1] && dates[1] !== dates[0] ? `${formatDate(dates[0])} – ${formatDate(dates[1])}` : formatDate(dates[0]);
const formatDate = (value: string) => { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date); };
const formatTimeWindow = (value?: { from?: string; to?: string }) => value?.from && value?.to ? `${value.from} – ${value.to}` : "Flexible time";
const getCreatedAtMs = (request: FlashBookingRequest) => { const value = request.createdAt; if (value instanceof Date) return value.getTime(); if (value && typeof value.toDate === "function") return value.toDate().getTime(); if (value && typeof value.seconds === "number") return value.seconds * 1000; return 0; };

export default BookingRequestsList;
