import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import { toast } from "react-hot-toast";
import type { Booking } from "../../types/Booking";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase/firebaseConfig";

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
    <div className="min-h-screen bg-gradient-to-b from-[var(--color-bg-footer)] to-[var(--color-bg-card)] text-white px-4 py-10 flex items-center justify-center">
      <div className="max-w-xl w-full bg-gradient-to-b from-[var(--color-bg-base)] to-[var(--color-bg-button)] rounded-xl pt-10 pb-4 px-4 shadow-lg">
        <h1 className="text-2xl! font-bold mb-0">Confirm Your Booking</h1>
        <p className="text-sm! text-yellow-400! opacity-40 italic mb-6!">
          Status: {booking.status.replace("_", " ")}
        </p>

        <p className="text-md! text-white mb-4">
          You're booking a tattoo with{" "}
          <span className="font-semibold text-white">{artistName}</span>
          {shopName && (
            <>
              {" "}
              at <span className="italic">{shopName}</span>
            </>
          )}
          .
        </p>

        <p className="text-sm text-gray-300 mb-1">
          To confirm your appointment, a deposit of:
        </p>
        <p className="text-2xl font-bold text-emerald-400">${depositAmount}</p>
        <p className="text-sm text-gray-400 mt-2">
          This payment secures your booking and allows your artist to begin
          prep. <br />
          <span className="text-red-400 font-medium">
            All deposits are non-refundable.
          </span>
        </p>

        {sampleImageUrl && (
          <img
            src={sampleImageUrl}
            alt="Tattoo sample"
            className="rounded-lg mb-4 max-h-60 object-contain border border-gray-700"
          />
        )}

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
                  if (!booking) return;

                  toast.loading("Redirecting to Stripe...");

                  const createSession = httpsCallable(
                    functions,
                    "createCheckoutSession"
                  );

                  const response = await createSession({
                    offerId: booking.offerId,
                    bookingId: booking.id,
                    clientId: booking.clientId,
                    artistId: booking.artistId,
                    price: booking.depositAmount,
                    displayName: booking.artistName,
                    artistAvatar: booking.artistAvatar ?? "",
                    shopName: booking.shopName ?? "",
                    shopAddress: booking.shopAddress ?? "",
                    selectedDate: booking.selectedDate,
                  });

                  const { sessionUrl } = response.data as {
                    sessionUrl: string;
                  };
                  toast.dismiss();
                  window.location.href = sessionUrl;
                } catch (err) {
                  console.error(err);
                  toast.dismiss();
                  toast.error("Failed to start checkout.");
                }
              }}
              className=" bg-[var(--color-bg-base)] px-2! py-2! rounded w-full max-w-[280px] mt-6"
            >
              Proceed to Secure Checkout
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
