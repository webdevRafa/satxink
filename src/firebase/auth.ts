import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebaseConfig"; // adjust path if needed

const auth = getAuth();

// 🔐 Google Sign In — shared by both artist & client
export const signInWithGoogle = async (navigate: (path: string) => void) => {
  try {
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    const user = result.user;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // 👇 No user profile exists — send to client signup (can improve later)
      console.warn("No Firestore profile found. Redirecting to signup.");
      navigate("/signup/client");
      return;
    }

    // ✅ Profile exists — go to dashboard
    navigate("/dashboard");
  } catch (error) {
    console.error("Google sign-in error:", error);
    // Optionally: show toast or set error state
  }
};

// 🚪 Logout with redirect to home
export const signOutUser = async (navigate: (path: string) => void) => {
  try {
    await signOut(auth);
    console.log("User signed out.");
    navigate("/");
  } catch (error) {
    console.error("Sign-out error:", error);
  }
};

// 📡 Auth state listener (optional utility)
export const observeUser = (callback: (user: any) => void) => {
  return onAuthStateChanged(auth, callback);
};

export { auth };
