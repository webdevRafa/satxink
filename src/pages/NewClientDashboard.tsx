import { useState, useEffect } from "react";
import ClientSidebarNavigation from "../components/ClientSidebarNavigation";
import LikedArtistsList from "../components/LikedArtistsList";
import ClientOffersList from "../components/ClientOffersList";
import ClientConfirmedList from "../components/ClientConfirmedList";
import RequestTattooModal from "../components/RequestTattooModal";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import ClientRequestsList from "../components/ClientRequestsList";

const NewClientDashboard = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<any>(null);

  const [activeView, setActiveView] = useState<
    "liked" | "requests" | "offers" | "confirmed"
  >("liked");
  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
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
            {activeView === "confirmed" && (
              <ClientConfirmedList clientId={client.id} />
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
