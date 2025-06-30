import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase/firebaseConfig";
import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  addDoc,
} from "firebase/firestore";
import { serverTimestamp, Timestamp } from "firebase/firestore";

import { auth } from "../firebase/auth";
import { toast, Toaster } from "react-hot-toast";
import { X } from "lucide-react";

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
  artistId: string;
  artistName: string;
  clientId: string;
  price: number;
  location: string;
  message: string;
  status: string;
  dateOptions: string[];
  requestId: string;
  createdAt?: Timestamp;
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
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [step, setStep] = useState(1);

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
  const handleOfferResponse = async (
    offerId: string,
    newStatus: "accepted" | "declined"
  ) => {
    try {
      const offerRef = doc(db, "bookingOffers", offerId);
      const offerSnap = await getDoc(offerRef);
      if (!offerSnap.exists()) {
        toast.error("Offer not found.");
        return;
      }

      const offerData = offerSnap.data();
      if (
        !offerData ||
        !offerData.artistId ||
        !Array.isArray(offerData.dateOptions)
      ) {
        toast.error("Invalid offer data.");
        return;
      }

      const selectedTime =
        offerData.dateOptions.length > 0 ? offerData.dateOptions[0] : "TBD";

      await updateDoc(offerRef, {
        status: newStatus,
        respondedAt: serverTimestamp(),
      });

      if (newStatus === "accepted") {
        // Look up artist to get shopId
        const artistRef = doc(db, "users", offerData.artistId);
        const artistSnap = await getDoc(artistRef);

        if (!artistSnap.exists()) {
          toast.error("Artist not found.");
          return;
        }

        const artistData = artistSnap.data();
        if (!artistData?.shopId) {
          toast.error("Artist is missing shop ID.");
          return;
        }

        // Look up shop address
        const shopRef = doc(db, "shops", artistData.shopId);
        const shopSnap = await getDoc(shopRef);
        const shopAddress = shopSnap.exists()
          ? shopSnap.data().address
          : "Location unavailable";

        // Create booking
        await addDoc(collection(db, "bookings"), {
          artistId: offerData.artistId,
          artistName: offerData.artistName,
          clientId: offerData.clientId,
          price: offerData.price,
          location: shopAddress,
          selectedTime,
          offerId: offerId,
          status: "confirmed",
          createdAt: serverTimestamp(),
        });

        toast.success("Booking confirmed!");
      } else {
        toast.success(`Offer ${newStatus}`);
      }

      // Update UI locally
      setOffers((prev) =>
        prev.map((offer) =>
          offer.id === offerId ? { ...offer, status: newStatus } : offer
        )
      );
    } catch (error) {
      console.error("Error processing offer:", error);
      toast.error("Something went wrong.");
    }
  };

  useEffect(() => {
    if (isModalOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
  }, [isModalOpen]);
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
      createdAt: serverTimestamp(),
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

    try {
      const reqRef = await addDoc(collection(db, "bookingRequests"), {
        artistId: selectedArtist.id,
        clientId: client.id,
        clientName: client.name,
        clientAvatar: client.avatarUrl,
        ...modalData,
        availableTime,
        availableDays,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      if (referenceImage) {
        const originalRef = ref(
          storage,
          `bookingRequests/${reqRef.id}/originals/${referenceImage.name}`
        );
        await uploadBytes(originalRef, referenceImage);

        const fullRef = ref(
          storage,
          `bookingRequests/${reqRef.id}/full/${referenceImage.name}`
        );
        const thumbRef = ref(
          storage,
          `bookingRequests/${reqRef.id}/thumb/${referenceImage.name}`
        );

        try {
          const [fullUrl, thumbUrl] = await Promise.all([
            getDownloadURL(fullRef),
            getDownloadURL(thumbRef),
          ]);

          await updateDoc(reqRef, {
            fullUrl,
            thumbUrl,
          });
        } catch (error) {
          console.error("Failed to get image URLs", error);
        }
      }

      setIsModalOpen(false);
      setModalData({
        description: "",
        bodyPlacement: "",
        size: "",
        preferredDateRange: ["", ""],
      });
      setAvailableTime({ from: "", to: "" });
      setAvailableDays([]);
      setReferenceImage(null);
      toast.success("Request sent!");
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong.");
    }
  };

  if (!client) return <div className="text-white p-6">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 text-white">
      <Toaster position="bottom-center" />

      <div className="relative bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#1a1a1a] rounded-xl p-6 shadow-lg max-w-6xl mx-auto mb-10">
        <div
          data-aos="fade-in"
          className="flex flex-col md:flex-row items-center md:items-start gap-6"
        >
          {/* Avatar */}
          <div className="relative group">
            <img
              src={client.avatarUrl || "/fallback-avatar.jpg"}
              alt={client.name}
              className="w-32 h-32 md:w-40 md:h-40 object-cover rounded-full border-4 border-neutral-800 group-hover:scale-105 transition-transform"
            />
            <span className="absolute bottom-1 right-1 bg-black text-white text-[10px] px-2 py-0.5 rounded-full opacity-70">
              Client
            </span>
          </div>

          {/* Info */}
          <div className="text-center md:text-left flex-1">
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              Welcome, {client.name}
            </h1>
            <p className="text-gray-400 mt-2 italic">
              Here’s your dashboard — track offers, find artists, and book with
              confidence.
            </p>

            {/* Preferred Styles */}
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-white mb-2">
                My Preferred Styles
              </h2>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                {client.preferredStyles.map((style, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 text-sm rounded-full border border-white/10 bg-white/5 text-white backdrop-blur-sm hover:bg-white/10 transition"
                  >
                    {style}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

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

                {offer.status === "pending" && (
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => handleOfferResponse(offer.id, "accepted")}
                      className="px-4 py-1 rounded bg-[#121212] hover:bg-neutral-500 hover:text-[#121212]! transition duration-300! ease-in-out  text-white! text-sm"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleOfferResponse(offer.id, "declined")}
                      className="px-4 py-1 rounded bg-[#121212] text-white hover:bg-neutral-500 hover:text-[#121212]! transition duration-300! ease-in-out text-sm"
                    >
                      Decline
                    </button>
                  </div>
                )}
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
          This will be visible to artists who match your vision
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
          Submit request
        </button>
      </section>

      {isModalOpen && selectedArtist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-[#121212]/60 transition-opacity duration-300 px-4">
          <div className="w-full max-w-[800px] max-h-[90vh] overflow-y-auto bg-[#121212]/80 text-white rounded-lg p-6 shadow-lg relative">
            <button
              onClick={() => {
                setIsModalOpen(false);
                setStep(1);
              }}
              className="absolute top-0 right-0 text-white text-xl"
            >
              <X />
            </button>

            {step === 1 && (
              <h2 className="text-2xl font-bold mb-6 text-neutral-400! mt-3">
                Tell <span className="text-white!">{selectedArtist.name}</span>{" "}
                what you need
              </h2>
            )}
            {step === 2 && (
              <h2 className="text-2xl font-bold mb-6">
                What's your availability?
              </h2>
            )}

            {step === 1 && (
              <div
                data-aos="fade-in"
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {/* LEFT COLUMN: Tattoo Details */}
                <div>
                  <textarea
                    required
                    className="w-full p-2 rounded bg-neutral-800 text-white mb-4"
                    placeholder="Describe your tattoo..."
                    value={modalData.description}
                    onChange={(e) =>
                      setModalData({
                        ...modalData,
                        description: e.target.value,
                      })
                    }
                  />
                  <input
                    type="text"
                    placeholder="Body Placement"
                    className="w-full p-2 rounded bg-neutral-800 text-white mb-4"
                    value={modalData.bodyPlacement}
                    onChange={(e) =>
                      setModalData({
                        ...modalData,
                        bodyPlacement: e.target.value,
                      })
                    }
                  />
                  <label className="text-sm text-white mb-1 block">Size</label>
                  <select
                    required
                    className="w-full p-2 rounded bg-neutral-800 text-white mb-4"
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
                </div>

                {/* RIGHT COLUMN: Reference Upload + Preview + Next Button */}
                <div className="flex flex-col justify-between">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Reference Image (optional)
                    </label>
                    <div className="relative mb-4">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setReferenceImage(file);
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      />
                      <div className="px-6 py-2 text-white border-2 border-neutral-500 hover:bg-neutral-300 rounded max-w-[200px]">
                        Upload reference
                      </div>
                    </div>

                    {referenceImage && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-300 mb-1">Preview:</p>
                        <img
                          src={URL.createObjectURL(referenceImage)}
                          alt="Preview"
                          className="w-32 h-32 object-cover rounded border border-neutral-600 mb-5"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end mt-auto">
                    <button
                      onClick={() => setStep(2)}
                      className="px-6 py-2 text-white border-2 border-neutral-500 hover:bg-neutral-300 hover:text-[#121212] hover:border-white rounded transition duration-300! ease-in-out"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <form
                data-aos="fade-in"
                onSubmit={handleModalSubmit}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {/* LEFT: Availability */}
                <div>
                  <label className="text-sm text-white mb-1 block">
                    Date Range
                  </label>
                  <div className="flex gap-2 mb-4">
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

                  <label className="text-sm text-white mb-2 block">
                    Time Range
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
                </div>

                {/* RIGHT: Available Days + Buttons */}
                <div>
                  <label className="text-sm text-white mb-2 block">
                    Available Days
                  </label>
                  <div className="flex flex-wrap gap-2 mb-6">
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

                  {/* Back & Submit */}
                  <div className="flex justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="w-full py-2 border border-white rounded"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="w-full py-2 bg-[#b6382d] text-white rounded"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
