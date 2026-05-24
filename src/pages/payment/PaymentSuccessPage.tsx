import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { toast } from "react-hot-toast";
import {
  CalendarDays,
  CheckCircle2,
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

const PaymentSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  const bookingId = searchParams.get("bookingId");

  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingId) return;

      try {
        try {
          const syncPayment = httpsCallable(functions, "syncBookingPaymentStatus");
          await syncPayment({ bookingId });
        } catch (syncError) {
          console.warn("Payment status sync failed:", syncError);
        }

        const ref = doc(db, "bookings", bookingId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          toast.error("Booking not found.");
          navigate("/dashboard");
          return;
        }

        setBooking({ id: snap.id, ...snap.data() } as Booking);
        setLoading(false);
      } catch (err) {
        console.error(err);
        toast.error("Error loading booking.");
        navigate("/dashboard");
      }
    };

    fetchBooking();
  }, [bookingId, navigate]);

  if (loading) {
    return (
      <SuccessShell>
        <div className="mx-auto max-w-4xl rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center text-white">
          Verifying payment...
        </div>
      </SuccessShell>
    );
  }

  if (!booking) {
    return (
      <SuccessShell>
        <div className="mx-auto max-w-4xl rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center text-white">
          Booking not found or failed to load.
        </div>
      </SuccessShell>
    );
  }

  const price = Number(booking.price || 0);
  const latestArtistPayment =
    booking.artistQuotedAmount ?? Number(booking.depositAmount || booking.price || 0);
  const isDepositPaid = booking.status === "deposit_paid";
  const remainingBalanceCents =
    booking.remainingBalanceCents ??
    Math.max(Math.round((price - Number(booking.totalArtistPaidAmount || 0)) * 100), 0);
  const fallbackBreakdown = calculateClientPaymentBreakdown(latestArtistPayment, {
    platformFeeBaseAmount: price,
    platformFeeCentsOverride: booking.checkoutPaymentMode === "remaining" ? 0 : undefined,
  });
  const artistReceivesCents =
    booking.artistQuotedAmountCents ?? fallbackBreakdown.artistAmountCents;
  const clientTotalCents =
    booking.clientPaymentAmountCents ?? fallbackBreakdown.clientTotalCents;

  return (
    <SuccessShell>
      <section className="mx-auto w-full max-w-6xl overflow-hidden rounded-lg border border-white/10 bg-[#111111] text-white shadow-2xl">
        <div className="border-b border-white/10 bg-white/[0.03] p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-300/10 text-emerald-100">
                <CheckCircle2 size={30} />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
                  {isDepositPaid ? "Deposit confirmed" : "Payment complete"}
                </p>
                <h1 className="mt-1 text-2xl! font-semibold text-white">
                  {isDepositPaid
                    ? "Your appointment is secured"
                    : "Your booking is paid in full"}
                </h1>
                <p className="mt-1 text-sm text-neutral-400">
                  {isDepositPaid
                    ? `${booking.artistName} has your deposit and appointment details.`
                    : `${booking.artistName} has your payment and appointment details.`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center justify-center rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85"
            >
              Return to dashboard
            </button>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-white/10 bg-black lg:border-b-0 lg:border-r">
            {booking.sampleImageUrl ? (
              <img
                src={booking.sampleImageUrl}
                alt="Tattoo sample"
                className="h-full max-h-[72vh] min-h-[390px] w-full object-contain"
              />
            ) : (
              <div className="flex min-h-[390px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
                <ImageIcon size={34} />
                <span>No sample image uploaded</span>
              </div>
            )}
          </div>

          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-4">
              <img
                src={booking.artistAvatar || "/default-avatar.png"}
                alt={booking.artistName}
                className="h-14 w-14 rounded-full border border-white/10 object-cover"
              />
              <div>
                <p className="font-semibold text-white">{booking.artistName}</p>
                <p className="text-sm text-neutral-500">
                  {booking.shopName || "Studio not listed"}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <DetailTile
                icon={<DollarSign size={17} />}
                label={booking.checkoutPaymentMode === "remaining" ? "Balance paid" : "Artist payment"}
                value={formatMoneyFromCents(artistReceivesCents)}
              />
              <DetailTile
                icon={<DollarSign size={17} />}
                label="Paid today"
                value={formatMoneyFromCents(clientTotalCents)}
              />
              <DetailTile
                icon={<DollarSign size={17} />}
                label="Remaining balance"
                value={formatMoneyFromCents(remainingBalanceCents)}
              />
              <DetailTile
                icon={<CalendarDays size={17} />}
                label="Appointment"
                value={formatAppointment(booking.selectedDate)}
              />
              <DetailTile
                icon={<Store size={17} />}
                label="Studio"
                value={booking.shopName || "Unavailable"}
              />
            </div>

            {booking.shopAddress && (
              <a
                href={booking.shopMapLink || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300 transition hover:bg-white/[0.06]"
              >
                <MapPin size={17} className="mt-0.5 text-neutral-500" />
                {booking.shopAddress}
              </a>
            )}

            <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-100">
                <ShieldCheck size={17} />
                What happens next
              </div>
              <p className="text-sm leading-6 text-emerald-50/80">
                {isDepositPaid
                  ? "Your booking is now confirmed in your dashboard. You can pay the remaining balance there when you are ready."
                  : "Your booking is now paid in full and available in your dashboard with the appointment details."}
              </p>
            </div>
          </div>
        </div>
      </section>
    </SuccessShell>
  );
};

const SuccessShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#121212] px-4 py-24">
    {children}
  </div>
);

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

const formatAppointment = (date: { date: string; time: string }) => {
  if (!date?.date || !date?.time || date.date === "TBD") return "TBD";
  const [year, month, day] = date.date.split("-").map(Number);
  const [hours, minutes] = date.time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default PaymentSuccessPage;
