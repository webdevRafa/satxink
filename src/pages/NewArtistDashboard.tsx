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
  const [activeView, setActiveView] = useState<
    "requests" | "offers" | "confirmed"
  >("requests");
  const [artist, setArtist] = useState<any>(null);
  const [bookingRequests, setBookingRequests] = useState<any[]>([]);
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
        activeView={activeView}
        onViewChange={(view) => setActiveView(view)}
      />

      <main className="relative flex-1 p-6 h-full">
        {artist && <ArtistProfileHeader artist={artist} />}

        {activeView === "requests" && (
          <BookingRequestsList
            bookingRequests={bookingRequests}
            onMakeOffer={(booking) => {
              setSelectedBooking(booking);
              setIsModalOpen(true);
            }}
          />
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
