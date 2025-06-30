import React from "react";

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
  selectedRequest: BookingRequest;
  offerPrice: number;
  setOfferPrice: (val: number) => void;
  offerMessage: string;
  setOfferMessage: (val: string) => void;
  offerImage: File | null;
  setOfferImage: (file: File | null) => void;
  dateOptions: { date: string; time: string }[];
  setDateOptions: (
    updater: (
      prev: { date: string; time: string }[]
    ) => { date: string; time: string }[]
  ) => void;
  onSubmit: (e: React.FormEvent) => void;
};

const MakeOfferModal = ({
  isOpen,
  onClose,
  selectedRequest,
  offerPrice,
  setOfferPrice,
  offerMessage,
  setOfferMessage,
  offerImage,
  setOfferImage,
  dateOptions,
  setDateOptions,
  onSubmit,
}: Props) => {
  if (!isOpen || !selectedRequest) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-[#121212]/60 px-4">
      <div className="bg-[#121212] text-white rounded-lg p-6 w-full max-w-xl relative">
        <button onClick={onClose} className="absolute top-2 right-3 text-xl">
          <span>X</span>
        </button>

        <h2 className="text-2xl font-bold mb-4">
          Create Offer for {selectedRequest.clientName}
        </h2>

        <form onSubmit={onSubmit} data-aos="fade-in">
          <label className="text-sm font-medium mb-1">Price</label>
          <input
            type="number"
            required
            value={offerPrice}
            onChange={(e) => setOfferPrice(Number(e.target.value))}
            className="w-full p-2 mb-4 rounded bg-neutral-800"
          />

          <textarea
            placeholder="Optional message"
            value={offerMessage}
            onChange={(e) => setOfferMessage(e.target.value)}
            className="w-full p-2 mb-4 rounded bg-neutral-800"
          />

          <input
            type="file"
            accept="image/*"
            onChange={(e) => setOfferImage(e.target.files?.[0] || null)}
            className="mb-4"
          />

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
