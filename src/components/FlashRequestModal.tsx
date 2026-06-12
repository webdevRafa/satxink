import { type FormEvent, useState } from "react";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import toast from "react-hot-toast";
import { Send, X } from "lucide-react";
import { db } from "../firebase/firebaseConfig";
import type { Flash } from "../types/Flash";
import CustomSelect from "./ui/CustomSelect";
import QuarterHourTimeSelect from "./ui/QuarterHourTimeSelect";
import { bodyPlacementOptions } from "../utils/tattooOptions";
import {
  getTodayDateInputValue,
  hasPastDateInputValue,
  isDateRangeBackwards,
} from "../utils/dateInputGuards";
import {
  getFlashAvailabilityStatus,
  getFlashRepeatability,
  isFlashAvailableForClients,
} from "../utils/flashAvailability";
import {
  formatClientFullName,
  getClientNameParts,
} from "../utils/clientDisplayName";

export type FlashRequestArtist = {
  id: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string;
};

export type FlashRequestClient = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  avatarUrl: string;
};

type FlashRequestModalProps = {
  artist: FlashRequestArtist;
  client: FlashRequestClient | null;
  flash: Flash;
  onClose: () => void;
};

const flashSizeOptions = [
  { value: "Small", label: "Small" },
  { value: "Medium", label: "Medium" },
  { value: "Large", label: "Large" },
];

const FlashRequestModal = ({
  artist,
  client,
  flash,
  onClose,
}: FlashRequestModalProps) => {
  const [description, setDescription] = useState(
    `I would like to request this flash design: ${getFlashTitle(flash)}.`
  );
  const [bodyPlacement, setBodyPlacement] = useState("");
  const [size, setSize] = useState("");
  const [preferredDateRange, setPreferredDateRange] = useState(["", ""]);
  const [availableTime, setAvailableTime] = useState({ from: "", to: "" });
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const todayDateInput = getTodayDateInputValue();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!client) {
      toast.error("Please sign in as a client before requesting this flash.");
      return;
    }

    if (!bodyPlacement || !size) {
      toast.error("Please add placement and size.");
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

    try {
      setIsSubmitting(true);
      const clientNameParts = getClientNameParts(client);
      const clientName = formatClientFullName(
        clientNameParts.firstName,
        clientNameParts.lastName,
        client.name || "Client"
      );

      const flashSnap = await getDoc(doc(db, "flashes", flash.id));
      const latestFlash = flashSnap.exists()
        ? ({ id: flashSnap.id, ...flashSnap.data() } as Flash)
        : flash;

      if (!isFlashAvailableForClients(latestFlash)) {
        toast.error(
          getFlashRepeatability(latestFlash) === "one_of_one"
            ? "This one-of-one flash is no longer available."
            : "This flash is no longer available."
        );
        return;
      }

      await addDoc(collection(db, "bookingRequests"), {
        artistId: artist.id,
        artistName: getArtistName(artist),
        artistAvatar: artist.avatarUrl || "/default-avatar.png",
        clientId: client.id,
        clientFirstName: clientNameParts.firstName,
        clientLastName: clientNameParts.lastName,
        clientName,
        clientAvatar: client.avatarUrl,
        description,
        bodyPlacement,
        size,
        preferredDateRange,
        availableTime,
        availableDays,
        status: "pending",
        createdAt: serverTimestamp(),

        fullUrl:
          latestFlash.fullUrl || latestFlash.webp90Url || latestFlash.thumbUrl,
        thumbUrl:
          latestFlash.thumbUrl || latestFlash.webp90Url || latestFlash.fullUrl,
        sourceType: "flash",
        flashId: latestFlash.id,
        flashTitle: getFlashTitle(latestFlash),
        flashDescription: latestFlash.description || null,
        flashPrice: latestFlash.price ?? null,
        flashSheetId: latestFlash.sheetId || null,
        flashRepeatability: getFlashRepeatability(latestFlash),
        flashAvailabilityStatus: getFlashAvailabilityStatus(latestFlash),
        isFromSheet: latestFlash.isFromSheet,
      });

      toast.success("Flash request sent!");
      onClose();
    } catch (err) {
      console.error("Failed to submit flash request:", err);
      toast.error("Something went wrong while sending your request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
      <div className="request-modal-scrollbar max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#121212] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/40">
              Flash request
            </p>
            <h2 className="mt-1 text-xl! font-semibold! text-white">
              {getFlashTitle(flash)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 p-0! text-white transition hover:bg-white/20"
            aria-label="Close flash request"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-6 p-5 md:grid-cols-[0.9fr_1.1fr]"
        >
          <div>
            <img
              src={getFlashPreviewUrl(flash)}
              alt={getFlashTitle(flash)}
              className="max-h-[420px] w-full rounded-xl border border-white/10 bg-black object-contain"
            />
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-3">
                <img
                  src={artist.avatarUrl || "/default-avatar.png"}
                  alt={getArtistName(artist)}
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div>
                  <p className="text-sm font-semibold text-white">
                    {getArtistName(artist)}
                  </p>
                  {typeof flash.price === "number" && (
                    <p className="text-sm text-white/55">
                      Listed at ${flash.price}
                    </p>
                  )}
                </div>
              </div>
              {flash.description && (
                <p className="mt-4 rounded-lg border border-white/10 bg-black/25 p-3 text-sm leading-6 text-white/70">
                  {flash.description}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {!client && (
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                Sign in as a client to send this request.
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-sm text-white/70">Message</span>
              <textarea
                required
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-white/35"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">
                  Body placement
                </span>
                <CustomSelect
                  value={bodyPlacement}
                  onChange={setBodyPlacement}
                  options={bodyPlacementOptions}
                  placeholder="Forearm, thigh, shoulder..."
                  buttonClassName="rounded-xl"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-white/70">Size</span>
                <CustomSelect
                  value={size}
                  onChange={setSize}
                  options={flashSizeOptions}
                  placeholder="Select size"
                  buttonClassName="rounded-xl"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">
                  Earliest date
                </span>
                <input
                  type="date"
                  min={todayDateInput}
                  value={preferredDateRange[0]}
                  onChange={(event) =>
                    setPreferredDateRange([
                      event.target.value,
                      preferredDateRange[1],
                    ])
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-white/35"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">
                  Latest date
                </span>
                <input
                  type="date"
                  min={preferredDateRange[0] || todayDateInput}
                  value={preferredDateRange[1]}
                  onChange={(event) =>
                    setPreferredDateRange([
                      preferredDateRange[0],
                      event.target.value,
                    ])
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition focus:border-white/35"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">From</span>
                <QuarterHourTimeSelect
                  value={availableTime.from}
                  onChange={(value) =>
                    setAvailableTime((prev) => ({
                      ...prev,
                      from: value,
                    }))
                  }
                  placeholder="Select time"
                  buttonClassName="rounded-xl"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-white/70">To</span>
                <QuarterHourTimeSelect
                  value={availableTime.to}
                  onChange={(value) =>
                    setAvailableTime((prev) => ({
                      ...prev,
                      to: value,
                    }))
                  }
                  placeholder="Select time"
                  buttonClassName="rounded-xl"
                />
              </label>
            </div>

            <div>
              <span className="mb-2 block text-sm text-white/70">
                Available days
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ].map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={`rounded-full border px-3! py-1! text-sm! transition ${
                      availableDays.includes(day)
                        ? "border-white/40 bg-white text-black"
                        : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10"
                    }`}
                    onClick={() =>
                      setAvailableDays((prev) =>
                        prev.includes(day)
                          ? prev.filter((item) => item !== day)
                          : [...prev, day]
                      )
                    }
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !client}
              className="modal-action-button inline-flex w-full items-center justify-center gap-2 rounded-lg! bg-[#b6382d] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-[#cf4639] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Send flash request"}
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const getFlashTitle = (flash: Flash) =>
  flash.title || flash.caption || "Untitled flash";

const getFlashPreviewUrl = (flash: Flash) =>
  flash.fullUrl || flash.webp90Url || flash.thumbUrl || "";

const getArtistName = (artist: FlashRequestArtist) =>
  artist.displayName || artist.name || "SATX Ink artist";

export default FlashRequestModal;
