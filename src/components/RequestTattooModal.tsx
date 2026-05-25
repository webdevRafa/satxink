import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  DollarSign,
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
import QuarterHourTimeSelect from "./ui/QuarterHourTimeSelect";

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
  const [availableTime, setAvailableTime] = useState({ from: "", to: "" });
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [budget, setBudget] = useState("");
  const [customBudget, setCustomBudget] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const referencePreviewUrl = useMemo(
    () => (referenceImage ? URL.createObjectURL(referenceImage) : ""),
    [referenceImage]
  );
  const clientName = client.name || "Client";
  const clientAvatar = client.avatarUrl || "/default-avatar.png";
  const artistName = artist.name || "Artist";

  useEffect(() => {
    return () => {
      if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
    };
  }, [referencePreviewUrl]);

  const reset = () => {
    setStep(1);
    setDescription("");
    setBodyPlacement("");
    setSize("");
    setPreferredDateRange(["", ""]);
    setAvailableTime({ from: "", to: "" });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 text-white backdrop-blur-md">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <img
              src={artist.avatarUrl || "/default-avatar.png"}
              alt={artist.name}
              className="h-14 w-14 rounded-full border border-white/15 object-cover"
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
            aria-label="Close request modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid border-b border-white/10 bg-black/20 px-5 py-3 text-sm text-white/55 sm:grid-cols-2 sm:px-6">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                step === 1 ? "bg-[#19d69b]" : "bg-white/30"
              }`}
            />
            Details
          </div>
          <div className="mt-2 flex items-center gap-2 sm:mt-0">
            <span
              className={`h-2 w-2 rounded-full ${
                step === 2 ? "bg-[#19d69b]" : "bg-white/30"
              }`}
            />
            Schedule
          </div>
        </div>

        <div className="overflow-y-auto p-5 request-modal-scrollbar sm:p-6">
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
                    <input
                      required
                      type="text"
                      placeholder="Forearm, thigh, shoulder..."
                      className="w-full rounded-md border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#19d69b]"
                      value={bodyPlacement}
                      onChange={(e) => setBodyPlacement(e.target.value)}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-white/65">
                      <Ruler size={15} />
                      Size
                    </span>
                    <select
                      required
                      className="w-full rounded-md border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-[#19d69b]"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                    >
                      <option value="">Select size</option>
                      <option value="Small">Small (up to 3x3 inches)</option>
                      <option value="Medium">Medium (up to 6x6 inches)</option>
                      <option value="Large">Large (over 6x6 inches)</option>
                    </select>
                  </label>
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-white/65">
                    <DollarSign size={15} />
                    Optional budget
                  </span>
                  <select
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-[#19d69b]"
                  >
                    <option value="">Have a budget?</option>
                    <option value="0-100">$0-$100</option>
                    <option value="100-200">$100-$200</option>
                    <option value="200-350">$200-$350</option>
                    <option value="350-500">$350-$500</option>
                    <option value="500-750">$500-$750</option>
                    <option value="750-1000">$750-$1000</option>
                    <option value="1000+">$1000+</option>
                    <option value="custom">Other (enter manually)</option>
                  </select>
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
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85"
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
              className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]"
            >
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-white/65">
                      Earliest date
                    </span>
                    <input
                      type="date"
                      className="w-full rounded-md border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-[#19d69b]"
                      value={preferredDateRange[0]}
                      onChange={(e) =>
                        setPreferredDateRange([
                          e.target.value,
                          preferredDateRange[1],
                        ])
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-white/65">
                      Latest date
                    </span>
                    <input
                      type="date"
                      className="w-full rounded-md border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-[#19d69b]"
                      value={preferredDateRange[1]}
                      onChange={(e) =>
                        setPreferredDateRange([
                          preferredDateRange[0],
                          e.target.value,
                        ])
                      }
                    />
                  </label>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-white/65">
                      From
                    </span>
                    <QuarterHourTimeSelect
                      value={availableTime.from}
                      onChange={(value) =>
                        setAvailableTime((prev) => ({
                          ...prev,
                          from: value,
                        }))
                      }
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
                      onChange={(value) =>
                        setAvailableTime((prev) => ({
                          ...prev,
                          to: value,
                        }))
                      }
                      placeholder="Select time"
                      buttonClassName="focus:border-[#19d69b]"
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
                      onClick={() =>
                        setAvailableDays((prev) =>
                          prev.includes(day)
                            ? prev.filter((d) => d !== day)
                            : [...prev, day]
                        )
                      }
                    >
                      {day}
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-5! py-3! text-sm! font-semibold text-white transition hover:bg-white/10"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "Sending..." : "Send request"}
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestTattooModal;
