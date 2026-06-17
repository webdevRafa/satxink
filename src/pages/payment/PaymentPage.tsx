import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { toast } from "react-hot-toast";
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  DollarSign,
  ImageIcon,
  Layers,
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

type PaymentMode = "deposit" | "full" | "remaining" | "platform_fee";

const getExternalPaymentMethodSummary = (booking: Booking) => {
  const methods = Array.isArray(booking.externalRemainingPaymentMethods)
    ? booking.externalRemainingPaymentMethods.filter((method) =>
        method.handle?.trim()
      )
    : [];

  if (methods.length) {
    return methods
      .map((method) => `${method.label}: ${method.handle}`)
      .join(" · ");
  }

  if (booking.externalPaymentDetails?.method && booking.externalPaymentDetails.handle) {
    return `${booking.externalPaymentDetails.method}: ${booking.externalPaymentDetails.handle}`;
  }

  return "Confirm payment details with your artist.";
};

const getFinalPaymentTermsLabel = (booking: Booking) => {
  if (booking.finalPaymentTiming !== "before") return "After appointment";
  const deadlineHours = booking.finalPaymentDeadlineHours === 48 ? 48 : 24;
  return `${deadlineHours} hours before`;
};

const PaymentPage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("deposit");
  const [sessionPaymentAmount, setSessionPaymentAmount] = useState("");

  useEffect(() => {
    if (!bookingId) return;

    const ref = doc(db, "bookings", bookingId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          toast.error("Booking not found.");
          navigate("/dashboard");
          return;
        }

        setBooking({ id: snap.id, ...snap.data() } as Booking);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        toast.error("Error loading booking.");
        navigate("/dashboard");
      }
    );

    return () => unsubscribe();
  }, [bookingId, navigate]);

  useEffect(() => {
    if (!booking) return;
    const price = Number(booking.price || 0);
    const deposit = Number(booking.depositAmount || price);
    const hasPendingPlatformFee =
      booking.remainingPaymentMethod === "external" &&
      Number(booking.pendingPlatformFeeCents || 0) > 0;
    setPaymentMode(
      hasPendingPlatformFee
        ? "platform_fee"
        : booking.status === "deposit_paid" &&
          booking.remainingPaymentMethod !== "external"
        ? "remaining"
        : deposit >= price
        ? "full"
        : "deposit"
    );
    if (
      booking.status === "deposit_paid" &&
      booking.remainingPaymentMethod !== "external" &&
      isMultiSessionBooking(booking)
    ) {
      setSessionPaymentAmount(String(getSessionInstallmentAmount(booking)));
    }
  }, [booking]);

  const handleCheckout = async () => {
    if (!booking) return;

    const hasPendingPlatformFee =
      booking.remainingPaymentMethod === "external" &&
      Number(booking.pendingPlatformFeeCents || 0) > 0;
    const checkoutPaymentMode: PaymentMode = hasPendingPlatformFee
      ? "platform_fee"
      : paymentMode;

    if (
      booking.status === "paid" ||
      booking.status === "confirmed" ||
      booking.status === "cancelled"
    ) {
      if (checkoutPaymentMode !== "platform_fee" || booking.status === "cancelled") {
        navigate("/dashboard");
        return;
      }
    }

    if (
      booking.status === "deposit_paid" &&
      booking.remainingPaymentMethod === "external" &&
      checkoutPaymentMode !== "platform_fee"
    ) {
      toast.success("Your remaining balance will be settled with the artist.");
      navigate("/dashboard");
      return;
    }

    if (
      booking.status === "deposit_paid" &&
      isMultiSessionBooking(booking) &&
      checkoutPaymentMode === "remaining" &&
      Number(booking.pendingSessionPaymentAmount || 0) <= 0
    ) {
      toast.error("The next session payment is not ready yet.");
      navigate("/dashboard");
      return;
    }

    try {
      const sessionMinimum =
        checkoutPaymentMode === "remaining" && isMultiSessionBooking(booking)
          ? getSessionInstallmentAmount(booking)
          : 0;
      const sessionAmount =
        checkoutPaymentMode === "remaining" && isMultiSessionBooking(booking)
          ? Number(sessionPaymentAmount || 0)
          : 0;

      if (sessionMinimum > 0 && sessionAmount < sessionMinimum) {
        toast.error(
          `Enter at least ${formatMoneyFromCents(
            Math.round(sessionMinimum * 100)
          )} for this session.`
        );
        return;
      }

      if (sessionAmount > getRemainingBalance(booking)) {
        toast.error("Payment cannot exceed the remaining project balance.");
        return;
      }

      setIsStartingCheckout(true);
      toast.loading("Redirecting to Stripe...");

      const createSession = httpsCallable(functions, "createCheckoutSession");
      const response = await createSession({
        bookingId: booking.id,
        paymentMode: checkoutPaymentMode,
        sessionPaymentAmountCents:
          checkoutPaymentMode === "remaining" && isMultiSessionBooking(booking)
            ? Math.round(sessionAmount * 100)
            : undefined,
        successUrl: `${window.location.origin}/payment-success?bookingId=${booking.id}`,
        cancelUrl: `${window.location.origin}/payment/${booking.id}`,
      });

      const { sessionUrl } = response.data as { sessionUrl: string };
      toast.dismiss();
      window.location.href = sessionUrl;
    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error("Failed to start checkout.");
      setIsStartingCheckout(false);
    }
  };

  if (loading) {
    return (
      <PaymentShell>
        <div className="mx-auto max-w-4xl rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center text-white">
          Loading payment details...
        </div>
      </PaymentShell>
    );
  }

  if (!booking) {
    return (
      <PaymentShell>
        <div className="mx-auto max-w-4xl rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center text-white">
          Booking not found or failed to load.
        </div>
      </PaymentShell>
    );
  }

  const isInternalPayment = booking.paymentType === "internal";
  const isPaid = booking.status === "paid" || booking.status === "confirmed";
  const price = Number(booking.price || 0);
  const deposit = Math.min(Number(booking.depositAmount || price), price);
  const alreadyPaid = Number(booking.totalArtistPaidAmount || 0);
  const externalRemainingAmount =
    typeof booking.externalRemainingAmount === "number"
      ? Math.max(booking.externalRemainingAmount, 0)
      : Math.max(price - deposit, 0);
  const pendingPlatformFeeCents = Math.max(
    Number(booking.pendingPlatformFeeCents || 0),
    0
  );
  const usesExternalRemaining =
    booking.remainingPaymentMethod === "external" && externalRemainingAmount > 0;
  const isPlatformFeeCheckout =
    usesExternalRemaining &&
    pendingPlatformFeeCents > 0 &&
    paymentMode === "platform_fee";
  const isMultiSession = isMultiSessionBooking(booking);
  const sessionInstallmentAmount = getSessionInstallmentAmount(booking);
  const sessionPaymentLabel = isMultiSession
    ? `${getSessionOrdinal(getPayableSessionNumber(booking))} session`
    : "";
  const customSessionPaymentAmount =
    isMultiSession && paymentMode === "remaining"
      ? Math.min(
          Math.max(Number(sessionPaymentAmount || sessionInstallmentAmount), 0),
          getRemainingBalance(booking)
        )
      : sessionInstallmentAmount;
  const externalBalanceDue =
    usesExternalRemaining && booking.status === "deposit_paid";
  const artistAmountDue =
    isPlatformFeeCheckout || externalBalanceDue
      ? 0
      : paymentMode === "full"
      ? price
      : paymentMode === "remaining"
      ? isMultiSession
        ? customSessionPaymentAmount
        : Math.max(Number(booking.remainingBalanceAmount ?? price - alreadyPaid), 0)
      : deposit;
  const paymentBreakdown = calculateClientPaymentBreakdown(artistAmountDue, {
    platformFeeBaseAmount: price,
    platformFeeCentsOverride:
      paymentMode === "platform_fee" || paymentMode === "remaining"
        ? pendingPlatformFeeCents
        : undefined,
  });
  const remainingAfterPayment =
    paymentMode === "deposit" ? Math.max(price - deposit, 0) : 0;
  const depositBreakdown = calculateClientPaymentBreakdown(deposit, {
    platformFeeBaseAmount: price,
  });
  const fullBreakdown = calculateClientPaymentBreakdown(price, {
    platformFeeBaseAmount: price,
  });
  const remainingLaterBreakdown = calculateClientPaymentBreakdown(
    remainingAfterPayment,
    { platformFeeCentsOverride: 0 }
  );
  const splitPaymentTotalCents =
    depositBreakdown.clientTotalCents + remainingLaterBreakdown.clientTotalCents;
  const splitPaymentDifferenceCents = Math.max(
    splitPaymentTotalCents - fullBreakdown.clientTotalCents,
    0
  );
  const paymentOptions =
    booking.status === "deposit_paid"
      ? []
      : [
          ...(deposit < price
            ? [
                {
                  mode: "deposit" as PaymentMode,
                  title: "Pay deposit",
                  description:
                    usesExternalRemaining
                      ? "Confirm the appointment now and pay the artist balance through the artist's external methods."
                      : "Confirm the appointment now and pay the artist balance later.",
                  breakdown: depositBreakdown,
                },
              ]
            : []),
          ...(!usesExternalRemaining
            ? [
                {
                  mode: "full" as PaymentMode,
                  title: "Pay in full",
                  description: "Take care of the full artist quote in one checkout.",
                  breakdown: fullBreakdown,
                },
              ]
            : []),
        ];

  return (
    <PaymentShell>
      <section className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-lg border border-white/10 bg-[#111111] text-white shadow-2xl lg:grid-cols-[0.95fr_1.05fr]">
        <div className="border-b border-white/10 bg-black lg:border-b-0 lg:border-r">
          {booking.sampleImageUrl ? (
            <img
              src={booking.sampleImageUrl}
              alt="Tattoo sample"
              className="h-full max-h-[78vh] min-h-[420px] w-full object-contain"
            />
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
              <ImageIcon size={34} />
              <span>No sample image uploaded</span>
            </div>
          )}
        </div>

        <div className="p-5 sm:p-7">
          <div className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <img
                src={booking.artistAvatar || "/default-avatar.png"}
                alt={booking.artistName}
                className="h-16 w-16 rounded-full border border-white/10 object-cover"
              />
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
                  Booking payment
                </p>
                <h1 className="mt-1 text-2xl! font-semibold text-white">
                  Confirm with {booking.artistName}
                </h1>
                <p className="mt-1 text-sm text-neutral-500">
                  {booking.shopName || "Studio not listed"}
                </p>
              </div>
            </div>
            <StatusBadge status={booking.status} />
          </div>

          {isInternalPayment && !isPaid && booking.status !== "cancelled" && (
            <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4">
                <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                  Payment choice
                </p>
                <h2 className="mt-1 text-lg! font-semibold text-white">
                  {booking.status === "deposit_paid"
                    ? isPlatformFeeCheckout
                      ? "Platform fee due"
                      : usesExternalRemaining
                      ? "External balance"
                      : isMultiSession
                      ? `Pay ${sessionPaymentLabel}`
                      : "Pay remaining balance"
                    : "Choose how much to pay today"}
                </h2>
                <p className="mt-1 text-sm text-neutral-400">
                  {booking.status === "deposit_paid"
                    ? isPlatformFeeCheckout
                      ? "This fee covers the SATX Ink platform difference from your accepted project amendment."
                      : usesExternalRemaining
                      ? "Your appointment is confirmed with the deposit. The remaining artist balance is handled directly with the artist."
                      : isMultiSession
                      ? `Your appointment is confirmed. This checkout applies the ${sessionPaymentLabel} installment toward the project balance.`
                      : "Your appointment is confirmed. This payment clears the remaining artist balance."
                    : "Your artist receives the quoted amount for the option you choose. Service and card fees are shown below."}
                </p>
              </div>

              {paymentOptions.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {paymentOptions.map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => setPaymentMode(option.mode)}
                      className={`rounded-lg border p-4! text-left transition ${
                        paymentMode === option.mode
                          ? "border-emerald-300/45 bg-emerald-300/10"
                          : "border-white/10 bg-black/25 hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className="text-sm font-semibold text-white">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-neutral-400">
                        {option.description}
                      </span>
                      <span className="mt-3 block text-lg font-semibold text-white">
                        {formatMoneyFromCents(option.breakdown.clientTotalCents)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                  <p className="text-sm text-emerald-50/85">
                    {isPlatformFeeCheckout
                      ? "SATX Ink platform fee due today: "
                      : usesExternalRemaining
                      ? "Remaining balance to settle with the artist: "
                      : isMultiSession
                      ? "Next session installment: "
                      : "Remaining artist balance: "}
                    <span className="font-semibold text-white">
                      {formatMoneyFromCents(
                        Math.round(
                          (isPlatformFeeCheckout
                            ? pendingPlatformFeeCents / 100
                            : usesExternalRemaining
                            ? externalRemainingAmount
                            : paymentBreakdown.artistAmountCents / 100) * 100
                        )
                      )}
                    </span>
                  </p>
                  {isPlatformFeeCheckout ? (
                    <p className="mt-2 text-sm leading-6 text-emerald-50/75">
                      This covers the SATX Ink fee from the accepted project
                      amendment. Your artist balance is still settled directly
                      with the artist.
                    </p>
                  ) : usesExternalRemaining && (
                    <p className="mt-2 text-sm leading-6 text-emerald-50/75">
                      Both you and the artist will be able to confirm the
                      external payment after the session is completed.
                    </p>
                  )}
                </div>
              )}

              {booking.status === "deposit_paid" &&
                isMultiSession &&
                !usesExternalRemaining && (
                  <label className="mt-4 block space-y-2 rounded-lg border border-white/10 bg-black/25 p-4">
                    <span className="text-sm font-semibold text-white">
                      Session payment amount
                    </span>
                    <div className="relative">
                      <DollarSign
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                      />
                      <input
                        type="number"
                        min={sessionInstallmentAmount}
                        max={getRemainingBalance(booking)}
                        step="1"
                        value={sessionPaymentAmount}
                        onChange={(event) =>
                          setSessionPaymentAmount(event.target.value)
                        }
                        className="h-11 w-full rounded-md border border-white/10 bg-[#101010] pl-9 pr-3 text-sm text-white outline-none transition focus:border-emerald-300/70"
                      />
                    </div>
                    <p className="text-xs leading-5 text-neutral-400">
                      Minimum due for this session is{" "}
                      {formatMoneyFromCents(
                        Math.round(sessionInstallmentAmount * 100)
                      )}
                      . You can pay more to get ahead; the remaining balance
                      will be recalculated across the sessions left.
                    </p>
                  </label>
                )}

              {paymentMode === "deposit" && remainingAfterPayment > 0 && !usesExternalRemaining && (
                <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-4">
                  <p className="text-sm font-semibold text-amber-50">
                    Split-payment estimate
                  </p>
                  <p className="mt-1 text-sm leading-6 text-amber-50/80">
                    Paying the balance later creates a second Stripe checkout,
                    so the overall total is estimated at{" "}
                    <span className="font-semibold text-white">
                      {formatMoneyFromCents(splitPaymentTotalCents)}
                    </span>
                    , about{" "}
                    <span className="font-semibold text-white">
                      {formatMoneyFromCents(splitPaymentDifferenceCents)}
                    </span>{" "}
                    more than paying in full today.
                  </p>
                </div>
              )}
              {paymentMode === "deposit" && usesExternalRemaining && (
                <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-4">
                  <p className="text-sm font-semibold text-amber-50">
                    Deposit now, balance externally
                  </p>
                  <p className="mt-1 text-sm leading-6 text-amber-50/80">
                    SATX Ink's platform fee is calculated from the full artist
                    quote and collected today with your deposit. The remaining{" "}
                    <span className="font-semibold text-white">
                      {formatMoneyFromCents(Math.round(externalRemainingAmount * 100))}
                    </span>{" "}
                    is paid directly to the artist and confirmed after the
                    session.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-50/90">
                    Available methods:{" "}
                    <span className="font-semibold text-white">
                      {getExternalPaymentMethodSummary(booking)}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <DetailTile
              icon={<DollarSign size={17} />}
              label="Total due today"
              value={formatMoneyFromCents(paymentBreakdown.clientTotalCents)}
            />
            <DetailTile
              icon={<CalendarDays size={17} />}
              label="Appointment"
              value={formatAppointment(booking.selectedDate)}
            />
            <DetailTile
              icon={<CreditCard size={17} />}
              label="Payment"
              value={
                usesExternalRemaining
                  ? "Stripe deposit + external balance"
                  : isInternalPayment
                  ? "Stripe checkout"
                  : "External payment"
              }
            />
            <DetailTile
              icon={<ShieldCheck size={17} />}
              label="Final terms"
              value={getFinalPaymentTermsLabel(booking)}
            />
            {isMultiSession && (
              <DetailTile
                icon={<Layers size={17} />}
                label="Project sessions"
                value={`${booking.completedSessionCount || 0}/${
                  booking.estimatedSessionCount || 2
                } complete`}
              />
            )}
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

          <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck size={17} />
              Payment breakdown
            </div>
            <div className="space-y-2 text-sm">
              <BreakdownRow
                label={
                  isPlatformFeeCheckout
                    ? "Artist amount"
                    : externalBalanceDue
                    ? "External balance"
                    :
                  paymentMode === "full"
                    ? "Full artist amount"
                    : paymentMode === "remaining"
                    ? "Remaining artist balance"
                    : "Deposit to artist"
                }
                value={formatMoneyFromCents(
                  isPlatformFeeCheckout
                    ? 0
                    : externalBalanceDue
                    ? Math.round(externalRemainingAmount * 100)
                    : paymentBreakdown.artistAmountCents
                )}
              />
              <BreakdownRow
                label="SATX Ink platform fee"
                value={
                  isPlatformFeeCheckout
                    ? formatMoneyFromCents(pendingPlatformFeeCents)
                    : externalBalanceDue
                    ? "Collected with deposit"
                    : formatMoneyFromCents(paymentBreakdown.platformFeeCents)
                }
              />
              <BreakdownRow
                label="Estimated Stripe processing"
                value={
                  externalBalanceDue && !isPlatformFeeCheckout
                    ? "$0.00"
                    : formatMoneyFromCents(paymentBreakdown.stripeFeeCents)
                }
              />
              <div className="border-t border-white/10 pt-2">
                <BreakdownRow
                  label="Total due today"
                  value={formatMoneyFromCents(
                    externalBalanceDue && !isPlatformFeeCheckout
                      ? 0
                      : paymentBreakdown.clientTotalCents
                  )}
                  strong
                />
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              {paymentMode === "full" &&
                "This payment covers the full artist quote and secures your appointment."}
              {paymentMode === "remaining" &&
                (isMultiSession
                  ? "This payment applies one session installment toward your larger project balance."
                  : "This payment clears the remaining artist balance on your confirmed booking.")}
              {paymentMode === "deposit" && (
                <>
                  This non-refundable deposit secures your appointment. The
                  remaining artist balance is{" "}
                  <span className="font-semibold text-white">
                    {formatMoneyFromCents(Math.round(remainingAfterPayment * 100))}
                  </span>
                  {usesExternalRemaining
                    ? " and will be paid directly to the artist."
                    : booking.finalPaymentTiming === "before"
                    ? " and may be collected before your appointment."
                    : " and may be collected after the session with your artist."}
                  {!usesExternalRemaining &&
                    " A second checkout for that balance will include its own Stripe processing fee."}
                </>
              )}
            </p>
          </div>

          {booking.paymentType === "external" && booking.externalPaymentDetails ? (
            <div className="mt-5 rounded-lg border border-white/10 bg-black/25 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Store size={17} />
                External payment instructions
              </div>
              <p className="mt-3 text-sm capitalize text-neutral-300">
                {booking.externalPaymentDetails.method}
              </p>
              <p className="mt-1 text-lg font-semibold text-white">
                {booking.externalPaymentDetails.handle ||
                  "Contact your artist for payment details."}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isStartingCheckout}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPaid
                ? "Return to dashboard"
                : isStartingCheckout
                ? "Redirecting..."
                : booking.status === "deposit_paid"
                ? isPlatformFeeCheckout
                  ? "Pay platform fee"
                  : usesExternalRemaining
                  ? "Return to dashboard"
                  : isMultiSession
                  ? `Pay ${sessionPaymentLabel} installment`
                  : "Pay remaining balance"
                : paymentMode === "full"
                ? "Pay in full"
                : "Pay deposit"}
              {isPaid ? <CheckCircle2 size={16} /> : <CreditCard size={16} />}
            </button>
          )}

          <p className="mt-4 text-xs leading-5 text-neutral-500">
            By continuing, you agree to the{" "}
            <Link to="/terms" target="_blank" className="text-white underline">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </section>
    </PaymentShell>
  );
};

const PaymentShell = ({ children }: { children: React.ReactNode }) => (
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

const BreakdownRow = ({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <div className="flex items-center justify-between gap-4">
    <span className={strong ? "font-semibold text-white" : "text-neutral-400"}>
      {label}
    </span>
    <span className={strong ? "font-semibold text-white" : "text-neutral-200"}>
      {value}
    </span>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const className =
    status === "paid" || status === "confirmed" || status === "deposit_paid"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : status === "cancelled"
      ? "border-red-300/25 bg-red-300/10 text-red-100"
      : "border-amber-300/20 bg-amber-300/10 text-amber-100";
  const label = status === "deposit_paid" ? "deposit paid" : status.replace("_", " ");

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${className}`}>
      {label}
    </span>
  );
};

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

const getRemainingBalance = (booking: Booking) => {
  if (typeof booking.remainingBalanceAmount === "number") {
    return Math.max(booking.remainingBalanceAmount, 0);
  }

  return Math.max(
    Number(booking.price || 0) -
      Number(booking.totalArtistPaidAmount || booking.depositAmount || 0),
    0
  );
};

const isMultiSessionBooking = (booking: Booking) =>
  booking.projectType === "multi_session" ||
  Number(booking.estimatedSessionCount || 1) > 1;

const getPayableSessionNumber = (booking: Booking) =>
  Math.max(
    Number(booking.pendingSessionNumber || booking.activeSessionNumber || 1),
    1
  );

const getSessionOrdinal = (sessionNumber: number) => {
  const remainder = sessionNumber % 100;
  if (remainder >= 11 && remainder <= 13) return `${sessionNumber}th`;
  switch (sessionNumber % 10) {
    case 1:
      return `${sessionNumber}st`;
    case 2:
      return `${sessionNumber}nd`;
    case 3:
      return `${sessionNumber}rd`;
    default:
      return `${sessionNumber}th`;
  }
};

const getSessionInstallmentAmount = (booking: Booking) => {
  const remaining = getRemainingBalance(booking);
  const pending = Number(booking.pendingSessionPaymentAmount || 0);
  if (pending > 0) return Math.min(pending, remaining);

  const sessionsLeft = Math.max(
    Number(booking.estimatedSessionCount || 1) -
      Number(booking.completedSessionCount || 0),
    1
  );
  return Math.ceil(remaining / sessionsLeft);
};

export default PaymentPage;
