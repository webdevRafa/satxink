import React from "react";
import { db, storage } from "../firebase/firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

type BookingRequest = {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatar: string;
  description: string;
  preferredDateRange?: string[];
  bodyPlacement: string;
  size: "small" | "medium" | "large" | "Small" | "Medium" | "Large";
  fullUrl: string;
  thumbUrl: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  artist: any;
  uid: string;
  selectedRequest: BookingRequest;
  depositAmount: number;
  setDepositAmount: React.Dispatch<React.SetStateAction<number>>;
  offerPrice: number;
  setOfferPrice: React.Dispatch<React.SetStateAction<number>>;
  fallbackPrice: number | null;
  setFallbackPrice: React.Dispatch<React.SetStateAction<number | null>>;
  offerMessage: string;
  setOfferMessage: React.Dispatch<React.SetStateAction<string>>;
  dateOptions: { date: string; time: string }[];
  setDateOptions: React.Dispatch<
    React.SetStateAction<{ date: string; time: string }[]>
  >;
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
  uid,
  artist,
}: Props) => {
  if (!isOpen || !selectedRequest) return null;
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [offerImage, setOfferImage] = React.useState<File | null>(null);

  const handleOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRequest || !uid) return;

    if (!["internal", "external"].includes(artist.paymentType)) {
      throw new Error("Artist has invalid or missing paymentType.");
    }

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

    let shop = null;
    if (artist.shopId) {
      const shopRef = doc(db, "shops", artist.shopId);
      const shopSnap = await getDoc(shopRef);
      if (shopSnap.exists()) {
        shop = shopSnap.data();
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
      dateOptions,
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
      status: "pending",
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, "offers"), offerData);

    // Reset
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
    onClose();
  };

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center backdrop-blur-sm bg-[#121212]/60 px-4">
      <div className="bg-[#121212] text-white rounded-lg p-6 w-full max-w-xl relative">
        <button onClick={onClose} className="absolute top-2 right-3 text-xl">
          <span>X</span>
        </button>

        <h2 className="text-2xl font-bold mb-4">
          Create Offer for {selectedRequest.clientName}
        </h2>

        <form onSubmit={handleOfferSubmit} data-aos="fade-in">
          <label className="text-sm font-medium mb-1">Price</label>
          <input
            type="number"
            required
            value={offerPrice === 0 ? "" : offerPrice}
            onChange={(e) =>
              setOfferPrice(e.target.value ? Number(e.target.value) : 0)
            }
            className="w-full p-2 mb-4 rounded bg-neutral-800"
          />
          <label className="text-sm font-medium mb-1">
            Fallback Price (optional)
          </label>
          <input
            type="number"
            value={fallbackPrice ?? ""}
            onChange={(e) =>
              setFallbackPrice(e.target.value ? Number(e.target.value) : null)
            }
            className="w-full p-2 mb-4 rounded bg-neutral-800"
          />
          <p className="text-xs text-neutral-400 italic mb-4">
            This is the lowest price you're willing to accept. If the client
            declines your main offer, they’ll be shown this fallback option. By
            setting it, you’re pre-approving to do the tattoo at this rate if
            they accept it.
          </p>

          <textarea
            placeholder="Optional message"
            value={offerMessage}
            onChange={(e) => setOfferMessage(e.target.value)}
            className="w-full p-2 mb-4 rounded bg-neutral-800"
          />
          <p className="text-xs text-neutral-400 mb-2 italic">
            (Optional) Upload a sample image to show the client a reference.
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setOfferImage(file);
              if (file) {
                const reader = new FileReader();
                reader.onloadend = () => setPreviewUrl(reader.result as string);
                reader.readAsDataURL(file);
              } else {
                setPreviewUrl(null);
              }
            }}
            className="mb-4"
          />

          {previewUrl && (
            <div className="mb-4">
              <p className="text-sm mb-1">Sample Image Preview:</p>
              <img
                src={previewUrl}
                alt="Sample"
                className="rounded max-h-48 object-contain"
              />
            </div>
          )}

          <label className="text-sm text-white mb-1 block">
            Available Appointment Options
          </label>

          {dateOptions.map((option, idx) => (
            <div key={idx} className="flex gap-2 mb-2">
              <input
                type="date"
                value={option.date}
                onChange={(e) =>
                  setDateOptions((prev) => {
                    const updated = [...prev];
                    updated[idx].date = e.target.value;
                    return updated;
                  })
                }
                className="w-1/2 p-2 rounded bg-neutral-800"
              />
              <input
                type="time"
                step="900"
                min="00:00"
                max="23:45"
                value={option.time}
                onChange={(e) =>
                  setDateOptions((prev) => {
                    const updated = [...prev];
                    updated[idx].time = e.target.value;
                    return updated;
                  })
                }
                className="w-1/2 p-2 rounded bg-neutral-800"
              />
            </div>
          ))}

          <label className="text-sm font-medium mb-1">Deposit Amount</label>
          <input
            type="number"
            required
            value={depositAmount === 0 ? "" : depositAmount}
            onChange={(e) =>
              setDepositAmount(e.target.value ? Number(e.target.value) : 0)
            }
            className="w-full p-2 mb-4 rounded bg-neutral-800"
          />
          <p className="text-xs text-neutral-400 italic mb-4">
            Clients will be required to pay this non-refundable deposit to
            confirm the appointment.
          </p>

          <button
            type="submit"
            className="w-full py-2 mt-4 text-white rounded border-2 border-neutral-400"
          >
            Send Offer
          </button>
        </form>
      </div>
    </div>
  );
};

export default MakeOfferModal;
