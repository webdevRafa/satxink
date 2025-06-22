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

type Booking = {
  id: string;
  artistId: string;
  artistName?: string;
  clientId: string;
  requestId: string;
  offerId: string;
  selectedTime: string;
  price: number;
  location: string;
  status: string;
};

const ClientDashboard = () => {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<BookingOffer[]>([]);
  const [clientBookings, setClientBookings] = useState<Booking[]>([]);

  const handleAcceptOffer = async (offerId: string) => {
    try {
      const offerRef = doc(db, "bookingOffers", offerId);
      await updateDoc(offerRef, {
        status: "accepted",
      });
      alert("Offer accepted!");
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
      setOffers((prev) =>
        prev.map((o) => (o.id === offerId ? { ...o, status: "declined" } : o))
      );
    } catch (error) {
      console.error("Error declining offer:", error);
    }
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const clientRef = doc(db, "users", "VRUNIfCcE9n0ix3JY1GA");
        const clientSnap = await getDoc(clientRef);
        if (clientSnap.exists()) {
          setClient(clientSnap.data() as Client);
        }

        const offersQuery = query(
          collection(db, "bookingOffers"),
          where("clientId", "==", "VRUNIfCcE9n0ix3JY1GA")
        );
        const offersSnap = await getDocs(offersQuery);
        const offersData: BookingOffer[] = [];
        offersSnap.forEach((doc) =>
          offersData.push({ id: doc.id, ...doc.data() } as BookingOffer)
        );
        setOffers(offersData);

        const bookingsQuery = query(
          collection(db, "bookings"),
          where("clientId", "==", "VRUNIfCcE9n0ix3JY1GA")
        );
        const bookingsSnap = await getDocs(bookingsQuery);
        const bookingsData: Booking[] = [];
        bookingsSnap.forEach((doc) =>
          bookingsData.push({ id: doc.id, ...doc.data() } as Booking)
        );
        setClientBookings(bookingsData);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
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

      {/* OFFERS */}
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

      {/* BOOKINGS */}
      <div className="mt-16 max-w-[1400px] mx-auto">
        <h2 className="text-xl font-bold mb-4">Confirmed Bookings</h2>

        {clientBookings.length === 0 ? (
          <p className="text-gray-400">No confirmed bookings yet.</p>
        ) : (
          <div className="space-y-4 flex flex-col md:flex-row md:flex-wrap gap-4 pb-40">
            {clientBookings.map((booking) => (
              <div
                key={booking.id}
                className="bg-[var(--color-bg-card)] rounded-lg p-4 shadow-sm max-w-[500px] w-full"
              >
                <p>
                  <strong>Artist ID:</strong> {booking.artistId}
                </p>
                {booking.artistName && (
                  <p>
                    <strong>Artist:</strong> {booking.artistName}
                  </p>
                )}
                <p>
                  <strong>Time:</strong> {booking.selectedTime}
                </p>
                <p>
                  <strong>Location:</strong> {booking.location}
                </p>
                <p>
                  <strong>Price:</strong> ${booking.price}
                </p>
                <p>
                  <strong>Status:</strong> {booking.status}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default ClientDashboard;
