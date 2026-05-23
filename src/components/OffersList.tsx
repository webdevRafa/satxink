import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  CalendarDays,
  DollarSign,
  Eye,
  ImageIcon,
  MapPin,
  MessageSquareText,
  ReceiptText,
  Store,
  X,
} from "lucide-react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import type { Offer } from "../types/Offer";

type FirestoreTimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

type DashboardOffer = Offer & {
  createdAt?: Date | FirestoreTimestampLike | null;
  status: "pending" | "accepted" | "declined" | "expired" | string;
};

type OfferStatusFilter = "all" | "pending" | "accepted" | "declined";

const statusFilters: { label: string; value: OfferStatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
];

const OffersList = ({ uid }: { uid: string }) => {
  const [offers, setOffers] = useState<DashboardOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<DashboardOffer | null>(
    null
  );
  const [statusFilter, setStatusFilter] = useState<OfferStatusFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;

    const fetchOffers = async () => {
      setLoading(true);
      try {
        const offersQuery = query(
          collection(db, "offers"),
          where("artistId", "==", uid),
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(offersQuery);
        const data = snapshot.docs.map((offerDoc) => ({
          id: offerDoc.id,
          ...offerDoc.data(),
        })) as DashboardOffer[];

        setOffers(data);
      } catch (error) {
        console.error("Error fetching offers:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOffers();
  }, [uid]);

  const sortedOffers = useMemo(
    () => [...offers].sort((a, b) => getOfferTime(b) - getOfferTime(a)),
    [offers]
  );

  const filteredOffers = useMemo(
    () =>
      statusFilter === "all"
        ? sortedOffers
        : sortedOffers.filter((offer) => offer.status === statusFilter),
    [sortedOffers, statusFilter]
  );

  const pendingCount = offers.filter((offer) => offer.status === "pending").length;
  const acceptedCount = offers.filter((offer) => offer.status === "accepted").length;
  const newestOffer = sortedOffers[0];

  if (loading) {
    return (
      <section className="mx-auto mt-6 max-w-7xl space-y-6">
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
    <section className="mx-auto mt-6 max-w-7xl space-y-6">
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
          <MetricCard label="Pending" value={pendingCount} />
          <MetricCard label="Accepted" value={acceptedCount} />
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
              Showing {filteredOffers.length} of {offers.length}
            </span>
          </div>
        </div>
      </div>

      {filteredOffers.length === 0 ? (
        <EmptyOffers statusFilter={statusFilter} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredOffers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              onOpen={() => setSelectedOffer(offer)}
            />
          ))}
        </div>
      )}

      <OfferDetailsDialog
        offer={selectedOffer}
        onClose={() => setSelectedOffer(null)}
      />
    </section>
  );
};

const OfferCard = ({
  offer,
  onOpen,
}: {
  offer: DashboardOffer;
  onOpen: () => void;
}) => {
  const previewUrl = offer.thumbUrl || offer.fullUrl || "";
  const firstDateOption = offer.dateOptions?.find(
    (option) => option.date && option.time
  );

  return (
    <article className="group overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg transition hover:border-white/20 hover:bg-[#151515]">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full p-0! text-left"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={offer.clientAvatar || "/default-avatar.png"}
              alt={offer.clientName || "Client"}
              className="h-11 w-11 rounded-full border border-white/10 object-cover"
            />
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">
                {offer.clientName || "Client"}
              </p>
              <p className="text-xs text-neutral-500">
                Sent {formatShortDate(offer.createdAt)}
              </p>
            </div>
          </div>
          <StatusBadge status={offer.status} />
        </div>

        <div className="relative h-48 bg-black">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Offer sample"
              className="h-full w-full object-cover opacity-85 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-100"
            />
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
            <InfoPill
              icon={<ReceiptText size={14} />}
              label={formatDeposit(offer)}
            />
            <InfoPill
              icon={<CalendarDays size={14} />}
              label={
                firstDateOption
                  ? formatAppointment(firstDateOption, "compact")
                  : "No date set"
              }
            />
            <InfoPill icon={<Store size={14} />} label={offer.shopName || "Shop"} />
          </div>

          <p className="mt-4 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-neutral-300">
            {offer.message || "No artist message included."}
          </p>
        </div>
      </button>

      <div className="border-t border-white/10 p-4">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10"
        >
          <Eye size={16} />
          View details
        </button>
      </div>
    </article>
  );
};

const OfferDetailsDialog = ({
  offer,
  onClose,
}: {
  offer: DashboardOffer | null;
  onClose: () => void;
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
                        Offer details
                      </p>
                      <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                        Offer sent to {offer.clientName || "Client"}
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
                          alt="Offer sample"
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

                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <DetailTile
                          icon={<DollarSign size={17} />}
                          label="Offer price"
                          value={`$${offer.price}`}
                        />
                        <DetailTile
                          icon={<ReceiptText size={17} />}
                          label="Deposit"
                          value={formatDeposit(offer)}
                        />
                        <DetailTile
                          icon={<DollarSign size={17} />}
                          label="Fallback"
                          value={
                            typeof offer.fallbackPrice === "number"
                              ? `$${offer.fallbackPrice}`
                              : "None"
                          }
                        />
                        <DetailTile
                          icon={<Store size={17} />}
                          label="Shop"
                          value={offer.shopName || "Unavailable"}
                        />
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
      className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}
    >
      {normalized.replace("_", " ")}
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

const InfoPill = ({
  icon,
  label,
}: {
  icon: ReactNode;
  label?: string | number;
}) => (
  <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-2 text-xs text-neutral-300">
    <span className="text-neutral-500">{icon}</span>
    <span className="truncate">{label || "Not set"}</span>
  </span>
);

const EmptyOffers = ({ statusFilter }: { statusFilter: OfferStatusFilter }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
      <ReceiptText size={22} />
    </div>
    <h2 className="mt-4 text-xl! font-semibold! text-white">
      {statusFilter === "all"
        ? "No offers sent yet"
        : `No ${statusFilter} offers`}
    </h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
      {statusFilter === "all"
        ? "Once you make offers from tattoo requests, they will appear here with status, pricing, and appointment details."
        : "Try a different status filter to review the rest of your sent offers."}
    </p>
  </div>
);

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
