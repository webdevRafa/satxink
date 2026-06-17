import {
  Fragment,
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Dialog, Transition } from "@headlessui/react";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  CalendarCheck,
  CalendarDays,
  Camera,
  Check,
  Clock3,
  Compass,
  CreditCard,
  DollarSign,
  Eye,
  Heart,
  Image as ImageIcon,
  Layers,
  LoaderCircle,
  Mail,
  MapPin,
  ReceiptText,
  RefreshCcw,
  Save,
  Store,
  UserRound,
  X,
} from "lucide-react";

import ClientSidebarNavigation from "../components/ClientSidebarNavigation";
import LikedArtistsList from "../components/LikedArtistsList";
import ClientOffersList from "../components/ClientOffersList";
import ClientBookingsList from "../components/ClientBookingsList";
import RequestTattooModal from "../components/RequestTattooModal";
import ClientRequestsList from "../components/ClientRequestsList";
import ImageCropperModal from "../components/ImageCropperModal";
import ProjectControlsPanel from "../components/ProjectControlsPanel";
import ProjectPauseDialog from "../components/ProjectPauseDialog";
import ProjectScheduleProposalDialog from "../components/ProjectScheduleProposalDialog";
import { syncGoogleAvatar } from "../utils/syncGoogleAvatar";
import { db, auth, storage, functions } from "../firebase/firebaseConfig";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { Booking, ProjectAmendment } from "../types/Booking";
import type { Offer } from "../types/Offer";
import { TATTOO_STYLES, getCanonicalTattooStyles } from "../types/TattooStyle";
import {
  formatClientFullName,
  getClientNameParts,
} from "../utils/clientDisplayName";

const STYLE_OPTIONS = TATTOO_STYLES;

const INTEREST_GROUPS = [
  {
    label: "Anime",
    tags: ["Dragon Ball Z", "Naruto", "One Piece", "Demon Slayer", "Studio Ghibli"],
  },
  {
    label: "Sports",
    tags: ["Spurs", "Cowboys", "Longhorns", "Astros", "UFC"],
  },
  {
    label: "Music",
    tags: ["Hip Hop", "Tejano", "Metal", "Country", "R&B"],
  },
  {
    label: "Culture",
    tags: ["San Antonio", "Puro SA", "Chicano", "Tex-Mex", "Lowrider"],
  },
  {
    label: "Nature",
    tags: ["Roses", "Snakes", "Butterflies", "Skulls", "Mountains"],
  },
  {
    label: "Gaming",
    tags: ["Pokemon", "Zelda", "Final Fantasy", "Mortal Kombat", "PlayStation"],
  },
];

const TATTOO_GOALS = [
  "Custom piece",
  "Flash drop",
  "Cover-up",
  "First tattoo",
  "Matching tattoo",
  "Sleeve planning",
];

const BUDGET_RANGES = [
  "Just browsing",
  "Under $200",
  "$200-$500",
  "$500-$1,000",
  "$1,000+",
];

const TIMEFRAME_OPTIONS = [
  "No rush",
  "This month",
  "Next 2-3 months",
  "Specific date",
];

type ClientView =
  | "overview"
  | "profile"
  | "following"
  | "requests"
  | "offers"
  | "bookings"
  | "sessions"
  | "projects";

type ClientProfileFormState = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  bio: string;
  location: string;
  preferredStyles: string[];
  interestCategories: string[];
  interestTags: string[];
  tattooGoals: string[];
  budgetRange: string;
  timeframe: string;
};

type ClientProfile = ClientProfileFormState & {
  id: string;
  name: string;
  likedArtists: string[];
  savedPosts?: string[];
};

type ClientDashboardBooking = Booking & {
  artistName?: string;
  artistAvatar?: string;
};

type ClientDashboardAction = {
  id: string;
  label: string;
  description: string;
  tone: "red" | "amber" | "sky" | "emerald" | "neutral";
  cta: string;
  onClick: () => void;
};

type ClientProjectBooking = ClientDashboardBooking & {
  projectType: "multi_session";
};

type ClientDashboardRequest = {
  id: string;
  artistId?: string;
  artistName?: string;
  status?: string;
  offerPreparationStatus?: string;
  bodyPlacement?: string;
  createdAt?: Booking["createdAt"];
};

type ClientDashboardOffer = Offer & {
  createdAt?: Booking["createdAt"];
};

type RequestArtist = {
  id: string;
  name: string;
  avatarUrl?: string;
  studioName?: string;
};

const activeViewLabels: Record<ClientView, string> = {
  overview: "Overview",
  profile: "Profile",
  following: "Following",
  requests: "Requests",
  offers: "Offers",
  bookings: "Bookings",
  sessions: "Sessions",
  projects: "Projects",
};

const CLIENT_VIEWS: ClientView[] = [
  "overview",
  "following",
  "requests",
  "offers",
  "bookings",
  "sessions",
  "projects",
  "profile",
];

const getClientDashboardView = (view: string | null): ClientView => {
  if (view === "liked") return "following";
  if (["pending", "confirmed", "paid", "cancelled"].includes(view || "")) {
    return "bookings";
  }
  return CLIENT_VIEWS.includes(view as ClientView)
    ? (view as ClientView)
    : "overview";
};

const isClientDashboardView = (view: string | null): view is ClientView =>
  CLIENT_VIEWS.includes(view as ClientView);

const createProfileFormState = (
  client: Partial<ClientProfile> | null
): ClientProfileFormState => {
  const nameParts = getClientNameParts(client || {}, "");

  return {
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    displayName: nameParts.fullName,
    email: client?.email || "",
    avatarUrl: client?.avatarUrl || "",
    bio: client?.bio || "",
    location: client?.location || "",
    preferredStyles: getCanonicalTattooStyles(client?.preferredStyles),
    interestCategories: Array.isArray(client?.interestCategories)
      ? client.interestCategories
      : [],
    interestTags: Array.isArray(client?.interestTags) ? client.interestTags : [],
    tattooGoals: Array.isArray(client?.tattooGoals) ? client.tattooGoals : [],
    budgetRange: client?.budgetRange || "",
    timeframe: client?.timeframe || "",
  };
};

const ClientDashboardView = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<RequestArtist | null>(null);
  const [selectedSession, setSelectedSession] = useState<ClientDashboardBooking | null>(null);
  const [sessionAmendments, setSessionAmendments] = useState<ProjectAmendment[]>([]);
  const [scheduleProposalSession, setScheduleProposalSession] =
    useState<ClientDashboardBooking | null>(null);
  const [pauseSessionMode, setPauseSessionMode] =
    useState<"pause" | "resume" | null>(null);
  const [activeView, setActiveView] = useState<ClientView>(() =>
    getClientDashboardView(searchParams.get("tab"))
  );
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [bookings, setBookings] = useState<ClientDashboardBooking[]>([]);
  const [dashboardRequests, setDashboardRequests] = useState<
    ClientDashboardRequest[]
  >([]);
  const [dashboardOffers, setDashboardOffers] = useState<ClientDashboardOffer[]>(
    []
  );
  const [profileForm, setProfileForm] = useState<ClientProfileFormState>(
    createProfileFormState(null)
  );
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [customInterestTag, setCustomInterestTag] = useState("");
  const [navCounts, setNavCounts] = useState<Record<ClientView, number>>({
    overview: 0,
    profile: 0,
    following: 0,
    requests: 0,
    offers: 0,
    bookings: 0,
    sessions: 0,
    projects: 0,
  });

  useEffect(() => {
    const viewParam = searchParams.get("tab");
    const nextView = getClientDashboardView(viewParam);
    if (isClientDashboardView(nextView)) {
      setActiveView(nextView);
    }
  }, [searchParams]);

  const handleViewChange = useCallback((view: ClientView) => {
    setActiveView(view);
    setSearchParams(view === "overview" ? {} : { tab: view });
  }, [setSearchParams]);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!user) {
        setClient(null);
        return;
      }

      if (user.providerData.some((provider) => provider.providerId === "google.com")) {
        await syncGoogleAvatar();
      }

      const userRef = doc(db, "users", user.uid);
      unsubscribeProfile = onSnapshot(userRef, (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const clientNameParts = getClientNameParts(data, user.displayName || "Client");
        const nextClient = {
          id: user.uid,
          ...data,
          firstName: clientNameParts.firstName,
          lastName: clientNameParts.lastName,
          name: clientNameParts.fullName,
          displayName: clientNameParts.fullName,
          email: data.email || user.email || "",
          avatarUrl: data.avatarUrl || user.photoURL || "/default-avatar.png",
          bio: data.bio || "",
          location: data.location || "",
          preferredStyles: getCanonicalTattooStyles(data.preferredStyles),
          interestCategories: Array.isArray(data.interestCategories)
            ? data.interestCategories
            : [],
          interestTags: Array.isArray(data.interestTags) ? data.interestTags : [],
          tattooGoals: Array.isArray(data.tattooGoals) ? data.tattooGoals : [],
          budgetRange: data.budgetRange || "",
          timeframe: data.timeframe || "",
          likedArtists: Array.isArray(data.likedArtists) ? data.likedArtists : [],
          savedPosts: Array.isArray(data.savedPosts) ? data.savedPosts : [],
        } as ClientProfile;

        setClient(nextClient);
        setProfileForm((current) =>
          isProfileDirty ? current : createProfileFormState(nextClient)
        );
        setNavCounts((current) => ({
          ...current,
          following: nextClient.likedArtists.length,
        }));
      });
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribe();
    };
  }, [isProfileDirty]);

  useEffect(() => {
    if (!client?.id) return;

    const updateCount = (key: ClientView, value: number) => {
      setNavCounts((current) => ({ ...current, [key]: value }));
    };

    const unsubs = [
      onSnapshot(
        query(
          collection(db, "bookingRequests"),
          where("clientId", "==", client.id),
          where("status", "==", "pending")
        ),
        (snap) => {
          const nextRequests = snap.docs.map((requestDoc) => ({
            id: requestDoc.id,
            ...requestDoc.data(),
          })) as ClientDashboardRequest[];
          setDashboardRequests(nextRequests);
          updateCount("requests", snap.size);
        },
        (error) => console.error("Client request count listener failed:", error)
      ),
      onSnapshot(
        query(
          collection(db, "offers"),
          where("clientId", "==", client.id),
          where("status", "==", "pending")
        ),
        (snap) => {
          const nextOffers = snap.docs.map((offerDoc) => ({
            id: offerDoc.id,
            ...offerDoc.data(),
          })) as ClientDashboardOffer[];
          setDashboardOffers(nextOffers);
          updateCount("offers", snap.size);
        },
        (error) => console.error("Client offer count listener failed:", error)
      ),
      onSnapshot(
        query(collection(db, "bookings"), where("clientId", "==", client.id)),
        (snap) => {
          const nextBookings = snap.docs.map((bookingDoc) => ({
            id: bookingDoc.id,
            ...bookingDoc.data(),
          })) as ClientDashboardBooking[];
          setBookings(nextBookings);
          updateCount("overview", nextBookings.length);
          updateCount(
            "bookings",
            nextBookings.length
          );
          updateCount(
            "sessions",
            nextBookings.filter((booking) => isClientSessionLedgerBooking(booking)).length
          );
          updateCount(
            "projects",
            nextBookings.filter((booking) => isClientMultiSessionBooking(booking)).length
          );
        },
        (error) => console.error("Client booking listener failed:", error)
      ),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [client?.id]);

  useEffect(() => {
    if (!selectedSession?.id) {
      setSessionAmendments([]);
      return;
    }

    const amendmentsQuery = query(
      collection(db, "bookings", selectedSession.id, "amendments"),
      where("status", "==", "proposed")
    );

    return onSnapshot(
      amendmentsQuery,
      (snap) => {
        setSessionAmendments(
          snap.docs.map((amendmentDoc) => ({
            id: amendmentDoc.id,
            ...amendmentDoc.data(),
          })) as ProjectAmendment[]
        );
      },
      (error) => {
        console.error("Client session amendment listener failed:", error);
        setSessionAmendments([]);
      }
    );
  }, [selectedSession?.id]);

  const updateProfileForm = (
    updater:
      | Partial<ClientProfileFormState>
      | ((current: ClientProfileFormState) => ClientProfileFormState)
  ) => {
    setProfileForm((current) =>
      typeof updater === "function"
        ? updater(current)
        : { ...current, ...updater }
    );
    setIsProfileDirty(true);
  };

  const toggleArrayValue = (
    key: "preferredStyles" | "interestCategories" | "interestTags" | "tattooGoals",
    value: string
  ) => {
    updateProfileForm((current) => {
      const exists = current[key].includes(value);
      return {
        ...current,
        [key]: exists
          ? current[key].filter((item) => item !== value)
          : [...current[key], value],
      };
    });
  };

  const addCustomInterestTag = () => {
    const tag = customInterestTag.trim();
    if (!tag) return;

    updateProfileForm((current) => ({
      ...current,
      interestTags: current.interestTags.some(
        (item) => item.toLowerCase() === tag.toLowerCase()
      )
        ? current.interestTags
        : [...current.interestTags, tag],
    }));
    setCustomInterestTag("");
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
    if (!client?.id) return;

    const originalRef = ref(storage, `users/${client.id}/avatar-original.jpg`);
    const processedRef = ref(storage, `users/${client.id}/avatar.jpg`);
    setIsUploadingAvatar(true);

    try {
      await Promise.allSettled([deleteObject(originalRef), deleteObject(processedRef)]);
      await uploadBytes(originalRef, croppedFile, { contentType: croppedFile.type });

      let avatarUrl = "";
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          avatarUrl = await getDownloadURL(processedRef);
          break;
        } catch {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }

      if (!avatarUrl) throw new Error("Processed avatar was not ready.");

      await updateDoc(doc(db, "users", client.id), {
        avatarUrl,
        updatedAt: serverTimestamp(),
      });

      const previewAvatarUrl = `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
      setClient((current) => (current ? { ...current, avatarUrl: previewAvatarUrl } : current));
      setProfileForm((current) => ({ ...current, avatarUrl: previewAvatarUrl }));
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
    setProfileForm(createProfileFormState(client));
    setCustomInterestTag("");
    setIsProfileDirty(false);
  };

  const handleSaveProfile = async () => {
    if (!client?.id) return;

    const firstName = profileForm.firstName.trim();
    const lastName = profileForm.lastName.trim();
    const displayName = formatClientFullName(firstName, lastName, "");
    const email = profileForm.email.trim();

    if (!firstName || !lastName) {
      toast.error("First and last name are required.");
      return;
    }

    if (email && !email.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }

    setIsSavingProfile(true);

    const profileUpdate = {
      firstName,
      lastName,
      name: displayName,
      displayName,
      email,
      avatarUrl: profileForm.avatarUrl,
      bio: profileForm.bio.trim(),
      location: profileForm.location.trim(),
      preferredStyles: profileForm.preferredStyles,
      interestCategories: profileForm.interestCategories,
      interestTags: profileForm.interestTags,
      tattooGoals: profileForm.tattooGoals,
      budgetRange: profileForm.budgetRange,
      timeframe: profileForm.timeframe,
      discoveryPreferences: {
        categories: profileForm.interestCategories,
        tags: profileForm.interestTags,
        tattooGoals: profileForm.tattooGoals,
        budgetRange: profileForm.budgetRange,
        timeframe: profileForm.timeframe,
        updatedAt: serverTimestamp(),
      },
      profileComplete: true,
      role: "client",
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, "users", client.id), profileUpdate);
      const nextClient = { ...client, ...profileUpdate } as ClientProfile;
      setClient(nextClient);
      setProfileForm(createProfileFormState(nextClient));
      setIsProfileDirty(false);
      toast.success("Profile updated.");
    } catch (error) {
      console.error("Client profile update failed:", error);
      toast.error("Profile update failed.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleConfirmExternalPayment = async (booking: ClientDashboardBooking) => {
    const artistAlreadyConfirmed =
      booking.remainingPaymentStatus === "artist_confirmed";
    const confirmationSessionNumber = getPayableSessionNumber(booking);

    if (!artistAlreadyConfirmed) {
      try {
        const confirmationUpdate = {
          bookingId: booking.id,
          artistId: booking.artistId,
          clientId: booking.clientId,
          sessionNumber: confirmationSessionNumber,
          remainingPaymentStatus: "client_confirmed",
          paymentStatus: "client_confirmed",
          clientConfirmedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await Promise.all([
          setDoc(doc(db, "bookingSessions", booking.id), confirmationUpdate, {
            merge: true,
          }),
          setDoc(
            doc(
              db,
              "bookingSessions",
              booking.id,
              "sessions",
              `session-${confirmationSessionNumber}`
            ),
            confirmationUpdate,
            { merge: true }
          ),
          updateDoc(doc(db, "bookings", booking.id), {
            remainingPaymentStatus: "client_confirmed",
            externalRemainingClientConfirmedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        ]);
        toast.success("Payment confirmation sent to the artist.");
        setSelectedSession(null);
      } catch (error) {
        console.error("Direct payment confirmation failed:", error);
        toast.error("Could not confirm the payment.");
      }
      return;
    }

    const remainingAmount = getRemainingBalance(booking);
    const sessionInstallment = getClientSessionInstallmentAmount(booking);
    const isMultiSession = isClientMultiSessionBooking(booking);
    const amountToConfirm = isMultiSession
      ? Math.min(sessionInstallment, remainingAmount)
      : remainingAmount;
    const currentPaid = Number(
      booking.totalArtistPaidAmount ||
        booking.depositPaidAmount ||
        booking.depositAmount ||
        0
    );
    const nextPaid = Math.min(Number(booking.price || 0), currentPaid + amountToConfirm);
    const nextRemaining = Math.max(Number(booking.price || 0) - nextPaid, 0);
    const sessionNumber = Math.max(
      Number(booking.pendingSessionNumber || booking.activeSessionNumber || 1),
      1
    );
    const sessionCount = Math.max(Number(booking.estimatedSessionCount || 1), 1);
    const installmentTiming =
      booking.sessionInstallmentTiming === "before_session"
        ? "before_session"
        : "after_session";
    const hasMoreSessions =
      isMultiSession &&
      nextRemaining > 0 &&
      (installmentTiming === "before_session"
        ? Number(booking.completedSessionCount || 0) < sessionCount
        : sessionNumber < sessionCount);
    const nextActiveSessionNumber =
      installmentTiming === "before_session"
        ? sessionNumber
        : hasMoreSessions
        ? Math.min(sessionNumber + 1, sessionCount)
        : sessionNumber;
    const paymentUpdate = {
      bookingId: booking.id,
      artistId: booking.artistId,
      clientId: booking.clientId,
      remainingPaymentStatus: "confirmed",
      paymentStatus: "confirmed",
      sessionNumber,
      paidAmount: amountToConfirm,
      paidAmountCents: Math.round(amountToConfirm * 100),
      clientConfirmedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await Promise.all([
        setDoc(doc(db, "bookingSessions", booking.id), paymentUpdate, {
          merge: true,
        }),
        setDoc(
          doc(
            db,
            "bookingSessions",
            booking.id,
            "sessions",
            `session-${sessionNumber}`
          ),
          paymentUpdate,
          { merge: true }
        ),
        updateDoc(doc(db, "bookings", booking.id), {
          status: nextRemaining > 0 ? "deposit_paid" : "paid",
          remainingPaymentStatus: nextRemaining > 0 ? "not_due" : "confirmed",
          externalRemainingClientConfirmedAt: serverTimestamp(),
          remainingPaidAt:
            nextRemaining > 0 ? booking.remainingPaidAt ?? null : serverTimestamp(),
          paidAt: nextRemaining > 0 ? booking.paidAt ?? null : serverTimestamp(),
          remainingPaidAmount:
            Number(booking.remainingPaidAmount || 0) + amountToConfirm,
          remainingPaidAmountCents:
            Number(booking.remainingPaidAmountCents || 0) +
            Math.round(amountToConfirm * 100),
          totalArtistPaidAmount: nextPaid,
          totalArtistPaidCents: Math.round(nextPaid * 100),
          remainingBalanceAmount: nextRemaining,
          remainingBalanceCents: Math.round(nextRemaining * 100),
          sessionStatus: hasMoreSessions
            ? "awaiting_next_session"
            : booking.sessionStatus,
          activeSessionNumber: nextActiveSessionNumber,
          pendingSessionPaymentAmount: 0,
          pendingSessionPaymentAmountCents: 0,
          pendingSessionNumber: null,
          pendingSessionPaymentNote: null,
          pendingSessionPaymentRequestedAt: null,
          pendingSessionPaymentRequestedBy: null,
          lastPaidSessionNumber: sessionNumber,
          updatedAt: serverTimestamp(),
        }),
      ]);
      toast.success("Direct payment confirmed.");
      setSelectedSession(null);
    } catch (error) {
      console.error("Direct payment confirmation failed:", error);
      toast.error("Could not confirm the payment.");
    }
  };

  const handleDisputeExternalPayment = async (booking: ClientDashboardBooking) => {
    const reason =
      window.prompt("Briefly describe the issue with this payment.")?.trim() ||
      "Client reported an issue with the direct payment.";
    const sessionNumber = getPayableSessionNumber(booking);
    const disputeUpdate = {
      bookingId: booking.id,
      artistId: booking.artistId,
      clientId: booking.clientId,
      sessionNumber,
      remainingPaymentStatus: "disputed",
      paymentStatus: "disputed",
      disputeReason: reason,
      disputedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await Promise.all([
        setDoc(doc(db, "bookingSessions", booking.id), disputeUpdate, {
          merge: true,
        }),
        setDoc(
          doc(
            db,
            "bookingSessions",
            booking.id,
            "sessions",
            `session-${sessionNumber}`
          ),
          disputeUpdate,
          { merge: true }
        ),
        updateDoc(doc(db, "bookings", booking.id), {
          remainingPaymentStatus: "disputed",
          externalRemainingDisputeReason: reason,
          externalRemainingDisputedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      ]);
      toast.success("Issue reported.");
      setSelectedSession(null);
    } catch (error) {
      console.error("Direct payment dispute failed:", error);
      toast.error("Could not report the issue.");
    }
  };

  const handleRespondToSessionAmendment = async (
    amendmentId: string,
    response: "accepted" | "declined" | "cancelled"
  ) => {
    if (!selectedSession) return;

    try {
      const respondToAmendment = httpsCallable(
        functions,
        "respondToProjectAmendment"
      );
      await respondToAmendment({
        bookingId: selectedSession.id,
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
      console.error("Client session amendment response failed:", error);
      toast.error("Could not update the amendment.");
    }
  };

  const handleRequestSessionProposal = async (
    booking: Booking,
    input: { date: string; time: string; message: string }
  ) => {
    try {
      const proposeAmendment = httpsCallable(
        functions,
        "proposeProjectAmendment"
      );
      await proposeAmendment({
        bookingId: booking.id,
        type: "schedule_next_session",
        date: input.date,
        time: input.time,
        sessionNumber: Math.max(Number(booking.activeSessionNumber || 1), 1),
        message: input.message,
      });
      toast.success("Next-session request sent to the artist.");
    } catch (error) {
      console.error("Client next-session request failed:", error);
      toast.error("Could not send the session request.");
      throw error;
    }
  };

  const handleSetSessionProjectPaused = async (
    booking: Booking,
    input: { reason: string; pausedUntil: string }
  ) => {
    const paused = pauseSessionMode === "pause";

    try {
      const setPaused = httpsCallable(functions, "setProjectPaused");
      await setPaused({
        bookingId: booking.id,
        paused,
        reason: input.reason,
        pausedUntil: input.pausedUntil,
      });
      toast.success(paused ? "Project paused." : "Project resumed.");
    } catch (error) {
      console.error("Client project pause update failed:", error);
      toast.error("Could not update project status.");
      throw error;
    }
  };

  const profileCompletionItems = [
    Boolean(profileForm.firstName.trim() && profileForm.lastName.trim()),
    Boolean(profileForm.email.trim()),
    Boolean(profileForm.avatarUrl.trim()),
    Boolean(profileForm.bio.trim()),
    Boolean(profileForm.location.trim()),
    profileForm.preferredStyles.length > 0,
    profileForm.interestTags.length > 0,
    profileForm.tattooGoals.length > 0,
  ];
  const profileCompletion = Math.round(
    (profileCompletionItems.filter(Boolean).length / profileCompletionItems.length) * 100
  );
  const profileStrengthColor =
    profileCompletion === 100
      ? "bg-emerald-400"
      : profileCompletion >= 60
      ? "bg-amber-400"
      : "bg-[var(--color-primary)]";
  const isSaveDisabled =
    !isProfileDirty ||
    isSavingProfile ||
    isUploadingAvatar ||
    !profileForm.firstName.trim() ||
    !profileForm.lastName.trim();

  const sessions = useMemo(
    () =>
      bookings
        .filter((booking) => isClientSessionLedgerBooking(booking))
        .sort(compareClientBookingSchedule),
    [bookings]
  );
  const projects = useMemo(
    () =>
      bookings
        .filter((booking): booking is ClientProjectBooking =>
          isClientMultiSessionBooking(booking)
        )
        .sort(compareClientBookingSchedule),
    [bookings]
  );
  const upcomingAppointments = useMemo(
    () =>
      bookings
        .filter((booking) => hasClientAppointment(booking))
        .sort(compareClientBookingSchedule)
        .slice(0, 4),
    [bookings]
  );
  const overviewActions = useMemo<ClientDashboardAction[]>(() => {
    const actions: ClientDashboardAction[] = [];
    const pendingDeposit = bookings.find(
      (booking) => booking.status === "pending_payment"
    );
    const payableBooking = bookings.find(
      (booking) =>
        booking.status === "deposit_paid" &&
        getClientPayableAmount(booking) > 0 &&
        booking.remainingPaymentMethod !== "external"
    );
    const directPaymentBooking = bookings.find((booking) =>
      needsClientDirectPaymentAction(booking)
    );
    const pendingOffer = [...dashboardOffers].sort(
      (a, b) => getBookingCreatedTime(b) - getBookingCreatedTime(a)
    )[0];
    const nextAppointment = upcomingAppointments[0];

    if (pendingDeposit) {
      actions.push({
        id: `deposit-${pendingDeposit.id}`,
        label: "Deposit payment needed",
        description: `${pendingDeposit.artistName || "Artist"} is waiting for the deposit to confirm your appointment.`,
        tone: "amber",
        cta: "Pay deposit",
        onClick: () => navigate(`/payment/${pendingDeposit.id}`),
      });
    }

    if (payableBooking) {
      actions.push({
        id: `balance-${payableBooking.id}`,
        label: isClientMultiSessionBooking(payableBooking)
          ? "Session payment requested"
          : "Remaining balance due",
        description: `${formatMoney(getClientPayableAmount(payableBooking))} is ready to pay for ${payableBooking.artistName || "your artist"}.`,
        tone: "amber",
        cta: "Pay now",
        onClick: () => navigate(`/payment/${payableBooking.id}`),
      });
    }

    if (directPaymentBooking) {
      actions.push({
        id: `direct-${directPaymentBooking.id}`,
        label: "Direct payment confirmation",
        description: `Confirm or review the direct payment status for ${directPaymentBooking.artistName || "your artist"}.`,
        tone: "sky",
        cta: "Open record",
        onClick: () => setSelectedSession(directPaymentBooking),
      });
    }

    if (pendingOffer) {
      actions.push({
        id: `offer-${pendingOffer.id}`,
        label: "Offer waiting for response",
        description: `${pendingOffer.displayName || "An artist"} sent an offer for ${formatMoney(pendingOffer.price)}.`,
        tone: "emerald",
        cta: "Review offers",
        onClick: () => handleViewChange("offers"),
      });
    }

    if (nextAppointment) {
      actions.push({
        id: `appointment-${nextAppointment.id}`,
        label: "Upcoming appointment",
        description: `${formatAppointment(nextAppointment.selectedDate)} with ${nextAppointment.artistName || "your artist"}.`,
        tone: "neutral",
        cta: isClientMultiSessionBooking(nextAppointment) ? "Open project" : "Open booking",
        onClick: () =>
          isClientMultiSessionBooking(nextAppointment)
            ? handleViewChange("projects")
            : handleViewChange("bookings"),
      });
    }

    if (profileCompletion < 100) {
      actions.push({
        id: "profile-completion",
        label: "Complete your client profile",
        description: "A stronger profile gives artists better context when you request work.",
        tone: "neutral",
        cta: "Finish profile",
        onClick: () => handleViewChange("profile"),
      });
    }

    return actions.slice(0, 6);
  }, [
    bookings,
    dashboardOffers,
    handleViewChange,
    navigate,
    profileCompletion,
    upcomingAppointments,
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#121212] pt-20 text-white md:flex-row">
      {avatarCropSrc && (
        <ImageCropperModal
          imageSrc={avatarCropSrc}
          aspect={1}
          onCancel={() => setAvatarCropSrc(null)}
          onSave={handleAvatarCropSave}
        />
      )}

      <ClientSidebarNavigation
        activeView={activeView}
        counts={navCounts}
        onViewChange={handleViewChange}
      />

      <main className="flex-1 p-6">
        {client && activeView !== "profile" && (
          <ClientHero
            client={client}
            activeView={activeView}
            bookings={bookings}
          />
        )}

        {client && activeView === "overview" && (
          <ClientOverviewSection
            actions={overviewActions}
            bookings={bookings}
            offers={dashboardOffers}
            projects={projects}
            requests={dashboardRequests}
            upcomingAppointments={upcomingAppointments}
            onOpenRecord={setSelectedSession}
            onOpenView={handleViewChange}
            onPay={(bookingId) => navigate(`/payment/${bookingId}`)}
          />
        )}

        {client && activeView === "profile" && (
          <ClientProfileSettings
            client={client}
            profileForm={profileForm}
            profileCompletion={profileCompletion}
            profileStrengthColor={profileStrengthColor}
            isProfileDirty={isProfileDirty}
            isSavingProfile={isSavingProfile}
            isUploadingAvatar={isUploadingAvatar}
            isSaveDisabled={isSaveDisabled}
            customInterestTag={customInterestTag}
            onCustomInterestTagChange={setCustomInterestTag}
            onAddCustomInterestTag={addCustomInterestTag}
            onAvatarFileSelect={handleAvatarFileSelect}
            onReset={resetProfileForm}
            onSave={handleSaveProfile}
            onUpdate={updateProfileForm}
            onToggleArrayValue={toggleArrayValue}
          />
        )}

        {client && activeView === "following" && (
          <LikedArtistsList
            client={client}
            onRequest={(artist) => {
              setSelectedArtist(artist);
              setIsModalOpen(true);
            }}
          />
        )}
        {client && activeView === "requests" && <ClientRequestsList clientId={client.id} />}
        {client && activeView === "offers" && (
          <ClientOffersList
            clientId={client.id}
            onOfferResolved={(outcome) => {
              setNavCounts((current) => ({
                ...current,
                offers: Math.max(current.offers - 1, 0),
                bookings:
                  outcome === "accepted" ? current.bookings + 1 : current.bookings,
              }));
            }}
          />
        )}
        {client && activeView === "bookings" && <ClientBookingsList clientId={client.id} />}
        {client && activeView === "sessions" && (
          <ClientSessionsSection
            sessions={sessions}
            onOpenRecord={setSelectedSession}
            onPay={(bookingId) => navigate(`/payment/${bookingId}`)}
            onConfirmExternalPayment={handleConfirmExternalPayment}
            onDisputeExternalPayment={handleDisputeExternalPayment}
          />
        )}
        {client && activeView === "projects" && (
          <ClientProjectsSection
            projects={projects}
            onOpenRecord={setSelectedSession}
            onPay={(bookingId) => navigate(`/payment/${bookingId}`)}
            onRequestNextSession={setScheduleProposalSession}
            onConfirmExternalPayment={handleConfirmExternalPayment}
            onDisputeExternalPayment={handleDisputeExternalPayment}
          />
        )}
      </main>

      {client && selectedArtist && (
        <RequestTattooModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedArtist(null);
          }}
          client={client}
          artist={selectedArtist}
          onRequestSent={() => {
            setNavCounts((current) => ({
              ...current,
              requests: current.requests + 1,
            }));
          }}
        />
      )}

      <ClientSessionRecordDialog
        booking={selectedSession}
        clientId={client?.id || null}
        amendments={sessionAmendments}
        onClose={() => setSelectedSession(null)}
        onPay={(bookingId) => navigate(`/payment/${bookingId}`)}
        onConfirmExternalPayment={handleConfirmExternalPayment}
        onDisputeExternalPayment={handleDisputeExternalPayment}
        onRespondToAmendment={handleRespondToSessionAmendment}
        onRequestNextSession={(booking) => setScheduleProposalSession(booking)}
        onPauseProject={() => setPauseSessionMode("pause")}
        onResumeProject={() => setPauseSessionMode("resume")}
      />
      <ProjectScheduleProposalDialog
        booking={scheduleProposalSession}
        viewerRole="client"
        onClose={() => setScheduleProposalSession(null)}
        onSubmit={handleRequestSessionProposal}
      />
      <ProjectPauseDialog
        booking={pauseSessionMode ? selectedSession : null}
        mode={pauseSessionMode || "pause"}
        viewerRole="client"
        onClose={() => setPauseSessionMode(null)}
        onSubmit={handleSetSessionProjectPaused}
      />
    </div>
  );
};

const ClientProfileSettings = ({
  profileForm,
  profileCompletion,
  profileStrengthColor,
  isProfileDirty,
  isSavingProfile,
  isUploadingAvatar,
  isSaveDisabled,
  customInterestTag,
  onCustomInterestTagChange,
  onAddCustomInterestTag,
  onAvatarFileSelect,
  onReset,
  onSave,
  onUpdate,
  onToggleArrayValue,
}: {
  client: ClientProfile;
  profileForm: ClientProfileFormState;
  profileCompletion: number;
  profileStrengthColor: string;
  isProfileDirty: boolean;
  isSavingProfile: boolean;
  isUploadingAvatar: boolean;
  isSaveDisabled: boolean;
  customInterestTag: string;
  onCustomInterestTagChange: (value: string) => void;
  onAddCustomInterestTag: () => void;
  onAvatarFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  onSave: () => void;
  onUpdate: (
    updater:
      | Partial<ClientProfileFormState>
      | ((current: ClientProfileFormState) => ClientProfileFormState)
  ) => void;
  onToggleArrayValue: (
    key: "preferredStyles" | "interestCategories" | "interestTags" | "tattooGoals",
    value: string
  ) => void;
}) => (
  <section className="mt-6 w-full max-w-6xl space-y-6">
    <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Client account
        </p>
        <h1 className="mt-2 text-3xl! font-semibold text-white">
          Profile settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">
          Keep your public profile, discovery preferences, and booking context
          up to date from one place.
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
          onClick={onReset}
          disabled={!isProfileDirty || isSavingProfile}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCcw size={16} aria-hidden="true" />
          Reset
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaveDisabled}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5 py-2 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={16} className="text-[#0b0b0b]!" aria-hidden="true" />
          {isSavingProfile ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <PanelTitle
            icon={<UserRound size={18} />}
            title="Public identity"
            description="This is what artists see when you request work or follow their profile."
          />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">
                First name
              </span>
              <input
                type="text"
                value={profileForm.firstName}
                onChange={(event) => onUpdate({ firstName: event.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                placeholder="Ralph"
              />
              <span className="block text-xs text-neutral-500">
                Required for booking records and artist communication.
              </span>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-200">
                Last name
              </span>
              <input
                type="text"
                value={profileForm.lastName}
                onChange={(event) => onUpdate({ lastName: event.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                placeholder="Garcia"
              />
              <span className="block text-xs text-neutral-500">
                Shown in booking records and payment context.
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
                onChange={(event) => onUpdate({ email: event.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                placeholder="client@example.com"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                <MapPin size={15} aria-hidden="true" />
                Location
              </span>
              <input
                type="text"
                value={profileForm.location}
                onChange={(event) => onUpdate({ location: event.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                placeholder="San Antonio, TX"
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
                  alt="Current client avatar"
                  className="h-16 w-16 rounded-full border border-white/10 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">Update your avatar</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Upload and crop a square image for SATX Ink.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-neutral-200 transition hover:border-white/25 hover:text-white">
                  {isUploadingAvatar ? (
                    <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Camera size={15} aria-hidden="true" />
                  )}
                  {isUploadingAvatar ? "Uploading" : "Edit"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={isUploadingAvatar}
                    onChange={onAvatarFileSelect}
                  />
                </label>
              </div>
            </div>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-medium text-neutral-200">
              Profile note
            </span>
            <textarea
              value={profileForm.bio}
              onChange={(event) => onUpdate({ bio: event.target.value })}
              rows={5}
              maxLength={500}
              className="w-full resize-none rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
              placeholder="Tell artists what you are into, what you are planning, or what kind of experience you are looking for."
            />
            <span className="block text-right text-xs text-neutral-500">
              {profileForm.bio.length}/500
            </span>
          </label>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <PanelTitle
            icon={<Compass size={18} />}
            title="Discovery preferences"
            description="Tune the styles and interests that shape your browsing experience."
          />

          <p className="mb-3 text-sm font-medium text-neutral-200">Styles</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {STYLE_OPTIONS.map((style) => {
              const selected = profileForm.preferredStyles.includes(style);
              return (
                <button
                  key={style}
                  type="button"
                  onClick={() => onToggleArrayValue("preferredStyles", style)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                    selected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white"
                      : "border-white/10 bg-[#101010] text-neutral-300 hover:border-white/25"
                  }`}
                >
                  {style}
                </button>
              );
            })}
          </div>

          <p className="mb-3 mt-5 text-sm font-medium text-neutral-200">
            Interests
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {INTEREST_GROUPS.map((group) => {
              const selected = profileForm.interestCategories.includes(group.label);
              return (
                <button
                  key={group.label}
                  type="button"
                  onClick={() => onToggleArrayValue("interestCategories", group.label)}
                  className={`rounded-lg border p-4 text-left transition ${
                    selected
                      ? "border-white bg-white text-[#0b0b0b]"
                      : "border-white/10 bg-[#101010] text-neutral-300 hover:border-white/25"
                  }`}
                >
                  <span className="block text-sm font-semibold">{group.label}</span>
                  <span className="mt-1 block text-xs opacity-70">
                    {group.tags.slice(0, 3).join(", ")}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-white">Interest tags</p>
              <p className="text-xs text-neutral-500">
                {profileForm.interestTags.length} selected
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {INTEREST_GROUPS.flatMap((group) =>
                group.tags.map((tag) => {
                  const selected = profileForm.interestTags.includes(tag);
                  return (
                    <button
                      key={`${group.label}-${tag}`}
                      type="button"
                      onClick={() => onToggleArrayValue("interestTags", tag)}
                      className={`rounded-full border px-3 py-2 text-xs transition ${
                        selected
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white"
                          : "border-white/10 bg-[#101010] text-neutral-400 hover:border-white/25 hover:text-white"
                      }`}
                    >
                      #{tag.replace(/\s+/g, "")}
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={customInterestTag}
                onChange={(event) => onCustomInterestTagChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onAddCustomInterestTag();
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                placeholder="Add your own tag"
              />
              <button
                type="button"
                onClick={onAddCustomInterestTag}
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-200 transition hover:border-white/25 hover:text-white"
              >
                Add tag
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <PanelTitle
            icon={<CalendarCheck size={18} />}
            title="Tattoo planning"
            description="Keep your current intent visible when artists review requests."
          />

          <div>
            <p className="mb-3 text-sm font-medium text-neutral-200">
              What are you here to do?
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {TATTOO_GOALS.map((goal) => {
                const selected = profileForm.tattooGoals.includes(goal);
                return (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => onToggleArrayValue("tattooGoals", goal)}
                    className={`rounded-md border px-3 py-3 text-left text-sm transition ${
                      selected
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white"
                        : "border-white/10 bg-[#101010] text-neutral-300 hover:border-white/25"
                    }`}
                  >
                    {goal}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                <BadgeDollarSign size={15} aria-hidden="true" />
                Budget range
              </span>
              <select
                value={profileForm.budgetRange}
                onChange={(event) => onUpdate({ budgetRange: event.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
              >
                <option value="">Select a range</option>
                {BUDGET_RANGES.map((range) => (
                  <option key={range} value={range}>
                    {range}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                <Clock3 size={15} aria-hidden="true" />
                Timeline
              </span>
              <select
                value={profileForm.timeframe}
                onChange={(event) => onUpdate({ timeframe: event.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
              >
                <option value="">Select a timeline</option>
                {TIMEFRAME_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      </div>

      <ClientProfilePreview profileForm={profileForm} />
    </div>
  </section>
);

const ClientProfilePreview = ({
  profileForm,
}: {
  profileForm: ClientProfileFormState;
}) => {
  const fullName =
    formatClientFullName(profileForm.firstName, profileForm.lastName, "") ||
    profileForm.displayName;
  const visibleTags = [
    ...profileForm.preferredStyles,
    ...profileForm.interestTags,
    ...profileForm.tattooGoals,
  ];

  return (
    <aside className="h-fit rounded-lg border border-white/10 bg-[#101010] p-5 xl:sticky xl:top-28">
      <div className="flex items-center gap-4">
        <img
          src={profileForm.avatarUrl || "/fallback-avatar.jpg"}
          alt={fullName || "Client avatar preview"}
          className="h-20 w-20 rounded-full border border-white/10 object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-white">
            {fullName || "Client name"}
          </p>
          <p className="truncate text-sm text-neutral-400">
            {profileForm.email || "email@example.com"}
          </p>
        </div>
      </div>

      <p className="mt-5 line-clamp-5 text-sm leading-6 text-neutral-300">
        {profileForm.bio ||
          "Your profile note helps artists understand your taste before you request work."}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {visibleTags.length > 0 ? (
          visibleTags.slice(0, 8).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-200"
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-sm text-neutral-500">
            No styles or interests selected yet.
          </span>
        )}
      </div>

      <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
        <PreviewRow label="Location" value={profileForm.location || "Not selected"} />
        <PreviewRow label="Budget" value={profileForm.budgetRange || "Not selected"} />
        <PreviewRow label="Timeline" value={profileForm.timeframe || "Not selected"} />
        <PreviewRow
          label="Interests"
          value={
            profileForm.interestCategories.length > 0
              ? profileForm.interestCategories.slice(0, 2).join(", ")
              : "Not selected"
          }
        />
      </div>
    </aside>
  );
};

const ClientHero = ({
  client,
  activeView,
  bookings,
}: {
  client: ClientProfile;
  activeView: ClientView;
  bookings: ClientDashboardBooking[];
}) => (
  <section className="mb-8 w-full max-w-7xl border-b border-white/10 pb-6">
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
        <img
          src={client.avatarUrl || "/fallback-avatar.jpg"}
          alt={client.name || "Client"}
          className="h-20 w-20 rounded-full border border-white/10 object-cover shadow-lg"
        />
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">
            Client dashboard
          </p>
          <h1 className="mt-2 text-3xl! font-semibold text-white">
            {activeViewLabels[activeView]}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            {getClientViewDescription(activeView, client.name || "client")}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {client.location && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-neutral-300">
                <MapPin size={13} />
                {client.location}
              </span>
            )}
            {client.preferredStyles?.length > 0 &&
              client.preferredStyles.slice(0, 6).map((style, index) => (
                <span
                  key={`${style}-${index}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-200"
                >
                  {style}
                </span>
              ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[560px]">
        <ClientMetric icon={<Heart size={17} />} label="Following" value={client.likedArtists?.length || 0} />
        <ClientMetric
          icon={<Layers size={17} />}
          label="Projects"
          value={bookings.filter((booking) => isClientMultiSessionBooking(booking)).length}
        />
        <ClientMetric
          icon={<CreditCard size={17} />}
          label="Open balance"
          value={formatMoney(
            bookings.reduce((total, booking) => total + getRemainingBalance(booking), 0)
          )}
        />
        <ClientMetric
          icon={<CalendarCheck size={17} />}
          label="Sessions"
          value={bookings.filter((booking) => isClientSessionLedgerBooking(booking)).length}
        />
      </div>
    </div>
  </section>
);

const ClientOverviewSection = ({
  actions,
  bookings,
  offers,
  projects,
  requests,
  upcomingAppointments,
  onOpenRecord,
  onOpenView,
  onPay,
}: {
  actions: ClientDashboardAction[];
  bookings: ClientDashboardBooking[];
  offers: ClientDashboardOffer[];
  projects: ClientProjectBooking[];
  requests: ClientDashboardRequest[];
  upcomingAppointments: ClientDashboardBooking[];
  onOpenRecord: (booking: ClientDashboardBooking) => void;
  onOpenView: (view: ClientView) => void;
  onPay: (bookingId: string) => void;
}) => {
  const openBalance = bookings.reduce(
    (total, booking) => total + getRemainingBalance(booking),
    0
  );
  const nextDue = bookings
    .map((booking) => getClientPayableAmount(booking))
    .find((amount) => amount > 0) || 0;
  const sortedOffers = [...offers].sort(
    (a, b) => getBookingCreatedTime(b) - getBookingCreatedTime(a)
  );
  const sortedRequests = [...requests].sort(
    (a, b) => getBookingCreatedTime(b) - getBookingCreatedTime(a)
  );

  return (
    <section className="w-full max-w-7xl space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Next due" value={formatMoney(nextDue)} />
        <MetricCard label="Open balance" value={formatMoney(openBalance)} />
        <MetricCard label="Active projects" value={projects.length} />
        <MetricCard label="Pending offers" value={offers.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,.75fr)]">
        <section className="rounded-lg border border-white/10 bg-[#111111] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                Action queue
              </p>
              <h2 className="mt-1 text-xl! font-semibold! text-white">
                What needs your attention
              </h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-neutral-300">
              {actions.length}
            </span>
          </div>

          {actions.length === 0 ? (
            <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
              <p className="text-sm font-semibold text-white">
                Everything is caught up
              </p>
              <p className="mt-1 text-sm leading-6 text-emerald-50/75">
                New offers, payment requests, and project updates will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onClick}
                  className="group flex w-full items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${getActionToneClass(
                        action.tone
                      )}`}
                    >
                      <AlertCircle size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-white">
                        {action.label}
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-neutral-400">
                        {action.description}
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-white">
                    {action.cta}
                    <ArrowRight
                      size={15}
                      className="transition group-hover:translate-x-0.5"
                    />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-white/10 bg-[#111111] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                Discovery
              </p>
              <h2 className="mt-1 text-xl! font-semibold! text-white">
                Following activity
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenView("following")}
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
            >
              Open
              <ArrowRight size={14} />
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            Followed artist flash, sheets, and gallery updates live in Following.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <DetailTile
              icon={<Heart size={17} />}
              label="Feed"
              value="Flash, sheets, gallery"
            />
            <DetailTile
              icon={<ReceiptText size={17} />}
              label="Offers"
              value={`${offers.length} waiting`}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <OverviewList
          title="Upcoming appointments"
          emptyTitle="No appointments scheduled"
          emptyDescription="Confirmed appointments and future project sessions will appear here."
          onOpenAll={() => onOpenView("sessions")}
        >
          {upcomingAppointments.slice(0, 4).map((booking) => (
            <OverviewBookingRow
              key={booking.id}
              booking={booking}
              actionLabel="Record"
              onAction={() => onOpenRecord(booking)}
            />
          ))}
        </OverviewList>

        <OverviewList
          title="Active projects"
          emptyTitle="No multi-session projects"
          emptyDescription="When an offer is accepted as a project, it will get a dedicated record here."
          onOpenAll={() => onOpenView("projects")}
        >
          {projects.slice(0, 4).map((booking) => (
            <OverviewBookingRow
              key={booking.id}
              booking={booking}
              actionLabel={
                getClientPayableAmount(booking) > 0 ? "Pay" : "Project"
              }
              onAction={() =>
                getClientPayableAmount(booking) > 0
                  ? onPay(booking.id)
                  : onOpenRecord(booking)
              }
            />
          ))}
        </OverviewList>

        <OverviewList
          title="Newest offers"
          emptyTitle="No offers waiting"
          emptyDescription="Artists' offers will appear here when they respond to a request."
          onOpenAll={() => onOpenView("offers")}
        >
          {sortedOffers.slice(0, 4).map((offer) => (
            <OverviewTextRow
              key={offer.id}
              title={offer.displayName || "Artist offer"}
              meta={formatMoney(offer.price)}
              description={
                offer.projectType === "multi_session"
                  ? `${offer.estimatedSessionCount || 2} session project`
                  : "Single appointment"
              }
              onAction={() => onOpenView("offers")}
            />
          ))}
        </OverviewList>

        <OverviewList
          title="Recent requests"
          emptyTitle="No open requests"
          emptyDescription="Requests you send from artist profiles will appear here while they are waiting."
          onOpenAll={() => onOpenView("requests")}
        >
          {sortedRequests.slice(0, 4).map((request) => (
            <OverviewTextRow
              key={request.id}
              title={request.artistName || "Artist request"}
              meta={request.status || "pending"}
              description={
                request.offerPreparationStatus
                  ? `Artist is ${request.offerPreparationStatus.replace("_", " ")}`
                  : request.bodyPlacement || "Custom tattoo request"
              }
              onAction={() => onOpenView("requests")}
            />
          ))}
        </OverviewList>
      </div>
    </section>
  );
};

const ClientProjectsSection = ({
  projects,
  onOpenRecord,
  onPay,
  onRequestNextSession,
  onConfirmExternalPayment,
  onDisputeExternalPayment,
}: {
  projects: ClientProjectBooking[];
  onOpenRecord: (booking: ClientDashboardBooking) => void;
  onPay: (bookingId: string) => void;
  onRequestNextSession: (booking: ClientDashboardBooking) => void;
  onConfirmExternalPayment: (booking: ClientDashboardBooking) => void;
  onDisputeExternalPayment: (booking: ClientDashboardBooking) => void;
}) => {
  const openBalance = projects.reduce(
    (total, booking) => total + getRemainingBalance(booking),
    0
  );
  const nextDue = projects
    .map((booking) => getClientPayableAmount(booking))
    .find((amount) => amount > 0) || 0;
  const pendingFollowUps = projects.filter(
    (booking) =>
      getClientPayableAmount(booking) > 0 ||
      needsClientDirectPaymentAction(booking) ||
      !hasClientAppointment(booking)
  ).length;

  return (
    <section className="w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">
            Client projects
          </p>
          <h1 className="mt-2 text-3xl! font-semibold text-white">
            Multi-session projects
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Track project progress, installment status, schedule proposals, and
            next-session planning from one record.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[640px]">
          <MetricCard label="Active projects" value={projects.length} />
          <MetricCard label="Open balance" value={formatMoney(openBalance)} />
          <MetricCard label="Next due" value={formatMoney(nextDue)} />
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<Layers size={22} />}
          title="No projects yet"
          description="Accepted multi-session bookings will appear here with schedule, payment, and amendment controls."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
          <div className="request-modal-scrollbar overflow-x-auto">
            <div className="min-w-[1120px]">
              <div
                className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
                style={{
                  gridTemplateColumns:
                    "minmax(220px,1.1fr) minmax(170px,.8fr) minmax(185px,.9fr) minmax(185px,.9fr) minmax(155px,.7fr) minmax(230px,1fr)",
                }}
              >
                <span>Artist / project</span>
                <span>Progress</span>
                <span>Next session</span>
                <span>Payment</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>

              <div className="divide-y divide-white/10">
                {projects.map((booking) => {
                  const payableAmount = getClientPayableAmount(booking);
                  const directAction = needsClientDirectPaymentAction(booking);
                  const canRequestNext = canClientRequestNextSession(booking);

                  return (
                    <div
                      key={booking.id}
                      className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
                      style={{
                        gridTemplateColumns:
                          "minmax(220px,1.1fr) minmax(170px,.8fr) minmax(185px,.9fr) minmax(185px,.9fr) minmax(155px,.7fr) minmax(230px,1fr)",
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3 pr-3">
                        <img
                          src={booking.artistAvatar || "/default-avatar.png"}
                          alt={booking.artistName || "Artist"}
                          className="h-11 w-11 rounded-full border border-white/10 object-cover"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">
                            {booking.artistName || "Artist"}
                          </p>
                          <p className="mt-0.5 truncate text-xs uppercase tracking-[0.12em] text-neutral-500">
                            Booking {getShortBookingId(booking.id)}
                          </p>
                        </div>
                      </div>

                      <ProjectProgressMini booking={booking} />

                      <div className="pr-3 text-sm leading-5 text-neutral-300">
                        <p>{formatAppointment(booking.selectedDate)}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Session {getPayableSessionNumber(booking)} of{" "}
                          {getEstimatedSessionCount(booking)}
                        </p>
                      </div>

                      <div className="pr-3">
                        <p className="text-sm font-semibold text-white">
                          {formatMoney(payableAmount)}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {getClientPaymentStatusLabel(booking)}
                        </p>
                      </div>

                      <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium capitalize text-neutral-300">
                        {(booking.projectStatus || "active").replace("_", " ")}
                      </span>

                      <div className="flex justify-end gap-2">
                        {payableAmount > 0 &&
                          booking.remainingPaymentMethod !== "external" && (
                            <button
                              type="button"
                              onClick={() => onPay(booking.id)}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85"
                            >
                              <CreditCard size={14} />
                              Pay
                            </button>
                          )}
                        {directAction && (
                          <button
                            type="button"
                            onClick={() => onConfirmExternalPayment(booking)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-white/85"
                          >
                            <Check size={14} />
                            Confirm
                          </button>
                        )}
                        {directAction && (
                          <button
                            type="button"
                            onClick={() => onDisputeExternalPayment(booking)}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
                          >
                            Issue
                          </button>
                        )}
                        {canRequestNext && (
                          <button
                            type="button"
                            onClick={() => onRequestNextSession(booking)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.035] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
                          >
                            <CalendarDays size={14} />
                            Next
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenRecord(booking)}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
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
          {pendingFollowUps > 0 && (
            <div className="border-t border-white/10 px-4 py-3 text-sm text-amber-100/80">
              {pendingFollowUps} project{pendingFollowUps === 1 ? "" : "s"} need
              payment, date, or direct-payment follow-up.
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const OverviewList = ({
  children,
  emptyDescription,
  emptyTitle,
  onOpenAll,
  title,
}: {
  children: ReactNode;
  emptyDescription: string;
  emptyTitle: string;
  onOpenAll: () => void;
  title: string;
}) => {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <section className="rounded-lg border border-white/10 bg-[#111111] p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg! font-semibold! text-white">{title}</h2>
        <button
          type="button"
          onClick={onOpenAll}
          className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
        >
          View all
          <ArrowRight size={14} />
        </button>
      </div>

      {hasChildren ? (
        <div className="mt-4 divide-y divide-white/10">{children}</div>
      ) : (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">{emptyTitle}</p>
          <p className="mt-1 text-sm leading-6 text-neutral-400">
            {emptyDescription}
          </p>
        </div>
      )}
    </section>
  );
};

const OverviewBookingRow = ({
  actionLabel,
  booking,
  onAction,
}: {
  actionLabel: string;
  booking: ClientDashboardBooking;
  onAction: () => void;
}) => (
  <div className="flex items-center justify-between gap-4 py-3">
    <div className="flex min-w-0 items-center gap-3">
      <img
        src={booking.artistAvatar || "/default-avatar.png"}
        alt={booking.artistName || "Artist"}
        className="h-10 w-10 rounded-full border border-white/10 object-cover"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">
          {booking.artistName || "Artist"}
        </p>
        <p className="mt-0.5 truncate text-xs text-neutral-500">
          {formatAppointment(booking.selectedDate)} - {getClientPaymentStatusLabel(booking)}
        </p>
      </div>
    </div>
    <button
      type="button"
      onClick={onAction}
      className="inline-flex shrink-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3! py-2! text-xs! font-semibold text-white transition hover:bg-white/10"
    >
      {actionLabel}
      <ArrowRight size={14} />
    </button>
  </div>
);

const OverviewTextRow = ({
  description,
  meta,
  onAction,
  title,
}: {
  description: string;
  meta: string;
  onAction: () => void;
  title: string;
}) => (
  <button
    type="button"
    onClick={onAction}
    className="flex w-full items-center justify-between gap-4 py-3 text-left transition hover:text-white"
  >
    <span className="min-w-0">
      <span className="block truncate text-sm font-semibold text-white">
        {title}
      </span>
      <span className="mt-0.5 block truncate text-xs text-neutral-500">
        {description}
      </span>
    </span>
    <span className="shrink-0 text-xs font-semibold text-neutral-300">
      {meta}
    </span>
  </button>
);

const ProjectProgressMini = ({ booking }: { booking: ClientDashboardBooking }) => {
  const completed = Math.min(
    Number(booking.completedSessionCount || 0),
    getEstimatedSessionCount(booking)
  );
  const total = getEstimatedSessionCount(booking);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="pr-3">
      <p className="text-sm font-semibold text-white">
        {completed}/{total} sessions
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-400"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-neutral-500">{progress}% complete</p>
    </div>
  );
};

const ClientSessionsSection = ({
  sessions,
  onOpenRecord,
  onPay,
  onConfirmExternalPayment,
  onDisputeExternalPayment,
}: {
  sessions: ClientDashboardBooking[];
  onOpenRecord: (booking: ClientDashboardBooking) => void;
  onPay: (bookingId: string) => void;
  onConfirmExternalPayment: (booking: ClientDashboardBooking) => void;
  onDisputeExternalPayment: (booking: ClientDashboardBooking) => void;
}) => (
  <section className="mt-6 w-full max-w-7xl space-y-6">
    <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Client ledger
        </p>
        <h1 className="mt-2 text-3xl! font-semibold text-white">
          Sessions
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">
          Track upcoming, in-progress, completed, and payment-pending sessions
          without exposing artist-only controls.
        </p>
      </div>

      <MetricCard label="Showing" value={sessions.length} />
    </div>

    {sessions.length === 0 ? (
      <EmptyState
        icon={<CalendarDays size={22} />}
        title="No session records yet"
        description="Confirmed appointments, project sessions, and completed session records will appear here."
      />
    ) : (
      <ClientSessionsTable
        sessions={sessions}
        onOpenRecord={onOpenRecord}
        onPay={onPay}
        onConfirmExternalPayment={onConfirmExternalPayment}
        onDisputeExternalPayment={onDisputeExternalPayment}
      />
    )}
  </section>
);

const ClientSessionsTable = ({
  sessions,
  onOpenRecord,
  onPay,
  onConfirmExternalPayment,
  onDisputeExternalPayment,
}: {
  sessions: ClientDashboardBooking[];
  onOpenRecord: (booking: ClientDashboardBooking) => void;
  onPay: (bookingId: string) => void;
  onConfirmExternalPayment: (booking: ClientDashboardBooking) => void;
  onDisputeExternalPayment: (booking: ClientDashboardBooking) => void;
}) => {
  const columns =
    "minmax(180px,1.15fr) 72px minmax(165px,.95fr) minmax(190px,1fr) minmax(128px,.75fr) minmax(165px,1fr) minmax(155px,.82fr)";

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-lg">
      <div className="request-modal-scrollbar">
        <div className="w-full">
          <div
            className="grid items-center border-b border-white/10 bg-white/[0.035] px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-500"
            style={{ gridTemplateColumns: columns }}
          >
            <span>Artist</span>
            <span>Created</span>
            <span>Session</span>
            <span>Payment</span>
            <span>Scheduled</span>
            <span>Location</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="divide-y divide-white/10">
            {sessions.map((booking) => {
              const sessionStatus = booking.sessionStatus || "in_progress";
              const remainingPaymentStatus = booking.remainingPaymentStatus || "not_due";
              const isMultiSession = isClientMultiSessionBooking(booking);
              const activeSessionNumber = getPayableSessionNumber(booking);
              const sessionCount = Math.max(Number(booking.estimatedSessionCount || 1), 1);
              const remainingBalance = getRemainingBalance(booking);
              const payableAmount = getClientPayableAmount(booking);
              const dueThisSession =
                remainingPaymentStatus === "confirmed" ||
                remainingPaymentStatus === "not_due"
                  ? 0
                  : getClientSessionInstallmentAmount(booking);
              const canConfirm =
                needsClientDirectPaymentAction(booking) &&
                ["due", "artist_confirmed"].includes(remainingPaymentStatus);
              const alreadyConfirmed =
                remainingPaymentStatus === "client_confirmed" ||
                remainingPaymentStatus === "confirmed";

              return (
                <div
                  key={booking.id}
                  className="grid items-center gap-0 px-3 py-4 transition hover:bg-white/[0.025]"
                  style={{ gridTemplateColumns: columns }}
                >
                  <div className="flex min-w-0 items-center gap-3 pr-3">
                    <img
                      src={booking.artistAvatar || "/default-avatar.png"}
                      alt={booking.artistName || "Artist"}
                      className="h-11 w-11 rounded-full border border-white/10 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {booking.artistName || "Artist"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-neutral-500 uppercase tracking-[0.12em]">
                        Booking {getShortBookingId(booking.id)}
                      </p>
                    </div>
                  </div>

                  <span className="pr-3 text-sm text-neutral-300">
                    {formatDashboardDate(booking.createdAt)}
                  </span>

                  <div className="flex min-w-0 flex-col items-start gap-2 pr-3">
                    <SessionStatusBadge status={sessionStatus} />
                    <RemainingPaymentBadge status={remainingPaymentStatus} viewer="client" />
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-neutral-300">
                      Session {activeSessionNumber} of {sessionCount}
                    </span>
                  </div>

                  <SessionPaymentSummary
                    primaryLabel={isMultiSession ? "Due this session" : "Balance due"}
                    primaryAmount={dueThisSession}
                    remainingBalance={remainingBalance}
                    depositAmount={booking.depositAmount}
                    totalAmount={booking.price}
                  />

                  <span className="pr-3 text-sm leading-5 text-neutral-300">
                    {formatAppointment(booking.selectedDate)}
                  </span>

                  <div className="min-w-0 pr-3">
                    <p className="truncate text-sm font-medium text-white">
                      {booking.shopName || "Private Studio"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                      {booking.shopAddress || "Address not provided"}
                    </p>
                  </div>

                  <div className="flex flex-col items-stretch justify-end gap-2">
                    {payableAmount > 0 &&
                      booking.remainingPaymentMethod !== "external" && (
                        <button
                          type="button"
                          onClick={() => onPay(booking.id)}
                          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-white px-2.5! py-2! text-xs! font-semibold text-black transition hover:bg-white/85"
                        >
                          <CreditCard size={14} />
                          Pay
                        </button>
                      )}
                    <button
                      type="button"
                      disabled={!canConfirm}
                      onClick={() => onConfirmExternalPayment(booking)}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-white px-2.5! py-2! text-xs! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <DollarSign size={14} />
                      {alreadyConfirmed ? "Confirmed" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      disabled={
                        booking.remainingPaymentMethod !== "external" ||
                        remainingPaymentStatus === "confirmed"
                      }
                      onClick={() => onDisputeExternalPayment(booking)}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.035] px-2.5! py-2! text-xs! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Issue
                    </button>
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

const ClientSessionRecordDialog = ({
  booking,
  clientId,
  amendments,
  onClose,
  onPay,
  onConfirmExternalPayment,
  onDisputeExternalPayment,
  onRespondToAmendment,
  onRequestNextSession,
  onPauseProject,
  onResumeProject,
}: {
  booking: ClientDashboardBooking | null;
  clientId: string | null;
  amendments: ProjectAmendment[];
  onClose: () => void;
  onPay: (bookingId: string) => void;
  onConfirmExternalPayment: (booking: ClientDashboardBooking) => void;
  onDisputeExternalPayment: (booking: ClientDashboardBooking) => void;
  onRespondToAmendment: (
    amendmentId: string,
    response: "accepted" | "declined" | "cancelled"
  ) => void;
  onRequestNextSession: (booking: ClientDashboardBooking) => void;
  onPauseProject: () => void;
  onResumeProject: () => void;
}) => {
  const remainingBalance = booking ? getRemainingBalance(booking) : 0;
  const showExternalConfirmation =
    booking?.remainingPaymentMethod === "external" &&
    booking.status === "deposit_paid" &&
    ["due", "artist_confirmed", "client_confirmed"].includes(
      booking.remainingPaymentStatus || "due"
    );
  const clientAlreadyConfirmed =
    booking?.remainingPaymentStatus === "client_confirmed";
  const showStripeBalance =
    booking?.paymentType === "internal" &&
    booking.remainingPaymentMethod !== "external" &&
    booking.status === "deposit_paid" &&
    remainingBalance > 0;

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
                          Session record
                        </p>
                        <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                          Appointment with {booking.artistName || "Artist"}
                        </Dialog.Title>
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                        aria-label="Close session record"
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
                              src={booking.artistAvatar || "/default-avatar.png"}
                              alt={booking.artistName || "Artist"}
                              className="h-14 w-14 rounded-full border border-white/10 object-cover"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-white">
                                {booking.artistName || "Artist"}
                              </p>
                              <p className="text-sm text-neutral-500">
                                {booking.shopName || "Studio not listed"}
                              </p>
                            </div>
                          </div>
                          <SessionStatusBadge status={booking.sessionStatus || "in_progress"} />
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                          <DetailTile icon={<DollarSign size={17} />} label="Offer price" value={formatMoney(booking.price)} />
                          <DetailTile icon={<ReceiptText size={17} />} label="Deposit" value={formatMoney(booking.depositAmount)} />
                          <DetailTile icon={<CreditCard size={17} />} label="Remaining" value={formatMoney(remainingBalance)} />
                          <DetailTile icon={<CalendarDays size={17} />} label="Appointment" value={formatAppointment(booking.selectedDate)} />
                          <DetailTile icon={<Store size={17} />} label="Studio" value={booking.shopName || "Private Studio"} />
                          <DetailTile
                            icon={<DollarSign size={17} />}
                            label="Balance status"
                            value={getRemainingPaymentLabel(booking.remainingPaymentStatus || "due", "client")}
                          />
                        </div>

                        {booking.shopAddress && (
                          <a
                            href={booking.shopMapLink || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-5 flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300 transition hover:bg-white/[0.06]"
                          >
                            <MapPin size={17} className="mt-0.5 shrink-0 text-neutral-500" />
                            {booking.shopAddress}
                          </a>
                        )}

                        <ProjectControlsPanel
                          booking={booking}
                          viewerRole="client"
                          currentUserId={clientId}
                          amendments={amendments}
                          onRespondToAmendment={onRespondToAmendment}
                          onPlanNextSession={() => onRequestNextSession(booking)}
                          onPauseProject={onPauseProject}
                          onResumeProject={onResumeProject}
                          onPayPlatformFee={() => onPay(booking.id)}
                        />

                        <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">
                                Session progress
                              </p>
                              <p className="mt-1 text-sm leading-6 text-emerald-50/75">
                                Your artist controls session start and completion.
                                If you pay directly at the shop, you can confirm
                                that payment here before or after the artist
                                confirms it.
                              </p>
                            </div>
                            <RemainingPaymentBadge
                              status={booking.remainingPaymentStatus || "due"}
                              viewer="client"
                            />
                          </div>

                          {showExternalConfirmation && (
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              <button
                                type="button"
                                disabled={clientAlreadyConfirmed}
                                onClick={() => onConfirmExternalPayment(booking)}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Check size={16} />
                                {clientAlreadyConfirmed
                                  ? "Confirmed"
                                  : "Confirm paid"}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDisputeExternalPayment(booking)}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-black/25 px-5! py-3! text-sm! font-semibold text-white transition hover:bg-white/10"
                              >
                                Report issue
                              </button>
                            </div>
                          )}

                          {showStripeBalance && (
                            <button
                              type="button"
                              onClick={() => onPay(booking.id)}
                              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-5! py-3! text-sm! font-semibold text-black transition hover:bg-white/85"
                            >
                              <CreditCard size={16} />
                              {isClientMultiSessionBooking(booking)
                                ? `Pay ${getSessionOrdinal(
                                    getPayableSessionNumber(booking)
                                  )} session balance`
                                : "Pay remaining balance"}
                            </button>
                          )}
                        </div>

                        {booking.sessionPhotoUrls && booking.sessionPhotoUrls.length > 0 && (
                          <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-sm font-semibold text-white">
                              Session photos
                            </p>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {booking.sessionPhotoUrls.map((url) => (
                                <img
                                  key={url}
                                  src={url}
                                  alt="Session record"
                                  className="h-24 w-full rounded-md border border-white/10 object-cover"
                                />
                              ))}
                            </div>
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

const PanelTitle = ({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) => (
  <div className="mb-5 flex items-center gap-3">
    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
      {icon}
    </span>
    <div>
      <h2 className="mb-0! text-lg!">{title}</h2>
      <p className="text-sm text-neutral-400">{description}</p>
    </div>
  </div>
);

const ClientMetric = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) => (
  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-neutral-500">
      {icon}
      {label}
    </div>
    <p className="mt-2 truncate text-lg font-semibold text-white">{value}</p>
  </div>
);

const MetricCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 lg:min-w-[220px]">
    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
  </div>
);

const PreviewRow = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="text-neutral-400">{label}</span>
    <span className="max-w-44 truncate text-right text-white">{value}</span>
  </div>
);

const DetailTile = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <div className="rounded-lg border border-white/10 bg-black/25 p-3">
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-neutral-500">
      {icon}
      {label}
    </div>
    <p className="mt-2 text-sm font-medium text-white">{value}</p>
  </div>
);

const EmptyState = ({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-10 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
      {icon}
    </div>
    <h2 className="mt-4 text-xl! font-semibold! text-white">{title}</h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">{description}</p>
  </div>
);

const SessionPaymentSummary = ({
  primaryLabel,
  primaryAmount,
  remainingBalance,
  depositAmount,
  totalAmount,
}: {
  primaryLabel: string;
  primaryAmount: number;
  remainingBalance: number;
  depositAmount?: number;
  totalAmount?: number;
}) => (
  <div className="pr-3">
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      {primaryLabel}
    </p>
    <p className="mt-1 text-base font-semibold text-white">
      {formatMoney(primaryAmount)}
    </p>
    <div className="mt-2 space-y-1 text-xs text-neutral-500">
      <div className="flex items-center justify-between gap-3">
        <span>Remaining</span>
        <span className="font-medium text-neutral-300">
          {formatMoney(remainingBalance)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span>Deposit paid</span>
        <span>{formatMoney(depositAmount)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span>Total</span>
        <span>{formatMoney(totalAmount)}</span>
      </div>
    </div>
  </div>
);

const SessionStatusBadge = ({ status }: { status: string }) => {
  const className =
    status === "completed"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : "border-sky-300/20 bg-sky-300/10 text-sky-100";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}>
      {status.replace("_", " ")}
    </span>
  );
};

const RemainingPaymentBadge = ({
  status,
  viewer,
}: {
  status: string;
  viewer: "client" | "artist";
}) => {
  const className =
    status === "confirmed"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : status === "artist_confirmed" || status === "client_confirmed"
      ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
      : status === "disputed"
      ? "border-red-300/25 bg-red-300/10 text-red-100"
      : "border-white/10 bg-white/[0.05] text-neutral-300";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {getRemainingPaymentLabel(status, viewer)}
    </span>
  );
};

const getRemainingPaymentLabel = (status: string, viewer: "client" | "artist") => {
  if (status === "not_due") return "Not due yet";
  if (status === "due") return "Payment due";
  if (status === "artist_confirmed") {
    return viewer === "client" ? "Confirm direct pay" : "Awaiting client";
  }
  if (status === "client_confirmed") {
    return viewer === "client" ? "Awaiting artist" : "Confirm direct pay";
  }
  if (status === "confirmed") return "Balance paid";
  if (status === "disputed") return "Disputed";
  return "Balance due";
};

const getShortBookingId = (bookingId?: string) =>
  bookingId ? `#${bookingId.slice(0, 7)}` : "#";

const formatMoney = (amount?: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amount || 0));

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

const formatAppointment = (selectedDate?: { date: string; time: string }) => {
  if (!selectedDate?.date || !selectedDate.time || selectedDate.date === "TBD") {
    return "TBD";
  }

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

const getBookingCreatedTime = (item: {
  createdAt?: Booking["createdAt"] | Date | null;
}) => {
  const createdAt = item.createdAt;
  if (createdAt instanceof Date) return createdAt.getTime();
  if (createdAt?.toDate) return createdAt.toDate().getTime();
  if (createdAt?.seconds) return createdAt.seconds * 1000;
  return 0;
};

const getAppointmentTime = (booking: Partial<Booking>) => {
  const selectedDate = booking.selectedDate;
  if (!selectedDate?.date || !selectedDate.time || selectedDate.date === "TBD") {
    return Number.MAX_SAFE_INTEGER;
  }

  const [year, month, day] = selectedDate.date.split("-").map(Number);
  const [hours, minutes] = selectedDate.time.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
};

const compareClientBookingSchedule = (
  a: ClientDashboardBooking,
  b: ClientDashboardBooking
) => {
  const appointmentDelta = getAppointmentTime(a) - getAppointmentTime(b);
  if (appointmentDelta !== 0) return appointmentDelta;
  return getBookingCreatedTime(b) - getBookingCreatedTime(a);
};

const hasClientAppointment = (booking: Partial<Booking>) =>
  Boolean(
    booking.selectedDate?.date &&
      booking.selectedDate?.time &&
      booking.selectedDate.date !== "TBD"
  );

const getRemainingBalance = (booking: Partial<Booking>) =>
  typeof booking.remainingBalanceAmount === "number"
    ? Math.max(booking.remainingBalanceAmount, 0)
    : Math.max(
        Number(booking.price || 0) -
          Number(booking.totalArtistPaidAmount || booking.depositAmount || 0),
        0
      );

const isClientMultiSessionBooking = (booking: Partial<Booking>) =>
  booking.projectType === "multi_session" ||
  Number(booking.estimatedSessionCount || 1) > 1;

const getEstimatedSessionCount = (booking: Partial<Booking>) =>
  Math.max(Number(booking.estimatedSessionCount || 1), 1);

const getClientPayableAmount = (booking: Partial<Booking>) => {
  if (booking.status === "pending_payment") {
    return Math.max(Number(booking.depositAmount || 0), 0);
  }

  if (booking.status !== "deposit_paid") return 0;
  if (booking.remainingPaymentStatus === "confirmed") return 0;
  if (booking.remainingPaymentStatus === "not_due") return 0;
  if (booking.remainingPaymentMethod === "external") return 0;

  const pending = Number(booking.pendingSessionPaymentAmount || 0);
  if (pending > 0) return Math.min(pending, getRemainingBalance(booking));

  return getRemainingBalance(booking);
};

const needsClientDirectPaymentAction = (booking: Partial<Booking>) =>
  booking.remainingPaymentMethod === "external" &&
  booking.status === "deposit_paid" &&
  ["due", "artist_confirmed", "client_confirmed", "disputed"].includes(
    booking.remainingPaymentStatus || "not_due"
  );

const getClientPaymentStatusLabel = (booking: Partial<Booking>) => {
  if (booking.status === "pending_payment") return "Deposit due";
  if (booking.status === "cancelled") return "Cancelled";
  if (getRemainingBalance(booking) <= 0 || booking.remainingPaymentStatus === "confirmed") {
    return "Paid";
  }
  if (booking.remainingPaymentStatus === "not_due") return "Not due yet";
  if (booking.remainingPaymentStatus === "artist_confirmed") {
    return "Confirm direct payment";
  }
  if (booking.remainingPaymentStatus === "client_confirmed") {
    return "Awaiting artist confirmation";
  }
  if (booking.remainingPaymentStatus === "disputed") return "Payment disputed";
  if (Number(booking.pendingSessionPaymentAmount || 0) > 0) {
    return "Session payment requested";
  }
  return booking.remainingPaymentMethod === "external"
    ? "Direct payment due"
    : "Balance due";
};

const isClientSessionLedgerBooking = (booking: Partial<Booking>) =>
  ["confirmed", "deposit_paid", "paid"].includes(String(booking.status)) &&
  (hasClientAppointment(booking) ||
    ["in_progress", "completed", "awaiting_next_session"].includes(
      String(booking.sessionStatus || "")
    ) ||
    Number(booking.pendingSessionPaymentAmount || 0) > 0 ||
    isClientMultiSessionBooking(booking));

const canClientRequestNextSession = (booking: Partial<Booking>) =>
  isClientMultiSessionBooking(booking) &&
  booking.projectStatus !== "paused" &&
  booking.projectStatus !== "completed" &&
  booking.status !== "pending_payment" &&
  booking.status !== "cancelled" &&
  booking.sessionStatus !== "in_progress" &&
  getRemainingBalance(booking) >= 0 &&
  getPayableSessionNumber(booking) <= getEstimatedSessionCount(booking);

const getClientSessionInstallmentAmount = (booking: Partial<Booking>) => {
  const remaining = getRemainingBalance(booking);
  const pending = Number(booking.pendingSessionPaymentAmount || 0);
  if (pending > 0) return Math.min(pending, remaining);

  const sessionsLeft = isClientMultiSessionBooking(booking)
    ? getRemainingInstallmentCount(booking)
    : Math.max(
        Number(booking.estimatedSessionCount || 1) -
          Number(booking.completedSessionCount || 0),
        1
      );
  return Math.ceil(remaining / sessionsLeft);
};

const getRemainingInstallmentCount = (booking: Partial<Booking>) => {
  const totalLaterInstallments = Math.max(
    Number(booking.estimatedSessionCount || 1) - 1,
    1
  );
  const lastPaidSessionNumber = Math.max(Number(booking.lastPaidSessionNumber || 0), 0);
  const paidLaterInstallments =
    booking.sessionInstallmentTiming === "before_session"
      ? Math.max(lastPaidSessionNumber - 1, 0)
      : lastPaidSessionNumber;

  return Math.max(totalLaterInstallments - paidLaterInstallments, 1);
};

const getPayableSessionNumber = (booking: Partial<Booking>) =>
  Math.max(
    Number(booking.pendingSessionNumber || booking.activeSessionNumber || 1),
    1
  );

const getSessionOrdinal = (sessionNumber: number) => {
  const remainder = sessionNumber % 100;
  if (remainder >= 11 && remainder <= 13) return `${sessionNumber}th`;
  switch (sessionNumber % 10) {
    case 1:
      return `${sessionNumber}st`;
    case 2:
      return `${sessionNumber}nd`;
    case 3:
      return `${sessionNumber}rd`;
    default:
      return `${sessionNumber}th`;
  }
};

const getClientViewDescription = (view: ClientView, clientName: string) => {
  if (view === "overview") {
    return `Welcome back, ${clientName}. Review payments, offers, projects, and upcoming appointments from one place.`;
  }
  if (view === "following") {
    return "Followed artists, recent flash drops, sheets, and gallery updates live here.";
  }
  if (view === "requests") {
    return "Track tattoo requests you have sent and see when artists are preparing a response.";
  }
  if (view === "offers") {
    return "Review artist offers, appointment options, deposits, and project terms.";
  }
  if (view === "bookings") {
    return "Manage accepted bookings, deposits, appointment details, and payment state.";
  }
  if (view === "sessions") {
    return "Follow session records, payments, studio details, and completed appointment history.";
  }
  if (view === "projects") {
    return "Manage multi-session progress, scheduling, amendments, and project payments.";
  }
  return "Keep your public profile and booking preferences ready for artists.";
};

const getActionToneClass = (tone: ClientDashboardAction["tone"]) => {
  if (tone === "red") return "border border-red-300/25 bg-red-300/10 text-red-100";
  if (tone === "amber") {
    return "border border-amber-300/20 bg-amber-300/10 text-amber-100";
  }
  if (tone === "sky") return "border border-sky-300/20 bg-sky-300/10 text-sky-100";
  if (tone === "emerald") {
    return "border border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  }
  return "border border-white/10 bg-white/[0.05] text-neutral-300";
};

export default ClientDashboardView;
