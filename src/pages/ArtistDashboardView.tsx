import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import CalendarSyncPanel from "../components/CalendarSyncPanel";
import { toast } from "react-hot-toast";
import slugify from "slugify";
import { FaFacebook } from "react-icons/fa";
import { RiInstagramFill } from "react-icons/ri";
import {
  CalendarDays,
  Camera,
  Check,
  CreditCard,
  DollarSign,
  Eye,
  Globe,
  Image as ImageIcon,
  Instagram,
  LoaderCircle,
  Mail,
  MapPin,
  MessageSquareText,
  ReceiptText,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  X,
} from "lucide-react";

import { db, auth, storage, functions } from "../firebase/firebaseConfig";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  setDoc,
  arrayUnion,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import SidebarNavigation from "../components/SidebarNavigation";
import ImageCropperModal from "../components/ImageCropperModal";
import BookingRequestsList from "../components/BookingRequestsList";
import MakeOfferModal from "../components/MakeOfferModal";
import OffersList from "../components/OffersList";
import FlashManager from "../components/FlashManager";
import GalleryManager from "../components/GalleryManager";
import StripeConnectPanel from "../components/StripeConnectPanel";
import AnimatedTagInput from "../components/ui/AnimatedTagInput";
import AddSessionsAmendmentDialog from "../components/AddSessionsAmendmentDialog";
import ProjectControlsPanel from "../components/ProjectControlsPanel";
import ProjectPauseDialog from "../components/ProjectPauseDialog";
import ProjectScheduleProposalDialog from "../components/ProjectScheduleProposalDialog";
import SessionPaymentRequestDialog from "../components/SessionPaymentRequestDialog";
import type { Booking, ProjectAmendment } from "../types/Booking";
import type { Artist } from "../types/Artist";
import type { FinalPaymentDeadlineHours } from "../types/PaymentPreferences";
import {
  TATTOO_STYLES,
  getCanonicalTattooStyles,
  getTattooStyleLabel,
} from "../types/TattooStyle";
import {
  getClientFirstName,
  getClientNameParts,
  getFullClientNameTitle,
} from "../utils/clientDisplayName";
import {
  formatBookingMonthLabel,
  getRollingBookingMonthOptions,
  normalizeBookingMonthKeys,
  type BookingAvailability,
} from "../utils/bookingAvailability";

const SPECIALTY_OPTIONS = TATTOO_STYLES;

type PaymentType = "internal" | "external";
type FinalPaymentTiming = "before" | "after";
type DisplayNameStatus = "idle" | "checking" | "available" | "taken";
type ArtistProfileSubTab =
  | "identity"
  | "spotlight"
  | "specialties"
  | "availability";
type BookingSortMode = "upcoming" | "newest" | "oldest";
type SessionReadinessFilter =
  | "all"
  | "ready"
  | "needs_schedule"
  | "follow_up"
  | "paused";
type BookingStatusFilter =
  | "all"
  | "pending"
  | "confirmed"
  | "paid"
  | "cancelled";
type ArtistDashboardTab =
  | "requests"
  | "profile"
  | "offers"
  | "bookings"
  | "sessions"
  | "projects"
  | "pending"
  | "confirmed"
  | "paid"
  | "cancelled"
  | "calendar"
  | "flashes"
  | "gallery"
  | "payments";

const FINAL_PAYMENT_DEADLINE_OPTIONS: Array<{
  hours: FinalPaymentDeadlineHours;
  label: string;
}> = [
  { hours: 24, label: "24 hours before" },
  { hours: 48, label: "48 hours before" },
];

type HomepageFeatureFormState = {
  story: string;
  quote: string;
  imageUrl: string;
  imageAlt: string;
  images: HomepageFeatureImage[];
};

type HomepageFeatureImage = {
  id: string;
  imageUrl: string;
  thumbUrl?: string;
  webp90Url?: string;
  fullUrl?: string;
  imageAlt?: string;
  thumbPath?: string;
  previewPath?: string;
  fullPath?: string;
  fileName?: string;
  order?: number;
};

const HOMEPAGE_FEATURE_IMAGE_LIMIT = 4;

const BOOKING_STATUS_FILTERS: {
  label: string;
  value: BookingStatusFilter;
}[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Paid", value: "paid" },
  { label: "Cancelled", value: "cancelled" },
];

const BOOKING_ROUTE_FILTERS: BookingStatusFilter[] = [
  "pending",
  "confirmed",
  "paid",
  "cancelled",
];

const SESSION_READINESS_FILTERS: {
  label: string;
  value: SessionReadinessFilter;
}[] = [
  { label: "All", value: "all" },
  { label: "Ready to start", value: "ready" },
  { label: "Needs date", value: "needs_schedule" },
  { label: "Follow-up", value: "follow_up" },
  { label: "Paused", value: "paused" },
];

const PROFILE_SETTING_TABS: {
  label: string;
  value: ArtistProfileSubTab;
}[] = [
  { label: "Identity", value: "identity" },
  { label: "Spotlight", value: "spotlight" },
  { label: "Specialties", value: "specialties" },
  { label: "Availability", value: "availability" },
];

const getPrimaryAccountProviderId = (
  providerData: { providerId: string }[] = []
) =>
  providerData.find((provider) => provider.providerId === "apple.com")
    ?.providerId ||
  providerData.find((provider) => provider.providerId === "google.com")
    ?.providerId ||
  providerData[0]?.providerId ||
  "";

const getAccountProviderCopy = (providerId: string) => {
  if (providerId === "apple.com") {
    return {
      accountLabel: "Apple account",
      fallbackEmailLabel: "Signed in with Apple",
      managedLabel: "Managed by Apple",
    };
  }

  if (providerId === "google.com") {
    return {
      accountLabel: "Google account",
      fallbackEmailLabel: "Signed in with Google",
      managedLabel: "Managed by Google",
    };
  }

  return {
    accountLabel: "Connected account",
    fallbackEmailLabel: "Signed in securely",
    managedLabel: "Managed by sign-in provider",
  };
};

const PROJECT_PAYMENT_FOLLOW_UP_STATUSES = [
  "due",
  "disputed",
  "artist_confirmed",
  "client_confirmed",
];

const isBookingRouteFilter = (
  tab: string | null
): tab is Exclude<BookingStatusFilter, "all"> =>
  BOOKING_ROUTE_FILTERS.includes(tab as BookingStatusFilter);

const getInitialDashboardTab = (tab: string | null): ArtistDashboardTab =>
  isBookingRouteFilter(tab) ? "bookings" : getArtistDashboardTab(tab);

const getInitialBookingStatusFilter = (
  tab: string | null
): BookingStatusFilter => (isBookingRouteFilter(tab) ? tab : "all");

type ArtistProfileFormState = {
  displayName: string;
  avatarUrl: string;
  bio: string;
  specialties: string[];
  bookingAvailability: {
    monthKeys: string[];
  };
  socialLinks: {
    instagram: string;
    facebook: string;
    website: string;
  };
  homepageFeature: HomepageFeatureFormState;
};

type ArtistPaymentPreferencesFormState = {
  finalPaymentTiming: FinalPaymentTiming;
  finalPaymentDeadlineHours: FinalPaymentDeadlineHours;
};

type DashboardArtist = {
  id?: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string;
  email?: string;
  bio?: string;
  specialties?: string[];
  studioName?: string;
  shopName?: string;
  shopMapLink?: string;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    website?: string;
  };
  slug?: string;
  calendarToken?: string;
  shopId?: string;
  stripeConnect?: Artist["stripeConnect"];
  paymentType?: PaymentType;
  finalPaymentTiming?: FinalPaymentTiming;
  finalPaymentDeadlineHours?: FinalPaymentDeadlineHours | null;
  bookingAvailability?: BookingAvailability;
  homepageFeature?: Partial<HomepageFeatureFormState> & {
    updatedAt?: unknown;
  };
  depositPolicy?: {
    amount?: number;
    depositRequired?: boolean;
    nonRefundable?: boolean;
  };
};

type DashboardBookingRequest = {
  id: string;
  clientId: string;
  clientFirstName?: string;
  clientLastName?: string;
  clientName: string;
  clientAvatar: string;
  description: string;
  preferredDateRange?: string[];
  bodyPlacement: string;
  size: "small" | "medium" | "large" | "Small" | "Medium" | "Large" | string;
  fullUrl?: string;
  thumbUrl?: string;
  budget?: string | number;
};

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const INSTAGRAM_PROFILE_BASE = "https://instagram.com/";

const getInstagramHandle = (value: string) => {
  const withoutDomain = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^(www\.)?instagram\.com\//i, "");
  const pathOnly = withoutDomain.replace(/^@+/, "").replace(/^\/+/, "");

  return pathOnly.split(/[/?#]/)[0].replace(/[^a-zA-Z0-9._]/g, "");
};

const getInstagramUrlFromHandle = (handle: string) =>
  handle ? `${INSTAGRAM_PROFILE_BASE}${handle}` : "";

const getHomepageFeatureImageUrl = (image?: HomepageFeatureImage | null) =>
  image?.webp90Url || image?.imageUrl || image?.fullUrl || image?.thumbUrl || "";

const normalizeHomepageFeatureImage = (
  value: unknown,
  fallbackAlt = ""
): HomepageFeatureImage | null => {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const imageUrl =
    typeof record.imageUrl === "string"
      ? record.imageUrl
      : typeof record.webp90Url === "string"
        ? record.webp90Url
        : typeof record.fullUrl === "string"
          ? record.fullUrl
          : typeof record.thumbUrl === "string"
            ? record.thumbUrl
            : "";

  if (!imageUrl) return null;

  return {
    id:
      typeof record.id === "string" && record.id
        ? record.id
        : `feature-${Math.random().toString(36).slice(2)}`,
    imageUrl,
    thumbUrl: typeof record.thumbUrl === "string" ? record.thumbUrl : undefined,
    webp90Url:
      typeof record.webp90Url === "string" ? record.webp90Url : undefined,
    fullUrl: typeof record.fullUrl === "string" ? record.fullUrl : undefined,
    imageAlt:
      typeof record.imageAlt === "string" ? record.imageAlt : fallbackAlt,
    thumbPath:
      typeof record.thumbPath === "string" ? record.thumbPath : undefined,
    previewPath:
      typeof record.previewPath === "string" ? record.previewPath : undefined,
    fullPath: typeof record.fullPath === "string" ? record.fullPath : undefined,
    fileName: typeof record.fileName === "string" ? record.fileName : undefined,
    order: typeof record.order === "number" ? record.order : undefined,
  };
};

const normalizeHomepageFeatureImages = (
  homepageFeature: DashboardArtist["homepageFeature"],
  fallbackAlt = ""
) => {
  const imageRecords = Array.isArray(homepageFeature?.images)
    ? homepageFeature.images
    : [];
  const images = imageRecords
    .map((image) => normalizeHomepageFeatureImage(image, fallbackAlt))
    .filter((image): image is HomepageFeatureImage => Boolean(image))
    .slice(0, HOMEPAGE_FEATURE_IMAGE_LIMIT);

  if (images.length > 0) return images;

  if (homepageFeature?.imageUrl) {
    return [
      {
        id: "legacy-feature-image",
        imageUrl: homepageFeature.imageUrl,
        imageAlt: homepageFeature.imageAlt || fallbackAlt,
      },
    ];
  }

  return [];
};

const wait = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const waitForStorageUrl = async (
  storagePath: string,
  attempts = 24,
  intervalMs = 1000
) => {
  const storageRef = ref(storage, storagePath);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getDownloadURL(storageRef);
    } catch {
      await wait(intervalMs);
    }
  }

  throw new Error(`Processed image was not ready: ${storagePath}`);
};

const getArtistDashboardTab = (tab: string | null): ArtistDashboardTab =>
  [
    "requests",
    "profile",
    "offers",
    "bookings",
    "sessions",
    "projects",
    "pending",
    "confirmed",
    "paid",
    "cancelled",
    "calendar",
    "flashes",
    "gallery",
    "payments",
  ].includes(tab || "")
    ? (tab as ArtistDashboardTab)
    : "requests";

const isArtistDashboardTab = (tab: string | null): tab is ArtistDashboardTab =>
  [
    "requests",
    "profile",
    "offers",
    "bookings",
    "sessions",
    "projects",
    "pending",
    "confirmed",
    "paid",
    "cancelled",
    "calendar",
    "flashes",
    "gallery",
    "payments",
  ].includes(tab || "");

const MOBILE_DASHBOARD_CONTENT_SCROLL_OFFSET = 154;

const createProfileFormState = (
  artist: DashboardArtist | null
): ArtistProfileFormState => {
  const displayName = artist?.displayName || artist?.name || "";
  const homepageFeatureImages = normalizeHomepageFeatureImages(
    artist?.homepageFeature,
    displayName
  );
  const primaryHomepageImage = homepageFeatureImages[0];

  return {
    displayName,
    avatarUrl: artist?.avatarUrl || "",
    bio: artist?.bio || "",
    specialties: getCanonicalTattooStyles(artist?.specialties),
    bookingAvailability: {
      monthKeys: normalizeBookingMonthKeys(
        artist?.bookingAvailability?.monthKeys
      ),
    },
    socialLinks: {
      instagram: artist?.socialLinks?.instagram || "",
      facebook: artist?.socialLinks?.facebook || "",
      website:
        (artist?.socialLinks as { website?: string } | undefined)?.website ||
        "",
    },
    homepageFeature: {
      story: artist?.homepageFeature?.story || artist?.bio || "",
      quote: artist?.homepageFeature?.quote || "",
      imageUrl:
        getHomepageFeatureImageUrl(primaryHomepageImage) ||
        artist?.homepageFeature?.imageUrl ||
        "",
      imageAlt: artist?.homepageFeature?.imageAlt || displayName || "",
      images: homepageFeatureImages,
    },
  };
};

const getFinalPaymentDeadlineHours = (
  value: unknown
): FinalPaymentDeadlineHours =>
  value === 48 ? 48 : 24;

const createPaymentPreferencesFormState = (
  artist: DashboardArtist | null
): ArtistPaymentPreferencesFormState => ({
    finalPaymentTiming: artist?.finalPaymentTiming || "after",
    finalPaymentDeadlineHours: getFinalPaymentDeadlineHours(
      artist?.finalPaymentDeadlineHours
    ),
  });

const ArtistDashboardView = () => {
  const [searchParams] = useSearchParams();
  const [artist, setArtist] = useState<DashboardArtist | null>(null);
  const [bookingRequests, setBookingRequests] = useState<DashboardBookingRequest[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingSearchTerm, setBookingSearchTerm] = useState("");
  const [bookingSortMode, setBookingSortMode] =
    useState<BookingSortMode>("upcoming");
  const [bookingStatusFilter, setBookingStatusFilter] =
    useState<BookingStatusFilter>(() =>
      getInitialBookingStatusFilter(searchParams.get("tab"))
    );
  const [sessionReadinessFilter, setSessionReadinessFilter] =
    useState<SessionReadinessFilter>("all");
  const [navCounts, setNavCounts] = useState<Record<string, number>>({
    requests: 0,
    offers: 0,
    bookings: 0,
    sessions: 0,
    projects: 0,
    pending: 0,
    confirmed: 0,
    paid: 0,
    cancelled: 0,
  });
  const [activeTab, setActiveTab] = useState<ArtistDashboardTab>(() =>
    getInitialDashboardTab(searchParams.get("tab"))
  );
  const dashboardContentStartRef = useRef<HTMLDivElement | null>(null);

  const [selectedBooking, setSelectedBooking] =
    useState<DashboardBookingRequest | null>(null);
  const [selectedBookingRecord, setSelectedBookingRecord] =
    useState<DashboardBooking | null>(null);
  const [bookingToStart, setBookingToStart] =
    useState<DashboardBooking | null>(null);
  const [addSessionsBooking, setAddSessionsBooking] =
    useState<DashboardBooking | null>(null);
  const [sessionPaymentBooking, setSessionPaymentBooking] =
    useState<DashboardBooking | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountProviderId, setAccountProviderId] = useState("");
  const [profileForm, setProfileForm] = useState<ArtistProfileFormState>(
    createProfileFormState(null)
  );
  const [paymentPreferencesForm, setPaymentPreferencesForm] =
    useState<ArtistPaymentPreferencesFormState>(
      createPaymentPreferencesFormState(null)
    );
  const [activeProfileSubTab, setActiveProfileSubTab] =
    useState<ArtistProfileSubTab>("identity");
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isPaymentPreferencesDirty, setIsPaymentPreferencesDirty] =
    useState(false);
  const [isSavingPaymentPreferences, setIsSavingPaymentPreferences] =
    useState(false);
  const [currentSlug, setCurrentSlug] = useState("");
  const [displayNameStatus, setDisplayNameStatus] =
    useState<DisplayNameStatus>("idle");
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingHomepageFeatureImage, setIsUploadingHomepageFeatureImage] =
    useState(false);
  const bookingMonthOptions = useMemo(() => getRollingBookingMonthOptions(), []);
  const allowedBookingMonthKeys = useMemo(
    () => bookingMonthOptions.map((option) => option.key),
    [bookingMonthOptions]
  );

  const [offerPrice, setOfferPrice] = useState(0);
  const [depositAmount, setDepositAmount] = useState<number>(0);

  const [offerMessage, setOfferMessage] = useState("");
  const [dateOptions, setDateOptions] = useState([
    { date: "", time: "" },
    { date: "", time: "" },
    { date: "", time: "" },
  ]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (isArtistDashboardTab(tabParam)) {
      if (isBookingRouteFilter(tabParam)) {
        setActiveTab("bookings");
        setBookingStatusFilter(tabParam);
        return;
      }

      setActiveTab(tabParam);
      if (tabParam === "bookings") {
        setBookingStatusFilter("all");
      }
    }
  }, [searchParams]);

  const handleDashboardTabChange = (tab: ArtistDashboardTab) => {
    if (isBookingRouteFilter(tab)) {
      setActiveTab("bookings");
      setBookingStatusFilter(tab);
    } else {
      setActiveTab(tab);
      if (tab === "bookings") {
        setBookingStatusFilter("all");
      }
    }

    if (!window.matchMedia("(max-width: 767px)").matches) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = dashboardContentStartRef.current;
        if (!target) return;

        const targetTop =
          target.getBoundingClientRect().top +
          window.scrollY -
          MOBILE_DASHBOARD_CONTENT_SCROLL_OFFSET;

        window.scrollTo({
          top: Math.max(targetTop, 0),
          behavior: "smooth",
        });
      });
    });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        setAccountEmail(user.email || "");
        setAccountProviderId(getPrimaryAccountProviderId(user.providerData));
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const artistData = snap.data();
          setAccountEmail(user.email || artistData.email || "");
          setArtist(artistData);
          setProfileForm(createProfileFormState(artistData));
          setPaymentPreferencesForm(createPaymentPreferencesFormState(artistData));
          setCurrentSlug(
            artistData.slug ||
              slugify(artistData.displayName || artistData.name || "", {
                lower: true,
                strict: true,
              })
          );
          setDisplayNameStatus("idle");
          setIsProfileDirty(false);
          setIsPaymentPreferencesDirty(false);
        }
      } else {
        setUid(null);
        setAccountEmail("");
        setAccountProviderId("");
      }
    });

    return () => unsubscribe();
  }, []);

  const updateProfileForm = (
    updater:
      | Partial<ArtistProfileFormState>
      | ((current: ArtistProfileFormState) => ArtistProfileFormState)
  ) => {
    setProfileForm((current) =>
      typeof updater === "function"
        ? updater(current)
        : { ...current, ...updater }
    );
    setIsProfileDirty(true);
  };

  const updatePaymentPreferencesForm = (
    updater:
      | Partial<ArtistPaymentPreferencesFormState>
      | ((
          current: ArtistPaymentPreferencesFormState
        ) => ArtistPaymentPreferencesFormState)
  ) => {
    setPaymentPreferencesForm((current) =>
      typeof updater === "function"
        ? updater(current)
        : { ...current, ...updater }
    );
    setIsPaymentPreferencesDirty(true);
  };

  const checkDisplayNameAvailability = useCallback(async (displayName: string) => {
    if (!uid) return "idle" as DisplayNameStatus;

    const slug = slugify(displayName, { lower: true, strict: true });
    if (!slug || slug === currentSlug) return "idle" as DisplayNameStatus;

    const nameQuery = query(
      collection(db, "users"),
      where("role", "==", "artist"),
      where("slug", "==", slug)
    );
    const snapshot = await getDocs(nameQuery);
    const belongsToAnotherArtist = snapshot.docs.some(
      (docSnap) => docSnap.id !== uid
    );

    return belongsToAnotherArtist
      ? ("taken" as DisplayNameStatus)
      : ("available" as DisplayNameStatus);
  }, [currentSlug, uid]);

  useEffect(() => {
    const displayName = profileForm.displayName.trim();
    const slug = slugify(displayName, { lower: true, strict: true });

    if (!uid || !displayName || slug === currentSlug) {
      setDisplayNameStatus("idle");
      return;
    }

    setDisplayNameStatus("checking");

    const timeoutId = window.setTimeout(() => {
      checkDisplayNameAvailability(displayName)
        .then((status) => setDisplayNameStatus(status))
        .catch((error) => {
          console.error("Display name availability check failed:", error);
          setDisplayNameStatus("idle");
        });
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [profileForm.displayName, uid, currentSlug, checkDisplayNameAvailability]);

  const toggleSpecialty = (specialty: string) => {
    updateProfileForm((current) => {
      const exists = current.specialties.includes(specialty);
      return {
        ...current,
        specialties: exists
          ? current.specialties.filter((item) => item !== specialty)
          : [...current.specialties, specialty],
      };
    });
  };

  const toggleBookingMonth = (monthKey: string) => {
    updateProfileForm((current) => {
      const currentMonthKeys = normalizeBookingMonthKeys(
        current.bookingAvailability.monthKeys,
        allowedBookingMonthKeys
      );
      const exists = currentMonthKeys.includes(monthKey);

      return {
        ...current,
        bookingAvailability: {
          monthKeys: exists
            ? currentMonthKeys.filter((key) => key !== monthKey)
            : [...currentMonthKeys, monthKey].sort(),
        },
      };
    });
  };

  const handleAvatarFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setAvatarCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleAvatarCropSave = async (croppedFile: File) => {
    if (!uid) return;

    const originalRef = ref(storage, `users/${uid}/avatar-original.jpg`);
    const processedRef = ref(storage, `users/${uid}/avatar.jpg`);

    setIsUploadingAvatar(true);

    try {
      await Promise.allSettled([
        deleteObject(originalRef),
        deleteObject(processedRef),
      ]);

      await uploadBytes(originalRef, croppedFile, {
        contentType: croppedFile.type,
      });

      let avatarUrl = "";
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          avatarUrl = await getDownloadURL(processedRef);
          break;
        } catch {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }

      if (!avatarUrl) {
        throw new Error("Processed avatar was not ready.");
      }

      await updateDoc(doc(db, "users", uid), {
        avatarUrl,
        updatedAt: serverTimestamp(),
      });

      const previewAvatarUrl = `${avatarUrl}${
        avatarUrl.includes("?") ? "&" : "?"
      }t=${Date.now()}`;
      const nextArtist = {
        ...(artist || {}),
        avatarUrl: previewAvatarUrl,
      };

      setArtist(nextArtist);
      setProfileForm((current) => ({
        ...current,
        avatarUrl: previewAvatarUrl,
      }));
      setAvatarCropSrc(null);
      toast.success("Profile photo updated.");
    } catch (error) {
      console.error("Avatar upload failed:", error);
      toast.error("Profile photo update failed.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleHomepageFeatureFileSelect = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }

    if (!uid) {
      toast.error("Your artist account is still loading.");
      return;
    }

    if (
      profileForm.homepageFeature.images.length >= HOMEPAGE_FEATURE_IMAGE_LIMIT
    ) {
      toast.error("Remove one homepage image before uploading another.");
      return;
    }

    setIsUploadingHomepageFeatureImage(true);

    try {
      const rawExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const ext = rawExt === "jpeg" ? "jpg" : rawExt.replace(/[^a-z0-9]/g, "");
      const baseName = `homepage_feature_${Date.now()}`;
      const storageBase = `users/${uid}/homepageFeature/${baseName}`;
      const originalPath = `${storageBase}.${ext || "jpg"}`;
      const thumbPath = `${storageBase}_thumb.webp`;
      const previewPath = `${storageBase}_webp90.webp`;
      const fullPath = `${storageBase}_full.jpg`;
      const featureRef = ref(storage, originalPath);

      await uploadBytes(featureRef, file, {
        contentType: file.type,
      });

      const [thumbUrl, webp90Url, fullUrl] = await Promise.all([
        waitForStorageUrl(thumbPath),
        waitForStorageUrl(previewPath),
        waitForStorageUrl(fullPath),
      ]);

      const imageAlt =
        profileForm.displayName.trim() ||
        artist?.displayName ||
        artist?.name ||
        "Featured artist image";
      const nextImage: HomepageFeatureImage = {
        id: baseName,
        imageUrl: webp90Url,
        thumbUrl,
        webp90Url,
        fullUrl,
        imageAlt,
        thumbPath,
        previewPath,
        fullPath,
        fileName: baseName,
      };

      updateProfileForm((current) => ({
        ...current,
        homepageFeature: {
          ...current.homepageFeature,
          imageUrl:
            current.homepageFeature.images.length === 0
              ? getHomepageFeatureImageUrl(nextImage)
              : current.homepageFeature.imageUrl,
          imageAlt,
          images: [...current.homepageFeature.images, nextImage].slice(
            0,
            HOMEPAGE_FEATURE_IMAGE_LIMIT
          ),
        },
      }));
      toast.success(
        "Artist spotlight image processed. Save changes to publish."
      );
    } catch (error) {
      console.error("Artist spotlight image upload failed:", error);
      toast.error("Artist spotlight image processing failed.");
    } finally {
      setIsUploadingHomepageFeatureImage(false);
    }
  };

  const handleRemoveHomepageFeatureImage = (image: HomepageFeatureImage) => {
    updateProfileForm((current) => {
      const images = current.homepageFeature.images.filter(
        (item) => item.id !== image.id
      );
      const primaryImage = images[0];

      return {
        ...current,
        homepageFeature: {
          ...current.homepageFeature,
          images,
          imageUrl: primaryImage ? getHomepageFeatureImageUrl(primaryImage) : "",
        },
      };
    });
  };

  const resetProfileForm = () => {
    setProfileForm(createProfileFormState(artist));
    setDisplayNameStatus("idle");
    setIsProfileDirty(false);
  };

  const resetPaymentPreferencesForm = () => {
    setPaymentPreferencesForm(createPaymentPreferencesFormState(artist));
    setIsPaymentPreferencesDirty(false);
  };

  const handleSaveProfile = async () => {
    if (!uid) return;

    const displayName = profileForm.displayName.trim();
    const homepageFeatureStory = profileForm.homepageFeature.story.trim();
    const homepageFeatureImageAlt = displayName;
    const instagramHandle = getInstagramHandle(
      profileForm.socialLinks.instagram
    );
    const homepageFeatureImages = profileForm.homepageFeature.images
      .map((image, index) => {
        const imageUrl = getHomepageFeatureImageUrl(image);

        return {
          id: image.id,
          imageUrl,
          ...(image.thumbUrl ? { thumbUrl: image.thumbUrl } : {}),
          ...(image.webp90Url || image.imageUrl
            ? { webp90Url: image.webp90Url || image.imageUrl }
            : {}),
          ...(image.fullUrl ? { fullUrl: image.fullUrl } : {}),
          imageAlt: homepageFeatureImageAlt || image.imageAlt || displayName,
          ...(image.thumbPath ? { thumbPath: image.thumbPath } : {}),
          ...(image.previewPath ? { previewPath: image.previewPath } : {}),
          ...(image.fullPath ? { fullPath: image.fullPath } : {}),
          ...(image.fileName ? { fileName: image.fileName } : {}),
          order: index,
        };
      })
      .filter((image) => image.imageUrl)
      .slice(0, HOMEPAGE_FEATURE_IMAGE_LIMIT);
    const primaryHomepageImage = homepageFeatureImages[0];
    const nextSlug = slugify(displayName, { lower: true, strict: true });
    const bookingMonthKeys = normalizeBookingMonthKeys(
      profileForm.bookingAvailability.monthKeys,
      allowedBookingMonthKeys
    );

    if (!displayName) {
      toast.error("Display name is required.");
      return;
    }

    if (profileForm.specialties.length === 0) {
      toast.error("Choose at least one specialty.");
      return;
    }

    const latestNameStatus = await checkDisplayNameAvailability(displayName);
    if (latestNameStatus === "taken") {
      setDisplayNameStatus("taken");
      toast.error("That display name is already taken.");
      return;
    }

    setIsSavingProfile(true);

    const profileUpdate = {
      displayName,
      slug: nextSlug,
      bio: homepageFeatureStory,
      specialties: profileForm.specialties,
      socialLinks: {
        ...(artist?.socialLinks || {}),
        instagram: getInstagramUrlFromHandle(instagramHandle),
      },
      homepageFeature: {
        story: homepageFeatureStory,
        quote: "",
        imageUrl:
          primaryHomepageImage?.imageUrl ||
          profileForm.homepageFeature.imageUrl.trim(),
        imageAlt: homepageFeatureImageAlt,
        images: homepageFeatureImages,
        updatedAt: serverTimestamp(),
      },
      bookingAvailability: {
        monthKeys: bookingMonthKeys,
        updatedAt: serverTimestamp(),
      },
      profileComplete: true,
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, "users", uid), profileUpdate);
      const nextArtist = { ...(artist || {}), ...profileUpdate };
      setArtist(nextArtist);
      setProfileForm(createProfileFormState(nextArtist));
      setCurrentSlug(nextSlug);
      setDisplayNameStatus("idle");
      setIsProfileDirty(false);
      toast.success("Profile updated.");
    } catch (error) {
      console.error("Artist profile update failed:", error);
      toast.error("Profile update failed.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSavePaymentPreferences = async () => {
    if (!uid) return;

    setIsSavingPaymentPreferences(true);

    const paymentPreferencesUpdate = {
      paymentType: "internal" as PaymentType,
      externalPaymentMethods: [],
      externalPaymentDetails: null,
      depositPolicy: {
        amount: 0,
        depositRequired: true,
        nonRefundable: true,
      },
      finalPaymentTiming: paymentPreferencesForm.finalPaymentTiming,
      finalPaymentDeadlineHours:
        paymentPreferencesForm.finalPaymentTiming === "before"
          ? paymentPreferencesForm.finalPaymentDeadlineHours
          : null,
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, "users", uid), paymentPreferencesUpdate);
      const nextArtist = { ...(artist || {}), ...paymentPreferencesUpdate };
      setArtist(nextArtist);
      setPaymentPreferencesForm(createPaymentPreferencesFormState(nextArtist));
      setIsPaymentPreferencesDirty(false);
      toast.success("Payment preferences updated.");
    } catch (error) {
      console.error("Artist payment preference update failed:", error);
      toast.error("Payment preferences update failed.");
    } finally {
      setIsSavingPaymentPreferences(false);
    }
  };

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "bookingRequests"),
      where("artistId", "==", uid),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setBookingRequests(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as DashboardBookingRequest[]
        );
      },
      (error) => {
        console.error("Failed to listen to artist requests:", error);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const bookingCountParts = {
      pending: 0,
      confirmed: 0,
      deposit_paid: 0,
      paid: 0,
      cancelled: 0,
      sessions: 0,
      projects: 0,
    };

    const updateCount = (key: string, value: number) => {
      setNavCounts((current) => {
        const next = { ...current, [key]: value };

        if (key in bookingCountParts) {
          bookingCountParts[key as keyof typeof bookingCountParts] = value;
          next.confirmed =
            bookingCountParts.confirmed + bookingCountParts.deposit_paid;
        }

        next.bookings =
          bookingCountParts.pending +
          bookingCountParts.confirmed +
          bookingCountParts.deposit_paid +
          bookingCountParts.paid +
          bookingCountParts.cancelled;
        next.sessions = bookingCountParts.sessions;
        next.projects = bookingCountParts.projects;
        return next;
      });
    };

    const unsubs = [
      onSnapshot(
        query(
          collection(db, "bookingRequests"),
          where("artistId", "==", uid),
          where("status", "==", "pending")
        ),
        (snap) => updateCount("requests", snap.size),
        (error) => console.error("Artist request count listener failed:", error)
      ),
      onSnapshot(
        query(collection(db, "offers"), where("artistId", "==", uid)),
        (snap) =>
          updateCount(
            "offers",
            snap.docs
              .filter((offerDoc) => !["accepted", "revised"].includes(String(offerDoc.data().status)))
              .filter((offerDoc) => !offerDoc.data().artistDismissedAt)
              .length
          ),
        (error) => console.error("Artist offer count listener failed:", error)
      ),
      onSnapshot(
        query(
          collection(db, "bookings"),
          where("artistId", "==", uid),
          where("status", "==", "pending_payment")
        ),
        (snap) => updateCount("pending", snap.size),
        (error) =>
          console.error("Artist pending booking count listener failed:", error)
      ),
      onSnapshot(
        query(
          collection(db, "bookings"),
          where("artistId", "==", uid),
          where("status", "==", "confirmed")
        ),
        (snap) => updateCount("confirmed", snap.size),
        (error) =>
          console.error(
            "Artist confirmed booking count listener failed:",
            error
          )
      ),
      onSnapshot(
        query(
          collection(db, "bookings"),
          where("artistId", "==", uid),
          where("status", "==", "deposit_paid")
        ),
        (snap) => updateCount("deposit_paid", snap.size),
        (error) =>
          console.error(
            "Artist deposit-paid booking count listener failed:",
            error
          )
      ),
      onSnapshot(
        query(
          collection(db, "bookings"),
          where("artistId", "==", uid),
          where("status", "==", "paid")
        ),
        (snap) => updateCount("paid", snap.size),
        (error) =>
          console.error("Artist paid booking count listener failed:", error)
      ),
      onSnapshot(
        query(
          collection(db, "bookings"),
          where("artistId", "==", uid),
          where("status", "==", "cancelled")
        ),
        (snap) => updateCount("cancelled", snap.size),
        (error) =>
          console.error(
            "Artist cancelled booking count listener failed:",
            error
          )
      ),
      onSnapshot(
        query(collection(db, "bookings"), where("artistId", "==", uid)),
        (snap) =>
          updateCount(
            "sessions",
            snap.docs.filter((bookingDoc) =>
              isSessionWorkspaceBooking(bookingDoc.data())
            ).length
          ),
        (error) =>
          console.error("Artist session count listener failed:", error)
      ),
      onSnapshot(
        query(collection(db, "bookings"), where("artistId", "==", uid)),
        (snap) =>
          updateCount(
            "projects",
            snap.docs.filter((bookingDoc) =>
              isOngoingProjectBooking(bookingDoc.data())
            ).length
          ),
        (error) =>
          console.error("Artist project count listener failed:", error)
      ),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [uid]);

  // Fetch bookings based on the current workspace.
  useEffect(() => {
    if (!uid || !["bookings", "sessions", "projects"].includes(activeTab)) return;

    setBookings([]);

    const q =
      activeTab === "sessions"
        ? query(collection(db, "bookings"), where("artistId", "==", uid))
      : activeTab === "projects"
        ? query(collection(db, "bookings"), where("artistId", "==", uid))
        : query(collection(db, "bookings"), where("artistId", "==", uid));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const rawBookings = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Booking[];
        const scopedBookings =
          activeTab === "sessions"
            ? rawBookings.filter((booking) => isSessionWorkspaceBooking(booking))
            : activeTab === "projects"
            ? rawBookings.filter((booking) => isOngoingProjectBooking(booking))
            : rawBookings.filter(
                (booking) => getBookingStatusFilterValue(booking) !== "all"
              );

        setBookings(
          scopedBookings.map((booking) => {
            const clientNameParts = getClientNameParts(booking);

            return {
              ...booking,
              clientFirstName: clientNameParts.firstName,
              clientLastName: clientNameParts.lastName,
              clientName: clientNameParts.fullName,
              clientAvatar: booking.clientAvatar || "/default-avatar.png",
            };
          }) as Booking[]
        );
      },
      (error) => {
        console.error("Failed to listen to artist bookings:", error);
      }
    );

    return () => unsubscribe();
  }, [uid, activeTab]);

  const profileCompletionItems = [
    Boolean(profileForm.displayName.trim()),
    Boolean(profileForm.homepageFeature.story.trim()),
    Boolean(profileForm.avatarUrl.trim()),
    profileForm.specialties.length > 0,
    Boolean(profileForm.socialLinks.instagram.trim()),
  ];
  const profileCompletion = Math.round(
    (profileCompletionItems.filter(Boolean).length /
      profileCompletionItems.length) *
      100
  );
  const profileStrengthColor =
    profileCompletion === 100
      ? "bg-emerald-400"
      : profileCompletion >= 70
      ? "bg-amber-400"
      : "bg-[var(--color-primary)]";
  const isSaveDisabled =
    !isProfileDirty ||
    isSavingProfile ||
    isUploadingAvatar ||
    isUploadingHomepageFeatureImage ||
    displayNameStatus === "checking" ||
    displayNameStatus === "taken";
  const isPaymentPreferencesSaveDisabled =
    !isPaymentPreferencesDirty || isSavingPaymentPreferences;
  const visibleBookings = useMemo(() => {
    const statusFilteredBookings = bookings.filter((booking) => {
      if (activeTab === "bookings" && bookingStatusFilter !== "all") {
        return getBookingStatusFilterValue(booking) === bookingStatusFilter;
      }

      if (activeTab === "sessions" && sessionReadinessFilter !== "all") {
        return (
          getSessionReadinessFilterValue(booking) === sessionReadinessFilter
        );
      }

      return true;
    });
    const normalizedSearch = bookingSearchTerm.trim().toLowerCase();
    const shouldApplySearch = Boolean(normalizedSearch);
    const filteredBookings = shouldApplySearch
      ? statusFilteredBookings.filter((booking) => {
          const dashboardBooking = booking as DashboardBooking;
          const clientName = getDashboardClientName(dashboardBooking);
          const clientFirstName = getDashboardClientFirstName(dashboardBooking);
          const clientLastName =
            dashboardBooking.user?.lastName ||
            dashboardBooking.clientLastName ||
            "";

          return [clientName, clientFirstName, clientLastName]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
        })
      : statusFilteredBookings;

    return [...filteredBookings].sort((a, b) => {
      if (bookingSortMode === "newest") {
        return getBookingCreatedTime(b) - getBookingCreatedTime(a);
      }

      if (bookingSortMode === "oldest") {
        return getBookingCreatedTime(a) - getBookingCreatedTime(b);
      }

      return compareUpcomingBookings(a, b);
    });
  }, [
    activeTab,
    bookings,
    bookingSearchTerm,
    bookingSortMode,
    bookingStatusFilter,
    sessionReadinessFilter,
  ]);
  const hasActiveSessionInProgress = useMemo(
    () => bookings.some((booking) => booking.sessionStatus === "in_progress"),
    [bookings]
  );
  const sessionReadinessCounts = useMemo(
    () =>
      SESSION_READINESS_FILTERS.reduce<Record<SessionReadinessFilter, number>>(
        (counts, filter) => ({
          ...counts,
          [filter.value]:
            filter.value === "all"
              ? bookings.length
              : bookings.filter(
                  (booking) =>
                    getSessionReadinessFilterValue(booking) === filter.value
                ).length,
        }),
        {
          all: 0,
          ready: 0,
          needs_schedule: 0,
          follow_up: 0,
          paused: 0,
        }
      ),
    [bookings]
  );

  const updateSessionRecord = async (
    booking: DashboardBooking,
    sessionUpdate: Record<string, unknown>,
    bookingUpdate: Record<string, unknown>
  ) => {
    const remainingBalance = getDashboardRemainingBalance(booking);

    try {
      await setDoc(
        doc(db, "bookingSessions", booking.id),
        {
          bookingId: booking.id,
          artistId: booking.artistId,
          clientId: booking.clientId,
          offerId: booking.offerId,
          remainingAmount: remainingBalance,
          remainingAmountCents: Math.round(remainingBalance * 100),
          updatedAt: serverTimestamp(),
          ...sessionUpdate,
        },
        { merge: true }
      );
      await updateDoc(doc(db, "bookings", booking.id), {
        sessionId: booking.id,
        updatedAt: serverTimestamp(),
        ...bookingUpdate,
      });
      toast.success("Session updated.");
    } catch (error) {
      console.error("Session update failed:", error);
      toast.error("Could not update this session.");
    }
  };

  const handleCompleteSessionFromRow = async (booking: DashboardBooking) => {
    try {
      const completeSession = httpsCallable(functions, "completeProjectSession");
      await completeSession({ bookingId: booking.id });
      toast.success("Session completed.");
    } catch (error) {
      console.error("Session completion failed:", error);
      toast.error("Could not complete this session.");
    }
  };

  const handleStartSessionFromRow = async (booking: DashboardBooking) => {
    try {
      const startSession = httpsCallable(functions, "startProjectSession");
      await startSession({ bookingId: booking.id });
      toast.success("Session started.");
    } catch (error) {
      console.error("Session start failed:", error);
      toast.error("Could not start this session.");
    }
  };

  const handleConfirmStartSession = async () => {
    if (!bookingToStart) return;
    await handleStartSessionFromRow(bookingToStart);
    setBookingToStart(null);
    setActiveTab("sessions");
  };

  const handleBalancePaidFromRow = (booking: DashboardBooking) => {
    const amountPaid = getDashboardSessionInstallmentAmount(booking);
    const completion =
      booking.remainingPaymentStatus === "client_confirmed"
        ? buildExternalPaymentCompletionUpdates(booking, amountPaid)
        : null;

    return updateSessionRecord(
      booking,
      completion?.sessionUpdate || {
        remainingPaymentStatus: "artist_confirmed",
        artistConfirmedAt: serverTimestamp(),
        sessionNumber: getActiveSessionNumber(booking),
        pendingPaymentAmount: amountPaid,
        pendingPaymentAmountCents: Math.round(amountPaid * 100),
      },
      completion?.bookingUpdate || {
        remainingPaymentStatus: "artist_confirmed",
        pendingSessionPaymentAmount: amountPaid,
        pendingSessionPaymentAmountCents: Math.round(amountPaid * 100),
        pendingSessionNumber: getActiveSessionNumber(booking),
        externalRemainingArtistConfirmedAt: serverTimestamp(),
      }
    );
  };

  const handleOpenAddedSessionsModal = (booking: DashboardBooking) => {
    setAddSessionsBooking(booking);
  };

  const handleSubmitAddedSessions = async (
    booking: Booking,
    input: {
      additionalSessionCount: number;
      addedArtistAmountCents: number;
      message: string;
    }
  ) => {
    try {
      const proposeAmendment = httpsCallable(
        functions,
        "proposeProjectAmendment"
      );
      await proposeAmendment({
        bookingId: booking.id,
        type: "add_sessions",
        additionalSessionCount: input.additionalSessionCount,
        addedArtistAmountCents: input.addedArtistAmountCents,
        message: input.message,
      });
      toast.success("Added-session amendment sent to the client.");
    } catch (error) {
      console.error("Project amendment proposal failed:", error);
      toast.error("Could not send the amendment.");
      throw error;
    }
  };

  const handleSubmitSessionPaymentRequest = async (
    booking: Booking,
    input: { amountCents: number; note: string }
  ) => {
    try {
      const preparePayment = httpsCallable(
        functions,
        "prepareProjectSessionPayment"
      );
      await preparePayment({
        bookingId: booking.id,
        sessionNumber: getActiveSessionNumber(booking),
        amountCents: input.amountCents,
        note: input.note,
      });
      toast.success("Session payment request sent.");
    } catch (error) {
      console.error("Session payment request failed:", error);
      toast.error("Could not request this session payment.");
      throw error;
    }
  };

  const bookingStatusMetrics = [
    { label: "Pending", value: navCounts.pending || 0 },
    { label: "Confirmed", value: navCounts.confirmed || 0 },
    { label: "Paid", value: navCounts.paid || 0 },
    { label: "Cancelled", value: navCounts.cancelled || 0 },
  ];
  const activeBookingFilterLabel =
    BOOKING_STATUS_FILTERS.find((filter) => filter.value === bookingStatusFilter)
      ?.label || "All";
  const homepageFeatureImages = profileForm.homepageFeature.images;
  const primaryHomepageFeatureImage = homepageFeatureImages[0];
  const primaryHomepageFeatureImageUrl = primaryHomepageFeatureImage
    ? getHomepageFeatureImageUrl(primaryHomepageFeatureImage)
    : profileForm.homepageFeature.imageUrl;
  const homepageFeatureImageCount = homepageFeatureImages.length;
  const canUploadHomepageFeatureImage =
    homepageFeatureImageCount < HOMEPAGE_FEATURE_IMAGE_LIMIT &&
    !isUploadingHomepageFeatureImage;
  const instagramHandle = getInstagramHandle(
    profileForm.socialLinks.instagram
  );
  const profilePreviewStory = profileForm.homepageFeature.story.trim();
  const profileSaveButtonIsActive = isProfileDirty && !isSaveDisabled;
  const accountProviderCopy = getAccountProviderCopy(accountProviderId);
  const selectedBookingMonthKeys = normalizeBookingMonthKeys(
    profileForm.bookingAvailability.monthKeys,
    allowedBookingMonthKeys
  );
  const bookingAvailabilityPreviewLabel = formatBookingMonthLabel(
    selectedBookingMonthKeys,
    bookingMonthOptions
  );

  return (
    <div
      className={`flex min-h-[100vh] flex-col bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#121212] py-20 text-white md:flex-row ${
        activeTab === "profile" ? "md:min-h-[calc(100vh_+_16rem)]" : ""
      }`}
    >
      {avatarCropSrc && (
        <ImageCropperModal
          imageSrc={avatarCropSrc}
          aspect={1}
          onCancel={() => setAvatarCropSrc(null)}
          onSave={handleAvatarCropSave}
        />
      )}

      <AddSessionsAmendmentDialog
        booking={addSessionsBooking}
        onClose={() => setAddSessionsBooking(null)}
        onSubmit={handleSubmitAddedSessions}
      />

      <SessionPaymentRequestDialog
        booking={sessionPaymentBooking}
        suggestedAmount={
          sessionPaymentBooking
            ? getDashboardSessionInstallmentAmount(sessionPaymentBooking)
            : 0
        }
        onClose={() => setSessionPaymentBooking(null)}
        onSubmit={handleSubmitSessionPaymentRequest}
      />

      <SidebarNavigation
        activeTab={activeTab}
        counts={navCounts}
        onTabChange={handleDashboardTabChange}
      />

      <main className="relative min-w-0 flex-1 p-6">
        {artist && (
          <ArtistDashboardProfileHeader artist={artist} />
        )}

        <div ref={dashboardContentStartRef} className="h-px" aria-hidden="true" />

        {activeTab === "profile" && (
          <section className="mt-6 w-full max-w-6xl space-y-6">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
                  Artist account
                </p>
                <h1 className="mt-2 text-3xl! font-semibold text-white">
                  Profile settings
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-neutral-400">
                  Keep your public profile and artist spotlight polished from
                  one place.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:hidden">
                <div className="min-w-44">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>Profile strength</span>
                    <span>{profileCompletion}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${profileStrengthColor}`}
                      style={{ width: `${profileCompletion}%` }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetProfileForm}
                  disabled={!isProfileDirty || isSavingProfile}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RefreshCcw size={16} aria-hidden="true" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={isSaveDisabled}
                  className={`inline-flex items-center justify-center gap-2 rounded-md px-5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    profileSaveButtonIsActive
                      ? "border border-white/70 bg-gradient-to-b from-white via-white to-neutral-200 text-[#111] shadow-[0_12px_28px_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] hover:from-white hover:to-neutral-100"
                      : "border border-white/10 bg-white/[0.04] text-neutral-500"
                  }`}
                >
                  <Save
                    size={16}
                    className={
                      profileSaveButtonIsActive
                        ? "text-[#111]"
                        : "text-neutral-500"
                    }
                    aria-hidden="true"
                  />
                  {isSavingProfile ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>

            <div className="grid items-start gap-6 xl:min-h-[calc(100vh_+_8rem)] xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <div
                  role="tablist"
                  aria-label="Profile settings sections"
                  className="flex gap-2 overflow-x-auto border-b border-white/10 pb-3"
                >
                  {PROFILE_SETTING_TABS.map((tab) => {
                    const isActive = activeProfileSubTab === tab.value;

                    return (
                      <button
                        key={tab.value}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`profile-panel-${tab.value}`}
                        id={`profile-tab-${tab.value}`}
                        onClick={() => setActiveProfileSubTab(tab.value)}
                        className={`shrink-0 rounded-md border px-4 py-2 text-sm font-semibold transition ${
                          isActive
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white"
                            : "border-white/10 bg-white/[0.03] text-neutral-400 hover:border-white/25 hover:text-white"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {activeProfileSubTab === "identity" && (
                <section
                  id="profile-panel-identity"
                  role="tabpanel"
                  aria-labelledby="profile-tab-identity"
                  className="rounded-lg border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                      <UserRound size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="mb-0! text-lg!">Public identity</h2>
                      <p className="text-sm text-neutral-400">
                        This is what clients see across SATX Ink.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-neutral-200">
                        Display name
                      </span>
                      <input
                        type="text"
                        value={profileForm.displayName}
                        onChange={(event) =>
                          updateProfileForm({ displayName: event.target.value })
                        }
                        className={`w-full rounded-md border bg-[#101010] px-3 py-2 text-white outline-none transition ${
                          displayNameStatus === "taken"
                            ? "border-red-400 focus:border-red-400"
                            : displayNameStatus === "available"
                            ? "border-emerald-400 focus:border-emerald-400"
                            : "border-white/10 focus:border-[var(--color-primary)]"
                        }`}
                        placeholder="Ink by Alex"
                      />
                      <span
                        className={`block text-xs ${
                          displayNameStatus === "taken"
                            ? "text-red-300"
                            : displayNameStatus === "available"
                            ? "text-emerald-300"
                            : "text-neutral-500"
                        }`}
                      >
                        {displayNameStatus === "checking" &&
                          "Checking name availability..."}
                        {displayNameStatus === "available" &&
                          "This display name is available."}
                        {displayNameStatus === "taken" &&
                          "This display name is already taken."}
                        {displayNameStatus === "idle" &&
                          "Changing this also updates your public profile handle."}
                      </span>
                    </label>

                    <div className="space-y-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                        <Mail size={15} aria-hidden="true" />
                        {accountProviderCopy.accountLabel}
                      </span>
                      <div className="flex min-h-10 flex-col items-start gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0 max-w-full truncate text-neutral-300">
                          {accountEmail || accountProviderCopy.fallbackEmailLabel}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                          <ShieldCheck size={13} aria-hidden="true" />
                          {accountProviderCopy.managedLabel}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                        <ImageIcon size={15} aria-hidden="true" />
                        Profile photo
                      </span>
                      <div className="flex items-center gap-4 rounded-md border border-white/10 bg-[#101010] p-3">
                        <img
                          src={profileForm.avatarUrl || "/fallback-avatar.jpg"}
                          alt="Current artist avatar"
                          className="h-16 w-16 rounded-full border border-white/10 object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white">
                            Update your avatar
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Upload and crop a square image for the platform.
                          </p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-neutral-200 transition hover:border-white/25 hover:text-white">
                          {isUploadingAvatar ? (
                            <LoaderCircle
                              size={15}
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Camera size={15} aria-hidden="true" />
                          )}
                          {isUploadingAvatar ? "Uploading" : "Edit"}
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            disabled={isUploadingAvatar}
                            onChange={handleAvatarFileSelect}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <label className="mt-4 block space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                      <Instagram size={15} aria-hidden="true" />
                      Instagram
                    </span>
                    <span className="flex min-w-0 rounded-md border border-white/10 bg-[#101010] transition focus-within:border-[var(--color-primary)]">
                      <span className="shrink-0 border-r border-white/10 px-3 py-2 text-xs text-neutral-500 sm:text-sm">
                        {INSTAGRAM_PROFILE_BASE}
                      </span>
                      <input
                        type="text"
                        inputMode="text"
                        autoCapitalize="none"
                        autoComplete="off"
                        value={instagramHandle}
                        onChange={(event) => {
                          const nextHandle = getInstagramHandle(
                            event.target.value
                          );

                          updateProfileForm((current) => ({
                            ...current,
                            socialLinks: {
                              ...current.socialLinks,
                              instagram:
                                getInstagramUrlFromHandle(nextHandle),
                            },
                          }));
                        }}
                        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-white outline-none"
                        placeholder="artist"
                      />
                    </span>
                  </label>
                </section>
                )}

                {activeProfileSubTab === "spotlight" && (
                <section
                  id="profile-panel-spotlight"
                  role="tabpanel"
                  aria-labelledby="profile-tab-spotlight"
                  className="rounded-lg border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                      <ImageIcon size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="mb-0! text-lg!">Artist spotlight</h2>
                      <p className="text-sm text-neutral-400">
                        Prepare your spotlight story for when SATX Ink features
                        you on the homepage.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-4">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-neutral-200">
                          Feature story
                        </span>
                        <textarea
                          value={profileForm.homepageFeature.story}
                          onChange={(event) =>
                            updateProfileForm((current) => ({
                              ...current,
                              homepageFeature: {
                                ...current.homepageFeature,
                                story: event.target.value,
                              },
                            }))
                          }
                          rows={5}
                          maxLength={520}
                          className="w-full resize-none rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                          placeholder="Share the work, style, or creative point of view you want clients to remember."
                        />
                        <span className="block text-right text-xs text-neutral-500">
                          {profileForm.homepageFeature.story.length}/520
                        </span>
                      </label>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-[#101010] p-3">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-neutral-100">
                            Spotlight images
                          </p>
                          <p className="text-xs text-neutral-500">
                            {homepageFeatureImageCount}/
                            {HOMEPAGE_FEATURE_IMAGE_LIMIT} slides ready
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                          Slider
                        </span>
                      </div>

                      <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-white/10 bg-black">
                        {primaryHomepageFeatureImageUrl ? (
                          <img
                            src={primaryHomepageFeatureImageUrl}
                            alt={
                              profileForm.displayName ||
                              "Artist spotlight preview"
                            }
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-neutral-500">
                            Upload up to four editorial images for the homepage
                            spotlight slider.
                          </div>
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {Array.from({
                          length: HOMEPAGE_FEATURE_IMAGE_LIMIT,
                        }).map((_, index) => {
                          const image = homepageFeatureImages[index];
                          const imageUrl = image
                            ? getHomepageFeatureImageUrl(image)
                            : "";

                          return (
                            <div
                              key={image?.id || `homepage-feature-empty-${index}`}
                              className={`group relative aspect-square overflow-hidden rounded-md border ${
                                image
                                  ? "border-white/15 bg-black"
                                  : "border-dashed border-white/10 bg-white/[0.035]"
                              }`}
                            >
                              {image && imageUrl ? (
                                <>
                                  <img
                                    src={imageUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white/80">
                                    {index + 1}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleRemoveHomepageFeatureImage(
                                        image
                                      )
                                    }
                                    className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-red-300/35 bg-red-950/80 text-red-100 opacity-0 shadow-[0_8px_18px_rgba(0,0,0,0.35)] backdrop-blur transition hover:border-red-200/70 hover:bg-red-500 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 group-hover:opacity-100"
                                    aria-label={`Remove homepage image ${
                                      index + 1
                                    }`}
                                    title={`Remove slide ${index + 1}`}
                                  >
                                    <X size={13} aria-hidden="true" />
                                    <span className="pointer-events-none absolute right-7 top-1/2 hidden -translate-y-1/2 rounded-full border border-red-300/25 bg-red-950/90 px-2 py-0.5 text-[10px] font-semibold text-red-50 shadow-lg shadow-black/30 sm:group-hover:block">
                                      Remove
                                    </span>
                                  </button>
                                </>
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-neutral-600">
                                  {index + 1}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <label
                        className={`mt-3 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                          canUploadHomepageFeatureImage
                            ? "cursor-pointer border-white/10 text-neutral-200 hover:border-white/25 hover:text-white"
                            : "cursor-not-allowed border-white/5 text-neutral-500"
                        }`}
                      >
                        {isUploadingHomepageFeatureImage ? (
                          <LoaderCircle
                            size={15}
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Camera size={15} aria-hidden="true" />
                        )}
                        {isUploadingHomepageFeatureImage
                          ? "Processing with Sharp"
                          : homepageFeatureImageCount >=
                              HOMEPAGE_FEATURE_IMAGE_LIMIT
                            ? "Four-image limit reached"
                            : "Upload image"}
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={!canUploadHomepageFeatureImage}
                          onChange={handleHomepageFeatureFileSelect}
                        />
                      </label>
                      <p className="mt-2 text-xs leading-5 text-neutral-500">
                        Admin controls who appears on the homepage. These
                        images slide in the order shown and are saved to your
                        artist profile.
                      </p>
                    </div>
                  </div>
                </section>
                )}

                {activeProfileSubTab === "specialties" && (
                <section
                  id="profile-panel-specialties"
                  role="tabpanel"
                  aria-labelledby="profile-tab-specialties"
                  className="rounded-lg border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                      <Check size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="mb-0! text-lg!">Specialties</h2>
                      <p className="text-sm text-neutral-400">
                        Choose the styles clients should associate with your
                        work.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {SPECIALTY_OPTIONS.map((specialty) => {
                      const selected =
                        profileForm.specialties.includes(specialty);
                      return (
                        <button
                          key={specialty}
                          type="button"
                          onClick={() => toggleSpecialty(specialty)}
                          className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                            selected
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white"
                              : "border-white/10 bg-[#101010] text-neutral-300 hover:border-white/25"
                          }`}
                        >
                          {specialty}
                        </button>
                      );
                    })}
                  </div>

                  <AnimatedTagInput
                    className="mt-4"
                    value={profileForm.specialties}
                    onChange={(nextSpecialties) =>
                      updateProfileForm({
                        specialties:
                          getCanonicalTattooStyles(nextSpecialties),
                      })
                    }
                    label="Custom specialties"
                    helperText="Press space or comma to add a custom specialty."
                    emptyPlaceholder="fine-line, realism, lettering"
                    addPlaceholder="Add another style"
                    displayPrefix=""
                    normalizeTag={getTattooStyleLabel}
                    inputAriaLabel="Add custom specialty"
                  />
                </section>
                )}

                {activeProfileSubTab === "availability" && (
                <section
                  id="profile-panel-availability"
                  role="tabpanel"
                  aria-labelledby="profile-tab-availability"
                  className="rounded-lg border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                      <CalendarDays size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="mb-0! text-lg!">Booking availability</h2>
                      <p className="text-sm text-neutral-400">
                        Tell clients which upcoming months you are actively
                        booking.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-[#101010] p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          Public booking months
                        </p>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">
                          Select any months in the next 12 months. These appear
                          on your public profile and in clients' Following list.
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-neutral-300">
                        {selectedBookingMonthKeys.length} selected
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {bookingMonthOptions.map((month) => {
                        const selected = selectedBookingMonthKeys.includes(
                          month.key
                        );

                        return (
                          <button
                            key={month.key}
                            type="button"
                            onClick={() => toggleBookingMonth(month.key)}
                            aria-pressed={selected}
                            className={`rounded-md border px-3! py-2.5! text-left transition ${
                              selected
                                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white"
                                : "border-white/10 bg-white/[0.025] text-neutral-400 hover:border-white/25 hover:text-white"
                            }`}
                          >
                            <span className="block text-sm font-semibold">
                              {month.label.split(" ")[0]}
                            </span>
                            <span className="mt-0.5 block text-xs text-neutral-500">
                              {month.year}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
                        Client-facing label
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {bookingAvailabilityPreviewLabel
                          ? `Booking ${bookingAvailabilityPreviewLabel}`
                          : "Availability not listed"}
                      </p>
                    </div>
                  </div>
                </section>
                )}
              </div>

              <aside className="h-fit space-y-4 xl:sticky xl:top-24 xl:self-start">
                <div className="rounded-lg border border-white/10 bg-[#101010] p-5">
                  <div className="flex items-center gap-4">
                  <img
                    src={
                      profileForm.avatarUrl.trim() ||
                      artist?.avatarUrl ||
                      "/fallback-avatar.jpg"
                    }
                    alt={profileForm.displayName || "Artist avatar preview"}
                    className="h-20 w-20 rounded-full border border-white/10 object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-white">
                      {profileForm.displayName || "Display name"}
                    </p>
                  </div>
                </div>

                <p className="mt-5 line-clamp-5 text-sm leading-6 text-neutral-300">
                  {profilePreviewStory ||
                    "Your artist spotlight story will appear here as clients browse your profile."}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {profileForm.specialties.length > 0 ? (
                    profileForm.specialties.slice(0, 6).map((specialty) => (
                      <span
                        key={specialty}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-200"
                      >
                        {specialty}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-neutral-500">
                      No specialties selected yet.
                    </span>
                  )}
                </div>

                <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-neutral-400">Booking</span>
                    <span className="max-w-[180px] truncate text-right text-white">
                      {bookingAvailabilityPreviewLabel || "Not listed"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-400">Instagram</span>
                    <span className="max-w-[180px] truncate text-white">
                      {instagramHandle
                        ? getInstagramUrlFromHandle(instagramHandle)
                        : "Not added"}
                    </span>
                  </div>
                </div>
                </div>

                <div className="hidden rounded-lg border border-white/10 bg-white/[0.03] p-5 xl:block">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>Profile strength</span>
                    <span>{profileCompletion}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${profileStrengthColor}`}
                      style={{ width: `${profileCompletion}%` }}
                    />
                  </div>

                  <div className="mt-4 grid gap-2">
                    <button
                      type="button"
                      onClick={resetProfileForm}
                      disabled={!isProfileDirty || isSavingProfile}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RefreshCcw size={16} aria-hidden="true" />
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={isSaveDisabled}
                      className={`inline-flex items-center justify-center gap-2 rounded-md px-5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        profileSaveButtonIsActive
                          ? "border border-white/70 bg-gradient-to-b from-white via-white to-neutral-200 text-[#111] shadow-[0_12px_28px_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] hover:from-white hover:to-neutral-100"
                          : "border border-white/10 bg-white/[0.04] text-neutral-500"
                      }`}
                    >
                      <Save
                        size={16}
                        className={
                          profileSaveButtonIsActive
                            ? "text-[#111]"
                            : "text-neutral-500"
                        }
                        aria-hidden="true"
                      />
                      {isSavingProfile ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        )}

        {activeTab === "requests" && (
          <BookingRequestsList
            bookingRequests={bookingRequests}
            onRequestResolved={(requestId) => {
              setBookingRequests((current) =>
                current.filter((request) => request.id !== requestId)
              );
              setNavCounts((current) => ({
                ...current,
                requests: Math.max((current.requests || 0) - 1, 0),
              }));
            }}
            onMakeOffer={(booking) => {
              setSelectedBooking(booking);
              setIsModalOpen(true);
            }}
          />
        )}

        {uid && (
          <div
            className={activeTab === "offers" ? "contents" : "hidden"}
            aria-hidden={activeTab !== "offers"}
          >
            <OffersList uid={uid} artist={artist} />
          </div>
        )}

        {/* Booking cards */}
        {["bookings", "sessions", "projects"].includes(activeTab) && (
          <section className="mt-6 w-full max-w-7xl space-y-6">
            <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl! font-semibold text-white capitalize">
                  {activeTab === "bookings"
                    ? "Bookings"
                    : activeTab === "sessions"
                    ? "Sessions"
                    : activeTab === "projects"
                    ? "Ongoing projects"
                    : "Bookings"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-neutral-400">
                  {activeTab === "bookings"
                    ? "Track accepted offers by payment stage, appointment status, and client readiness."
                    : activeTab === "sessions"
                    ? "Start upcoming appointments, manage the active session, and close out work cleanly."
                    : activeTab === "projects"
                    ? "Track multi-session progress, scheduling needs, and project health."
                    : "Review client appointments, payment status, studio details, and selected tattoo references."}
                </p>
              </div>

              {activeTab === "bookings" ? (
                <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto lg:min-w-[560px]">
                  {bookingStatusMetrics.map((metric) => (
                    <BookingMetricCard
                      key={metric.label}
                      label={metric.label}
                      value={metric.value}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid w-full grid-cols-1 gap-2 lg:w-auto lg:min-w-[140px]">
                  <BookingMetricCard
                    label="Showing"
                    value={
                      visibleBookings.length !== bookings.length
                        ? `${visibleBookings.length}/${bookings.length}`
                        : visibleBookings.length
                    }
                  />
                </div>
              )}
            </div>

            {bookings.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                  <ReceiptText size={22} />
                </div>
                <h2 className="mt-4 text-xl! font-semibold! text-white capitalize">
                  {activeTab === "bookings"
                    ? "No bookings yet"
                    : activeTab === "sessions"
                    ? "No sessions ready"
                    : activeTab === "projects"
                    ? "No ongoing projects yet"
                    : "No bookings yet"}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
                  {activeTab === "bookings"
                    ? "Once clients accept offers, their bookings will collect here by payment and appointment stage."
                    : activeTab === "sessions"
                    ? "Upcoming and active session work will appear here once a booking is paid or confirmed."
                    : activeTab === "projects"
                    ? "When an accepted booking is marked as a multi-session project, it will appear here for progress and scheduling follow-up."
                    : "When a client reaches this booking stage, their appointment details will appear here."}
                </p>
              </div>
            ) : (
              <>
                {activeTab === "bookings" ? (
                  <div className="rounded-lg border border-white/10 p-3 backdrop-blur sm:p-4 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)] sm:h-10 sm:w-10">
                            <CalendarDays size={18} aria-hidden="true" />
                          </span>
                          <div>
                            <h2 className="mb-0! text-base! sm:text-lg!">
                              Booking filters
                            </h2>
                            <p className="text-sm text-neutral-400">
                              Move between payment stages without leaving bookings.
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-3 xl:justify-end">
                          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                            {BOOKING_STATUS_FILTERS.map((filter) => (
                              <button
                                key={filter.value}
                                type="button"
                                onClick={() => setBookingStatusFilter(filter.value)}
                                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-2! text-[11px]! font-semibold transition sm:h-10 sm:px-3! sm:text-xs! ${
                                  bookingStatusFilter === filter.value
                                    ? "border-white bg-white text-black"
                                    : "border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                                }`}
                              >
                                {filter.label}
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                    bookingStatusFilter === filter.value
                                      ? "bg-black/10 text-black"
                                      : "bg-white/[0.06] text-neutral-400"
                                  }`}
                                >
                                  {filter.value === "all"
                                    ? bookings.length
                                    : navCounts[filter.value] || 0}
                                </span>
                              </button>
                            ))}
                          </div>
                          <span className="whitespace-nowrap text-xs text-neutral-500 sm:ml-1 sm:text-sm">
                            Showing {visibleBookings.length} of {bookings.length}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-[minmax(14rem,22rem)_auto] xl:self-end">
                        <label className="relative min-w-0">
                          <Search
                            size={16}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                            aria-hidden="true"
                          />
                          <input
                            type="search"
                            value={bookingSearchTerm}
                            onChange={(event) =>
                              setBookingSearchTerm(event.target.value)
                            }
                            className="h-10 w-full rounded-md border border-white/10 bg-[#101010] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-[var(--color-primary)]"
                            placeholder="Search by client"
                          />
                        </label>

                        <select
                          value={bookingSortMode}
                          onChange={(event) =>
                            setBookingSortMode(event.target.value as BookingSortMode)
                          }
                          className="h-10 rounded-md border border-white/10 bg-[#101010] px-3 text-sm font-medium text-white outline-none transition focus:border-[var(--color-primary)]"
                          aria-label="Sort bookings"
                        >
                          <option value="upcoming">Soonest upcoming</option>
                          <option value="newest">Newest bookings</option>
                          <option value="oldest">Oldest bookings</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ) : activeTab === "sessions" ? (
                  <div className="rounded-lg border border-white/10 p-3 backdrop-blur sm:p-4 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)] sm:h-10 sm:w-10">
                            <CalendarDays size={18} aria-hidden="true" />
                          </span>
                          <div>
                            <h2 className="mb-0! text-base! sm:text-lg!">
                              Session filters
                            </h2>
                            <p className="text-sm text-neutral-400">
                              Start ready appointments and spot sessions that need a date or follow-up.
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-3 xl:justify-end">
                          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                            {SESSION_READINESS_FILTERS.map((filter) => (
                              <button
                                key={filter.value}
                                type="button"
                                onClick={() =>
                                  setSessionReadinessFilter(filter.value)
                                }
                                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-2! text-[11px]! font-semibold transition sm:h-10 sm:px-3! sm:text-xs! ${
                                  sessionReadinessFilter === filter.value
                                    ? "border-white bg-white text-black"
                                    : "border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                                }`}
                              >
                                {filter.label}
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                    sessionReadinessFilter === filter.value
                                      ? "bg-black/10 text-black"
                                      : "bg-white/[0.06] text-neutral-400"
                                  }`}
                                >
                                  {sessionReadinessCounts[filter.value] || 0}
                                </span>
                              </button>
                            ))}
                          </div>
                          <span className="whitespace-nowrap text-xs text-neutral-500 sm:ml-1 sm:text-sm">
                            Showing {visibleBookings.length} of {bookings.length}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-[minmax(14rem,22rem)_auto] xl:self-end">
                        <label className="relative min-w-0">
                          <Search
                            size={16}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                            aria-hidden="true"
                          />
                          <input
                            type="search"
                            value={bookingSearchTerm}
                            onChange={(event) =>
                              setBookingSearchTerm(event.target.value)
                            }
                            className="h-10 w-full rounded-md border border-white/10 bg-[#101010] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-[var(--color-primary)]"
                            placeholder="Search by client"
                          />
                        </label>

                        <select
                          value={bookingSortMode}
                          onChange={(event) =>
                            setBookingSortMode(event.target.value as BookingSortMode)
                          }
                          className="h-10 rounded-md border border-white/10 bg-[#101010] px-3 text-sm font-medium text-white outline-none transition focus:border-[var(--color-primary)]"
                          aria-label="Sort sessions"
                        >
                          <option value="upcoming">Soonest upcoming</option>
                          <option value="newest">Newest bookings</option>
                          <option value="oldest">Oldest bookings</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 lg:flex-row lg:items-center lg:justify-between">
                    <label className="relative min-w-0 flex-1 lg:max-w-md">
                      <Search
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={bookingSearchTerm}
                        onChange={(event) =>
                          setBookingSearchTerm(event.target.value)
                        }
                        className="h-11 w-full rounded-md border border-white/10 bg-[#101010] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-[var(--color-primary)]"
                        placeholder="Search by client name"
                      />
                    </label>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">
                        Sort
                      </span>
                      <select
                        value={bookingSortMode}
                        onChange={(event) =>
                          setBookingSortMode(event.target.value as BookingSortMode)
                        }
                        className="h-11 rounded-md border border-white/10 bg-[#101010] px-3 text-sm font-medium text-white outline-none transition focus:border-[var(--color-primary)]"
                      >
                        <option value="upcoming">Soonest upcoming</option>
                        <option value="newest">Newest bookings</option>
                        <option value="oldest">Oldest bookings</option>
                      </select>
                    </div>
                  </div>
                )}

                {visibleBookings.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                      <Search size={22} />
                    </div>
                    <h2 className="mt-4 text-xl! font-semibold! text-white">
                      No matching bookings
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
                      Try another client name or clear the search to return to
                      all {activeTab === "bookings" ? (bookingStatusFilter === "all" ? "bookings" : `${activeBookingFilterLabel.toLowerCase()} bookings`) : activeTab === "sessions" ? "active session records" : activeTab === "projects" ? "projects" : "bookings"}.
                    </p>
                  </div>
                ) : activeTab === "sessions" ? (
                  <SessionsTable
                    sessions={visibleBookings as DashboardBooking[]}
                    onOpenRecord={(booking) => setSelectedBookingRecord(booking)}
                    onOpenProject={(booking) => {
                      setActiveTab("projects");
                      setBookingStatusFilter("all");
                      setSessionReadinessFilter("all");
                      setSelectedBookingRecord(booking);
                    }}
                    onStart={(booking) => setBookingToStart(booking)}
                    onComplete={handleCompleteSessionFromRow}
                    onRequestPayment={(booking) =>
                      setSessionPaymentBooking(booking)
                    }
                    hasActiveSession={hasActiveSessionInProgress}
                  />
                ) : activeTab === "projects" ? (
                  <ProjectsTable
                    projects={visibleBookings as DashboardBooking[]}
                    onOpenRecord={(booking) => setSelectedBookingRecord(booking)}
                    onBalancePaid={handleBalancePaidFromRow}
                    onRequestPayment={(booking) =>
                      setSessionPaymentBooking(booking)
                    }
                    onAddSessions={handleOpenAddedSessionsModal}
                  />
                ) : (
                  <ArtistBookingsTable
                    bookings={visibleBookings as DashboardBooking[]}
                    onOpenRecord={(booking) => setSelectedBookingRecord(booking)}
                    onOpenProjectRecord={(booking) => {
                      setActiveTab("projects");
                      setBookingStatusFilter("all");
                      setSessionReadinessFilter("all");
                      setSelectedBookingRecord(booking);
                    }}
                    onViewInSessions={() => {
                      setActiveTab("sessions");
                      setBookingStatusFilter("all");
                      setSessionReadinessFilter("all");
                    }}
                    onBalancePaid={handleBalancePaidFromRow}
                    hasActiveSession={hasActiveSessionInProgress}
                  />
                )}
              </>
            )}
          </section>
        )}

        {activeTab === "flashes" && uid && (
          <FlashManager
            uid={uid}
            artist={artist}
            onOpenPayments={() => setActiveTab("payments")}
          />
        )}
        {activeTab === "gallery" && uid && <GalleryManager uid={uid} />}
        {activeTab === "payments" && (
          <div className="mt-6 w-full max-w-5xl space-y-6">
            <PaymentPreferencesPanel
              form={paymentPreferencesForm}
              isDirty={isPaymentPreferencesDirty}
              isSaving={isSavingPaymentPreferences}
              isSaveDisabled={isPaymentPreferencesSaveDisabled}
              onChange={updatePaymentPreferencesForm}
              onReset={resetPaymentPreferencesForm}
              onSave={handleSavePaymentPreferences}
            />
            <StripeConnectPanel artist={artist} />
          </div>
        )}
        {activeTab === "calendar" && uid && (
          <CalendarSyncPanel
            feedUrl={`https://satxink.com/calendars/${uid}.ics?token=${
              artist?.calendarToken || "defaultToken"
            }`}
          />
        )}

        <MakeOfferModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          selectedRequest={selectedBooking}
          depositAmount={depositAmount}
          setDepositAmount={setDepositAmount}
          offerPrice={offerPrice}
          setOfferPrice={setOfferPrice}
          offerMessage={offerMessage}
          setOfferMessage={setOfferMessage}
          dateOptions={dateOptions}
          setDateOptions={setDateOptions}
          artist={artist}
          uid={uid!}
          onOfferSent={(requestId) => {
            setBookingRequests((current) =>
              current.filter((request) => request.id !== requestId)
            );
            setNavCounts((current) => ({
              ...current,
              requests: Math.max((current.requests || 0) - 1, 0),
              offers: (current.offers || 0) + 1,
            }));
          }}
        />
        <BookingRecordDialog
          booking={selectedBookingRecord}
          onClose={() => setSelectedBookingRecord(null)}
          isSessionView={activeTab === "sessions"}
          showProjectControls={activeTab === "projects"}
          currentUserId={uid}
          onAddSessions={handleOpenAddedSessionsModal}
          onSessionStarted={() => {
            setSelectedBookingRecord(null);
            setActiveTab("sessions");
          }}
        />
        <ConfirmStartSessionDialog
          booking={bookingToStart}
          onClose={() => setBookingToStart(null)}
          onConfirm={handleConfirmStartSession}
        />
      </main>
    </div>
  );
};

type DashboardBooking = Booking & {
  clientFirstName?: string;
  clientLastName?: string;
  clientName?: string;
  clientAvatar?: string;
  user?: {
    firstName?: string;
    lastName?: string;
    name?: string;
    displayName?: string;
    avatarUrl?: string;
  };
  message?: string;
  description?: string;
};

const BookingMetricCard = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <div className="min-w-0 px-2.5! py-1! sm:px-3!">
    <p className="truncate text-[9px]! uppercase tracking-[0.1em] text-neutral-500 sm:text-[10px]! sm:tracking-[0.14em]">
      {label}
    </p>
    <p className="mt-1 truncate text-base! font-semibold leading-none text-white sm:text-lg!">
      {value}
    </p>
  </div>
);

const ArtistBookingsTable = ({
  bookings,
  onOpenRecord,
  onOpenProjectRecord,
  onViewInSessions,
  onBalancePaid,
  hasActiveSession,
}: {
  bookings: DashboardBooking[];
  onOpenRecord: (booking: DashboardBooking) => void;
  onOpenProjectRecord: (booking: DashboardBooking) => void;
  onViewInSessions: (booking: DashboardBooking) => void;
  onBalancePaid: (booking: DashboardBooking) => void;
  hasActiveSession: boolean;
}) => {
  const columns =
    "minmax(200px,1fr) 84px minmax(138px,.6fr) minmax(165px,.72fr) minmax(165px,.72fr) minmax(180px,.86fr) minmax(250px,.96fr)";

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
      <div className="request-modal-scrollbar overflow-x-auto">
        <div className="min-w-[1250px]">
          <div
            className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
            style={{ gridTemplateColumns: columns }}
          >
            <span>Client</span>
            <span>Reference</span>
            <span>Booking status</span>
            <span>Session</span>
            <span>Money</span>
            <span>Scheduled</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-white/10">
            {bookings.map((booking) => (
              <ArtistBookingRow
                key={booking.id}
                booking={booking}
                columns={columns}
                onOpenRecord={() => onOpenRecord(booking)}
                onOpenProjectRecord={() => onOpenProjectRecord(booking)}
                onViewInSessions={() => onViewInSessions(booking)}
                onBalancePaid={() => onBalancePaid(booking)}
                hasActiveSession={hasActiveSession}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ArtistBookingRow = ({
  booking,
  columns,
  onOpenRecord,
  onOpenProjectRecord,
  onViewInSessions,
  onBalancePaid,
  hasActiveSession,
}: {
  booking: DashboardBooking;
  columns: string;
  onOpenRecord: () => void;
  onOpenProjectRecord: () => void;
  onViewInSessions: () => void;
  onBalancePaid: () => void;
  hasActiveSession: boolean;
}) => {
  const appointmentLabel =
    booking.selectedDate?.date && booking.selectedDate?.time
      ? formatBookingAppointment(booking.selectedDate)
      : "No date set";
  const canViewInSessions = canStartBookingSession(booking);
  const canConfirmInShopPayment = canConfirmBookingInShopPayment(booking);
  const canOpenInProjects = isOngoingProjectBooking(booking);
  const clientName = getDashboardClientName(booking);
  const clientTableName = getDashboardClientFirstName(booking);
  const clientTitle = getFullClientNameTitle(clientName, clientTableName);

  return (
    <div
      className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
      style={{ gridTemplateColumns: columns }}
    >
      <button
        type="button"
        onClick={onOpenRecord}
        className="flex min-w-0 items-center gap-3 p-0! text-left"
      >
        <img
          src={getDashboardClientAvatar(booking)}
          alt={clientName}
          className="h-11 w-11 rounded-full border border-white/10 object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white" title={clientTitle}>
            {clientTableName}
          </p>
          <p className="text-sm text-neutral-400">
            Created {formatDashboardDate(booking.createdAt || booking.paidAt)}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={onOpenRecord}
        className="relative h-14 w-16 overflow-hidden rounded-md border border-white/10 bg-white/[0.035] p-0!"
        aria-label="View booking sample"
      >
        {booking.sampleImageUrl ? (
          <img
            src={booking.sampleImageUrl}
            alt="Booking sample"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-neutral-500">
            <ImageIcon size={18} />
          </span>
        )}
      </button>

      <div className="pr-3">
        <BookingStatusBadge status={booking.status} />
      </div>

      <BookingSessionCell booking={booking} />

      <div className="min-w-0 pr-4">
        <p className="truncate text-sm font-semibold text-white">
          {formatDashboardMoney(booking.price)}{" "}
          <span className="text-neutral-600">|</span>{" "}
          {formatDashboardMoney(booking.depositAmount)}
        </p>
      </div>

      <div className="min-w-0 pr-4">
        <p className="truncate text-sm font-medium text-white">
          {appointmentLabel}
        </p>
        <p className="mt-1 truncate text-xs text-neutral-500">
          {booking.shopName || "Private Studio"}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        {canViewInSessions && (
          <button
            type="button"
            onClick={onViewInSessions}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-sky-300/25 bg-sky-300/10 px-3! text-xs! font-semibold text-sky-100 transition hover:bg-sky-300/15"
            title={
              hasActiveSession
                ? "Another session is already active. View the Sessions workspace."
                : "Start this appointment from Sessions."
            }
          >
            <CalendarDays size={14} />
            View in Sessions
          </button>
        )}
        {canConfirmInShopPayment && (
          <button
            type="button"
            onClick={onBalancePaid}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3! text-xs! font-semibold text-emerald-100 transition hover:bg-emerald-300/15"
          >
            <DollarSign size={14} />
            Confirm paid
          </button>
        )}
        {canOpenInProjects && (
          <button
            type="button"
            onClick={onOpenProjectRecord}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white transition hover:bg-white/10"
          >
            <CalendarDays size={14} />
            Projects
          </button>
        )}
        <button
          type="button"
          onClick={onOpenRecord}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white transition hover:bg-white/10"
        >
          <Eye size={14} />
          Record
        </button>
      </div>
    </div>
  );
};

type PaymentPreferencesPanelProps = {
  form: ArtistPaymentPreferencesFormState;
  isDirty: boolean;
  isSaving: boolean;
  isSaveDisabled: boolean;
  onChange: (
    updater:
      | Partial<ArtistPaymentPreferencesFormState>
      | ((
          current: ArtistPaymentPreferencesFormState
        ) => ArtistPaymentPreferencesFormState)
  ) => void;
  onReset: () => void;
  onSave: () => void;
};

const PaymentPreferencesPanel = ({
  form,
  isDirty,
  isSaving,
  isSaveDisabled,
  onChange,
  onReset,
  onSave,
}: PaymentPreferencesPanelProps) => (
    <section className="rounded-xl border border-white/10 bg-[#101010]/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] sm:p-5">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
            <CreditCard size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="mb-0! text-xl! font-semibold text-white">
              Payment preferences
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
              Stripe collects every SATX Ink deposit. Remaining balances can be
              handled through Stripe or settled directly with the artist per
              offer.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onReset}
            disabled={!isDirty || isSaving}
            className="inline-flex min-h-0! items-center justify-center gap-2 rounded-lg! border border-white/10 bg-white/[0.02] px-3! py-2! text-xs! font-semibold text-neutral-300 transition hover:border-white/25 hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCcw size={14} aria-hidden="true" />
            Reset
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaveDisabled}
            className={`inline-flex min-h-0! items-center justify-center gap-2 rounded-lg! px-4! py-2! text-xs! font-semibold transition disabled:cursor-not-allowed ${
              isDirty
                ? "bg-white text-[#0b0b0b]! shadow-[0_12px_28px_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] hover:bg-white/90"
                : "border border-white/10 bg-white/[0.03] text-neutral-500 disabled:opacity-50"
            }`}
          >
            <Save
              size={14}
              className={isDirty ? "text-[#0b0b0b]!" : ""}
              aria-hidden="true"
            />
            {isSaving ? "Saving..." : "Save preferences"}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.045] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-300/10 text-emerald-300">
              <ShieldCheck size={15} aria-hidden="true" />
            </span>
            <div>
              <div className="text-sm font-semibold text-white">
                Stripe deposits
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-emerald-50/70">
                Deposits are always required, non-refundable, and collected
                through SATX Ink checkout before a booking is confirmed.
              </p>
            </div>
          </div>
          <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
            Always on
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3.5 sm:p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="mb-0! text-sm! font-semibold text-white">
              Final payment terms
            </h3>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Set the default timing clients see before accepting an offer.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["before", "after"] as FinalPaymentTiming[]).map((timing) => (
              <button
                key={timing}
                type="button"
                onClick={() => onChange({ finalPaymentTiming: timing })}
                className={`min-h-0! rounded-lg! border px-4! py-2.5! text-sm! font-semibold transition ${
                  form.finalPaymentTiming === timing
                    ? "border-white/30 bg-white text-black"
                    : "border-white/10 bg-black/25 text-neutral-400 hover:border-white/25 hover:text-white"
                }`}
              >
                {timing === "before" ? "Before appointment" : "After appointment"}
              </button>
            ))}
          </div>
        </div>

        {form.finalPaymentTiming === "before" && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Deadline
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {FINAL_PAYMENT_DEADLINE_OPTIONS.map((option) => (
                <button
                  key={option.hours}
                  type="button"
                  onClick={() =>
                    onChange({ finalPaymentDeadlineHours: option.hours })
                  }
                  className={`min-h-0! rounded-lg! border px-4! py-2.5! text-sm! font-semibold transition ${
                    form.finalPaymentDeadlineHours === option.hours
                      ? "border-white/30 bg-white text-black"
                      : "border-white/10 bg-black/25 text-neutral-400 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
);

const ArtistDashboardProfileHeader = ({
  artist,
}: {
  artist: DashboardArtist;
}) => {
  const artistDisplayName = artist.displayName || artist.name || "Artist";
  const artistStyles = Array.isArray(artist.specialties)
    ? artist.specialties.filter(Boolean)
    : [];
  const socialLinks = getArtistDashboardSocialLinks(artist);

  return (
    <section
      aria-label="Artist profile summary"
      className="w-full max-w-6xl py-1 sm:py-2"
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <img
          src={artist.avatarUrl || "/fallback-avatar.jpg"}
          alt={artistDisplayName}
          decoding="async"
          className="aspect-square h-14 w-14 shrink-0 rounded-full object-cover shadow-[0_14px_34px_rgba(0,0,0,0.38),0_0_0_1px_rgba(255,255,255,0.14)] sm:h-[72px] sm:w-[72px]"
        />

        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="my-0! min-w-0 truncate text-xl! font-semibold leading-tight text-white sm:text-2xl!">
              {artistDisplayName}
            </h1>
          </div>

          {(artistStyles.length > 0 || socialLinks.length > 0) && (
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              {artistStyles.length > 0 && (
                <ul className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold leading-none text-neutral-300 sm:text-[11px]">
                  {artistStyles.map((style, index) => (
                    <li key={style} className="inline-flex items-center gap-2">
                      {index > 0 && (
                        <span
                          className="h-1 w-1 rounded-full bg-white/20"
                          aria-hidden="true"
                        />
                      )}
                      <span>{style}</span>
                    </li>
                  ))}
                </ul>
              )}

              {socialLinks.length > 0 && (
                <div className="flex shrink-0 items-center gap-1.5">
                  {socialLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={link.label}
                      title={link.label}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-white/85 transition hover:bg-white/[0.06] hover:text-white sm:h-7 sm:w-7"
                    >
                      {link.icon}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const getArtistDashboardSocialLinks = (artist: DashboardArtist) =>
  [
    {
      label: "Instagram",
      value: artist.socialLinks?.instagram,
      icon: <RiInstagramFill size={20} />,
    },
    {
      label: "Facebook",
      value: artist.socialLinks?.facebook,
      icon: <FaFacebook size={19} />,
    },
    {
      label: "Website",
      value: artist.socialLinks?.website,
      icon: <Globe size={19} />,
    },
  ]
    .filter((link) => Boolean(link.value?.trim()))
    .map((link) => ({
      label: link.label,
      href: normalizeUrl(link.value as string),
      icon: link.icon,
    }));

const SessionsTable = ({
  sessions,
  onOpenRecord,
  onOpenProject,
  onStart,
  onComplete,
  onRequestPayment,
  hasActiveSession,
}: {
  sessions: DashboardBooking[];
  onOpenRecord: (booking: DashboardBooking) => void;
  onOpenProject: (booking: DashboardBooking) => void;
  onStart: (booking: DashboardBooking) => void;
  onComplete: (booking: DashboardBooking) => void;
  onRequestPayment: (booking: DashboardBooking) => void;
  hasActiveSession: boolean;
}) => {
  const [uploadingBookingId, setUploadingBookingId] = useState<string | null>(
    null
  );
  const activeColumns =
    "minmax(300px,1fr) minmax(150px,.46fr) minmax(300px,.9fr) minmax(380px,1fr)";
  const upcomingColumns =
    "minmax(300px,1fr) minmax(150px,.46fr) minmax(280px,.86fr) minmax(230px,.72fr) minmax(360px,1fr)";
  const activeSessions = sessions.filter(
    (booking) => booking.sessionStatus === "in_progress"
  );
  const upcomingSessions = sessions.filter(
    (booking) => booking.sessionStatus !== "in_progress"
  );

  const handleInlinePhotoUpload = async (
    booking: DashboardBooking,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }

    setUploadingBookingId(booking.id);
    try {
      await uploadBookingSessionPhoto(booking, file);
      toast.success("Session photo saved.");
    } catch (error) {
      console.error("Session photo upload failed:", error);
      toast.error("Could not upload the session photo.");
    } finally {
      setUploadingBookingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="mb-0! text-lg! font-semibold! text-white">
              Active Session
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              The appointment currently in progress.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-neutral-300">
            {activeSessions.length}
          </span>
        </div>

        {activeSessions.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 text-sm text-neutral-400">
            No session is currently active. Start the next ready appointment from Upcoming Sessions.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
            <div className="request-modal-scrollbar overflow-x-auto">
              <div className="min-w-[1130px]">
                <div
                  className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
                  style={{ gridTemplateColumns: activeColumns }}
                >
                  <span>Client / Reference</span>
                  <span>Session</span>
                  <span>Appointment</span>
                  <span className="text-right">Actions</span>
                </div>

                <div className="divide-y divide-white/10">
                  {activeSessions.map((booking) => {
                    const clientName = getDashboardClientName(booking);
                    const clientAvatar = getDashboardClientAvatar(booking);
                    const activeSessionNumber = getActiveSessionNumber(booking);
                    const sessionCount = getEstimatedSessionCount(booking);
                    const sessionLabel = `${activeSessionNumber} / ${sessionCount}`;
                    const isUploadingPhoto = uploadingBookingId === booking.id;

                    return (
                      <div
                        key={booking.id}
                        className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
                        style={{ gridTemplateColumns: activeColumns }}
                      >
                        <SessionClientCell
                          booking={booking}
                          clientName={clientName}
                          clientAvatar={clientAvatar}
                          onOpenRecord={() => onOpenRecord(booking)}
                        />

                        <div className="min-w-0 pr-4">
                          <p className="truncate text-sm font-semibold text-white">
                            {sessionLabel}
                          </p>
                          <div className="mt-1">
                            <SessionStatusBadge status="in_progress" />
                          </div>
                        </div>

                        <SessionAppointmentCell booking={booking} />

                        <div className="flex flex-nowrap items-center justify-end gap-2">
                          <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10">
                            <Camera size={14} />
                            {isUploadingPhoto ? "Uploading..." : "Add photo"}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isUploadingPhoto}
                              onChange={(event) =>
                                handleInlinePhotoUpload(booking, event)
                              }
                              className="sr-only"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={isUploadingPhoto}
                            onClick={() => onComplete(booking)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Check size={14} />
                            Complete session
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenRecord(booking)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
                          >
                            <Eye size={14} />
                            Details
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="mb-0! text-lg! font-semibold! text-white">
              Upcoming Sessions
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Start ready appointments, or open records that need a date or project follow-up.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-neutral-300">
            {upcomingSessions.length}
          </span>
        </div>

        {upcomingSessions.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 text-sm text-neutral-400">
            No upcoming sessions match the current filters.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
            <div className="request-modal-scrollbar overflow-x-auto">
              <div className="min-w-[1320px]">
                <div
                  className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
                  style={{ gridTemplateColumns: upcomingColumns }}
                >
                  <span>Client / Reference</span>
                  <span>Session</span>
                  <span>Appointment</span>
                  <span>State</span>
                  <span className="text-right">Actions</span>
                </div>

                <div className="divide-y divide-white/10">
                  {upcomingSessions.map((booking) => {
                    const clientName = getDashboardClientName(booking);
                    const clientAvatar = getDashboardClientAvatar(booking);
                    const sessionStatus = booking.sessionStatus || "not_started";
                    const activeSessionNumber = getActiveSessionNumber(booking);
                    const sessionCount = getEstimatedSessionCount(booking);
                    const sessionLabel = `${activeSessionNumber} / ${sessionCount}`;
                    const readiness = getSessionReadinessFilterValue(booking);
                    const startBlockReason = getSessionStartBlockReason(booking);
                    const canStart = !startBlockReason;
                    const shouldPlanNext = readiness === "needs_schedule";
                    const shouldOpenProject =
                      shouldPlanNext || readiness === "follow_up";
                    const canRequestPayment =
                      canRequestProjectSessionPayment(booking);

                    return (
                      <div
                        key={booking.id}
                        className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
                        style={{ gridTemplateColumns: upcomingColumns }}
                      >
                        <SessionClientCell
                          booking={booking}
                          clientName={clientName}
                          clientAvatar={clientAvatar}
                          onOpenRecord={() => onOpenRecord(booking)}
                        />

                        <div className="min-w-0 pr-4">
                          <p className="truncate text-sm font-semibold text-white">
                            {sessionLabel}
                          </p>
                          <div className="mt-1">
                            <SessionStatusBadge status={sessionStatus} />
                          </div>
                        </div>

                        <SessionAppointmentCell booking={booking} />
                        <SessionStateCell booking={booking} />

                        <div className="flex flex-nowrap items-center justify-end gap-2">
                          {canRequestPayment && (
                            <button
                              type="button"
                              onClick={() => onRequestPayment(booking)}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3! py-2! text-xs! font-semibold text-emerald-100 transition hover:bg-emerald-300/15"
                            >
                              <DollarSign size={14} />
                              Request payment
                            </button>
                          )}
                          {(canStart || startBlockReason) && (
                            <button
                              type="button"
                              disabled={hasActiveSession || Boolean(startBlockReason)}
                              onClick={() => onStart(booking)}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                              title={
                                startBlockReason ||
                                (hasActiveSession
                                  ? "Complete the active session before starting another."
                                  : "Start this session")
                              }
                            >
                              <CalendarDays size={14} />
                              Start session
                            </button>
                          )}
                          {shouldPlanNext && (
                            <button
                              type="button"
                              onClick={() => onOpenProject(booking)}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-amber-300/25 bg-amber-300/10 px-3! py-2! text-xs! font-semibold text-amber-100 transition hover:bg-amber-300/15"
                            >
                              <CalendarDays size={14} />
                              Plan next
                            </button>
                          )}
                          {!shouldPlanNext && shouldOpenProject && (
                            <button
                              type="button"
                              onClick={() => onOpenProject(booking)}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
                            >
                              <CalendarDays size={14} />
                              Projects
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenRecord(booking)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
                          >
                            <Eye size={14} />
                            Details
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

const SessionClientCell = ({
  booking,
  clientName,
  clientAvatar,
  onOpenRecord,
}: {
  booking: DashboardBooking;
  clientName: string;
  clientAvatar: string;
  onOpenRecord: () => void;
}) => {
  const clientTableName = getDashboardClientFirstName(booking);
  const clientTitle = getFullClientNameTitle(clientName, clientTableName);

  return (
    <button
      type="button"
      onClick={onOpenRecord}
      className="flex min-w-0 items-center gap-3 pr-4 text-left"
    >
      <span className="flex min-w-0 items-center gap-3">
        <img
          src={clientAvatar}
          alt={clientName}
          className="h-11 w-11 rounded-full border border-white/10 object-cover"
        />
        <span className="min-w-0">
          <span
            className="block truncate text-sm font-semibold text-white"
            title={clientTitle}
          >
            {clientTableName}
          </span>
          <span className="mt-0.5 block truncate text-xs uppercase tracking-[0.12em] text-neutral-500">
            Booking {getShortBookingId(booking.id)}
          </span>
        </span>
      </span>
      <span className="ml-auto hidden h-14 w-16 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.035] sm:block">
        {booking.sampleImageUrl ? (
          <img
            src={booking.sampleImageUrl}
            alt="Session reference"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-neutral-500">
            <ImageIcon size={17} />
          </span>
        )}
      </span>
    </button>
  );
};

const SessionAppointmentCell = ({ booking }: { booking: DashboardBooking }) => {
  const appointment = getSessionAppointmentDisplay(booking);

  return (
    <div className="min-w-0 pr-3">
      <p className={`truncate text-sm font-semibold ${appointment.className}`}>
        {appointment.primary}
      </p>
      <p className="mt-1 truncate text-xs text-neutral-500">
        {appointment.secondary}
      </p>
      <p className="mt-1 truncate text-xs text-neutral-600">
        {appointment.detail}
      </p>
    </div>
  );
};

const SessionStateCell = ({ booking }: { booking: DashboardBooking }) => {
  const readiness = getSessionReadinessDisplay(booking);

  return (
    <div className="min-w-0 pr-4">
      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${readiness.className}`}>
        {readiness.label}
      </span>
      <p className="mt-1 truncate text-xs text-neutral-500">
        {readiness.description}
      </p>
    </div>
  );
};

const ProjectsTable = ({
  projects,
  onOpenRecord,
  onBalancePaid,
  onRequestPayment,
  onAddSessions,
}: {
  projects: DashboardBooking[];
  onOpenRecord: (booking: DashboardBooking) => void;
  onBalancePaid: (booking: DashboardBooking) => void;
  onRequestPayment: (booking: DashboardBooking) => void;
  onAddSessions: (booking: DashboardBooking) => void;
}) => {
  const columns =
    "minmax(260px,1.1fr) minmax(230px,.9fr) minmax(230px,.9fr) minmax(170px,.62fr) minmax(380px,1.25fr)";
  const totalOpenBalance = projects.reduce(
    (total, booking) => total + getDashboardRemainingBalance(booking),
    0
  );
  const projectedNextInstallmentTotal = projects.reduce(
    (total, booking) => total + getDashboardSessionInstallmentAmount(booking),
    0
  );
  const paymentFollowUpCount = projects.filter(hasProjectPaymentFollowUp).length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
        <div className="grid gap-4 md:grid-cols-3 md:divide-x md:divide-white/10">
          <ProjectBalanceStat
            label="Open artist balance"
            value={formatDashboardMoney(totalOpenBalance)}
          />
          <ProjectBalanceStat
            label="Projected next due"
            value={formatDashboardMoney(projectedNextInstallmentTotal)}
          />
          <ProjectBalanceStat
            label="Payment follow-up"
            value={paymentFollowUpCount}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
        <div className="request-modal-scrollbar overflow-x-auto">
          <div className="min-w-[1270px]">
            <div
              className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
              style={{ gridTemplateColumns: columns }}
            >
              <span>Client</span>
              <span>Progress</span>
              <span>Schedule</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>

            <div className="divide-y divide-white/10">
              {projects.map((booking) => {
                const clientName = getDashboardClientName(booking);
                const clientTableName = getDashboardClientFirstName(booking);
                const clientTitle = getFullClientNameTitle(
                  clientName,
                  clientTableName
                );
                const clientAvatar = getDashboardClientAvatar(booking);
                const completedCount = Number(booking.completedSessionCount || 0);
                const sessionCount = getEstimatedSessionCount(booking);
                const activeSessionNumber = getActiveSessionNumber(booking);
                const progress = Math.min((completedCount / sessionCount) * 100, 100);
                const canConfirmInShopPayment = canConfirmBookingInShopPayment(booking);
                const canRequestPayment = canRequestProjectSessionPayment(booking);
                const canAddSessions = canProposeProjectScopeChange(booking);
                const projectQuickAction = getProjectQuickAction(booking);

                return (
                  <div
                    key={booking.id}
                    className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
                    style={{ gridTemplateColumns: columns }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenRecord(booking)}
                      className="flex min-w-0 items-center gap-3 p-0! pr-4 text-left"
                    >
                      <img
                        src={clientAvatar}
                        alt={clientName}
                        className="h-11 w-11 rounded-full border border-white/10 object-cover"
                      />
                      <span className="min-w-0">
                        <span
                          className="block truncate font-semibold text-white"
                          title={clientTitle}
                        >
                          {clientTableName}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-neutral-500">
                          {getProjectStartLabel(booking)}
                        </span>
                      </span>
                    </button>

                    <div className="min-w-0 pr-4">
                      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-neutral-500">
                        <span>
                          {completedCount}/{sessionCount} sessions
                        </span>
                        <span className="font-medium text-white">
                          {Math.round(progress)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="min-w-0 pr-4">
                      <p className="truncate text-sm font-semibold text-white">
                        Session {activeSessionNumber}/{sessionCount}
                      </p>
                      <p className="mt-1 truncate text-xs text-neutral-500">
                        {hasScheduledAppointment(booking)
                          ? formatBookingAppointment(booking.selectedDate)
                          : "Needs scheduling"}
                      </p>
                    </div>

                    <ProjectLedgerStatusBadge booking={booking} />

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {canRequestPayment ? (
                        <button
                          type="button"
                          onClick={() => onRequestPayment(booking)}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3! text-xs! font-semibold text-emerald-100 transition hover:bg-emerald-300/15"
                        >
                          <DollarSign size={14} />
                          Request payment
                        </button>
                      ) : canConfirmInShopPayment ? (
                        <button
                          type="button"
                          onClick={() => onBalancePaid(booking)}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3! text-xs! font-semibold text-emerald-100 transition hover:bg-emerald-300/15"
                        >
                          <DollarSign size={14} />
                          Confirm paid
                        </button>
                      ) : projectQuickAction ? (
                        <button
                          type="button"
                          onClick={() => onOpenRecord(booking)}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-amber-300/25 bg-amber-300/10 px-3! text-xs! font-semibold text-amber-100 transition hover:bg-amber-300/15"
                        >
                          <CalendarDays size={14} />
                          {projectQuickAction}
                        </button>
                      ) : null}

                      {canAddSessions && (
                        <button
                          type="button"
                          onClick={() => onAddSessions(booking)}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white transition hover:bg-white/10"
                        >
                          <CalendarDays size={14} />
                          Add sessions
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenRecord(booking)}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3! text-xs! font-semibold text-white transition hover:bg-white/10"
                      >
                        <Eye size={14} />
                        Open project record
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProjectBalanceStat = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <div className="min-w-0 md:px-4 md:first:pl-0 md:last:pr-0">
    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      {label}
    </p>
    <p className="mt-1 truncate text-xl! font-semibold text-white">{value}</p>
  </div>
);

const ProjectLedgerStatusBadge = ({ booking }: { booking: DashboardBooking }) => {
  const status = booking.projectStatus || "active";
  const className =
    status === "paused"
      ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
      : status === "completed"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : "border-sky-300/20 bg-sky-300/10 text-sky-100";

  return (
    <div className="pr-4">
      <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}>
        {status}
      </span>
      <p className="mt-1 truncate text-xs capitalize text-neutral-500">
        {(booking.sessionStatus || "not_started").replace(/_/g, " ")}
      </p>
    </div>
  );
};

const ConfirmStartSessionDialog = ({
  booking,
  onClose,
  onConfirm,
}: {
  booking: DashboardBooking | null;
  onClose: () => void;
  onConfirm: () => void;
}) => (
  <Transition appear show={!!booking} as={Fragment}>
    <Dialog as="div" className="relative z-50" onClose={onClose}>
      <Transition.Child
        as={Fragment}
        enter="ease-out duration-200"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-in duration-150"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />
      </Transition.Child>

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="scale-95 opacity-0"
          enterTo="scale-100 opacity-100"
          leave="ease-in duration-150"
          leaveFrom="scale-100 opacity-100"
          leaveTo="scale-95 opacity-0"
        >
          <Dialog.Panel className="w-full max-w-md rounded-lg border border-white/10 bg-[#111111] p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Confirm session start
                </p>
                <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                  Start this appointment?
                </Dialog.Title>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                aria-label="Cancel start session"
              >
                <X size={18} />
              </button>
            </div>

            {booking && (
              <div className="mt-5 rounded-md border border-white/10 bg-black/25 p-4">
                <p className="font-semibold text-white">
                  {getDashboardClientName(booking)}
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  {formatBookingAppointment(booking.selectedDate)}
                </p>
              </div>
            )}

            <p className="mt-4 text-sm leading-6 text-neutral-400">
              This moves the booking into the Sessions workspace so you can complete
              the session record, add photos, and manage any remaining balance.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-4! py-3! text-sm! font-semibold text-white transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4! py-3! text-sm! font-semibold text-black transition hover:bg-white/85"
              >
                <CalendarDays size={16} />
                Start session
              </button>
            </div>
          </Dialog.Panel>
        </Transition.Child>
      </div>
    </Dialog>
  </Transition>
);

const BookingRecordDialog = ({
  booking,
  onClose,
  isSessionView,
  showProjectControls,
  currentUserId,
  onAddSessions,
  onSessionStarted,
}: {
  booking: DashboardBooking | null;
  onClose: () => void;
  isSessionView: boolean;
  showProjectControls: boolean;
  currentUserId: string | null;
  onAddSessions: (booking: DashboardBooking) => void;
  onSessionStarted: () => void;
}) => {
  const [sessionStatus, setSessionStatus] =
    useState<Booking["sessionStatus"]>("not_started");
  const [sessionPhotoUrls, setSessionPhotoUrls] = useState<string[]>([]);
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);
  const [isUploadingSessionPhoto, setIsUploadingSessionPhoto] = useState(false);
  const [pendingAmendments, setPendingAmendments] = useState<ProjectAmendment[]>([]);
  const [scheduleProposalBooking, setScheduleProposalBooking] =
    useState<DashboardBooking | null>(null);
  const [pauseDialogMode, setPauseDialogMode] =
    useState<"pause" | "resume" | null>(null);

  useEffect(() => {
    setSessionStatus(booking?.sessionStatus || "not_started");
    setSessionPhotoUrls(booking?.sessionPhotoUrls || []);
  }, [booking]);

  useEffect(() => {
    if (!booking?.id) {
      setPendingAmendments([]);
      return;
    }

    const amendmentsQuery = query(
      collection(db, "bookings", booking.id, "amendments"),
      where("status", "==", "proposed")
    );

    return onSnapshot(
      amendmentsQuery,
      (snap) => {
        setPendingAmendments(
          snap.docs.map((amendmentDoc) => ({
            id: amendmentDoc.id,
            ...amendmentDoc.data(),
          })) as ProjectAmendment[]
        );
      },
      (error) => {
        console.error("Artist project amendment listener failed:", error);
        setPendingAmendments([]);
      }
    );
  }, [booking?.id]);

  const clientName = booking ? getDashboardClientName(booking) : "Client";
  const clientAvatar =
    booking?.user?.avatarUrl ||
    booking?.clientAvatar ||
    "/default-avatar.png";
  const remainingBalance =
    typeof booking?.remainingBalanceAmount === "number"
      ? Math.max(booking.remainingBalanceAmount, 0)
      : Math.max(
          Number(booking?.price || 0) -
            Number(booking?.totalArtistPaidAmount || booking?.depositAmount || 0),
          0
        );
  const isMultiSession = booking ? isDashboardMultiSessionBooking(booking) : false;
  const activeSessionNumber = booking ? getActiveSessionNumber(booking) : 1;
  const sessionCount = booking ? getEstimatedSessionCount(booking) : 1;
  const sessionInstallment = booking
    ? getDashboardSessionInstallmentAmount(booking)
    : 0;
  const sessionStartBlockReason = booking
    ? getSessionStartBlockReason(booking)
    : null;
  const showSessionWorkspace =
    booking?.status !== "pending_payment" &&
    isSessionView;

  const handleStartSession = async () => {
    if (!booking) return;

    setIsUpdatingSession(true);
    try {
      const startSession = httpsCallable(functions, "startProjectSession");
      await startSession({ bookingId: booking.id });
      setSessionStatus("in_progress");
      onSessionStarted();
      toast.success("Session started.");
    } catch (error) {
      console.error("Session start failed:", error);
      toast.error("Could not start the session.");
    } finally {
      setIsUpdatingSession(false);
    }
  };

  const handleCompleteSession = async () => {
    if (!booking) return;

    setIsUpdatingSession(true);
    try {
      const completeSession = httpsCallable(functions, "completeProjectSession");
      await completeSession({
        bookingId: booking.id,
        photoUrls: sessionPhotoUrls,
      });
      setSessionStatus("completed");
      toast.success("Session completed.");
    } catch (error) {
      console.error("Session completion failed:", error);
      toast.error("Could not complete the session.");
    } finally {
      setIsUpdatingSession(false);
    }
  };

  const handleSessionPhotoUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!booking || !file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }

    setIsUploadingSessionPhoto(true);
    try {
      const url = await uploadBookingSessionPhoto(booking, file);
      setSessionPhotoUrls((current) => [...current, url]);
      toast.success("Session photo saved.");
    } catch (error) {
      console.error("Session photo upload failed:", error);
      toast.error("Could not upload the session photo.");
    } finally {
      setIsUploadingSessionPhoto(false);
    }
  };

  const handleRespondToAmendment = async (
    amendmentId: string,
    response: "accepted" | "declined" | "cancelled"
  ) => {
    if (!booking) return;

    try {
      const respondToAmendment = httpsCallable(
        functions,
        "respondToProjectAmendment"
      );
      await respondToAmendment({
        bookingId: booking.id,
        amendmentId,
        response,
      });
      toast.success(
        response === "accepted"
          ? "Project amendment accepted."
          : response === "declined"
          ? "Project amendment declined."
          : "Project amendment cancelled."
      );
    } catch (error) {
      console.error("Artist project amendment response failed:", error);
      toast.error("Could not update the amendment.");
    }
  };

  const handleProposeNextSession = async (
    targetBooking: Booking,
    input: { date: string; time: string; message: string }
  ) => {
    try {
      const proposeAmendment = httpsCallable(
        functions,
        "proposeProjectAmendment"
      );
      await proposeAmendment({
        bookingId: targetBooking.id,
        type: "schedule_next_session",
        date: input.date,
        time: input.time,
        sessionNumber: getActiveSessionNumber(targetBooking),
        message: input.message,
      });
      toast.success("Next-session proposal sent to the client.");
    } catch (error) {
      console.error("Next-session proposal failed:", error);
      toast.error("Could not send the schedule proposal.");
      throw error;
    }
  };

  const handleSetProjectPaused = async (
    targetBooking: Booking,
    input: { reason: string; pausedUntil: string }
  ) => {
    const paused = pauseDialogMode === "pause";

    try {
      const setPaused = httpsCallable(functions, "setProjectPaused");
      await setPaused({
        bookingId: targetBooking.id,
        paused,
        reason: input.reason,
        pausedUntil: input.pausedUntil,
      });
      toast.success(paused ? "Project paused." : "Project resumed.");
    } catch (error) {
      console.error("Project pause update failed:", error);
      toast.error("Could not update project status.");
      throw error;
    }
  };

  return (
    <>
      <ProjectScheduleProposalDialog
        booking={scheduleProposalBooking}
        viewerRole="artist"
        onClose={() => setScheduleProposalBooking(null)}
        onSubmit={handleProposeNextSession}
      />
      <ProjectPauseDialog
        booking={pauseDialogMode ? booking : null}
        mode={pauseDialogMode || "pause"}
        viewerRole="artist"
        onClose={() => setPauseDialogMode(null)}
        onSubmit={handleSetProjectPaused}
      />
      <Transition appear show={!!booking} as={Fragment}>
      <Dialog as="div" className="relative z-[120] sm:z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 h-dvh bg-black/80 backdrop-blur-md" />
        </Transition.Child>

        <div className="fixed inset-0 h-dvh overflow-y-auto overscroll-contain request-modal-scrollbar">
          <div className="flex min-h-full items-start justify-center px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-4 sm:pb-4 sm:pt-[5.75rem] lg:pb-5">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="scale-95 opacity-0"
              enterTo="scale-100 opacity-100"
              leave="ease-in duration-150"
              leaveFrom="scale-100 opacity-100"
              leaveTo="scale-95 opacity-0"
            >
              <Dialog.Panel className="flex max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-white/10 bg-[#111111] text-white shadow-2xl sm:max-h-[calc(100dvh-5.75rem-1rem)] lg:max-h-[calc(100dvh-5.75rem-1.25rem)]">
                {booking && (
                  <>
                    <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Booking details
                        </p>
                        <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                          Appointment with {clientName}
                        </Dialog.Title>
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                        aria-label="Close booking details"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="grid min-h-0 gap-0 overflow-y-auto overscroll-contain request-modal-scrollbar lg:grid-cols-[1fr_0.95fr]">
                      <div className="border-b border-white/10 bg-black lg:border-b-0 lg:border-r">
                        {booking.sampleImageUrl ? (
                          <img
                            src={booking.sampleImageUrl}
                            alt="Booking sample"
                            className="h-full max-h-[72vh] min-h-[420px] w-full object-contain"
                          />
                        ) : (
                          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-white/[0.07] to-black text-neutral-500">
                            <ImageIcon size={34} />
                            <span>No sample image uploaded</span>
                          </div>
                        )}
                      </div>

                      <div className="p-5 sm:p-6">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-4">
                            <img
                              src={clientAvatar}
                              alt={clientName}
                              className="h-14 w-14 rounded-full border border-white/10 object-cover"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-white">
                                {clientName}
                              </p>
                              <p className="text-sm text-neutral-500">
                                {booking.shopName || "Studio not listed"}
                              </p>
                            </div>
                          </div>
                          <BookingStatusBadge status={booking.status} />
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                          <BookingDetailTile
                            icon={<DollarSign size={17} />}
                            label="Offer price"
                            value={formatDashboardMoney(booking.price)}
                          />
                          <BookingDetailTile
                            icon={<ReceiptText size={17} />}
                            label="Deposit"
                            value={formatDashboardMoney(booking.depositAmount)}
                          />
                          <BookingDetailTile
                            icon={<DollarSign size={17} />}
                            label="You were paid"
                            value={formatDashboardMoney(booking.totalArtistPaidAmount)}
                          />
                          <BookingDetailTile
                            icon={<CreditCard size={17} />}
                            label="Remaining"
                            value={formatDashboardMoney(remainingBalance)}
                          />
                          {isMultiSession && (
                            <>
                              <BookingDetailTile
                                icon={<CalendarDays size={17} />}
                                label="Session"
                                value={`${activeSessionNumber}/${sessionCount}`}
                              />
                              <BookingDetailTile
                                icon={<DollarSign size={17} />}
                                label="Session estimate"
                                value={formatDashboardMoney(sessionInstallment)}
                              />
                            </>
                          )}
                          <BookingDetailTile
                            icon={<CalendarDays size={17} />}
                            label="Appointment"
                            value={formatBookingAppointment(booking.selectedDate)}
                          />
                          <BookingDetailTile
                            icon={<Store size={17} />}
                            label="Payment"
                            value={
                              booking.paymentType === "internal"
                                ? "Stripe"
                                : "Direct"
                            }
                          />
                          <BookingDetailTile
                            icon={<CreditCard size={17} />}
                            label="Final terms"
                            value={getDashboardFinalPaymentTermsLabel(booking)}
                          />
                        </div>

                        {booking.remainingPaymentMethod === "external" && (
                          <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                            <p className="text-sm font-semibold text-white">
                              Direct remaining balance
                            </p>
                            <p className="mt-1 text-sm leading-6 text-emerald-50/75">
                              Settle this balance directly with the client
                              outside SATX Ink checkout.
                            </p>
                          </div>
                        )}

                        {booking.shopAddress && (
                          <a
                            href={booking.shopMapLink || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-5 flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300 transition hover:bg-white/[0.06]"
                          >
                            <MapPin
                              size={17}
                              className="mt-0.5 shrink-0 text-neutral-500"
                            />
                            {booking.shopAddress}
                          </a>
                        )}

                        <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                            <MessageSquareText size={17} />
                            Client notes
                          </div>
                          <p className="whitespace-pre-line text-sm leading-6 text-neutral-300">
                            {booking.message ||
                              booking.description ||
                              "No notes were included with this booking."}
                          </p>
                        </div>

                        {showProjectControls && (
                          <ProjectControlsPanel
                            booking={booking}
                            viewerRole="artist"
                            currentUserId={currentUserId}
                            amendments={pendingAmendments}
                            onRespondToAmendment={handleRespondToAmendment}
                            onAddSessions={() => onAddSessions(booking)}
                            onPlanNextSession={() =>
                              setScheduleProposalBooking(booking)
                            }
                            onPauseProject={() => setPauseDialogMode("pause")}
                            onResumeProject={() => setPauseDialogMode("resume")}
                          />
                        )}

                        {showSessionWorkspace && (
                          <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {isSessionView
                                    ? isMultiSession
                                      ? `Session ${activeSessionNumber} of ${sessionCount}`
                                      : "Sessions workspace"
                                    : "Ready to start session"}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-emerald-50/75">
                                  {isSessionView
                                    ? "Attach a photo if needed, then complete this active session. Any payment follow-up returns to Bookings or Projects."
                                    : "The booking is confirmed. Start this appointment when the client arrives, then close it out from the Sessions workspace."}
                                </p>
                              </div>
                              <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-xs font-medium capitalize text-white">
                                {sessionStatus?.replace("_", " ")}
                              </span>
                            </div>

                            <div className={`mt-4 grid gap-3 ${isSessionView ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-1"}`}>
                              {!isSessionView && (
                                <button
                                  type="button"
                                  disabled={
                                    isUpdatingSession ||
                                    Boolean(sessionStartBlockReason)
                                  }
                                  onClick={handleStartSession}
                                  title={sessionStartBlockReason || "Start this session"}
                                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-black/30 px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <CalendarDays size={16} />
                                  Start session
                                </button>
                              )}
                              {isSessionView && (
                                <>
                                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 bg-black/30 px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10">
                                    <Camera size={16} />
                                    {isUploadingSessionPhoto
                                      ? "Uploading..."
                                      : "Add photo"}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      disabled={isUploadingSessionPhoto}
                                      onChange={handleSessionPhotoUpload}
                                      className="sr-only"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    disabled={
                                      isUpdatingSession ||
                                      isUploadingSessionPhoto ||
                                      sessionStatus !== "in_progress"
                                    }
                                    onClick={handleCompleteSession}
                                    className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-3! py-2.5! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Check size={16} />
                                    Complete session
                                  </button>
                                </>
                              )}
                            </div>

                            {isSessionView && (
                              <div className="mt-4">
                              {sessionPhotoUrls.length > 0 && (
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                  {sessionPhotoUrls.map((url) => (
                                    <img
                                      key={url}
                                      src={url}
                                      alt="Session record"
                                      className="h-20 w-full rounded-md border border-white/10 object-cover"
                                    />
                                  ))}
                                </div>
                              )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
    </>
  );
};

const BookingDetailTile = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) => (
  <div className="rounded-lg border border-white/10 bg-black/25 p-3">
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-neutral-500">
      {icon}
      {label}
    </div>
    <p className="mt-2 text-sm font-medium text-white">{value}</p>
  </div>
);

const uploadBookingSessionPhoto = async (
  booking: DashboardBooking,
  file: File
) => {
  const photoRef = ref(
    storage,
    `bookingSessions/${booking.id}/photos/${Date.now()}-${file.name}`
  );
  await uploadBytes(photoRef, file);
  const url = await getDownloadURL(photoRef);
  await setDoc(
    doc(db, "bookingSessions", booking.id),
    {
      bookingId: booking.id,
      artistId: booking.artistId,
      clientId: booking.clientId,
      photoUrls: arrayUnion(url),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await updateDoc(doc(db, "bookings", booking.id), {
    sessionPhotoUrls: arrayUnion(url),
    updatedAt: serverTimestamp(),
  });

  return url;
};

const BookingStatusBadge = ({ status }: { status: string }) => {
  const className =
    status === "paid" || status === "confirmed" || status === "deposit_paid"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : status === "cancelled"
      ? "border-red-300/25 bg-red-300/10 text-red-100"
      : "border-amber-300/20 bg-amber-300/10 text-amber-100";
  const label = status === "deposit_paid" ? "Deposit paid" : status.replace("_", " ");

  return (
    <span className={`inline-flex w-fit justify-self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}>
      {label}
    </span>
  );
};

const BookingSessionCell = ({ booking }: { booking: DashboardBooking }) => {
  const session = getBookingSessionDisplay(booking);
  const toneClass =
    session.tone === "emerald"
      ? "text-emerald-200"
      : session.tone === "sky"
      ? "text-sky-200"
      : session.tone === "amber"
      ? "text-amber-200"
      : session.tone === "red"
      ? "text-red-200"
      : "text-neutral-400";

  return (
    <div className="min-w-0 pr-4">
      <p className="truncate text-sm font-semibold text-white">
        {session.primary}
      </p>
      <p className={`mt-1 truncate text-xs font-medium ${toneClass}`}>
        {session.secondary}
      </p>
    </div>
  );
};

const SessionStatusBadge = ({
  status,
  prefix,
}: {
  status: string;
  prefix?: string;
}) => {
  const className =
    status === "completed"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : "border-sky-300/20 bg-sky-300/10 text-sky-100";
  const label = status.replace("_", " ");

  return (
    <span className={`inline-flex w-fit justify-self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}>
      {prefix ? `${prefix}: ${label}` : label}
    </span>
  );
};

const getShortBookingId = (bookingId?: string) =>
  bookingId ? `#${bookingId.slice(0, 7)}` : "#";

const formatDashboardMoney = (amount?: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amount || 0));

const getProjectStartLabel = (booking: Partial<Booking>) => {
  const createdAt = booking.createdAt;
  const date =
    createdAt && typeof createdAt.toDate === "function"
      ? createdAt.toDate()
      : createdAt && typeof createdAt.seconds === "number"
      ? new Date(createdAt.seconds * 1000)
      : null;

  if (!date || Number.isNaN(date.getTime())) return "Started recently";

  return `Started ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
};

const getBookingStatusFilterValue = (
  booking: Partial<Booking>
): BookingStatusFilter => {
  if (booking.status === "pending_payment") return "pending";
  if (booking.status === "confirmed" || booking.status === "deposit_paid") {
    return "confirmed";
  }
  if (booking.status === "paid") return "paid";
  if (booking.status === "cancelled") return "cancelled";
  return "all";
};

const getDashboardClientName = (booking: DashboardBooking) =>
  getClientNameParts({
    ...booking,
    ...booking.user,
    clientFirstName: booking.clientFirstName,
    clientLastName: booking.clientLastName,
    clientName: booking.clientName,
  }).fullName;

const getDashboardClientFirstName = (booking: DashboardBooking) =>
  getClientFirstName({
    ...booking,
    ...booking.user,
    clientFirstName: booking.clientFirstName,
    clientLastName: booking.clientLastName,
    clientName: booking.clientName,
  });

const getDashboardClientAvatar = (booking: DashboardBooking) =>
  booking.user?.avatarUrl || booking.clientAvatar || "/default-avatar.png";

const getDashboardRemainingBalance = (booking: Partial<Booking>) =>
  typeof booking.remainingBalanceAmount === "number"
    ? Math.max(booking.remainingBalanceAmount, 0)
    : Math.max(
        Number(booking.price || 0) -
          Number(booking.totalArtistPaidAmount || booking.depositAmount || 0),
        0
      );

const getDashboardSessionInstallmentTiming = (booking: Partial<Booking>) =>
  booking.sessionInstallmentTiming === "before_session"
    ? "before_session"
    : "after_session";

const isDashboardMultiSessionBooking = (booking: Partial<Booking>) =>
  booking.projectType === "multi_session" ||
  Number(booking.estimatedSessionCount || 1) > 1;

const getEstimatedSessionCount = (booking: Partial<Booking>) =>
  Math.max(Number(booking.estimatedSessionCount || 1), 1);

const getActiveSessionNumber = (booking: Partial<Booking>) =>
  Math.max(Number(booking.activeSessionNumber || 1), 1);

const getCompletedSessionCount = (booking: Partial<Booking>) =>
  Math.max(Number(booking.completedSessionCount || 0), 0);

const getLastPaidSessionNumber = (booking: Partial<Booking>) =>
  Math.max(Number(booking.lastPaidSessionNumber || 0), 0);

const getRemainingInstallmentCount = (booking: Partial<Booking>) => {
  const totalLaterInstallments = Math.max(getEstimatedSessionCount(booking) - 1, 1);
  const lastPaidSessionNumber = getLastPaidSessionNumber(booking);
  const paidLaterInstallments =
    getDashboardSessionInstallmentTiming(booking) === "before_session"
      ? Math.max(lastPaidSessionNumber - 1, 0)
      : lastPaidSessionNumber;

  return Math.max(totalLaterInstallments - paidLaterInstallments, 1);
};

const isBookingFullyCompleted = (booking: Partial<Booking>) => {
  const sessionCount = getEstimatedSessionCount(booking);
  const completedCount = getCompletedSessionCount(booking);

  return (
    completedCount >= sessionCount ||
    (!isDashboardMultiSessionBooking(booking) &&
      booking.sessionStatus === "completed")
  );
};

const getDisplaySessionNumber = (booking: Partial<Booking>) => {
  const sessionCount = getEstimatedSessionCount(booking);
  const completedCount = Math.min(getCompletedSessionCount(booking), sessionCount);

  if (isBookingFullyCompleted(booking)) return sessionCount;
  if (booking.sessionStatus === "awaiting_next_session") {
    return Math.min(completedCount + 1, sessionCount);
  }

  return Math.min(getActiveSessionNumber(booking), sessionCount);
};

const getBookingSessionDisplay = (booking: Partial<Booking>) => {
  const primary = `Session ${getDisplaySessionNumber(booking)} of ${getEstimatedSessionCount(booking)}`;
  const remainingBalance = getDashboardRemainingBalance(booking);
  const paymentStatus = booking.remainingPaymentStatus || "not_due";

  if (booking.status === "cancelled") {
    return { primary, secondary: "Cancelled", tone: "red" as const };
  }

  if (booking.status === "pending_payment") {
    return { primary, secondary: "Waiting on payment", tone: "amber" as const };
  }

  if (booking.sessionStatus === "in_progress") {
    return { primary, secondary: "In progress", tone: "sky" as const };
  }

  if (needsSessionPaymentRequest(booking)) {
    return {
      primary,
      secondary: "Payment needed",
      tone: "amber" as const,
    };
  }

  if (Number(booking.pendingSessionPaymentAmount || 0) > 0) {
    return {
      primary,
      secondary:
        booking.remainingPaymentMethod === "external"
          ? "Direct payment pending"
          : "Payment pending",
      tone: "amber" as const,
    };
  }

  if (
    booking.sessionStatus === "completed" &&
    remainingBalance > 0 &&
    paymentStatus !== "confirmed"
  ) {
    if (booking.remainingPaymentMethod === "external") {
      if (paymentStatus === "artist_confirmed") {
        return {
          primary,
          secondary: "Awaiting client confirm",
          tone: "amber" as const,
        };
      }

      if (paymentStatus === "client_confirmed") {
        return {
          primary,
          secondary: "Confirm direct payment",
          tone: "amber" as const,
        };
      }

      return {
        primary,
        secondary: "Awaiting direct payment",
        tone: "amber" as const,
      };
    }

    return {
      primary,
      secondary: "Awaiting Stripe payment",
      tone: "amber" as const,
    };
  }

  if (isBookingFullyCompleted(booking)) {
    return { primary, secondary: "All sessions complete", tone: "emerald" as const };
  }

  if (booking.sessionStatus === "awaiting_next_session") {
    return { primary, secondary: "Next session ready", tone: "emerald" as const };
  }

  return { primary, secondary: "Ready to start", tone: "emerald" as const };
};

const canStartBookingSession = (booking: Partial<Booking>) => {
  return !getSessionStartBlockReason(booking);
};

const needsSessionPaymentRequest = (booking: Partial<Booking>) =>
  isDashboardMultiSessionBooking(booking) &&
  getDashboardSessionInstallmentTiming(booking) === "before_session" &&
  getActiveSessionNumber(booking) > 1 &&
  getDashboardRemainingBalance(booking) > 0 &&
  Number(booking.pendingSessionPaymentAmount || 0) <= 0 &&
  getLastPaidSessionNumber(booking) < getActiveSessionNumber(booking) &&
  !isBookingFullyCompleted(booking);

const canRequestProjectSessionPayment = (booking: Partial<Booking>) =>
  needsSessionPaymentRequest(booking) &&
  !["cancelled", "pending_payment"].includes(String(booking.status)) &&
  booking.projectStatus !== "paused" &&
  booking.projectStatus !== "completed" &&
  booking.sessionStatus !== "in_progress" &&
  hasScheduledAppointment(booking);

const getSessionStartBlockReason = (booking: Partial<Booking>) => {
  if (!["confirmed", "deposit_paid", "paid"].includes(String(booking.status))) {
    return "Deposit must be paid before starting.";
  }

  if (booking.projectStatus === "paused") {
    return "Resume project before starting.";
  }

  if (Number(booking.pendingPlatformFeeCents || 0) > 0) {
    return "Collect the pending SATX Ink platform fee first.";
  }

  if (booking.sessionStatus === "in_progress") {
    return "This session is already in progress.";
  }

  if (isBookingFullyCompleted(booking)) {
    return "All sessions are complete.";
  }

  if (!hasScheduledAppointment(booking)) {
    return "Plan a session date before starting.";
  }

  if (Number(booking.pendingSessionPaymentAmount || 0) > 0) {
    return "Settle the requested session payment first.";
  }

  if (needsSessionPaymentRequest(booking)) {
    return "Request and collect this session installment first.";
  }

  if (
    !["not_started", "awaiting_next_session", undefined].includes(
      booking.sessionStatus
    )
  ) {
    return "This session is not ready to start.";
  }

  return null;
};

const hasScheduledAppointment = (booking: Partial<Booking>) =>
  Boolean(
    booking.selectedDate?.date &&
      booking.selectedDate?.time &&
      booking.selectedDate.date !== "TBD"
  );

const hasUpcomingSessionAppointment = (booking: Partial<Booking>) => {
  const start = getBookingStartTime(booking);
  return start !== Number.MAX_SAFE_INTEGER && start >= Date.now();
};

const needsSessionScheduling = (booking: Partial<Booking>) => {
  if (!hasScheduledAppointment(booking)) return true;

  return (
    isDashboardMultiSessionBooking(booking) &&
    !isBookingFullyCompleted(booking) &&
    ["awaiting_next_session", "completed"].includes(
      String(booking.sessionStatus)
    ) &&
    !hasUpcomingSessionAppointment(booking)
  );
};

const hasSessionBalanceFollowUp = (booking: Partial<Booking>) =>
  getDashboardRemainingBalance(booking) > 0 &&
  PROJECT_PAYMENT_FOLLOW_UP_STATUSES.includes(
    booking.remainingPaymentStatus || ""
  );

const getSessionReadinessFilterValue = (
  booking: Partial<Booking>
): SessionReadinessFilter => {
  if (booking.projectStatus === "paused") return "paused";

  if (
    booking.status === "pending_payment" ||
    Number(booking.pendingPlatformFeeCents || 0) > 0
  ) {
    return "follow_up";
  }

  if (needsSessionScheduling(booking)) {
    return "needs_schedule";
  }

  if (needsSessionPaymentRequest(booking) || hasSessionBalanceFollowUp(booking)) {
    return "follow_up";
  }

  return "ready";
};

const getSessionReadinessDisplay = (booking: Partial<Booking>) => {
  const readiness = getSessionReadinessFilterValue(booking);

  if (readiness === "paused") {
    return {
      label: "Paused",
      description: "Resume project first",
      className: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    };
  }

  if (readiness === "follow_up") {
    const balanceDue = getDashboardSessionInstallmentAmount(booking);
    const pendingPayment = Number(booking.pendingSessionPaymentAmount || 0);
    const paymentStatus = booking.remainingPaymentStatus || "not_due";
    const label =
      booking.status === "pending_payment"
        ? "Deposit pending"
        : Number(booking.pendingPlatformFeeCents || 0) > 0
        ? "Platform fee needed"
        : needsSessionPaymentRequest(booking)
        ? "Payment needed"
        : paymentStatus === "artist_confirmed"
        ? "Client confirm needed"
        : paymentStatus === "client_confirmed"
        ? "Confirm direct payment"
        : pendingPayment > 0
        ? "Payment pending"
        : "Balance follow-up";

    return {
      label,
      description:
        Number(booking.pendingPlatformFeeCents || 0) > 0
          ? "Collect fee before start"
          : needsSessionPaymentRequest(booking)
          ? `Request ${formatDashboardMoney(balanceDue)}`
          : pendingPayment > 0
          ? `${formatDashboardMoney(pendingPayment)} requested`
          : balanceDue > 0
          ? `${formatDashboardMoney(balanceDue)} due`
          : "Open project follow-up",
      className: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    };
  }

  if (readiness === "needs_schedule") {
    const balanceDue = getDashboardSessionInstallmentAmount(booking);

    return {
      label: "Needs date",
      description:
        balanceDue > 0 && hasSessionBalanceFollowUp(booking)
          ? `${formatDashboardMoney(balanceDue)} balance due`
          : "Plan next date",
      className: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    };
  }

  return {
    label: "Ready to start",
    description: "Start from Sessions",
    className: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  };
};

const hasProjectPaymentFollowUp = (booking: Partial<Booking>) =>
  Number(booking.pendingPlatformFeeCents || 0) > 0 ||
  (getDashboardRemainingBalance(booking) > 0 &&
    PROJECT_PAYMENT_FOLLOW_UP_STATUSES.includes(
      booking.remainingPaymentStatus || ""
    ));

const getDashboardFinalPaymentTermsLabel = (booking: Partial<Booking>) => {
  if (booking.finalPaymentTiming !== "before") return "After appointment";

  const deadlineHours = booking.finalPaymentDeadlineHours === 48 ? 48 : 24;
  return `${deadlineHours} hours before`;
};

const canConfirmBookingInShopPayment = (booking: Partial<Booking>) => {
  const paymentStatus = booking.remainingPaymentStatus || "not_due";

  return (
    booking.remainingPaymentMethod === "external" &&
    getDashboardRemainingBalance(booking) > 0 &&
    (booking.sessionStatus === "completed" ||
      Number(booking.pendingSessionPaymentAmount || 0) > 0) &&
    !["artist_confirmed", "confirmed"].includes(paymentStatus)
  );
};

const canProposeProjectScopeChange = (booking: Partial<Booking>) =>
  booking.projectStatus !== "paused" &&
  booking.projectStatus !== "completed" &&
  !["cancelled", "pending_payment"].includes(String(booking.status));

const getProjectQuickAction = (booking: Partial<Booking>) => {
  if (booking.projectStatus === "paused") return "Resume";
  if (getSessionReadinessFilterValue(booking) === "needs_schedule") {
    return "Plan next";
  }
  return null;
};

const getDashboardSessionInstallmentAmount = (booking: Partial<Booking>) => {
  const remaining = getDashboardRemainingBalance(booking);
  const pending = Number(booking.pendingSessionPaymentAmount || 0);
  if (pending > 0) return Math.min(pending, remaining);

  const sessionsLeft = isDashboardMultiSessionBooking(booking)
    ? getRemainingInstallmentCount(booking)
    : Math.max(
        getEstimatedSessionCount(booking) -
          Number(booking.completedSessionCount || 0),
        1
      );
  return Math.ceil(remaining / sessionsLeft);
};

const buildExternalPaymentCompletionUpdates = (
  booking: Partial<Booking>,
  amountPaid: number
) => {
  const price = Number(booking.price || 0);
  const currentPaid = Number(
    booking.totalArtistPaidAmount ||
      booking.depositPaidAmount ||
      booking.depositAmount ||
      0
  );
  const sessionNumber = Math.max(
    Number(booking.pendingSessionNumber || getActiveSessionNumber(booking)),
    1
  );
  const sessionCount = getEstimatedSessionCount(booking);
  const installmentTiming = getDashboardSessionInstallmentTiming(booking);
  const nextPaid = Math.min(price, currentPaid + amountPaid);
  const nextRemaining = Math.max(price - nextPaid, 0);
  const hasMoreSessions =
    isDashboardMultiSessionBooking(booking) &&
    (installmentTiming === "before_session"
      ? getCompletedSessionCount(booking) < sessionCount
      : sessionNumber < sessionCount);
  const nextActiveSessionNumber =
    installmentTiming === "before_session"
      ? sessionNumber
      : hasMoreSessions
      ? Math.min(sessionNumber + 1, sessionCount)
      : sessionNumber;

  return {
    sessionUpdate: {
      remainingPaymentStatus: "confirmed",
      sessionNumber,
      paidAmount: amountPaid,
      paidAmountCents: Math.round(amountPaid * 100),
      artistConfirmedAt: serverTimestamp(),
    },
    bookingUpdate: {
      status: nextRemaining > 0 ? "deposit_paid" : "paid",
      remainingPaymentStatus: nextRemaining > 0 ? "not_due" : "confirmed",
      externalRemainingArtistConfirmedAt: serverTimestamp(),
      remainingPaidAt:
        nextRemaining > 0 ? booking.remainingPaidAt ?? null : serverTimestamp(),
      paidAt: nextRemaining > 0 ? booking.paidAt ?? null : serverTimestamp(),
      remainingPaidAmount:
        Number(booking.remainingPaidAmount || 0) + amountPaid,
      remainingPaidAmountCents:
        Number(booking.remainingPaidAmountCents || 0) +
        Math.round(amountPaid * 100),
      totalArtistPaidAmount: nextPaid,
      totalArtistPaidCents: Math.round(nextPaid * 100),
      remainingBalanceAmount: nextRemaining,
      remainingBalanceCents: Math.round(nextRemaining * 100),
      sessionStatus: hasMoreSessions ? "awaiting_next_session" : "completed",
      activeSessionNumber: nextActiveSessionNumber,
      pendingSessionPaymentAmount: 0,
      pendingSessionPaymentAmountCents: 0,
      pendingSessionNumber: null,
      pendingSessionPaymentNote: null,
      pendingSessionPaymentRequestedAt: null,
      pendingSessionPaymentRequestedBy: null,
      lastPaidSessionNumber: sessionNumber,
    },
  };
};

const formatDashboardDate = (value?: Booking["createdAt"]) => {
  if (!value) return "New";
  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  return "New";
};

const formatBookingAppointment = (selectedDate: {
  date: string;
  time: string;
}) => {
  if (!selectedDate.date || !selectedDate.time) return "Not set";

  const [year, month, day] = selectedDate.date.split("-").map(Number);
  const [hours, minutes] = selectedDate.time.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);

  if (Number.isNaN(date.getTime())) {
    return `${selectedDate.date} @ ${selectedDate.time}`;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getSessionAppointmentDisplay = (booking: Partial<Booking>) => {
  if (needsSessionScheduling(booking)) {
    return {
      primary: "Next date needed",
      secondary: booking.shopName || "Private Studio",
      detail: "Plan in Projects",
      className: "text-amber-100",
    };
  }

  return {
    primary: booking.selectedDate
      ? formatBookingAppointment(booking.selectedDate)
      : "No date set",
    secondary: booking.shopName || "Private Studio",
    detail: booking.shopAddress || "Address not provided",
    className: "text-neutral-100",
  };
};

const getBookingStartTime = (booking: Partial<Booking>) => {
  const selectedDate = booking.selectedDate;
  if (!selectedDate?.date || !selectedDate.time || selectedDate.date === "TBD") {
    return Number.MAX_SAFE_INTEGER;
  }

  const [year, month, day] = selectedDate.date.split("-").map(Number);
  const [hours, minutes] = selectedDate.time.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);

  return Number.isNaN(date.getTime())
    ? Number.MAX_SAFE_INTEGER
    : date.getTime();
};

const compareUpcomingBookings = (a: Booking, b: Booking) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const nowTime = now.getTime();
  const aStart = getBookingStartTime(a);
  const bStart = getBookingStartTime(b);
  const aHasDate = aStart !== Number.MAX_SAFE_INTEGER;
  const bHasDate = bStart !== Number.MAX_SAFE_INTEGER;
  const aUpcoming = aHasDate && aStart >= nowTime;
  const bUpcoming = bHasDate && bStart >= nowTime;

  if (aUpcoming && bUpcoming) return aStart - bStart;
  if (aUpcoming) return -1;
  if (bUpcoming) return 1;
  if (aHasDate && bHasDate) return bStart - aStart;
  if (aHasDate) return -1;
  if (bHasDate) return 1;

  return getBookingCreatedTime(b) - getBookingCreatedTime(a);
};

const getBookingCreatedTime = (booking: Booking) => {
  const createdAt = booking.createdAt;
  if (createdAt?.toDate) return createdAt.toDate().getTime();
  if (createdAt?.seconds) return createdAt.seconds * 1000;
  return 0;
};

const isActiveSessionBooking = (
  booking: Partial<Booking> | Record<string, unknown>
) => booking.sessionStatus === "in_progress";

const isSessionWorkspaceBooking = (
  booking: Partial<Booking> | Record<string, unknown>
) => {
  const partialBooking = booking as Partial<Booking>;

  if (partialBooking.status === "cancelled") return false;
  if (partialBooking.projectStatus === "completed") return false;
  if (isActiveSessionBooking(booking)) return true;
  if (!["confirmed", "deposit_paid", "paid"].includes(String(partialBooking.status))) {
    return false;
  }

  return !isBookingFullyCompleted(partialBooking);
};

const isOngoingProjectBooking = (
  booking: Partial<Booking> | Record<string, unknown>
) =>
  isDashboardMultiSessionBooking(booking as Partial<Booking>) &&
  booking.status !== "cancelled" &&
  (booking as Partial<Booking>).projectStatus !== "completed" &&
  !isBookingFullyCompleted(booking as Partial<Booking>);

export default ArtistDashboardView;
