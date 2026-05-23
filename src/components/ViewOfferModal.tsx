import { useState } from "react";
import { toast } from "react-hot-toast";
import { httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";
import {
  CalendarDays,
  DollarSign,
  ImageIcon,
  MapPin,
  MessageSquareText,
  ReceiptText,
  Send,
  Store,
  X,
} from "lucide-react";
import type { Offer } from "../types/Offer";
import { functions } from "../firebase/firebaseConfig";

type Props = {
  offer: (Offer & { bookingId?: string }) | null;
  onClose: () => void;
  isOpen: boolean;
  onRespond: (
    offerId: string,
    action: "accepted" | "declined",
    selectedDate?: { date: string; time: string }
  ) => Promise<string | void>;
};

const ViewOfferModal = ({ offer, onClose, isOpen, onRespond }: Props) => {
  const [selectedDateOption, setSelectedDateOption] = useState<number | null>(null);
  const [isResponding, setIsResponding] = useState(false);

  if (!isOpen || !offer) return null;

  const handleCheckout = async (bookingId?: string) => {
    if (!bookingId) {
      toast.error("Booking could not be created. Please try again.");
      return;
    }

    const currentUser = getAuth().currentUser;
    if (!currentUser) {
      toast.error("You must be logged in to proceed with checkout.");
      return;
    }

    const createSession = httpsCallable(functions, "createCheckoutSession");
    const response = await createSession({
      bookingId,
      successUrl: `${window.location.origin}/payment-success?bookingId=${bookingId}`,
      cancelUrl: `${window.location.origin}/payment/${bookingId}`,
    });
    const { sessionUrl } = response.data as { sessionUrl: string };
    window.location.href = sessionUrl;
  };

  const handleAccept = async () => {
    if (selectedDateOption === null) {
      toast.error("Please select a date before accepting.");
      return;
    }

    try {
      setIsResponding(true);
      const bookingId = await onRespond(
        offer.id,
        "accepted",
        offer.dateOptions[selectedDateOption]
      );
      if (bookingId) {
        onClose();
        await handleCheckout(bookingId);
      }
    } catch (error) {
      console.error("Error during offer acceptance or checkout:", error);
      toast.error("Something went wrong.");
    } finally {
      setIsResponding(false);
    }
  };

  const handleDecline = async () => {
    setIsResponding(true);
    await onRespond(offer.id, "declined");
    setIsResponding(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 text-white backdrop-blur-md">
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">
              Offer details
            </p>
            <h2 className="mt-1 text-xl! font-semibold! text-white">
              {offer.displayName}'s offer
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
            aria-label="Close offer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto request-modal-scrollbar">
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
              <div className="flex items-center gap-4">
                <img
                  src={offer.artistAvatar || "/default-avatar.png"}
                  alt={offer.displayName}
                  className="h-14 w-14 rounded-full border border-white/10 object-cover"
                />
                <div>
                  <p className="font-semibold text-white">{offer.displayName}</p>
                  <p className="text-sm text-neutral-500">
                    {offer.shopName || "Studio not listed"}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <DetailTile icon={<DollarSign size={17} />} label="Price" value={`$${offer.price}`} />
                <DetailTile icon={<ReceiptText size={17} />} label="Deposit" value={`$${offer.depositPolicy?.amount || 0}`} />
                <DetailTile icon={<DollarSign size={17} />} label="Fallback" value={typeof offer.fallbackPrice === "number" ? `$${offer.fallbackPrice}` : "None"} />
                <DetailTile icon={<Store size={17} />} label="Studio" value={offer.shopName || "Unavailable"} />
              </div>

              {offer.shopAddress && (
                <a
                  href={offer.shopMapLink || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300 transition hover:bg-white/[0.06]"
                >
                  <MapPin size={17} className="mt-0.5 text-neutral-500" />
                  {offer.shopAddress}
                </a>
              )}

              <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <CalendarDays size={17} />
                  Choose an appointment
                </div>
                <div className="grid gap-2">
                  {offer.dateOptions.map((option, index) => (
                    <label
                      key={`${option.date}-${option.time}-${index}`}
                      className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-3 text-sm transition ${
                        selectedDateOption === index
                          ? "border-[#19d69b]/60 bg-[#19d69b]/10"
                          : "border-white/10 bg-black/25 hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="font-medium text-white">
                        {formatAppointment(option)}
                      </span>
                      <input
                        type="radio"
                        name="selectedDate"
                        checked={selectedDateOption === index}
                        onChange={() => setSelectedDateOption(index)}
                        className="accent-[#19d69b]"
                      />
                    </label>
                  ))}
                </div>
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
            </div>
          </div>

          {offer.status === "pending" && (
            <div className="flex flex-col-reverse gap-3 border-t border-white/10 bg-white/[0.03] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                disabled={isResponding}
                onClick={handleDecline}
                className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-5! py-3! text-sm! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Decline
              </button>
              <button
                type="button"
                disabled={isResponding}
                onClick={handleAccept}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResponding ? "Processing..." : "Accept and checkout"}
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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

const formatAppointment = (option: { date: string; time: string }) => {
  const [year, month, day] = option.date.split("-").map(Number);
  const [hours, minutes] = option.time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default ViewOfferModal;
