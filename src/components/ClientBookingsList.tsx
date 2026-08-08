import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Eye,
  ImageIcon,
  MapPin,
  Store,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase/firebaseConfig";
import type { Booking } from "../types/Booking";

interface Props {
  clientId: string;
}

const ClientBookingsList: React.FC<Props> = ({ clientId }) => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    let ignore = false;
    const bookingsQuery = query(
      collection(db, "bookings"),
      where("clientId", "==", clientId)
    );

    return onSnapshot(
      bookingsQuery,
      async (snapshot) => {
        const flashBookings = snapshot.docs
          .filter((bookingDoc) => bookingDoc.data().sourceType === "flash")
          .map((bookingDoc) => ({
            id: bookingDoc.id,
            ...bookingDoc.data(),
          })) as Booking[];
        const reconciled = await reconcilePendingPayments(flashBookings);
        if (!ignore) {
          setBookings(reconciled);
          setLoading(false);
        }
      },
      (error) => {
        console.error("Error listening to flash bookings:", error);
        setLoading(false);
      }
    );

    return () => {
      ignore = true;
    };
  }, [clientId]);

  const sortedBookings = useMemo(
    () => [...bookings].sort((a, b) => getBookingTime(b) - getBookingTime(a)),
    [bookings]
  );
  const depositPaidCount = bookings.filter((booking) =>
    ["deposit_paid", "paid", "confirmed"].includes(booking.status)
  ).length;
  const completedCount = bookings.filter(
    (booking) => booking.appointmentStatus === "completed"
  ).length;

  if (loading) return <SectionSkeleton />;

  return (
    <section className="mt-6 w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <DashboardHeader
          eyebrow="Client calendar"
          title="Bookings"
          description="Track your flash appointments, deposit status, studio details, and selected times."
        />
        <div className="grid w-full grid-cols-3 gap-2 lg:w-auto lg:min-w-[420px]">
          <MetricCard label="Total" value={bookings.length} />
          <MetricCard label="Deposit paid" value={depositPaidCount} />
          <MetricCard label="Completed" value={completedCount} />
        </div>
      </div>

      {sortedBookings.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={22} />}
          title="No flash bookings yet"
          description="Once you accept a flash offer, your appointment will appear here."
        />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {sortedBookings.map((booking) => (
              <MobileBookingCard
                key={booking.id}
                booking={booking}
                onOpen={() => setSelectedBooking(booking)}
                onPay={() => navigate(`/payment/${booking.id}`)}
              />
            ))}
          </div>
          <div className="hidden md:block">
            <BookingsTable
              bookings={sortedBookings}
              onOpen={setSelectedBooking}
              onPay={(booking) => navigate(`/payment/${booking.id}`)}
            />
          </div>
        </>
      )}

      <BookingDetailsDialog
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onPay={(bookingId) => navigate(`/payment/${bookingId}`)}
      />
    </section>
  );
};

const MobileBookingCard = ({
  booking,
  onOpen,
  onPay,
}: {
  booking: Booking;
  onOpen: () => void;
  onPay: () => void;
}) => {
  const imageUrl = getFlashImageUrl(booking);
  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-[#111111]">
      <button type="button" onClick={onOpen} className="grid w-full grid-cols-[84px_minmax(0,1fr)] gap-3 p-3! text-left">
        <div className="aspect-square overflow-hidden rounded-md border border-white/10 bg-white/[0.035]">
          {imageUrl ? (
            <img src={imageUrl} alt={booking.flashTitle || "Flash tattoo"} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-neutral-500"><ImageIcon size={20} /></span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{booking.flashTitle || "Flash tattoo"}</p>
              <p className="mt-1 truncate text-xs text-neutral-400">with {booking.artistName}</p>
            </div>
            <StatusBadge booking={booking} />
          </div>
          <p className="mt-3 text-xs text-neutral-300">{formatAppointment(booking.selectedDate, "compact")}</p>
          <p className="mt-1 truncate text-xs text-neutral-500">{booking.shopName || "Shop pending review"}</p>
        </div>
      </button>
      <div className="flex gap-2 border-t border-white/10 p-3">
        <button type="button" onClick={onOpen} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3! py-2.5! text-sm! font-semibold text-white">
          <Eye size={14} /> Details
        </button>
        {booking.status === "pending_payment" && (
          <button type="button" onClick={onPay} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-3! py-2.5! text-sm! font-semibold text-black">
            <CreditCard size={14} /> Pay deposit
          </button>
        )}
      </div>
    </article>
  );
};

const BookingsTable = ({
  bookings,
  onOpen,
  onPay,
}: {
  bookings: Booking[];
  onOpen: (booking: Booking) => void;
  onPay: (booking: Booking) => void;
}) => (
  <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
    <div className="grid grid-cols-[minmax(260px,1.25fr)_minmax(180px,.8fr)_minmax(170px,.75fr)_minmax(170px,.7fr)] border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500">
      <span>Flash</span><span>Appointment</span><span>Status</span><span className="text-right">Actions</span>
    </div>
    <div className="divide-y divide-white/10">
      {bookings.map((booking) => {
        const imageUrl = getFlashImageUrl(booking);
        return (
          <div key={booking.id} className="grid grid-cols-[minmax(260px,1.25fr)_minmax(180px,.8fr)_minmax(170px,.75fr)_minmax(170px,.7fr)] items-center px-4 py-4 hover:bg-white/[0.025]">
            <button type="button" onClick={() => onOpen(booking)} className="flex min-w-0 items-center gap-3 p-0! text-left">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.035]">
                {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-neutral-500"><ImageIcon size={18} /></span>}
              </div>
              <div className="min-w-0"><p className="truncate font-semibold text-white">{booking.flashTitle || "Flash tattoo"}</p><p className="mt-1 truncate text-sm text-neutral-400">{booking.artistName}</p></div>
            </button>
            <div><p className="text-sm font-medium text-white">{formatAppointment(booking.selectedDate, "compact")}</p><p className="mt-1 text-xs text-neutral-500">{booking.shopName || "Shop pending review"}</p></div>
            <StatusBadge booking={booking} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => onOpen(booking)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white"><Eye size={14} /> Details</button>
              {booking.status === "pending_payment" && <button type="button" onClick={() => onPay(booking)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3! text-xs! font-semibold text-black"><CreditCard size={14} /> Pay deposit</button>}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const BookingDetailsDialog = ({
  booking,
  onClose,
  onPay,
}: {
  booking: Booking | null;
  onClose: () => void;
  onPay: (bookingId: string) => void;
}) => (
  <Transition appear show={!!booking} as={Fragment}>
    <Dialog as="div" className="relative z-[100]" onClose={onClose}>
      <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />
      </Transition.Child>
      <div className="fixed inset-0 overflow-y-auto request-modal-scrollbar">
        <div className="flex min-h-full items-start justify-center p-3 pt-[calc(5.25rem+env(safe-area-inset-top))] sm:items-center sm:p-6">
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="scale-95 opacity-0" enterTo="scale-100 opacity-100" leave="ease-in duration-150" leaveFrom="scale-100 opacity-100" leaveTo="scale-95 opacity-0">
            <Dialog.Panel className="w-full max-w-4xl overflow-hidden rounded-lg border border-white/10 bg-[#111111] text-white shadow-2xl">
              {booking && (
                <>
                  <header className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-4 py-4 sm:px-6">
                    <div><p className="text-xs uppercase tracking-[0.18em] text-white/45">Flash booking</p><Dialog.Title className="mt-1 text-xl! font-semibold! text-white">{booking.flashTitle || "Your flash appointment"}</Dialog.Title></div>
                    <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0!" aria-label="Close booking details"><X size={18} /></button>
                  </header>
                  <div className="grid lg:grid-cols-[.8fr_1.2fr]">
                    <div className="border-b border-white/10 bg-black lg:border-b-0 lg:border-r">
                      {getFlashImageUrl(booking) ? <img src={getFlashImageUrl(booking)} alt={booking.flashTitle || "Flash tattoo"} className="max-h-[46vh] min-h-[260px] w-full object-contain lg:max-h-[70vh]" /> : <div className="flex min-h-[260px] items-center justify-center text-neutral-500"><ImageIcon size={32} /></div>}
                    </div>
                    <div className="p-4 sm:p-6">
                      <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><img src={booking.artistAvatar || "/default-avatar.png"} alt="" className="h-12 w-12 rounded-full border border-white/10 object-cover" /><div className="min-w-0"><p className="truncate font-semibold">{booking.artistName}</p><p className="truncate text-sm text-neutral-500">{booking.shopName || "Shop pending review"}</p></div></div><StatusBadge booking={booking} /></div>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <DetailTile icon={<CalendarDays size={16} />} label="Appointment" value={formatAppointment(booking.selectedDate)} />
                        <DetailTile icon={<DollarSign size={16} />} label="Flash price" value={formatMoney(getPriceCents(booking))} />
                        <DetailTile icon={<CreditCard size={16} />} label="Booking deposit" value={formatMoney(getDepositCents(booking))} />
                        <DetailTile icon={<Store size={16} />} label="After appointment" value={`${formatMoney(getShopBalanceCents(booking))} at the shop`} />
                      </div>
                      {booking.shopAddress && <a href={booking.shopMapLink || undefined} target="_blank" rel="noopener noreferrer" className="mt-4 flex gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300"><MapPin size={17} className="mt-0.5 shrink-0 text-neutral-500" />{booking.shopAddress}</a>}
                      <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-4">
                        <div className="flex items-start gap-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" /><div><p className="text-sm font-semibold">Simple payment plan</p><p className="mt-1 text-sm leading-6 text-neutral-400">Your deposit secures the appointment. The remaining balance is paid directly to the artist at the shop after the appointment.</p></div></div>
                      </div>
                      {booking.status === "pending_payment" && <button type="button" onClick={() => onPay(booking.id)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black"><CreditCard size={16} /> Pay booking deposit</button>}
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

const DashboardHeader = ({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) => <div><p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">{eyebrow}</p><h1 className="mt-2 text-3xl! font-semibold text-white">{title}</h1><p className="mt-2 max-w-2xl text-sm text-neutral-400">{description}</p></div>;
const MetricCard = ({ label, value }: { label: string; value: number }) => <div className="min-w-0 px-2.5! py-1! sm:px-3!"><p className="truncate text-[9px]! uppercase tracking-[0.1em] text-neutral-500 sm:text-[10px]! sm:tracking-[0.14em]">{label}</p><p className="mt-1 truncate text-base! font-semibold leading-none text-white sm:text-lg!">{value}</p></div>;
const DetailTile = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => <div className="rounded-lg border border-white/10 bg-black/25 p-3"><div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-neutral-500">{icon}{label}</div><p className="mt-2 text-sm font-medium text-white">{value}</p></div>;
const EmptyState = ({ icon, title, description }: { icon: ReactNode; title: string; description: string }) => <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">{icon}</div><h2 className="mt-4 text-xl! font-semibold! text-white">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">{description}</p></div>;
const SectionSkeleton = () => <div className="mt-6 space-y-4"><div className="h-24 animate-pulse rounded-lg bg-white/[0.04]" /><div className="h-64 animate-pulse rounded-lg bg-white/[0.04]" /></div>;

const StatusBadge = ({ booking }: { booking: Booking }) => {
  const cancelled = booking.status === "cancelled";
  const paymentExpired =
    booking.cancellationReason === "deposit_payment_window_expired";
  const completed = booking.appointmentStatus === "completed";
  const inProgress = booking.appointmentStatus === "in_progress";
  const label = cancelled ? paymentExpired ? "Payment window expired" : "Cancelled" : booking.status === "pending_payment" ? "Deposit due" : booking.status === "paid" || booking.shopBalanceStatus === "paid" ? "Paid" : completed ? "Completed" : inProgress ? "In progress" : "Booked";
  const tone = cancelled ? "border-neutral-400/20 bg-neutral-400/10 text-neutral-300" : booking.status === "pending_payment" ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  return <span className={`inline-flex w-fit shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>{label}</span>;
};

const formatAppointment = (date?: { date: string; time: string }, mode: "compact" | "long" = "long") => {
  if (!date?.date || !date?.time) return "Time to be confirmed";
  const parsed = new Date(`${date.date}T${date.time}`);
  if (Number.isNaN(parsed.getTime())) return `${date.date} at ${date.time}`;
  return parsed.toLocaleString("en-US", { month: mode === "compact" ? "short" : "long", day: "numeric", year: mode === "compact" ? undefined : "numeric", hour: "numeric", minute: "2-digit" });
};
const getBookingTime = (booking: Booking) => booking.selectedDate?.date && booking.selectedDate?.time ? new Date(`${booking.selectedDate.date}T${booking.selectedDate.time}`).getTime() || 0 : 0;
const getFlashImageUrl = (booking: Booking) => booking.thumbUrl || booking.flashImageUrl || booking.fullUrl || booking.sampleImageUrl || "";
const getPriceCents = (booking: Booking) => Number(booking.priceCents || booking.totalAmountCents || Math.round(Number(booking.price || 0) * 100));
const getDepositCents = (booking: Booking) => Number(booking.depositAmountCents || Math.round(Number(booking.depositAmount || 0) * 100));
const getShopBalanceCents = (booking: Booking) => Number(booking.shopBalanceAmountCents ?? Math.max(getPriceCents(booking) - getDepositCents(booking), 0));
const formatMoney = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

type SyncPaymentResponse = { paid?: boolean; status?: Booking["status"] };
const reconcilePendingPayments = async (bookings: Booking[]) => Promise.all(bookings.map(async (booking) => {
  if (booking.status !== "pending_payment" || !booking.stripeCheckoutSessionId) return booking;
  try {
    const syncPayment = httpsCallable<{ bookingId: string }, SyncPaymentResponse>(functions, "syncBookingPaymentStatus");
    const result = await syncPayment({ bookingId: booking.id });
    return result.data.status ? { ...booking, status: result.data.status } : booking;
  } catch (error) {
    console.warn("Could not reconcile flash deposit status:", error);
    return booking;
  }
}));

export default ClientBookingsList;
