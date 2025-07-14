import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import type { Offer } from "../types/Offer";
import { format, parse } from "date-fns";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/firebaseConfig";
import { getAuth } from "firebase/auth";

type Props = {
  offer: (Offer & { bookingId?: string }) | null;
  onClose: () => void;
  isOpen: boolean;
  onRespond: (
    offerId: string,
    action: "accepted" | "declined",
    selectedDate?: { date: string; time: string }
  ) => Promise<string | void>;
};

const ViewOfferModal = ({ offer, onClose, isOpen, onRespond }: Props) => {
  const [selectedDateOption, setSelectedDateOption] = useState<number | null>(
    null
  );

  if (!isOpen || !offer) return null;

  const handleCheckout = async (
    chosenDate: { date: string; time: string },
    bookingId?: string
  ) => {
    if (!offer) return;
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      alert("You must be logged in to proceed with checkout.");
      return;
    }

    try {
      const createSession = httpsCallable(functions, "createCheckoutSession");

      const response = await createSession({
        offerId: offer.id,
        bookingId,
        clientId: offer.clientId,
        artistId: offer.artistId,
        price: offer.price,
        displayName: offer.displayName,
        artistAvatar: offer.artistAvatar ?? "",
        shopName: offer.shopName ?? "",
        shopAddress: offer.shopAddress ?? "",
        selectedDate: chosenDate,
      });

      const { sessionUrl } = response.data as { sessionUrl: string };
      window.location.href = sessionUrl;
    } catch (error) {
      console.error("Stripe checkout error:", error);
      alert("Failed to start checkout. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/60 px-4">
      <div className="bg-[#121212] text-white rounded-lg p-6 w-full max-w-2xl relative">
        <button onClick={onClose} className="absolute top-2 right-3 text-xl">
          ✕
        </button>

        <h2 className="text-2xl font-bold mb-2">{offer.displayName}'s Offer</h2>

        <Zoom>
          <img
            src={offer.fullUrl}
            alt="Offer Image"
            className="rounded mb-4 max-h-96 object-contain"
          />
        </Zoom>

        <p className="text-sm text-neutral-300 mb-2 italic">{offer.message}</p>

        <div className="mb-2">
          <strong>Price:</strong> ${offer.price}
        </div>
        {offer.fallbackPrice && (
          <div className="mb-2">
            <strong>Fallback Price:</strong> ${offer.fallbackPrice}
          </div>
        )}
        {offer.shopName && (
          <div className="mb-2">
            <strong>Studio:</strong> {offer.shopName} ({offer.shopAddress})
          </div>
        )}

        <div className="mb-4">
          <strong>Date Options:</strong>
          <ul className="list-disc ml-5 text-sm mt-1">
            {offer.dateOptions.map((opt, idx) => {
              const parsed = parse(
                `${opt.date} ${opt.time}`,
                "yyyy-MM-dd HH:mm",
                new Date()
              );
              const formatted = format(parsed, "EEE, MMMM d 'at' h:mmaaa"); // e.g., July 9, 2025 at 3:00PM

              return (
                <li key={idx}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="selectedDate"
                      value={idx}
                      checked={selectedDateOption === idx}
                      onChange={() => setSelectedDateOption(idx)}
                      className="accent-emerald-500"
                    />
                    <span className="text-sm">{formatted}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="text-sm text-neutral-400 italic">
          Status: {offer.status}
        </div>
        {offer.status === "pending" && (
          <div className="mt-4 flex gap-3">
            <button
              onClick={async () => {
                if (selectedDateOption === null) {
                  toast.error("Please select a date before accepting.");
                  return;
                }

                const chosenDate = offer.dateOptions[selectedDateOption];
                console.log("Selected appointment:", chosenDate);

                try {
                  const bookingId = await onRespond(
                    offer.id,
                    "accepted",
                    chosenDate
                  );

                  if (bookingId) {
                    onClose(); // ✅ close the modal
                    await handleCheckout(chosenDate, bookingId); // ✅ only call once with bookingId
                  }
                } catch (error) {
                  console.error(
                    "Error during offer acceptance or checkout:",
                    error
                  );
                  toast.error("Something went wrong.");
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded"
            >
              Accept
            </button>

            <button
              onClick={() => {
                onRespond(offer.id, "declined");
                onClose();
              }}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
            >
              Decline
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewOfferModal;
