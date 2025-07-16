import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import type { Offer } from "../types/Offer";
import { format, parse } from "date-fns";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/firebaseConfig";
import { getAuth } from "firebase/auth";
import satx from "../assets/images/satx-inked.webp";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/60 px-4 bg-img[${satx}]">
      <div className="bg-[#121212] text-white rounded-lg w-full max-w-2xl relative z-40 pb-5">
        <div
          className="absolute inset-0 opacity-10  bg-cover bg-center z-30 pointer-events-none"
          style={{ backgroundImage: `url(${satx})` }}
        ></div>
        <img
          className="w-15 rounded-full absolute bottom-0 right-0 animate-pulse translate-y-[50%]"
          src={offer.artistAvatar}
          alt=""
        />
        <div className="relative z-40 p-4">
          <button
            onClick={onClose}
            className="absolute top-2 right-3 text-xl hover:text-rose-400"
          >
            ✕
          </button>

          <h2 className="text-2xl! font-bold mb-2">
            {offer.displayName}'s offer
          </h2>

          <Zoom>
            {offer.fullUrl && (
              <img
                src={offer.fullUrl}
                alt="Offer Image"
                className="w-full h-auto rounded-md mb-4"
              />
            )}
          </Zoom>

          <p className="text-sm! text-neutral-300! mb-2 italic">
            {offer.message}
          </p>

          <div className="mb-2">
            <strong>Price:</strong> ${offer.price}
          </div>

          {offer.shopName && (
            <div className="mb-2">
              <strong>Studio:</strong> {offer.shopName}
            </div>
          )}
          {offer.shopAddress && (
            <div className="mb-2">
              <a
                href={offer.shopMapLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <strong>Address:</strong> {offer.shopAddress}
              </a>
            </div>
          )}
          <div className="mb-15">
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
                className="bg-[var(--color-bg-footer)] hover:text-emerald-400 px-4 py-2 rounded"
              >
                Accept
              </button>

              <button
                onClick={() => {
                  onRespond(offer.id, "declined");
                  onClose();
                }}
                className="bg-[var(--color-bg-footer)] hover:text-rose-400 px-4 py-2 rounded"
              >
                Decline
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewOfferModal;
