// NewArtistDashboard.tsx
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase/firebaseConfig";
import { db, auth } from "../firebase/firebaseConfig";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
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
  const [offerImage, setOfferImage] = useState<File | null>(null);
  const [offerPrice, setOfferPrice] = useState(0);
  const [offerMessage, setOfferMessage] = useState("");
  const [dateOptions, setDateOptions] = useState([
    { date: "", time: "" },
    { date: "", time: "" },
    { date: "", time: "" },
  ]);
  const handleOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBooking || !uid) return;

    // Optional: Upload image to Firebase Storage here and get URL
    let uploadedImageUrl = "";
    if (offerImage) {
      const storageRef = ref(
        storage,
        `offers/${uid}/${Date.now()}-${offerImage.name}`
      );
      await uploadBytes(storageRef, offerImage);
      uploadedImageUrl = await getDownloadURL(storageRef);
    }

    const offerData = {
      artistId: uid,
      clientId: selectedBooking.clientId,
      requestId: selectedBooking.id,
      price: offerPrice,
      message: offerMessage,
      dateOptions,
      imageUrl: uploadedImageUrl || null,
      status: "pending",
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, "offers"), offerData);

    // Reset everything
    setOfferPrice(0);
    setOfferMessage("");
    setOfferImage(null);
    setDateOptions([
      { date: "", time: "" },
      { date: "", time: "" },
      { date: "", time: "" },
    ]);
    setIsModalOpen(false);
  };

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
    <div className="flex flex-col md:flex-row h-screen bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#121212] text-white">
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
          onClose={() => setIsModalOpen(false)}
          selectedRequest={selectedBooking}
          offerPrice={offerPrice}
          setOfferPrice={setOfferPrice}
          offerMessage={offerMessage}
          setOfferMessage={setOfferMessage}
          offerImage={offerImage}
          setOfferImage={setOfferImage}
          dateOptions={dateOptions}
          setDateOptions={setDateOptions}
          onSubmit={handleOfferSubmit}
        />
      </main>
    </div>
  );
};

export default NewArtistDashboard;
