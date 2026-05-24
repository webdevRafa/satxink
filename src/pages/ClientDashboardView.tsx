import { type ReactNode, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { CalendarCheck, Heart, Inbox, ReceiptText } from "lucide-react";
import ClientSidebarNavigation from "../components/ClientSidebarNavigation";
import LikedArtistsList from "../components/LikedArtistsList";
import ClientOffersList from "../components/ClientOffersList";
import ClientBookingsList from "../components/ClientBookingsList";
import RequestTattooModal from "../components/RequestTattooModal";
import { db, auth } from "../firebase/firebaseConfig";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import ClientRequestsList from "../components/ClientRequestsList";
import { syncGoogleAvatar } from "../utils/syncGoogleAvatar";

type ClientView = "liked" | "requests" | "offers" | "bookings";

const activeViewLabels: Record<ClientView, string> = {
  liked: "Liked artists",
  requests: "My requests",
  offers: "Offers",
  bookings: "Bookings",
};

const ClientDashboardView = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<any>(null);
  const [activeView, setActiveView] = useState<ClientView>("liked");
  const [client, setClient] = useState<any>(null);
  const [navCounts, setNavCounts] = useState<Record<ClientView, number>>({
    liked: 0,
    requests: 0,
    offers: 0,
    bookings: 0,
  });

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!user) {
        setClient(null);
        return;
      }

      if (user.providerData.some((provider) => provider.providerId === "google.com")) {
        await syncGoogleAvatar();
      }

      const ref = doc(db, "users", user.uid);
      unsubscribeProfile = onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : {};

        setClient({
          id: user.uid,
          ...data,
          name:
            data.name ||
            data.displayName ||
            user.displayName ||
            "Client",
          avatarUrl:
            data.avatarUrl ||
            user.photoURL ||
            "/default-avatar.png",
          likedArtists: Array.isArray(data.likedArtists) ? data.likedArtists : [],
        });
      });
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!client?.id) return;

    const updateCount = (key: ClientView, value: number) => {
      setNavCounts((current) => ({ ...current, [key]: value }));
    };

    updateCount("liked", Array.isArray(client.likedArtists) ? client.likedArtists.length : 0);

    const unsubs = [
      onSnapshot(
        query(
          collection(db, "bookingRequests"),
          where("clientId", "==", client.id),
          where("status", "==", "pending")
        ),
        (snap) => updateCount("requests", snap.size),
        (error) => console.error("Client request count listener failed:", error)
      ),
      onSnapshot(
        query(
          collection(db, "offers"),
          where("clientId", "==", client.id),
          where("status", "==", "pending")
        ),
        (snap) => updateCount("offers", snap.size),
        (error) => console.error("Client offer count listener failed:", error)
      ),
      onSnapshot(
        query(collection(db, "bookings"), where("clientId", "==", client.id)),
        (snap) => updateCount("bookings", snap.size),
        (error) => console.error("Client booking count listener failed:", error)
      ),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [client?.id, client?.likedArtists]);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#121212] pt-20 text-white md:flex-row">
      <ClientSidebarNavigation
        activeView={activeView}
        counts={navCounts}
        onViewChange={setActiveView}
      />

      <main className="flex-1 overflow-y-auto p-6">
        {client && (
          <section className="relative mx-auto mb-8 max-w-7xl overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-black/20 p-6 shadow-lg">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col items-center gap-5 text-center md:flex-row md:text-left">
                <div className="relative">
                  <img
                    src={client.avatarUrl || "/fallback-avatar.jpg"}
                    alt={client.name || "Client"}
                    className="h-28 w-28 rounded-full border border-white/10 object-cover shadow-lg md:h-32 md:w-32"
                  />
                  <span className="absolute bottom-2 right-1 rounded-full bg-black px-2 py-0.5 text-[10px] text-white ring-1 ring-white/10">
                    Client
                  </span>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    Client dashboard
                  </p>
                  <h1 className="mt-2 text-3xl! font-semibold text-white">
                    Welcome, {client.name || "client"}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-neutral-400">
                    Track offers, follow artists, manage requests, and book with
                    confidence.
                  </p>

                  {client.preferredStyles?.length > 0 && (
                    <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
                      {client.preferredStyles.map((style: string, index: number) => (
                        <span
                          key={`${style}-${index}`}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-200"
                        >
                          {style}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[560px]">
                <ClientMetric
                  icon={<Heart size={17} />}
                  label="Liked"
                  value={client.likedArtists?.length || 0}
                />
                <ClientMetric
                  icon={<Inbox size={17} />}
                  label="Viewing"
                  value={activeViewLabels[activeView]}
                />
                <ClientMetric icon={<ReceiptText size={17} />} label="Offers" value="Live" />
                <ClientMetric
                  icon={<CalendarCheck size={17} />}
                  label="Bookings"
                  value="Ready"
                />
              </div>
            </div>
          </section>
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
            {activeView === "requests" && <ClientRequestsList clientId={client.id} />}
            {activeView === "offers" && (
              <ClientOffersList
                clientId={client.id}
                onOfferResolved={(outcome) => {
                  setNavCounts((current) => ({
                    ...current,
                    offers: Math.max(current.offers - 1, 0),
                    bookings:
                      outcome === "accepted"
                        ? current.bookings + 1
                        : current.bookings,
                  }));
                }}
              />
            )}
            {activeView === "bookings" && <ClientBookingsList clientId={client.id} />}
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
          onRequestSent={() => {
            setNavCounts((current) => ({
              ...current,
              requests: current.requests + 1,
            }));
          }}
        />
      )}
    </div>
  );
};

const ClientMetric = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) => (
  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-neutral-500">
      {icon}
      {label}
    </div>
    <p className="mt-2 truncate text-lg font-semibold text-white">{value}</p>
  </div>
);

export default ClientDashboardView;
