import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarCheck,
  CheckCircle2,
  CreditCard,
  MessageSquareText,
  ReceiptText,
  X,
  XCircle,
} from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import type { QuerySnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import type { Booking } from "../types/Booking";
import type { Offer } from "../types/Offer";

type UserRole = "artist" | "client" | null;

type LiveToast = {
  id: string;
  kind: "request" | "offer" | "accepted" | "declined" | "deposit" | "paid";
  title: string;
  message: string;
  imageUrl?: string | null;
  meta: string[];
  actionLabel: string;
  actionTo: string;
  leaving?: boolean;
};

type BookingRequest = {
  id: string;
  clientName?: string;
  clientAvatar?: string;
  description?: string;
  bodyPlacement?: string;
  size?: string;
  budget?: string | number;
  sourceType?: string;
  flashTitle?: string;
  flashPrice?: number | null;
  preferredDateRange?: string[];
  fullUrl?: string;
  thumbUrl?: string;
};

type SnapshotDocument = {
  id: string;
  data: () => Record<string, unknown>;
};

const AUTO_DISMISS_MS = 8000;
const EXIT_ANIMATION_MS = 220;

const LiveBookingToasts = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole>(null);
  const [toasts, setToasts] = useState<LiveToast[]>([]);
  const timersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!user?.uid) {
      setRole(null);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        const nextRole = snap.data()?.role;
        setRole(nextRole === "artist" || nextRole === "client" ? nextRole : null);
      },
      (error) => {
        console.error("Live toast profile listener failed:", error);
        setRole(null);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timerId) =>
        window.clearTimeout(timerId)
      );
      timersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (user?.uid) return;

    Object.values(timersRef.current).forEach((timerId) =>
      window.clearTimeout(timerId)
    );
    timersRef.current = {};
    setToasts([]);
  }, [user?.uid]);

  const dismissToast = useCallback((toastId: string) => {
    window.clearTimeout(timersRef.current[toastId]);
    delete timersRef.current[toastId];

    setToasts((current) =>
      current.map((toast) =>
        toast.id === toastId ? { ...toast, leaving: true } : toast
      )
    );

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== toastId));
    }, EXIT_ANIMATION_MS);
  }, []);

  const pushToast = useCallback((toast: LiveToast) => {
    setToasts((current) => [
      toast,
      ...current.filter((item) => item.id !== toast.id),
    ].slice(0, 3));

    window.clearTimeout(timersRef.current[toast.id]);
    timersRef.current[toast.id] = window.setTimeout(
      () => dismissToast(toast.id),
      AUTO_DISMISS_MS
    );
  }, [dismissToast]);

  useEffect(() => {
    if (!user?.uid || role !== "artist") return undefined;

    const unsubscribe = onSnapshot(
      query(
        collection(db, "bookingRequests"),
        where("artistId", "==", user.uid),
        where("status", "==", "pending")
      ),
      createAddedListener((docSnap) => {
        const request = toRequest(docSnap);
        pushToast(createArtistRequestToast(request));
      }),
      (error) => console.error("Artist request toast listener failed:", error)
    );

    return () => unsubscribe();
  }, [pushToast, role, user?.uid]);

  useEffect(() => {
    if (!user?.uid || role !== "artist") return undefined;

    const statusByOfferId = new Map<string, string>();
    let initialized = false;

    const unsubscribe = onSnapshot(
      query(collection(db, "offers"), where("artistId", "==", user.uid)),
      (snapshot) => {
        snapshot.docs.forEach((docSnap) => {
          const status = String(docSnap.data().status || "");
          const previousStatus = statusByOfferId.get(docSnap.id);

          if (
            initialized &&
            previousStatus !== status &&
            (status === "accepted" || status === "declined")
          ) {
            pushToast(createArtistOfferResponseToast(toOffer(docSnap), status));
          }

          statusByOfferId.set(docSnap.id, status);
        });

        initialized = true;
      },
      (error) =>
        console.error("Artist offer response toast listener failed:", error)
    );

    return () => unsubscribe();
  }, [pushToast, role, user?.uid]);

  useEffect(() => {
    if (!user?.uid || role !== "artist") return undefined;

    const statusByBookingId = new Map<string, string>();
    let initialized = false;

    const unsubscribe = onSnapshot(
      query(collection(db, "bookings"), where("artistId", "==", user.uid)),
      (snapshot) => {
        snapshot.docs.forEach((docSnap) => {
          const booking = toBooking(docSnap);
          const previousStatus = statusByBookingId.get(docSnap.id);

          if (
            initialized &&
            previousStatus !== booking.status &&
            (booking.status === "deposit_paid" || booking.status === "paid")
          ) {
            pushToast(createArtistPaymentToast(booking));
          }

          statusByBookingId.set(docSnap.id, booking.status);
        });

        initialized = true;
      },
      (error) => console.error("Artist booking toast listener failed:", error)
    );

    return () => unsubscribe();
  }, [pushToast, role, user?.uid]);

  useEffect(() => {
    if (!user?.uid || role !== "client") return undefined;

    const unsubscribe = onSnapshot(
      query(
        collection(db, "offers"),
        where("clientId", "==", user.uid),
        where("status", "==", "pending")
      ),
      createAddedListener((docSnap) => {
        const offer = toOffer(docSnap);
        pushToast(createClientOfferToast(offer));
      }),
      (error) => console.error("Client offer toast listener failed:", error)
    );

    return () => unsubscribe();
  }, [pushToast, role, user?.uid]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-4 z-[70] flex flex-col gap-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px]"
    >
      {toasts.map((toast) => (
        <article
          key={toast.id}
          className={`live-booking-toast pointer-events-auto overflow-hidden rounded-lg border border-white/10 bg-[#101010]/95 text-white shadow-2xl shadow-black/45 ring-1 ring-black/40 backdrop-blur-xl ${
            toast.leaving ? "live-booking-toast--leaving" : ""
          }`}
        >
          <div className="flex gap-3 p-3.5 sm:p-4">
            <ToastMedia toast={toast} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                    {getEyebrow(toast.kind)}
                  </p>
                  <h2 className="mt-1 mb-0 line-clamp-1 text-sm! font-semibold! leading-5 text-white sm:text-base!">
                    {toast.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-neutral-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Dismiss booking notification"
                >
                  <X size={15} />
                </button>
              </div>

              <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-neutral-300 sm:text-sm">
                {toast.message}
              </p>

              {toast.meta.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {toast.meta.slice(0, 3).map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] font-medium text-neutral-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  dismissToast(toast.id);
                  navigate(toast.actionTo);
                }}
                className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-md bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85 sm:w-auto"
              >
                {toast.actionLabel}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
};

const createAddedListener =
  (onAdded: (docSnap: SnapshotDocument) => void) => {
  let initialized = false;

  return (snapshot: QuerySnapshot) => {
    if (!initialized) {
      initialized = true;
      return;
    }

    snapshot
      .docChanges()
      .filter((change) => change.type === "added")
      .forEach((change) => onAdded(change.doc));
  };
};

const toRequest = (docSnap: SnapshotDocument): BookingRequest => ({
  id: docSnap.id,
  ...docSnap.data(),
});

const toOffer = (docSnap: SnapshotDocument): Offer => ({
  id: docSnap.id,
  ...(docSnap.data() as Omit<Offer, "id">),
});

const toBooking = (docSnap: SnapshotDocument): Booking => ({
  id: docSnap.id,
  ...(docSnap.data() as Omit<Booking, "id">),
});

const createArtistRequestToast = (request: BookingRequest): LiveToast => ({
  id: `request-${request.id}`,
  kind: "request",
  title:
    request.sourceType === "flash"
      ? `${request.clientName || "A client"} requested flash`
      : `${request.clientName || "A client"} requested a tattoo`,
  message:
    request.description ||
    (request.sourceType === "flash"
      ? "A new flash request is ready with the listed design, placement, size, and availability details."
      : "A new tattoo request is ready with placement, size, budget, and availability details."),
  imageUrl: request.clientAvatar || request.thumbUrl || request.fullUrl || null,
  meta: [
    request.bodyPlacement || "Placement open",
    request.size || "Size open",
    request.sourceType === "flash"
      ? formatMoney(request.flashPrice || 0)
      : formatBudget(request.budget),
  ],
  actionLabel: "Open requests",
  actionTo: "/dashboard?tab=requests",
});

const createClientOfferToast = (offer: Offer): LiveToast => ({
  id: `offer-${offer.id}`,
  kind: "offer",
  title: `${offer.displayName || "Your artist"} sent an offer`,
  message:
    offer.message ||
    `Review the quote, deposit, studio, and appointment options before booking.`,
  imageUrl: offer.artistAvatar || offer.thumbUrl || offer.fullUrl || null,
  meta: [
    formatMoney(offer.price),
    `${formatMoney(offer.depositPolicy?.amount)} deposit`,
    getFirstAppointment(offer.dateOptions),
  ],
  actionLabel: "Review offer",
  actionTo: "/dashboard?tab=offers",
});

const createArtistOfferResponseToast = (
  offer: Offer,
  status: string
): LiveToast => {
  const accepted = status === "accepted";

  return {
    id: `offer-response-${offer.id}-${status}`,
    kind: accepted ? "accepted" : "declined",
    title: `${offer.clientName || "The client"} ${
      accepted ? "accepted your offer" : "declined your offer"
    }`,
    message: accepted
      ? `Booking is confirmed for ${formatMoney(
          offer.price
        )}; payment is now the client's next step.`
      : `The ${formatMoney(offer.price)} offer was declined.`,
    imageUrl: offer.clientAvatar || offer.thumbUrl || offer.fullUrl || null,
    meta: [
      formatMoney(offer.price),
      `${formatMoney(offer.depositPolicy?.amount)} deposit`,
      getFirstAppointment(offer.dateOptions),
    ],
    actionLabel: accepted ? "Open bookings" : "Open offers",
    actionTo: accepted ? "/dashboard?tab=pending" : "/dashboard?tab=offers",
  };
};

const createArtistPaymentToast = (booking: Booking): LiveToast => {
  const clientName = booking.clientName || "The client";
  const paidInFull = booking.status === "paid";

  return {
    id: `booking-payment-${booking.id}-${booking.status}`,
    kind: paidInFull ? "paid" : "deposit",
    title: paidInFull ? "Booking paid in full" : "Deposit paid",
    message: paidInFull
      ? `${clientName}'s booking is confirmed and paid in full.`
      : `${clientName}'s booking is confirmed with the deposit paid.`,
    imageUrl: booking.clientAvatar || booking.sampleImageUrl || null,
    meta: [
      formatMoney(booking.price),
      paidInFull
        ? "Paid in full"
        : `${formatMoney(booking.depositPaidAmount || booking.depositAmount)} paid`,
      formatAppointment(booking.selectedDate),
    ],
    actionLabel: paidInFull ? "Open paid bookings" : "Open confirmed bookings",
    actionTo: paidInFull ? "/dashboard?tab=paid" : "/dashboard?tab=confirmed",
  };
};

const ToastMedia = ({ toast }: { toast: LiveToast }) => {
  const Icon = getIcon(toast.kind);

  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40 sm:h-14 sm:w-14">
      {toast.imageUrl ? (
        <img
          src={toast.imageUrl}
          alt=""
          className="h-full w-full object-cover opacity-90"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-neutral-300">
          <Icon size={20} />
        </div>
      )}
      <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-black/75 text-[var(--color-primary)] ring-1 ring-white/10">
        <Icon size={12} />
      </span>
    </div>
  );
};

const getIcon = (kind: LiveToast["kind"]) => {
  if (kind === "request") return MessageSquareText;
  if (kind === "offer") return ReceiptText;
  if (kind === "accepted") return CheckCircle2;
  if (kind === "declined") return XCircle;
  if (kind === "deposit") return CalendarCheck;
  return CreditCard;
};

const getEyebrow = (kind: LiveToast["kind"]) => {
  if (kind === "request") return "New request";
  if (kind === "offer") return "New offer";
  if (kind === "accepted") return "Offer accepted";
  if (kind === "declined") return "Offer declined";
  if (kind === "deposit") return "Deposit received";
  return "Payment received";
};

const formatMoney = (amount?: number | null) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const formatBudget = (budget?: string | number) => {
  if (typeof budget === "number") return formatMoney(budget);
  if (!budget) return "Budget open";
  if (budget.endsWith("+")) return `$${budget}`;
  if (budget.includes("-")) {
    const [min, max] = budget.split("-");
    return `$${min}-$${max}`;
  }
  return budget;
};

const getFirstAppointment = (dateOptions?: { date: string; time: string }[]) => {
  const firstOption = dateOptions?.find((option) => option.date && option.time);
  return firstOption ? formatAppointment(firstOption) : "Date options";
};

const formatAppointment = (selectedDate?: { date: string; time: string }) => {
  if (!selectedDate?.date || !selectedDate.time || selectedDate.date === "TBD") {
    return "Date TBD";
  }

  const [year, month, day] = selectedDate.date.split("-").map(Number);
  const [hours, minutes] = selectedDate.time.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);

  if (Number.isNaN(date.getTime())) return "Date TBD";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default LiveBookingToasts;
