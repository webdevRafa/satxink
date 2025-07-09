// NewArtistDashboard.tsx
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { db, auth } from "../firebase/firebaseConfig";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

import SidebarNavigation from "../components/SidebarNavigation";
import ArtistProfileHeader from "../components/ArtistProfileHeader";
import BookingRequestsList from "../components/BookingRequestsList";
import MakeOfferModal from "../components/MakeOfferModal";

const NewArtistDashboard = () => {
  const [artist, setArtist] = useState<any>(null);
  const [bookingRequests, setBookingRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<
    "requests" | "offers" | "bookings"
  >("requests");
  const [bookingStatusFilter, setBookingStatusFilter] = useState<
    "confirmed" | "pending_payment" | "cancelled"
  >("confirmed");

  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [offerPrice, setOfferPrice] = useState(0);
  const [fallbackPrice, setFallbackPrice] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState<number>(0);

  const [offerMessage, setOfferMessage] = useState("");
  const [dateOptions, setDateOptions] = useState([
    { date: "", time: "" },
    { date: "", time: "" },
    { date: "", time: "" },
  ]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) setArtist(snap.data());
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchRequests = async () => {
      if (!uid) return;
      const q = query(
        collection(db, "bookingRequests"),
        where("artistId", "==", uid),
        where("status", "==", "pending")
      );
      const snapshot = await getDocs(q);
      const requests = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setBookingRequests(requests);
    };

    fetchRequests();
  }, [uid]);

  return (
    <div className="flex flex-col md:flex-row h-full bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#121212] text-white pt-20">
      <SidebarNavigation
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
      />

      <main className="relative flex-1 p-6 h-full">
        {artist && <ArtistProfileHeader artist={artist} />}

        {activeTab === "requests" && (
          <BookingRequestsList
            bookingRequests={bookingRequests}
            onMakeOffer={(booking) => {
              setSelectedBooking(booking);
              setIsModalOpen(true);
            }}
          />
        )}

        {activeTab === "offers" && (
          <div className="mt-4 text-sm text-gray-400">
            {/* You can build an <OffersList /> component later */}
            Offers you've sent will show here.
          </div>
        )}

        {activeTab === "bookings" && (
          <>
            {/* Filter buttons */}
            <div className="flex gap-2 mb-4">
              {["confirmed", "pending_payment", "cancelled"].map((status) => (
                <button
                  key={status}
                  onClick={() =>
                    setBookingStatusFilter(status as typeof bookingStatusFilter)
                  }
                  className={`px-4 py-2 rounded-md ${
                    bookingStatusFilter === status
                      ? "bg-red-600 text-white"
                      : "bg-gray-800 text-gray-300"
                  }`}
                >
                  {status.replace("_", " ").toUpperCase()}
                </button>
              ))}
            </div>

            {/* Booking list filtered by status */}
            <div className="text-sm text-gray-400">
              {/* TODO: Create <FilteredBookingsList /> */}
              Displaying bookings with status:{" "}
              <strong>{bookingStatusFilter}</strong>
            </div>
          </>
        )}

        {/* TODO: OffersList and ConfirmedBookings components */}

        <MakeOfferModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          selectedRequest={selectedBooking}
          depositAmount={depositAmount}
          setDepositAmount={setDepositAmount}
          offerPrice={offerPrice}
          setOfferPrice={setOfferPrice}
          fallbackPrice={fallbackPrice}
          setFallbackPrice={setFallbackPrice}
          offerMessage={offerMessage}
          setOfferMessage={setOfferMessage}
          dateOptions={dateOptions}
          setDateOptions={setDateOptions}
          artist={artist}
          uid={uid!}
        />
      </main>
    </div>
  );
};

export default NewArtistDashboard;
