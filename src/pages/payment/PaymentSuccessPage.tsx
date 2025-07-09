import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import { toast } from "react-hot-toast";
import type { Booking } from "../../types/Booking";

const PaymentSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  const bookingId = searchParams.get("bookingId");

  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingId) return;

      try {
        const ref = doc(db, "bookings", bookingId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          toast.error("Booking not found.");
          navigate("/");
          return;
        }

        setBooking({ id: snap.id, ...snap.data() } as Booking);
        setLoading(false);
      } catch (err) {
        console.error(err);
        toast.error("Error loading booking.");
        navigate("/");
      }
    };

    fetchBooking();
  }, [bookingId, navigate]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-white text-lg">
        Verifying payment...
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="h-screen flex items-center justify-center text-white text-lg">
        Booking not found or failed to load.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white px-4 py-10 flex items-center justify-center">
      <div className="max-w-xl w-full bg-[#1e1e1e] rounded-xl p-6 shadow-lg text-center">
        <h1 className="text-2xl font-bold text-emerald-400 mb-2">
          Payment Successful!
        </h1>
        <p className="text-gray-300 mb-4">
          You’ve secured your spot with{" "}
          <span className="font-semibold">{booking.artistName}</span>
          {booking.shopName && (
            <>
              {" "}
              at <span className="italic">{booking.shopName}</span>
            </>
          )}
          .
        </p>

        {booking.sampleImageUrl && (
          <img
            src={booking.sampleImageUrl}
            alt="Tattoo sample"
            className="rounded-lg mb-4 max-h-60 object-contain border border-gray-700 mx-auto"
          />
        )}

        <p className="text-sm text-gray-400 mb-2">Deposit Paid:</p>
        <p className="text-xl font-bold text-emerald-400 mb-6">
          ${booking.depositAmount}
        </p>

        <button
          onClick={() => navigate("/")}
          className="bg-emerald-600 hover:bg-emerald-700 px-6 py-2 rounded text-white"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
};

export default PaymentSuccessPage;
