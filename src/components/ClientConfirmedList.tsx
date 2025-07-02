import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

interface Props {
  clientId: string;
}

interface Booking {
  id: string;
  artistName: string;
  location: string;
  selectedTime: string;
  price: number;
  status: string;
}

const ClientConfirmedList: React.FC<Props> = ({ clientId }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);

  const fetchBookings = async () => {
    const q = query(
      collection(db, "bookings"),
      where("clientId", "==", clientId)
    );
    const snap = await getDocs(q);
    const data = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Booking[];

    setBookings(data);
  };

  useEffect(() => {
    if (clientId) fetchBookings();
  }, [clientId]);

  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">Confirmed Bookings</h2>
      {bookings.length === 0 ? (
        <p className="text-sm text-gray-400">You have no confirmed bookings.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="bg-[var(--color-bg-card)] border border-neutral-700 rounded-lg p-4"
            >
              <p className="font-medium text-sm">{booking.artistName}</p>
              <p className="text-sm text-gray-300">
                Location: {booking.location}
              </p>
              <p className="text-sm text-gray-300">
                Time: {booking.selectedTime}
              </p>
              <p className="text-sm text-green-400 mt-2">
                Status: {booking.status}
              </p>
              <p className="text-sm text-gray-300">Price: ${booking.price}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default ClientConfirmedList;
