// OffersList.tsx
import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { format } from "date-fns";
import type { Offer } from "../types/Offer";

// Utility function (place right here — after imports, before component)
export const formatReadableDate = (dateStr: string) => {
  try {
    return format(new Date(dateStr), "MMMM d, yyyy @ h:mm a");
  } catch {
    return dateStr;
  }
};

const OffersList = ({ uid }: { uid: string }) => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;

    const fetchOffers = async () => {
      try {
        const q = query(
          collection(db, "offers"),
          where("artistId", "==", uid),
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Offer[];

        setOffers(data);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching offers:", error);
      }
    };

    fetchOffers();
  }, [uid]);

  if (loading) {
    return <p className="text-gray-400 text-sm">Loading offers...</p>;
  }

  if (offers.length === 0) {
    return (
      <p className="text-gray-400 text-sm">You haven't sent any offers yet.</p>
    );
  }

  return (
    <div className="max-w-[1800px] grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
      {offers.map((offer) => (
        <div
          key={offer.id}
          className="w-full bg-[var(--color-bg-card)] rounded-xl shadow-md p-4 text-left transition hover:ring-2 ring-neutral-500"
        >
          <div className="flex items-center gap-3 mb-3">
            <img
              src={offer.clientAvatar || "/default-avatar.png"}
              alt={offer.clientName || "Client"}
              className="w-10 h-10 rounded-full object-cover"
            />
            <p className="font-medium">{offer.clientName || "You"}</p>
          </div>

          {offer.thumbUrl && (
            <img
              src={offer.thumbUrl}
              alt="Tattoo offer"
              className="w-full h-32 object-cover rounded-md mb-2"
            />
          )}
          <p className="text-xs text-emerald-400 mb-1">
            <strong>Price:</strong> ${offer.price}
          </p>
          {offer.dateOptions?.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-400 mb-1">
                <strong>Proposed Times:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1">
                {offer.dateOptions.map((opt, idx) => (
                  <li key={idx} className="text-[11px] text-gray-300">
                    {formatReadableDate(`${opt.date} ${opt.time}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {offer.status && (
            <p className="text-xs text-gray-400 mb-1">
              <strong>Status:</strong>{" "}
              <span className="capitalize">{offer.status}</span>
            </p>
          )}

          {offer.shopName && (
            <p className="text-xs text-gray-400 mb-1">
              <strong>Shop:</strong> {offer.shopName}
            </p>
          )}

          <p className="text-xs text-gray-400 mt-2">Tap to view details</p>
        </div>
      ))}
    </div>
  );
};

export default OffersList;
