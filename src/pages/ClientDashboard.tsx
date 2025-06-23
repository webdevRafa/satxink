import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { auth } from "../firebase/auth";
import { db } from "../firebase/firebaseConfig";

interface Artist {
  id: string;
  name: string;
  avatarUrl: string;
  studioName: string;
}

interface Client {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  preferredStyles: string[];
  likedArtists: string[];
}

interface Offer {
  id: string;
  artistName: string;
  price: number;
  location: string;
  message: string;
  status: string;
}

interface Booking {
  id: string;
  artistName: string;
  selectedTime: string;
  location: string;
  price: number;
  status: string;
}

export default function ClientDashboard() {
  const [client, setClient] = useState<Client | null>(null);
  const [likedArtists, setLikedArtists] = useState<Artist[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [requestText, setRequestText] = useState("");

  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState({
    description: "",
    bodyPlacement: "",
    size: "",
    preferredDateRange: ["", ""],
  });
  const [availableTime, setAvailableTime] = useState({ from: "", to: "" });
  const [availableDays, setAvailableDays] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      const clientRef = doc(db, "users", user.uid);
      const clientSnap = await getDoc(clientRef);
      if (!clientSnap.exists()) return;

      const clientData = { id: user.uid, ...clientSnap.data() } as Client;
      setClient(clientData);

      const liked = await Promise.all(
        clientData.likedArtists.map(async (id) => {
          const docSnap = await getDoc(doc(db, "users", id));
          if (docSnap.exists()) {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: data.name,
              avatarUrl: data.avatarUrl,
              studioName: data.studioName,
            } as Artist;
          }
          return null;
        })
      );
      setLikedArtists(liked.filter((a): a is Artist => a !== null));

      const offersQuery = query(
        collection(db, "bookingOffers"),
        where("clientId", "==", user.uid)
      );
      const offersSnap = await getDocs(offersQuery);
      setOffers(
        offersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Offer))
      );

      const bookingsQuery = query(
        collection(db, "bookings"),
        where("clientId", "==", user.uid)
      );
      const bookingsSnap = await getDocs(bookingsQuery);
      setBookings(
        bookingsSnap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Booking)
        )
      );
    });

    return () => unsubscribe();
  }, []);

  const handleSubmitRequest = async () => {
    if (!client || requestText.trim() === "") return;

    await addDoc(collection(db, "bookingRequests"), {
      clientId: client.id,
      text: requestText,
      preferredStyles: client.preferredStyles,
      createdAt: Timestamp.now(),
    });

    alert("Request sent to relevant artists!");
    setRequestText("");
  };

  const handleOpenRequestModal = (artist: Artist) => {
    setSelectedArtist(artist);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !selectedArtist) return;

    await addDoc(collection(db, "bookingRequests"), {
      artistId: selectedArtist.id,
      clientId: client.id,
      ...modalData,
      availableTime,
      availableDays,
      status: "pending",
      createdAt: Timestamp.now(),
    });

    setIsModalOpen(false);
    setModalData({
      description: "",
      bodyPlacement: "",
      size: "",
      preferredDateRange: ["", ""],
    });
    setAvailableTime({ from: "", to: "" });
    setAvailableDays([]);
    alert("Request sent!");
  };

  if (!client) return <div className="text-white p-6">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 text-white">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Welcome, {client.name}
      </p>

      {/* Preferred Styles */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-2">My preferred styles</h2>
        <div className="flex flex-wrap gap-2">
          {client.preferredStyles.map((style) => (
            <span
              key={style}
              className="px-3 py-1 border border-neutral-600 rounded-full text-sm"
            >
              {style}
            </span>
          ))}
        </div>
      </section>

      {/* Liked Artists */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-2">Liked artists</h2>
        {likedArtists.length === 0 ? (
          <p className="text-sm text-gray-400">
            You haven't liked any artists yet.
          </p>
        ) : (
          <div className="flex md:grid md:grid-cols-3 gap-4 overflow-x-auto md:overflow-visible pb-2">
            {likedArtists.map((artist) => (
              <div
                key={artist.id}
                className="min-w-[220px] bg-neutral-900 border border-neutral-700 rounded-lg p-4"
              >
                <img
                  src={artist.avatarUrl || "/fallback-avatar.jpg"}
                  alt={artist.name}
                  className="w-16 h-16 rounded-full object-cover mb-2"
                />
                <p className="font-semibold text-sm">{artist.name}</p>
                <p className="text-xs text-gray-400">{artist.studioName}</p>
                <button
                  className="mt-4 text-sm text-white! hover:text-[#121212]! bg-neutral-700 hover:bg-neutral-300 px-4 py-2 rounded"
                  onClick={() => handleOpenRequestModal(artist)}
                >
                  Request a tattoo
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Offers from Artists */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-2">Offers from artists</h2>
        {offers.length === 0 ? (
          <p className="text-sm text-gray-400">You have no offers yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {offers.map((offer) => (
              <div
                key={offer.id}
                className="bg-neutral-800 rounded-lg p-4 border border-neutral-600"
              >
                <p className="font-medium">From: {offer.artistName}</p>
                <p className="text-sm text-gray-300">
                  ${offer.price} – {offer.location}
                </p>
                <p className="text-sm italic text-gray-400 mt-1">
                  “{offer.message}”
                </p>
                <p className="mt-2 text-xs text-yellow-400">
                  Status: {offer.status}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Confirmed Bookings */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-2">Confirmed bookings</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-gray-400">No bookings yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="bg-neutral-800 p-4 rounded-lg border border-neutral-700"
              >
                <p className="font-medium">{booking.artistName}</p>
                <p className="text-sm">Time: {booking.selectedTime}</p>
                <p className="text-sm">Location: {booking.location}</p>
                <p className="text-sm text-green-400">
                  Status: {booking.status}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Broadcast Request */}
      <section className="mb-20">
        <h2 className="text-xl font-semibold">Make a request</h2>
        <p className="mb-2 text-sm">
          This will broadcast your request to artists who match your preferred
          styles.
        </p>
        <textarea
          className="w-full h-28 p-3 rounded bg-neutral-900 border border-neutral-700 text-white"
          placeholder="Describe your tattoo idea here..."
          value={requestText}
          onChange={(e) => setRequestText(e.target.value)}
        ></textarea>
        <button
          onClick={handleSubmitRequest}
          className="mt-3 px-5 py-2 bg-white text-black rounded hover:bg-gray-200"
        >
          Submit equest
        </button>
      </section>

      {/* Modal */}
      {isModalOpen && selectedArtist && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
          <div className="bg-neutral-900 p-6 rounded-md w-full max-w-md relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-2 right-3 text-white text-lg"
            >
              &times;
            </button>
            <h2 className="text-xl font-bold mb-4 text-white">
              Request a Tattoo from {selectedArtist.name}
            </h2>
            <form onSubmit={handleModalSubmit}>
              <textarea
                required
                className="w-full p-2 rounded bg-neutral-800 text-white mb-3"
                placeholder="Describe your tattoo..."
                value={modalData.description}
                onChange={(e) =>
                  setModalData({ ...modalData, description: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="Body Placement"
                className="w-full p-2 rounded bg-neutral-800 text-white mb-3"
                value={modalData.bodyPlacement}
                onChange={(e) =>
                  setModalData({ ...modalData, bodyPlacement: e.target.value })
                }
              />
              <label className="text-sm text-white mb-1 block">Size</label>
              <select
                required
                className="w-full p-2 rounded bg-neutral-800 text-white mb-3"
                value={modalData.size}
                onChange={(e) =>
                  setModalData({ ...modalData, size: e.target.value })
                }
              >
                <option value="">Select size</option>
                <option value="Small">Small (up to 3x3 inches)</option>
                <option value="Medium">Medium (up to 6x6 inches)</option>
                <option value="Large">Large (over 6x6 inches)</option>
              </select>

              <div className="flex gap-2 mb-3">
                <input
                  type="date"
                  className="w-full p-2 rounded bg-neutral-800 text-white"
                  value={modalData.preferredDateRange[0]}
                  onChange={(e) =>
                    setModalData({
                      ...modalData,
                      preferredDateRange: [
                        e.target.value,
                        modalData.preferredDateRange[1],
                      ],
                    })
                  }
                />
                <input
                  type="date"
                  className="w-full p-2 rounded bg-neutral-800 text-white"
                  value={modalData.preferredDateRange[1]}
                  onChange={(e) =>
                    setModalData({
                      ...modalData,
                      preferredDateRange: [
                        modalData.preferredDateRange[0],
                        e.target.value,
                      ],
                    })
                  }
                />
              </div>

              {/* Time Availability */}
              <label className="text-sm text-white mb-2 block">
                Available Time Range
              </label>
              <div className="flex gap-2 mb-4">
                <input
                  type="time"
                  className="w-full p-2 rounded bg-neutral-800 text-white"
                  value={availableTime.from}
                  onChange={(e) =>
                    setAvailableTime((prev) => ({
                      ...prev,
                      from: e.target.value,
                    }))
                  }
                />
                <input
                  type="time"
                  className="w-full p-2 rounded bg-neutral-800 text-white"
                  value={availableTime.to}
                  onChange={(e) =>
                    setAvailableTime((prev) => ({
                      ...prev,
                      to: e.target.value,
                    }))
                  }
                />
              </div>

              {/* Day Availability */}
              <label className="text-sm text-white mb-2 block">
                Available Days
              </label>
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ].map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={`px-3 py-1 rounded-full text-sm ${
                      availableDays.includes(day)
                        ? "bg-neutral-300 text-[#121212]!"
                        : "bg-neutral-700 text-white"
                    }`}
                    onClick={() =>
                      setAvailableDays((prev) =>
                        prev.includes(day)
                          ? prev.filter((d) => d !== day)
                          : [...prev, day]
                      )
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-[#b6382d] text-white rounded"
              >
                Submit
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
