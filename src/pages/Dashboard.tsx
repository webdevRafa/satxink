import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

import ArtistDashboardView from "../pages/ArtistDashboardView";
import ClientDashboardView from "../pages/ClientDashboardView";

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
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
      {user.role === "artist" ? (
        <ArtistDashboardView />
      ) : (
        <ClientDashboardView />
      )}
    </div>
  );
};

export default Dashboard;
