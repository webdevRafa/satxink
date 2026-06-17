import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { CalendarDays, CreditCard, DollarSign, Eye, ImageIcon, Layers, MapPin, Store, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { toast } from "react-hot-toast";
import { db, functions } from "../firebase/firebaseConfig";
import type { Booking, ProjectAmendment } from "../types/Booking";
import ProjectControlsPanel from "./ProjectControlsPanel";
import ProjectPauseDialog from "./ProjectPauseDialog";
import ProjectScheduleProposalDialog from "./ProjectScheduleProposalDialog";

interface Props {
  clientId: string;
}

const getFinalPaymentTermsLabel = (booking: Booking) => {
  if (booking.finalPaymentTiming !== "before") {
    return "After appointment";
  }

  const deadlineHours = booking.finalPaymentDeadlineHours === 48 ? 48 : 24;
  return `${deadlineHours} hours before`;
};

const ClientBookingsList: React.FC<Props> = ({ clientId }) => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [scheduleProposalBooking, setScheduleProposalBooking] =
    useState<Booking | null>(null);
  const [pauseDialogMode, setPauseDialogMode] =
    useState<"pause" | "resume" | null>(null);
  const [pendingAmendments, setPendingAmendments] = useState<ProjectAmendment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;

    let ignore = false;
    setLoading(true);
    const bookingsQuery = query(collection(db, "bookings"), where("clientId", "==", clientId));

    const unsubscribe = onSnapshot(
      bookingsQuery,
      async (snap) => {
        const data = snap.docs.map((bookingDoc) => ({
          id: bookingDoc.id,
          ...bookingDoc.data(),
        })) as Booking[];
        const reconciled = await reconcilePendingPayments(data);
        if (!ignore) {
          setBookings(reconciled);
          setLoading(false);
        }
      },
      (error) => {
        console.error("Error listening to client bookings:", error);
        setLoading(false);
      }
    );

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, [clientId]);

  useEffect(() => {
    if (!selectedBooking) {
      setPendingAmendments([]);
      return;
    }

    const amendmentsQuery = query(
      collection(db, "bookings", selectedBooking.id, "amendments"),
      where("status", "==", "proposed")
    );

    return onSnapshot(
      amendmentsQuery,
      (snap) => {
        setPendingAmendments(
          snap.docs.map((amendmentDoc) => ({
            id: amendmentDoc.id,
            ...amendmentDoc.data(),
          })) as ProjectAmendment[]
        );
      },
      (error) => {
        console.error("Error listening to project amendments:", error);
        setPendingAmendments([]);
      }
    );
  }, [selectedBooking]);

  const sortedBookings = useMemo(
    () => [...bookings].sort((a, b) => getBookingTime(b) - getBookingTime(a)),
    [bookings]
  );
  const upcomingCount = bookings.filter((booking) => booking.status !== "cancelled").length;
  const confirmedCount = bookings.filter((booking) =>
    ["deposit_paid", "paid", "confirmed"].includes(booking.status)
  ).length;

  const handleConfirmExternalPayment = async (booking: Booking) => {
    const artistAlreadyConfirmed =
      booking.remainingPaymentStatus === "artist_confirmed";

    if (!artistAlreadyConfirmed) {
      try {
        await setDoc(
          doc(db, "bookingSessions", booking.id),
          {
            bookingId: booking.id,
            artistId: booking.artistId,
            clientId: booking.clientId,
            remainingPaymentStatus: "client_confirmed",
            clientConfirmedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await updateDoc(doc(db, "bookings", booking.id), {
          remainingPaymentStatus: "client_confirmed",
          externalRemainingClientConfirmedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success("Payment confirmation sent to the artist.");
        setSelectedBooking(null);
      } catch (error) {
        console.error("Direct payment confirmation failed:", error);
        toast.error("Could not confirm the payment.");
      }
      return;
    }

    const remainingAmount = getRemainingBalance(booking);
    const sessionInstallment = getSessionInstallmentAmount(booking);
    const isMultiSession = isMultiSessionBooking(booking);
    const amountToConfirm = isMultiSession
      ? Math.min(sessionInstallment, remainingAmount)
      : remainingAmount;
    const currentPaid = Number(
      booking.totalArtistPaidAmount || booking.depositPaidAmount || booking.depositAmount || 0
    );
    const nextPaid = Math.min(Number(booking.price || 0), currentPaid + amountToConfirm);
    const nextRemaining = Math.max(Number(booking.price || 0) - nextPaid, 0);
    const sessionNumber = Math.max(Number(booking.pendingSessionNumber || booking.activeSessionNumber || 1), 1);
    const sessionCount = Math.max(Number(booking.estimatedSessionCount || 1), 1);
    const hasMoreSessions = isMultiSession && sessionNumber < sessionCount;

    try {
      await setDoc(
        doc(db, "bookingSessions", booking.id),
        {
          bookingId: booking.id,
          artistId: booking.artistId,
          clientId: booking.clientId,
          remainingPaymentStatus: "confirmed",
          sessionNumber,
          paidAmount: amountToConfirm,
          paidAmountCents: Math.round(amountToConfirm * 100),
          clientConfirmedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await updateDoc(doc(db, "bookings", booking.id), {
        status: nextRemaining > 0 ? "deposit_paid" : "paid",
        remainingPaymentStatus: nextRemaining > 0 ? "due" : "confirmed",
        externalRemainingClientConfirmedAt: serverTimestamp(),
        remainingPaidAt: nextRemaining > 0 ? booking.remainingPaidAt ?? null : serverTimestamp(),
        paidAt: nextRemaining > 0 ? booking.paidAt ?? null : serverTimestamp(),
        remainingPaidAmount: Number(booking.remainingPaidAmount || 0) + amountToConfirm,
        remainingPaidAmountCents:
          Number(booking.remainingPaidAmountCents || 0) +
          Math.round(amountToConfirm * 100),
        totalArtistPaidAmount: nextPaid,
        totalArtistPaidCents: Math.round(nextPaid * 100),
        remainingBalanceAmount: nextRemaining,
        remainingBalanceCents: Math.round(nextRemaining * 100),
        sessionStatus:
          hasMoreSessions && nextRemaining > 0
            ? "awaiting_next_session"
            : booking.sessionStatus,
        activeSessionNumber:
          hasMoreSessions && nextRemaining > 0 ? sessionNumber + 1 : sessionNumber,
        pendingSessionPaymentAmount: 0,
        pendingSessionPaymentAmountCents: 0,
        pendingSessionNumber: null,
        lastPaidSessionNumber: sessionNumber,
        updatedAt: serverTimestamp(),
      });
      toast.success("Direct payment confirmed.");
      setSelectedBooking(null);
    } catch (error) {
      console.error("Direct payment confirmation failed:", error);
      toast.error("Could not confirm the payment.");
    }
  };

  const handleDisputeExternalPayment = async (booking: Booking) => {
    const reason =
      window.prompt("Briefly describe the issue with this payment.")?.trim() ||
      "Client reported an issue with the direct payment.";

    try {
      await setDoc(
        doc(db, "bookingSessions", booking.id),
        {
          bookingId: booking.id,
          artistId: booking.artistId,
          clientId: booking.clientId,
          remainingPaymentStatus: "disputed",
          disputeReason: reason,
          disputedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await updateDoc(doc(db, "bookings", booking.id), {
        remainingPaymentStatus: "disputed",
        externalRemainingDisputeReason: reason,
        externalRemainingDisputedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Issue reported.");
      setSelectedBooking(null);
    } catch (error) {
      console.error("Direct payment dispute failed:", error);
      toast.error("Could not report the issue.");
    }
  };

  const handleRespondToAmendment = async (
    amendmentId: string,
    response: "accepted" | "declined" | "cancelled"
  ) => {
    if (!selectedBooking) return;

    try {
      const respondToAmendment = httpsCallable(
        functions,
        "respondToProjectAmendment"
      );
      await respondToAmendment({
        bookingId: selectedBooking.id,
        amendmentId,
        response,
      });
      toast.success(
        response === "accepted"
          ? "Project amendment accepted."
          : response === "declined"
          ? "Project amendment declined."
          : "Project amendment cancelled."
      );
    } catch (error) {
      console.error("Project amendment response failed:", error);
      toast.error("Could not update the amendment.");
    }
  };

  const handleRequestNextSession = async (
    booking: Booking,
    input: { date: string; time: string; message: string }
  ) => {
    try {
      const proposeAmendment = httpsCallable(
        functions,
        "proposeProjectAmendment"
      );
      await proposeAmendment({
        bookingId: booking.id,
        type: "schedule_next_session",
        date: input.date,
        time: input.time,
        sessionNumber: Math.max(Number(booking.activeSessionNumber || 1), 1),
        message: input.message,
      });
      toast.success("Next-session request sent to the artist.");
    } catch (error) {
      console.error("Next-session request failed:", error);
      toast.error("Could not send the session request.");
      throw error;
    }
  };

  const handleSetProjectPaused = async (
    booking: Booking,
    input: { reason: string; pausedUntil: string }
  ) => {
    const paused = pauseDialogMode === "pause";

    try {
      const setPaused = httpsCallable(functions, "setProjectPaused");
      await setPaused({
        bookingId: booking.id,
        paused,
        reason: input.reason,
        pausedUntil: input.pausedUntil,
      });
      toast.success(paused ? "Project paused." : "Project resumed.");
    } catch (error) {
      console.error("Project pause update failed:", error);
      toast.error("Could not update project status.");
      throw error;
    }
  };

  if (loading) return <SectionSkeleton />;

  return (
    <section className="mt-6 w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <DashboardHeader
          eyebrow="Client calendar"
          title="Bookings"
          description="Track confirmed appointments, payment status, studio details, and selected times."
        />
        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          <MetricCard label="Total" value={bookings.length} />
          <MetricCard label="Active" value={upcomingCount} />
          <MetricCard label="Confirmed" value={confirmedCount} />
        </div>
      </div>

      {sortedBookings.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={22} />}
          title="No bookings yet"
          description="Once you accept an offer and confirm payment, the booking will appear here."
        />
      ) : (
        <BookingsTable
          bookings={sortedBookings}
          onPay={(booking) => navigate(`/payment/${booking.id}`)}
          onOpen={setSelectedBooking}
        />
      )}

      <BookingDetailsDialog
        booking={selectedBooking}
        amendments={pendingAmendments}
        clientId={clientId}
        onClose={() => setSelectedBooking(null)}
        onPay={(bookingId) => navigate(`/payment/${bookingId}`)}
        onConfirmExternalPayment={handleConfirmExternalPayment}
        onDisputeExternalPayment={handleDisputeExternalPayment}
        onRespondToAmendment={handleRespondToAmendment}
        onRequestNextSession={(booking) => setScheduleProposalBooking(booking)}
        onPauseProject={() => setPauseDialogMode("pause")}
        onResumeProject={() => setPauseDialogMode("resume")}
      />
      <ProjectScheduleProposalDialog
        booking={scheduleProposalBooking}
        viewerRole="client"
        onClose={() => setScheduleProposalBooking(null)}
        onSubmit={handleRequestNextSession}
      />
      <ProjectPauseDialog
        booking={pauseDialogMode ? selectedBooking : null}
        mode={pauseDialogMode || "pause"}
        viewerRole="client"
        onClose={() => setPauseDialogMode(null)}
        onSubmit={handleSetProjectPaused}
      />
    </section>
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
}) => {
  const columns =
    "minmax(210px,1.15fr) 96px minmax(150px,.72fr) minmax(190px,.95fr) minmax(230px,1.2fr) minmax(190px,.8fr)";

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
      <div className="request-modal-scrollbar overflow-x-auto">
        <div className="min-w-[1120px]">
          <div
            className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
            style={{ gridTemplateColumns: columns }}
          >
            <span>Artist</span>
            <span>Sample</span>
            <span>Status</span>
            <span>Money</span>
            <span>Appointment</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-white/10">
            {bookings.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                columns={columns}
                onOpen={() => onOpen(booking)}
                onPay={() => onPay(booking)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const BookingRow = ({
  booking,
  columns,
  onOpen,
  onPay,
}: {
  booking: Booking;
  columns: string;
  onOpen: () => void;
  onPay: () => void;
}) => {
  const remainingBalance = getRemainingBalance(booking);
  const isMultiSession = isMultiSessionBooking(booking);
  const hasPendingPlatformFee =
    booking.remainingPaymentMethod === "external" &&
    Number(booking.pendingPlatformFeeCents || 0) > 0;
  const hasPendingSessionPayment =
    !isMultiSession || Number(booking.pendingSessionPaymentAmount || 0) > 0;
  const isPayable =
    booking.paymentType === "internal" &&
    (booking.status === "pending_payment" ||
      (booking.status === "deposit_paid" &&
        ((booking.remainingPaymentMethod !== "external" &&
          remainingBalance > 0 &&
          hasPendingSessionPayment) ||
          hasPendingPlatformFee)));
  return (
    <div
      className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
      style={{ gridTemplateColumns: columns }}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 p-0! text-left">
        <img src={booking.artistAvatar || "/default-avatar.png"} alt={booking.artistName} className="h-11 w-11 rounded-full border border-white/10 object-cover" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{booking.artistName}</p>
          <p className="text-sm text-neutral-400">{formatAppointment(booking.selectedDate)}</p>
        </div>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="relative h-14 w-16 overflow-hidden rounded-md border border-white/10 bg-white/[0.035] p-0!"
        aria-label="View booking sample"
      >
        {booking.sampleImageUrl ? (
          <img src={booking.sampleImageUrl} alt="Tattoo sample" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-neutral-500">
            <ImageIcon size={18} />
          </span>
        )}
      </button>

      <StatusBadge status={booking.status} />

      <div className="min-w-0 pr-4">
        <p className="truncate text-sm font-semibold text-white">${booking.price}</p>
        <p className="mt-1 truncate text-xs text-neutral-500">${booking.depositAmount || 0} deposit</p>
      </div>

      <div className="min-w-0 pr-4">
        <p className="truncate text-sm font-medium text-white">{formatAppointment(booking.selectedDate, "compact")}</p>
        <p className="mt-1 truncate text-xs text-neutral-500">
          {isMultiSession
            ? `${booking.completedSessionCount || 0}/${booking.estimatedSessionCount || 2} sessions`
            : booking.shopName || "Shop not set"}
        </p>
      </div>

      <div className="flex justify-end gap-2">
      {isPayable ? (
        <>
          <button type="button" onClick={onOpen} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10">
            <Eye size={14} />
            View
          </button>
          <button type="button" onClick={onPay} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3! text-xs! font-semibold text-black transition hover:bg-white/85">
            <CreditCard size={14} />
            Pay
          </button>
        </>
      ) : (
        <button type="button" onClick={onOpen} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white transition hover:bg-white/10">
          <Eye size={14} />
          View booking
        </button>
      )}
      </div>
    </div>
  );
};

const BookingDetailsDialog = ({
  booking,
  amendments,
  clientId,
  onClose,
  onPay,
  onConfirmExternalPayment,
  onDisputeExternalPayment,
  onRespondToAmendment,
  onRequestNextSession,
  onPauseProject,
  onResumeProject,
}: {
  booking: Booking | null;
  amendments: ProjectAmendment[];
  clientId: string;
  onClose: () => void;
  onPay: (bookingId: string) => void;
  onConfirmExternalPayment: (booking: Booking) => void;
  onDisputeExternalPayment: (booking: Booking) => void;
  onRespondToAmendment: (
    amendmentId: string,
    response: "accepted" | "declined" | "cancelled"
  ) => void;
  onRequestNextSession: (booking: Booking) => void;
  onPauseProject: () => void;
  onResumeProject: () => void;
}) => {
  const showExternalPaymentConfirmation =
    booking?.remainingPaymentMethod === "external" &&
    booking.status === "deposit_paid" &&
    ["due", "artist_confirmed", "client_confirmed"].includes(
      booking.remainingPaymentStatus || "due"
    );
  const clientAlreadyConfirmed =
    booking?.remainingPaymentStatus === "client_confirmed";

  return (
  <Transition appear show={!!booking} as={Fragment}>
    <Dialog as="div" className="relative z-50" onClose={onClose}>
      <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />
      </Transition.Child>
      <div className="fixed inset-0 overflow-y-auto request-modal-scrollbar">
        <div className="flex min-h-full items-center justify-center p-4">
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="scale-95 opacity-0" enterTo="scale-100 opacity-100" leave="ease-in duration-150" leaveFrom="scale-100 opacity-100" leaveTo="scale-95 opacity-0">
            <Dialog.Panel className="w-full max-w-6xl overflow-hidden rounded-lg border border-white/10 bg-[#111111] text-white shadow-2xl">
              {booking && (
                <>
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">Booking details</p>
                      <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">Appointment with {booking.artistName}</Dialog.Title>
                    </div>
                    <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10" aria-label="Close booking details">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="grid gap-0 lg:grid-cols-[1fr_0.95fr]">
                    <div className="border-b border-white/10 bg-black lg:border-b-0 lg:border-r">
                      {booking.sampleImageUrl ? (
                        <img src={booking.sampleImageUrl} alt="Tattoo sample" className="h-full max-h-[72vh] min-h-[420px] w-full object-contain" />
                      ) : (
                        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
                          <ImageIcon size={34} />
                          <span>No sample image uploaded</span>
                        </div>
                      )}
                    </div>
                    <div className="p-5 sm:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-4">
                          <img src={booking.artistAvatar || "/default-avatar.png"} alt={booking.artistName} className="h-14 w-14 rounded-full border border-white/10 object-cover" />
                          <div>
                            <p className="font-semibold text-white">{booking.artistName}</p>
                            <p className="text-sm text-neutral-500">{booking.shopName || "Studio not listed"}</p>
                          </div>
                        </div>
                        <StatusBadge status={booking.status} />
                      </div>
                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <DetailTile icon={<CalendarDays size={17} />} label="Appointment" value={formatAppointment(booking.selectedDate)} />
                        <DetailTile icon={<DollarSign size={17} />} label="Price" value={`$${booking.price}`} />
                        <DetailTile icon={<DollarSign size={17} />} label="Deposit" value={`$${booking.depositAmount}`} />
                        <DetailTile icon={<Store size={17} />} label="Payment" value={booking.paymentType === "internal" ? "Stripe" : "Direct"} />
                        <DetailTile icon={<CreditCard size={17} />} label="Final terms" value={getFinalPaymentTermsLabel(booking)} />
                        {isMultiSessionBooking(booking) && (
                          <>
                            <DetailTile
                              icon={<Layers size={17} />}
                              label="Project sessions"
                              value={`${booking.estimatedSessionCount || 2}`}
                            />
                            <DetailTile
                              icon={<DollarSign size={17} />}
                              label="Session estimate"
                              value={`$${getSessionInstallmentAmount(booking)}`}
                            />
                          </>
                        )}
                      </div>
                      {booking.shopAddress && (
                        <a href={booking.shopMapLink || undefined} target="_blank" rel="noopener noreferrer" className="mt-5 flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300 transition hover:bg-white/[0.06]">
                          <MapPin size={17} className="mt-0.5 text-neutral-500" />
                          {booking.shopAddress}
                        </a>
                      )}
                      <ProjectControlsPanel
                        booking={booking}
                        viewerRole="client"
                        currentUserId={clientId}
                        amendments={amendments}
                        onRespondToAmendment={onRespondToAmendment}
                        onPlanNextSession={() => onRequestNextSession(booking)}
                        onPauseProject={onPauseProject}
                        onResumeProject={onResumeProject}
                        onPayPlatformFee={() => onPay(booking.id)}
                      />
                      {booking.remainingPaymentMethod === "external" &&
                        booking.status === "deposit_paid" && (
                          <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                            <p className="text-sm font-semibold text-white">
                              Direct balance
                            </p>
                            <p className="mt-1 text-sm leading-6 text-emerald-50/75">
                              The remaining{" "}
                              <span className="font-semibold text-white">
                                ${getRemainingBalance(booking)}
                              </span>{" "}
                              is paid directly to the artist outside SATX Ink
                              checkout. Status:{" "}
                              <span className="font-semibold capitalize text-white">
                                {(booking.remainingPaymentStatus || "due").replace("_", " ")}
                              </span>
                            </p>
                            {showExternalPaymentConfirmation && (
                              <div className="mt-4 space-y-3">
                                <div className="rounded-md border border-white/10 bg-black/25 p-3">
                                  <p className="text-xs uppercase tracking-[0.14em] text-emerald-50/55">
                                    {booking.remainingPaymentStatus ===
                                    "artist_confirmed"
                                      ? "Artist reported paid"
                                      : "Direct payment confirmation"}
                                  </p>
                                  <p className="mt-1 text-lg font-semibold text-white">
                                    ${getSessionInstallmentAmount(booking)}
                                  </p>
                                  {isMultiSessionBooking(booking) && (
                                    <p className="mt-1 text-xs leading-5 text-emerald-50/70">
                                      Confirming this amount will recalculate the
                                      remaining project balance across the
                                      sessions left.
                                    </p>
                                  )}
                                  {clientAlreadyConfirmed && (
                                    <p className="mt-1 text-xs leading-5 text-emerald-50/70">
                                      You confirmed this payment. The artist can
                                      still confirm the final amount from their
                                      dashboard.
                                    </p>
                                  )}
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                <button
                                  type="button"
                                  disabled={clientAlreadyConfirmed}
                                  onClick={() =>
                                    onConfirmExternalPayment(booking)
                                  }
                                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {clientAlreadyConfirmed
                                    ? "Confirmed"
                                    : "Confirm paid"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onDisputeExternalPayment(booking)
                                  }
                                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-black/25 px-5! py-3! text-sm! font-semibold text-white transition hover:bg-white/10"
                                >
                                  Report issue
                                </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      {booking.paymentType === "internal" &&
                        (booking.status === "pending_payment" ||
                          (booking.status === "deposit_paid" &&
                            ((booking.remainingPaymentMethod !== "external" &&
                              getRemainingBalance(booking) > 0) ||
                              Number(booking.pendingPlatformFeeCents || 0) > 0))) && (
                          <button
                            type="button"
                            onClick={() => onPay(booking.id)}
                            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85"
                          >
                            <CreditCard size={16} />
                            {Number(booking.pendingPlatformFeeCents || 0) > 0
                              ? "Pay platform fee"
                              : booking.status === "deposit_paid"
                              ? isMultiSessionBooking(booking)
                                ? `Pay ${getSessionOrdinal(
                                    getPayableSessionNumber(booking)
                                  )} session balance`
                                : "Pay remaining balance"
                              : "Continue to payment"}
                          </button>
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
  const className = status === "paid" || status === "confirmed" || status === "deposit_paid" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : status === "cancelled" ? "border-red-300/25 bg-red-300/10 text-red-100" : "border-amber-300/20 bg-amber-300/10 text-amber-100";
  const label = status === "deposit_paid" ? "Deposit paid" : status.replace("_", " ");
  return <span className={`inline-flex w-fit justify-self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}>{label}</span>;
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

const SectionSkeleton = () => (
  <section className="mt-6 w-full max-w-7xl space-y-6">
    <div className="h-36 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />)}
    </div>
  </section>
);

const formatAppointment = (date: { date: string; time: string }, mode: "compact" | "long" = "long") => {
  if (!date?.date || !date?.time || date.date === "TBD") return "TBD";
  const [year, month, day] = date.date.split("-").map(Number);
  const [hours, minutes] = date.time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).toLocaleString("en-US", {
    month: mode === "compact" ? "short" : "long",
    day: "numeric",
    year: mode === "compact" ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getBookingTime = (booking: Booking) => {
  const createdAt = booking.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt.toDate === "function") return createdAt.toDate().getTime();
  if (typeof createdAt.seconds === "number") return createdAt.seconds * 1000;
  return 0;
};

const getRemainingBalance = (booking: Booking) => {
  if (typeof booking.remainingBalanceAmount === "number") {
    return Math.max(booking.remainingBalanceAmount, 0);
  }

  return Math.max(
    Number(booking.price || 0) - Number(booking.totalArtistPaidAmount || booking.depositAmount || 0),
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

type SyncPaymentResponse = {
  paid?: boolean;
  status?: Booking["status"];
};

const reconcilePendingPayments = async (bookings: Booking[]) => {
  const syncableBookings = bookings.filter(
    (booking) =>
      booking.paymentType === "internal" &&
      (booking.status === "pending_payment" ||
        (booking.status === "deposit_paid" &&
          (booking.checkoutPaymentMode === "remaining" ||
            booking.checkoutPaymentMode === "platform_fee"))) &&
      booking.stripeCheckoutSessionId
  );

  if (syncableBookings.length === 0) return bookings;

  const syncPayment = httpsCallable(functions, "syncBookingPaymentStatus");
  const syncedById = new Map<string, Booking>();

  await Promise.all(
    syncableBookings.map(async (booking) => {
      try {
        const response = await syncPayment({ bookingId: booking.id });
        const data = response.data as SyncPaymentResponse;

        if (data.status && data.status !== booking.status) {
          syncedById.set(booking.id, {
            ...booking,
            status: data.status,
          });
        }
      } catch (error) {
        console.warn("Unable to sync booking payment status:", error);
      }
    })
  );

  if (syncedById.size === 0) return bookings;
  return bookings.map((booking) => syncedById.get(booking.id) || booking);
};

export default ClientBookingsList;
