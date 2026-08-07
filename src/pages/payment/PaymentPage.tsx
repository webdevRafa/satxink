import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import toast from "react-hot-toast";
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  DollarSign,
  ImageIcon,
  MapPin,
  ShieldCheck,
  Store,
} from "lucide-react";
import { db, functions } from "../../firebase/firebaseConfig";
import type { Booking } from "../../types/Booking";
import {
  calculateClientPaymentBreakdown,
  formatMoneyFromCents,
} from "../../utils/paymentFees";

const PaymentPage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  useEffect(() => {
    if (!bookingId) return undefined;
    return onSnapshot(
      doc(db, "bookings", bookingId),
      (snapshot) => {
        if (!snapshot.exists()) {
          toast.error("Booking not found.");
          navigate("/dashboard");
          return;
        }
        setBooking({ id: snapshot.id, ...snapshot.data() } as Booking);
        setLoading(false);
      },
      (error) => {
        console.error("Could not load flash booking:", error);
        toast.error("Could not load this booking.");
        navigate("/dashboard");
      }
    );
  }, [bookingId, navigate]);

  const depositCents = Math.max(
    Number(booking?.depositAmountCents) ||
      Math.round(Number(booking?.depositAmount || 0) * 100),
    0
  );
  const priceCents = Math.max(
    Number(booking?.totalAmountCents || booking?.priceCents) ||
      Math.round(Number(booking?.price || 0) * 100),
    0
  );
  const shopBalanceCents = Math.max(
    Number(booking?.shopBalanceAmountCents) || priceCents - depositCents,
    0
  );
  const breakdown = useMemo(
    () =>
      calculateClientPaymentBreakdown(depositCents / 100, {
        platformFeeBaseAmount: priceCents / 100,
      }),
    [depositCents, priceCents]
  );
  const depositIsDue = booking?.status === "pending_payment";
  const depositIsPaid = Boolean(
    booking &&
      ["deposit_paid", "confirmed", "paid"].includes(booking.status)
  );

  const handleCheckout = async () => {
    if (!booking || booking.sourceType !== "flash" || !booking.flashId) {
      toast.error("This checkout is available only for flash bookings.");
      return;
    }
    if (!depositIsDue) {
      navigate("/dashboard?tab=bookings");
      return;
    }

    try {
      setIsStartingCheckout(true);
      const toastId = toast.loading("Opening secure Stripe checkout…");
      const createSession = httpsCallable(functions, "createCheckoutSession");
      const response = await createSession({
        bookingId: booking.id,
        paymentMode: "deposit",
        successUrl: `${window.location.origin}/payment-success?bookingId=${booking.id}`,
        cancelUrl: `${window.location.origin}/payment/${booking.id}`,
      });
      const { sessionUrl } = response.data as { sessionUrl?: string };
      toast.dismiss(toastId);
      if (!sessionUrl) throw new Error("Stripe checkout URL was not returned.");
      window.location.assign(sessionUrl);
    } catch (error) {
      console.error("Could not start flash deposit checkout:", error);
      toast.dismiss();
      toast.error("Could not open Stripe checkout. Please try again.");
      setIsStartingCheckout(false);
    }
  };

  if (loading) {
    return <PaymentShell><div className="mx-auto max-w-3xl rounded-xl border border-white/10 bg-white/[0.03] p-10 text-center text-neutral-300">Loading payment details…</div></PaymentShell>;
  }
  if (!booking) return null;

  if (booking.sourceType !== "flash" || !booking.flashId) {
    return (
      <PaymentShell>
        <div className="mx-auto max-w-xl rounded-xl border border-white/10 bg-[#121212] p-6 text-center text-white">
          <h1 className="text-2xl! font-semibold!">Checkout unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">SATX Ink checkout now supports flash booking deposits only. Your historical record remains available from the dashboard.</p>
          <Link to="/dashboard" className="mt-5 inline-flex rounded-lg bg-white px-4! py-2.5! text-sm! font-semibold text-black">Return to dashboard</Link>
        </div>
      </PaymentShell>
    );
  }

  const imageUrl = booking.thumbUrl || booking.flashImageUrl || booking.fullUrl || booking.sampleImageUrl || "";

  return (
    <PaymentShell>
      <section className="mx-auto w-full max-w-4xl">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121212] text-white shadow-2xl">
          <header className="flex flex-col gap-4 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-3">
              <img src={booking.artistAvatar || "/default-avatar.png"} alt="" className="h-12 w-12 rounded-full border border-white/10 object-cover" />
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">Flash deposit</p><h1 className="mt-1 text-xl! font-semibold! text-white">Secure your appointment with {booking.artistName}</h1></div>
            </div>
            <StatusBadge paid={depositIsPaid} cancelled={booking.status === "cancelled"} />
          </header>

          <div className="grid md:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
            <div className="border-b border-white/10 bg-black/25 p-4 md:border-b-0 md:border-r md:p-6">
              <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-xl bg-black">
                {imageUrl ? <img src={imageUrl} alt={booking.flashTitle || "Selected flash"} className="max-h-[420px] w-full object-contain" /> : <ImageIcon size={28} className="text-neutral-600" />}
              </div>
              <h2 className="mt-4 text-xl! font-semibold! text-white">{booking.flashTitle || "Selected flash"}</h2>
              <p className="mt-1 text-sm text-neutral-400">{booking.shopName || "Shop pending review"}</p>
            </div>

            <div className="p-4 sm:p-6">
              <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100"><ShieldCheck size={17} />Deposit secures this booking</div>
                <p className="mt-2 text-sm leading-6 text-neutral-300">Stripe collects the non-refundable deposit today. The remaining balance is settled directly with the artist at the shop after the appointment.</p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <DetailTile icon={<DollarSign size={16} />} label="Flash price" value={formatMoneyFromCents(priceCents)} />
                <DetailTile icon={<CalendarDays size={16} />} label="Appointment" value={formatAppointment(booking.selectedDate)} />
                <DetailTile icon={<CreditCard size={16} />} label="Deposit to artist" value={formatMoneyFromCents(depositCents)} />
                <DetailTile icon={<Store size={16} />} label="Paid at shop" value={formatMoneyFromCents(shopBalanceCents)} />
              </div>

              {booking.shopAddress && <a href={booking.shopMapLink || undefined} target="_blank" rel="noreferrer" className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-neutral-300 hover:bg-white/[0.05]"><MapPin size={16} className="mt-0.5 shrink-0 text-neutral-500" />{booking.shopAddress}</a>}

              <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
                <p className="mb-3 text-sm font-semibold text-white">Today’s Stripe checkout</p>
                <div className="space-y-2 text-sm"><BreakdownRow label="Deposit to artist" value={formatMoneyFromCents(breakdown.artistAmountCents)} /><BreakdownRow label="SATX Ink platform fee" value={formatMoneyFromCents(breakdown.platformFeeCents)} /><BreakdownRow label="Estimated Stripe processing" value={formatMoneyFromCents(breakdown.stripeFeeCents)} /><div className="border-t border-white/10 pt-2"><BreakdownRow strong label="Total due today" value={formatMoneyFromCents(breakdown.clientTotalCents)} /></div></div>
              </div>

              <button type="button" onClick={handleCheckout} disabled={isStartingCheckout || booking.status === "cancelled"} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5! py-3! text-sm! font-semibold text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-55">
                {booking.status === "cancelled" ? "Booking cancelled" : depositIsPaid ? "Return to bookings" : isStartingCheckout ? "Opening Stripe…" : "Pay deposit securely"}
                {depositIsPaid ? <CheckCircle2 size={16} /> : <CreditCard size={16} />}
              </button>
              <p className="mt-3 text-xs leading-5 text-neutral-500">By continuing, you agree to the <Link to="/terms" target="_blank" className="text-neutral-300 underline">Terms of Service</Link>.</p>
            </div>
          </div>
        </div>
      </section>
    </PaymentShell>
  );
};

const PaymentShell = ({ children }: { children: ReactNode }) => <main className="min-h-dvh bg-gradient-to-b from-[#121212] via-[#0d0d0d] to-[#121212] px-3 pb-8 pt-[calc(env(safe-area-inset-top)+5rem)] sm:px-5 sm:pt-24">{children}</main>;
const DetailTile = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => <div className="rounded-xl border border-white/10 bg-black/25 p-3"><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-neutral-500">{icon}{label}</p><p className="mt-2 text-sm font-medium text-white">{value}</p></div>;
const BreakdownRow = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => <div className="flex items-center justify-between gap-4"><span className={strong ? "font-semibold text-white" : "text-neutral-400"}>{label}</span><span className={strong ? "font-semibold text-white" : "text-neutral-200"}>{value}</span></div>;
const StatusBadge = ({ paid, cancelled }: { paid: boolean; cancelled: boolean }) => <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${cancelled ? "border-red-300/20 bg-red-300/10 text-red-100" : paid ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" : "border-amber-300/20 bg-amber-300/10 text-amber-100"}`}>{cancelled ? "Cancelled" : paid ? "Deposit paid" : "Deposit due"}</span>;
const formatAppointment = (value: { date: string; time: string }) => { if (!value?.date || !value?.time || value.date === "TBD") return "To be confirmed"; const date = new Date(`${value.date}T${value.time}`); return Number.isNaN(date.getTime()) ? `${value.date} at ${value.time}` : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date); };

export default PaymentPage;
