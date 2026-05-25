import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CalendarDays,
  DollarSign,
  ImageIcon,
  Info,
  Layers,
  MapPin,
  MessageSquareText,
  ReceiptText,
  Ruler,
  Send,
  Upload,
  X,
} from "lucide-react";
import { db, storage } from "../firebase/firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import toast from "react-hot-toast";
import {
  calculateClientPaymentBreakdown,
  formatMoneyFromCents,
} from "../utils/paymentFees";

type BookingRequest = {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatar: string;
  description: string;
  preferredDateRange?: string[];
  bodyPlacement: string;
  size: "small" | "medium" | "large" | "Small" | "Medium" | "Large" | string;
  fullUrl?: string;
  thumbUrl?: string;
  budget?: string | number;
};

type OfferArtist = {
  displayName?: string;
  avatarUrl?: string;
  shopId?: string;
  paymentType?: "internal" | "external";
  externalPaymentDetails?: {
    method?: string;
    handle?: string;
  } | null;
  depositPolicy?: {
    amount?: number;
  };
  finalPaymentTiming?: "before" | "after";
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
  fallbackPrice: number | null;
  setFallbackPrice: Dispatch<SetStateAction<number | null>>;
  offerMessage: string;
  setOfferMessage: Dispatch<SetStateAction<string>>;
  dateOptions: { date: string; time: string }[];
  setDateOptions: Dispatch<SetStateAction<{ date: string; time: string }[]>>;
  onOfferSent?: (requestId: string) => void;
};

const MakeOfferModal = ({
  isOpen,
  onClose,
  selectedRequest,
  depositAmount,
  setDepositAmount,
  offerPrice,
  setOfferPrice,
  fallbackPrice,
  setFallbackPrice,
  offerMessage,
  setOfferMessage,
  dateOptions,
  setDateOptions,
  onOfferSent,
  uid,
  artist,
}: Props) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [offerImage, setOfferImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allowExternalRemainingPayment, setAllowExternalRemainingPayment] =
    useState(false);
  const [externalRemainingPaymentNote, setExternalRemainingPaymentNote] =
    useState("");
  const [isMultiSessionProject, setIsMultiSessionProject] = useState(false);
  const [estimatedSessionCount, setEstimatedSessionCount] = useState(2);
  const [estimatedSessionPrice, setEstimatedSessionPrice] = useState(0);

  const requestImageUrl = selectedRequest?.thumbUrl || selectedRequest?.fullUrl || "";
  const completedDateOptions = useMemo(
    () => dateOptions.filter((option) => option.date && option.time),
    [dateOptions]
  );
  const artistDefaultDeposit = Number(artist?.depositPolicy?.amount || 0);
  const remainingArtistBalance = Math.max(
    Number(offerPrice || 0) - Number(depositAmount || 0),
    0
  );
  const canAllowExternalRemainingPayment =
    artist?.paymentType === "internal" &&
    Number(depositAmount || 0) > 0 &&
    remainingArtistBalance > 0;
  const sessionEstimate =
    isMultiSessionProject && estimatedSessionPrice > 0
      ? estimatedSessionPrice
      : isMultiSessionProject && estimatedSessionCount > 0
      ? Math.ceil(remainingArtistBalance / estimatedSessionCount)
      : remainingArtistBalance;
  const paymentPreview = useMemo(
    () =>
      calculateClientPaymentBreakdown(Number(depositAmount || 0), {
        platformFeeBaseAmount: Number(offerPrice || depositAmount || 0),
      }),
    [depositAmount, offerPrice]
  );

  useEffect(() => {
    if (isOpen && artistDefaultDeposit > 0 && depositAmount === 0) {
      setDepositAmount(artistDefaultDeposit);
    }
  }, [artistDefaultDeposit, depositAmount, isOpen, setDepositAmount]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!isOpen || !selectedRequest || !artist) return null;

  const resetOfferForm = () => {
    setOfferPrice(0);
    setFallbackPrice(null);
    setOfferMessage("");
    setDateOptions([
      { date: "", time: "" },
      { date: "", time: "" },
      { date: "", time: "" },
    ]);
    setOfferImage(null);
    setPreviewUrl(null);
    setAllowExternalRemainingPayment(false);
    setExternalRemainingPaymentNote("");
    setIsMultiSessionProject(false);
    setEstimatedSessionCount(2);
    setEstimatedSessionPrice(0);
  };

  const handleClose = () => {
    onClose();
  };

  const handleOfferSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!selectedRequest || !uid) return;

    if (!artist.paymentType || !["internal", "external"].includes(artist.paymentType)) {
      toast.error("Set a valid payment type before sending an offer.");
      return;
    }

    if (!offerPrice || offerPrice <= 0) {
      toast.error("Enter a valid offer price.");
      return;
    }

    if (fallbackPrice !== null && fallbackPrice >= offerPrice) {
      toast.error("Fallback price should be lower than the main offer.");
      return;
    }

    if (depositAmount < 0 || depositAmount > offerPrice) {
      toast.error("Deposit must be between $0 and the offer price.");
      return;
    }

    if (completedDateOptions.length === 0) {
      toast.error("Add at least one appointment option.");
      return;
    }

    if (isMultiSessionProject) {
      if (estimatedSessionCount < 2 || estimatedSessionCount > 12) {
        toast.error("Multi-session projects need 2 to 12 estimated sessions.");
        return;
      }

      if (sessionEstimate <= 0) {
        toast.error("Add a rough per-session estimate.");
        return;
      }
    }

    try {
      setIsSubmitting(true);

      let filename: string | null = null;
      let fullUrl: string | null = null;
      let thumbUrl: string | null = null;

      if (offerImage) {
        filename = `${uuidv4()}-${offerImage.name}`;
        const fullPath = `users/${uid}/offers/full/${filename}`;
        const fullRef = ref(storage, fullPath);
        await uploadBytes(fullRef, offerImage);
        fullUrl = await getDownloadURL(fullRef);

        const thumbRef = ref(storage, `users/${uid}/offers/thumbs/${filename}`);
        try {
          thumbUrl = await getDownloadURL(thumbRef);
        } catch {
          console.warn("Thumbnail not yet generated.");
        }
      }

      let shop: ShopDetails | null = null;
      if (artist.shopId) {
        const shopRef = doc(db, "shops", artist.shopId);
        const shopSnap = await getDoc(shopRef);
        if (shopSnap.exists()) {
          shop = shopSnap.data() as ShopDetails;
        }
      }

      const offerData = {
        artistId: uid,
        displayName: artist.displayName,
        artistAvatar: artist.avatarUrl || null,
        shopId: artist.shopId || null,
        shopName: shop?.name || "Unavailable",
        shopAddress: shop?.address || "Unavailable",
        shopMapLink: shop?.mapLink || null,
        clientId: selectedRequest.clientId,
        clientName: selectedRequest.clientName,
        clientAvatar: selectedRequest.clientAvatar,
        requestId: selectedRequest.id,
        price: offerPrice,
        fallbackPrice: fallbackPrice ?? null,
        message: offerMessage,
        dateOptions: completedDateOptions,
        imageFilename: filename || null,
        fullUrl: fullUrl || null,
        thumbUrl: thumbUrl || null,
        paymentType: artist.paymentType,
        externalPaymentDetails:
          artist.paymentType === "external"
            ? artist.externalPaymentDetails || null
            : null,
        depositPolicy: {
          amount: depositAmount,
          depositRequired: true,
          nonRefundable: true,
        },
        finalPaymentTiming: artist.finalPaymentTiming || "after",
        allowExternalRemainingPayment:
          canAllowExternalRemainingPayment && allowExternalRemainingPayment,
        externalRemainingPaymentNote:
          canAllowExternalRemainingPayment && allowExternalRemainingPayment
            ? externalRemainingPaymentNote.trim()
            : "",
        projectType: isMultiSessionProject ? "multi_session" : "single_session",
        estimatedSessionCount: isMultiSessionProject
          ? estimatedSessionCount
          : 1,
        estimatedSessionPrice: isMultiSessionProject ? sessionEstimate : null,
        sessionPaymentPlan: isMultiSessionProject
          ? "per_session"
          : "single_balance",
        sessionScheduling: isMultiSessionProject
          ? "first_session_now_rest_later"
          : "single_session",
        status: "pending",
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "offers"), offerData);
      await updateDoc(doc(db, "bookingRequests", selectedRequest.id), {
        status: "offered",
        offeredAt: serverTimestamp(),
      });

      toast.success("Offer sent.");
      onOfferSent?.(selectedRequest.id);
      resetOfferForm();
      onClose();
    } catch (error) {
      console.error("Failed to send offer:", error);
      toast.error("Could not send this offer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 text-white backdrop-blur-md">
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">
              Artist offer
            </p>
            <h2 className="mt-1 text-xl! font-semibold! text-white">
              Create offer for {selectedRequest.clientName}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
            aria-label="Close offer modal"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleOfferSubmit}
          className="overflow-y-auto request-modal-scrollbar"
        >
          <div className="grid gap-0 lg:grid-cols-[0.78fr_1.22fr]">
            <aside className="border-b border-white/10 bg-black/25 p-5 lg:border-b-0 lg:border-r lg:p-6">
              <div className="overflow-hidden rounded-lg border border-white/10 bg-black">
                {requestImageUrl ? (
                  <img
                    src={requestImageUrl}
                    alt="Client request reference"
                    className="h-64 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-64 flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
                    <ImageIcon size={28} />
                    <span className="text-sm">No request image</span>
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-3">
                  <img
                    src={selectedRequest.clientAvatar || "/default-avatar.png"}
                    alt={selectedRequest.clientName}
                    className="h-11 w-11 rounded-full border border-white/10 object-cover"
                  />
                  <div>
                    <p className="font-semibold text-white">
                      {selectedRequest.clientName}
                    </p>
                    <p className="text-sm text-neutral-500">Client request</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <SummaryRow
                    icon={<MapPin size={15} />}
                    label="Placement"
                    value={selectedRequest.bodyPlacement || "Not specified"}
                  />
                  <SummaryRow
                    icon={<Ruler size={15} />}
                    label="Size"
                    value={selectedRequest.size || "Not specified"}
                  />
                </div>

                <p className="mt-4 line-clamp-5 text-sm leading-6 text-neutral-300">
                  {selectedRequest.description || "No description provided."}
                </p>
              </div>
            </aside>

            <div className="space-y-5 p-5 sm:p-6">
              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-5 flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f04438]/10 text-[#f04438]">
                    <DollarSign size={19} />
                  </span>
                  <div>
                    <h3 className="text-lg! font-semibold! text-white">
                      Pricing
                    </h3>
                    <p className="text-sm text-neutral-400">
                      Set the offer price and the deposit required to lock in
                      the appointment.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <MoneyInput
                    label="Offer price"
                    value={offerPrice === 0 ? "" : offerPrice}
                    onChange={(value) => setOfferPrice(value ? Number(value) : 0)}
                    required
                  />
                  <MoneyInput
                    label="Fallback price"
                    value={fallbackPrice ?? ""}
                    onChange={(value) =>
                      setFallbackPrice(value ? Number(value) : null)
                    }
                  />
                  <MoneyInput
                    label="Deposit amount"
                    value={depositAmount === 0 ? "" : depositAmount}
                    onChange={(value) =>
                      setDepositAmount(value ? Number(value) : 0)
                    }
                    required
                  />
                </div>

                <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-3">
                  <div className="flex gap-2 text-sm text-neutral-300">
                    <Info
                      size={16}
                      className="mt-0.5 shrink-0 text-[var(--color-primary)]"
                    />
                    <p>
                      The fallback price is only shown if the client declines the
                      main offer. The client pays the deposit plus SATX Ink and
                      Stripe fees, so your deposit amount is protected.
                    </p>
                  </div>
                </div>

                {artist.paymentType === "internal" && paymentPreview.artistAmountCents > 0 && (
                  <div className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">
                          Client checkout preview
                        </p>
                        <p className="mt-1 text-sm text-emerald-50/80">
                          Based on the deposit due today.
                        </p>
                      </div>
                      <p className="text-xl font-semibold text-white">
                        {formatMoneyFromCents(paymentPreview.clientTotalCents)}
                      </p>
                    </div>
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <PreviewRow
                        label="Artist receives"
                        value={formatMoneyFromCents(paymentPreview.artistAmountCents)}
                      />
                      <PreviewRow
                        label="SATX Ink fee"
                        value={formatMoneyFromCents(paymentPreview.platformFeeCents)}
                      />
                      <PreviewRow
                        label="Estimated Stripe fee"
                        value={formatMoneyFromCents(paymentPreview.stripeFeeCents)}
                      />
                      <PreviewRow
                        label="Client pays today"
                        value={formatMoneyFromCents(paymentPreview.clientTotalCents)}
                      />
                    </div>
                  </div>
                )}

                {artist.paymentType === "internal" && (
                  <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={allowExternalRemainingPayment}
                        disabled={!canAllowExternalRemainingPayment}
                        onChange={(event) =>
                          setAllowExternalRemainingPayment(event.target.checked)
                        }
                        className="mt-1 h-4 w-4 rounded border-white/20 bg-black accent-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-white">
                          Allow the remaining balance at the shop
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-neutral-400">
                          The client can pay the deposit through SATX Ink now and
                          choose to pay the remaining{" "}
                          <span className="font-semibold text-white">
                            {formatMoneyFromCents(
                              Math.round(remainingArtistBalance * 100)
                            )}
                          </span>{" "}
                          directly with you after the session. SATX Ink's
                          platform fee is still calculated from the full quote
                          and collected during the deposit checkout.
                        </span>
                      </span>
                    </label>
                    {!canAllowExternalRemainingPayment && (
                      <p className="mt-3 text-xs leading-5 text-neutral-500">
                        Available once Stripe payments are enabled and the
                        deposit is less than the total offer price.
                      </p>
                    )}
                    {allowExternalRemainingPayment &&
                      canAllowExternalRemainingPayment && (
                        <textarea
                          value={externalRemainingPaymentNote}
                          onChange={(event) =>
                            setExternalRemainingPaymentNote(event.target.value)
                          }
                          className="mt-4 min-h-20 w-full rounded-md border border-white/10 bg-[#101010] p-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[var(--color-primary)]"
                          placeholder="Optional note about accepted in-shop payment methods or expectations..."
                        />
                      )}
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-5 flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                    <Layers size={19} />
                  </span>
                  <div>
                    <h3 className="text-lg! font-semibold! text-white">
                      Project sessions
                    </h3>
                    <p className="text-sm text-neutral-400">
                      Keep small tattoos simple, or set expectations for a
                      larger piece that needs multiple appointments.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setIsMultiSessionProject(false)}
                    className={`rounded-lg border p-4! text-left transition ${
                      !isMultiSessionProject
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-black/25 text-white hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="text-sm font-semibold">Single session</span>
                    <span
                      className={`mt-1 block text-xs leading-5 ${
                        !isMultiSessionProject
                          ? "text-black/65"
                          : "text-neutral-400"
                      }`}
                    >
                      The current flow: deposit first, one appointment, then the
                      remaining balance.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMultiSessionProject(true)}
                    className={`rounded-lg border p-4! text-left transition ${
                      isMultiSessionProject
                        ? "border-emerald-300/45 bg-emerald-300/10 text-white"
                        : "border-white/10 bg-black/25 text-white hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="text-sm font-semibold">
                      Multi-session project
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-neutral-400">
                      Client pays the initial deposit, then settles each session
                      installment through Stripe or at the shop.
                    </span>
                  </button>
                </div>

                {isMultiSessionProject && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-neutral-200">
                        Estimated sessions
                      </span>
                      <input
                        type="number"
                        min="2"
                        max="12"
                        value={estimatedSessionCount}
                        onChange={(event) =>
                          setEstimatedSessionCount(
                            Math.max(2, Number(event.target.value || 2))
                          )
                        }
                        className="h-11 w-full rounded-md border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none transition focus:border-[var(--color-primary)]"
                      />
                    </label>
                    <MoneyInput
                      label="Rough per-session estimate"
                      value={
                        estimatedSessionPrice === 0 ? "" : estimatedSessionPrice
                      }
                      onChange={(value) =>
                        setEstimatedSessionPrice(value ? Number(value) : 0)
                      }
                    />
                    <div className="md:col-span-2 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3">
                      <div className="flex gap-2 text-sm leading-6 text-emerald-50/80">
                        <ReceiptText
                          size={16}
                          className="mt-0.5 shrink-0 text-emerald-100"
                        />
                        <p>
                          First appointment is chosen from the options below.
                          Later sessions can be scheduled after each visit. The
                          client sees an estimated{" "}
                          <span className="font-semibold text-white">
                            {formatMoneyFromCents(Math.round(sessionEstimate * 100))}
                          </span>{" "}
                          due per session against the remaining project balance.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-5 flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                    <CalendarDays size={19} />
                  </span>
                  <div>
                    <h3 className="text-lg! font-semibold! text-white">
                      Appointment options
                    </h3>
                    <p className="text-sm text-neutral-400">
                      Give the client a few clear times to choose from.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {dateOptions.map((option, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-md border border-white/10 bg-black/25 p-3 md:grid-cols-[auto_1fr_1fr]"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/5 text-sm font-semibold text-neutral-300">
                        {index + 1}
                      </div>
                      <input
                        type="date"
                        value={option.date}
                        onChange={(event) =>
                          setDateOptions((prev) => {
                            const updated = [...prev];
                            updated[index] = {
                              ...updated[index],
                              date: event.target.value,
                            };
                            return updated;
                          })
                        }
                        className="h-10 rounded-md border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none transition focus:border-[var(--color-primary)]"
                      />
                      <input
                        type="time"
                        step="900"
                        min="00:00"
                        max="23:45"
                        value={option.time}
                        onChange={(event) =>
                          setDateOptions((prev) => {
                            const updated = [...prev];
                            updated[index] = {
                              ...updated[index],
                              time: event.target.value,
                            };
                            return updated;
                          })
                        }
                        className="h-10 rounded-md border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none transition focus:border-[var(--color-primary)]"
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                  <div className="mb-4 flex items-start gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                      <MessageSquareText size={19} />
                    </span>
                    <div>
                      <h3 className="text-lg! font-semibold! text-white">
                        Message
                      </h3>
                      <p className="text-sm text-neutral-400">
                        Add context, prep notes, or expectations.
                      </p>
                    </div>
                  </div>
                  <textarea
                    placeholder="Optional message to the client..."
                    value={offerMessage}
                    onChange={(event) => setOfferMessage(event.target.value)}
                    className="min-h-40 w-full rounded-md border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[var(--color-primary)]"
                  />
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                  <div className="mb-4 flex items-start gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                      <Upload size={19} />
                    </span>
                    <div>
                      <h3 className="text-lg! font-semibold! text-white">
                        Sample image
                      </h3>
                      <p className="text-sm text-neutral-400">
                        Optional visual reference for the offer.
                      </p>
                    </div>
                  </div>

                  <label className="group relative flex min-h-40 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-white/20 bg-black/35 p-4 text-center transition hover:border-white/40 hover:bg-white/[0.04]">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                        setOfferImage(file);
                        setPreviewUrl(file ? URL.createObjectURL(file) : null);
                      }}
                      className="sr-only"
                    />
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Offer sample preview"
                        className="absolute inset-0 h-full w-full object-cover opacity-80"
                      />
                    ) : (
                      <>
                        <Upload size={22} className="mb-2 text-white" />
                        <span className="text-sm font-semibold text-white">
                          Upload sample
                        </span>
                        <span className="mt-1 text-xs text-neutral-500">
                          JPG, PNG, or WebP
                        </span>
                      </>
                    )}
                    {previewUrl && (
                      <span className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/70 px-3 py-1 text-xs text-white backdrop-blur">
                        Click to replace image
                      </span>
                    )}
                  </label>
                </div>
              </section>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/10 bg-white/[0.03] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-neutral-500">
              {completedDateOptions.length} appointment option
              {completedDateOptions.length === 1 ? "" : "s"} ready
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-5! py-3! text-sm! font-semibold text-white transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Sending..." : "Send offer"}
                <Send size={16} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const MoneyInput = ({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  required?: boolean;
}) => (
  <label className="space-y-2">
    <span className="text-sm font-medium text-neutral-200">{label}</span>
    <div className="relative">
      <DollarSign
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
      />
      <input
        type="number"
        min="0"
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-md border border-white/10 bg-[#101010] pl-9 pr-3 text-sm text-white outline-none transition focus:border-[var(--color-primary)]"
        placeholder="0"
      />
    </div>
  </label>
);

const SummaryRow = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="rounded-md border border-white/10 bg-black/25 p-3">
    <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-neutral-500">
      {icon}
      {label}
    </div>
    <p className="text-sm font-medium text-white">{value}</p>
  </div>
);

const PreviewRow = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-emerald-200/10 bg-black/20 p-3">
    <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/50">
      {label}
    </p>
    <p className="mt-1 font-semibold text-white">{value}</p>
  </div>
);

export default MakeOfferModal;
