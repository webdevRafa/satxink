import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { Eye, ImageIcon, ReceiptText } from "lucide-react";
import { db } from "../firebase/firebaseConfig";
import { toast } from "react-hot-toast";
import ViewOfferModal from "./ViewOfferModal";
import type { Offer } from "../types/Offer";
import type { Flash } from "../types/Flash";
import { applyOfferImageFallbacks } from "../utils/offerImageFallbacks";
import {
  getFlashAvailabilityStatus,
  getFlashRepeatability,
  isFlashAvailableForClients,
} from "../utils/flashAvailability";

type FirestoreTimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

type DashboardOffer = Offer & {
  createdAt?: Date | FirestoreTimestampLike | null;
};

interface Props {
  clientId: string;
  onOfferResolved?: (outcome: "accepted" | "declined") => void;
}

const ClientOffersList: React.FC<Props> = ({ clientId, onOfferResolved }) => {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<DashboardOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<
    (DashboardOffer & { bookingId?: string }) | null
  >(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleResponse = async (
    offerId: string,
    action: "accepted" | "declined",
    selectedDate?: { date: string; time: string },
    remainingPaymentMethod: "stripe" | "external" = "stripe",
    declinedReason?: { value: string; label: string }
  ) => {
    try {
      const offerRef = doc(db, "offers", offerId);
      const offerSnap = await getDoc(offerRef);
      if (!offerSnap.exists()) {
        toast.error("Offer not found.");
        return;
      }

      const [offerData] = await applyOfferImageFallbacks([
        { id: offerId, ...offerSnap.data() } as Offer,
      ]);

      await updateDoc(offerRef, {
        status: action,
        respondedAt: serverTimestamp(),
        ...(action === "declined"
          ? {
              declinedAt: serverTimestamp(),
              declinedReason: declinedReason?.value || null,
              declinedReasonLabel: declinedReason?.label || null,
            }
          : {}),
      });

      if (action === "accepted") {
        const artistRef = doc(db, "users", offerData.artistId);
        const artistSnap = await getDoc(artistRef);
        const artistData = artistSnap.data();
        const shopRef = doc(db, "shops", artistData?.shopId);
        const shopSnap = await getDoc(shopRef);
        const shopData = shopSnap.exists() ? shopSnap.data() : {};
        const depositAmount = Number(offerData.depositPolicy.amount || 0);
        const remainingAmount = Math.max(Number(offerData.price || 0) - depositAmount, 0);
        const isMultiSessionProject = offerData.projectType === "multi_session";
        const estimatedSessionCount = isMultiSessionProject
          ? Math.max(Number(offerData.estimatedSessionCount || 2), 2)
          : 1;
        const laterSessionCount = isMultiSessionProject
          ? Math.max(estimatedSessionCount - 1, 1)
          : 1;
        const estimatedSessionPrice =
          isMultiSessionProject && Number(offerData.estimatedSessionPrice || 0) > 0
            ? Number(offerData.estimatedSessionPrice)
            : isMultiSessionProject
            ? Math.ceil(remainingAmount / laterSessionCount)
            : remainingAmount;
        const sessionInstallmentTiming =
          offerData.sessionInstallmentTiming === "before_session"
            ? "before_session"
            : "after_session";
        const estimatedHoursPerSession =
          isMultiSessionProject &&
          typeof offerData.estimatedHoursPerSession === "number" &&
          offerData.estimatedHoursPerSession > 0
            ? offerData.estimatedHoursPerSession
            : null;
        const usesExternalRemaining =
          offerData.paymentType === "internal" &&
          offerData.allowExternalRemainingPayment === true &&
          remainingPaymentMethod === "external" &&
          depositAmount > 0 &&
          remainingAmount > 0;
        let flashRepeatability = offerData.flashRepeatability;
        let flashAvailabilityStatus = offerData.flashAvailabilityStatus;

        if (offerData.sourceType === "flash" && offerData.flashId) {
          const flashSnap = await getDoc(doc(db, "flashes", offerData.flashId));
          if (flashSnap.exists()) {
            const latestFlash = { id: flashSnap.id, ...flashSnap.data() } as Flash;
            flashRepeatability = getFlashRepeatability(latestFlash);
            flashAvailabilityStatus = getFlashAvailabilityStatus(latestFlash);

            if (!isFlashAvailableForClients(latestFlash)) {
              toast.error(
                flashRepeatability === "one_of_one"
                  ? "This one-of-one flash is no longer available."
                  : "This flash is no longer available."
              );
              return;
            }
          }
        }

        const bookingRef = await addDoc(collection(db, "bookings"), {
          artistId: offerData.artistId,
          artistName: offerData.displayName,
          artistAvatar: offerData.artistAvatar ?? null,
          clientId: offerData.clientId,
          clientFirstName: offerData.clientFirstName ?? "",
          clientLastName: offerData.clientLastName ?? "",
          clientName: offerData.clientName ?? null,
          clientAvatar: offerData.clientAvatar ?? null,
          offerId,
          price: offerData.price,
          depositAmount,
          paymentType: "internal",
          projectType: isMultiSessionProject ? "multi_session" : "single_session",
          depositApplication: offerData.depositApplication || "project_credit",
          estimatedSessionCount,
          estimatedSessionPrice: isMultiSessionProject
            ? estimatedSessionPrice
            : null,
          estimatedHoursPerSession,
          sessionPaymentPlan: isMultiSessionProject
            ? "per_session"
            : "single_balance",
          sessionScheduling: isMultiSessionProject
            ? "first_session_now_rest_later"
            : "single_session",
          sessionInstallmentTiming,
          activeSessionNumber: 1,
          completedSessionCount: 0,
          pendingSessionPaymentAmount: 0,
          pendingSessionPaymentAmountCents: 0,
          pendingSessionNumber: null,
          lastPaidSessionNumber: 0,
          finalPaymentTiming: offerData.finalPaymentTiming ?? "after",
          finalPaymentDeadlineHours:
            offerData.finalPaymentTiming === "before"
              ? offerData.finalPaymentDeadlineHours ?? 24
              : null,
          remainingPaymentMethod: usesExternalRemaining ? "external" : "stripe",
          remainingPaymentStatus:
            usesExternalRemaining && !isMultiSessionProject ? "due" : "not_due",
          externalRemainingAmount: usesExternalRemaining ? remainingAmount : 0,
          externalRemainingAmountCents: usesExternalRemaining
            ? Math.round(remainingAmount * 100)
            : 0,
          sessionStatus: "not_started",
          shopId: offerData.shopId ?? null,
          shopName: offerData.shopName ?? shopData.name ?? "Unavailable",
          shopAddress: offerData.shopAddress ?? shopData.address ?? "Unavailable",
          shopMapLink: offerData.shopMapLink ?? shopData.mapLink ?? null,
          selectedDate: selectedDate ?? { date: "TBD", time: "TBD" },
          sampleImageUrl: offerData.fullUrl ?? null,
          sourceType: offerData.sourceType || "custom",
          flashId: offerData.flashId ?? null,
          flashTitle: offerData.flashTitle ?? null,
          flashDescription: offerData.flashDescription ?? null,
          flashPrice: offerData.flashPrice ?? null,
          flashSheetId: offerData.flashSheetId ?? null,
          flashRepeatability:
            offerData.sourceType === "flash"
              ? flashRepeatability || "repeatable"
              : null,
          flashAvailabilityStatus:
            offerData.sourceType === "flash"
              ? flashAvailabilityStatus || "available"
              : null,
          isFromSheet: offerData.isFromSheet ?? null,
          status: "pending_payment",
          createdAt: serverTimestamp(),
        });

        await updateDoc(offerRef, {
          bookingId: bookingRef.id,
        });
        setOffers((current) => current.filter((offer) => offer.id !== offerId));
        onOfferResolved?.("accepted");
        toast.success("Booking confirmed.");
        navigate(`/payment/${bookingRef.id}`);
        return bookingRef.id;
      }

      toast.success("Offer declined.");
      setOffers((current) => current.filter((offer) => offer.id !== offerId));
      onOfferResolved?.("declined");
    } catch (err) {
      console.error(err);
      toast.error("Error processing offer.");
    }
  };

  useEffect(() => {
    if (!clientId) return;

    setLoading(true);
    const offersQuery = query(
      collection(db, "offers"),
      where("clientId", "==", clientId),
      where("status", "==", "pending")
    );

    let isActive = true;
    const unsubscribe = onSnapshot(
      offersQuery,
      async (snap) => {
        const data = snap.docs.map((offerDoc) => ({
          id: offerDoc.id,
          ...offerDoc.data(),
        })) as DashboardOffer[];
        const offersWithImages = await applyOfferImageFallbacks(data);
        if (!isActive) return;

        setOffers(offersWithImages);
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to client offers:", error);
        setLoading(false);
      }
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [clientId]);

  const sortedOffers = useMemo(
    () => [...offers].sort((a, b) => getOfferTime(b) - getOfferTime(a)),
    [offers]
  );
  const pendingCount = offers.length;

  if (loading) return <SectionSkeleton />;

  return (
    <section className="mt-6 w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <DashboardHeader
          eyebrow="Client inbox"
          title="Offers"
          description="Review artist offers, choose an appointment time, and accept when you are ready to book."
        />
        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          <MetricCard label="Total" value={offers.length} />
          <MetricCard label="Pending" value={pendingCount} />
          <MetricCard label="Next step" value={offers.length ? "Review" : "-"} />
        </div>
      </div>

      {sortedOffers.length === 0 ? (
        <EmptyState
          icon={<ReceiptText size={22} />}
          title="No offers yet"
          description="When artists respond to your requests, their offers will appear here."
        />
      ) : (
        <OffersTable
          offers={sortedOffers}
          onOpen={(offer) => {
            setSelectedOffer(offer);
            setIsModalOpen(true);
          }}
        />
      )}

      <ViewOfferModal
        offer={selectedOffer}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRespond={async (
          offerId,
          action,
          selectedDate,
          remainingPaymentMethod,
          declinedReason
        ) => {
          const bookingId = await handleResponse(
            offerId,
            action,
            selectedDate,
            remainingPaymentMethod,
            declinedReason
          );
          if (bookingId) {
            setSelectedOffer((prev) => (prev ? { ...prev, bookingId } : prev));
          }
          return bookingId;
        }}
      />
    </section>
  );
};

const OffersTable = ({
  offers,
  onOpen,
}: {
  offers: DashboardOffer[];
  onOpen: (offer: DashboardOffer) => void;
}) => {
  const columns =
    "minmax(210px,1.15fr) 96px minmax(220px,1fr) minmax(250px,1.15fr) minmax(140px,.72fr) minmax(150px,.65fr)";

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
            <span>Total | Deposit</span>
            <span>Appointment</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-white/10">
            {offers.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                columns={columns}
                onOpen={() => onOpen(offer)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const OfferRow = ({
  offer,
  columns,
  onOpen,
}: {
  offer: DashboardOffer;
  columns: string;
  onOpen: () => void;
}) => {
  const previewUrl = offer.thumbUrl || offer.fullUrl || "";
  const appointmentOptions = getSortedAppointmentOptions(offer.dateOptions);
  const soonestDateOption = appointmentOptions[0];
  const additionalAppointmentCount = Math.max(appointmentOptions.length - 1, 0);
  const isFlashOffer = offer.sourceType === "flash";
  const isMultiSessionOffer = offer.projectType === "multi_session";
  const depositLabel = formatDeposit(offer);
  const depositTooltip =
    offer.depositPolicy?.depositRequired && Number(offer.depositPolicy.amount || 0) > 0
      ? `${depositLabel} reserves your appointment. The remaining artist balance is handled after checkout based on the offer terms.`
      : "No deposit is required to reserve this appointment.";
  const appointmentTooltip = appointmentOptions.length
    ? appointmentOptions
        .map((option, index) => `Option ${index + 1}: ${formatAppointment(option)}`)
        .join("\n")
    : "No appointment options were included.";

  return (
    <div
      className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
      style={{ gridTemplateColumns: columns }}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 p-0! text-left">
        <img src={offer.artistAvatar || "/default-avatar.png"} alt={offer.displayName || "Artist"} className="h-11 w-11 rounded-full border border-white/10 object-cover" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{offer.displayName || "Artist"}</p>
          <p className="text-sm text-neutral-400">Sent {formatShortDate(offer.createdAt)}</p>
        </div>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="relative h-14 w-16 overflow-hidden rounded-md border border-white/10 bg-white/[0.035] p-0!"
        aria-label="View offer sample"
      >
        {previewUrl ? (
          <OfferPreviewImage src={previewUrl} alt="Offer sample" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-neutral-500">
            <ImageIcon size={18} />
          </span>
        )}
      </button>

      <div
        className="min-w-0 pr-4"
        title={depositTooltip}
        aria-label={`Total $${offer.price}. Deposit ${depositLabel}. ${depositTooltip}`}
      >
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-neutral-500">
            Total
          </span>
          <span className="text-sm font-semibold text-white">${offer.price}</span>
          <span className="text-neutral-600">|</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-neutral-500">
            Deposit
          </span>
          <span className="text-sm font-semibold text-white">{depositLabel}</span>
        </div>
        <p className="mt-1 truncate text-xs text-neutral-500">
          Deposit reserves the appointment
        </p>
      </div>

      <div className="min-w-0 pr-4" title={appointmentTooltip}>
        <p className="truncate text-sm font-medium text-white">
          {soonestDateOption
            ? `Soonest: ${formatAppointment(soonestDateOption, "compact")}`
            : "No date"}
        </p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
          {additionalAppointmentCount > 0 && (
            <span className="inline-flex w-fit rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-neutral-300">
              +{additionalAppointmentCount} more option
              {additionalAppointmentCount === 1 ? "" : "s"}
            </span>
          )}
          <span className="min-w-0 truncate text-xs text-neutral-500">
            {isFlashOffer
              ? offer.flashTitle || "Flash item"
              : isMultiSessionOffer
              ? `${offer.estimatedSessionCount || 2} sessions`
              : offer.shopName || "Shop not set"}
          </span>
        </div>
      </div>

      <StatusBadge status={offer.status || "pending"} />

      <div className="flex justify-end">
        <button type="button" onClick={onOpen} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3! text-xs! font-semibold text-black transition hover:bg-white/85">
          <Eye size={14} />
          Review
        </button>
      </div>
    </div>
  );
};

const OfferPreviewImage = ({ src, alt }: { src: string; alt: string }) => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <span className="relative flex h-full w-full items-center justify-center overflow-hidden bg-white/[0.035]">
      {!loaded && (
        <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.08] via-white/[0.035] to-transparent" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
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
  const className =
    status === "accepted"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : status === "declined"
      ? "border-red-300/25 bg-red-300/10 text-red-100"
      : "border-amber-300/20 bg-amber-300/10 text-amber-100";
  return <span className={`inline-flex w-fit justify-self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}>{status}</span>;
};

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

const getSortedAppointmentOptions = (
  dateOptions?: { date: string; time: string }[]
) =>
  [...(dateOptions || [])]
    .filter((option) => option.date && option.time)
    .sort((a, b) => getAppointmentTime(a) - getAppointmentTime(b));

const getAppointmentTime = (option: { date: string; time: string }) => {
  const [year, month, day] = option.date.split("-").map(Number);
  const [hours, minutes] = option.time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime();
};

const formatDeposit = (offer: Offer) =>
  offer.depositPolicy?.depositRequired
    ? `$${offer.depositPolicy.amount || 0}`
    : "Not required";

const formatAppointment = (option: { date: string; time: string }, mode: "compact" | "long" = "long") => {
  const [year, month, day] = option.date.split("-").map(Number);
  const [hours, minutes] = option.time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).toLocaleString("en-US", {
    month: mode === "compact" ? "short" : "long",
    day: "numeric",
    year: mode === "compact" ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getOfferTime = (offer: DashboardOffer) => {
  const createdAt = offer.createdAt;
  if (!createdAt) return 0;
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt.toDate === "function") return createdAt.toDate().getTime();
  if (typeof createdAt.seconds === "number") return createdAt.seconds * 1000;
  return 0;
};

const formatShortDate = (createdAt?: DashboardOffer["createdAt"]) => {
  if (!createdAt) return "New";
  const date = createdAt instanceof Date ? createdAt : typeof createdAt.toDate === "function" ? createdAt.toDate() : typeof createdAt.seconds === "number" ? new Date(createdAt.seconds * 1000) : null;
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "New";
};

export default ClientOffersList;
