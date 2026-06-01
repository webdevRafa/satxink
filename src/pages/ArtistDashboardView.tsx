import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { onAuthStateChanged } from "firebase/auth";
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
  Store,
  UserRound,
  X,
} from "lucide-react";

import { db, auth, storage } from "../firebase/firebaseConfig";
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
import type { Booking } from "../types/Booking";
import type { Artist } from "../types/Artist";
import {
  TATTOO_STYLES,
  getCanonicalTattooStyles,
  getTattooStyleLabel,
} from "../types/TattooStyle";

const SPECIALTY_OPTIONS = TATTOO_STYLES;

type PaymentType = "internal" | "external";
type FinalPaymentTiming = "before" | "after";
type DisplayNameStatus = "idle" | "checking" | "available" | "taken";
type BookingSortMode = "upcoming" | "newest" | "oldest";
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
  email: string;
  avatarUrl: string;
  bio: string;
  specialties: string[];
  socialLinks: {
    instagram: string;
    facebook: string;
    website: string;
  };
  paymentType: PaymentType;
  externalPaymentDetails: {
    method: string;
    handle: string;
  };
  depositPolicy: {
    amount: string;
    depositRequired: boolean;
    nonRefundable: boolean;
  };
  finalPaymentTiming: FinalPaymentTiming;
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
  externalPaymentDetails?: {
    method?: string;
    handle?: string;
  } | null;
  depositPolicy?: {
    amount?: number;
    depositRequired?: boolean;
    nonRefundable?: boolean;
  };
};

type DashboardBookingRequest = {
  id: string;
  clientId: string;
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

const isValidOptionalUrl = (value: string) => {
  if (!value.trim()) return true;

  try {
    new URL(normalizeUrl(value));
    return true;
  } catch {
    return false;
  }
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
): ArtistProfileFormState => ({
  displayName: artist?.displayName || artist?.name || "",
  email: artist?.email || "",
  avatarUrl: artist?.avatarUrl || "",
  bio: artist?.bio || "",
  specialties: getCanonicalTattooStyles(artist?.specialties),
  socialLinks: {
    instagram: artist?.socialLinks?.instagram || "",
    facebook: artist?.socialLinks?.facebook || "",
    website:
      (artist?.socialLinks as { website?: string } | undefined)?.website || "",
  },
  paymentType: artist?.paymentType || "internal",
  externalPaymentDetails: {
    method:
      (artist as { externalPaymentDetails?: { method?: string } } | null)
        ?.externalPaymentDetails?.method || "",
    handle:
      (artist as { externalPaymentDetails?: { handle?: string } } | null)
        ?.externalPaymentDetails?.handle || "",
  },
  depositPolicy: {
    amount: String(
      (artist?.depositPolicy as { amount?: number } | undefined)?.amount ?? ""
    ),
    depositRequired: artist?.depositPolicy?.depositRequired ?? true,
    nonRefundable: artist?.depositPolicy?.nonRefundable ?? true,
  },
  finalPaymentTiming: artist?.finalPaymentTiming || "after",
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ArtistProfileFormState>(
    createProfileFormState(null)
  );
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [currentSlug, setCurrentSlug] = useState("");
  const [displayNameStatus, setDisplayNameStatus] =
    useState<DisplayNameStatus>("idle");
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

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
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const artistData = snap.data();
          setArtist(artistData);
          setProfileForm(createProfileFormState(artistData));
          setCurrentSlug(
            artistData.slug ||
              slugify(artistData.displayName || artistData.name || "", {
                lower: true,
                strict: true,
              })
          );
          setDisplayNameStatus("idle");
          setIsProfileDirty(false);
        }
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

  const checkDisplayNameAvailability = async (displayName: string) => {
    if (!uid) return "idle" as DisplayNameStatus;

    const slug = slugify(displayName, { lower: true, strict: true });
    if (!slug || slug === currentSlug) return "idle" as DisplayNameStatus;

    const nameQuery = query(collection(db, "users"), where("slug", "==", slug));
    const snapshot = await getDocs(nameQuery);
    const belongsToAnotherArtist = snapshot.docs.some(
      (docSnap) => docSnap.id !== uid
    );

    return belongsToAnotherArtist
      ? ("taken" as DisplayNameStatus)
      : ("available" as DisplayNameStatus);
  };

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
  }, [profileForm.displayName, uid, currentSlug]);

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

  const resetProfileForm = () => {
    setProfileForm(createProfileFormState(artist));
    setDisplayNameStatus("idle");
    setIsProfileDirty(false);
  };

  const handleSaveProfile = async () => {
    if (!uid) return;

    const displayName = profileForm.displayName.trim();
    const email = profileForm.email.trim();
    const bio = profileForm.bio.trim();
    const nextSlug = slugify(displayName, { lower: true, strict: true });

    if (!displayName) {
      toast.error("Display name is required.");
      return;
    }

    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }

    if (!bio) {
      toast.error("Bio is required.");
      return;
    }

    if (profileForm.specialties.length === 0) {
      toast.error("Choose at least one specialty.");
      return;
    }

    if (
      !isValidOptionalUrl(profileForm.socialLinks.instagram) ||
      !isValidOptionalUrl(profileForm.socialLinks.facebook) ||
      !isValidOptionalUrl(profileForm.socialLinks.website)
    ) {
      toast.error("One or more links are not valid URLs.");
      return;
    }

    if (
      profileForm.paymentType === "external" &&
      (!profileForm.externalPaymentDetails.method ||
        !profileForm.externalPaymentDetails.handle.trim())
    ) {
      toast.error("Add external payment details or switch to Stripe.");
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
      email,
      bio,
      specialties: profileForm.specialties,
      socialLinks: {
        instagram: normalizeUrl(profileForm.socialLinks.instagram),
        facebook: normalizeUrl(profileForm.socialLinks.facebook),
        website: normalizeUrl(profileForm.socialLinks.website),
      },
      paymentType: profileForm.paymentType,
      externalPaymentDetails:
        profileForm.paymentType === "external"
          ? {
              method: profileForm.externalPaymentDetails.method,
              handle: profileForm.externalPaymentDetails.handle.trim(),
            }
          : null,
      depositPolicy: {
        amount: 0,
        depositRequired: profileForm.depositPolicy.depositRequired,
        nonRefundable: profileForm.depositPolicy.nonRefundable,
      },
      finalPaymentTiming: profileForm.finalPaymentTiming,
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
              isActiveSessionBooking(bookingDoc.data())
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
            ? rawBookings.filter((booking) => isActiveSessionBooking(booking))
            : activeTab === "projects"
            ? rawBookings.filter((booking) => isOngoingProjectBooking(booking))
            : rawBookings.filter(
                (booking) => getBookingStatusFilterValue(booking) !== "all"
              );

        const clientIds = Array.from(
          new Set(
            scopedBookings.map((booking) => booking.clientId).filter(Boolean)
          )
        );

        const clientMap = new Map<
          string,
          { name?: string; displayName?: string; avatarUrl?: string }
        >();

        await Promise.all(
          clientIds.map(async (clientId) => {
            try {
              const clientSnap = await getDoc(doc(db, "users", clientId));
              if (clientSnap.exists()) {
                const user = clientSnap.data() as {
                  name?: string;
                  displayName?: string;
                  avatarUrl?: string;
                };

                clientMap.set(clientId, user);
              }
            } catch (error) {
              console.error(`Failed to fetch client ${clientId}:`, error);
            }
          })
        );

        setBookings(
          scopedBookings.map((booking) => {
            const user = clientMap.get(booking.clientId);

            return {
              ...booking,
              user,
              clientName: user?.name || user?.displayName || "Client",
              clientAvatar: user?.avatarUrl || "/default-avatar.png",
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
    Boolean(profileForm.email.trim()),
    Boolean(profileForm.bio.trim()),
    Boolean(profileForm.avatarUrl.trim()),
    profileForm.specialties.length > 0,
    Boolean(
      profileForm.socialLinks.instagram.trim() ||
        profileForm.socialLinks.facebook.trim() ||
        profileForm.socialLinks.website.trim()
    ),
    Boolean(profileForm.paymentType),
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
    displayNameStatus === "checking" ||
    displayNameStatus === "taken";
  const visibleBookings = useMemo(() => {
    const statusFilteredBookings =
      activeTab === "bookings" && bookingStatusFilter !== "all"
        ? bookings.filter(
            (booking) =>
              getBookingStatusFilterValue(booking) === bookingStatusFilter
          )
        : bookings;
    const normalizedSearch = bookingSearchTerm.trim().toLowerCase();
    const shouldApplySearch = activeTab !== "sessions" && Boolean(normalizedSearch);
    const filteredBookings = shouldApplySearch
      ? statusFilteredBookings.filter((booking) => {
          const dashboardBooking = booking as DashboardBooking;
          const clientName =
            dashboardBooking.user?.name ||
            dashboardBooking.user?.displayName ||
            dashboardBooking.clientName ||
            "";

          return clientName.toLowerCase().includes(normalizedSearch);
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
  }, [activeTab, bookings, bookingSearchTerm, bookingSortMode, bookingStatusFilter]);
  const hasActiveSessionInProgress = useMemo(
    () => bookings.some((booking) => booking.sessionStatus === "in_progress"),
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

  const handleCompleteSessionFromRow = (booking: DashboardBooking) =>
    updateSessionRecord(
      booking,
      {
        status: "completed",
        sessionNumber: getActiveSessionNumber(booking),
        completedAt: serverTimestamp(),
        pendingPaymentAmount: getDashboardSessionInstallmentAmount(booking),
        pendingPaymentAmountCents: Math.round(
          getDashboardSessionInstallmentAmount(booking) * 100
        ),
      },
      {
        sessionStatus: "completed",
        sessionCompletedAt: serverTimestamp(),
        completedSessionCount: Math.max(
          Number(booking.completedSessionCount || 0),
          getActiveSessionNumber(booking)
        ),
        pendingSessionPaymentAmount: getDashboardSessionInstallmentAmount(booking),
        pendingSessionPaymentAmountCents: Math.round(
          getDashboardSessionInstallmentAmount(booking) * 100
        ),
        pendingSessionNumber: getActiveSessionNumber(booking),
        remainingPaymentStatus: getDashboardRemainingBalance(booking) > 0
          ? "due"
          : "confirmed",
      }
    );

  const handleStartSessionFromRow = (booking: DashboardBooking) =>
    updateSessionRecord(
      booking,
      {
        status: "in_progress",
        sessionNumber: getActiveSessionNumber(booking),
        startedAt: serverTimestamp(),
      },
      { sessionStatus: "in_progress", sessionStartedAt: serverTimestamp() }
    );

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

  const bookingStatusMetrics = [
    { label: "Pending", value: navCounts.pending || 0 },
    { label: "Confirmed", value: navCounts.confirmed || 0 },
    { label: "Paid", value: navCounts.paid || 0 },
    { label: "Cancelled", value: navCounts.cancelled || 0 },
  ];
  const activeBookingFilterLabel =
    BOOKING_STATUS_FILTERS.find((filter) => filter.value === bookingStatusFilter)
      ?.label || "All";

  return (
    <div className="flex flex-col md:flex-row h-full bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#121212] text-white py-20 min-h-[100vh]">
      {avatarCropSrc && (
        <ImageCropperModal
          imageSrc={avatarCropSrc}
          aspect={1}
          onCancel={() => setAvatarCropSrc(null)}
          onSave={handleAvatarCropSave}
        />
      )}

      <SidebarNavigation
        activeTab={activeTab}
        counts={navCounts}
        onTabChange={handleDashboardTabChange}
      />

      <main className="relative flex-1 p-6 h-full">
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
                  Keep your public profile, booking preferences, and payment
                  details polished from one place.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5 py-2 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save
                    size={16}
                    className="text-[#0b0b0b]!"
                    aria-hidden="true"
                  />
                  {isSavingProfile ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
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

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                        <Mail size={15} aria-hidden="true" />
                        Email
                      </span>
                      <input
                        type="email"
                        value={profileForm.email}
                        onChange={(event) =>
                          updateProfileForm({ email: event.target.value })
                        }
                        className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                        placeholder="artist@example.com"
                      />
                    </label>

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
                    <span className="text-sm font-medium text-neutral-200">
                      Bio
                    </span>
                    <textarea
                      value={profileForm.bio}
                      onChange={(event) =>
                        updateProfileForm({ bio: event.target.value })
                      }
                      rows={5}
                      maxLength={700}
                      className="w-full resize-none rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                      placeholder="Tell clients about your style, process, and booking vibe."
                    />
                    <span className="block text-right text-xs text-neutral-500">
                      {profileForm.bio.length}/700
                    </span>
                  </label>
                </section>

                <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
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

                <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                      <CreditCard size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="mb-0! text-lg!">Booking and payments</h2>
                      <p className="text-sm text-neutral-400">
                        Set expectations before clients accept an offer.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <span className="text-sm font-medium text-neutral-200">
                        Payment type
                      </span>
                      <div className="grid grid-cols-2 rounded-md border border-white/10 bg-[#101010] p-1">
                        {(["internal", "external"] as PaymentType[]).map(
                          (type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() =>
                                updateProfileForm({ paymentType: type })
                              }
                              className={`rounded px-3 py-2 text-sm capitalize transition ${
                                profileForm.paymentType === type
                                  ? "bg-white text-black"
                                  : "text-neutral-400 hover:text-white"
                              }`}
                            >
                              {type === "internal" ? "Stripe" : "External"}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                  </div>

                  {profileForm.paymentType === "external" && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-neutral-200">
                          External method
                        </span>
                        <select
                          value={profileForm.externalPaymentDetails.method}
                          onChange={(event) =>
                            updateProfileForm((current) => ({
                              ...current,
                              externalPaymentDetails: {
                                ...current.externalPaymentDetails,
                                method: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                        >
                          <option value="">Select a method</option>
                          <option value="cashapp">CashApp</option>
                          <option value="venmo">Venmo</option>
                          <option value="zelle">Zelle</option>
                          <option value="paypal">PayPal</option>
                          <option value="other">Other</option>
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm font-medium text-neutral-200">
                          External handle
                        </span>
                        <input
                          type="text"
                          value={profileForm.externalPaymentDetails.handle}
                          onChange={(event) =>
                            updateProfileForm((current) => ({
                              ...current,
                              externalPaymentDetails: {
                                ...current.externalPaymentDetails,
                                handle: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                          placeholder="$cashtag, @handle, email, or phone"
                        />
                      </label>
                    </div>
                  )}

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <label className="flex items-start gap-3 rounded-md border border-white/10 bg-[#101010] p-3">
                      <input
                        type="checkbox"
                        checked={profileForm.depositPolicy.depositRequired}
                        onChange={(event) =>
                          updateProfileForm((current) => ({
                            ...current,
                            depositPolicy: {
                              ...current.depositPolicy,
                              depositRequired: event.target.checked,
                            },
                          }))
                        }
                        className="mt-1 accent-[var(--color-primary)]"
                      />
                      <span>
                        <span className="block text-sm font-medium text-white">
                          Deposit required
                        </span>
                        <span className="text-xs text-neutral-500">
                          Applies to new offers.
                        </span>
                      </span>
                    </label>

                    <label className="flex items-start gap-3 rounded-md border border-white/10 bg-[#101010] p-3">
                      <input
                        type="checkbox"
                        checked={profileForm.depositPolicy.nonRefundable}
                        onChange={(event) =>
                          updateProfileForm((current) => ({
                            ...current,
                            depositPolicy: {
                              ...current.depositPolicy,
                              nonRefundable: event.target.checked,
                            },
                          }))
                        }
                        className="mt-1 accent-[var(--color-primary)]"
                      />
                      <span>
                        <span className="block text-sm font-medium text-white">
                          Non-refundable
                        </span>
                        <span className="text-xs text-neutral-500">
                          Shown in booking terms.
                        </span>
                      </span>
                    </label>

                    <label className="space-y-2 rounded-md border border-white/10 bg-[#101010] p-3">
                      <span className="text-sm font-medium text-neutral-200">
                        Final payment
                      </span>
                      <select
                        value={profileForm.finalPaymentTiming}
                        onChange={(event) =>
                          updateProfileForm({
                            finalPaymentTiming: event.target
                              .value as FinalPaymentTiming,
                          })
                        }
                        className="w-full rounded border border-white/10 bg-[#151515] px-2 py-2 text-sm text-white outline-none focus:border-[var(--color-primary)]"
                      >
                        <option value="before">Before appointment</option>
                        <option value="after">After appointment</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                      <Globe size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="mb-0! text-lg!">Social links</h2>
                      <p className="text-sm text-neutral-400">
                        Make it easy for clients to verify your work and vibe.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                        <Instagram size={15} aria-hidden="true" />
                        Instagram
                      </span>
                      <input
                        type="text"
                        inputMode="url"
                        autoCapitalize="none"
                        value={profileForm.socialLinks.instagram}
                        onChange={(event) =>
                          updateProfileForm((current) => ({
                            ...current,
                            socialLinks: {
                              ...current.socialLinks,
                              instagram: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                        placeholder="instagram.com/artist"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-neutral-200">
                        Facebook
                      </span>
                      <input
                        type="text"
                        inputMode="url"
                        autoCapitalize="none"
                        value={profileForm.socialLinks.facebook}
                        onChange={(event) =>
                          updateProfileForm((current) => ({
                            ...current,
                            socialLinks: {
                              ...current.socialLinks,
                              facebook: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                        placeholder="facebook.com/artist"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-neutral-200">
                        Website
                      </span>
                      <input
                        type="text"
                        inputMode="url"
                        autoCapitalize="none"
                        value={profileForm.socialLinks.website}
                        onChange={(event) =>
                          updateProfileForm((current) => ({
                            ...current,
                            socialLinks: {
                              ...current.socialLinks,
                              website: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                        placeholder="yourportfolio.com"
                      />
                    </label>
                  </div>
                </section>
              </div>

              <aside className="h-fit rounded-lg border border-white/10 bg-[#101010] p-5 xl:sticky xl:top-28">
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
                    <p className="truncate text-sm text-neutral-400">
                      {profileForm.email || "email@example.com"}
                    </p>
                  </div>
                </div>

                <p className="mt-5 line-clamp-5 text-sm leading-6 text-neutral-300">
                  {profileForm.bio ||
                    "Your bio preview will appear here as clients browse your profile."}
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
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-400">Payments</span>
                    <span className="capitalize text-white">
                      {profileForm.paymentType === "internal"
                        ? "Stripe"
                        : "External"}
                    </span>
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
                    ? "Active Session"
                    : activeTab === "projects"
                    ? "Ongoing projects"
                    : "Bookings"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-neutral-400">
                  {activeTab === "bookings"
                    ? "Track accepted offers by payment stage, appointment status, and client readiness."
                    : activeTab === "sessions"
                    ? "Focus on the appointment that is currently in progress and close it out cleanly."
                    : activeTab === "projects"
                    ? "Track multi-session projects, progress, next-session balances, and payment status."
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
                    ? "No active session"
                    : activeTab === "projects"
                    ? "No ongoing projects yet"
                    : "No bookings yet"}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
                  {activeTab === "bookings"
                    ? "Once clients accept offers, their bookings will collect here by payment and appointment stage."
                    : activeTab === "sessions"
                    ? "Start a session from Bookings when the appointment begins. It will appear here until the session is complete."
                    : activeTab === "projects"
                    ? "When an accepted booking is marked as a multi-session project, it will appear here with progress and balance details."
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
                ) : activeTab === "sessions" ? null : (
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
                    onStart={handleStartSessionFromRow}
                    onComplete={handleCompleteSessionFromRow}
                    onBalancePaid={handleBalancePaidFromRow}
                  />
                ) : activeTab === "projects" ? (
                  <ProjectsTable
                    projects={visibleBookings as DashboardBooking[]}
                    onOpenRecord={(booking) => setSelectedBookingRecord(booking)}
                  />
                ) : (
                  <ArtistBookingsTable
                    bookings={visibleBookings as DashboardBooking[]}
                    onOpenRecord={(booking) => setSelectedBookingRecord(booking)}
                    onStart={(booking) => setBookingToStart(booking)}
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
        {activeTab === "payments" && <StripeConnectPanel artist={artist} />}
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
          hasActiveSession={hasActiveSessionInProgress}
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
  clientName?: string;
  clientAvatar?: string;
  user?: { name?: string; displayName?: string; avatarUrl?: string };
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
  onStart,
  hasActiveSession,
}: {
  bookings: DashboardBooking[];
  onOpenRecord: (booking: DashboardBooking) => void;
  onStart: (booking: DashboardBooking) => void;
  hasActiveSession: boolean;
}) => {
  const columns =
    "minmax(200px,1.02fr) 88px minmax(135px,.62fr) minmax(155px,.72fr) minmax(170px,.75fr) minmax(190px,.96fr) minmax(176px,.76fr)";

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
      <div className="request-modal-scrollbar overflow-x-auto">
        <div className="min-w-[1210px]">
          <div
            className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
            style={{ gridTemplateColumns: columns }}
          >
            <span>Client</span>
            <span>Sample</span>
            <span>Status</span>
            <span>Session</span>
            <span>Price | Deposit</span>
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
                onStart={() => onStart(booking)}
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
  onStart,
  hasActiveSession,
}: {
  booking: DashboardBooking;
  columns: string;
  onOpenRecord: () => void;
  onStart: () => void;
  hasActiveSession: boolean;
}) => {
  const appointmentLabel =
    booking.selectedDate?.date && booking.selectedDate?.time
      ? formatBookingAppointment(booking.selectedDate)
      : "No date set";
  const canStartSession = canStartBookingSession(booking) && !hasActiveSession;

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
          alt={getDashboardClientName(booking)}
          className="h-11 w-11 rounded-full border border-white/10 object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">
            {getDashboardClientName(booking)}
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
        {canStartSession && (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3! text-xs! font-semibold text-black transition hover:bg-white/85"
          >
            <CalendarDays size={14} />
            Start
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
  onStart,
  onComplete,
  onBalancePaid,
}: {
  sessions: DashboardBooking[];
  onOpenRecord: (booking: DashboardBooking) => void;
  onStart: (booking: DashboardBooking) => void;
  onComplete: (booking: DashboardBooking) => void;
  onBalancePaid: (booking: DashboardBooking) => void;
}) => {
  const columns =
    "minmax(290px,1.15fr) minmax(170px,.7fr) minmax(230px,.9fr) minmax(230px,.9fr) minmax(180px,.72fr)";

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
      <div className="request-modal-scrollbar overflow-x-auto">
        <div className="min-w-[1100px]">
          <div
            className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
            style={{ gridTemplateColumns: columns }}
          >
            <span>Client / Reference</span>
            <span>Session</span>
            <span>Appointment</span>
            <span>Balance</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="divide-y divide-white/10">
            {sessions.map((booking) => {
              const clientName = getDashboardClientName(booking);
              const clientAvatar = getDashboardClientAvatar(booking);
              const sessionStatus = booking.sessionStatus || "in_progress";
              const isMultiSession = isDashboardMultiSessionBooking(booking);
              const activeSessionNumber = getActiveSessionNumber(booking);
              const sessionCount = getEstimatedSessionCount(booking);
              const sessionLabel = `Session ${activeSessionNumber} of ${sessionCount}`;
              const remainingPaymentStatus =
                booking.remainingPaymentStatus || "due";
              const remainingBalance = getDashboardRemainingBalance(booking);
              const dueThisSession =
                remainingPaymentStatus === "confirmed"
                  ? 0
                  : getDashboardSessionInstallmentAmount(booking);
              const canStart = sessionStatus === "awaiting_next_session";
              const canComplete = sessionStatus === "in_progress";
              const canMarkBalancePaid =
                sessionStatus === "completed" &&
                booking.remainingPaymentMethod === "external" &&
                !["artist_confirmed", "confirmed"].includes(
                  remainingPaymentStatus
                );

              return (
                <div
                  key={booking.id}
                  className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
                  style={{ gridTemplateColumns: columns }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenRecord(booking)}
                    className="flex min-w-0 items-center gap-3 pr-4 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <img
                        src={clientAvatar}
                        alt={clientName}
                        className="h-11 w-11 rounded-full border border-white/10 object-cover"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">
                          {clientName}
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

                  <div className="min-w-0 pr-4">
                    <p className="truncate text-sm font-semibold text-white">
                      {sessionLabel}
                    </p>
                    <div className="mt-1">
                      <SessionStatusBadge status={sessionStatus} />
                    </div>
                    <p className="mt-1 truncate text-xs text-neutral-500">
                      {isMultiSession ? "Multi-session project" : "Single appointment"}
                    </p>
                  </div>

                  <div className="min-w-0 pr-3">
                    <p className="truncate text-sm font-semibold text-neutral-100">
                      {formatBookingAppointment(booking.selectedDate)}
                    </p>
                    <p className="mt-1 truncate text-xs text-neutral-500">
                      {booking.shopName || "Private Studio"}
                    </p>
                    <p className="mt-1 truncate text-xs text-neutral-600">
                      {booking.shopAddress || "Address not provided"}
                    </p>
                  </div>

                  <div className="min-w-0 pr-4">
                    <p className="truncate text-sm font-semibold text-white">
                      {formatDashboardMoney(dueThisSession)}
                    </p>
                    <p className="mt-1 truncate text-xs text-neutral-500">
                      {isMultiSession ? "Due this session" : "Balance due"}{" "}
                      <span className="text-neutral-700">|</span>{" "}
                      {formatDashboardMoney(remainingBalance)} remaining
                    </p>
                    <div className="mt-2">
                      <RemainingPaymentBadge
                        status={remainingPaymentStatus}
                        viewer="artist"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch justify-end gap-2">
                    {(canStart || canComplete) && (
                      <button
                        type="button"
                        onClick={() =>
                          canStart ? onStart(booking) : onComplete(booking)
                        }
                        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-white px-2.5! py-2! text-xs! font-semibold text-black transition hover:bg-white/85"
                      >
                        {canStart ? <CalendarDays size={14} /> : <Check size={14} />}
                        {canStart ? "Start session" : "Complete session"}
                      </button>
                    )}
                    {canMarkBalancePaid && (
                      <button
                        type="button"
                        onClick={() => onBalancePaid(booking)}
                        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-2.5! py-2! text-xs! font-semibold text-emerald-100 transition hover:bg-emerald-300/15"
                      >
                        <DollarSign size={14} />
                        Balance paid
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenRecord(booking)}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-2.5! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
                    >
                      <Eye size={14} />
                      Record
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const ProjectsTable = ({
  projects,
  onOpenRecord,
}: {
  projects: DashboardBooking[];
  onOpenRecord: (booking: DashboardBooking) => void;
}) => (
  <div className="grid gap-4 lg:grid-cols-2">
    {projects.map((booking) => {
      const clientName = getDashboardClientName(booking);
      const clientAvatar = getDashboardClientAvatar(booking);
      const completedCount = Number(booking.completedSessionCount || 0);
      const sessionCount = getEstimatedSessionCount(booking);
      const activeSessionNumber = getActiveSessionNumber(booking);
      const remainingBalance = getDashboardRemainingBalance(booking);
      const nextDue = getDashboardSessionInstallmentAmount(booking);
      const progress = Math.min((completedCount / sessionCount) * 100, 100);

      return (
        <article
          key={booking.id}
          className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg"
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] p-4">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={clientAvatar}
                alt={clientName}
                className="h-12 w-12 rounded-full border border-white/10 object-cover"
              />
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{clientName}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {booking.shopName || "Studio not listed"}
                </p>
              </div>
            </div>
            <SessionStatusBadge status={booking.sessionStatus || "not_started"} />
          </div>

          <div className="space-y-4 p-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-neutral-500">
                <span>Progress</span>
                <span className="text-white">
                  {completedCount}/{sessionCount} sessions
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <BookingDetailTile
                icon={<CalendarDays size={17} />}
                label="Next session"
                value={`Session ${activeSessionNumber}/${sessionCount}`}
              />
              <BookingDetailTile
                icon={<DollarSign size={17} />}
                label="Minimum due next"
                value={formatDashboardMoney(nextDue)}
              />
              <BookingDetailTile
                icon={<CreditCard size={17} />}
                label="Remaining balance"
                value={formatDashboardMoney(remainingBalance)}
              />
              <BookingDetailTile
                icon={<ReceiptText size={17} />}
                label="Payment"
                value={
                  booking.remainingPaymentMethod === "external"
                    ? "In shop"
                    : "Stripe"
                }
              />
            </div>

            <button
              type="button"
              onClick={() => onOpenRecord(booking)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10"
            >
              <Eye size={16} />
              Open project record
            </button>
          </div>
        </article>
      );
    })}
  </div>
);

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
              This moves the booking into the Session workspace so you can complete
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
  hasActiveSession,
  onSessionStarted,
}: {
  booking: DashboardBooking | null;
  onClose: () => void;
  isSessionView: boolean;
  hasActiveSession: boolean;
  onSessionStarted: () => void;
}) => {
  const [sessionStatus, setSessionStatus] =
    useState<Booking["sessionStatus"]>("not_started");
  const [remainingPaymentStatus, setRemainingPaymentStatus] =
    useState<Booking["remainingPaymentStatus"]>("not_due");
  const [sessionPhotoUrls, setSessionPhotoUrls] = useState<string[]>([]);
  const [externalPaymentAmount, setExternalPaymentAmount] = useState("");
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);
  const [isUploadingSessionPhoto, setIsUploadingSessionPhoto] = useState(false);

  useEffect(() => {
    setSessionStatus(booking?.sessionStatus || "not_started");
    setRemainingPaymentStatus(booking?.remainingPaymentStatus || "not_due");
    setSessionPhotoUrls(booking?.sessionPhotoUrls || []);
    setExternalPaymentAmount(
      booking ? String(getDashboardSessionInstallmentAmount(booking)) : ""
    );
  }, [booking]);

  const clientName =
    booking?.user?.name ||
    booking?.user?.displayName ||
    booking?.clientName ||
    "Client";
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
  const usesExternalRemaining =
    booking?.remainingPaymentMethod === "external" && remainingBalance > 0;
  const isMultiSession = booking ? isDashboardMultiSessionBooking(booking) : false;
  const activeSessionNumber = booking ? getActiveSessionNumber(booking) : 1;
  const sessionCount = booking ? getEstimatedSessionCount(booking) : 1;
  const sessionInstallment = booking
    ? getDashboardSessionInstallmentAmount(booking)
    : 0;
  const canStartSession =
    booking?.status !== "pending_payment" &&
    !hasActiveSession &&
    (sessionStatus === "not_started" ||
      sessionStatus === "awaiting_next_session");
  const showSessionWorkspace =
    booking?.status !== "pending_payment" &&
    (isSessionView || canStartSession);

  const upsertSessionRecord = async (
    sessionUpdate: Record<string, unknown>,
    bookingUpdate: Record<string, unknown>
  ) => {
    if (!booking) return false;

    setIsUpdatingSession(true);
    try {
      const sessionRef = doc(db, "bookingSessions", booking.id);
      await setDoc(
        sessionRef,
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
      toast.success("Session record updated.");
      return true;
    } catch (error) {
      console.error("Session update failed:", error);
      toast.error("Could not update the session record.");
      return false;
    } finally {
      setIsUpdatingSession(false);
    }
  };

  const handleStartSession = async () => {
    const updated = await upsertSessionRecord(
      {
        status: "in_progress",
        sessionNumber: activeSessionNumber,
        startedAt: serverTimestamp(),
      },
      { sessionStatus: "in_progress", sessionStartedAt: serverTimestamp() }
    );
    if (updated) {
      setSessionStatus("in_progress");
      onSessionStarted();
    }
  };

  const handleCompleteSession = async () => {
    const updated = await upsertSessionRecord(
      {
        status: "completed",
        sessionNumber: activeSessionNumber,
        pendingPaymentAmount: sessionInstallment,
        pendingPaymentAmountCents: Math.round(sessionInstallment * 100),
        completedAt: serverTimestamp(),
      },
      {
        sessionStatus: "completed",
        sessionCompletedAt: serverTimestamp(),
        completedSessionCount: Math.max(
          Number(booking?.completedSessionCount || 0),
          activeSessionNumber
        ),
        pendingSessionPaymentAmount: sessionInstallment,
        pendingSessionPaymentAmountCents: Math.round(sessionInstallment * 100),
        pendingSessionNumber: activeSessionNumber,
        remainingPaymentStatus: remainingBalance > 0 ? "due" : "confirmed",
      }
    );
    if (updated) setSessionStatus("completed");
  };

  const handleArtistConfirmExternalPayment = async () => {
    const amountPaid = Number(externalPaymentAmount || 0);
    const minimumDue = sessionInstallment;

    if (!Number.isFinite(amountPaid) || amountPaid < minimumDue) {
      toast.error(
        `Enter at least ${formatDashboardMoney(minimumDue)} for this session.`
      );
      return;
    }

    if (amountPaid > remainingBalance) {
      toast.error("Payment cannot exceed the remaining project balance.");
      return;
    }

    const completion =
      booking && remainingPaymentStatus === "client_confirmed"
        ? buildExternalPaymentCompletionUpdates(booking, amountPaid)
        : null;

    const updated = await upsertSessionRecord(
      completion?.sessionUpdate || {
        remainingPaymentStatus: "artist_confirmed",
        sessionNumber: activeSessionNumber,
        pendingPaymentAmount: amountPaid,
        pendingPaymentAmountCents: Math.round(amountPaid * 100),
        artistConfirmedAt: serverTimestamp(),
      },
      completion?.bookingUpdate || {
        remainingPaymentStatus: "artist_confirmed",
        pendingSessionPaymentAmount: amountPaid,
        pendingSessionPaymentAmountCents: Math.round(amountPaid * 100),
        pendingSessionNumber: activeSessionNumber,
        externalRemainingArtistConfirmedAt: serverTimestamp(),
      }
    );
    if (updated) {
      setRemainingPaymentStatus(
        (completion?.bookingUpdate
          .remainingPaymentStatus as Booking["remainingPaymentStatus"]) ||
          "artist_confirmed"
      );
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
      setSessionPhotoUrls((current) => [...current, url]);
      toast.success("Session photo saved.");
    } catch (error) {
      console.error("Session photo upload failed:", error);
      toast.error("Could not upload the session photo.");
    } finally {
      setIsUploadingSessionPhoto(false);
    }
  };

  return (
    <Transition appear show={!!booking} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto request-modal-scrollbar">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="scale-95 opacity-0"
              enterTo="scale-100 opacity-100"
              leave="ease-in duration-150"
              leaveFrom="scale-100 opacity-100"
              leaveTo="scale-95 opacity-0"
            >
              <Dialog.Panel className="w-full max-w-6xl overflow-hidden rounded-lg border border-white/10 bg-[#111111] text-white shadow-2xl">
                {booking && (
                  <>
                    <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                          Booking record
                        </p>
                        <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                          Appointment with {clientName}
                        </Dialog.Title>
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                        aria-label="Close booking record"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="grid gap-0 lg:grid-cols-[1fr_0.95fr]">
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
                                : "External"
                            }
                          />
                        </div>

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

                        {showSessionWorkspace && (
                          <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {isSessionView
                                    ? isMultiSession
                                      ? `Session ${activeSessionNumber} of ${sessionCount}`
                                      : "Session workspace"
                                    : "Ready to start session"}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-emerald-50/75">
                                  {isSessionView
                                    ? "Track this session and collect "
                                    : "The booking is confirmed. Start this session when the appointment begins, then manage completion and "}
                                  <span className="font-semibold text-white">
                                    {formatDashboardMoney(
                                      isMultiSession
                                        ? sessionInstallment
                                        : remainingBalance
                                    )}
                                  </span>{" "}
                                  {isSessionView
                                    ? usesExternalRemaining
                                      ? "after the client pays you directly."
                                      : "through the client's Stripe balance checkout."
                                    : "payment from the Session section."}
                                </p>
                              </div>
                              <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-xs font-medium capitalize text-white">
                                {sessionStatus?.replace("_", " ")}
                              </span>
                            </div>

                            {isSessionView &&
                              usesExternalRemaining &&
                              sessionStatus === "completed" &&
                              !["artist_confirmed", "confirmed"].includes(
                                remainingPaymentStatus || ""
                              ) && (
                                <label className="mt-4 block space-y-2 rounded-md border border-white/10 bg-black/25 p-3">
                                  <span className="text-xs uppercase tracking-[0.14em] text-emerald-50/55">
                                    External amount paid
                                  </span>
                                  <div className="relative">
                                    <DollarSign
                                      size={16}
                                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-emerald-50/45"
                                    />
                                    <input
                                      type="number"
                                      min={sessionInstallment}
                                      max={remainingBalance}
                                      step="1"
                                      value={externalPaymentAmount}
                                      onChange={(event) =>
                                        setExternalPaymentAmount(
                                          event.target.value
                                        )
                                      }
                                      className="h-11 w-full rounded-md border border-white/10 bg-[#101010] pl-9 pr-3 text-sm text-white outline-none transition focus:border-emerald-300/70"
                                    />
                                  </div>
                                  <p className="text-xs leading-5 text-emerald-50/65">
                                    Minimum due is{" "}
                                    {formatDashboardMoney(sessionInstallment)}.
                                    If the client paid extra, enter the actual
                                    amount so the remaining project balance is
                                    recalculated across the sessions left.
                                  </p>
                                </label>
                              )}

                            <div className={`mt-4 grid gap-3 ${isSessionView ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-1"}`}>
                              {!isSessionView && (
                                <button
                                  type="button"
                                  disabled={
                                    isUpdatingSession ||
                                    ![
                                      "not_started",
                                      "awaiting_next_session",
                                    ].includes(sessionStatus || "")
                                  }
                                  onClick={handleStartSession}
                                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-black/30 px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <CalendarDays size={16} />
                                  Start session
                                </button>
                              )}
                              {isSessionView && (
                                <>
                                  <button
                                    type="button"
                                    disabled={
                                      isUpdatingSession ||
                                      sessionStatus !== "in_progress"
                                    }
                                    onClick={handleCompleteSession}
                                    className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-black/30 px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Check size={16} />
                                    Complete
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      isUpdatingSession ||
                                      sessionStatus !== "completed" ||
                                      !usesExternalRemaining ||
                                      remainingPaymentStatus === "artist_confirmed" ||
                                      remainingPaymentStatus === "confirmed"
                                    }
                                    onClick={handleArtistConfirmExternalPayment}
                                    className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-3! py-2.5! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <DollarSign size={16} />
                                    Balance paid
                                  </button>
                                </>
                              )}
                            </div>

                            {isSessionView && (
                              <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-3">
                                <p className="text-xs uppercase tracking-[0.14em] text-emerald-50/55">
                                  Remaining payment
                                </p>
                                <p className="mt-1 text-sm font-semibold capitalize text-white">
                                  {(remainingPaymentStatus || "due").replace("_", " ")}
                                </p>
                                {remainingPaymentStatus === "artist_confirmed" && (
                                  <p className="mt-1 text-xs leading-5 text-emerald-50/70">
                                    Waiting for the client to confirm the external
                                    payment from their dashboard.
                                  </p>
                                )}
                              </div>
                            )}

                            {isSessionView && (
                              <div className="mt-4">
                              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 bg-black/30 px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10">
                                <Camera size={16} />
                                {isUploadingSessionPhoto
                                  ? "Uploading..."
                                  : "Add session photo"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={isUploadingSessionPhoto}
                                  onChange={handleSessionPhotoUpload}
                                  className="sr-only"
                                />
                              </label>
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

const RemainingPaymentBadge = ({
  status,
  prefix,
  viewer = "artist",
}: {
  status: string;
  prefix?: string;
  viewer?: "client" | "artist";
}) => {
  const className =
    status === "confirmed"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : status === "artist_confirmed" || status === "client_confirmed"
      ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
      : status === "disputed"
      ? "border-red-300/25 bg-red-300/10 text-red-100"
      : "border-white/10 bg-white/[0.05] text-neutral-300";
  const label =
    status === "artist_confirmed"
      ? viewer === "client"
        ? "Confirm direct pay"
        : "Awaiting client"
      : status === "client_confirmed"
      ? viewer === "client"
        ? "Awaiting artist"
        : "Confirm direct pay"
      : status === "confirmed"
      ? "Balance paid"
      : status === "disputed"
      ? "Disputed"
      : status === "not_due"
      ? "Not due"
      : "Balance due";

  return (
    <span className={`inline-flex w-fit justify-self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
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
  booking.user?.name ||
  booking.user?.displayName ||
  booking.clientName ||
  "Client";

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

const isDashboardMultiSessionBooking = (booking: Partial<Booking>) =>
  booking.projectType === "multi_session" ||
  Number(booking.estimatedSessionCount || 1) > 1;

const getEstimatedSessionCount = (booking: Partial<Booking>) =>
  Math.max(Number(booking.estimatedSessionCount || 1), 1);

const getActiveSessionNumber = (booking: Partial<Booking>) =>
  Math.max(Number(booking.activeSessionNumber || 1), 1);

const getCompletedSessionCount = (booking: Partial<Booking>) =>
  Math.max(Number(booking.completedSessionCount || 0), 0);

const isBookingFullyCompleted = (booking: Partial<Booking>) => {
  const sessionCount = getEstimatedSessionCount(booking);
  const completedCount = getCompletedSessionCount(booking);

  return booking.sessionStatus === "completed" || completedCount >= sessionCount;
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

  if (booking.status === "cancelled") {
    return { primary, secondary: "Cancelled", tone: "red" as const };
  }

  if (booking.status === "pending_payment") {
    return { primary, secondary: "Waiting on payment", tone: "amber" as const };
  }

  if (booking.sessionStatus === "in_progress") {
    return { primary, secondary: "In progress", tone: "sky" as const };
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
  if (!["confirmed", "deposit_paid", "paid"].includes(String(booking.status))) {
    return false;
  }

  if (booking.sessionStatus === "in_progress" || isBookingFullyCompleted(booking)) {
    return false;
  }

  return ["not_started", "awaiting_next_session", undefined].includes(
    booking.sessionStatus
  );
};

const getDashboardSessionInstallmentAmount = (booking: Partial<Booking>) => {
  const remaining = getDashboardRemainingBalance(booking);
  const pending = Number(booking.pendingSessionPaymentAmount || 0);
  if (pending > 0) return Math.min(pending, remaining);

  const sessionsLeft = Math.max(
    getEstimatedSessionCount(booking) - Number(booking.completedSessionCount || 0),
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
  const nextPaid = Math.min(price, currentPaid + amountPaid);
  const nextRemaining = Math.max(price - nextPaid, 0);
  const hasMoreSessions =
    isDashboardMultiSessionBooking(booking) &&
    sessionNumber < sessionCount &&
    nextRemaining > 0;

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
      remainingPaymentStatus: nextRemaining > 0 ? "due" : "confirmed",
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
      activeSessionNumber: hasMoreSessions ? sessionNumber + 1 : sessionNumber,
      pendingSessionPaymentAmount: 0,
      pendingSessionPaymentAmountCents: 0,
      pendingSessionNumber: null,
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

const getBookingStartTime = (booking: Booking) => {
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

const isActiveSessionBooking = (booking: Partial<Booking> | Record<string, unknown>) => {
  if (booking.sessionStatus === "in_progress") return true;

  if (booking.sessionStatus !== "completed") return false;

  const typedBooking = booking as Partial<Booking>;
  const remainingPaymentStatus = String(typedBooking.remainingPaymentStatus || "");

  return (
    getDashboardRemainingBalance(typedBooking) > 0 &&
    remainingPaymentStatus !== "confirmed"
  );
};

const isOngoingProjectBooking = (
  booking: Partial<Booking> | Record<string, unknown>
) =>
  isDashboardMultiSessionBooking(booking as Partial<Booking>) &&
  booking.status !== "cancelled" &&
  booking.status !== "paid" &&
  getDashboardRemainingBalance(booking as Partial<Booking>) > 0;

export default ArtistDashboardView;
