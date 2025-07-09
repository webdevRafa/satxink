import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import { toast } from "react-hot-toast";
import type { Booking } from "../../types/Booking";

const PaymentPage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);

  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingId) return;

      try {
        const ref = doc(db, "bookings", bookingId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          toast.error("Booking not found.");
          navigate("/"); // or back to dashboard
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
        Loading payment details...
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
  const {
    paymentType,
    externalPaymentDetails,
    depositAmount,
    artistName,
    shopName,
    sampleImageUrl,
  } = booking;

  return (
    <div className="min-h-screen bg-[#121212] text-white px-4 py-10 flex items-center justify-center">
      <div className="max-w-xl w-full bg-[#1e1e1e] rounded-xl p-6 shadow-lg">
        <h1 className="text-2xl font-bold mb-2">Pay Your Deposit</h1>
        <p className="text-sm text-yellow-400 italic mb-4">
          Status: {booking.status.replace("_", " ")}
        </p>

        <p className="text-sm text-gray-400 mb-4">
          You're booking a tattoo with{" "}
          <span className="font-semibold">{artistName}</span>
          {shopName && (
            <>
              {" "}
              at <span className="italic">{shopName}</span>
            </>
          )}
          .
        </p>

        {sampleImageUrl && (
          <img
            src={sampleImageUrl}
            alt="Tattoo sample"
            className="rounded-lg mb-4 max-h-60 object-contain border border-gray-700"
          />
        )}

        <div className="mb-6">
          <p className="text-sm mb-1 text-gray-300">Deposit Required:</p>
          <p className="text-2xl font-bold text-emerald-400">
            ${depositAmount}
          </p>
        </div>

        {paymentType === "external" && externalPaymentDetails ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              Please send your payment via:
            </p>
            <div className="bg-black/30 p-4 rounded-lg border border-emerald-500">
              <p className="text-lg font-semibold capitalize">
                {externalPaymentDetails.method}
              </p>
              {externalPaymentDetails.handle ? (
                <p className="text-emerald-400 font-bold text-xl">
                  {externalPaymentDetails.handle}
                </p>
              ) : (
                <p className="text-red-400 text-sm">
                  No payment handle provided. Please contact your artist
                  directly.
                </p>
              )}
            </div>
            <p className="text-sm text-gray-400">
              Once you’ve sent the payment, please keep your confirmation. Your
              artist may follow up.
            </p>
            <p className="text-sm text-gray-400 mt-4">
              Once you’ve sent the deposit, press “Done” to return to your
              dashboard. Your artist will confirm the payment shortly.
            </p>
            <button
              onClick={() => navigate("/")}
              className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded w-full mt-4"
            >
              Done
            </button>
          </div>
        ) : paymentType === "internal" ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">Proceed to secure checkout:</p>
            <button
              onClick={async () => {
                try {
                  toast.loading("Redirecting to Stripe...");
                  const response = await fetch(
                    `https://your-cloud-function-url.com/createStripeSession?bookingId=${booking.id}`
                  );
                  const { checkoutUrl } = await response.json();
                  toast.dismiss();
                  window.location.href = checkoutUrl;
                } catch (err) {
                  console.error(err);
                  toast.dismiss();
                  toast.error("Failed to start checkout.");
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded w-full"
            >
              Pay with Card
            </button>
          </div>
        ) : (
          <p className="text-red-500">Unknown payment type.</p>
        )}
      </div>
    </div>
  );
};

export default PaymentPage;
