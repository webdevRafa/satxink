import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import {
  CalendarDays,
  Check,
  CreditCard,
  DollarSign,
  ImageIcon,
  MapPin,
  MessageSquareText,
  Store,
  X,
} from "lucide-react";
import type { Offer } from "../types/Offer";
import {
  calculateClientPaymentBreakdown,
  formatMoneyFromCents,
} from "../utils/paymentFees";

type Props = {
  offer: (Offer & { bookingId?: string }) | null;
  onClose: () => void;
  isOpen: boolean;
  onRespond: (
    offerId: string,
    action: "accepted" | "declined",
    selectedDate?: { date: string; time: string },
    declinedReason?: { value: string; label: string }
  ) => Promise<string | void>;
};

const DECLINE_REASON_OPTIONS = [
  { value: "appointment_timing", label: "Appointment timing" },
  { value: "price", label: "Price" },
  { value: "changed_mind", label: "Changed my mind" },
  { value: "other", label: "Other" },
];

const ViewOfferModal = ({ offer, onClose, isOpen, onRespond }: Props) => {
  const [selectedDateOption, setSelectedDateOption] = useState<number | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  useEffect(() => {
    setSelectedDateOption(null);
    setIsDeclining(false);
    setDeclineReason("");
  }, [offer?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const appointmentOptions = useMemo(
    () => getSortedAppointmentOptions(offer?.dateOptions),
    [offer?.dateOptions]
  );

  if (!isOpen || !offer) return null;

  const totalCents = Math.round(Number(offer.price || 0) * 100);
  const depositCents = Math.round(Number(offer.depositPolicy?.amount || 0) * 100);
  const shopBalanceCents = Math.max(totalCents - depositCents, 0);
  const checkout = calculateClientPaymentBreakdown(depositCents / 100, {
    platformFeeBaseAmount: totalCents / 100,
  });
  const imageUrl = offer.fullUrl || offer.thumbUrl || "";
  const selectedAppointment =
    selectedDateOption === null ? null : appointmentOptions[selectedDateOption];

  const handleAccept = async () => {
    if (!selectedAppointment) {
      toast.error("Choose an appointment time before accepting.");
      return;
    }
    setIsResponding(true);
    try {
      await onRespond(offer.id, "accepted", selectedAppointment);
    } finally {
      setIsResponding(false);
    }
  };

  const handleDecline = async () => {
    const option = DECLINE_REASON_OPTIONS.find(
      (reason) => reason.value === declineReason
    );
    if (!option) {
      toast.error("Choose a reason so the artist has helpful context.");
      return;
    }
    setIsResponding(true);
    try {
      await onRespond(offer.id, "declined", undefined, option);
      onClose();
    } finally {
      setIsResponding(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[160] bg-black/85 backdrop-blur-md" role="presentation">
      <div className="h-dvh overflow-y-auto overscroll-contain request-modal-scrollbar">
        <div className="flex min-h-full items-start justify-center px-3 pb-3 pt-[calc(5.25rem+env(safe-area-inset-top))] sm:items-center sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="flash-offer-title" className="flex w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#111111] text-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-4 py-4 sm:px-6">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">Flash offer</p>
                <h2 id="flash-offer-title" className="mt-1 text-xl font-semibold">Review {offer.displayName || "your artist"}&apos;s offer</h2>
              </div>
              <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0!" aria-label="Close offer"><X size={18} /></button>
            </header>

            <div className="grid min-h-0 overflow-y-auto overscroll-contain request-modal-scrollbar lg:grid-cols-[.82fr_1.18fr]">
              <div className="border-b border-white/10 bg-black lg:border-b-0 lg:border-r">
                {imageUrl ? (
                  <img src={imageUrl} alt={offer.flashTitle || "Flash tattoo"} className="max-h-[44vh] min-h-[260px] w-full object-contain lg:max-h-none lg:min-h-[560px]" />
                ) : (
                  <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-neutral-500 lg:min-h-[560px]"><ImageIcon size={34} /><span>Flash image unavailable</span></div>
                )}
              </div>

              <div className="space-y-5 p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <img src={offer.artistAvatar || "/default-avatar.png"} alt="" className="h-12 w-12 rounded-full border border-white/10 object-cover" />
                  <div className="min-w-0"><p className="truncate font-semibold">{offer.displayName || "Artist"}</p><p className="truncate text-sm text-neutral-500">{offer.shopName || "Shop pending review"}</p></div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">Flash</p>
                  <h3 className="mt-1 text-xl font-semibold">{offer.flashTitle || "Flash tattoo"}</h3>
                  {offer.flashDescription && <p className="mt-2 text-sm leading-6 text-neutral-400">{offer.flashDescription}</p>}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <SummaryTile icon={<DollarSign size={16} />} label="Flash price" value={formatMoneyFromCents(totalCents)} />
                  <SummaryTile icon={<CreditCard size={16} />} label="Deposit" value={formatMoneyFromCents(depositCents)} />
                  <SummaryTile icon={<Store size={16} />} label="At the shop" value={formatMoneyFromCents(shopBalanceCents)} />
                </div>

                <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.07] p-4">
                  <p className="text-sm font-semibold text-white">Simple payment plan</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-300">Pay the booking deposit through SATX Ink to secure the appointment. The remaining balance is paid directly to the artist at the shop after the appointment.</p>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3"><span className="text-sm text-neutral-400">Checkout total today</span><span className="font-semibold text-white">{formatMoneyFromCents(checkout.clientTotalCents)}</span></div>
                </div>

                <div>
                  <div className="flex items-center gap-2"><CalendarDays size={17} className="text-[var(--color-primary)]" /><h3 className="font-semibold">Choose an appointment</h3></div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {appointmentOptions.map((option, index) => {
                      const selected = selectedDateOption === index;
                      return <button key={`${option.date}-${option.time}`} type="button" onClick={() => setSelectedDateOption(index)} className={`flex items-center justify-between gap-3 rounded-lg border px-4! py-3! text-left transition ${selected ? "border-emerald-300/40 bg-emerald-300/10" : "border-white/10 bg-black/25 hover:bg-white/[0.05]"}`}><span><span className="block text-xs uppercase tracking-[0.13em] text-neutral-500">Option {index + 1}</span><span className="mt-1 block text-sm font-semibold text-white">{formatAppointment(option)}</span></span>{selected && <Check size={17} className="shrink-0 text-emerald-300" />}</button>;
                    })}
                  </div>
                </div>

                {offer.message && <div className="rounded-lg border border-white/10 bg-black/25 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText size={16} />Artist note</div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-neutral-400">{offer.message}</p></div>}
                {offer.shopAddress && <a href={offer.shopMapLink || undefined} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/25 p-4 text-sm text-neutral-300"><MapPin size={17} className="mt-0.5 shrink-0 text-neutral-500" />{offer.shopAddress}</a>}

                {isDeclining && <div className="rounded-lg border border-red-300/20 bg-red-300/[0.05] p-4"><label htmlFor="decline-reason" className="text-sm font-semibold">Why are you passing?</label><select id="decline-reason" value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} className="mt-3 h-11 w-full rounded-md border border-white/10 bg-[#0b0b0b] px-3 text-sm text-white"><option value="">Choose a reason</option>{DECLINE_REASON_OPTIONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select><div className="mt-3 flex gap-2"><button type="button" onClick={() => setIsDeclining(false)} className="flex-1 rounded-md border border-white/10 px-4! py-2.5! text-sm! font-semibold">Back</button><button type="button" disabled={isResponding} onClick={handleDecline} className="flex-1 rounded-md border border-red-300/30 bg-red-300/10 px-4! py-2.5! text-sm! font-semibold text-red-100 disabled:opacity-50">{isResponding ? "Declining..." : "Decline offer"}</button></div></div>}
              </div>
            </div>

            {!isDeclining && <footer className="flex shrink-0 gap-2 border-t border-white/10 bg-[#151515] p-3 sm:justify-end sm:px-6"><button type="button" disabled={isResponding} onClick={() => setIsDeclining(true)} className="flex-1 rounded-md border border-white/10 bg-white/[0.03] px-4! py-3! text-sm! font-semibold text-white sm:flex-none">Pass</button><button type="button" disabled={isResponding || !selectedAppointment} onClick={handleAccept} className="flex flex-[1.5] items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"><CreditCard size={16} />{isResponding ? "Creating booking..." : "Accept & review deposit"}</button></footer>}
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
};

const SummaryTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => <div className="rounded-lg border border-white/10 bg-black/25 p-3"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.13em] text-neutral-500">{icon}{label}</div><p className="mt-2 text-sm font-semibold text-white">{value}</p></div>;

const getSortedAppointmentOptions = (dateOptions?: { date: string; time: string }[]) => [...(dateOptions || [])].filter((option) => option.date && option.time).sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
const formatAppointment = (option: { date: string; time: string }) => new Date(`${option.date}T${option.time}`).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default ViewOfferModal;
