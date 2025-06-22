// components/GoogleSignupButton.tsx
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { app } from "../firebase/firebaseConfig"; // adjust path as needed

const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export const GoogleSignupButton = () => {
  const navigate = useNavigate();

  const handleGoogleSignup = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const clientData = {
          role: "client",
          name: user.displayName || "",
          email: user.email || "",
          avatarUrl: user.photoURL || "",
          bio: "",
          location: "",
          createdAt: serverTimestamp(),
          likedArtists: [],
          savedPosts: [],
          messages: [],
          requestHistory: [],
          uploadGallery: [],
          phoneNumber: user.phoneNumber || "",
          profileComplete: false,
        };

        await setDoc(userRef, clientData);
        console.log("Client profile created!");
        navigate("/client-profile-setup");
      } else {
        const data = userSnap.data();
        const isComplete = data?.profileComplete ?? false;

        if (!isComplete) {
          navigate("/client-profile-setup");
        } else {
          navigate("/dashboard");
        }
      }

      // redirect or show success
    } catch (error) {
      console.error("Google signup failed:", error);
    }
  };

  return (
    <button
      onClick={handleGoogleSignup}
      className="bg-[#b6382d] text-white px-6 py-3 rounded-lg hover:bg-[#b6542d] transition"
    >
      Sign up with Google
    </button>
  );
};
