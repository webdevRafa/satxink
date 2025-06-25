// pages/DashboardRedirectPage.tsx
import { useEffect } from "react";
import { getAuth } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useNavigate } from "react-router-dom";
import Spinner from "../components/ui/Spinner";

const DashboardRedirectPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkUserRole = async () => {
      const user = getAuth().currentUser;
      if (!user) {
        navigate("/login-page");
        return;
      }

      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      const data = snap.data();

      if (!data?.role) {
        navigate("/login-page");
      } else if (data.role === "artist") {
        navigate("/artist-dashboard");
      } else {
        navigate("/client-dashboard");
      }
    };

    checkUserRole();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner /> {/* your own Spinner component */}
    </div>
  );
};

export default DashboardRedirectPage;
