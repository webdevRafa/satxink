import { useState } from "react";
import { FirebaseError } from "firebase/app";
import {
  getAdditionalUserInfo,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
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
import { toast } from "react-hot-toast";
import { LoaderCircle } from "lucide-react";
import { FaApple } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import type { IconType } from "react-icons";

import { app } from "../firebase/firebaseConfig";
import { splitFullName } from "../utils/clientDisplayName";

type SignupRole = "client" | "artist";
type AuthProviderKey = "google" | "apple";
type AuthButtonAction = "signup" | "signin";

type SignupButtonProps = {
  role: SignupRole;
};

type AuthProviderSignupButtonsProps = SignupButtonProps & {
  className?: string;
};

type AuthProviderSignInButtonsProps = {
  className?: string;
  compact?: boolean;
  onComplete?: () => void;
};

type ProfileRecord = Record<string, unknown>;

type AuthProviderMeta = {
  key: AuthProviderKey;
  providerId: string;
  name: string;
  icon: IconType;
};

const auth = getAuth(app);
const db = getFirestore(app);

const AUTH_PROVIDER_ORDER: AuthProviderKey[] = ["google", "apple"];

const AUTH_PROVIDER_META: Record<AuthProviderKey, AuthProviderMeta> = {
  google: {
    key: "google",
    providerId: "google.com",
    name: "Google",
    icon: FcGoogle,
  },
  apple: {
    key: "apple",
    providerId: "apple.com",
    name: "Apple",
    icon: FaApple,
  },
};

const getProfileValue = (profile: unknown, key: string) => {
  if (!profile || typeof profile !== "object") return "";
  const value = (profile as ProfileRecord)[key];
  return typeof value === "string" ? value.trim() : "";
};

const getObjectNamePart = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== "object") return "";
  const record = value as ProfileRecord;

  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
};

const getProfileDisplayName = (profile: unknown) => {
  const directName =
    getProfileValue(profile, "name") || getProfileValue(profile, "displayName");
  if (directName) return directName;

  if (!profile || typeof profile !== "object") return "";

  const profileRecord = profile as ProfileRecord;
  const nestedName = profileRecord.name;
  const firstName =
    getObjectNamePart(nestedName, ["firstName", "givenName", "given_name"]) ||
    getProfileValue(profile, "firstName") ||
    getProfileValue(profile, "givenName") ||
    getProfileValue(profile, "given_name");
  const lastName =
    getObjectNamePart(nestedName, ["lastName", "familyName", "family_name"]) ||
    getProfileValue(profile, "lastName") ||
    getProfileValue(profile, "familyName") ||
    getProfileValue(profile, "family_name");

  return [firstName, lastName].filter(Boolean).join(" ").trim();
};

const createPopupProvider = (providerKey: AuthProviderKey) => {
  if (providerKey === "apple") {
    const provider = new OAuthProvider(AUTH_PROVIDER_META.apple.providerId);
    provider.addScope("email");
    provider.addScope("name");
    return provider;
  }

  return new GoogleAuthProvider();
};

const getCredentialDisplayName = (result: UserCredential) => {
  const additionalInfo = getAdditionalUserInfo(result);
  const providerId =
    additionalInfo?.providerId ||
    result.providerId ||
    result.user.providerData[0]?.providerId ||
    "";
  const providerProfile = result.user.providerData.find(
    (provider) => provider.providerId === providerId
  );
  const profileDisplayName = getProfileDisplayName(additionalInfo?.profile);

  return (
    result.user.displayName ||
    providerProfile?.displayName ||
    profileDisplayName ||
    ""
  );
};

const getAuthErrorMessage = (error: unknown) => {
  if (!(error instanceof FirebaseError)) {
    return "Sign-in failed. Please try again.";
  }

  switch (error.code) {
    case "auth/account-exists-with-different-credential":
      return "That email is already connected to a different sign-in method. Try the provider you used before.";
    case "auth/operation-not-allowed":
      return "This sign-in provider is not enabled yet. Check the Firebase auth settings.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized for that sign-in provider yet.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups for SATX Ink and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    default:
      return "Sign-in failed. Please try again.";
  }
};

const reportAuthError = (error: unknown, context: string) => {
  console.error(`${context} failed:`, error);
  const message = getAuthErrorMessage(error);
  if (message) toast.error(message);
};

const signInWithSatxProvider = (providerKey: AuthProviderKey) =>
  signInWithPopup(auth, createPopupProvider(providerKey));

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
    paymentType: "internal",
    externalPaymentMethods: [],
    externalPaymentDetails: null,
    depositPolicy: {
      amount: 0,
      depositRequired: true,
      nonRefundable: true,
    },
    finalPaymentTiming: "before",
    finalPaymentDeadlineHours: 24,
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

const ProviderAuthButton = ({
  action,
  activeProvider,
  compact = false,
  disabled,
  onClick,
  providerKey,
}: {
  action: AuthButtonAction;
  activeProvider: AuthProviderKey | null;
  compact?: boolean;
  disabled?: boolean;
  onClick: (providerKey: AuthProviderKey) => void;
  providerKey: AuthProviderKey;
}) => {
  const meta = AUTH_PROVIDER_META[providerKey];
  const Icon = meta.icon;
  const isBusy = activeProvider === providerKey;
  const buttonLabel =
    action === "signup"
      ? `Sign up with ${meta.name}`
      : `Continue with ${meta.name}`;
  const busyLabel =
    action === "signup"
      ? `Signing up with ${meta.name}`
      : `Signing in with ${meta.name}`;

  return (
    <button
      type="button"
      onClick={() => onClick(providerKey)}
      disabled={disabled}
      className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/35 disabled:pointer-events-none disabled:opacity-55 ${
        compact ? "w-full justify-start" : "w-full justify-center sm:w-[210px]"
      } ${
        providerKey === "apple"
          ? "border-white/20 bg-[#050505] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-[#161616]"
          : "border-[#747775] bg-white text-[#1f1f1f] hover:bg-neutral-100"
      }`}
      aria-label={isBusy ? busyLabel : buttonLabel}
    >
      {isBusy ? (
        <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
      ) : (
        <Icon size={19} aria-hidden="true" />
      )}
      <span className="truncate">{isBusy ? busyLabel : buttonLabel}</span>
    </button>
  );
};

const useAuthProviderSignup = (role: SignupRole) => {
  const navigate = useNavigate();
  const [activeProvider, setActiveProvider] = useState<AuthProviderKey | null>(
    null
  );

  const handleProviderSignup = async (providerKey: AuthProviderKey) => {
    setActiveProvider(providerKey);

    try {
      const result = await signInWithSatxProvider(providerKey);
      const userRef = doc(db, "users", result.user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        toast.success("Welcome back");
        navigate("/dashboard");
        return;
      }

      if (role === "client") {
        await setDoc(userRef, createClientProfile(role, result));
        navigate("/client-profile-setup");
        return;
      }

      await setDoc(userRef, createArtistProfile(result));
    } catch (error) {
      reportAuthError(error, `${AUTH_PROVIDER_META[providerKey].name} signup`);
    } finally {
      setActiveProvider(null);
    }
  };

  return { activeProvider, handleProviderSignup };
};

export const GoogleSignupButton = ({ role }: SignupButtonProps) => {
  const { activeProvider, handleProviderSignup } = useAuthProviderSignup(role);

  return (
    <ProviderAuthButton
      action="signup"
      activeProvider={activeProvider}
      disabled={Boolean(activeProvider)}
      onClick={handleProviderSignup}
      providerKey="google"
    />
  );
};

export const AppleSignupButton = ({ role }: SignupButtonProps) => {
  const { activeProvider, handleProviderSignup } = useAuthProviderSignup(role);

  return (
    <ProviderAuthButton
      action="signup"
      activeProvider={activeProvider}
      disabled={Boolean(activeProvider)}
      onClick={handleProviderSignup}
      providerKey="apple"
    />
  );
};

export const AuthProviderSignupButtons = ({
  role,
  className = "",
}: AuthProviderSignupButtonsProps) => {
  const { activeProvider, handleProviderSignup } = useAuthProviderSignup(role);

  return (
    <div
      className={`mx-auto flex w-full max-w-[450px] flex-col items-center justify-center gap-3 sm:flex-row ${className}`}
    >
      {AUTH_PROVIDER_ORDER.map((providerKey) => (
        <ProviderAuthButton
          key={providerKey}
          action="signup"
          activeProvider={activeProvider}
          disabled={Boolean(activeProvider)}
          onClick={handleProviderSignup}
          providerKey={providerKey}
        />
      ))}
    </div>
  );
};

export const AuthProviderSignInButtons = ({
  className = "",
  compact = true,
  onComplete,
}: AuthProviderSignInButtonsProps) => {
  const navigate = useNavigate();
  const [activeProvider, setActiveProvider] = useState<AuthProviderKey | null>(
    null
  );

  const handleProviderSignIn = async (providerKey: AuthProviderKey) => {
    setActiveProvider(providerKey);

    try {
      const result = await signInWithSatxProvider(providerKey);
      const userRef = doc(db, "users", result.user.uid);
      const userSnap = await getDoc(userRef);

      onComplete?.();
      navigate(userSnap.exists() ? "/dashboard" : "/signup");
    } catch (error) {
      reportAuthError(error, `${AUTH_PROVIDER_META[providerKey].name} sign-in`);
    } finally {
      setActiveProvider(null);
    }
  };

  return (
    <div className={`grid gap-2 ${className}`}>
      {AUTH_PROVIDER_ORDER.map((providerKey) => (
        <ProviderAuthButton
          key={providerKey}
          action="signin"
          activeProvider={activeProvider}
          compact={compact}
          disabled={Boolean(activeProvider)}
          onClick={handleProviderSignIn}
          providerKey={providerKey}
        />
      ))}
    </div>
  );
};
