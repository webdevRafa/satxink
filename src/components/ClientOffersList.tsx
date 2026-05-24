import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { CalendarDays, DollarSign, Eye, ImageIcon, ReceiptText, Store } from "lucide-react";
import { db } from "../firebase/firebaseConfig";
import { toast } from "react-hot-toast";
import ViewOfferModal from "./ViewOfferModal";
import type { Offer } from "../types/Offer";

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

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const offersQuery = query(collection(db, "offers"), where("clientId", "==", clientId));
      const snap = await getDocs(offersQuery);
      const data = snap.docs.map((offerDoc) => ({
        id: offerDoc.id,
        ...offerDoc.data(),
      })) as DashboardOffer[];
      setOffers(data.filter((offer) => (offer.status || "pending") === "pending"));
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (
    offerId: string,
    action: "accepted" | "declined",
    selectedDate?: { date: string; time: string }
  ) => {
    try {
      const offerRef = doc(db, "offers", offerId);
      const offerSnap = await getDoc(offerRef);
      if (!offerSnap.exists()) {
        toast.error("Offer not found.");
        return;
      }

      const offerData = offerSnap.data() as Offer;

      await updateDoc(offerRef, {
        status: action,
        respondedAt: serverTimestamp(),
      });

      if (action === "accepted") {
        const artistRef = doc(db, "users", offerData.artistId);
        const artistSnap = await getDoc(artistRef);
        const artistData = artistSnap.data();
        const shopRef = doc(db, "shops", artistData?.shopId);
        const shopSnap = await getDoc(shopRef);
        const shopData = shopSnap.exists() ? shopSnap.data() : {};

        const bookingRef = await addDoc(collection(db, "bookings"), {
          artistId: offerData.artistId,
          artistName: offerData.displayName,
          artistAvatar: offerData.artistAvatar ?? null,
          clientId: offerData.clientId,
          offerId,
          price: offerData.price,
          depositAmount: offerData.depositPolicy.amount,
          paymentType: offerData.paymentType,
          externalPaymentDetails:
            offerData.paymentType === "external"
              ? offerData.externalPaymentDetails ?? null
              : null,
          finalPaymentTiming: offerData.finalPaymentTiming ?? "after",
          shopId: offerData.shopId ?? null,
          shopName: offerData.shopName ?? shopData.name ?? "Unavailable",
          shopAddress: offerData.shopAddress ?? shopData.address ?? "Unavailable",
          shopMapLink: offerData.shopMapLink ?? shopData.mapLink ?? null,
          selectedDate: selectedDate ?? { date: "TBD", time: "TBD" },
          sampleImageUrl: offerData.fullUrl ?? null,
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
    if (clientId) fetchOffers();
  }, [clientId]);

  const sortedOffers = useMemo(
    () => [...offers].sort((a, b) => getOfferTime(b) - getOfferTime(a)),
    [offers]
  );
  const pendingCount = offers.length;

  if (loading) return <SectionSkeleton />;

  return (
    <section className="mx-auto mt-6 max-w-7xl space-y-6">
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedOffers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              onOpen={() => {
                setSelectedOffer(offer);
                setIsModalOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <ViewOfferModal
        offer={selectedOffer}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRespond={async (offerId, action, selectedDate) => {
          const bookingId = await handleResponse(offerId, action, selectedDate);
          if (bookingId) {
            setSelectedOffer((prev) => (prev ? { ...prev, bookingId } : prev));
          }
        }}
      />
    </section>
  );
};

const OfferCard = ({ offer, onOpen }: { offer: DashboardOffer; onOpen: () => void }) => {
  const previewUrl = offer.thumbUrl || offer.fullUrl || "";
  const firstDateOption = offer.dateOptions?.find((option) => option.date && option.time);

  return (
    <article className="group overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg transition hover:border-white/20 hover:bg-[#151515]">
      <button type="button" onClick={onOpen} className="block w-full p-0! text-left">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={offer.artistAvatar || "/default-avatar.png"} alt={offer.displayName} className="h-11 w-11 rounded-full border border-white/10 object-cover" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{offer.displayName || "Artist"}</p>
              <p className="text-xs text-neutral-500">Sent {formatShortDate(offer.createdAt)}</p>
            </div>
          </div>
          <StatusBadge status={offer.status || "pending"} />
        </div>
        <div className="relative h-48 bg-black">
          {previewUrl ? (
            <img src={previewUrl} alt="Offer sample" className="h-full w-full object-cover opacity-85 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-100" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
              <ImageIcon size={26} />
              <span className="text-sm">No sample image</span>
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-2">
            <InfoPill icon={<DollarSign size={14} />} label={`$${offer.price}`} />
            <InfoPill icon={<ReceiptText size={14} />} label={formatDeposit(offer)} />
            <InfoPill icon={<CalendarDays size={14} />} label={firstDateOption ? formatAppointment(firstDateOption, "compact") : "No date"} />
            <InfoPill icon={<Store size={14} />} label={offer.shopName || "Shop"} />
          </div>
          <p className="mt-4 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-neutral-300">
            {offer.message || "No artist message included."}
          </p>
        </div>
      </button>
      <div className="border-t border-white/10 p-4">
        <button type="button" onClick={onOpen} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-3! py-2.5! text-sm! font-semibold text-black transition hover:bg-white/85">
          <Eye size={16} />
          Review offer
        </button>
      </div>
    </article>
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
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}>{status}</span>;
};

const InfoPill = ({ icon, label }: { icon: ReactNode; label?: string | number }) => (
  <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-2 text-xs text-neutral-300">
    <span className="text-neutral-500">{icon}</span>
    <span className="truncate">{label || "Not set"}</span>
  </span>
);

const EmptyState = ({ icon, title, description }: { icon: ReactNode; title: string; description: string }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">{icon}</div>
    <h2 className="mt-4 text-xl! font-semibold! text-white">{title}</h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">{description}</p>
  </div>
);

const SectionSkeleton = () => (
  <section className="mx-auto mt-6 max-w-7xl space-y-6">
    <div className="h-36 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />)}
    </div>
  </section>
);

const formatDeposit = (offer: Offer) => offer.depositPolicy?.depositRequired ? `$${offer.depositPolicy.amount || 0}` : "Not required";

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
