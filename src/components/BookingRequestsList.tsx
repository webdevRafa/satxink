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

interface Props {
  bookingRequests: BookingRequest[];
  onMakeOffer: (request: BookingRequest) => void;
}

const BookingRequestsList: React.FC<Props> = ({
  bookingRequests,
  onMakeOffer,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {bookingRequests.map((request) => (
        <div
          key={request.id}
          className="bg-zinc-800 p-4 rounded-lg shadow relative"
        >
          <div className="flex items-center gap-3 mb-2">
            <img
              src={request.clientAvatar}
              alt={request.clientName}
              className="w-10 h-10 rounded-full object-cover"
            />
            <p className="font-medium">{request.clientName}</p>
          </div>

          <img
            src={request.thumbUrl}
            alt="Tattoo idea"
            className="w-full h-40 object-cover rounded mb-3"
          />

          <p className="text-sm mb-1">
            <strong>Body Placement:</strong> {request.bodyPlacement}
          </p>
          <p className="text-sm mb-1">
            <strong>Size:</strong> {request.size}
          </p>
          <p className="text-sm mb-2">
            <strong>Description:</strong> {request.description}
          </p>

          {Array.isArray(request.preferredDateRange) &&
            request.preferredDateRange.length > 0 && (
              <p className="text-xs text-gray-400 mb-2">
                <strong>Preferred Dates:</strong>{" "}
                {request.preferredDateRange.join(", ")}
              </p>
            )}

          <button
            onClick={() => onMakeOffer(request)}
            className="absolute bottom-4 right-4 bg-lime-500 hover:bg-lime-600 text-black text-sm px-3 py-1 rounded"
          >
            Make Offer
          </button>
        </div>
      ))}
    </div>
  );
};

export default BookingRequestsList;
