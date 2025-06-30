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
    <div className="flex h-screen bg-zinc-900 text-white">
      <SidebarNavigation
        activeView={activeView}
        onViewChange={(view) => setActiveView(view)}
      />

      <main className="flex-1 overflow-y-auto p-6">
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
          booking={selectedBooking}
          onClose={() => setIsModalOpen(false)}
        />
      </main>
    </div>
  );
};

export default NewArtistDashboard;
