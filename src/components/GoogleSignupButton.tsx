import { useState } from "react";
import {
  getAdditionalUserInfo,
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";
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
import { splitFullName } from "../utils/clientDisplayName";

type SignupRole = "client" | "artist";

type SignupButtonProps = {
  role: SignupRole;
};

type AuthProviderSignupButtonsProps = SignupButtonProps & {
  className?: string;
};

type ProfileRecord = Record<string, unknown>;

const auth = getAuth(app);
const db = getFirestore(app);

const getProfileValue = (profile: unknown, key: string) => {
  if (!profile || typeof profile !== "object") return "";
  const value = (profile as ProfileRecord)[key];
  return typeof value === "string" ? value.trim() : "";
};

const getCredentialDisplayName = (result: UserCredential) => {
  const googleProfile = result.user.providerData.find(
    (provider) => provider.providerId === "google.com"
  );
  const profile = getAdditionalUserInfo(result)?.profile;

  return (
    result.user.displayName ||
    googleProfile?.displayName ||
    getProfileValue(profile, "name") ||
    ""
  );
};

const createClientProfile = (role: SignupRole, result: UserCredential) => {
  const user = result.user;
  const providerDisplayName = getCredentialDisplayName(result);
  const providerName = splitFullName(providerDisplayName);
  const fullName = providerName.fullName || providerDisplayName || "";
  const baseData = {
    role,
    name: fullName,
    email: user.email || "",
    avatarUrl: user.photoURL || "",
    createdAt: serverTimestamp(),
    phoneNumber: user.phoneNumber || "",
  };

  return {
    ...baseData,
    firstName: providerName.firstName,
    lastName: providerName.lastName,
    displayName: fullName,
    bio: "",
    location: "",
    likedArtists: [],
    preferredStyles: [],
    interestCategories: [],
    interestTags: [],
    tattooGoals: [],
    budgetRange: "",
    timeframe: "",
    discoveryPreferences: {
      categories: [],
      tags: [],
      tattooGoals: [],
      budgetRange: "",
      timeframe: "",
      updatedAt: serverTimestamp(),
    },
    savedPosts: [],
    messages: [],
    requestHistory: [],
    uploadGallery: [],
    profileComplete: false,
  };
};

const createArtistProfile = (result: UserCredential) => {
  const user = result.user;
  const providerDisplayName = getCredentialDisplayName(result);

  return {
    avatarUrl: user.photoURL || "",
    bio: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    displayName: providerDisplayName,
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
  };
};

const useGoogleSignup = (role: SignupRole) => {
  const navigate = useNavigate();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignup = async () => {
    setIsSigningIn(true);

    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const userRef = doc(db, "users", result.user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        if (role === "client") {
          await setDoc(userRef, createClientProfile(role, result));
          navigate("/client-profile-setup");
          return;
        }

        await setDoc(userRef, createArtistProfile(result));
        return;
      }

      const data = userSnap.data();
      const isComplete = data?.profileComplete ?? false;

      if (role === "client") {
        navigate(isComplete ? "/dashboard" : "/client-profile-setup");
      }
    } catch (error) {
      console.error("Google signup failed:", error);
    } finally {
      setIsSigningIn(false);
    }
  };

  return { isSigningIn, handleGoogleSignup };
};

export const GoogleSignupButton = ({ role }: SignupButtonProps) => {
  const { isSigningIn, handleGoogleSignup } = useGoogleSignup(role);

  return (
    <button
      type="button"
      onClick={handleGoogleSignup}
      disabled={isSigningIn}
      className="mx-auto flex items-center justify-center transition duration-300 ease-in-out hover:scale-105 focus:outline-none disabled:pointer-events-none disabled:opacity-60"
      style={{ height: "40px", width: "auto" }}
      aria-label={isSigningIn ? "Signing up with Google" : "Sign up with Google"}
    >
      <img src={google} alt="Sign up with Google" className="h-10 w-auto" />
    </button>
  );
};

export const AuthProviderSignupButtons = ({
  role,
  className = "",
}: AuthProviderSignupButtonsProps) => {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <GoogleSignupButton role={role} />
    </div>
  );
};
