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
  artistName: string;
  clientId: string;
  price: number;
  location: string;
  message: string;
  status: string;
  dateOptions: string[];
  requestId: string;
}

const ClientOffersList: React.FC<Props> = ({ clientId }) => {
  const [offers, setOffers] = useState<Offer[]>([]);

  const fetchOffers = async () => {
    const q = query(
      collection(db, "bookingOffers"),
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
      const offerRef = doc(db, "bookingOffers", offerId);
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
          artistName: offerData.artistName,
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className="bg-[var(--color-bg-card)] border border-neutral-700 rounded-lg p-4"
            >
              <p className="font-medium text-sm mb-1">
                From: {offer.artistName}
              </p>
              <p className="text-sm text-gray-300">
                ${offer.price} – {offer.location}
              </p>
              <p className="text-sm italic text-gray-400 mt-2">
                “{offer.message}”
              </p>
              <p className="mt-2 text-xs text-yellow-400">
                Status: {offer.status}
              </p>

              {offer.status === "pending" && (
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => handleResponse(offer.id, "accepted")}
                    className="px-4 py-1 rounded bg-[#121212] hover:bg-neutral-500 text-white text-sm"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleResponse(offer.id, "declined")}
                    className="px-4 py-1 rounded bg-[#121212] hover:bg-neutral-500 text-white text-sm"
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
