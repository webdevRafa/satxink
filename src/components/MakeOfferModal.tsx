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
import QuarterHourTimeSelect from "./ui/QuarterHourTimeSelect";
import {
  getTodayDateInputValue,
  isPastDateInputValue,
} from "../utils/dateInputGuards";

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
  sourceType?: string;
  flashId?: string;
  flashTitle?: string;
  flashPrice?: number | null;
  flashSheetId?: string | null;
  isFromSheet?: boolean;
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
  offerMessage: string;
  setOfferMessage: Dispatch<SetStateAction<string>>;
  dateOptions: { date: string; time: string }[];
  setDateOptions: Dispatch<SetStateAction<{ date: string; time: string }[]>>;
  onOfferSent?: (requestId: string, offerId?: string) => void | Promise<void>;
  shouldUpdateRequestStatus?: boolean;
  additionalOfferData?: Record<string, unknown>;
};

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [offerImage, setOfferImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewingOffer, setIsPreviewingOffer] = useState(false);
  const [allowExternalRemainingPayment, setAllowExternalRemainingPayment] =
    useState(false);
  const [externalRemainingPaymentNote, setExternalRemainingPaymentNote] =
    useState("");
  const [isMultiSessionProject, setIsMultiSessionProject] = useState(false);
  const [estimatedSessionCount, setEstimatedSessionCount] = useState(2);
  const todayDateInput = getTodayDateInputValue();

  const isFlashRequest = selectedRequest?.sourceType === "flash";
  const flashListedPrice = Number(selectedRequest?.flashPrice || 0);
  const effectiveOfferPrice = isFlashRequest
    ? flashListedPrice
    : Number(offerPrice || 0);
  const requestImageUrl = selectedRequest?.thumbUrl || selectedRequest?.fullUrl || "";
  const completedDateOptions = useMemo(
    () => dateOptions.filter((option) => option.date && option.time),
    [dateOptions]
  );
  const remainingArtistBalance = Math.max(
    effectiveOfferPrice - Number(depositAmount || 0),
    0
  );
  const canAllowExternalRemainingPayment =
    artist?.paymentType === "internal" &&
    Number(depositAmount || 0) > 0 &&
    remainingArtistBalance > 0;
  const sessionEstimate =
    !isFlashRequest && isMultiSessionProject && estimatedSessionCount > 0
      ? Math.ceil(remainingArtistBalance / estimatedSessionCount)
      : remainingArtistBalance;
  const paymentPreview = useMemo(
    () =>
      calculateClientPaymentBreakdown(Number(depositAmount || 0), {
        platformFeeBaseAmount: Number(effectiveOfferPrice || depositAmount || 0),
      }),
    [depositAmount, effectiveOfferPrice]
  );

  useEffect(() => {
    if (!isOpen || !selectedRequest) return;

    if (selectedRequest.sourceType === "flash") {
      setIsMultiSessionProject(false);
      setEstimatedSessionCount(2);
      setOfferPrice(Number(selectedRequest.flashPrice || 0));
    }
  }, [isOpen, selectedRequest, setOfferPrice]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!isOpen || !selectedRequest || !artist) return null;

  const resetOfferForm = () => {
    setOfferPrice(0);
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
    setIsPreviewingOffer(false);
  };

  const handleClose = () => {
    setIsPreviewingOffer(false);
    onClose();
  };

  const getSubmissionOfferPrice = () =>
    selectedRequest.sourceType === "flash"
      ? Number(selectedRequest.flashPrice || 0)
      : Number(offerPrice || 0);

  const getDraftValidationError = () => {
    if (!artist.paymentType || !["internal", "external"].includes(artist.paymentType)) {
      return "Set a valid payment type before sending an offer.";
    }

    const submissionOfferPrice = getSubmissionOfferPrice();

    if (!submissionOfferPrice || submissionOfferPrice <= 0) {
      return selectedRequest.sourceType === "flash"
          ? "This flash item needs a listed price before you can send an offer."
          : "Enter a valid offer price.";
    }

    if (depositAmount < 0 || depositAmount > submissionOfferPrice) {
      return "Deposit must be between $0 and the offer price.";
    }

    if (completedDateOptions.length === 0) {
      return "Add at least one appointment option.";
    }

    if (completedDateOptions.some((option) => isPastDateInputValue(option.date))) {
      return "Appointment options must be today or later.";
    }

    const submitAsMultiSession =
      selectedRequest.sourceType !== "flash" && isMultiSessionProject;

    if (submitAsMultiSession) {
      if (estimatedSessionCount < 2 || estimatedSessionCount > 12) {
        return "Multi-session projects need 2 to 12 estimated sessions.";
      }

      if (remainingArtistBalance <= 0) {
        return "Multi-session projects need a remaining balance after the deposit.";
      }
    }

    return null;
  };

  const handlePreviewOffer = () => {
    const validationError = getDraftValidationError();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsPreviewingOffer(true);
  };

  const handleOfferSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!selectedRequest || !uid) return;

    const validationError = getDraftValidationError();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const submissionOfferPrice = getSubmissionOfferPrice();
    const submitAsMultiSession =
      selectedRequest.sourceType !== "flash" && isMultiSessionProject;

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
        price: submissionOfferPrice,
        message: offerMessage,
        dateOptions: completedDateOptions,
        imageFilename: filename || null,
        fullUrl:
          fullUrl ||
          (selectedRequest.sourceType === "flash"
            ? selectedRequest.fullUrl || selectedRequest.thumbUrl || null
            : null),
        thumbUrl:
          thumbUrl ||
          (selectedRequest.sourceType === "flash"
            ? selectedRequest.thumbUrl || selectedRequest.fullUrl || null
            : null),
        sourceType: selectedRequest.sourceType || "custom",
        flashId:
          selectedRequest.sourceType === "flash"
            ? selectedRequest.flashId || null
            : null,
        flashTitle:
          selectedRequest.sourceType === "flash"
            ? selectedRequest.flashTitle || "Untitled flash"
            : null,
        flashPrice:
          selectedRequest.sourceType === "flash"
            ? submissionOfferPrice
            : null,
        flashSheetId:
          selectedRequest.sourceType === "flash"
            ? selectedRequest.flashSheetId || null
            : null,
        isFromSheet:
          selectedRequest.sourceType === "flash"
            ? Boolean(selectedRequest.isFromSheet)
            : null,
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
        projectType: submitAsMultiSession ? "multi_session" : "single_session",
        estimatedSessionCount: submitAsMultiSession
          ? estimatedSessionCount
          : 1,
        estimatedSessionPrice: submitAsMultiSession ? sessionEstimate : null,
        sessionPaymentPlan: submitAsMultiSession
          ? "per_session"
          : "single_balance",
        sessionScheduling: submitAsMultiSession
          ? "first_session_now_rest_later"
          : "single_session",
        ...additionalOfferData,
        status: "pending",
        createdAt: serverTimestamp(),
      };

      const offerRef = await addDoc(collection(db, "offers"), offerData);
      if (shouldUpdateRequestStatus) {
        await updateDoc(doc(db, "bookingRequests", selectedRequest.id), {
          status: "offered",
          offeredAt: serverTimestamp(),
        });
      }

      toast.success("Offer sent.");
      await onOfferSent?.(selectedRequest.id, offerRef.id);
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
              {isFlashRequest ? "Your flash offer" : "Your offer"}
            </p>
            <h2 className="mt-1 text-xl! font-semibold! text-white">
              {isFlashRequest
                ? `Create flash offer for ${selectedRequest.clientName}`
                : `Create offer for ${selectedRequest.clientName}`}
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
          {isPreviewingOffer ? (
            <OfferPreview
              artist={artist}
              request={selectedRequest}
              requestImageUrl={requestImageUrl}
              sampleImageUrl={
                previewUrl ||
                (isFlashRequest
                  ? selectedRequest.fullUrl || selectedRequest.thumbUrl || ""
                  : "")
              }
              isFlashRequest={isFlashRequest}
              isMultiSessionProject={!isFlashRequest && isMultiSessionProject}
              offerPrice={effectiveOfferPrice}
              depositAmount={Number(depositAmount || 0)}
              remainingArtistBalance={remainingArtistBalance}
              paymentPreview={paymentPreview}
              allowExternalRemainingPayment={
                canAllowExternalRemainingPayment &&
                allowExternalRemainingPayment
              }
              sessionCount={estimatedSessionCount}
              sessionEstimate={sessionEstimate}
              dateOptions={completedDateOptions}
              message={offerMessage}
            />
          ) : (
          <>
          <div className="grid gap-0 lg:grid-cols-[0.78fr_1.22fr]">
            <aside className="border-b border-white/10 bg-black/25 p-5 lg:border-b-0 lg:border-r lg:p-6">
              {isFlashRequest ? (
                <FlashOfferSummaryCard
                  request={selectedRequest}
                  previewUrl={requestImageUrl}
                />
              ) : (
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
              )}

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
                      {isFlashRequest
                        ? "The offer price is locked to the flash listing. Set the deposit required to reserve the design."
                        : "Set the offer price and the deposit required to lock in the appointment."}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {isFlashRequest ? (
                    <LockedPriceTile
                      label="Listed flash price"
                      value={
                        flashListedPrice > 0
                          ? formatMoneyFromCents(
                              Math.round(flashListedPrice * 100)
                            )
                          : "Price not listed"
                      }
                    />
                  ) : (
                    <MoneyInput
                      label="Offer price"
                      value={offerPrice === 0 ? "" : offerPrice}
                      onChange={(value) =>
                        setOfferPrice(value ? Number(value) : 0)
                      }
                      required
                    />
                  )}
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
                      The client pays the deposit plus SATX Ink and Stripe fees
                      today, so your deposit amount is protected. Any remaining
                      artist balance is handled by the payment choice below.
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
                        label="You receive"
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
                    {canAllowExternalRemainingPayment && (
                      <p className="mt-3 rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-neutral-400">
                        If this is off, the client pays the remaining balance
                        later through Stripe and the payout goes to your Stripe
                        Connect account. If this is on, the client can choose to
                        settle the remaining balance directly with you at the
                        shop.
                      </p>
                    )}
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

              {!isFlashRequest && (
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
                    <div className="space-y-2">
                      <span className="text-sm font-medium text-neutral-200">
                        Estimated per session
                      </span>
                      <div className="flex h-11 items-center rounded-md border border-white/10 bg-black/25 px-3 text-sm font-semibold text-white">
                        {formatMoneyFromCents(Math.round(sessionEstimate * 100))}
                      </div>
                      <p className="text-xs leading-5 text-neutral-500">
                        Calculated from the remaining{" "}
                        {formatMoneyFromCents(
                          Math.round(remainingArtistBalance * 100)
                        )}{" "}
                        balance divided by {estimatedSessionCount} sessions.
                      </p>
                    </div>
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
              )}

              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-5 flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                    <CalendarDays size={19} />
                  </span>
                  <div>
                    <h3 className="text-lg! font-semibold! text-white">
                      {isMultiSessionProject
                        ? "First-session appointment options"
                        : isFlashRequest
                        ? "Flash appointment options"
                        : "Appointment options"}
                    </h3>
                    <p className="text-sm text-neutral-400">
                      {isMultiSessionProject
                        ? "Give the client a few clear times to choose from for session 1 only. Later sessions can be scheduled after the project begins."
                        : isFlashRequest
                        ? "Give the client a few clear times to reserve this flash design."
                        : "Give the client a few clear times to choose from."}
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
                        min={todayDateInput}
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
                      <QuarterHourTimeSelect
                        value={option.time}
                        onChange={(value) =>
                          setDateOptions((prev) => {
                            const updated = [...prev];
                            updated[index] = {
                              ...updated[index],
                              time: value,
                            };
                            return updated;
                          })
                        }
                        placeholder="Select time"
                        buttonClassName="h-10 bg-[#101010] py-0 focus:border-[var(--color-primary)]"
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className={`grid gap-5 ${isFlashRequest ? "" : "lg:grid-cols-2"}`}>
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
                    placeholder={
                      isFlashRequest
                        ? "Optional note about placement, sizing, prep, or reservation expectations..."
                        : "Optional message to the client..."
                    }
                    value={offerMessage}
                    onChange={(event) => setOfferMessage(event.target.value)}
                    className="min-h-40 w-full rounded-md border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[var(--color-primary)]"
                  />
                </div>

                {!isFlashRequest && (
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
                )}
              </section>
            </div>
          </div>
          </>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-white/10 bg-white/[0.03] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-neutral-500">
              {isPreviewingOffer
                ? "Review the offer summary before sending."
                : `${completedDateOptions.length} appointment option${
                    completedDateOptions.length === 1 ? "" : "s"
                  } ready`}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={
                  isPreviewingOffer
                    ? () => setIsPreviewingOffer(false)
                    : handleClose
                }
                className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-5! py-3! text-sm! font-semibold text-white transition hover:bg-white/10"
              >
                {isPreviewingOffer ? "Back to edit" : "Cancel"}
              </button>
              {!isPreviewingOffer && (
                <button
                  type="button"
                  onClick={handlePreviewOffer}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-5! py-3! text-sm! font-semibold text-white transition hover:bg-white/10"
                >
                  Preview offer
                  <ReceiptText size={16} />
                </button>
              )}
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

const OfferPreview = ({
  artist,
  request,
  requestImageUrl,
  sampleImageUrl,
  isFlashRequest,
  isMultiSessionProject,
  offerPrice,
  depositAmount,
  remainingArtistBalance,
  paymentPreview,
  allowExternalRemainingPayment,
  sessionCount,
  sessionEstimate,
  dateOptions,
  message,
}: {
  artist: OfferArtist;
  request: BookingRequest;
  requestImageUrl: string;
  sampleImageUrl: string;
  isFlashRequest: boolean;
  isMultiSessionProject: boolean;
  offerPrice: number;
  depositAmount: number;
  remainingArtistBalance: number;
  paymentPreview: ReturnType<typeof calculateClientPaymentBreakdown>;
  allowExternalRemainingPayment: boolean;
  sessionCount: number;
  sessionEstimate: number;
  dateOptions: { date: string; time: string }[];
  message: string;
}) => {
  const isInternalPayment = artist.paymentType === "internal";
  const todayClientPayment = isInternalPayment
    ? formatMoneyFromCents(paymentPreview.clientTotalCents)
    : formatMoneyFromCents(Math.round(depositAmount * 100));
  const artistReceivesToday = isInternalPayment
    ? formatMoneyFromCents(paymentPreview.artistAmountCents)
    : formatMoneyFromCents(Math.round(depositAmount * 100));
  const laterPaymentLabel =
    remainingArtistBalance <= 0
      ? "No later balance"
      : !isInternalPayment
      ? "Client pays the remaining balance through your external payment method."
      : allowExternalRemainingPayment
      ? "Client can choose to pay the remaining balance in shop."
      : "Client pays the remaining balance later through Stripe.";

  return (
    <div className="p-5 sm:p-6">
      <div className="mb-5 rounded-lg border border-white/10 bg-white/[0.035] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Offer preview
        </p>
        <h3 className="mt-2 text-2xl! font-semibold! text-white">
          Review what {request.clientName || "the client"} will receive
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
          This is a final check of price, payment timing, appointment options,
          reference images, and your message before the offer is sent.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f04438]/10 text-[#f04438]">
                <DollarSign size={19} />
              </span>
              <div>
                <h4 className="text-lg! font-semibold! text-white">
                  Payment breakdown
                </h4>
                <p className="text-sm text-neutral-400">
                  Total quote, deposit due today, and later balance.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <PreviewTile
                label="Total artist quote"
                value={formatMoneyFromCents(Math.round(offerPrice * 100))}
              />
              <PreviewTile
                label="Client pays today"
                value={todayClientPayment}
                tone="strong"
              />
              <PreviewTile
                label="You receive from today's deposit"
                value={artistReceivesToday}
              />
              <PreviewTile
                label="Remaining artist balance"
                value={formatMoneyFromCents(
                  Math.round(remainingArtistBalance * 100)
                )}
              />
            </div>

            {isInternalPayment && (
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                <PreviewRow
                  label="SATX Ink fee"
                  value={formatMoneyFromCents(paymentPreview.platformFeeCents)}
                />
                <PreviewRow
                  label="Estimated Stripe fee"
                  value={formatMoneyFromCents(paymentPreview.stripeFeeCents)}
                />
                <PreviewRow
                  label="Checkout total"
                  value={formatMoneyFromCents(paymentPreview.clientTotalCents)}
                />
              </div>
            )}

            <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-3 text-sm leading-6 text-neutral-300">
              {laterPaymentLabel}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                <Layers size={19} />
              </span>
              <div>
                <h4 className="text-lg! font-semibold! text-white">
                  Project structure
                </h4>
                <p className="text-sm text-neutral-400">
                  How this offer will be framed to the client.
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <PreviewTile
                label="Offer type"
                value={
                  isFlashRequest
                    ? "Flash booking"
                    : isMultiSessionProject
                    ? "Multi-session project"
                    : "Single session"
                }
              />
              <PreviewTile
                label="Estimated sessions"
                value={isMultiSessionProject ? `${sessionCount}` : "1"}
              />
              <PreviewTile
                label="Estimated per session"
                value={
                  isMultiSessionProject
                    ? formatMoneyFromCents(Math.round(sessionEstimate * 100))
                    : "Not split"
                }
              />
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                <CalendarDays size={19} />
              </span>
              <div>
                <h4 className="text-lg! font-semibold! text-white">
                  Appointment options
                </h4>
                <p className="text-sm text-neutral-400">
                  The client will choose one of these times.
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              {dateOptions.map((option, index) => (
                <div
                  key={`${option.date}-${option.time}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-neutral-500">
                    Option {index + 1}
                  </span>
                  <span className="text-right font-medium text-white">
                    {formatOfferPreviewAppointment(option)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                <ImageIcon size={19} />
              </span>
              <div>
                <h4 className="text-lg! font-semibold! text-white">
                  Visual references
                </h4>
                <p className="text-sm text-neutral-400">
                  Client reference and your offer sample.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <PreviewImage
                label="Client reference"
                imageUrl={requestImageUrl}
                emptyLabel="No client image"
              />
              <PreviewImage
                label={isFlashRequest ? "Flash image" : "Offer sample"}
                imageUrl={sampleImageUrl}
                emptyLabel={
                  isFlashRequest ? "No flash image" : "No sample included"
                }
              />
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                <MessageSquareText size={19} />
              </span>
              <div>
                <h4 className="text-lg! font-semibold! text-white">
                  Client message
                </h4>
                <p className="text-sm text-neutral-400">
                  This message is included with the offer.
                </p>
              </div>
            </div>
            <p className="min-h-24 whitespace-pre-line rounded-md border border-white/10 bg-black/25 p-3 text-sm leading-6 text-neutral-300">
              {message || "No message included."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

const FlashOfferSummaryCard = ({
  request,
  previewUrl,
}: {
  request: BookingRequest;
  previewUrl: string;
}) => (
  <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-2xl">
    <div className="relative aspect-[4/5] bg-black">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={request.flashTitle || "Requested flash"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
          <ImageIcon size={28} />
          <span className="text-sm">No flash image</span>
        </div>
      )}
      <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/75 px-3 py-1 text-xs uppercase tracking-[0.14em] text-white backdrop-blur">
        Flash item
      </span>
    </div>
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg! font-semibold! text-white">
            {request.flashTitle || "Untitled flash"}
          </h3>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-neutral-500">
            {request.isFromSheet ? "From flash sheet" : "Standalone flash"}
          </p>
        </div>
        <p className="shrink-0 text-lg font-semibold text-white">
          {typeof request.flashPrice === "number" && request.flashPrice > 0
            ? formatMoneyFromCents(Math.round(request.flashPrice * 100))
            : "No price"}
        </p>
      </div>
      <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm leading-6 text-emerald-50/80">
        This offer will reserve the listed flash design as a single-session
        booking.
      </div>
    </div>
  </div>
);

const LockedPriceTile = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="space-y-2">
    <span className="text-sm font-medium text-neutral-200">{label}</span>
    <div className="flex h-11 items-center rounded-md border border-white/10 bg-black/25 px-3 text-sm font-semibold text-white">
      {value}
    </div>
  </div>
);

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

const PreviewTile = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "strong";
}) => (
  <div
    className={`rounded-md border p-3 ${
      tone === "strong"
        ? "border-emerald-300/25 bg-emerald-300/10"
        : "border-white/10 bg-black/25"
    }`}
  >
    <p className="text-xs uppercase tracking-[0.12em] text-neutral-500">
      {label}
    </p>
    <p className="mt-1 text-lg font-semibold text-white">{value}</p>
  </div>
);

const PreviewImage = ({
  label,
  imageUrl,
  emptyLabel,
}: {
  label: string;
  imageUrl: string;
  emptyLabel: string;
}) => (
  <div className="overflow-hidden rounded-md border border-white/10 bg-black/25">
    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
      <p className="text-xs uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </p>
    </div>
    {imageUrl ? (
      <img src={imageUrl} alt={label} className="h-48 w-full object-cover" />
    ) : (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-neutral-500">
        <ImageIcon size={24} />
        <span className="text-sm">{emptyLabel}</span>
      </div>
    )}
  </div>
);

const formatOfferPreviewAppointment = (option: {
  date: string;
  time: string;
}) => {
  const [year, month, day] = option.date.split("-").map(Number);
  const [hours, minutes] = option.time.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);

  if (Number.isNaN(date.getTime())) {
    return `${option.date} at ${option.time}`;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default MakeOfferModal;
