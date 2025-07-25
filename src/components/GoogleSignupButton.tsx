// GoogleSignupButton.tsx
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { app } from "../firebase/firebaseConfig";
import google from "../assets/web_light_sq_SU.svg";

type GoogleSignupButtonProps = {
  role: "client" | "artist";
};

const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export const GoogleSignupButton = ({ role }: GoogleSignupButtonProps) => {
  const navigate = useNavigate();

  const handleGoogleSignup = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const baseData = {
          role,
          name: user.displayName || "",
          email: user.email || "",
          avatarUrl: user.photoURL || "",
          createdAt: serverTimestamp(),
          phoneNumber: user.phoneNumber || "",
        };

        if (role === "client") {
          await setDoc(userRef, {
            ...baseData,
            bio: "",
            location: "",
            likedArtists: [],
            savedPosts: [],
            messages: [],
            requestHistory: [],
            uploadGallery: [],
            profileComplete: false,
          });
          navigate("/client-profile-setup");
        } else if (role === "artist") {
          // We let the ArtistSignupPage finish creating full profile
          await setDoc(userRef, {
            avatarUrl: user.photoURL || "",
            bio: "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            displayName: user.displayName || "",
            email: user.email || "",
            featured: false,
            isVerified: false,
            phoneNumber: user.phoneNumber || "",
            portfolioUrls: [],
            profileComplete: false,
            role: "artist",
            shopId: "",
            socialLinks: {
              instagram: "",
              facebook: "",
              website: "",
            },
            specialties: [],
            likedBy: [],
          });

          // no redirect, the form will appear on the ArtistSignupPage
        }
      } else {
        const data = userSnap.data();
        const isComplete = data?.profileComplete ?? false;

        if (role === "client") {
          navigate(isComplete ? "/dashboard" : "/client-profile-setup");
        } else {
          // For artist, just remain on the page — ArtistSignupPage will render the form based on auth state
        }
      }
    } catch (error) {
      console.error("Google signup failed:", error);
    }
  };

  return (
    <button
      onClick={handleGoogleSignup}
      className="mx-auto flex items-center justify-center focus:outline-none hover:scale-105 transition duration-300 ease-in-out"
      style={{ height: "40px", width: "auto" }}
    >
      <img src={google} alt="Sign up with Google" className="h-10 w-auto" />
    </button>
  );
};
