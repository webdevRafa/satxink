// src/pages/ClientDashboard.tsx
import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import Spinner from "../components/ui/Spinner";

type Client = {
  name: string;
  email: string;
  avatarUrl: string;
  likedArtists: string[];
  preferredStyles: string[];
};
type BookingOffer = {
  id: string;
  artistName: string;
  artistId: string;
  requestId: string;
  price: number;
  dateOptions: string[];
  location: string;
  message: string;
  status: "sent" | "accepted" | "declined";
};

const ClientDashboard = () => {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<BookingOffer[]>([]);
  const [selectedDateOptions, setSelectedDateOptions] = useState<{
    [offerId: string]: string;
  }>({});
  const handleAcceptOffer = async (offerId: string) => {
    try {
      const offerRef = doc(db, "bookingOffers", offerId);
      await updateDoc(offerRef, {
        status: "accepted",
      });
      alert("Offer accepted!");
      // refresh UI
      setOffers((prev) =>
        prev.map((o) => (o.id === offerId ? { ...o, status: "accepted" } : o))
      );
    } catch (error) {
      console.error("Error accepting offer:", error);
    }
  };

  const handleDeclineOffer = async (offerId: string) => {
    try {
      const offerRef = doc(db, "bookingOffers", offerId);
      await updateDoc(offerRef, {
        status: "declined",
      });
      alert("Offer declined.");
      // refresh UI
      setOffers((prev) =>
        prev.map((o) => (o.id === offerId ? { ...o, status: "declined" } : o))
      );
    } catch (error) {
      console.error("Error declining offer:", error);
    }
  };
  useEffect(() => {
    const fetchClient = async () => {
      try {
        const clientRef = doc(db, "users", "VRUNIfCcE9n0ix3JY1GA");
        const clientSnap = await getDoc(clientRef);

        if (clientSnap.exists()) {
          setClient(clientSnap.data() as Client);
        } else {
          console.error("Client not found.");
        }
      } catch (error) {
        console.error("Error fetching client:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchClient();

    const fetchOffers = async () => {
      try {
        const q = query(
          collection(db, "bookingOffers"),
          where("clientId", "==", "VRUNIfCcE9n0ix3JY1GA")
        );
        const querySnapshot = await getDocs(q);
        const result: BookingOffer[] = [];
        querySnapshot.forEach((doc) => {
          result.push({ id: doc.id, ...doc.data() } as BookingOffer);
        });
        setOffers(result);
      } catch (error) {
        console.error("Error fetching booking offers:", error);
      }
    };

    fetchOffers();
  }, []);

  if (loading)
    return (
      <div className="flex justify-center mt-10">
        <Spinner />
      </div>
    );

  if (!client)
    return (
      <div className="text-center mt-10 text-red-500">Client not found.</div>
    );

  return (
    <>
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Welcome, {client.name}</h1>

        <div className="flex items-start gap-6">
          <img
            src={client.avatarUrl}
            alt={client.name}
            className="w-32 h-32 object-cover rounded-full"
          />
          <div>
            <p className="text-gray-600">{client.email}</p>

            <div className="mt-4">
              <h2 className="font-bold">Preferred Styles:</h2>
              <ul className="list-disc list-inside text-sm">
                {client.preferredStyles.map((style, index) => (
                  <li key={index}>{style}</li>
                ))}
              </ul>
            </div>

            <div className="mt-4">
              <h2 className="font-bold">Liked Artists:</h2>
              <ul className="list-disc list-inside text-sm">
                {client.likedArtists.length > 0 ? (
                  client.likedArtists.map((id, index) => (
                    <li key={index}>Artist ID: {id}</li>
                  ))
                ) : (
                  <li>No liked artists yet.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-10 max-w-[1400px] mx-auto">
        <h2 className="text-xl font-bold mb-4">Your Offers</h2>

        {offers.length === 0 ? (
          <p className="text-gray-500">No offers received yet.</p>
        ) : (
          <div className="space-y-4 flex justify-center md:justify-start pb-40">
            {offers.map((offer) => (
              <div
                key={offer.id}
                className="bg-[var(--color-bg-card)] rounded-lg p-4 shadow-sm max-w-[500px]"
              >
                <p className="text-white">From: {offer.artistName}</p>
                <p>
                  <strong className="text-white">Price: </strong>
                  <span className="text-green-300">${offer.price}</span>
                </p>
                <p>
                  <strong className="text-white">Location:</strong>{" "}
                  {offer.location}
                </p>
                <p>
                  <strong className="text-white">Status:</strong> {offer.status}
                </p>
                <p>
                  <strong className="text-white">Message from Artist:</strong>{" "}
                  {offer.message}
                </p>
                <div className="mt-2">
                  <p className="font-semibold">Choose a time:</p>
                  <div className="flex flex-col gap-2 mt-1">
                    {offer.dateOptions.map((option, idx) => (
                      <label
                        key={idx}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`time-${offer.id}`}
                          value={option}
                          checked={selectedDateOptions[offer.id] === option}
                          onChange={() =>
                            setSelectedDateOptions((prev) => ({
                              ...prev,
                              [offer.id]: option,
                            }))
                          }
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {offer.status === "sent" && (
                  <div className="mt-4 flex gap-3">
                    <button
                      className="px-4 py-1 bg-green-600 text-[#121212]! text-sm rounded hover:bg-green-500 transition"
                      onClick={() => handleAcceptOffer(offer.id)}
                    >
                      Accept
                    </button>
                    <button
                      className="px-4 py-1 bg-red-600 text-[#121212]! text-sm rounded hover:bg-red-500 transition"
                      onClick={() => handleDeclineOffer(offer.id)}
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default ClientDashboard;
