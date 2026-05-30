import { Fragment, type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import QRCode from "qrcode";
import {
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
  Inbox,
  LoaderCircle,
  Mail,
  MapPin,
  ReceiptText,
  RefreshCcw,
  Save,
  Store,
  Ticket,
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
import { syncGoogleAvatar } from "../utils/syncGoogleAvatar";
import { db, auth, storage, functions } from "../firebase/firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { Booking } from "../types/Booking";
import type { ArtistEvent } from "../types/Event";
import type { EventRegistration } from "../types/EventRegistration";
import { TATTOO_STYLES, getCanonicalTattooStyles } from "../types/TattooStyle";

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
  | "profile"
  | "liked"
  | "requests"
  | "offers"
  | "bookings"
  | "sessions"
  | "eventPasses";

type ClientProfileFormState = {
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

type RequestArtist = {
  id: string;
  name: string;
  avatarUrl?: string;
  studioName?: string;
};

const activeViewLabels: Record<ClientView, string> = {
  profile: "Profile",
  liked: "Liked artists",
  requests: "My requests",
  offers: "Offers",
  bookings: "Bookings",
  sessions: "Sessions",
  eventPasses: "Event passes",
};

const getClientDashboardView = (view: string | null): ClientView =>
  [
    "profile",
    "liked",
    "requests",
    "offers",
    "bookings",
    "sessions",
    "eventPasses",
  ].includes(view || "")
    ? (view as ClientView)
    : "profile";

const isClientDashboardView = (view: string | null): view is ClientView =>
  [
    "profile",
    "liked",
    "requests",
    "offers",
    "bookings",
    "sessions",
    "eventPasses",
  ].includes(view || "");

const createProfileFormState = (
  client: Partial<ClientProfile> | null
): ClientProfileFormState => ({
  displayName: client?.displayName || client?.name || "",
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
});

const ClientDashboardView = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<RequestArtist | null>(null);
  const [selectedSession, setSelectedSession] = useState<ClientDashboardBooking | null>(null);
  const [activeView, setActiveView] = useState<ClientView>(() =>
    getClientDashboardView(searchParams.get("tab"))
  );
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [bookings, setBookings] = useState<ClientDashboardBooking[]>([]);
  const [eventPasses, setEventPasses] = useState<EventRegistration[]>([]);
  const [eventPassEvents, setEventPassEvents] = useState<Record<string, ArtistEvent>>({});
  const [eventPassQrCodes, setEventPassQrCodes] = useState<Record<string, string>>({});
  const [cancellingEventPassId, setCancellingEventPassId] = useState("");
  const [syncingEventPassId, setSyncingEventPassId] = useState("");
  const eventPassSyncAttemptsRef = useRef<Record<string, number>>({});
  const [profileForm, setProfileForm] = useState<ClientProfileFormState>(
    createProfileFormState(null)
  );
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [customInterestTag, setCustomInterestTag] = useState("");
  const [navCounts, setNavCounts] = useState<Record<ClientView, number>>({
    profile: 0,
    liked: 0,
    requests: 0,
    offers: 0,
    bookings: 0,
    sessions: 0,
    eventPasses: 0,
  });

  const syncEventTicketPass = async (
    pass: EventRegistration,
    options: { quiet?: boolean } = {}
  ) => {
    if (!pass.stripeCheckoutSessionId || pass.status !== "pending_payment") {
      return;
    }

    setSyncingEventPassId(pass.id);
    try {
      const syncPaymentStatus = httpsCallable<
        { registrationId: string },
        { paid: boolean; status: string; paymentStatus?: string }
      >(functions, "syncEventTicketPaymentStatus");
      const result = await syncPaymentStatus({ registrationId: pass.id });

      if (result.data.paid) {
        if (!options.quiet) {
          toast.success("Event pass payment confirmed. Your QR pass is ready.");
        }
        return;
      }

      if (!options.quiet) {
      toast("Stripe still shows this event pass as pending.");
      }
    } catch (error) {
      console.error("Event pass payment refresh failed:", error);
      if (!options.quiet) {
        toast.error(
          getClientCallableErrorMessage(error, "Could not refresh this event pass.")
        );
      }
    } finally {
      setSyncingEventPassId("");
    }
  };

  useEffect(() => {
    const viewParam = searchParams.get("tab");
    if (isClientDashboardView(viewParam)) {
      setActiveView(viewParam);
    }
  }, [searchParams]);

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
        const nextClient = {
          id: user.uid,
          ...data,
          name: data.name || data.displayName || user.displayName || "Client",
          displayName: data.displayName || data.name || user.displayName || "Client",
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
          liked: nextClient.likedArtists.length,
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
        (snap) => updateCount("requests", snap.size),
        (error) => console.error("Client request count listener failed:", error)
      ),
      onSnapshot(
        query(
          collection(db, "offers"),
          where("clientId", "==", client.id),
          where("status", "==", "pending")
        ),
        (snap) => updateCount("offers", snap.size),
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
          updateCount(
            "bookings",
            nextBookings.filter((booking) => !isActiveSessionBooking(booking)).length
          );
          updateCount(
            "sessions",
            nextBookings.filter((booking) => isActiveSessionBooking(booking)).length
          );
        },
        (error) => console.error("Client booking listener failed:", error)
      ),
      onSnapshot(
        query(
          collection(db, "eventRegistrations"),
          where("clientId", "==", client.id)
        ),
        async (snap) => {
          const passes = snap.docs
            .map((registrationDoc) => ({
              id: registrationDoc.id,
              ...registrationDoc.data(),
            })) as EventRegistration[];
          const activePasses = passes
            .filter((pass) => pass.status !== "cancelled")
            .sort((a, b) =>
              String(a.eventStartDate || "").localeCompare(String(b.eventStartDate || ""))
            );

          setEventPasses(activePasses);
          updateCount("eventPasses", activePasses.length);

          activePasses.forEach((pass) => {
            if (
              pass.status !== "pending_payment" ||
              !pass.stripeCheckoutSessionId ||
              pass.paymentStatus !== "pending"
            ) {
              return;
            }

            const attemptKey = `${pass.id}:${pass.stripeCheckoutSessionId}`;
            const lastAttempt = eventPassSyncAttemptsRef.current[attemptKey] || 0;
            const now = Date.now();
            if (now - lastAttempt < 15000) return;

            eventPassSyncAttemptsRef.current[attemptKey] = now;
            void syncEventTicketPass(pass, { quiet: true });
          });

          const eventEntries = await Promise.all(
            activePasses.map(async (pass) => {
              try {
                const eventSnap = await getDoc(doc(db, "events", pass.eventId));
                return eventSnap.exists()
                  ? [
                      pass.eventId,
                      { id: eventSnap.id, ...eventSnap.data() } as ArtistEvent,
                    ]
                  : null;
              } catch {
                return null;
              }
            })
          );
          setEventPassEvents(
            Object.fromEntries(eventEntries.filter(Boolean) as [string, ArtistEvent][])
          );

          const qrEntries = await Promise.all(
            activePasses.map(async (pass) => {
              if (!pass.qrToken || pass.status === "pending_payment") return null;
              const url = `${window.location.origin}/events/check-in/${pass.id}/${pass.qrToken}`;
              const dataUrl = await QRCode.toDataURL(url, {
                margin: 1,
                width: 220,
                color: {
                  dark: "#111111",
                  light: "#ffffff",
                },
              });
              return [pass.id, dataUrl] as const;
            })
          );
          setEventPassQrCodes(
            Object.fromEntries(
              qrEntries.filter(
                (entry): entry is readonly [string, string] => Boolean(entry)
              )
            )
          );
        },
        (error) => console.error("Client event passes listener failed:", error)
      ),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [client?.id]);

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

    const displayName = profileForm.displayName.trim();
    const email = profileForm.email.trim();

    if (!displayName) {
      toast.error("Display name is required.");
      return;
    }

    if (email && !email.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }

    setIsSavingProfile(true);

    const profileUpdate = {
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

    if (!artistAlreadyConfirmed) {
      try {
        await setDoc(
          doc(db, "bookingSessions", booking.id),
          {
            bookingId: booking.id,
            artistId: booking.artistId,
            clientId: booking.clientId,
            remainingPaymentStatus: "client_confirmed",
            clientConfirmedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await updateDoc(doc(db, "bookings", booking.id), {
          remainingPaymentStatus: "client_confirmed",
          externalRemainingClientConfirmedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success("Payment confirmation sent to the artist.");
        setSelectedSession(null);
      } catch (error) {
        console.error("External payment confirmation failed:", error);
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
    const hasMoreSessions =
      isMultiSession && sessionNumber < sessionCount && nextRemaining > 0;

    try {
      await setDoc(
        doc(db, "bookingSessions", booking.id),
        {
          bookingId: booking.id,
          artistId: booking.artistId,
          clientId: booking.clientId,
          remainingPaymentStatus: "confirmed",
          sessionNumber,
          paidAmount: amountToConfirm,
          paidAmountCents: Math.round(amountToConfirm * 100),
          clientConfirmedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await updateDoc(doc(db, "bookings", booking.id), {
        status: nextRemaining > 0 ? "deposit_paid" : "paid",
        remainingPaymentStatus: nextRemaining > 0 ? "due" : "confirmed",
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
        activeSessionNumber:
          hasMoreSessions ? sessionNumber + 1 : sessionNumber,
        pendingSessionPaymentAmount: 0,
        pendingSessionPaymentAmountCents: 0,
        pendingSessionNumber: null,
        lastPaidSessionNumber: sessionNumber,
        updatedAt: serverTimestamp(),
      });
      toast.success("External payment confirmed.");
      setSelectedSession(null);
    } catch (error) {
      console.error("External payment confirmation failed:", error);
      toast.error("Could not confirm the payment.");
    }
  };

  const handleDisputeExternalPayment = async (booking: ClientDashboardBooking) => {
    const reason =
      window.prompt("Briefly describe the issue with this payment.")?.trim() ||
      "Client reported an issue with the external payment.";

    try {
      await setDoc(
        doc(db, "bookingSessions", booking.id),
        {
          bookingId: booking.id,
          artistId: booking.artistId,
          clientId: booking.clientId,
          remainingPaymentStatus: "disputed",
          disputeReason: reason,
          disputedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await updateDoc(doc(db, "bookings", booking.id), {
        remainingPaymentStatus: "disputed",
        externalRemainingDisputeReason: reason,
        externalRemainingDisputedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Issue reported.");
      setSelectedSession(null);
    } catch (error) {
      console.error("External payment dispute failed:", error);
      toast.error("Could not report the issue.");
    }
  };

  const handleCancelEventPass = async (pass: EventRegistration) => {
    if (pass.status === "checked_in") {
      toast.error("Checked-in event passes cannot be cancelled.");
      return;
    }

    if (pass.paymentStatus !== "free") {
      toast.error("Paid event passes cannot be cancelled from RSVP tools yet.");
      return;
    }

    setCancellingEventPassId(pass.id);
    try {
      const cancelRsvp = httpsCallable<
        { registrationId: string },
        { status: string }
      >(functions, "cancelEventRsvp");
      await cancelRsvp({ registrationId: pass.id });
      toast.success("Event RSVP cancelled.");
    } catch (error) {
      console.error("Event RSVP cancellation failed:", error);
      toast.error(getClientCallableErrorMessage(error, "Could not cancel this RSVP."));
    } finally {
      setCancellingEventPassId("");
    }
  };

  const profileCompletionItems = [
    Boolean(profileForm.displayName.trim()),
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
    !isProfileDirty || isSavingProfile || isUploadingAvatar || !profileForm.displayName.trim();

  const sessions = useMemo(
    () =>
      bookings
        .filter((booking) => isActiveSessionBooking(booking))
        .sort((a, b) => getBookingCreatedTime(b) - getBookingCreatedTime(a)),
    [bookings]
  );

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
        onViewChange={setActiveView}
      />

      <main className="flex-1 p-6">
        {client && activeView !== "profile" && (
          <ClientHero
            client={client}
            activeView={activeView}
            bookings={bookings}
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

        {client && activeView === "liked" && (
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
            onConfirmExternalPayment={handleConfirmExternalPayment}
            onDisputeExternalPayment={handleDisputeExternalPayment}
          />
        )}
        {client && activeView === "eventPasses" && (
          <ClientEventPassesSection
            passes={eventPasses}
            eventsById={eventPassEvents}
            qrCodesByPassId={eventPassQrCodes}
            cancellingPassId={cancellingEventPassId}
            syncingPassId={syncingEventPassId}
            onCancelPass={handleCancelEventPass}
            onSyncPass={syncEventTicketPass}
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
        onClose={() => setSelectedSession(null)}
        onPay={(bookingId) => navigate(`/payment/${bookingId}`)}
        onConfirmExternalPayment={handleConfirmExternalPayment}
        onDisputeExternalPayment={handleDisputeExternalPayment}
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
                Display name
              </span>
              <input
                type="text"
                value={profileForm.displayName}
                onChange={(event) => onUpdate({ displayName: event.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                placeholder="Your name"
              />
              <span className="block text-xs text-neutral-500">
                Required. You can change everything else later.
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
          alt={profileForm.displayName || "Client avatar preview"}
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
  <section className="relative mb-8 w-full max-w-7xl overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-black/20 p-6 shadow-lg">
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col items-center gap-5 text-center md:flex-row md:text-left">
        <div className="relative">
          <img
            src={client.avatarUrl || "/fallback-avatar.jpg"}
            alt={client.name || "Client"}
            className="h-28 w-28 rounded-full border border-white/10 object-cover shadow-lg md:h-32 md:w-32"
          />
          <span className="absolute bottom-2 right-1 rounded-full bg-black px-2 py-0.5 text-[10px] text-white ring-1 ring-white/10">
            Client
          </span>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Client dashboard
          </p>
          <h1 className="mt-2 text-3xl! font-semibold text-white">
            Welcome, {client.name || "client"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Track offers, follow artists, manage requests, and keep upcoming
            tattoo sessions organized.
          </p>

          {client.preferredStyles?.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
              {client.preferredStyles.slice(0, 6).map((style, index) => (
                <span
                  key={`${style}-${index}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-200"
                >
                  {style}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[560px]">
        <ClientMetric icon={<Heart size={17} />} label="Liked" value={client.likedArtists?.length || 0} />
        <ClientMetric icon={<Inbox size={17} />} label="Viewing" value={activeViewLabels[activeView]} />
        <ClientMetric icon={<ReceiptText size={17} />} label="Offers" value="Live" />
        <ClientMetric
          icon={<CalendarCheck size={17} />}
          label="Sessions"
          value={bookings.filter((booking) => isActiveSessionBooking(booking)).length}
        />
      </div>
    </div>
  </section>
);

const ClientSessionsSection = ({
  sessions,
  onOpenRecord,
  onConfirmExternalPayment,
  onDisputeExternalPayment,
}: {
  sessions: ClientDashboardBooking[];
  onOpenRecord: (booking: ClientDashboardBooking) => void;
  onConfirmExternalPayment: (booking: ClientDashboardBooking) => void;
  onDisputeExternalPayment: (booking: ClientDashboardBooking) => void;
}) => (
  <section className="mt-6 w-full max-w-7xl space-y-6">
    <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Client sessions
        </p>
        <h1 className="mt-2 text-3xl! font-semibold text-white">
          Active sessions
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">
          Follow appointments after an artist starts the session, review session
          photos, and confirm any direct balance when both sides are ready.
        </p>
      </div>

      <MetricCard label="Showing" value={sessions.length} />
    </div>

    {sessions.length === 0 ? (
      <EmptyState
        icon={<CalendarDays size={22} />}
        title="No active sessions yet"
        description="When an artist starts a session from a confirmed booking, it will appear here for session tracking and payment confirmation."
      />
    ) : (
      <ClientSessionsTable
        sessions={sessions}
        onOpenRecord={onOpenRecord}
        onConfirmExternalPayment={onConfirmExternalPayment}
        onDisputeExternalPayment={onDisputeExternalPayment}
      />
    )}
  </section>
);

const ClientSessionsTable = ({
  sessions,
  onOpenRecord,
  onConfirmExternalPayment,
  onDisputeExternalPayment,
}: {
  sessions: ClientDashboardBooking[];
  onOpenRecord: (booking: ClientDashboardBooking) => void;
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
              const remainingPaymentStatus = booking.remainingPaymentStatus || "due";
              const isMultiSession = isClientMultiSessionBooking(booking);
              const activeSessionNumber = getPayableSessionNumber(booking);
              const sessionCount = Math.max(Number(booking.estimatedSessionCount || 1), 1);
              const remainingBalance = getRemainingBalance(booking);
              const dueThisSession =
                remainingPaymentStatus === "confirmed"
                  ? 0
                  : getClientSessionInstallmentAmount(booking);
              const canConfirm =
                booking.remainingPaymentMethod === "external" &&
                booking.status === "deposit_paid" &&
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
  onClose,
  onPay,
  onConfirmExternalPayment,
  onDisputeExternalPayment,
}: {
  booking: ClientDashboardBooking | null;
  onClose: () => void;
  onPay: (bookingId: string) => void;
  onConfirmExternalPayment: (booking: ClientDashboardBooking) => void;
  onDisputeExternalPayment: (booking: ClientDashboardBooking) => void;
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

const EventPassMeta = ({ icon, text }: { icon: ReactNode; text: string }) => (
  <div className="flex min-w-0 items-center gap-2">
    <span className="shrink-0 text-white/35">{icon}</span>
    <span className="truncate">{text}</span>
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

const ClientEventPassesSection = ({
  passes,
  eventsById,
  qrCodesByPassId,
  cancellingPassId,
  syncingPassId,
  onCancelPass,
  onSyncPass,
}: {
  passes: EventRegistration[];
  eventsById: Record<string, ArtistEvent>;
  qrCodesByPassId: Record<string, string>;
  cancellingPassId: string;
  syncingPassId: string;
  onCancelPass: (pass: EventRegistration) => void;
  onSyncPass: (pass: EventRegistration, options?: { quiet?: boolean }) => void;
}) => (
  <section className="mx-auto mt-8 w-full max-w-6xl space-y-6">
    <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Client events
        </p>
        <h1 className="mt-2 text-3xl! font-semibold text-white">
          Event passes
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
          Free RSVPs and paid event passes live here. Show the QR pass at the
          event so the host can check you in through SATX Ink.
        </p>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.04] px-5 py-4">
        <p className="text-xs uppercase tracking-[0.16em] text-white/35">
          Active passes
        </p>
        <p className="mt-2 text-2xl font-semibold text-white">{passes.length}</p>
      </div>
    </div>

    {passes.length === 0 ? (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center">
        <Ticket className="mx-auto mb-3 text-white/30" size={36} />
        <h3 className="text-lg font-semibold text-white">No event passes yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/50">
          RSVP to a public event or buy a paid event pass and your scannable
          pass will appear here.
        </p>
      </div>
    ) : (
      <div className="grid gap-5 lg:grid-cols-2">
        {passes.map((pass) => {
          const event = eventsById[pass.eventId];
          const qrCode = qrCodesByPassId[pass.id];
          const statusLabel =
            pass.status === "pending_payment"
              ? "Checkout pending"
              : pass.status === "checked_in"
              ? "Checked in"
              : pass.status === "paid"
              ? "Paid"
              : "Reserved";
          const paymentLabel =
            pass.paymentStatus === "free"
              ? "Free RSVP"
              : pass.paymentStatus === "paid"
              ? "Paid event pass"
              : pass.paymentStatus === "pending"
              ? "Payment pending"
              : pass.paymentStatus;
          const canCancel = pass.paymentStatus === "free" && pass.status !== "checked_in";

          return (
            <article
              key={pass.id}
              className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-transparent shadow-xl"
            >
              <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        pass.status === "checked_in"
                          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                          : pass.status === "pending_payment"
                          ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                          : pass.status === "paid"
                          ? "border-sky-300/25 bg-sky-300/10 text-sky-100"
                          : "border-sky-300/25 bg-sky-300/10 text-sky-100"
                      }`}
                    >
                      {statusLabel}
                    </span>
                    <span className="text-xs uppercase tracking-[0.14em] text-white/35">
                      {paymentLabel}
                    </span>
                  </div>

                  <h3 className="mt-4 line-clamp-2 text-2xl! font-semibold text-white">
                    {event?.title || pass.eventTitle || "Event"}
                  </h3>
                  <div className="mt-4 space-y-2 text-sm text-white/60">
                    <EventPassMeta
                      icon={<CalendarDays size={16} />}
                      text={formatClientEventPassDate(pass, event)}
                    />
                    <EventPassMeta
                      icon={<Store size={16} />}
                      text={pass.hostName || event?.shopName || "SATX Ink event"}
                    />
                    <EventPassMeta
                      icon={<MapPin size={16} />}
                      text={pass.address || event?.address || "Location TBD"}
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {canCancel ? (
                      <button
                        type="button"
                        onClick={() => onCancelPass(pass)}
                        disabled={cancellingPassId === pass.id}
                        className="rounded-md border border-white/10 bg-white/[0.04] px-4! py-2! text-sm! font-semibold text-white/70 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {cancellingPassId === pass.id ? "Cancelling..." : "Cancel RSVP"}
                      </button>
                    ) : pass.status === "pending_payment" && pass.stripeCheckoutSessionId ? (
                      <button
                        type="button"
                        onClick={() => void onSyncPass(pass)}
                        disabled={syncingPassId === pass.id}
                        className="inline-flex items-center gap-2 rounded-md border border-amber-300/25 bg-amber-300/10 px-4! py-2! text-sm! font-semibold text-amber-100 transition hover:border-amber-200/45 hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {syncingPassId === pass.id ? (
                          <LoaderCircle size={15} className="animate-spin" />
                        ) : (
                          <RefreshCcw size={15} />
                        )}
                        {syncingPassId === pass.id
                          ? "Checking payment..."
                          : "Refresh event pass"}
                      </button>
                    ) : (
                      <span className="rounded-md border border-white/10 bg-white/[0.035] px-4 py-2 text-sm font-semibold text-white/45">
                        {pass.status === "pending_payment"
                          ? "Finish checkout from the event page"
                          : "Managed by event checkout"}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={`rounded-xl border p-3 text-center ${
                    pass.status === "pending_payment"
                      ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
                      : "border-white/10 bg-white text-black"
                  }`}
                >
                  {pass.status === "pending_payment" ? (
                    <div className="flex h-36 flex-col items-center justify-center text-sm">
                      <Ticket className="mb-2 opacity-70" size={28} />
                      Complete checkout before this QR pass unlocks.
                    </div>
                  ) : qrCode ? (
                    <img
                      src={qrCode}
                      alt={`QR pass for ${pass.eventTitle || "event"}`}
                      className="mx-auto h-36 w-36"
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center text-sm text-black/50">
                      Preparing QR
                    </div>
                  )}
                  <p
                    className={`mt-2 text-xs font-semibold uppercase tracking-[0.12em] ${
                      pass.status === "pending_payment"
                        ? "text-amber-100/65"
                        : "text-black/55"
                    }`}
                  >
                    Scan at check-in
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    )}
  </section>
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

const formatClientEventPassDate = (
  pass: EventRegistration,
  event?: ArtistEvent
) => {
  const dateValue = event?.startDate || pass.eventStartDate;
  const timeValue = event?.startTime || pass.eventStartTime;

  if (!dateValue) return "Date TBD";

  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours = 0, minutes = 0] = (timeValue || "00:00").split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);

  if (Number.isNaN(date.getTime())) {
    return timeValue ? `${dateValue} at ${timeValue}` : dateValue;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: timeValue ? "numeric" : undefined,
    minute: timeValue ? "2-digit" : undefined,
  });
};

const getClientCallableErrorMessage = (error: unknown, fallback: string) => {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
};

const getBookingCreatedTime = (booking: Booking) => {
  const createdAt = booking.createdAt;
  if (createdAt?.toDate) return createdAt.toDate().getTime();
  if (createdAt?.seconds) return createdAt.seconds * 1000;
  return 0;
};

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

const getClientSessionInstallmentAmount = (booking: Partial<Booking>) => {
  const remaining = getRemainingBalance(booking);
  const pending = Number(booking.pendingSessionPaymentAmount || 0);
  if (pending > 0) return Math.min(pending, remaining);

  const sessionsLeft = Math.max(
    Number(booking.estimatedSessionCount || 1) -
      Number(booking.completedSessionCount || 0),
    1
  );
  return Math.ceil(remaining / sessionsLeft);
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

const isActiveSessionBooking = (booking: Partial<Booking> | Record<string, unknown>) =>
  booking.sessionStatus === "in_progress" || booking.sessionStatus === "completed";

export default ClientDashboardView;
