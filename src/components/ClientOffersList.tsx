import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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
import ViewOfferModal from "./ViewOfferModal";
import type { Offer } from "../types/Offer";
interface Props {
  clientId: string;
}

const ClientOffersList: React.FC<Props> = ({ clientId }) => {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<Offer[]>([]);

  const [selectedOffer, setSelectedOffer] = useState<
    (Offer & { bookingId?: string }) | null
  >(null);

  const [isModalOpen, setIsModalOpen] = useState(false);

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
    action: "accepted" | "declined",
    selectedDate?: { date: string; time: string }
  ) => {
    try {
      const offerRef = doc(db, "offers", offerId);
      const offerSnap = await getDoc(offerRef);
      if (!offerSnap.exists()) {
        toast.error("Offer not found.");
        return;
      }

      const offerData = offerSnap.data() as Offer;

      // Step 1: Update the offer with response
      await updateDoc(offerRef, {
        status: action,
        respondedAt: serverTimestamp(),
      });

      if (action === "accepted") {
        // Step 2: Optional studio info
        const artistRef = doc(db, "users", offerData.artistId);
        const artistSnap = await getDoc(artistRef);
        const artistData = artistSnap.data();
        const shopRef = doc(db, "shops", artistData?.shopId);
        const shopSnap = await getDoc(shopRef);

        const shopData = shopSnap.exists() ? shopSnap.data() : {};

        // Step 3: Create the booking
        const bookingRef = await addDoc(collection(db, "bookings"), {
          artistId: offerData.artistId,
          artistName: offerData.displayName,
          artistAvatar: offerData.artistAvatar ?? null,

          clientId: offerData.clientId,
          offerId,

          price: offerData.price,
          depositAmount: offerData.depositPolicy.amount,

          paymentType: offerData.paymentType,
          externalPaymentDetails:
            offerData.paymentType === "external"
              ? offerData.externalPaymentDetails ?? null
              : null,

          finalPaymentTiming: offerData.finalPaymentTiming ?? "after",

          shopId: offerData.shopId ?? null,
          shopName: offerData.shopName ?? shopData.name ?? "Unavailable",
          shopAddress:
            offerData.shopAddress ?? shopData.address ?? "Unavailable",
          shopMapLink: offerData.shopMapLink ?? shopData.mapLink ?? null,

          selectedDate: selectedDate ?? { date: "TBD", time: "TBD" },
          sampleImageUrl: offerData.fullUrl ?? null,

          status: "pending_payment",
          createdAt: serverTimestamp(),
        });

        toast.success("Booking confirmed!");
        navigate(`/payment/${bookingRef.id}`);
        return bookingRef.id;
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
              onClick={() => {
                setSelectedOffer(offer);
                setIsModalOpen(true);
              }}
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
                  src={offer.fullUrl}
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
            </div>
          ))}
        </div>
      )}
      <ViewOfferModal
        offer={selectedOffer}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRespond={async (offerId, action, selectedDate) => {
          const bookingId = await handleResponse(offerId, action, selectedDate);

          if (bookingId) {
            // Inject bookingId into selectedOffer before checkout
            setSelectedOffer((prev) => (prev ? { ...prev, bookingId } : prev));
          }
        }}
      />
    </section>
  );
};

export default ClientOffersList;
