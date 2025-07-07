import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { toast } from "react-hot-toast";

interface Props {
  clientId: string;
}

interface Offer {
  id: string;
  artistId: string;
  displayName: string;
  artistAvatar?: string;
  clientId: string;
  requestId: string;
  price: number;
  fallbackPrice?: number;
  message: string;
  status: string;
  dateOptions: string[];
  fullUrl?: string;
  thumbUrl?: string;
  shopName?: string;
  shopAddress?: string;
  shopMapLink?: string;
  depositPolicy: {
    amount: number;
    depositRequired: boolean;
    nonRefundable: boolean;
  };
  paymentType: "internal" | "external";
  externalPaymentDetails?: {
    handle: string;
    method: string;
  };
  finalPaymentTiming: "before" | "after";
}

const ClientOffersList: React.FC<Props> = ({ clientId }) => {
  const [offers, setOffers] = useState<Offer[]>([]);

  const fetchOffers = async () => {
    const q = query(
      collection(db, "offers"),
      where("clientId", "==", clientId)
    );
    const snap = await getDocs(q);
    const data = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Offer[];
    setOffers(data);
  };

  const handleResponse = async (
    offerId: string,
    action: "accepted" | "declined"
  ) => {
    try {
      const offerRef = doc(db, "offers", offerId);
      const offerSnap = await getDoc(offerRef);
      if (!offerSnap.exists()) {
        toast.error("Offer not found.");
        return;
      }

      const offerData = offerSnap.data() as Offer;

      await updateDoc(offerRef, {
        status: action,
        respondedAt: serverTimestamp(),
      });

      if (action === "accepted") {
        const artistRef = doc(db, "users", offerData.artistId);
        const artistSnap = await getDoc(artistRef);
        const artistData = artistSnap.data();
        const shopRef = doc(db, "shops", artistData?.shopId);
        const shopSnap = await getDoc(shopRef);
        const location = shopSnap.exists()
          ? shopSnap.data().address
          : "Unavailable";

        await addDoc(collection(db, "bookings"), {
          artistId: offerData.artistId,
          artistName: offerData.displayName,
          clientId: offerData.clientId,
          price: offerData.price,
          location,
          selectedTime: offerData.dateOptions[0] || "TBD",
          status: "confirmed",
          offerId,
          createdAt: serverTimestamp(),
        });

        toast.success("Booking confirmed!");
      } else {
        toast.success("Offer declined.");
      }

      fetchOffers();
    } catch (err) {
      console.error(err);
      toast.error("Error processing offer.");
    }
  };

  useEffect(() => {
    if (clientId) fetchOffers();
  }, [clientId]);

  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">Offers from Artists</h2>
      {offers.length === 0 ? (
        <p className="text-sm text-gray-400">
          You haven’t received any offers yet.
        </p>
      ) : (
        <div className="max-w-[1800px] grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className="w-full bg-[var(--color-bg-card)] rounded-xl shadow-md p-4 text-left transition hover:ring-2 ring-neutral-500"
            >
              {/* Artist name + Avatar */}
              <div className="flex items-center gap-3 mb-3">
                <img
                  src={offer.artistAvatar}
                  alt={offer.displayName}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <p className="font-medium">{offer.displayName}</p>
              </div>

              {/* Image if available */}
              {offer.thumbUrl && (
                <img
                  src={offer.thumbUrl}
                  alt="Tattoo sample"
                  className="w-full h-32 object-cover rounded-md mb-2"
                />
              )}

              {/* Message as description */}
              {offer.message && (
                <div className="relative overflow-hidden h-[3.5rem] mb-1">
                  <p className="text-sm text-gray-300 line-clamp-2 pr-4">
                    {offer.message}
                  </p>
                  <div className="absolute bottom-0 right-0 h-full w-10 bg-gradient-to-l from-[var(--color-bg-card)] to-transparent pointer-events-none" />
                </div>
              )}

              {/* Info: Price, Status, Location */}
              <p className="text-sm text-emerald-400 mb-1">
                <strong>Price:</strong> ${offer.price}
              </p>
              <p className="text-sm text-gray-400 mb-1">
                <strong>Status:</strong> {offer.status}
              </p>
              <p className="text-sm text-gray-400 mb-3">
                <strong>Location:</strong> {offer.shopAddress}
              </p>

              {/* Action Buttons */}
              {offer.status === "pending" && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleResponse(offer.id, "accepted")}
                    className="bg-[#121212] hover:bg-emerald-600 text-white text-sm border-2 border-neutral-500 hover:border-emerald-400 w-full rounded py-1"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleResponse(offer.id, "declined")}
                    className="bg-[#121212] hover:bg-red-600 text-white text-sm border-2 border-neutral-500 hover:border-red-400 w-full rounded py-1"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default ClientOffersList;
