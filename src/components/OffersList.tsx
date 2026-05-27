import {
  Fragment,
  type ComponentProps,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  CalendarDays,
  DollarSign,
  Eye,
  ImageIcon,
  Layers,
  MapPin,
  MessageSquareText,
  ReceiptText,
  Send,
  Store,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import MakeOfferModal from "./MakeOfferModal";
import type { Offer } from "../types/Offer";
import { toast } from "react-hot-toast";

type FirestoreTimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

type DashboardOffer = Offer & {
  createdAt?: Date | FirestoreTimestampLike | null;
  status: "pending" | "accepted" | "declined" | "expired" | string;
  artistDismissedAt?: FirestoreTimestampLike | Date | null;
  revisionOfOfferId?: string;
  revisedByOfferId?: string;
};

type OfferStatusFilter = "all" | "pending" | "declined";

type OffersListArtist = ComponentProps<typeof MakeOfferModal>["artist"];
type RevisionRequest = ComponentProps<typeof MakeOfferModal>["selectedRequest"];

const statusFilters: { label: string; value: OfferStatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Waiting", value: "pending" },
  { label: "Declined", value: "declined" },
];

const OffersList = ({ uid, artist }: { uid: string; artist: OffersListArtist }) => {
  const [offers, setOffers] = useState<DashboardOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<DashboardOffer | null>(
    null
  );
  const [statusFilter, setStatusFilter] = useState<OfferStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [revisionSourceOffer, setRevisionSourceOffer] =
    useState<DashboardOffer | null>(null);
  const [revisionRequest, setRevisionRequest] = useState<RevisionRequest>(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const [offerPrice, setOfferPrice] = useState(0);
  const [offerMessage, setOfferMessage] = useState("");
  const [dateOptions, setDateOptions] = useState<
    { date: string; time: string }[]
  >([
    { date: "", time: "" },
    { date: "", time: "" },
    { date: "", time: "" },
  ]);

  useEffect(() => {
    if (!uid) return;

    setLoading(true);
    const offersQuery = query(
      collection(db, "offers"),
      where("artistId", "==", uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      offersQuery,
      (snapshot) => {
        const data = snapshot.docs.map((offerDoc) => ({
          id: offerDoc.id,
          ...offerDoc.data(),
        })) as DashboardOffer[];

        setOffers(data);
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to offers:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const activeOffers = useMemo(
    () =>
      offers.filter(
        (offer) =>
          offer.status !== "accepted" &&
          offer.status !== "revised" &&
          !offer.artistDismissedAt
      ),
    [offers]
  );

  const sortedOffers = useMemo(
    () => [...activeOffers].sort((a, b) => getOfferTime(b) - getOfferTime(a)),
    [activeOffers]
  );

  const filteredOffers = useMemo(
    () =>
      statusFilter === "all"
        ? sortedOffers
        : sortedOffers.filter((offer) => offer.status === statusFilter),
    [sortedOffers, statusFilter]
  );

  const pendingCount = activeOffers.filter((offer) => offer.status === "pending").length;
  const declinedCount = activeOffers.filter((offer) => offer.status === "declined").length;
  const newestOffer = sortedOffers[0];

  const handleReviseOffer = (offer: DashboardOffer) => {
    setSelectedOffer(null);
    setRevisionSourceOffer(offer);
    setRevisionRequest(getRevisionRequestFromOffer(offer));
    setOfferPrice(Number(offer.price || 0));
    setDepositAmount(Number(offer.depositPolicy?.amount || 0));
    setOfferMessage(offer.message || "");
    setDateOptions(normalizeDateOptions(offer.dateOptions));
  };

  const handleCloseRevisionModal = () => {
    setRevisionSourceOffer(null);
    setRevisionRequest(null);
  };

  const handleRevisionSent = async (_requestId: string, revisedOfferId?: string) => {
    if (!revisionSourceOffer) return;
    await updateDoc(doc(db, "offers", revisionSourceOffer.id), {
      status: "revised",
      artistDismissedAt: serverTimestamp(),
      revisedAt: serverTimestamp(),
      revisedByOfferId: revisedOfferId || null,
    });
  };

  const handleDismissOffer = async (offer: DashboardOffer) => {
    try {
      await updateDoc(doc(db, "offers", offer.id), {
        artistDismissedAt: serverTimestamp(),
        artistDismissedReason: "artist_cleared_declined_offer",
      });
      if (selectedOffer?.id === offer.id) setSelectedOffer(null);
      toast.success("Offer cleared from your list.");
    } catch (error) {
      console.error("Failed to dismiss offer", error);
      toast.error("Could not clear this offer.");
    }
  };

  if (loading) {
    return (
      <section className="mt-6 w-full max-w-7xl space-y-6">
        <div className="h-36 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-80 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Artist inbox
          </p>
          <h1 className="mt-2 text-3xl! font-semibold text-white">
            Sent offers
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Track every offer you have sent, review proposed dates, and keep an
            eye on client responses.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          <MetricCard label="Waiting" value={pendingCount} />
          <MetricCard label="Declined" value={declinedCount} />
          <MetricCard
            label="Newest"
            value={newestOffer ? formatShortDate(newestOffer.createdAt) : "-"}
          />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
              <ReceiptText size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 className="mb-0! text-lg!">Offer filters</h2>
              <p className="text-sm text-neutral-400">
                Filter sent offers by current client response.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                className={`inline-flex h-10 items-center justify-center rounded-md border px-4! text-sm! font-semibold transition ${
                  statusFilter === filter.value
                    ? "border-white bg-white text-black"
                    : "border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                }`}
              >
                {filter.label}
              </button>
            ))}
            <span className="ml-1 text-sm text-neutral-500">
              Showing {filteredOffers.length} of {activeOffers.length}
            </span>
          </div>
        </div>
      </div>

      {filteredOffers.length === 0 ? (
        <EmptyOffers statusFilter={statusFilter} />
      ) : (
        <OffersTable
          offers={filteredOffers}
          onOpen={setSelectedOffer}
          onRevise={handleReviseOffer}
          onDismiss={handleDismissOffer}
        />
      )}

      <OfferDetailsDialog
        offer={selectedOffer}
        onClose={() => setSelectedOffer(null)}
        onRevise={handleReviseOffer}
        onDismiss={handleDismissOffer}
      />

      <MakeOfferModal
        isOpen={!!revisionRequest && !!revisionSourceOffer}
        onClose={handleCloseRevisionModal}
        selectedRequest={revisionRequest}
        depositAmount={depositAmount}
        setDepositAmount={setDepositAmount}
        offerPrice={offerPrice}
        setOfferPrice={setOfferPrice}
        offerMessage={offerMessage}
        setOfferMessage={setOfferMessage}
        dateOptions={dateOptions}
        setDateOptions={setDateOptions}
        artist={artist}
        uid={uid}
        shouldUpdateRequestStatus={false}
        additionalOfferData={
          revisionSourceOffer
            ? {
                previousOfferId: revisionSourceOffer.id,
                revisionOfOfferId:
                  revisionSourceOffer.revisionOfOfferId || revisionSourceOffer.id,
                revisionReason: "client_declined",
              }
            : undefined
        }
        onOfferSent={handleRevisionSent}
      />
    </section>
  );
};

const OffersTable = ({
  offers,
  onOpen,
  onRevise,
  onDismiss,
}: {
  offers: DashboardOffer[];
  onOpen: (offer: DashboardOffer) => void;
  onRevise: (offer: DashboardOffer) => void;
  onDismiss: (offer: DashboardOffer) => void;
}) => {
  const columns =
    "minmax(210px,1.15fr) 96px minmax(190px,.95fr) minmax(230px,1.2fr) minmax(190px,.88fr) minmax(210px,.86fr)";

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
      <div className="request-modal-scrollbar overflow-x-auto">
        <div className="min-w-[1120px]">
          <div
            className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
            style={{ gridTemplateColumns: columns }}
          >
            <span>Client</span>
            <span>Sample</span>
            <span>Pricing</span>
            <span>Schedule</span>
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
                onRevise={() => onRevise(offer)}
                onDismiss={() => onDismiss(offer)}
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
  onRevise,
  onDismiss,
}: {
  offer: DashboardOffer;
  columns: string;
  onOpen: () => void;
  onRevise: () => void;
  onDismiss: () => void;
}) => {
  const previewUrl = offer.thumbUrl || offer.fullUrl || "";
  const firstDateOption = offer.dateOptions?.find(
    (option) => option.date && option.time
  );
  const isFlashOffer = offer.sourceType === "flash";
  const isMultiSessionOffer = offer.projectType === "multi_session";

  return (
    <div
      className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
      style={{ gridTemplateColumns: columns }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 items-center gap-3 p-0! text-left"
      >
        <img
          src={offer.clientAvatar || "/default-avatar.png"}
          alt={offer.clientName || "Client"}
          className="h-11 w-11 rounded-full border border-white/10 object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">
            {offer.clientName || "Client"}
          </p>
          <p className="text-sm text-neutral-400">
            Sent {formatShortDate(offer.createdAt)}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="relative h-14 w-16 overflow-hidden rounded-md border border-white/10 bg-white/[0.035] p-0!"
        aria-label="View offer sample"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={isFlashOffer ? offer.flashTitle || "Flash offer" : "Offer sample"}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-neutral-500">
            <ImageIcon size={18} />
          </span>
        )}
      </button>

      <div className="min-w-0 pr-4">
        <p className="truncate text-sm font-semibold text-white">
          ${offer.price}
        </p>
        <p className="mt-1 truncate text-xs text-neutral-500">
          Deposit {formatDeposit(offer)}
        </p>
      </div>

      <div className="min-w-0 pr-4">
        <p className="truncate text-sm font-medium text-white">
          {firstDateOption ? formatAppointment(firstDateOption, "compact") : "No date set"}
        </p>
        <p className="mt-1 truncate text-xs text-neutral-500">
          {isFlashOffer
            ? offer.flashTitle || "Flash item"
            : isMultiSessionOffer
            ? `${offer.estimatedSessionCount || 2} sessions`
            : offer.shopName || "Shop not set"}
        </p>
      </div>

      <StatusBadge status={offer.status} />

      <div className="flex items-center justify-end gap-2">
        {offer.status === "declined" && (
          <>
            <button
              type="button"
              onClick={onRevise}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3! text-xs! font-semibold text-black transition hover:bg-white/85"
            >
              <Send size={14} />
              Send new
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] p-0! text-neutral-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss declined offer"
              title="Dismiss declined offer"
            >
              <X size={14} />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white transition hover:bg-white/10"
        >
          <Eye size={14} />
          Details
        </button>
      </div>
    </div>
  );
};

const OfferDetailsDialog = ({
  offer,
  onClose,
  onRevise,
  onDismiss,
}: {
  offer: DashboardOffer | null;
  onClose: () => void;
  onRevise: (offer: DashboardOffer) => void;
  onDismiss: (offer: DashboardOffer) => void;
}) => (
  <Transition appear show={!!offer} as={Fragment}>
    <Dialog as="div" className="relative z-50" onClose={onClose}>
      <Transition.Child
        as={Fragment}
        enter="ease-out duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-in duration-150"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />
      </Transition.Child>

      <div className="fixed inset-0 overflow-y-auto request-modal-scrollbar">
        <div className="flex min-h-full items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="scale-95 opacity-0"
            enterTo="scale-100 opacity-100"
            leave="ease-in duration-150"
            leaveFrom="scale-100 opacity-100"
            leaveTo="scale-95 opacity-0"
          >
            <Dialog.Panel className="w-full max-w-6xl overflow-hidden rounded-lg border border-white/10 bg-[#111111] text-white shadow-2xl">
              {offer && (
                <>
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                        {offer.sourceType === "flash"
                          ? "Flash offer details"
                          : "Offer details"}
                      </p>
                      <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                        {offer.sourceType === "flash"
                          ? `Flash offer sent to ${offer.clientName || "Client"}`
                          : `Offer sent to ${offer.clientName || "Client"}`}
                      </Dialog.Title>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                      aria-label="Close offer details"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="grid gap-0 lg:grid-cols-[1fr_0.95fr]">
                    <div className="border-b border-white/10 bg-black lg:border-b-0 lg:border-r">
                      {offer.fullUrl || offer.thumbUrl ? (
                        <img
                          src={offer.fullUrl || offer.thumbUrl}
                          alt={offer.sourceType === "flash" ? offer.flashTitle || "Flash offer" : "Offer sample"}
                          className="h-full max-h-[72vh] min-h-[420px] w-full object-contain"
                        />
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
                          <img
                            src={offer.clientAvatar || "/default-avatar.png"}
                            alt={offer.clientName || "Client"}
                            className="h-14 w-14 rounded-full border border-white/10 object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-white">
                              {offer.clientName || "Client"}
                            </p>
                            <p className="text-sm text-neutral-500">
                              Sent {formatShortDate(offer.createdAt)}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={offer.status} />
                      </div>

                      {offer.status === "declined" && (
                        <div className="mt-5 rounded-lg border border-red-300/20 bg-red-300/10 p-4">
                          <p className="text-sm font-semibold text-white">
                            Client declined this offer
                          </p>
                          <p className="mt-1 text-sm leading-6 text-red-50/75">
                            You can send a fresh offer with updated price, deposit,
                            message, or appointment options. Clearing it only removes
                            it from your list.
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => onRevise(offer)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-3! text-sm! font-semibold text-black transition hover:bg-white/85"
                            >
                              <Send size={15} />
                              Send new offer
                            </button>
                            <button
                              type="button"
                              onClick={() => onDismiss(offer)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3! text-sm! font-semibold text-white transition hover:bg-white/10"
                            >
                              <X size={15} />
                              Clear
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {offer.sourceType === "flash" && (
                          <DetailTile
                            icon={<ReceiptText size={17} />}
                            label="Flash item"
                            value={offer.flashTitle || "Untitled flash"}
                          />
                        )}
                        <DetailTile
                          icon={<DollarSign size={17} />}
                          label={
                            offer.sourceType === "flash"
                              ? "Listed flash price"
                              : "Offer price"
                          }
                          value={`$${offer.price}`}
                        />
                        <DetailTile
                          icon={<ReceiptText size={17} />}
                          label="Deposit"
                          value={formatDeposit(offer)}
                        />
                        <DetailTile
                          icon={<Store size={17} />}
                          label="Shop"
                          value={offer.shopName || "Unavailable"}
                        />
                        {offer.projectType === "multi_session" && (
                          <>
                            <DetailTile
                              icon={<Layers size={17} />}
                              label="Sessions"
                              value={`${offer.estimatedSessionCount || 2}`}
                            />
                            <DetailTile
                              icon={<DollarSign size={17} />}
                              label="Per session"
                              value={`$${offer.estimatedSessionPrice || 0}`}
                            />
                          </>
                        )}
                      </div>

                      <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                          <CalendarDays size={17} />
                          Proposed appointment options
                        </div>
                        {offer.dateOptions?.length ? (
                          <div className="grid gap-2">
                            {offer.dateOptions.map((option, index) => (
                              <div
                                key={`${option.date}-${option.time}-${index}`}
                                className="flex items-center justify-between rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm"
                              >
                                <span className="text-neutral-500">
                                  Option {index + 1}
                                </span>
                                <span className="font-medium text-white">
                                  {formatAppointment(option)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-500">
                            No appointment options were included.
                          </p>
                        )}
                      </div>

                      <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                          <MessageSquareText size={17} />
                          Artist message
                        </div>
                        <p className="whitespace-pre-line text-sm leading-6 text-neutral-300">
                          {offer.message || "No message included."}
                        </p>
                      </div>

                      {offer.shopAddress && (
                        <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                            <MapPin size={17} />
                            Location
                          </div>
                          <p className="text-sm text-neutral-300">
                            {offer.shopAddress}
                          </p>
                        </div>
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

const MetricCard = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
      {label}
    </p>
    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const normalized = status || "pending";
  const className =
    normalized === "accepted"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : normalized === "declined"
      ? "border-red-300/25 bg-red-300/10 text-red-100"
      : "border-amber-300/20 bg-amber-300/10 text-amber-100";

  return (
    <span
      className={`inline-flex w-fit justify-self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {getOfferStatusLabel(normalized)}
    </span>
  );
};

const DetailTile = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
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

const EmptyOffers = ({ statusFilter }: { statusFilter: OfferStatusFilter }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
      <ReceiptText size={22} />
    </div>
    <h2 className="mt-4 text-xl! font-semibold! text-white">
      {statusFilter === "all"
        ? "No offers sent yet"
        : statusFilter === "pending"
        ? "No offers waiting on clients"
        : `No ${statusFilter} offers`}
    </h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
      {statusFilter === "all"
        ? "Once you make offers from tattoo requests, they will appear here with status, pricing, and appointment details."
        : "Try a different status filter to review the rest of your sent offers."}
    </p>
  </div>
);

const getOfferStatusLabel = (status: string) => {
  if (status === "pending") return "Waiting client response";
  if (status === "declined") return "Declined";
  if (status === "accepted") return "Accepted";
  return status.replace("_", " ");
};

const getRevisionRequestFromOffer = (offer: DashboardOffer): RevisionRequest => ({
  id: offer.requestId || offer.id,
  clientId: offer.clientId,
  clientName: offer.clientName || "Client",
  clientAvatar: offer.clientAvatar || "/default-avatar.png",
  description: offer.message || "",
  bodyPlacement: "",
  size: "",
  fullUrl: offer.fullUrl,
  thumbUrl: offer.thumbUrl,
  sourceType: offer.sourceType,
  flashId: offer.flashId || undefined,
  flashTitle: offer.flashTitle || undefined,
  flashPrice: offer.flashPrice ?? undefined,
  flashSheetId: offer.flashSheetId || undefined,
  isFromSheet: Boolean(offer.isFromSheet),
});

const normalizeDateOptions = (
  options: { date: string; time: string }[] | undefined
) => {
  const next = options?.length
    ? options.slice(0, 3)
    : [{ date: "", time: "" }];

  while (next.length < 3) next.push({ date: "", time: "" });
  return next;
};

const formatDeposit = (offer: DashboardOffer) => {
  const amount = offer.depositPolicy?.amount;
  if (!offer.depositPolicy?.depositRequired) return "Not required";
  return typeof amount === "number" ? `$${amount}` : "$0";
};

const formatAppointment = (
  option: { date: string; time: string },
  mode: "compact" | "long" = "long"
) => {
  if (!option.date || !option.time) return "Not set";
  const [year, month, day] = option.date.split("-").map(Number);
  const [hours, minutes] = option.time.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);

  return date.toLocaleString("en-US", {
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
  const date =
    createdAt instanceof Date
      ? createdAt
      : typeof createdAt.toDate === "function"
      ? createdAt.toDate()
      : typeof createdAt.seconds === "number"
      ? new Date(createdAt.seconds * 1000)
      : null;

  if (!date) return "New";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

export default OffersList;
