import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  ImageIcon,
  ImagePlus,
  MapPin,
  Ruler,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { db, storage } from "../firebase/firebaseConfig";
import {
  addDoc,
  collection,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import toast from "react-hot-toast";
import CustomSelect from "./ui/CustomSelect";
import QuarterHourTimeSelect from "./ui/QuarterHourTimeSelect";
import {
  bodyPlacementOptions,
  tattooBudgetOptions,
  tattooSizeOptions,
} from "../utils/tattooOptions";
import {
  getTodayDateInputValue,
  hasPastDateInputValue,
  isDateRangeBackwards,
} from "../utils/dateInputGuards";
import {
  formatClientFullName,
  getClientNameParts,
} from "../utils/clientDisplayName";
import {
  BOOKING_REFERENCE_STANDARD_RETENTION_DAYS,
  getBookingReferenceCleanupTimestamp,
} from "../utils/bookingReferenceRetention";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  client: {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
    avatarUrl: string;
  };
  artist: {
    id: string;
    name: string;
    avatarUrl?: string;
    studioName?: string;
  };
  onRequestSent?: () => void;
}

const availableDayOptions = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type AvailableTime = { from: string; to: string };
type RequestStep = "idea" | "details" | "reference" | "schedule" | "review";
type ReferencePreview = {
  file: File;
  url: string;
};
type UploadedReferenceImage = {
  fileName: string;
  fullUrl: string;
  thumbUrl: string;
  fullPath: string;
  thumbPath: string;
};

const maxReferenceImages = 3;

const requestFlowSteps: Array<{
  id: RequestStep;
  label: string;
  helper: string;
}> = [
  { id: "idea", label: "Idea", helper: "Describe the piece" },
  { id: "details", label: "Details", helper: "Placement and size" },
  { id: "reference", label: "Reference", helper: "Up to 3 images" },
  { id: "schedule", label: "Schedule", helper: "Timing preferences" },
  { id: "review", label: "Review", helper: "Send request" },
];

const RequestTattooModal: React.FC<Props> = ({
  isOpen,
  onClose,
  client,
  artist,
  onRequestSent,
}) => {
  const [activeStep, setActiveStep] = useState<RequestStep>("idea");
  const [description, setDescription] = useState("");
  const [bodyPlacement, setBodyPlacement] = useState("");
  const [size, setSize] = useState("");
  const [preferredDateRange, setPreferredDateRange] = useState(["", ""]);
  const [availableTime, setAvailableTime] = useState<AvailableTime>({
    from: "",
    to: "",
  });
  const [visibleCalendarMonth, setVisibleCalendarMonth] = useState(() =>
    getMonthStart(new Date())
  );
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [budget, setBudget] = useState("");
  const [customBudget, setCustomBudget] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestPanelRef = useRef<HTMLElement | null>(null);
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const progressStepRefs = useRef<Map<RequestStep, HTMLButtonElement>>(
    new Map()
  );
  const earliestEndTime = getMinimumEndTime(availableTime.from);

  const referencePreviews = useMemo<ReferencePreview[]>(
    () =>
      referenceImages.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [referenceImages]
  );
  const hasReferenceImages = referenceImages.length > 0;
  const remainingReferenceSlots = maxReferenceImages - referenceImages.length;
  const clientNameParts = getClientNameParts(client);
  const clientName = formatClientFullName(
    clientNameParts.firstName,
    clientNameParts.lastName,
    client.name || "Client"
  );
  const clientAvatar = client.avatarUrl || "/default-avatar.png";
  const artistName = artist.name || "Artist";
  const todayDateInput = getTodayDateInputValue();
  const activeStepIndex = requestFlowSteps.findIndex(
    (flowStep) => flowStep.id === activeStep
  );
  const parsedCustomBudget = Number(customBudget);
  const isCustomBudgetValid =
    budget !== "custom" ||
    (!Number.isNaN(parsedCustomBudget) &&
      parsedCustomBudget > 0 &&
      parsedCustomBudget <= 5000);
  const isIdeaComplete = description.trim().length > 0;
  const areDetailsComplete =
    Boolean(bodyPlacement.trim() && size) && isCustomBudgetValid;
  const hasSelectedDateWindow = Boolean(
    preferredDateRange[0] && preferredDateRange[1]
  );
  const hasValidDateWindow =
    hasSelectedDateWindow &&
    !hasPastDateInputValue(preferredDateRange, todayDateInput) &&
    !isDateRangeBackwards(preferredDateRange[0], preferredDateRange[1]);
  const hasValidTimeWindow = Boolean(
    availableTime.from &&
      availableTime.to &&
      hasMinimumTimeWindow(availableTime.from, availableTime.to)
  );
  const isScheduleComplete = hasValidDateWindow && hasValidTimeWindow;
  const maxReachableStepIndex = !isIdeaComplete
    ? 0
    : !areDetailsComplete
    ? 1
    : !isScheduleComplete
    ? 3
    : 4;

  useEffect(() => {
    return () => {
      referencePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [referencePreviews]);

  useEffect(() => {
    if (!isOpen) return;

    const scrollFrame = window.requestAnimationFrame(() => {
      const isCompactViewport = window.matchMedia("(max-width: 640px)")
        .matches;
      const behavior =
        prefersReducedMotion() || isCompactViewport ? "auto" : "smooth";

      modalBodyRef.current?.scrollTo({ top: 0, behavior });
      progressStepRefs.current.get(activeStep)?.scrollIntoView({
        behavior,
        block: "nearest",
        inline: "center",
      });

      if (isCompactViewport) {
        const panelRect = requestPanelRef.current?.getBoundingClientRect();
        const shouldRestorePanelTop =
          panelRect &&
          (panelRect.top < 64 || panelRect.top > window.innerHeight * 0.24);

        if (shouldRestorePanelTop) {
          requestPanelRef.current?.scrollIntoView({
            behavior: "auto",
            block: "start",
          });
        }
      }
    });

    return () => window.cancelAnimationFrame(scrollFrame);
  }, [activeStep, isOpen]);

  const reset = () => {
    setActiveStep("idea");
    setDescription("");
    setBodyPlacement("");
    setSize("");
    setPreferredDateRange(["", ""]);
    setAvailableTime({ from: "", to: "" });
    setVisibleCalendarMonth(getMonthStart(new Date()));
    setAvailableDays([]);
    setReferenceImages([]);
    setBudget("");
    setCustomBudget("");
    setIsSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const goToStep = (nextStep: RequestStep) => {
    const nextIndex = requestFlowSteps.findIndex(
      (flowStep) => flowStep.id === nextStep
    );

    if (nextIndex <= maxReachableStepIndex) {
      setActiveStep(nextStep);
      return;
    }

    if (!isIdeaComplete) {
      toast.error("Start with the tattoo idea first.");
      setActiveStep("idea");
      return;
    }

    if (!areDetailsComplete) {
      toast.error("Add placement, size, and a valid custom budget first.");
      setActiveStep("details");
      return;
    }

    toast.error("Confirm your preferred dates and time first.");
    setActiveStep("schedule");
  };

  const handleSelectCalendarDate = (date: Date) => {
    const dateValue = formatDateInputValue(date);

    if (dateValue < todayDateInput) return;

    setPreferredDateRange(([start, end]) => {
      if (!start || end || dateValue < start) return [dateValue, ""];
      return [start, dateValue];
    });
  };

  const toggleAvailableDay = (day: string) => {
    setAvailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const continueFromIdea = () => {
    if (!isIdeaComplete) {
      toast.error("Describe the tattoo idea before continuing.");
      return;
    }

    setActiveStep("details");
  };

  const continueFromDetails = () => {
    if (!bodyPlacement.trim() || !size) {
      toast.error("Add placement and size before continuing.");
      return;
    }

    if (!isCustomBudgetValid) {
      toast.error("Please enter a valid custom budget under $5,000.");
      return;
    }

    setActiveStep("reference");
  };

  const continueFromSchedule = () => {
    if (!hasSelectedDateWindow) {
      toast.error("Pick the first and last day of your ideal window.");
      return;
    }

    if (!hasValidDateWindow) {
      toast.error("Preferred dates must be today or later and in order.");
      return;
    }

    if (!hasValidTimeWindow) {
      toast.error("Choose a preferred start and end time of at least 1 hour.");
      return;
    }

    setActiveStep("review");
  };

  const handleReferenceImagesChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (selectedFiles.length === 0) return;

    if (remainingReferenceSlots <= 0) {
      toast.error("You can include up to 3 reference images.");
      return;
    }

    const imageFiles = selectedFiles.filter((file) =>
      file.type.startsWith("image/")
    );

    if (imageFiles.length !== selectedFiles.length) {
      toast.error("Only image files can be added as references.");
    }

    if (imageFiles.length === 0) return;

    const filesToAdd = imageFiles.slice(0, remainingReferenceSlots);
    const skippedCount = imageFiles.length - filesToAdd.length;

    if (skippedCount > 0) {
      toast.error("Only the first 3 reference images can be included.");
    }

    setReferenceImages((current) => [...current, ...filesToAdd]);
    toast.success(
      filesToAdd.length === 1
        ? "Reference image added."
        : `${filesToAdd.length} reference images added.`
    );
  };

  const handleRemoveReferenceImage = (indexToRemove: number) => {
    setReferenceImages((current) =>
      current.filter((_, index) => index !== indexToRemove)
    );
    toast.success("Reference image removed.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isIdeaComplete) {
      toast.error("Describe the tattoo idea before sending.");
      setActiveStep("idea");
      return;
    }

    if (!areDetailsComplete) {
      toast.error("Add placement, size, and a valid budget before sending.");
      setActiveStep("details");
      return;
    }

    if (!hasSelectedDateWindow) {
      toast.error("Pick the first and last day of your ideal window.");
      setActiveStep("schedule");
      return;
    }

    if (hasPastDateInputValue(preferredDateRange, todayDateInput)) {
      toast.error("Preferred dates must be today or later.");
      setActiveStep("schedule");
      return;
    }

    if (isDateRangeBackwards(preferredDateRange[0], preferredDateRange[1])) {
      toast.error(
        "Latest date must be the same day or after the earliest date."
      );
      setActiveStep("schedule");
      return;
    }

    if (!hasValidTimeWindow) {
      toast.error("Choose a preferred start and end time of at least 1 hour.");
      setActiveStep("schedule");
      return;
    }

    let finalBudget: string | number | null = null;

    if (budget === "custom") {
      const parsed = Number(customBudget);
      finalBudget =
        !Number.isNaN(parsed) && parsed > 0 && parsed <= 5000 ? parsed : null;

      if (finalBudget === null) {
        toast.error("Please enter a valid custom budget under $5,000.");
        setActiveStep("details");
        return;
      }
    } else {
      finalBudget = budget || null;
    }

    try {
      setIsSubmitting(true);
      const reqRef = await addDoc(collection(db, "bookingRequests"), {
        artistId: artist.id,
        artistName,
        artistAvatar: artist.avatarUrl || "/default-avatar.png",
        clientId: client.id,
        clientFirstName: clientNameParts.firstName,
        clientLastName: clientNameParts.lastName,
        clientName,
        clientAvatar,
        description,
        bodyPlacement,
        size,
        preferredDateRange,
        budget: finalBudget,
        availableTime,
        availableDays,
        status: "pending",
        createdAt: serverTimestamp(),
        ...(hasReferenceImages
          ? {
              referenceCleanupAt: getBookingReferenceCleanupTimestamp(
                BOOKING_REFERENCE_STANDARD_RETENTION_DAYS
              ),
            }
          : {}),
      });

      toast.success("Request sent!");
      onRequestSent?.();
      reset();
      onClose();

      if (referenceImages.length > 0) {
        const waitForURL = (
          imageRef: ReturnType<typeof ref>,
          maxRetries = 24,
          delay = 1000
        ): Promise<string> =>
          new Promise((resolve, reject) => {
            const attempt = (retries: number) => {
              getDownloadURL(imageRef)
                .then(resolve)
                .catch((err) => {
                  if (retries >= maxRetries) {
                    reject(err);
                    return;
                  }
                  setTimeout(() => attempt(retries + 1), delay);
                });
            };
            attempt(0);
          });

        try {
          const uploadedReferences: UploadedReferenceImage[] = await Promise.all(
            referenceImages.map(async (image, index) => {
              const storageFileName = getReferenceStorageFileName(image, index);
              const processedFileName =
                getProcessedReferenceFileName(storageFileName);
              const originalRef = ref(
                storage,
                `bookingRequests/${reqRef.id}/originals/${storageFileName}`
              );

              await uploadBytes(originalRef, image);

              const processedPaths = getProcessedReferenceStoragePaths(
                storageFileName
              );
              const fullRef = ref(storage, processedPaths.fullPath);
              const thumbRef = ref(storage, processedPaths.thumbPath);

              const [fullUrl, thumbUrl] = await Promise.all([
                waitForURL(fullRef),
                waitForURL(thumbRef),
              ]);

              return {
                fileName: processedFileName,
                fullUrl,
                thumbUrl,
                fullPath: processedPaths.fullPath,
                thumbPath: processedPaths.thumbPath,
              };
            })
          );

          const primaryReference = uploadedReferences[0];

          await updateDoc(reqRef, {
            fullUrl: primaryReference.fullUrl,
            thumbUrl: primaryReference.thumbUrl,
            referenceImages: uploadedReferences,
          });
        } catch (error) {
          console.warn("Reference image not ready after retry:", error);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <section
      ref={requestPanelRef}
      className="satx-request-flow-shell relative isolate scroll-mt-24 overflow-hidden rounded-lg border border-white/10 bg-[#111111]/94 text-white shadow-[0_18px_58px_rgba(0,0,0,0.36)] sm:scroll-mt-28 sm:bg-[#111111]/86 sm:shadow-[0_28px_90px_rgba(0,0,0,0.42)] sm:backdrop-blur-md"
      aria-label="Tattoo request"
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.07),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.035),transparent_44%)]" />

      <div className="relative z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="min-w-0">
            <h2 className="mt-1 text-xl!  leading-tight text-white">
              Share your tattoo idea with {artistName}
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
          aria-label="Close request"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative z-10 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="request-modal-scrollbar -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-2">
            {requestFlowSteps.map((flowStep, index) => {
              const isActive = flowStep.id === activeStep;
              const canVisit = index <= maxReachableStepIndex;
              const isComplete =
                (flowStep.id === "idea" && isIdeaComplete) ||
                (flowStep.id === "details" && areDetailsComplete) ||
                (flowStep.id === "reference" && index < activeStepIndex) ||
                (flowStep.id === "schedule" && isScheduleComplete);

              return (
                <button
                  key={flowStep.id}
                  ref={(node) => {
                    if (node) {
                      progressStepRefs.current.set(flowStep.id, node);
                    } else {
                      progressStepRefs.current.delete(flowStep.id);
                    }
                  }}
                  type="button"
                  onClick={() => goToStep(flowStep.id)}
                  disabled={!canVisit}
                  aria-current={isActive ? "step" : undefined}
                  className={`satx-request-progress-step inline-flex min-w-[9.5rem] items-center gap-3 rounded-md border px-3! py-2.5! text-left transition ${
                    isActive
                      ? "border-white/30 bg-white/[0.095] text-white"
                      : isComplete
                      ? "border-[#19d69b]/5 bg-[#19d69b]/5 text-white/85 hover:border-[#19d69b]/55"
                      : canVisit
                      ? "border-white/10 bg-white/[0.035] text-white/65 hover:border-white/20 hover:text-white"
                      : "cursor-not-allowed border-white/5 bg-black/20 text-white/25"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs! font-bold ${
                      isActive
                        ? "bg-white text-black"
                        : isComplete
                        ? "bg-[#19d69b]/20 text-black"
                        : "bg-white/[0.07] text-white/55"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm! font-semibold leading-4">
                      {flowStep.label}
                    </span>
                    <span className="mt-0.5 block text-[11px]! leading-4 text-white/40">
                      {flowStep.helper}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="relative z-10">
        <div ref={modalBodyRef} className="p-4 sm:p-5">
          <div key={activeStep} className="satx-request-step-panel">
            {activeStep === "idea" && (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f04438]/10 text-[#f04438]">
                      <ImageIcon size={19} />
                    </div>
                    <div>
                      <h3 className="text-lg! font-semibold! text-white">
                        Start with the idea
                      </h3>
                      <p className="text-sm text-white/55">
                        Share the subject, style, mood, and anything that
                        matters before {artistName} replies.
                      </p>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-white/65">
                      Tattoo idea
                    </span>
                    <textarea
                      required
                      className="min-h-52 w-full rounded-md border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-white/40"
                      placeholder="Describe the subject, style, mood, and any details that matter."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>

                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={continueFromIdea}
                      className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-4! py-2.5! text-xs! font-semibold text-black transition hover:bg-white/85"
                    >
                      Continue
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>

                <aside className="rounded-lg border border-white/10 bg-black/25 p-5">
                  <p className="mt-3 text-sm! leading-6 text-white/65">
                    A clear idea helps the artist respond with realistic
                    guidance, pricing, and next steps.
                  </p>
                </aside>
              </div>
            )}

            {activeStep === "details" && (
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f04438]/10 text-[#f04438]">
                    <Ruler size={19} />
                  </div>
                  <div>
                    <h3 className="text-lg! font-semibold! text-white">
                      Placement, size, and budget
                    </h3>
                    <p className="text-sm text-white/55">
                      Add the practical details that shape the request.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-white/65">
                      <MapPin size={15} />
                      Body placement
                    </span>
                    <CustomSelect
                      placeholder="Forearm, thigh, shoulder..."
                      value={bodyPlacement}
                      onChange={setBodyPlacement}
                      options={bodyPlacementOptions}
                      buttonClassName="focus:border-[#19d69b]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-white/65">
                      <Ruler size={15} />
                      Size
                    </span>
                    <CustomSelect
                      value={size}
                      onChange={setSize}
                      options={tattooSizeOptions}
                      placeholder="Select size"
                      buttonClassName="focus:border-[#19d69b]"
                    />
                  </label>
                </div>

                <div className="mt-4 w-full max-w-xl">
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-white/65">
                      <DollarSign size={15} />
                      Optional budget
                    </span>
                    <CustomSelect
                      value={budget}
                      onChange={setBudget}
                      options={tattooBudgetOptions}
                      placeholder="Have a budget?"
                      buttonClassName="focus:border-[#19d69b]"
                    />
                  </label>

                  {budget === "custom" && (
                    <input
                      type="number"
                      placeholder="Enter your budget (USD)"
                      value={customBudget}
                      onChange={(e) => setCustomBudget(e.target.value)}
                      className="mt-3 w-full rounded-md border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#19d69b]"
                      min={0}
                      step={5}
                    />
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveStep("idea")}
                    className="modal-action-button inline-flex items-center justify-center rounded-lg! border border-white/10 bg-white/[0.03] px-4! py-2.5! text-xs! font-semibold text-white transition hover:bg-white/10"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={continueFromDetails}
                    className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-4! py-2.5! text-xs! font-semibold text-black transition hover:bg-white/85"
                  >
                    Continue
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {activeStep === "reference" && (
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 sm:p-5">
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                      <Upload size={19} />
                    </div>
                    <div>
                      <h3 className="text-lg! font-semibold! text-white">
                        Reference images
                      </h3>
                      <p className="text-sm text-white/55">
                        Optional, but helpful for composition, placement, or
                        style direction.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-full border border-white/10 bg-black/25 px-3! py-1.5! text-xs! font-semibold text-white/55">
                    {referenceImages.length}/{maxReferenceImages} added
                  </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.78fr)_minmax(0,1.22fr)]">
                  <label
                    className={`group relative flex min-h-64 flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed p-5 text-center transition ${
                      remainingReferenceSlots > 0
                        ? "cursor-pointer border-white/20 bg-black/35 hover:border-white/40 hover:bg-white/[0.04]"
                        : "cursor-not-allowed border-white/10 bg-black/20 opacity-70"
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={remainingReferenceSlots <= 0}
                      onChange={handleReferenceImagesChange}
                      className="sr-only"
                    />
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-[0_14px_40px_rgba(0,0,0,0.3)] transition group-hover:scale-105">
                      <ImagePlus size={22} />
                    </span>
                    <span className="text-sm! font-semibold text-white">
                      {remainingReferenceSlots > 0
                        ? "Add reference images"
                        : "Reference limit reached"}
                    </span>
                    <span className="mt-1 max-w-56 text-xs! leading-5 text-white/45">
                      {remainingReferenceSlots > 0
                        ? `Choose up to ${remainingReferenceSlots} more image${
                            remainingReferenceSlots === 1 ? "" : "s"
                          }. JPG, PNG, or WebP.`
                        : "Remove an image to add another reference."}
                    </span>
                  </label>

                  <div className="rounded-lg border border-white/10 bg-black/25 p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs! uppercase tracking-[0.16em] text-white/40">
                          Selected references
                        </p>
                        <p className="mt-1 text-sm text-white/55">
                          These will be sent with your idea.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
                      {referencePreviews.map((preview, index) => (
                        <div
                          key={`${preview.file.name}-${preview.file.lastModified}-${index}`}
                          className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-white/10 bg-[#0d0d0d]"
                        >
                          <img
                            src={preview.url}
                            alt={`Reference ${index + 1}`}
                            decoding="async"
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                            {index === 0 && (
                              <span className="rounded-full border border-[#19d69b]/35 bg-[#19d69b]/15 px-2! py-1! text-[10px]! font-bold uppercase tracking-[0.12em] text-white">
                                Primary
                              </span>
                            )}
                            <span className="rounded-full border border-white/15 bg-black/55 px-2! py-1! text-[10px]! font-bold uppercase tracking-[0.12em] text-white/70 sm:backdrop-blur">
                              {index + 1}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveReferenceImage(index)}
                            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-black/60 p-0! text-white transition hover:bg-white/15 sm:backdrop-blur"
                            aria-label={`Remove reference ${index + 1}`}
                          >
                            <Trash2 size={15} />
                          </button>
                          <div className="absolute inset-x-0 bottom-0 p-3">
                            <p className="truncate text-xs! font-semibold text-white">
                              {preview.file.name}
                            </p>
                          </div>
                        </div>
                      ))}

                      {!hasReferenceImages && (
                        <div className="col-span-2 flex min-h-40 flex-col items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] px-5 text-center xl:col-span-3">
                          <ImageIcon size={24} className="mb-3 text-white/35" />
                          <p className="text-sm! font-semibold text-white/75">
                            No references added yet
                          </p>
                          <p className="mt-1 text-xs! leading-5 text-white/45">
                            You can skip this step or add images that help
                            explain the idea.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveStep("details")}
                    className="modal-action-button inline-flex items-center justify-center rounded-lg! border border-white/10 bg-white/[0.03] px-4! py-2.5! text-xs! font-semibold text-white transition hover:bg-white/10"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveStep("schedule")}
                    className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-4! py-2.5! text-xs! font-semibold text-black transition hover:bg-white/85"
                  >
                    {hasReferenceImages ? "Continue" : "Skip for now"}
                    <CalendarDays size={16} />
                  </button>
                </div>
              </div>
            )}

            {activeStep === "schedule" && (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f04438]/10 text-[#f04438]">
                      <CalendarDays size={19} />
                    </div>
                    <div>
                      <h3 className="text-lg! font-semibold! text-white">
                        Preferred timing
                      </h3>
                      <p className="text-sm text-white/55">
                        Pick an ideal date window and a preferred time range.
                      </p>
                    </div>
                  </div>

                  {preferredDateRange[0] && (
                    <div className="mb-4 rounded-lg border border-[#19d69b]/25 bg-[#19d69b]/10 p-3">
                      <p className="text-xs! uppercase tracking-[0.16em] text-[#19d69b]">
                        Selected window
                      </p>
                      <p className="mt-1 text-sm! font-semibold text-white">
                        {getDateRangeLabel(preferredDateRange)}
                      </p>
                    </div>
                  )}

                  <CalendarRangePicker
                    month={visibleCalendarMonth}
                    selectedRange={preferredDateRange}
                    todayDateInput={todayDateInput}
                    onMonthChange={setVisibleCalendarMonth}
                    onSelectDate={handleSelectCalendarDate}
                  />

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-white/65">
                        From
                      </span>
                      <QuarterHourTimeSelect
                        value={availableTime.from}
                        onChange={(value) => {
                          setAvailableTime((prev) => ({
                            ...prev,
                            from: value,
                            to: hasMinimumTimeWindow(value, prev.to)
                              ? prev.to
                              : "",
                          }));
                        }}
                        placeholder="Select time"
                        buttonClassName="focus:border-[#19d69b]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-white/65">
                        To
                      </span>
                      <QuarterHourTimeSelect
                        value={availableTime.to}
                        onChange={(value) => {
                          setAvailableTime((prev) => ({
                            ...prev,
                            to: value,
                          }));
                        }}
                        placeholder="Select time"
                        buttonClassName="focus:border-[#19d69b]"
                        minTime={earliestEndTime}
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                  <h3 className="text-lg! font-semibold! text-white">
                    Days that usually work
                  </h3>
                  <p className="mt-1 text-sm text-white/55">
                    Select any days you are normally available. You can confirm
                    exact times after the artist replies.
                  </p>

                  <AvailableDaysSelector
                    availableDays={availableDays}
                    onToggleDay={toggleAvailableDay}
                  />

                  <div className="mt-6 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveStep("reference")}
                      className="modal-action-button inline-flex items-center justify-center rounded-lg! border border-white/10 bg-white/[0.03] px-4! py-2.5! text-xs! font-semibold text-white transition hover:bg-white/10"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={continueFromSchedule}
                      className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-4! py-2.5! text-xs! font-semibold text-black transition hover:bg-white/85"
                    >
                      Review
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeStep === "review" && (
              <RequestPreviewPanel
                artistName={artistName}
                referencePreviews={referencePreviews}
                description={description}
                bodyPlacement={bodyPlacement}
                size={size}
                budget={budget}
                customBudget={customBudget}
                preferredDateRange={preferredDateRange}
                availableTime={availableTime}
                availableDays={availableDays}
                isSubmitting={isSubmitting}
                onBack={() => setActiveStep("schedule")}
              />
            )}
          </div>
        </div>
      </form>
    </section>
  );
};

const RequestPreviewPanel = ({
  artistName,
  referencePreviews,
  description,
  bodyPlacement,
  size,
  budget,
  customBudget,
  preferredDateRange,
  availableTime,
  availableDays,
  isSubmitting,
  onBack,
}: {
  artistName: string;
  referencePreviews: ReferencePreview[];
  description: string;
  bodyPlacement: string;
  size: string;
  budget: string;
  customBudget: string;
  preferredDateRange: string[];
  availableTime: AvailableTime;
  availableDays: string[];
  isSubmitting: boolean;
  onBack: () => void;
}) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 sm:p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs! uppercase tracking-[0.18em] text-[#19d69b]">
          Request preview
        </p>
        <h3 className="mt-2 text-xl! font-semibold! text-white">
          Confirm your details
        </h3>
        <p className="mt-1 text-sm text-white/55">
          Review what {artistName} will receive before you send it.
        </p>
      </div>

      <div className="grid w-24 shrink-0 grid-cols-2 gap-1">
        {referencePreviews.length > 0 ? (
          referencePreviews.slice(0, 3).map((preview, index) => (
            <div
              key={`${preview.file.name}-review-${index}`}
              className={`overflow-hidden rounded-md border border-white/10 bg-black/35 ${
                index === 0 && referencePreviews.length === 1
                  ? "col-span-2 h-20"
                  : "h-10"
              }`}
            >
              <img
                src={preview.url}
                alt={`Reference ${index + 1}`}
                decoding="async"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          ))
        ) : (
          <div className="col-span-2 flex h-20 items-center justify-center rounded-lg border border-white/10 bg-black/35 text-white/35">
            <ImageIcon size={22} />
          </div>
        )}
      </div>
    </div>

    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <PreviewDetail
        label="Selected window"
        value={getDateRangeLabel(preferredDateRange)}
        accent
      />
      <PreviewDetail
        label="Preferred time"
        value={getTimeRangeLabel(availableTime)}
      />
      <PreviewDetail
        label="Placement"
        value={bodyPlacement || "Not specified"}
      />
      <PreviewDetail
        label="Size"
        value={getOptionLabel(tattooSizeOptions, size) || "Not specified"}
      />
      <PreviewDetail
        label="Budget"
        value={getBudgetLabel(budget, customBudget)}
      />
      <PreviewDetail
        label="References"
        value={
          referencePreviews.length > 0
            ? `${referencePreviews.length} image${
                referencePreviews.length === 1 ? "" : "s"
              } attached`
            : "No references attached"
        }
      />
    </div>

    <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-3">
      <p className="text-xs! uppercase tracking-[0.16em] text-white/40">
        Tattoo idea
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm! leading-6 text-white/80">
        {description.trim()}
      </p>
    </div>

    <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-3">
      <p className="text-xs! uppercase tracking-[0.16em] text-white/40">
        Days that usually work
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {availableDays.length > 0 ? (
          availableDays.map((day) => (
            <span
              key={day}
              className="rounded-full border border-[#19d69b]/35 bg-[#19d69b]/10 px-3! py-1.5! text-xs! font-semibold text-white"
            >
              {day}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3! py-1.5! text-xs! font-semibold text-white/55">
            No specific days selected
          </span>
        )}
      </div>
    </div>

    <div className="mt-6 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onBack}
        className="modal-action-button inline-flex items-center justify-center rounded-lg! border border-white/10 bg-white/[0.03] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
      >
        Back
      </button>
      <button
        type="submit"
        disabled={isSubmitting}
        className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Sending..." : "Send request"}
        <Send size={16} />
      </button>
    </div>
  </div>
);

const PreviewDetail = ({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) => (
  <div
    className={`rounded-lg border p-3 ${
      accent
        ? "border-[#19d69b]/25 bg-[#19d69b]/10"
        : "border-white/10 bg-black/25"
    }`}
  >
    <p
      className={`text-xs! uppercase tracking-[0.16em] ${
        accent ? "text-[#19d69b]" : "text-white/40"
      }`}
    >
      {label}
    </p>
    <p className="mt-1 text-sm! font-semibold text-white">{value}</p>
  </div>
);

const AvailableDaysSelector = ({
  availableDays,
  onToggleDay,
}: {
  availableDays: string[];
  onToggleDay: (day: string) => void;
}) => (
  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
    {availableDayOptions.map((day) => (
      <button
        key={day}
        type="button"
        className={`rounded-md border px-3! py-3! text-left text-sm! font-medium transition ${
          availableDays.includes(day)
            ? "border-[#19d69b]/55 bg-[#19d69b]/15 text-white"
            : "border-white/10 bg-black/30 text-white/65 hover:border-white/25 hover:bg-white/[0.05]"
        }`}
        onClick={() => onToggleDay(day)}
      >
        {day}
      </button>
    ))}
  </div>
);

const CalendarRangePicker = ({
  month,
  selectedRange,
  todayDateInput,
  onMonthChange,
  onSelectDate,
}: {
  month: Date;
  selectedRange: string[];
  todayDateInput: string;
  onMonthChange: (nextMonth: Date) => void;
  onSelectDate: (date: Date) => void;
}) => {
  const calendarCells = getCalendarCells(month);
  const monthLabel = month.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const [start, end] = selectedRange;
  const canGoPrevious =
    formatDateInputValue(month) >
    formatDateInputValue(getMonthStart(new Date()));

  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          disabled={!canGoPrevious}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] p-0! text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Previous month"
        >
          <ChevronLeft size={15} />
        </button>
        <p className="text-sm! font-semibold text-white">{monthLabel}</p>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] p-0! text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Next month"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <span
            key={`${day}-${index}`}
            className="py-0.5 text-[10px]! font-semibold uppercase text-white/35"
          >
            {day}
          </span>
        ))}

        {calendarCells.map((date) => {
          const dateValue = formatDateInputValue(date);
          const isPast = dateValue < todayDateInput;
          const isCurrentMonth = date.getMonth() === month.getMonth();
          const isStart = dateValue === start;
          const isEnd = dateValue === end;
          const isInRange = isDateInRange(dateValue, start, end);
          const isSelected = isStart || isEnd;

          return (
            <button
              key={dateValue}
              type="button"
              disabled={isPast}
              onClick={() => onSelectDate(date)}
              className={`h-8 rounded-md p-0! text-xs! font-semibold transition disabled:cursor-not-allowed disabled:opacity-25 ${
                isSelected
                  ? "bg-[#19d69b] text-black shadow-[0_0_20px_rgba(25,214,155,0.22)]"
                  : isInRange
                  ? "bg-[#19d69b]/18 text-white"
                  : !isCurrentMonth
                  ? "border border-white/5 bg-white/[0.015] text-white/32 hover:border-[#19d69b]/30 hover:bg-[#19d69b]/10 hover:text-white/80"
                  : "border border-white/10 bg-white/[0.025] text-white/70 hover:border-[#19d69b]/45 hover:bg-[#19d69b]/10 hover:text-white"
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const getMonthStart = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

const getCalendarCells = (month: Date) => {
  const firstDay = getMonthStart(month);
  const dayOffset = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - dayOffset);
  const cells: Date[] = [];

  for (let index = 0; index < 42; index += 1) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + index);
    cells.push(cellDate);
  }

  return cells;
};

const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatFriendlyDate = (dateInput: string) => {
  if (!dateInput) return "";
  const [year, month, day] = dateInput.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const getDateRangeLabel = ([start, end]: string[]) => {
  if (start && end) {
    return `${formatFriendlyDate(start)} - ${formatFriendlyDate(end)}`;
  }
  if (start) return `Starting ${formatFriendlyDate(start)}`;
  return "No dates picked";
};

const getOptionLabel = (
  options: { value: string; label: string }[],
  value: string
) => options.find((option) => option.value === value)?.label || value;

const getBudgetLabel = (budget: string, customBudget: string) => {
  if (budget === "custom") {
    const parsedBudget = Number(customBudget);

    if (Number.isFinite(parsedBudget) && parsedBudget > 0) {
      return `$${parsedBudget.toLocaleString("en-US")}`;
    }

    return "Custom budget not entered";
  }

  return getOptionLabel(tattooBudgetOptions, budget) || "No budget shared";
};

const getTimeRangeLabel = ({ from, to }: AvailableTime) => {
  if (!from || !to) return "No time picked";

  return `${formatFriendlyTime(from)} - ${formatFriendlyTime(to)}`;
};

const formatFriendlyTime = (time: string) => {
  const [rawHour, rawMinute] = time.split(":").map(Number);

  if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinute)) return time;

  const suffix = rawHour >= 12 ? "PM" : "AM";
  const hour = rawHour % 12 || 12;
  const minute = String(rawMinute).padStart(2, "0");
  return `${hour}:${minute} ${suffix}`;
};

const isDateInRange = (dateValue: string, start: string, end: string) =>
  Boolean(start && end && dateValue > start && dateValue < end);

const getTimeMinutes = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

const formatTimeValue = (totalMinutes: number) => {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const getMinimumEndTime = (startTime: string) => {
  const startMinutes = getTimeMinutes(startTime);
  if (startMinutes === null) return undefined;

  const endMinutes = startMinutes + 60;
  return endMinutes < 24 * 60 ? formatTimeValue(endMinutes) : undefined;
};

const hasMinimumTimeWindow = (startTime: string, endTime: string) => {
  const startMinutes = getTimeMinutes(startTime);
  const endMinutes = getTimeMinutes(endTime);

  return (
    startMinutes !== null &&
    endMinutes !== null &&
    endMinutes - startMinutes >= 60
  );
};

const getReferenceStorageFileName = (file: File, index: number) => {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${index + 1}-${Date.now()}-${safeName}`;
};

const getProcessedReferenceFileName = (fileName: string) =>
  fileName.toLowerCase();

const getProcessedReferenceStoragePaths = (fileName: string) => {
  const processedFileName = getProcessedReferenceFileName(fileName);
  const baseName = processedFileName.replace(/\.[^/.]+$/, "");

  return {
    fullPath: `bookingRequests/full/${baseName}.jpg`,
    thumbPath: `bookingRequests/thumbs/${baseName}.webp`,
  };
};

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default RequestTattooModal;
