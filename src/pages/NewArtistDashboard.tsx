// NewArtistDashboard.tsx
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase/firebaseConfig";
import { v4 as uuidv4 } from "uuid";

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
  const [fallbackPrice, setFallbackPrice] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState<number>(0);

  const [offerMessage, setOfferMessage] = useState("");
  const [dateOptions, setDateOptions] = useState([
    { date: "", time: "" },
    { date: "", time: "" },
    { date: "", time: "" },
  ]);
  const handleOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBooking || !uid) return;

    // Upload image to Firebase Storage and get URLs
    let uploadedImageUrl = "";
    let fullUrl = null;
    let thumbUrl = null;

    if (offerImage) {
      const filename = `${uuidv4()}-${offerImage.name}`;
      const fullPath = `users/${uid}/offers/full/${filename}`;
      const fullRef = ref(storage, fullPath);

      await uploadBytes(fullRef, offerImage);
      fullUrl = await getDownloadURL(fullRef);

      const thumbRef = ref(storage, `users/${uid}/offers/thumbs/${filename}`);
      try {
        thumbUrl = await getDownloadURL(thumbRef);
      } catch {
        console.warn("Thumbnail not available yet");
      }

      uploadedImageUrl = fullUrl; // still use as fallback or for legacy compatibility
    }

    if (!["internal", "external"].includes(artist.paymentType)) {
      throw new Error("Artist has invalid or missing paymentType.");
    }

    let shop = null;
    if (artist.shopId) {
      const shopRef = doc(db, "shops", artist.shopId);
      const shopSnap = await getDoc(shopRef);
      if (shopSnap.exists()) {
        shop = shopSnap.data();
      }
    }

    const offerData = {
      artistId: uid,
      displayName: artist.displayName,
      artistAvatar: artist.avatarUrl || null,

      // Shop info
      shopId: artist.shopId || null,
      shopName: shop?.name || "Unavailable",
      shopAddress: shop?.address || "Unavailable",
      shopMapLink: shop?.mapLink || null,

      // Offer-specific
      clientId: selectedBooking.clientId,
      requestId: selectedBooking.id,
      price: offerPrice,
      fallbackPrice: fallbackPrice ?? null,
      message: offerMessage,
      dateOptions,
      imageUrl: uploadedImageUrl || null, // fallback compatibility
      fullUrl: fullUrl || null,
      thumbUrl: thumbUrl || null,

      // Safe Payment + Deposit logic
      paymentType: artist.paymentType,
      externalPaymentDetails:
        artist.paymentType === "external"
          ? artist.externalPaymentDetails || null
          : null,

      depositPolicy: {
        amount: depositAmount,
        depositRequired: true,
        nonRefundable: true,
      },
      finalPaymentTiming: artist.finalPaymentTiming || "after",

      status: "pending",
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, "offers"), offerData);

    // Reset everything
    setOfferPrice(0);
    setFallbackPrice(null);
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
