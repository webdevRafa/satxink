import { useState, useEffect } from "react";
import ClientSidebarNavigation from "../components/ClientSidebarNavigation";
import LikedArtistsList from "../components/LikedArtistsList";
import ClientOffersList from "../components/ClientOffersList";
import ClientBookingsList from "../components/ClientBookingsList";
import RequestTattooModal from "../components/RequestTattooModal";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import ClientRequestsList from "../components/ClientRequestsList";
import { syncGoogleAvatar } from "../utils/syncGoogleAvatar";

const NewClientDashboard = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<any>(null);

  const [activeView, setActiveView] = useState<
    "liked" | "requests" | "offers" | "bookings"
  >("liked");
  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Sync avatar only for Google logins
        if (user.providerData.some((p) => p.providerId === "google.com")) {
          await syncGoogleAvatar();
        }

        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) setClient({ id: user.uid, ...snap.data() });
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#121212] text-white pt-20">
      <ClientSidebarNavigation
        activeView={activeView}
        onViewChange={(view) => setActiveView(view)}
      />

      <main className="flex-1 overflow-y-auto p-6">
        {client && (
          <div className="relative bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#1a1a1a] rounded-xl p-6 shadow-lg max-w-6xl mx-auto mb-10">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
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
                <h1 className="text-3xl! font-bold text-white">
                  Welcome, {client.name}
                </h1>
                <p className="text-gray-400 italic">
                  Here’s your dashboard — track offers, find artists, and book
                  with confidence.
                </p>

                {/* Preferred Styles */}
                {client.preferredStyles &&
                  client.preferredStyles.length > 0 && (
                    <div className="mt-6">
                      <h2 className="text-sm! font-light! text-white mb-2">
                        My Preferred Styles
                      </h2>
                      <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                        {client.preferredStyles.map(
                          (style: string, index: number) => (
                            <span
                              key={index}
                              className="px-3 py-1 text-sm rounded-full border border-white/10 bg-white/5 text-white backdrop-blur-sm hover:bg-white/10 transition"
                            >
                              {style}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}

        {client && (
          <>
            {activeView === "liked" && (
              <LikedArtistsList
                client={client}
                onRequest={(artist) => {
                  setSelectedArtist(artist);
                  setIsModalOpen(true);
                }}
              />
            )}
            {activeView === "requests" && (
              <ClientRequestsList clientId={client.id} />
            )}
            {activeView === "offers" && (
              <ClientOffersList clientId={client.id} />
            )}
            {activeView === "bookings" && (
              <ClientBookingsList clientId={client.id} />
            )}
          </>
        )}
      </main>
      {client && selectedArtist && (
        <RequestTattooModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedArtist(null);
          }}
          client={client}
          artist={selectedArtist}
        />
      )}
    </div>
  );
};

export default NewClientDashboard;
