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
import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
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
  offerFullUrl?: string | null;
  offerThumbUrl?: string | null;
  offerImageFilename?: string | null;
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

const CUSTOM_OFFER_STEPS = [
  { id: "pricing", label: "Pricing" },
  { id: "sessions", label: "Sessions" },
  { id: "appointment", label: "Appointment" },
  { id: "message", label: "Message" },
  { id: "sample", label: "Sample" },
  { id: "preview", label: "Preview" },
] as const;

type CustomOfferStepId = (typeof CUSTOM_OFFER_STEPS)[number]["id"];

const FINAL_CUSTOM_OFFER_STEP_INDEX = CUSTOM_OFFER_STEPS.length - 1;

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
  const [isRemainingPaymentHelpOpen, setIsRemainingPaymentHelpOpen] =
    useState(false);
  const [isMultiSessionProject, setIsMultiSessionProject] = useState(false);
  const [estimatedSessionCount, setEstimatedSessionCount] = useState(2);
  const [customOfferStepIndex, setCustomOfferStepIndex] = useState(0);
  const [furthestCustomOfferStepIndex, setFurthestCustomOfferStepIndex] =
    useState(0);
  const [hasTriedPricingContinue, setHasTriedPricingContinue] =
    useState(false);
  const [isDesktopOfferStepper, setIsDesktopOfferStepper] = useState(false);
  const todayDateInput = getTodayDateInputValue();

  const isFlashRequest = selectedRequest?.sourceType === "flash";
  const shouldUseCustomOfferStepper =
    !isFlashRequest && isDesktopOfferStepper && !isPreviewingOffer;
  const hasCompletedCustomOfferStepper =
    !shouldUseCustomOfferStepper ||
    furthestCustomOfferStepIndex >= FINAL_CUSTOM_OFFER_STEP_INDEX;
  const isOfferActionLocked =
    shouldUseCustomOfferStepper && !hasCompletedCustomOfferStepper;
  const flashListedPrice = Number(selectedRequest?.flashPrice || 0);
  const effectiveOfferPrice = isFlashRequest
    ? flashListedPrice
    : Number(offerPrice || 0);
  const requestImageUrl = selectedRequest?.thumbUrl || selectedRequest?.fullUrl || "";
  const retainedOfferSampleUrl =
    selectedRequest?.offerThumbUrl || selectedRequest?.offerFullUrl || "";
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
  const shouldShowRemainingPaymentChoice =
    artist?.paymentType === "internal" && canAllowExternalRemainingPayment;
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
  const currentOfferPrice = Number(offerPrice || 0);
  const currentDepositAmount = Number(depositAmount || 0);
  const pricingStepInlineError =
    !isFlashRequest && currentOfferPrice > 0 && currentDepositAmount <= 0
      ? "Enter a deposit to book before continuing."
      : !isFlashRequest && currentDepositAmount > currentOfferPrice
      ? "Deposit cannot be greater than the offer price."
      : "";
  const currentCustomOfferStepId =
    CUSTOM_OFFER_STEPS[customOfferStepIndex]?.id;
  const shouldShowPricingStepInlineError =
    pricingStepInlineError &&
    (pricingStepInlineError !== "Enter a deposit to book before continuing." ||
      hasTriedPricingContinue);
  const isCustomOfferStepContinueBlocked =
    currentCustomOfferStepId === "appointment" &&
    completedDateOptions.length === 0;
  const isCustomOfferStepperFinalStep =
    customOfferStepIndex >= FINAL_CUSTOM_OFFER_STEP_INDEX;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const query = window.matchMedia("(min-width: 1024px)");
    const handleChange = () => setIsDesktopOfferStepper(query.matches);

    handleChange();
    query.addEventListener("change", handleChange);

    return () => {
      query.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    setCustomOfferStepIndex(0);
    setFurthestCustomOfferStepIndex(0);
    setHasTriedPricingContinue(false);
  }, [isOpen, selectedRequest?.id]);

  useEffect(() => {
    if (!canAllowExternalRemainingPayment) {
      setAllowExternalRemainingPayment(false);
      setIsRemainingPaymentHelpOpen(false);
    }
  }, [canAllowExternalRemainingPayment]);

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
    setIsRemainingPaymentHelpOpen(false);
    setIsMultiSessionProject(false);
    setEstimatedSessionCount(2);
    setIsPreviewingOffer(false);
    setCustomOfferStepIndex(0);
    setFurthestCustomOfferStepIndex(0);
    setHasTriedPricingContinue(false);
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

    if (depositAmount <= 0) {
      return "Enter a deposit to book before sending this offer.";
    }

    if (depositAmount > submissionOfferPrice) {
      return "Deposit cannot be greater than the offer price.";
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
    if (isOfferActionLocked) {
      toast.error("Review each offer section before previewing.");
      return;
    }

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

    if (isOfferActionLocked) {
      toast.error("Review each offer section before sending.");
      return;
    }

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
      const fallbackFullUrl =
        selectedRequest.sourceType === "flash"
          ? selectedRequest.fullUrl || selectedRequest.thumbUrl || null
          : selectedRequest.offerFullUrl || null;
      const fallbackThumbUrl =
        selectedRequest.sourceType === "flash"
          ? selectedRequest.thumbUrl || selectedRequest.fullUrl || null
          : selectedRequest.offerThumbUrl || null;

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
        imageFilename: filename || selectedRequest.offerImageFilename || null,
        fullUrl: fullUrl || fallbackFullUrl,
        thumbUrl: thumbUrl || fallbackThumbUrl,
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
        externalRemainingPaymentNote: "",
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

  const getCustomOfferStepValidationError = (stepId: CustomOfferStepId) => {
    if (stepId === "appointment") {
      if (completedDateOptions.length === 0) {
        return "Add at least one appointment option before continuing.";
      }

      if (
        completedDateOptions.some((option) =>
          isPastDateInputValue(option.date)
        )
      ) {
        return "Appointment options must be today or later.";
      }

      return null;
    }

    if (stepId !== "pricing") return null;

    if (currentOfferPrice <= 0) {
      return "Enter a valid offer price before continuing.";
    }

    if (currentDepositAmount <= 0) {
      return "Enter a deposit to book before continuing.";
    }

    if (currentDepositAmount > currentOfferPrice) {
      return "Deposit cannot be greater than the offer price.";
    }

    return null;
  };

  const goToCustomOfferStep = (stepIndex: number) => {
    const nextStepIndex = Math.min(
      Math.max(stepIndex, 0),
      FINAL_CUSTOM_OFFER_STEP_INDEX
    );

    if (nextStepIndex > customOfferStepIndex) {
      const currentStep = CUSTOM_OFFER_STEPS[customOfferStepIndex];
      if (currentStep.id === "pricing") {
        setHasTriedPricingContinue(true);
      }
      const validationError = getCustomOfferStepValidationError(currentStep.id);

      if (validationError) {
        toast.error(validationError);
        return;
      }
    }

    setCustomOfferStepIndex(nextStepIndex);
    if (nextStepIndex > 0) {
      setHasTriedPricingContinue(false);
    }
    setFurthestCustomOfferStepIndex((currentStepIndex) =>
      Math.max(currentStepIndex, nextStepIndex)
    );
  };

  const getCustomOfferStepClassName = (stepId: CustomOfferStepId) => {
    if (isFlashRequest) return "";

    const stepIndex = CUSTOM_OFFER_STEPS.findIndex(
      (step) => step.id === stepId
    );

    return customOfferStepIndex === stepIndex
      ? "lg:block lg:animate-[offer-step-in_260ms_cubic-bezier(0.22,1,0.36,1)]"
      : "lg:hidden";
  };

  const getCustomOfferPreviewStepClassName = () => {
    const stepIndex = CUSTOM_OFFER_STEPS.findIndex(
      (step) => step.id === "preview"
    );

    return customOfferStepIndex === stepIndex
      ? "hidden lg:block lg:animate-[offer-step-in_260ms_cubic-bezier(0.22,1,0.36,1)]"
      : "hidden";
  };

  const offerModalShellClassName =
    "fixed inset-0 z-[120] flex h-dvh items-start justify-center overflow-hidden overscroll-none bg-black/80 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white backdrop-blur-md sm:z-50 sm:px-4 sm:pb-4 sm:pt-[5.75rem] lg:pb-5";

  const offerModalPanelClassName =
    "relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-2xl sm:max-h-[calc(100dvh-5.75rem-1rem)] lg:max-h-[calc(100dvh-5.75rem-1.25rem)]";

  return (
    <div className={offerModalShellClassName}>
      <div className={offerModalPanelClassName}>
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
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto request-modal-scrollbar">
            {isPreviewingOffer ? (
              <OfferPreview
                artist={artist}
                request={selectedRequest}
                requestImageUrl={requestImageUrl}
                sampleImageUrl={
                  previewUrl ||
                  (isFlashRequest
                    ? selectedRequest.fullUrl || selectedRequest.thumbUrl || ""
                    : retainedOfferSampleUrl)
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
                  <aside className="border-b border-white/10 bg-black/25 p-5 lg:sticky lg:top-0 lg:self-start lg:border-b-0 lg:border-r lg:p-6">
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
                    {!isFlashRequest && (
                      <div className="hidden bg-[#111111] pb-3 shadow-[0_18px_26px_rgba(0,0,0,0.45)] sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6 lg:sticky lg:top-0 lg:z-40 lg:-mx-5 lg:-mt-5 lg:block lg:px-5 lg:pt-5">
                        <div className="rounded-lg border border-white/10 bg-[#111111]/95 p-3 shadow-[0_14px_34px_rgba(0,0,0,0.22)] backdrop-blur">
                          <div className="grid grid-cols-6 gap-1.5">
                            {CUSTOM_OFFER_STEPS.map((step, index) => {
                              const isActive = index === customOfferStepIndex;
                              const isComplete =
                                index < furthestCustomOfferStepIndex;
                              const canVisit =
                                index <= furthestCustomOfferStepIndex + 1;

                              return (
                                <button
                                  key={step.id}
                                  type="button"
                                  disabled={!canVisit}
                                  onClick={() => goToCustomOfferStep(index)}
                                  className={`group flex min-w-0 items-center justify-center rounded-md border px-1.5! py-2.5! text-center transition ${
                                    isActive
                                      ? "border-white/35 bg-white/[0.08] text-white shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
                                      : isComplete
                                      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-50 hover:border-emerald-200/45"
                                      : "border-white/10 bg-white/[0.03] text-neutral-400 hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-white/10 disabled:hover:bg-white/[0.03]"
                                  }`}
                                >
                                  <span className="truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em]">
                                    {step.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                            <div
                              className="h-full rounded-full bg-white transition-all duration-300 ease-out"
                              style={{
                                width: `${
                                  ((customOfferStepIndex + 1) /
                                    CUSTOM_OFFER_STEPS.length) *
                                  100
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

              <section className={`rounded-lg border border-white/10 bg-white/[0.035] p-5 ${getCustomOfferStepClassName("pricing")}`}>
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
                    label="Deposit to book"
                    value={depositAmount === 0 ? "" : depositAmount}
                    onChange={(value) =>
                      setDepositAmount(value ? Number(value) : 0)
                    }
                    required
                  />
                </div>
                {shouldShowPricingStepInlineError && (
                  <p className="mt-3 rounded-md border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100/85">
                    {pricingStepInlineError}
                  </p>
                )}

                {shouldShowRemainingPaymentChoice && (
                  <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-4">
                    <div className="flex items-start gap-3">
                      <input
                        id="allow-external-remaining-payment"
                        type="checkbox"
                        checked={allowExternalRemainingPayment}
                        disabled={!canAllowExternalRemainingPayment}
                        onChange={(event) =>
                          setAllowExternalRemainingPayment(event.target.checked)
                        }
                        className="mt-1 h-4 w-4 rounded border-white/20 bg-black accent-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <label
                            htmlFor="allow-external-remaining-payment"
                            className="cursor-pointer text-sm font-semibold text-white"
                          >
                            Allow the remaining balance at the shop
                          </label>
                          {canAllowExternalRemainingPayment && (
                            <span
                              className="relative inline-flex"
                              onMouseEnter={() =>
                                setIsRemainingPaymentHelpOpen(true)
                              }
                              onMouseLeave={() =>
                                setIsRemainingPaymentHelpOpen(false)
                              }
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setIsRemainingPaymentHelpOpen(true)
                                }
                                onFocus={() =>
                                  setIsRemainingPaymentHelpOpen(true)
                                }
                                onBlur={() =>
                                  setIsRemainingPaymentHelpOpen(false)
                                }
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] p-0! text-neutral-400 transition hover:border-white/30 hover:text-white"
                                aria-label="How remaining balance payment works"
                              >
                                <Info size={12} />
                              </button>
                              {isRemainingPaymentHelpOpen && (
                                <span className="absolute left-1/2 top-full z-[80] mt-5 block w-[min(20rem,calc(100vw-3rem))] -translate-x-1/2 rounded-md border border-white/10 bg-[#090909] p-3 text-xs leading-5 text-neutral-300 shadow-2xl sm:left-0 sm:translate-x-0">
                                  If this is off, the client pays the remaining
                                  balance later through Stripe and the payout
                                  goes to your Stripe Connect account. If this
                                  is on, the client can choose to settle the
                                  remaining balance directly with you at the
                                  shop.
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <label
                          htmlFor="allow-external-remaining-payment"
                          className="mt-1 block cursor-pointer text-sm leading-6 text-neutral-400"
                        >
                          The client can pay the deposit through SATX Ink now and
                          choose to pay the remaining{" "}
                          <span className="font-semibold text-white">
                            {formatMoneyFromCents(
                              Math.round(remainingArtistBalance * 100)
                            )}
                          </span>{" "}
                          directly with you after the session.
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {!isFlashRequest && (
              <section className={`rounded-lg border border-white/10 bg-white/[0.035] p-5 ${getCustomOfferStepClassName("sessions")}`}>
                <div className="mb-5 flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                    <Layers size={19} />
                  </span>
                  <div>
                    <h3 className="text-lg! font-semibold! text-white">
                      Sessions
                    </h3>
                    <p className="text-sm text-neutral-400">
                      The number of sessions this piece will take.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setIsMultiSessionProject(false)}
                    className={`flex min-h-24 items-center justify-center rounded-lg border p-4! text-center transition ${
                      !isMultiSessionProject
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-black/25 text-white hover:bg-white/[0.06]"
                    }`}
                  >
                    <span
                      className={`text-sm font-semibold ${
                        !isMultiSessionProject
                          ? "text-neutral-950!"
                          : "text-white"
                      }`}
                    >
                      Single session
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMultiSessionProject(true)}
                    className={`flex min-h-24 items-center justify-center rounded-lg border p-4! text-center transition ${
                      isMultiSessionProject
                        ? "border-emerald-300/45 bg-emerald-300/10 text-white"
                        : "border-white/10 bg-black/25 text-white hover:bg-white/[0.06]"
                    }`}
                  >
                    <span
                      className={`text-sm font-semibold ${
                        isMultiSessionProject
                          ? "text-white"
                          : "text-neutral-200"
                      }`}
                    >
                      Multi-session project
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
                  </div>
                )}
              </section>
              )}

              <section className={`rounded-lg border border-white/10 bg-white/[0.035] p-5 ${getCustomOfferStepClassName("appointment")}`}>
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
                      <div className="relative min-w-0">
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
                          className="offer-date-input h-10 w-full rounded-md border border-white/10 bg-[#101010] px-3 pr-10 text-sm text-white outline-none transition focus:border-[var(--color-primary)]"
                        />
                        <CalendarDays
                          size={15}
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300"
                        />
                      </div>
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

              <>
                <div className={`rounded-lg border border-white/10 bg-white/[0.035] p-5 ${getCustomOfferStepClassName("message")}`}>
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
                <div className={`rounded-lg border border-white/10 bg-white/[0.035] p-5 ${getCustomOfferStepClassName("sample")}`}>
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

                  <label
                    className={`group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-white/20 bg-black/35 p-4 text-center transition hover:border-white/40 hover:bg-white/[0.04] ${
                      previewUrl || retainedOfferSampleUrl
                        ? "min-h-[18rem]"
                        : "min-h-40"
                    }`}
                  >
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
                    {previewUrl || retainedOfferSampleUrl ? (
                      <img
                        src={previewUrl || retainedOfferSampleUrl}
                        alt={
                          previewUrl
                            ? "Offer sample preview"
                            : "Retained offer sample"
                        }
                        className="absolute inset-0 h-full w-full object-contain opacity-90"
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
                    {(previewUrl || retainedOfferSampleUrl) && (
                      <span className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/70 px-3 py-1 text-xs text-white backdrop-blur">
                        {previewUrl
                          ? "Click to replace image"
                          : "Keeping previous sample. Click to replace."}
                      </span>
                    )}
                  </label>
                </div>
                )}
              </>

                    {!isFlashRequest && (
                      <section className={`rounded-lg border border-white/10 bg-white/[0.035] p-5 ${getCustomOfferPreviewStepClassName()}`}>
                        <div className="mb-5 flex items-start gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-300/10 text-emerald-100">
                            <ReceiptText size={19} />
                          </span>
                          <div>
                            <h3 className="text-lg! font-semibold! text-white">
                              Preview
                            </h3>
                            <p className="text-sm text-neutral-400">
                              Quick final check before the offer goes out.
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <PreviewTile
                            label="Offer price"
                            value={formatMoneyFromCents(
                              Math.round(effectiveOfferPrice * 100)
                            )}
                            tone="strong"
                          />
                          <PreviewTile
                            label="Deposit to book"
                            value={formatMoneyFromCents(
                              Math.round(Number(depositAmount || 0) * 100)
                            )}
                          />
                          <PreviewTile
                            label="Remaining balance"
                            value={formatMoneyFromCents(
                              Math.round(remainingArtistBalance * 100)
                            )}
                          />
                          <PreviewTile
                            label="Project"
                            value={
                              isMultiSessionProject
                                ? `${estimatedSessionCount} sessions`
                                : "Single session"
                            }
                          />
                        </div>

                        <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
                            Appointment options
                          </p>
                          <div className="mt-3 grid gap-2">
                            {completedDateOptions.length > 0 ? (
                              completedDateOptions.map((option, index) => (
                                <div
                                  key={`${option.date}-${option.time}-${index}`}
                                  className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                                >
                                  <span className="font-semibold text-neutral-500">
                                    Option {index + 1}
                                  </span>
                                  <span className="text-right font-medium text-white">
                                    {formatOfferPreviewAppointment(option)}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-400">
                                No complete appointment options yet.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 xl:grid-cols-2">
                          <div className="rounded-lg border border-white/10 bg-black/25 p-4">
                            <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
                              Message
                            </p>
                            <p className="mt-3 min-h-24 whitespace-pre-line text-sm leading-6 text-neutral-300">
                              {offerMessage || "No message included."}
                            </p>
                          </div>
                          <PreviewImage
                            label="Offer sample"
                            imageUrl={previewUrl || retainedOfferSampleUrl}
                            emptyLabel="No sample included"
                          />
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="z-20 flex flex-col-reverse gap-3 border-t border-white/10 bg-[#171717]/95 px-4 py-3 shadow-[0_-16px_30px_rgba(0,0,0,0.28)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <p className="text-sm text-neutral-500">
              {shouldUseCustomOfferStepper
                ? isCustomOfferStepperFinalStep
                  ? "Review the preview, then send the offer."
                  : "Continue through the offer steps before sending."
                : isPreviewingOffer
                ? "Review the offer summary before sending."
                : `${completedDateOptions.length} appointment option${
                    completedDateOptions.length === 1 ? "" : "s"
                  } ready`}
            </p>
            <div
              className={`grid w-full gap-2 sm:flex sm:w-auto sm:flex-row sm:gap-3 ${
                isPreviewingOffer ? "grid-cols-2" : "grid-cols-3"
              }`}
            >
              <button
                type="button"
                onClick={
                  isPreviewingOffer
                    ? () => setIsPreviewingOffer(false)
                    : handleClose
                }
                className="modal-action-button inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-lg! border border-white/10 bg-white/[0.03] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
              >
                {isPreviewingOffer ? "Back to edit" : "Cancel"}
              </button>
              {shouldUseCustomOfferStepper && !isPreviewingOffer && (
                <button
                  type="button"
                  disabled={customOfferStepIndex === 0}
                  onClick={() =>
                    setCustomOfferStepIndex((currentStepIndex) =>
                      Math.max(currentStepIndex - 1, 0)
                    )
                  }
                  className="modal-action-button inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-lg! border border-white/10 bg-white/[0.03] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Back
                </button>
              )}
              {shouldUseCustomOfferStepper &&
                !isPreviewingOffer &&
                !isCustomOfferStepperFinalStep && (
                  <button
                    type="button"
                    disabled={isCustomOfferStepContinueBlocked}
                    onClick={() =>
                      goToCustomOfferStep(customOfferStepIndex + 1)
                    }
                    className="modal-action-button inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-black/55"
                  >
                    Continue
                  </button>
                )}
              {!isPreviewingOffer && !shouldUseCustomOfferStepper && (
                <button
                  type="button"
                  onClick={handlePreviewOffer}
                  disabled={isOfferActionLocked}
                  className="modal-action-button inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg! border border-amber-200/55 bg-amber-300/10 px-3! py-2! text-xs! font-semibold text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(252,211,77,0.08)] backdrop-blur transition hover:border-amber-100/75 hover:bg-amber-300/16 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-neutral-500 disabled:shadow-none sm:gap-2"
                >
                  Preview offer
                  <ReceiptText size={16} className="text-amber-200" />
                </button>
              )}
              {(!shouldUseCustomOfferStepper ||
                isCustomOfferStepperFinalStep) && (
                <button
                  type="submit"
                  disabled={isSubmitting || isOfferActionLocked}
                  className="modal-action-button inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-2"
                >
                  {isSubmitting ? "Sending..." : "Send offer"}
                  <Send size={16} />
                </button>
              )}
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

            <div className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
              <div className="border-b border-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                  Client checkout today
                </p>
              </div>
              <div className="divide-y divide-white/10">
                <ReceiptLine
                  label="Artist deposit"
                  value={formatMoneyFromCents(Math.round(depositAmount * 100))}
                  note="Amount you are asking the client to reserve today."
                />
                {isInternalPayment && (
                  <>
                    <ReceiptLine
                      label="SATX Ink fee"
                      value={formatMoneyFromCents(
                        paymentPreview.platformFeeCents
                      )}
                      note="Platform fee calculated from the full artist quote."
                    />
                    <ReceiptLine
                      label="Estimated Stripe fee"
                      value={formatMoneyFromCents(paymentPreview.stripeFeeCents)}
                      note="Estimated processing cost for today's checkout."
                    />
                  </>
                )}
                <ReceiptLine
                  label="Client pays today"
                  value={todayClientPayment}
                  total
                />
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-black/25">
              <div className="border-b border-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                  Artist payout and later balance
                </p>
              </div>
              <div className="divide-y divide-white/10">
                <ReceiptLine
                  label="Total artist quote"
                  value={formatMoneyFromCents(Math.round(offerPrice * 100))}
                />
                <ReceiptLine
                  label="You receive from today's deposit"
                  value={artistReceivesToday}
                  emphasis
                />
                <ReceiptLine
                  label="Remaining artist balance"
                  value={formatMoneyFromCents(
                    Math.round(remainingArtistBalance * 100)
                  )}
                  note={laterPaymentLabel}
                />
              </div>
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

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
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
                  Message to client
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
  <div className="relative isolate mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#151515] p-3 text-left shadow-[0_18px_55px_rgba(0,0,0,0.34)]">
    <div
      className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
      aria-hidden="true"
    />
    <span
      className="spotlight-border-glint spotlight-border-glint--left"
      aria-hidden="true"
    />
    <span
      className="spotlight-border-glint spotlight-border-glint--right"
      aria-hidden="true"
    />
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
      {previewUrl ? (
        <Zoom>
          <img
            src={previewUrl}
            alt={request.flashTitle || "Requested flash"}
            className="h-full w-full object-cover"
          />
        </Zoom>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
          <ImageIcon size={34} />
          <span>No flash image</span>
        </div>
      )}
      <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/75 px-3! py-1.5! text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur">
        Flash item
      </span>
    </div>
    <div className="flex items-start justify-between gap-4 px-1 pt-4">
      <h3 className="min-w-0 truncate text-lg! font-semibold! text-white">
        {request.flashTitle || "Untitled flash"}
      </h3>
      <p className="shrink-0 text-base font-semibold text-white">
        {typeof request.flashPrice === "number" && request.flashPrice > 0
          ? formatMoneyFromCents(Math.round(request.flashPrice * 100))
          : "No price"}
      </p>
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

const ReceiptLine = ({
  label,
  value,
  note,
  total,
  emphasis,
}: {
  label: string;
  value: string;
  note?: string;
  total?: boolean;
  emphasis?: boolean;
}) => (
  <div
    className={`flex items-start justify-between gap-4 px-4 py-3 ${
      total ? "bg-emerald-300/10" : ""
    }`}
  >
    <div className="min-w-0">
      <p
        className={`text-sm ${
          total || emphasis ? "font-semibold text-white" : "text-neutral-300"
        }`}
      >
        {label}
      </p>
      {note && <p className="mt-1 text-xs leading-5 text-neutral-500">{note}</p>}
    </div>
    <p
      className={`shrink-0 text-right ${
        total
          ? "text-lg font-semibold text-emerald-50"
          : emphasis
          ? "font-semibold text-white"
          : "font-medium text-white"
      }`}
    >
      {value}
    </p>
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
