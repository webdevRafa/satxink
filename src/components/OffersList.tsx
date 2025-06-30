// Inline BookingRequest type pulled from NewArtistDashboard
export type BookingRequest = {
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

export type Offer = {
  clientName: string;
  clientAvatar: string;
  proposedDate: string;
  proposedTime: string;
  price: number;
  status: "pending" | "accepted" | "declined";
};

interface OffersListProps {
  offers: Offer[];
}

const OffersList: React.FC<OffersListProps> = ({ offers }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
      {offers.map((offer, index) => (
        <div key={index} className="bg-zinc-800 p-4 rounded-lg shadow">
          <div className="flex items-center space-x-3 mb-2">
            <img
              src={offer.clientAvatar}
              alt={offer.clientName}
              className="w-10 h-10 rounded-full object-cover"
            />
            <p className="font-medium">{offer.clientName}</p>
          </div>
          <p>
            <strong>Date:</strong> {offer.proposedDate}
          </p>
          <p>
            <strong>Time:</strong> {offer.proposedTime}
          </p>
          <p>
            <strong>Price:</strong> ${offer.price}
          </p>
          <p>
            <strong>Status:</strong> {offer.status}
          </p>
        </div>
      ))}
    </div>
  );
};

export default OffersList;
