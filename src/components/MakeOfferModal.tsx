import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  Clock,
  DollarSign,
  MapPin,
  MessageSquareText,
  Send,
  X,
} from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "../firebase/firebaseConfig";
import type {
  Flash,
  FlashAvailabilityStatus,
  FlashRepeatability,
} from "../types/Flash";
import {
  getFlashAvailabilityStatus,
  getFlashRepeatability,
  isFlashAvailableForClients,
} from "../utils/flashAvailability";
import {
  getTodayDateInputValue,
  isPastDateInputValue,
} from "../utils/dateInputGuards";
import QuarterHourTimeSelect from "./ui/QuarterHourTimeSelect";

type BookingRequest = {
  id: string;
  clientId: string;
  clientFirstName?: string;
  clientLastName?: string;
  clientName: string;
  clientAvatar: string;
  description?: string;
  bodyPlacement: string;
  size: string;
  budget?: string | number;
  fullUrl?: string;
  thumbUrl?: string;
  offerFullUrl?: string | null;
  offerThumbUrl?: string | null;
  offerImageFilename?: string | null;
  sourceType?: string;
  flashId?: string;
  flashTitle?: string;
  flashDescription?: string | null;
  flashPrice?: number | null;
  flashSheetId?: string | null;
  flashRepeatability?: FlashRepeatability;
  flashAvailabilityStatus?: FlashAvailabilityStatus;
  isFromSheet?: boolean;
};

type OfferArtist = {
  displayName?: string;
  avatarUrl?: string;
  shopId?: string;
  depositPolicy?: { amount?: number };
};

type ShopDetails = {
  name?: string;
  address?: string;
  mapLink?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  artist: OfferArtist | null;
  uid: string;
  selectedRequest: BookingRequest | null;
  depositAmount: number;
  setDepositAmount: Dispatch<SetStateAction<number>>;
  offerPrice: number;
  setOfferPrice: Dispatch<SetStateAction<number>>;
  offerMessage: string;
  setOfferMessage: Dispatch<SetStateAction<string>>;
  dateOptions: { date: string; time: string }[];
  setDateOptions: Dispatch<SetStateAction<{ date: string; time: string }[]>>;
  onOfferSent?: (requestId: string, offerId?: string) => void | Promise<void>;
  shouldUpdateRequestStatus?: boolean;
  additionalOfferData?: Record<string, unknown>;
};

const OFFER_STEPS = ["Deposit", "Appointment", "Note", "Review"] as const;
const MAX_APPOINTMENT_OPTIONS = 3;

const MakeOfferModal = ({
  isOpen,
  onClose,
  selectedRequest,
  depositAmount,
  setDepositAmount,
  offerPrice,
  setOfferPrice,
  offerMessage,
  setOfferMessage,
  dateOptions,
  setDateOptions,
  onOfferSent,
  uid,
  artist,
  shouldUpdateRequestStatus = true,
  additionalOfferData,
}: Props) => {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const today = getTodayDateInputValue();

  const listedPrice = Number(selectedRequest?.flashPrice || offerPrice || 0);
  const maximumDeposit = Math.round(listedPrice * 50) / 100;
  const completedDateOptions = useMemo(
    () => dateOptions.filter((option) => option.date && option.time),
    [dateOptions]
  );
  const shopBalance = Math.max(listedPrice - Number(depositAmount || 0), 0);

  useEffect(() => {
    if (!isOpen || !selectedRequest) return;
    setStep(0);
    const price = Number(selectedRequest.flashPrice || 0);
    setOfferPrice(price);
    setDepositAmount((current) => {
      if (current > 0) return Math.min(current, price * 0.5);
      const preferred = Number(artist?.depositPolicy?.amount || 0);
      return preferred > 0 ? Math.min(preferred, price * 0.5) : 0;
    });
  }, [artist?.depositPolicy?.amount, isOpen, selectedRequest, setDepositAmount, setOfferPrice]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !selectedRequest || !artist) return null;

  const reset = () => {
    setStep(0);
    setOfferPrice(0);
    setDepositAmount(0);
    setOfferMessage("");
    setDateOptions(
      Array.from({ length: MAX_APPOINTMENT_OPTIONS }, () => ({
        date: "",
        time: "",
      }))
    );
  };

  const close = () => {
    if (isSubmitting) return;
    onClose();
  };

  const getStepError = (targetStep = step) => {
    if (selectedRequest.sourceType !== "flash" || !selectedRequest.flashId) {
      return "Only flash requests can receive offers at launch.";
    }
    if (!Number.isFinite(listedPrice) || listedPrice <= 0) {
      return "This flash needs a listed price before you can send an offer.";
    }
    if (targetStep >= 0) {
      if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
        return "Enter a booking deposit.";
      }
      if (depositAmount > maximumDeposit) {
        return `The deposit cannot exceed $${maximumDeposit.toFixed(2)}.`;
      }
    }
    if (targetStep >= 1) {
      if (completedDateOptions.length === 0) {
        return "Add at least one appointment option.";
      }
      if (
        completedDateOptions.some((option) =>
          isPastDateInputValue(option.date)
        )
      ) {
        return "Appointment options must be today or later.";
      }
    }
    return null;
  };

  const continueToNextStep = () => {
    const error = getStepError(step);
    if (error) {
      toast.error(error);
      return;
    }
    setStep((current) => Math.min(current + 1, OFFER_STEPS.length - 1));
  };

  const updateAppointment = (
    index: number,
    field: "date" | "time",
    value: string
  ) => {
    setDateOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [field]: value } : option
      )
    );
  };

  const submitOffer = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = getStepError(OFFER_STEPS.length - 1);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      const flashRef = doc(db, "flashes", selectedRequest.flashId!);
      const flashSnap = await getDoc(flashRef);
      if (!flashSnap.exists()) {
        toast.error("This flash is no longer available.");
        return;
      }
      const flash = { id: flashSnap.id, ...flashSnap.data() } as Flash;
      if (
        flash.artistId !== uid ||
        !isFlashAvailableForClients(flash)
      ) {
        toast.error(
          getFlashRepeatability(flash) === "one_of_one"
            ? "This one-of-one flash is no longer available."
            : "This flash is no longer available."
        );
        return;
      }

      const authoritativePrice = Number(flash.price || 0);
      const authoritativeMaximumDeposit = authoritativePrice * 0.5;
      if (
        authoritativePrice <= 0 ||
        depositAmount <= 0 ||
        depositAmount > authoritativeMaximumDeposit
      ) {
        toast.error("The flash price changed. Review the deposit and try again.");
        setOfferPrice(authoritativePrice);
        setStep(0);
        return;
      }

      let shop: ShopDetails | null = null;
      if (artist.shopId) {
        const shopSnap = await getDoc(doc(db, "shops", artist.shopId));
        if (shopSnap.exists()) shop = shopSnap.data() as ShopDetails;
      }

      const revisionData = additionalOfferData
        ? {
            previousOfferId:
              typeof additionalOfferData.previousOfferId === "string"
                ? additionalOfferData.previousOfferId
                : null,
            revisionOfOfferId:
              typeof additionalOfferData.revisionOfOfferId === "string"
                ? additionalOfferData.revisionOfOfferId
                : null,
            revisionReason:
              typeof additionalOfferData.revisionReason === "string"
                ? additionalOfferData.revisionReason
                : null,
          }
        : {};
      const fullUrl = flash.fullUrl || flash.webp90Url || flash.thumbUrl || null;
      const thumbUrl = flash.thumbUrl || flash.webp90Url || flash.fullUrl || null;

      const offerRef = await addDoc(collection(db, "offers"), {
        sourceType: "flash",
        flashId: flash.id,
        requestId: selectedRequest.id,
        artistId: uid,
        displayName: artist.displayName || "Artist",
        artistAvatar: artist.avatarUrl || null,
        clientId: selectedRequest.clientId,
        clientFirstName: selectedRequest.clientFirstName || "",
        clientLastName: selectedRequest.clientLastName || "",
        clientName: selectedRequest.clientName,
        clientAvatar: selectedRequest.clientAvatar,
        shopId: artist.shopId || null,
        shopName: shop?.name || "Shop pending review",
        shopAddress: shop?.address || null,
        shopMapLink: shop?.mapLink || null,
        price: authoritativePrice,
        message: offerMessage.trim(),
        dateOptions: completedDateOptions,
        fullUrl,
        thumbUrl,
        flashTitle: flash.title || flash.caption || "Untitled flash",
        flashDescription: flash.description || null,
        flashPrice: authoritativePrice,
        flashSheetId: flash.sheetId || null,
        flashRepeatability: getFlashRepeatability(flash),
        flashAvailabilityStatus: getFlashAvailabilityStatus(flash),
        isFromSheet: flash.isFromSheet === true,
        paymentType: "internal",
        depositPolicy: {
          amount: Number(depositAmount),
          depositRequired: true,
          nonRefundable: true,
        },
        finalPaymentTiming: "after",
        allowExternalRemainingPayment: shopBalance > 0,
        ...revisionData,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (shouldUpdateRequestStatus) {
        await updateDoc(doc(db, "bookingRequests", selectedRequest.id), {
          status: "offered",
          offeredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await onOfferSent?.(selectedRequest.id, offerRef.id);
      toast.success("Flash offer sent.");
      reset();
      onClose();
    } catch (error) {
      console.error("Failed to send flash offer:", error);
      toast.error("Could not send this flash offer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const imageUrl =
    selectedRequest.thumbUrl || selectedRequest.fullUrl || "/default-avatar.png";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 px-3 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm md:items-center md:p-6">
      <form
        onSubmit={submitOffer}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111] text-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Flash offer
            </p>
            <h2 className="mt-1 text-xl! font-semibold! text-white">
              Offer for {selectedRequest.clientName || "client"}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] p-0! text-neutral-300 hover:bg-white/10 hover:text-white"
            aria-label="Close offer"
          >
            <X size={17} />
          </button>
        </header>

        <nav className="grid shrink-0 grid-cols-4 gap-1.5 border-b border-white/10 px-3 py-3 sm:px-6" aria-label="Offer steps">
          {OFFER_STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (index <= step) setStep(index);
              }}
              className={`min-w-0 rounded-lg border px-1! py-2! text-[10px]! font-semibold transition sm:text-xs! ${
                index === step
                  ? "border-white/35 bg-white/[0.09] text-white"
                  : index < step
                  ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                  : "border-white/8 bg-white/[0.025] text-neutral-500"
              }`}
              aria-current={index === step ? "step" : undefined}
            >
              <span className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-md bg-white/10">
                {index < step ? <Check size={12} /> : index + 1}
              </span>
              <span className="block truncate">{label}</span>
            </button>
          ))}
        </nav>

        <div className="request-modal-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {step === 0 && (
            <section className="space-y-5 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
              <SectionHeading icon={<DollarSign size={18} />} title="Booking deposit" description="The published flash price stays fixed. Choose the deposit that secures this appointment." />
              <FlashSummary imageUrl={imageUrl} title={selectedRequest.flashTitle || "Untitled flash"} price={listedPrice} />
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-neutral-300">Deposit amount</span>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <div className="flex min-w-0 items-center rounded-lg border border-white/10 bg-black/30 px-3 focus-within:border-white/30">
                    <span className="text-neutral-500">$</span>
                    <input type="number" min="0" max={maximumDeposit} step="0.01" value={depositAmount || ""} onChange={(event) => setDepositAmount(Number(event.target.value))} className="min-w-0 flex-1 border-0 bg-transparent px-2 py-3 text-white outline-none" />
                  </div>
                  <button type="button" onClick={() => setDepositAmount(maximumDeposit)} className="rounded-lg border border-white/15 bg-white/[0.06] px-3! py-2! text-xs! font-semibold text-white hover:bg-white/10">USE MAX</button>
                </div>
                <span className="mt-2 block text-xs text-neutral-500">Maximum ${maximumDeposit.toFixed(2)} (up to 50% of the flash price)</span>
              </label>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm text-neutral-300">The client pays the deposit through Stripe to secure the booking.</p>
                <div className="my-3 h-px bg-white/10" />
                <p className="text-sm text-neutral-300">The remaining <strong className="text-white">${shopBalance.toFixed(2)}</strong> is settled at the shop after the appointment.</p>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
              <SectionHeading icon={<CalendarDays size={18} />} title="Appointment options" description="Give the client up to three clear times to choose from." />
              {dateOptions.map((option, index) => (
                <div key={index} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Option {index + 1}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-400">Date</span>
                      <input type="date" min={today} value={option.date} onChange={(event) => updateAppointment(index, "date", event.target.value)} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-white/30" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-400">Time</span>
                      <QuarterHourTimeSelect value={option.time} onChange={(value) => updateAppointment(index, "time", value)} placeholder="Select time" buttonClassName="rounded-lg" />
                    </label>
                  </div>
                </div>
              ))}
            </section>
          )}

          {step === 2 && (
            <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
              <SectionHeading icon={<MessageSquareText size={18} />} title="Optional note" description="Share preparation details, arrival instructions, or anything the client should know." />
              <label className="block">
                <span className="sr-only">Offer note</span>
                <textarea value={offerMessage} onChange={(event) => setOfferMessage(event.target.value)} maxLength={1200} placeholder="Add an optional note…" className="min-h-40 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white outline-none placeholder:text-neutral-600 focus:border-white/30" />
                <span className="mt-2 block text-right text-xs text-neutral-600">{offerMessage.length}/1200</span>
              </label>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
              <SectionHeading icon={<Check size={18} />} title="Review offer" description="Confirm the deposit and appointment choices before sending." />
              <FlashSummary imageUrl={imageUrl} title={selectedRequest.flashTitle || "Untitled flash"} price={listedPrice} />
              <div className="grid gap-2 sm:grid-cols-3">
                <ReviewTile label="Deposit" value={`$${depositAmount.toFixed(2)}`} />
                <ReviewTile label="At shop" value={`$${shopBalance.toFixed(2)}`} />
                <ReviewTile label="Options" value={String(completedDateOptions.length)} />
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Appointment choices</p>
                <div className="space-y-2">
                  {completedDateOptions.map((option, index) => (
                    <p key={`${option.date}-${option.time}`} className="flex items-center gap-2 text-sm text-neutral-300"><Clock size={14} className="text-neutral-500" />Option {index + 1}: {formatDate(option.date)} at {option.time}</p>
                  ))}
                </div>
              </div>
              {offerMessage.trim() && <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-neutral-300">{offerMessage.trim()}</div>}
              <p className="flex items-center gap-2 text-xs text-neutral-500"><MapPin size={14} /> Remaining balance is paid directly at the shop.</p>
            </section>
          )}
        </div>

        <footer className="grid shrink-0 grid-cols-3 gap-2 border-t border-white/10 bg-[#151515] p-3 sm:flex sm:justify-end sm:px-6">
          <button type="button" onClick={close} className="rounded-lg border border-white/10 bg-white/[0.03] px-4! py-2.5! text-xs! font-semibold text-neutral-300 hover:bg-white/10">Cancel</button>
          <button type="button" disabled={step === 0 || isSubmitting} onClick={() => setStep((current) => Math.max(current - 1, 0))} className="rounded-lg border border-white/10 bg-white/[0.03] px-4! py-2.5! text-xs! font-semibold text-neutral-300 disabled:opacity-35">Back</button>
          {step < OFFER_STEPS.length - 1 ? (
            <button type="button" onClick={continueToNextStep} className="rounded-lg bg-white px-4! py-2.5! text-xs! font-semibold text-black hover:bg-neutral-200">Continue</button>
          ) : (
            <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4! py-2.5! text-xs! font-semibold text-black hover:bg-neutral-200 disabled:opacity-60">{isSubmitting ? "Sending…" : "Send offer"}<Send size={15} /></button>
          )}
        </footer>
      </form>
    </div>,
    document.body
  );
};

const SectionHeading = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="flex items-start gap-3">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-[var(--color-primary)]">{icon}</span>
    <div><h3 className="text-lg! font-semibold! text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-neutral-400">{description}</p></div>
  </div>
);

const FlashSummary = ({ imageUrl, title, price }: { imageUrl: string; title: string; price: number }) => (
  <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
    <div className="flex h-[72px] items-center justify-center overflow-hidden rounded-lg bg-black"><img src={imageUrl} alt="" className="h-full w-full object-contain" /></div>
    <div className="min-w-0"><p className="truncate font-semibold text-white">{title}</p><p className="mt-1 text-sm text-neutral-400">Published price</p><p className="text-lg font-semibold text-white">${price.toFixed(2)}</p></div>
  </div>
);

const ReviewTile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{label}</p><p className="mt-1 font-semibold text-white">{value}</p></div>
);

const formatDate = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
};

export default MakeOfferModal;
