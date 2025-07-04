import { useState } from "react";
import { X } from "lucide-react";
import { db, storage } from "../firebase/firebaseConfig";
import {
  addDoc,
  collection,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import toast from "react-hot-toast";

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
  };
}

const RequestTattooModal: React.FC<Props> = ({
  isOpen,
  onClose,
  client,
  artist,
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
  const [customBudget, setCustomBudget] = useState(""); // Manual input
  const reset = () => {
    setStep(1);
    setDescription("");
    setBodyPlacement("");
    setSize("");
    setPreferredDateRange(["", ""]);
    setAvailableTime({ from: "", to: "" });
    setAvailableDays([]);
    setReferenceImage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Determine final budget (either a selected range string or a custom number)
    let finalBudget: string | number | null = null;

    if (budget === "custom") {
      const parsed = Number(customBudget);
      finalBudget =
        !isNaN(parsed) && parsed > 0 && parsed <= 5000 ? parsed : null;
      // ✅ Guard clause for bad input
      if (finalBudget === null) {
        toast.error("Please enter a valid custom budget under $5,000.");
        return; // Stop form submission
      }
    } else {
      finalBudget = budget || null;
    }

    try {
      const reqRef = await addDoc(collection(db, "bookingRequests"), {
        artistId: artist.id,
        clientId: client.id,
        clientName: client.name,
        clientAvatar: client.avatarUrl,
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

      // 🟢 Immediately toast and close modal
      toast.success("Request sent!");
      reset();
      onClose();

      // 🟡 THEN process optional image upload in the background
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
          ref: any,
          maxRetries = 10,
          delay = 500
        ): Promise<string> => {
          return new Promise((resolve, reject) => {
            const attempt = (retries: number) => {
              getDownloadURL(ref)
                .then(resolve)
                .catch((err) => {
                  if (retries >= maxRetries) return reject(err);
                  setTimeout(() => attempt(retries + 1), delay);
                });
            };
            attempt(0);
          });
        };

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
          // optional: toast.error("Image processing failed")
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-[#121212]/60 transition-opacity duration-300 px-4">
      <div className="w-full max-w-[800px] max-h-[90vh] overflow-y-auto bg-[#121212]/80 text-white rounded-lg p-6 shadow-lg relative">
        <button
          onClick={() => {
            onClose();
            reset();
          }}
          className="absolute top-0 right-0 text-white text-xl"
        >
          <X />
        </button>

        <h2 className="text-2xl font-bold mb-6">
          {step === 1 ? (
            <>
              Tell <span className="text-white">{artist.name}</span> what you
              need
            </>
          ) : (
            "What’s your availability?"
          )}
        </h2>

        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <textarea
                required
                className="w-full p-2 rounded bg-neutral-800 text-white mb-4"
                placeholder="Describe your tattoo..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <input
                type="text"
                placeholder="Body Placement"
                className="w-full p-2 rounded bg-neutral-800 text-white mb-4"
                value={bodyPlacement}
                onChange={(e) => setBodyPlacement(e.target.value)}
              />
              <label className="text-sm text-white mb-1 block">Size</label>
              <select
                required
                className="w-full p-2 rounded bg-neutral-800 text-white mb-4"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              >
                <option value="">Select size</option>
                <option value="Small">Small (up to 3x3 inches)</option>
                <option value="Medium">Medium (up to 6x6 inches)</option>
                <option value="Large">Large (over 6x6 inches)</option>
              </select>
              <label className="text-sm mb-1">Optional Budget</label>
              <select
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full p-2 mb-2 rounded bg-[var(--color-bg-card)] text-white border border-neutral-700"
              >
                <option value="">Have a budget?</option>
                <option value="0-100">$0–$100</option>
                <option value="100-200">$100–$200</option>
                <option value="200-350">$200–$350</option>
                <option value="350-500">$350–$500</option>
                <option value="500-750">$500-$750</option>
                <option value="750-1000">$750-$1000</option>
                <option value="1000+">$1000+</option>
                <option value="custom">Other (enter manually)</option>
              </select>

              {budget === "custom" && (
                <input
                  type="number"
                  placeholder="Enter your budget (USD)"
                  value={customBudget}
                  onChange={(e) => setCustomBudget(e.target.value)}
                  className="w-full p-2 mb-4 rounded bg-[var(--color-bg-card)] text-white border border-neutral-700"
                  min={0}
                  step={5}
                />
              )}
            </div>

            <div className="flex flex-col justify-between">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Reference Image (optional)
                </label>
                <div className="relative mb-4">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setReferenceImage(file);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div className="px-6 py-2 text-white border-2 border-neutral-500 hover:bg-neutral-300 rounded max-w-[200px]">
                    Upload reference
                  </div>
                </div>

                {referenceImage && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-300 mb-1">Preview:</p>
                    <img
                      src={URL.createObjectURL(referenceImage)}
                      alt="Preview"
                      className="w-32 h-32 object-cover rounded border border-neutral-600 mb-5"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-auto">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-2 text-white border-2 border-neutral-500 hover:bg-neutral-300 hover:text-[#121212] hover:border-white rounded transition"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <div>
              <label className="text-sm text-white mb-1 block">
                Date Range
              </label>
              <div className="flex gap-2 mb-4">
                <input
                  type="date"
                  className="w-full p-2 rounded bg-neutral-800 text-white"
                  value={preferredDateRange[0]}
                  onChange={(e) =>
                    setPreferredDateRange([
                      e.target.value,
                      preferredDateRange[1],
                    ])
                  }
                />
                <input
                  type="date"
                  className="w-full p-2 rounded bg-neutral-800 text-white"
                  value={preferredDateRange[1]}
                  onChange={(e) =>
                    setPreferredDateRange([
                      preferredDateRange[0],
                      e.target.value,
                    ])
                  }
                />
              </div>

              <label className="text-sm text-white mb-2 block">
                Time Range
              </label>
              <div className="flex gap-2 mb-4">
                <input
                  type="time"
                  className="w-full p-2 rounded bg-neutral-800 text-white"
                  value={availableTime.from}
                  onChange={(e) =>
                    setAvailableTime((prev) => ({
                      ...prev,
                      from: e.target.value,
                    }))
                  }
                />
                <input
                  type="time"
                  className="w-full p-2 rounded bg-neutral-800 text-white"
                  value={availableTime.to}
                  onChange={(e) =>
                    setAvailableTime((prev) => ({
                      ...prev,
                      to: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-white mb-2 block">
                Available Days
              </label>
              <div className="flex flex-wrap gap-2 mb-6">
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
                    className={`px-3 py-1 rounded-full text-sm ${
                      availableDays.includes(day)
                        ? "bg-neutral-300 text-[#121212]"
                        : "bg-neutral-700 text-white"
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

              <div className="flex justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full py-2 border border-white rounded"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="w-full py-2 bg-[#b6382d] text-white rounded"
                >
                  Submit
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default RequestTattooModal;
