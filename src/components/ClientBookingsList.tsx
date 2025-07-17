import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import type { Booking } from "../types/Booking";
import { format, parseISO } from "date-fns";

interface Props {
  clientId: string;
}

const ClientBookingsList: React.FC<Props> = ({ clientId }) => {
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
      <h2 className="text-xl font-bold mb-6 tracking-tight">
        Confirmed Bookings
      </h2>

      {bookings.length === 0 ? (
        <p className="text-sm text-gray-400">You have no confirmed bookings.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {bookings.map((booking) => {
            const dateFormatted = format(
              parseISO(booking.selectedDate.date),
              "EEEE, MMMM d, yyyy"
            );
            const timeFormatted = format(
              new Date(`1970-01-01T${booking.selectedDate.time}`),
              "h:mm a"
            );

            return (
              <div
                key={booking.id}
                className="rounded-xl border border-neutral-700 bg-[var(--color-bg-card)] shadow-sm overflow-hidden transition hover:shadow-lg"
              >
                {booking.sampleImageUrl && (
                  <img
                    src={booking.sampleImageUrl}
                    alt="Tattoo sample"
                    className="w-full h-48 object-cover"
                  />
                )}

                <div className="p-4 space-y-2">
                  <p className="text-base font-semibold">
                    {booking.artistName}
                  </p>

                  <p className="text-sm text-gray-400">
                    Shop: {booking.shopName}
                  </p>

                  <p className="text-sm text-gray-300">
                    {dateFormatted} at {timeFormatted}
                  </p>

                  <p
                    className={`text-sm font-medium ${
                      booking.status === "confirmed"
                        ? "text-green-400"
                        : "text-yellow-400"
                    }`}
                  >
                    Status: {booking.status}
                  </p>

                  <p className="text-sm text-gray-400">
                    Total Paid:{" "}
                    <span className="text-white font-medium">
                      ${booking.price}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ClientBookingsList;
