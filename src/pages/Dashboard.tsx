import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

import ArtistDashboardView from "../pages/ArtistDashboardView";
import ClientDashboardView from "../pages/ClientDashboardView";
import ShopDashboardView from "../pages/ShopDashboardView";

type DashboardUser = {
  id: string;
  role?: string;
  shopOwnerShopIds?: string[];
  [key: string]: unknown;
};

const Dashboard = () => {
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userAuth) => {
      if (userAuth) {
        const snap = await getDoc(doc(db, "users", userAuth.uid));
        if (snap.exists()) {
          setUser({ id: userAuth.uid, ...snap.data() });
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-white">
        Loading your dashboard...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen text-white">
        Please log in to view your dashboard.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      {user.role === "shop_owner" ? (
        <ShopDashboardView />
      ) : user.role === "artist" && hasOwnedShops(user) ? (
        <ArtistShopDashboardSwitch />
      ) : user.role === "artist" ? (
        <ArtistDashboardView />
      ) : (
        <ClientDashboardView />
      )}
    </div>
  );
};

const ArtistShopDashboardSwitch = () => {
  const [mode, setMode] = useState<"artist" | "shop">("artist");

  return (
    <div>
      <div className="fixed bottom-5 right-5 z-[80] rounded-lg border border-white/10 bg-[#111111]/95 p-1 shadow-2xl backdrop-blur">
        {(["artist", "shop"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            className={`rounded-md px-4! py-2! text-xs! font-semibold capitalize transition ${
              mode === item
                ? "bg-white text-black"
                : "text-neutral-300 hover:bg-white/10"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      {mode === "artist" ? <ArtistDashboardView /> : <ShopDashboardView />}
    </div>
  );
};

const hasOwnedShops = (user: DashboardUser) =>
  Array.isArray(user.shopOwnerShopIds) && user.shopOwnerShopIds.length > 0;

export default Dashboard;
