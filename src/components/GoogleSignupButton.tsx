import { useState } from "react";
import {
  getAdditionalUserInfo,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  type AuthProvider,
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
import { FaApple } from "react-icons/fa";

import { app } from "../firebase/firebaseConfig";
import google from "../assets/web_light_sq_SU.svg";
import { splitFullName } from "../utils/clientDisplayName";

type SignupRole = "client" | "artist";
type SignupProviderId = "google" | "apple";

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

const getProfileNameObjectValue = (profile: unknown) => {
  if (!profile || typeof profile !== "object") return "";
  const name = (profile as ProfileRecord).name;
  if (!name || typeof name !== "object") return "";

  const nameRecord = name as ProfileRecord;
  const firstName =
    typeof nameRecord.firstName === "string" ? nameRecord.firstName.trim() : "";
  const lastName =
    typeof nameRecord.lastName === "string" ? nameRecord.lastName.trim() : "";

  return [firstName, lastName].filter(Boolean).join(" ");
};

const getCredentialDisplayName = (
  result: UserCredential,
  providerId: SignupProviderId
) => {
  const firebaseProviderId = providerId === "apple" ? "apple.com" : "google.com";
  const providerProfile = result.user.providerData.find(
    (provider) => provider.providerId === firebaseProviderId
  );
  const profile = getAdditionalUserInfo(result)?.profile;
  const givenName =
    getProfileValue(profile, "given_name") ||
    getProfileValue(profile, "first_name");
  const familyName =
    getProfileValue(profile, "family_name") ||
    getProfileValue(profile, "last_name");
  const profileFullName = [givenName, familyName].filter(Boolean).join(" ");

  return (
    result.user.displayName ||
    providerProfile?.displayName ||
    getProfileValue(profile, "name") ||
    getProfileNameObjectValue(profile) ||
    profileFullName ||
    ""
  );
};

const createSignupProvider = (providerId: SignupProviderId): AuthProvider => {
  if (providerId === "apple") {
    const appleProvider = new OAuthProvider("apple.com");
    appleProvider.addScope("email");
    appleProvider.addScope("name");
    return appleProvider;
  }

  return new GoogleAuthProvider();
};

const createClientProfile = (
  role: SignupRole,
  result: UserCredential,
  providerId: SignupProviderId
) => {
  const user = result.user;
  const providerDisplayName = getCredentialDisplayName(result, providerId);
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

const createArtistProfile = (
  result: UserCredential,
  providerId: SignupProviderId
) => {
  const user = result.user;
  const providerDisplayName = getCredentialDisplayName(result, providerId);

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

const useProviderSignup = (role: SignupRole) => {
  const navigate = useNavigate();
  const [activeProvider, setActiveProvider] =
    useState<SignupProviderId | null>(null);

  const handleProviderSignup = async (providerId: SignupProviderId) => {
    setActiveProvider(providerId);

    try {
      const result = await signInWithPopup(auth, createSignupProvider(providerId));
      const userRef = doc(db, "users", result.user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        if (role === "client") {
          await setDoc(userRef, createClientProfile(role, result, providerId));
          navigate("/client-profile-setup");
          return;
        }

        await setDoc(userRef, createArtistProfile(result, providerId));
        return;
      }

      const data = userSnap.data();
      const isComplete = data?.profileComplete ?? false;

      if (role === "client") {
        navigate(isComplete ? "/dashboard" : "/client-profile-setup");
      }
    } catch (error) {
      console.error(`${providerId} signup failed:`, error);
    } finally {
      setActiveProvider(null);
    }
  };

  return { activeProvider, handleProviderSignup };
};

export const GoogleSignupButton = ({ role }: SignupButtonProps) => {
  const { activeProvider, handleProviderSignup } = useProviderSignup(role);
  const isLoading = activeProvider === "google";

  return (
    <button
      type="button"
      onClick={() => handleProviderSignup("google")}
      disabled={activeProvider !== null}
      className="mx-auto flex items-center justify-center transition duration-300 ease-in-out hover:scale-105 focus:outline-none disabled:pointer-events-none disabled:opacity-60"
      style={{ height: "40px", width: "auto" }}
      aria-label={isLoading ? "Signing up with Google" : "Sign up with Google"}
    >
      <img src={google} alt="Sign up with Google" className="h-10 w-auto" />
    </button>
  );
};

export const AuthProviderSignupButtons = ({
  role,
  className = "",
}: AuthProviderSignupButtonsProps) => {
  const { activeProvider, handleProviderSignup } = useProviderSignup(role);
  const isAppleLoading = activeProvider === "apple";

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 sm:flex-row ${className}`}
    >
      <button
        type="button"
        onClick={() => handleProviderSignup("google")}
        disabled={activeProvider !== null}
        className="flex items-center justify-center transition duration-300 ease-in-out hover:scale-105 focus:outline-none disabled:pointer-events-none disabled:opacity-60"
        style={{ height: "40px", width: "auto" }}
        aria-label="Sign up with Google"
      >
        <img src={google} alt="Sign up with Google" className="h-10 w-auto" />
      </button>

      <button
        type="button"
        onClick={() => handleProviderSignup("apple")}
        disabled={activeProvider !== null}
        className="inline-flex h-10! min-w-[191px] items-center justify-center gap-2 rounded-[4px] border border-white/80 bg-white px-4! py-0! text-sm! font-semibold text-[#0b0b0b] shadow-sm shadow-black/20 transition duration-300 ease-in-out hover:scale-105 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:pointer-events-none disabled:opacity-60"
        aria-label={isAppleLoading ? "Signing up with Apple" : "Sign up with Apple"}
      >
        <FaApple size={19} aria-hidden="true" />
        <span>{isAppleLoading ? "Opening Apple..." : "Sign up with Apple"}</span>
      </button>
    </div>
  );
};
