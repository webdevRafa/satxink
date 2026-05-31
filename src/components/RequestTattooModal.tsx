import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
  ImageIcon,
  MapPin,
  Ruler,
  Send,
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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  client: {
    id: string;
    name: string;
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

type ScheduleStep = "dates" | "time" | "days" | "preview";
type PreviewReturnStep = Exclude<ScheduleStep, "preview">;
type AvailableTime = { from: string; to: string };

const RequestTattooModal: React.FC<Props> = ({
  isOpen,
  onClose,
  client,
  artist,
  onRequestSent,
}) => {
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState("");
  const [bodyPlacement, setBodyPlacement] = useState("");
  const [size, setSize] = useState("");
  const [preferredDateRange, setPreferredDateRange] = useState(["", ""]);
  const [availableTime, setAvailableTime] = useState<AvailableTime>({
    from: "",
    to: "",
  });
  const [scheduleStep, setScheduleStep] = useState<ScheduleStep>("dates");
  const [previewReturnStep, setPreviewReturnStep] =
    useState<PreviewReturnStep>("time");
  const [visibleCalendarMonth, setVisibleCalendarMonth] = useState(() =>
    getMonthStart(new Date())
  );
  const [timingConfirmed, setTimingConfirmed] = useState(false);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [budget, setBudget] = useState("");
  const [customBudget, setCustomBudget] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const earliestEndTime = getMinimumEndTime(availableTime.from);

  const referencePreviewUrl = useMemo(
    () => (referenceImage ? URL.createObjectURL(referenceImage) : ""),
    [referenceImage]
  );
  const clientName = client.name || "Client";
  const clientAvatar = client.avatarUrl || "/default-avatar.png";
  const artistName = artist.name || "Artist";
  const todayDateInput = getTodayDateInputValue();

  useEffect(() => {
    return () => {
      if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
    };
  }, [referencePreviewUrl]);

  useEffect(() => {
    if (!isOpen || step !== 2) return;

    const scrollFrame = window.requestAnimationFrame(() => {
      modalBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(scrollFrame);
  }, [isOpen, step, scheduleStep]);

  useEffect(() => {
    if (!isOpen || !window.matchMedia("(max-width: 639px)").matches) return;

    const scrollY = window.scrollY;
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previousBodyPosition = bodyStyle.position;
    const previousBodyTop = bodyStyle.top;
    const previousBodyLeft = bodyStyle.left;
    const previousBodyRight = bodyStyle.right;
    const previousBodyWidth = bodyStyle.width;
    const previousBodyOverflow = bodyStyle.overflow;
    const previousBodyOverscroll = bodyStyle.overscrollBehavior;
    const previousHtmlOverflow = htmlStyle.overflow;
    const previousHtmlOverscroll = htmlStyle.overscrollBehavior;

    htmlStyle.overflow = "hidden";
    htmlStyle.overscrollBehavior = "none";
    bodyStyle.position = "fixed";
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    bodyStyle.overscrollBehavior = "none";

    return () => {
      bodyStyle.position = previousBodyPosition;
      bodyStyle.top = previousBodyTop;
      bodyStyle.left = previousBodyLeft;
      bodyStyle.right = previousBodyRight;
      bodyStyle.width = previousBodyWidth;
      bodyStyle.overflow = previousBodyOverflow;
      bodyStyle.overscrollBehavior = previousBodyOverscroll;
      htmlStyle.overflow = previousHtmlOverflow;
      htmlStyle.overscrollBehavior = previousHtmlOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  const reset = () => {
    setStep(1);
    setDescription("");
    setBodyPlacement("");
    setSize("");
    setPreferredDateRange(["", ""]);
    setAvailableTime({ from: "", to: "" });
    setScheduleStep("dates");
    setPreviewReturnStep("time");
    setVisibleCalendarMonth(getMonthStart(new Date()));
    setTimingConfirmed(false);
    setAvailableDays([]);
    setReferenceImage(null);
    setBudget("");
    setCustomBudget("");
    setIsSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleNext = () => {
    if (!description.trim() || !bodyPlacement.trim() || !size) {
      toast.error("Please add the idea, placement, and size first.");
      return;
    }

    setStep(2);
  };

  const handleSelectCalendarDate = (date: Date) => {
    const dateValue = formatDateInputValue(date);

    if (dateValue < todayDateInput) return;

    setTimingConfirmed(false);
    setPreferredDateRange(([start, end]) => {
      if (!start || end || dateValue < start) return [dateValue, ""];
      return [start, dateValue];
    });
  };

  const handleConfirmDateWindow = () => {
    if (!preferredDateRange[0] || !preferredDateRange[1]) {
      toast.error("Pick the first and last day of your ideal window.");
      return;
    }

    setScheduleStep("time");
  };

  const confirmTimingSelection = () => {
    if (!availableTime.from || !availableTime.to) {
      toast.error("Choose a preferred start and end time.");
      return false;
    }

    if (!hasMinimumTimeWindow(availableTime.from, availableTime.to)) {
      toast.error("Preferred time windows need to be at least 1 hour.");
      return false;
    }

    setTimingConfirmed(true);
    return true;
  };

  const handleConfirmTiming = () => {
    confirmTimingSelection();
  };

  const handleContinueToAvailableDays = () => {
    if (!confirmTimingSelection()) return;

    setScheduleStep("days");
  };

  const handleOpenPreview = (returnStep: PreviewReturnStep) => {
    if (!timingConfirmed) {
      toast.error("Confirm your preferred timing before previewing.");
      return;
    }

    setPreviewReturnStep(returnStep);
    setScheduleStep("preview");
  };

  const toggleAvailableDay = (day: string) => {
    setAvailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!timingConfirmed) {
      toast.error("Confirm your preferred timing before sending.");
      return;
    }

    if (hasPastDateInputValue(preferredDateRange, todayDateInput)) {
      toast.error("Preferred dates must be today or later.");
      return;
    }

    if (isDateRangeBackwards(preferredDateRange[0], preferredDateRange[1])) {
      toast.error("Latest date must be the same day or after the earliest date.");
      return;
    }

    let finalBudget: string | number | null = null;

    if (budget === "custom") {
      const parsed = Number(customBudget);
      finalBudget =
        !Number.isNaN(parsed) && parsed > 0 && parsed <= 5000 ? parsed : null;

      if (finalBudget === null) {
        toast.error("Please enter a valid custom budget under $5,000.");
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
      });

      toast.success("Request sent!");
      onRequestSent?.();
      reset();
      onClose();

      if (referenceImage) {
        const fileName = referenceImage.name;
        const originalRef = ref(
          storage,
          `bookingRequests/${reqRef.id}/originals/${fileName}`
        );
        await uploadBytes(originalRef, referenceImage);

        const fullRef = ref(
          storage,
          `bookingRequests/${reqRef.id}/full/${fileName}`
        );
        const thumbRef = ref(
          storage,
          `bookingRequests/${reqRef.id}/thumb/${fileName}`
        );

        const waitForURL = (
          imageRef: ReturnType<typeof ref>,
          maxRetries = 10,
          delay = 500
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
          const [fullUrl, thumbUrl] = await Promise.all([
            waitForURL(fullRef),
            waitForURL(thumbRef),
          ]);

          await updateDoc(reqRef, {
            fullUrl,
            thumbUrl,
          });
        } catch (error) {
          console.warn("Image not ready after retry:", error);
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
    <div className="fixed inset-0 z-[120] flex h-dvh items-start justify-center overflow-hidden overscroll-none bg-black/80 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white backdrop-blur-md sm:px-4 sm:pb-4 sm:pt-[5.75rem] lg:pb-5">
      <div className="relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] w-full max-w-5xl flex-col overflow-hidden overscroll-none rounded-lg border border-white/10 bg-[#111111] shadow-2xl sm:max-h-[calc(100dvh-5.75rem-1rem)] lg:max-h-[calc(100dvh-5.75rem-1.25rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-4">
            <img
              src={artist.avatarUrl || "/default-avatar.png"}
              alt={artist.name}
              className="h-12 w-12 rounded-full border border-white/15 object-cover"
            />
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                Tattoo request
              </p>
              <h2 className="mt-1 text-xl! font-semibold! text-white">
                Tell {artistName} what you have in mind
              </h2>
              {artist.studioName && (
                <p className="mt-1 text-sm text-white/50">
                  {artist.studioName}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
            aria-label="Close request modal"
          >
            <X size={18} />
          </button>
        </div>

        <div
          ref={modalBodyRef}
          className="overflow-y-auto overscroll-contain p-4 request-modal-scrollbar sm:p-5"
        >
          {step === 1 && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f04438]/10 text-[#f04438]">
                    <ImageIcon size={19} />
                  </div>
                  <div>
                    <h3 className="text-lg! font-semibold! text-white">
                      Design details
                    </h3>
                    <p className="text-sm text-white/55">
                      Share the idea, placement, size, and any budget range.
                    </p>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-white/65">
                    Tattoo idea
                  </span>
                  <textarea
                    required
                    className="min-h-36 w-full rounded-md border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#19d69b]"
                    placeholder="Describe the subject, style, mood, and any details that matter."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                <label className="mt-4 block">
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

              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
                    <Upload size={19} />
                  </div>
                  <div>
                    <h3 className="text-lg! font-semibold! text-white">
                      Reference image
                    </h3>
                    <p className="text-sm text-white/55">
                      Optional, but helpful for composition or style direction.
                    </p>
                  </div>
                </div>

                <label className="group relative flex min-h-72 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/20 bg-black/35 p-5 text-center transition hover:border-white/40 hover:bg-white/[0.04]">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setReferenceImage(file);
                    }}
                    className="sr-only"
                  />
                  {referencePreviewUrl ? (
                    <img
                      src={referencePreviewUrl}
                      alt="Reference preview"
                      className="absolute inset-0 h-full w-full object-cover opacity-80"
                    />
                  ) : (
                    <>
                      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                        <Upload size={20} />
                      </span>
                      <span className="text-sm font-semibold text-white">
                        Upload reference
                      </span>
                      <span className="mt-1 text-xs text-white/45">
                        JPG, PNG, or WebP
                      </span>
                    </>
                  )}
                  {referencePreviewUrl && (
                    <span className="absolute bottom-4 left-4 rounded-full border border-white/15 bg-black/70 px-3 py-1 text-xs text-white backdrop-blur">
                      Click to replace image
                    </span>
                  )}
                </label>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={handleNext}
                    className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85"
                  >
                    Continue
                    <CalendarDays size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <form
              onSubmit={handleSubmit}
              className={
                scheduleStep === "preview"
                  ? "mx-auto max-w-4xl"
                  : "grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]"
              }
            >
              {scheduleStep === "preview" ? (
                <RequestPreviewPanel
                  artistName={artistName}
                  referencePreviewUrl={referencePreviewUrl}
                  description={description}
                  bodyPlacement={bodyPlacement}
                  size={size}
                  budget={budget}
                  customBudget={customBudget}
                  preferredDateRange={preferredDateRange}
                  availableTime={availableTime}
                  availableDays={availableDays}
                  isSubmitting={isSubmitting}
                  onBack={() => setScheduleStep(previewReturnStep)}
                />
              ) : (
                <>
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
                      These details help the artist respond with realistic
                      appointment options.
                    </p>
                  </div>
                </div>

                <div className="relative overflow-hidden">
                  <div
                    className={`transition-all duration-300 ease-out ${
                      scheduleStep === "dates"
                        ? "translate-x-0 opacity-100"
                        : "pointer-events-none absolute -translate-x-6 opacity-0"
                    }`}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm! font-semibold text-white">
                          Pick your ideal window
                        </p>
                        <p className="mt-1 text-xs! leading-5 text-white/45">
                          Choose a first day, then a later day to highlight the
                          full range.
                        </p>
                      </div>
                      {preferredDateRange[0] && (
                        <span className="rounded-full border border-white/10 bg-black/30 px-3! py-1.5! text-[11px]! font-semibold text-white/70">
                          {getDateRangeLabel(preferredDateRange)}
                        </span>
                      )}
                    </div>

                    <CalendarRangePicker
                      month={visibleCalendarMonth}
                      selectedRange={preferredDateRange}
                      todayDateInput={todayDateInput}
                      onMonthChange={setVisibleCalendarMonth}
                      onSelectDate={handleSelectCalendarDate}
                    />

                    <div className="mt-4 flex items-center justify-between lg:justify-end">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="modal-action-button inline-flex items-center justify-center rounded-lg! border border-white/10 bg-white/[0.03] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10 lg:hidden"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDateWindow}
                        className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85"
                      >
                        Confirm dates
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`transition-all duration-300 ease-out ${
                      scheduleStep === "time"
                        ? "translate-x-0 opacity-100"
                        : "pointer-events-none absolute translate-x-6 opacity-0"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setTimingConfirmed(false);
                        setScheduleStep("dates");
                      }}
                      className="mb-4 inline-flex items-center gap-2 p-0! text-xs! font-semibold text-white/55 transition hover:text-white"
                    >
                      <ChevronLeft size={14} />
                      Change dates
                    </button>

                    <div className="mb-4 rounded-lg border border-[#19d69b]/25 bg-[#19d69b]/10 p-3">
                      <p className="text-xs! uppercase tracking-[0.16em] text-[#19d69b]">
                        Selected window
                      </p>
                      <p className="mt-1 text-sm! font-semibold text-white">
                        {getDateRangeLabel(preferredDateRange)}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-white/65">
                          From
                        </span>
                        <QuarterHourTimeSelect
                          value={availableTime.from}
                          onChange={(value) => {
                            setTimingConfirmed(false);
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
                            setTimingConfirmed(false);
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

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={handleConfirmTiming}
                        className={`modal-action-button hidden items-center justify-center gap-2 rounded-lg! px-3! py-2! text-xs! font-semibold transition lg:inline-flex ${
                          timingConfirmed
                            ? "bg-[#19d69b] text-black hover:bg-[#34e8ad]"
                            : "bg-white text-black hover:bg-white/85"
                        }`}
                      >
                        {timingConfirmed ? "Timing confirmed" : "Confirm timing"}
                      </button>
                      <button
                        type="button"
                        onClick={handleContinueToAvailableDays}
                        className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85 lg:hidden"
                      >
                        Continue
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`transition-all duration-300 ease-out lg:hidden ${
                      scheduleStep === "days"
                        ? "translate-x-0 opacity-100"
                        : "pointer-events-none absolute translate-x-6 opacity-0"
                    }`}
                  >
                    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-[#19d69b]/25 bg-[#19d69b]/10 p-3">
                        <p className="text-xs! uppercase tracking-[0.16em] text-[#19d69b]">
                          Selected window
                        </p>
                        <p className="mt-1 text-sm! font-semibold text-white">
                          {getDateRangeLabel(preferredDateRange)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                        <p className="text-xs! uppercase tracking-[0.16em] text-white/40">
                          Preferred time
                        </p>
                        <p className="mt-1 text-sm! font-semibold text-white">
                          {getTimeRangeLabel(availableTime)}
                        </p>
                      </div>
                    </div>

                    <h3 className="text-lg! font-semibold! text-white">
                      Days that usually work
                    </h3>
                    <p className="mt-1 text-sm text-white/55">
                      Select any days you are normally available. You can
                      confirm exact times after the artist replies.
                    </p>

                    <AvailableDaysSelector
                      availableDays={availableDays}
                      onToggleDay={toggleAvailableDay}
                    />

                    <div className="mt-6 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setScheduleStep("time")}
                        className="modal-action-button inline-flex items-center justify-center rounded-lg! border border-white/10 bg-white/[0.03] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenPreview("days")}
                        className="modal-action-button inline-flex items-center justify-center gap-1.5 rounded-lg! border border-white/10 bg-white/[0.05] px-2! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
                      >
                        Preview
                        <Eye size={14} />
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || !timingConfirmed}
                        className="modal-action-button inline-flex items-center justify-center gap-1.5 rounded-lg! bg-white px-2! py-2! text-xs! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSubmitting ? "Sending..." : "Send request"}
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden rounded-lg border border-white/10 bg-white/[0.035] p-5 lg:block">
                <div
                  className={`transition duration-300 ${
                    timingConfirmed
                      ? ""
                      : "lg:pointer-events-none lg:select-none lg:opacity-45"
                  }`}
                >
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
                </div>

                <div className="mt-6 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="modal-action-button inline-flex items-center justify-center rounded-lg! border border-white/10 bg-white/[0.03] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenPreview("time")}
                    disabled={!timingConfirmed}
                    className="modal-action-button inline-flex items-center justify-center gap-1.5 rounded-lg! border border-white/10 bg-white/[0.05] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Preview
                    <Eye size={14} />
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !timingConfirmed}
                    className="modal-action-button inline-flex items-center justify-center gap-1.5 rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "Sending..." : "Send request"}
                    <Send size={16} />
                  </button>
                </div>
              </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const RequestPreviewPanel = ({
  artistName,
  referencePreviewUrl,
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
  referencePreviewUrl: string;
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

      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/35 text-white/35">
        {referencePreviewUrl ? (
          <img
            src={referencePreviewUrl}
            alt="Reference preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon size={22} />
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
    formatDateInputValue(month) > formatDateInputValue(getMonthStart(new Date()));

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

const getTimeRangeLabel = ({
  from,
  to,
}: AvailableTime) => {
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

export default RequestTattooModal;
