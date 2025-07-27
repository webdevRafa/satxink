import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import CalendarSyncPanel from "../components/CalendarSyncPanel";

import { db, auth } from "../firebase/firebaseConfig";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";

import SidebarNavigation from "../components/SidebarNavigation";
import ArtistProfileHeader from "../components/ArtistProfileHeader";
import BookingRequestsList from "../components/BookingRequestsList";
import MakeOfferModal from "../components/MakeOfferModal";
import OffersList from "../components/OffersList";
import FlashManager from "../components/FlashManager";
import GalleryManager from "../components/GalleryManager";
import type { Booking } from "../types/Booking";

const ArtistDashboardView = () => {
  const [artist, setArtist] = useState<any>(null);
  const [bookingRequests, setBookingRequests] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<
    | "requests"
    | "offers"
    | "bookings"
    | "pending"
    | "confirmed"
    | "paid"
    | "cancelled"
    | "calendar"
    | "flashes"
    | "gallery"
  >("requests");

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

  // Translate sidebar tab into actual Firestore status
  const getFirestoreStatus = (tab: typeof activeTab): Booking["status"] => {
    if (tab === "pending") return "pending_payment";
    if (tab === "confirmed") return "confirmed";
    if (tab === "paid") return "paid";
    if (tab === "cancelled") return "cancelled";
    return "confirmed";
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

  // Fetch booking requests
  useEffect(() => {
    const fetchRequests = async () => {
      if (!uid) return;
      const q = query(
        collection(db, "bookingRequests"),
        where("artistId", "==", uid),
        where("status", "==", "pending")
      );
      const snapshot = await getDocs(q);
      setBookingRequests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    fetchRequests();
  }, [uid]);

  // Fetch bookings based on the current tab
  useEffect(() => {
    const fetchBookings = async () => {
      if (!uid) return;

      // Always clear previous results when switching tabs
      setBookings([]);

      const statusToFetch = getFirestoreStatus(activeTab);

      let q;
      if (statusToFetch === "paid") {
        q = query(
          collection(db, "bookings"),
          where("artistId", "==", uid),
          where("status", "==", "paid")
        );
      } else {
        q = query(
          collection(db, "bookings"),
          where("artistId", "==", uid),
          where("status", "==", statusToFetch),
          orderBy("createdAt", "desc")
        );
      }

      const snapshot = await getDocs(q);
      setBookings(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Booking[]
      );
    };

    fetchBookings();
  }, [uid, activeTab]);

  return (
    <div className="flex flex-col md:flex-row h-full bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#121212] text-white py-20 min-h-[100vh]">
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

        {activeTab === "offers" && uid && <OffersList uid={uid} />}

        {/* Booking cards */}
        {["pending", "confirmed", "paid", "cancelled"].includes(activeTab) && (
          <div>
            <h2 className="text-xl font-semibold mb-4 capitalize">
              {activeTab} Bookings
            </h2>
            {bookings.length === 0 ? (
              <p className="text-gray-400">No {activeTab} bookings yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookings.map((b) => {
                  const created =
                    b.createdAt?.toDate?.() || b.paidAt?.toDate?.()
                      ? (
                          b.createdAt?.toDate?.() || b.paidAt?.toDate?.()
                        ).toLocaleDateString()
                      : "N/A";

                  return (
                    <div
                      key={b.id}
                      className="bg-gray-900 rounded-lg p-4 shadow hover:shadow-lg transition"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold">
                            {b.shopName || "Private Studio"}
                          </p>
                          <p className="text-sm text-gray-400">
                            {b.shopAddress || "Address not provided"}
                          </p>
                          <p className="mt-2 text-sm">
                            {b.selectedDate.date} @ {b.selectedDate.time}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Created: {created}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            b.status === "paid" || b.status === "confirmed"
                              ? "bg-green-600"
                              : b.status === "pending_payment"
                              ? "bg-yellow-600"
                              : "bg-red-600"
                          }`}
                        >
                          {b.status.replace("_", " ").toUpperCase()}
                        </span>
                      </div>
                      {b.sampleImageUrl && (
                        <img
                          src={b.sampleImageUrl}
                          alt="Tattoo"
                          className="mt-3 rounded-md w-full max-h-48 object-cover"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "flashes" && uid && <FlashManager uid={uid} />}
        {activeTab === "gallery" && uid && <GalleryManager uid={uid} />}
        {activeTab === "calendar" && uid && (
          <CalendarSyncPanel
            feedUrl={`https://satxink.com/calendars/${uid}.ics?token=${
              artist?.calendarToken || "defaultToken"
            }`}
          />
        )}

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

export default ArtistDashboardView;
