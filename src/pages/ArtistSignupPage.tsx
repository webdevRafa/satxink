import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Dialog } from "@headlessui/react";
import slugify from "slugify";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Images,
  Instagram,
  LoaderCircle,
  MapPin,
  Save,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

import { AuthProviderSignupButtons } from "../components/GoogleSignupButton";
import logo from "../assets/satx-short-sep.svg";
import { auth, db } from "../firebase/firebaseConfig";
import { TATTOO_STYLES } from "../types/TattooStyle";
import {
  collection,
  getDocs,
  doc,
  query,
  where,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";

type Shop = {
  id: string;
  name: string;
  address: string;
  mapLink: string;
};

const SPECIALTIES = TATTOO_STYLES;
const UNLISTED_SHOP_ID = "__unlisted_shop__";
const INSTAGRAM_PROFILE_BASE = "https://instagram.com/";
const INSTAGRAM_PROFILE_LABEL = "instagram.com/";

const unlistedShopOption: Shop = {
  id: UNLISTED_SHOP_ID,
  name: "My shop isn't listed",
  address: "",
  mapLink: "",
};

const getInstagramHandle = (value: string) => {
  const withoutDomain = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^(www\.)?instagram\.com\//i, "");
  const pathOnly = withoutDomain.replace(/^@+/, "").replace(/^\/+/, "");

  return pathOnly.split(/[/?#]/)[0].replace(/[^a-zA-Z0-9._]/g, "");
};

const artistSignupBenefits = [
  {
    title: "Style-based discovery",
    body: "Clients can find you by the tattoo styles you specialize in, from fine line and realism to traditional, blackwork, anime, lettering, and more.",
    icon: Images,
  },
  {
    title: "Made for San Antonio artists",
    body: "SATX Ink is built specifically around the San Antonio tattoo scene, helping local clients discover artists nearby instead of scrolling through random social feeds.",
    icon: MapPin,
  },
  {
    title: "Turn your profile into a booking path",
    body: "Show your portfolio, flash, shop, and social links in one place so clients understand your work before reaching out.",
    icon: BadgeCheck,
  },
];

const stepHeadings = ["Shop", "Style", "You"];

const stepDescriptions = [
  "Connect your profile to the studio clients should see on your public profile.",
  "Choose the styles that best describe your work.",
  "Add your public name and Instagram profile. Your bio is optional.",
];

const stepIcons = [Building2, Sparkles, UserRound];

type StepStatus = "required" | "ready" | "complete";
type ProfileCreationPhase = "idle" | "dim" | "reveal";

const stepStatusLabels: Record<StepStatus, string> = {
  required: "Required",
  ready: "Ready",
  complete: "Complete",
};

const profileCreationRevealDelayMs = 1400;
const profileCreationHoldDelayMs = 4400;

const waitFor = (durationMs: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

type ArtistSignupBenefit = (typeof artistSignupBenefits)[number];

const ArtistSignupBenefitCard = ({
  benefit,
}: {
  benefit: ArtistSignupBenefit;
}) => {
  const BenefitIcon = benefit.icon;

  return (
    <article className="group relative flex min-h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05] sm:p-6">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-neutral-300 transition duration-300 group-hover:border-white/20 group-hover:text-white">
        <BenefitIcon size={21} aria-hidden="true" />
      </span>

      <h2 className="mt-8 min-h-14 text-xl! font-bold leading-tight text-white">
        {benefit.title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300!">
        {benefit.body}
      </p>

      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[var(--color-primary)] via-white/50 to-transparent opacity-70"
        aria-hidden="true"
      />
    </article>
  );
};

const ArtistSignupPage = ({ onBack }: { onBack?: () => void }) => {
  const onboardingStepTopRef = useRef<HTMLDivElement | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [isNameTaken, setIsNameTaken] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [formVisible, setFormVisible] = useState<boolean>(false);

  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [unlistedShopName, setUnlistedShopName] = useState<string>("");
  const [isShopPickerOpen, setIsShopPickerOpen] = useState(false);
  const [shopSearchQuery, setShopSearchQuery] = useState("");

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [profileCreationPhase, setProfileCreationPhase] =
    useState<ProfileCreationPhase>("idle");

  const [displayName, setDisplayName] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [instagramHandle, setInstagramHandle] = useState<string>("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invitedShopId = searchParams.get("shopId") || "";
  const filteredShops = useMemo(() => {
    const normalizedQuery = shopSearchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return shops;

    return shops.filter((shop) =>
      shop.name.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [shopSearchQuery, shops]);

  const closeShopPicker = useCallback(() => {
    setIsShopPickerOpen(false);
    setShopSearchQuery("");
  }, []);

  const handleShopSelection = useCallback(
    (shop: Shop) => {
      setSelectedShop(shop);
      closeShopPicker();
    },
    [closeShopPicker]
  );

  useEffect(() => {
    setSubmitting(false);
  }, []);

  const scrollOnboardingToTop = useCallback(() => {
    const scrollingElement =
      document.scrollingElement || document.documentElement;

    scrollingElement.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    scrollingElement.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const scrollOnboardingStepIntoView = useCallback(() => {
    const target = onboardingStepTopRef.current;
    if (!target) return;

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setFormVisible(true);
        setSubmitting(false);
      } else {
        setUser(null);
        setFormVisible(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useLayoutEffect(() => {
    if (!formVisible || !user) return undefined;

    scrollOnboardingToTop();
    const animationFrame = window.requestAnimationFrame(scrollOnboardingToTop);
    const timeout = window.setTimeout(scrollOnboardingToTop, 120);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [formVisible, scrollOnboardingToTop, user]);

  useEffect(() => {
    if (profileCreationPhase === "idle") return undefined;

    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previousBodyOverflow = bodyStyle.overflow;
    const previousHtmlOverflow = htmlStyle.overflow;

    bodyStyle.overflow = "hidden";
    htmlStyle.overflow = "hidden";

    return () => {
      bodyStyle.overflow = previousBodyOverflow;
      htmlStyle.overflow = previousHtmlOverflow;
    };
  }, [profileCreationPhase]);

  useEffect(() => {
    const fetchShops = async () => {
      const snapshot = await getDocs(collection(db, "shops"));
      const shopList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Shop, "id">),
      }));
      setShops(shopList);
      if (invitedShopId) {
        const invitedShop = shopList.find((shop) => shop.id === invitedShopId);
        if (invitedShop) setSelectedShop(invitedShop);
      }
    };
    fetchShops();
  }, [invitedShopId]);

  useEffect(() => {
    if (!displayName.trim() || !user) {
      setIsNameTaken(false);
      setIsCheckingName(false);
      return;
    }

    const slug = slugify(displayName, { lower: true, strict: true });

    const timer = window.setTimeout(async () => {
      setIsCheckingName(true);
      const nameQuery = query(
        collection(db, "users"),
        where("role", "==", "artist"),
        where("slug", "==", slug)
      );
      const snapshot = await getDocs(nameQuery);
      setIsNameTaken(snapshot.docs.some((docSnap) => docSnap.id !== user.uid));
      setIsCheckingName(false);
    }, 650);

    return () => window.clearTimeout(timer);
  }, [displayName, user]);

  const toggleSpecialty = (style: string) => {
    setSpecialties((prev) =>
      prev.includes(style)
        ? prev.filter((specialty) => specialty !== style)
        : [...prev, style]
    );
  };

  const canContinue =
    currentStep === 0
      ? Boolean(selectedShop)
      : currentStep === 1
      ? specialties.length > 0
      : Boolean(
          displayName.trim() &&
            instagramHandle.trim() &&
            !isNameTaken &&
            !isCheckingName
        );

  const stepCompletion = [
    Boolean(selectedShop),
    specialties.length > 0,
    Boolean(
      displayName.trim() &&
        instagramHandle.trim() &&
        !isNameTaken &&
        !isCheckingName
    ),
  ];
  const allStepsComplete = stepCompletion.every(Boolean);
  const progress = Math.round(
    (stepCompletion.filter(Boolean).length / stepCompletion.length) * 100
  );
  const ActiveStepIcon = stepIcons[currentStep];

  const getStepStatus = (step: number): StepStatus => {
    if (!stepCompletion[step]) return "required";
    return currentStep === step ? "ready" : "complete";
  };

  const getStepWarning = (step: number) => {
    if (step === 0) return "Select your shop before continuing.";
    if (step === 1) return "Choose at least one specialty before continuing.";
    return (
      "Add an available display name and Instagram handle before creating " +
      "your profile."
    );
  };

  const navigateToStep = useCallback(
    (targetStep: number) => {
      const nextStep = Math.max(
        0,
        Math.min(targetStep, stepHeadings.length - 1)
      );

      if (nextStep === currentStep) return;

      setCurrentStep(nextStep);
      scrollOnboardingStepIntoView();
    },
    [currentStep, scrollOnboardingStepIntoView]
  );

  const handleStepCardClick = (targetStep: number) => {
    if (targetStep <= currentStep) {
      navigateToStep(targetStep);
      return;
    }

    const firstIncompleteStep = stepCompletion.findIndex(
      (isComplete, index) => index < targetStep && !isComplete
    );

    if (firstIncompleteStep !== -1) {
      navigateToStep(firstIncompleteStep);
      toast.error(getStepWarning(firstIncompleteStep));
      return;
    }

    navigateToStep(targetStep);
  };

  const handleNext = () => {
    if (!canContinue) {
      toast.error("Complete this step before continuing.");
      return;
    }

    navigateToStep(currentStep + 1);
  };

  const handleBackStep = () => {
    navigateToStep(currentStep - 1);
  };

  const handleArtistSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      setSubmitting(false);
      return;
    }

    const firstIncompleteStep = stepCompletion.findIndex(
      (isComplete) => !isComplete
    );
    if (firstIncompleteStep !== -1) {
      setCurrentStep(firstIncompleteStep);
      toast.error(getStepWarning(firstIncompleteStep));
      setSubmitting(false);
      return;
    }

    const isUnlistedShop = selectedShop?.id === UNLISTED_SHOP_ID;
    const requestedShopName = unlistedShopName.trim();
    const instagramUrl = instagramHandle
      ? `${INSTAGRAM_PROFILE_BASE}${instagramHandle}`
      : "";

    if (isCheckingName || isNameTaken) {
      toast.error("Choose an available display name before submitting.");
      setSubmitting(false);
      return;
    }

    const paymentType = "internal";
    const finalPaymentTiming = "before";
    setSubmitting(true);
    setProfileCreationPhase("dim");

    const slug = slugify(displayName, { lower: true, strict: true });

    try {
      const startedAt = Date.now();
      const profileCreationResult = runTransaction(db, async (transaction) => {
        const slugQuery = query(
          collection(db, "users"),
          where("role", "==", "artist"),
          where("slug", "==", slug)
        );
        const slugSnapshot = await getDocs(slugQuery);
        const nameBelongsToAnotherArtist = slugSnapshot.docs.some(
          (docSnap) => docSnap.id !== user.uid
        );
        if (nameBelongsToAnotherArtist) {
          throw new Error("That name is already taken. Please choose another.");
        }

        const newArtist = {
          displayName,
          slug,
          bio,
          shopId: isUnlistedShop ? "" : selectedShop?.id || "",
          shopName: isUnlistedShop
            ? requestedShopName
            : selectedShop?.name || "",
          studioName: isUnlistedShop
            ? requestedShopName
            : selectedShop?.name || "",
          shopRequestPending: isUnlistedShop,
          requestedShopName: isUnlistedShop ? requestedShopName : "",
          specialties,
          socialLinks: {
            instagram: instagramUrl,
            facebook: "",
          },
          avatarUrl: user.photoURL || "",
          email: user.email || "",
          featured: false,
          isVerified: false,
          role: "artist",
          createdAt: serverTimestamp(),
          paymentType,
          depositPolicy: {
            amount: 0,
            depositRequired: true,
            nonRefundable: true,
          },
          finalPaymentTiming,
          finalPaymentDeadlineHours: 24,
          likedBy: [],
          updatedAt: serverTimestamp(),
          profileComplete: true,
        };

        const artistRef = doc(db, "users", user.uid);
        transaction.set(artistRef, newArtist, { merge: true });

        if (isUnlistedShop) {
          const shopRequestRef = doc(db, "unlistedShopRequests", user.uid);
          transaction.set(shopRequestRef, {
            artistId: user.uid,
            artistName: displayName.trim() || user.displayName || "",
            artistEmail: user.email || "",
            artistAvatarUrl: user.photoURL || "",
            requestedShopName,
            status: "new",
            source: "artist_onboarding",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }).then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error })
      );

      const firstResult = await Promise.race([
        profileCreationResult,
        waitFor(profileCreationRevealDelayMs).then(() => null),
      ]);

      if (firstResult && !firstResult.ok) {
        throw firstResult.error;
      }

      if (firstResult?.ok) {
        await waitFor(
          Math.max(0, profileCreationRevealDelayMs - (Date.now() - startedAt))
        );
      }

      setProfileCreationPhase("reveal");
      const revealedAt = Date.now();
      const finalResult = firstResult ?? (await profileCreationResult);

      if (!finalResult.ok) {
        throw finalResult.error;
      }

      await waitFor(
        Math.max(0, profileCreationHoldDelayMs - (Date.now() - revealedAt))
      );

      navigate("/dashboard");
    } catch (err: unknown) {
      setProfileCreationPhase("idle");
      console.error("Artist profile submission failed:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {profileCreationPhase !== "idle" &&
        createPortal(
          <div
            className="animate-fade-in fixed inset-0 z-[9999] flex items-center justify-center bg-black px-4 text-white opacity-0"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div
              className={`relative isolate w-full max-w-md overflow-hidden rounded-lg border border-white/[0.1] bg-[#0d0d0d] px-6 py-8 text-center shadow-[0_30px_90px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-700 ease-out sm:px-9 sm:py-10 ${
                profileCreationPhase === "reveal"
                  ? "translate-y-0 scale-100 opacity-100"
                  : "translate-y-2 scale-[0.98] opacity-0"
              }`}
            >
              <div
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
                aria-hidden="true"
              />
              <span
                className="spotlight-border-glint spotlight-border-glint--left"
                aria-hidden="true"
              />
              <span
                className="spotlight-border-glint spotlight-border-glint--right"
                aria-hidden="true"
              />

              <img
                src={logo}
                alt="SATX Ink"
                className="mx-auto w-36 max-w-full"
              />
              <p className="mx-auto mt-6 max-w-xs text-sm font-medium leading-6 text-neutral-300">
                One moment while we create your artist profile.
              </p>
            </div>
          </div>,
          document.body
        )}

      <Dialog
        open={isShopPickerOpen}
        onClose={closeShopPicker}
        className="relative z-[170]"
      >
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          aria-hidden="true"
        />
        <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
          <Dialog.Panel
            id="artist-shop-picker"
            className="flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0b0b0b] text-left text-white shadow-[0_-24px_70px_rgba(0,0,0,0.7)] sm:max-h-[min(42rem,calc(100dvh-2rem))] sm:max-w-lg sm:rounded-xl sm:shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <Dialog.Title className="text-lg font-semibold text-white">
                  Select your shop
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm! leading-5! text-neutral-400!">
                  Choose the studio clients should see on your profile.
                </Dialog.Description>
              </div>
              <button
                type="button"
                onClick={closeShopPicker}
                aria-label="Close shop picker"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-0! text-neutral-300 transition hover:border-white/25 hover:text-white"
              >
                <X size={19} aria-hidden="true" />
              </button>
            </div>

            <div className="border-b border-white/10 px-3 py-3 sm:px-4">
              <label className="relative block">
                <span className="sr-only">Search tattoo shops</span>
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={shopSearchQuery}
                  onChange={(event) => setShopSearchQuery(event.target.value)}
                  placeholder="Search shops"
                  className="h-11 w-full rounded-md border border-white/10 bg-[#111111] pl-10 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-white/30 focus:ring-2 focus:ring-white/10"
                />
              </label>
            </div>

            <div
              role="listbox"
              aria-label="Available tattoo shops"
              className="shop-picker-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:px-4 sm:pb-4"
            >
              {!shopSearchQuery.trim() && (
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedShop?.id === UNLISTED_SHOP_ID}
                  onClick={() => handleShopSelection(unlistedShopOption)}
                  className={`mb-2 w-full rounded-lg border p-3! text-left text-sm! transition ${
                    selectedShop?.id === UNLISTED_SHOP_ID
                      ? "border-amber-300/45 bg-amber-300/15 text-amber-50"
                      : "border-amber-300/20 bg-amber-300/[0.07] text-amber-100 hover:border-amber-300/35 hover:bg-amber-300/10"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 font-semibold">
                      <CircleHelp
                        size={17}
                        className="shrink-0 text-amber-300"
                        aria-hidden="true"
                      />
                      <span>My shop isn&apos;t listed</span>
                    </span>
                    {selectedShop?.id === UNLISTED_SHOP_ID && (
                      <Check
                        size={17}
                        className="shrink-0 text-amber-200"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="mt-1 block pl-6 text-xs leading-5 text-amber-100/65">
                    Send the shop to the SATX Ink team for review.
                  </span>
                </button>
              )}

              {filteredShops.map((shop) => {
                const isSelected = selectedShop?.id === shop.id;

                return (
                  <button
                    key={shop.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleShopSelection(shop)}
                    className={`mb-1.5 flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border p-3! text-left text-sm! transition ${
                      isSelected
                        ? "border-emerald-300/30 bg-emerald-300/10 text-white"
                        : "border-transparent text-neutral-200 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <span className="min-w-0 font-medium">{shop.name}</span>
                    {isSelected && (
                      <Check
                        size={17}
                        className="shrink-0 text-emerald-300"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}

              {filteredShops.length === 0 && (
                <div className="px-3 py-10 text-center">
                  <p className="text-sm! text-neutral-400!">
                    No shops match “{shopSearchQuery.trim()}”.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShopSearchQuery("")}
                    className="mt-3 rounded-md border border-white/10 px-3! py-2! text-sm! text-white transition hover:border-white/25"
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      <div
        data-aos="fade-up"
        data-aos-delay="0"
        data-aos-duration="450"
        className="w-full px-3 pb-24 pt-0 text-white sm:px-4"
      >
        <div className="mx-auto w-full max-w-6xl">
          {!user && (
            <section className="mx-auto flex w-full max-w-6xl flex-col items-center py-8 text-center md:py-14 lg:py-16">
              <button
                type="button"
                onClick={() => (onBack ? onBack() : navigate("/signup"))}
                className="inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back
              </button>

              <div className="mt-10 w-full max-w-2xl pt-8 md:mt-14 md:pt-10">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                  Get listed
                </p>
                <h1 className="mt-4 flex flex-wrap items-center justify-center gap-2 text-3xl! font-semibold leading-tight text-white sm:text-4xl!">
                  <span>Join</span>
                  <img
                    src={logo}
                    alt="SATX Ink logo"
                    className="max-w-[112px] translate-y-[-2px]"
                  />
                  <span>as an Artist</span>
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-neutral-400 sm:text-base">
                  Start with Google or Apple, then complete a guided profile
                  setup for your shop, styles, and bio.
                </p>

                <div className="mt-7 flex justify-center">
                  <AuthProviderSignupButtons role="artist" />
                </div>

                <p className="mx-auto mt-6 text-xs! leading-5 text-neutral-500!">
                  We only use the name, email and avatar from your sign-in
                  provider to set up your account. For more information, please
                  view our&nbsp;
                  <Link
                    to="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline transition hover:text-white"
                  >
                    Terms
                  </Link>
                  &nbsp; and &nbsp;
                  <Link
                    to="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline transition hover:text-white"
                  >
                    Privacy Policy
                  </Link>
                </p>
              </div>

              <div className="mt-12 grid w-full max-w-6xl auto-rows-fr items-stretch gap-4 md:mt-16 md:grid-cols-3">
                {artistSignupBenefits.map((benefit) => (
                  <ArtistSignupBenefitCard
                    key={benefit.title}
                    benefit={benefit}
                  />
                ))}
              </div>
            </section>
          )}

          {formVisible && user && (
            <form
              autoComplete="off"
              onSubmit={handleArtistSubmit}
              className="min-w-0 space-y-4 text-left sm:space-y-6"
            >
              <div
                ref={onboardingStepTopRef}
                className="scroll-mt-20 flex min-w-0 flex-col gap-3 border-b border-white/10 pb-4 sm:scroll-mt-24 sm:gap-4 sm:pb-5 lg:flex-row lg:items-end lg:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-[0.65rem] uppercase tracking-[0.16em] text-[var(--color-primary)] sm:text-xs sm:tracking-[0.18em]">
                    Artist onboarding
                  </p>
                  <h1 className="mt-1 flex flex-nowrap items-center gap-1.5 text-[1.65rem]! font-semibold leading-tight text-white sm:mt-2 sm:flex-wrap sm:gap-2 sm:text-3xl!">
                    <span>Join</span>
                    <img
                      src={logo}
                      alt="SATX Ink logo"
                      className="w-[88px] max-w-[32vw] translate-y-[-2px] sm:w-auto sm:max-w-[104px]"
                    />
                    <span className="hidden sm:inline">as an Artist</span>
                  </h1>
                  <p className="mt-1 max-w-2xl text-[0.82rem] leading-5 text-neutral-400 sm:mt-2 sm:text-sm sm:leading-6">
                    <span className="sm:hidden">
                      Set up the profile clients will see before they request or
                      book.
                    </span>
                    <span className="hidden sm:inline">
                      Build the profile clients will see before they request,
                      book, or follow your work.
                    </span>
                  </p>
                </div>

                <div className="w-full min-w-0 lg:w-auto lg:min-w-56">
                  <div className="flex items-center justify-between text-[0.68rem] text-neutral-400 sm:text-xs">
                    <span>Setup progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/10 sm:mt-2 sm:h-2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        progress === 100 ? "bg-emerald-400" : "bg-white"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-5">
                  <div className="grid min-w-0 grid-cols-3 gap-2">
                    {stepHeadings.map((heading, index) => {
                      const StepIcon = stepIcons[index];
                      const isActive = currentStep === index;
                      const stepStatus = getStepStatus(index);
                      const statusLabel = stepStatusLabels[stepStatus];

                      return (
                        <button
                          key={heading}
                          type="button"
                          onClick={() => handleStepCardClick(index)}
                          aria-label={`${heading}: ${statusLabel}`}
                          className={`flex min-h-[4.25rem] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1.5! py-2! text-center text-sm! transition sm:grid sm:min-h-16 sm:grid-cols-[2rem_minmax(0,1fr)] sm:items-center sm:gap-3 sm:px-3! sm:py-2.5! sm:text-left ${
                            isActive
                              ? "border-white/35 bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
                              : stepStatus === "complete"
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                              : "border-white/10 bg-white/[0.03] text-neutral-400 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-md ${
                              stepStatus === "complete"
                                ? "bg-emerald-400/10 text-emerald-200"
                                : stepStatus === "ready"
                                ? "bg-emerald-400/10 text-emerald-200"
                                : "bg-white/5"
                            }`}
                          >
                            {stepStatus === "complete" ? (
                              <Check size={16} aria-hidden="true" />
                            ) : (
                              <StepIcon size={16} aria-hidden="true" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[0.8rem] font-semibold leading-4 sm:text-sm sm:leading-5">
                              {heading}
                            </span>
                            <span
                              className={`block text-[0.68rem] leading-4 sm:text-xs ${
                                stepStatus === "complete"
                                  ? "text-emerald-200"
                                  : stepStatus === "ready"
                                  ? "text-emerald-200"
                                  : "text-neutral-500"
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <section className="min-w-0 rounded-lg border border-white/10 bg-[#121212]/90 p-3 shadow-2xl shadow-black/20 backdrop-blur sm:p-5">
                    <div className="mb-4 flex items-start gap-3 sm:mb-5 sm:items-center">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)] sm:h-9 sm:w-9">
                        <ActiveStepIcon size={18} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="mb-0! text-lg!">
                          {stepHeadings[currentStep]}
                        </h2>
                        <p className="text-[0.9rem]! leading-6! text-neutral-400! sm:text-sm!">
                          {stepDescriptions[currentStep]}
                        </p>
                      </div>
                    </div>

                    {currentStep === 0 && (
                      <div data-aos="fade-in" className="space-y-4">
                        <div className="space-y-3">
                          <span id="artist-shop-picker-label" className="sr-only">
                            Select your tattoo shop
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsShopPickerOpen(true)}
                            aria-haspopup="dialog"
                            aria-expanded={isShopPickerOpen}
                            aria-controls="artist-shop-picker"
                            aria-labelledby="artist-shop-picker-label"
                            className={`relative w-full cursor-pointer rounded-md border bg-[#101010] px-3! py-3! pr-10! text-left text-sm! outline-none transition hover:border-white/25 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-white/10 ${
                              selectedShop?.id === UNLISTED_SHOP_ID
                                ? "border-amber-300/30 text-amber-100"
                                : "border-white/10 text-white"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {selectedShop?.id === UNLISTED_SHOP_ID && (
                                <CircleHelp
                                  size={16}
                                  className="shrink-0 text-amber-300"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="block truncate">
                                {selectedShop
                                  ? selectedShop.name
                                  : "Select your shop"}
                              </span>
                            </span>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                              <ChevronDown
                                className={`h-4 w-4 text-gray-400 transition-transform ${
                                  isShopPickerOpen ? "rotate-180" : ""
                                }`}
                                aria-hidden="true"
                              />
                            </span>
                          </button>
                        </div>

                        {selectedShop?.id === UNLISTED_SHOP_ID ? (
                          <div className="space-y-4 rounded-md border border-amber-300/20 bg-amber-300/[0.07] p-4">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-300/10 text-amber-200">
                                <CircleHelp size={17} aria-hidden="true" />
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-amber-50">
                                  No problem—you can keep going.
                                </p>
                                <p className="mt-1 text-sm leading-6 text-amber-100/70">
                                  We’ll review your request promptly and follow up
                                  by email. This won’t delay your profile setup.
                                </p>
                              </div>
                            </div>
                            <label className="block space-y-2">
                              <span className="text-sm font-medium text-neutral-200">
                                Shop or studio name{" "}
                                <span className="font-normal text-neutral-500">
                                  (optional)
                                </span>
                              </span>
                              <input
                                type="text"
                                value={unlistedShopName}
                                onChange={(event) =>
                                  setUnlistedShopName(event.target.value)
                                }
                                maxLength={160}
                                placeholder="Enter the shop name if you know it"
                                className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition placeholder:text-neutral-600 focus:border-amber-300/60"
                              />
                            </label>
                          </div>
                        ) : selectedShop ? (
                          <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                            {invitedShopId === selectedShop.id && (
                              <p className="mb-3 rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-50/85">
                                This invite is connected to {selectedShop.name}.
                              </p>
                            )}
                            <p className="text-sm font-semibold text-white">
                              {selectedShop.name}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {currentStep === 1 && (
                      <div data-aos="fade-in" className="min-w-0 space-y-5">
                        <div className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3">
                          {SPECIALTIES.map((style) => {
                            const selected = specialties.includes(style);
                            return (
                              <button
                                key={style}
                                type="button"
                                onClick={() => toggleSpecialty(style)}
                                className={`min-h-12 min-w-0 rounded-md border px-2.5! py-2.5! text-left text-sm! leading-5 transition ${
                                  selected
                                    ? "border-white/25 bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(0,0,0,0.22)] hover:border-white/35 hover:bg-white/[0.13]"
                                    : "border-white/10 bg-[#101010] text-neutral-300 hover:border-white/25"
                                }`}
                              >
                                {style}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {currentStep === 2 && (
                      <div data-aos="fade-in" className="min-w-0 space-y-4">
                        <label className="min-w-0 space-y-2">
                          <span className="flex items-center justify-between gap-3 text-sm font-medium text-neutral-200">
                            <span>Display name</span>
                            <span className="text-xs font-normal text-neutral-500">
                              Required
                            </span>
                          </span>
                          <input
                            type="text"
                            name="displayName"
                            required
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Ink by Alex"
                            className={`block w-full max-w-full rounded-md border bg-[#101010] px-3 py-2 text-white outline-none transition ${
                              isNameTaken
                                ? "border-red-400 focus:border-red-400"
                                : displayName && !isCheckingName
                                ? "border-emerald-400 focus:border-emerald-400"
                                : "border-white/10 focus:border-[var(--color-primary)]"
                            }`}
                          />
                          <span
                            className={`block text-xs ${
                              isNameTaken
                                ? "text-red-300"
                                : displayName && !isCheckingName
                                ? "text-emerald-300"
                                : "text-neutral-500"
                            }`}
                          >
                            {isCheckingName && "Checking name availability..."}
                            {!isCheckingName &&
                              displayName &&
                              !isNameTaken &&
                              "This display name is available."}
                            {!isCheckingName &&
                              displayName &&
                              isNameTaken &&
                              "This display name is already taken."}
                            {!displayName &&
                              "This becomes your public profile name and handle."}
                          </span>
                        </label>

                        <label className="min-w-0 space-y-2">
                          <span className="flex items-center justify-between gap-3 text-sm font-medium text-neutral-200">
                            <span>Bio</span>
                            <span className="text-xs font-normal text-neutral-500">
                              Optional
                            </span>
                          </span>
                          <textarea
                            name="bio"
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            rows={6}
                            maxLength={700}
                            placeholder="Tell clients about your style, process, and booking vibe."
                            className="block w-full max-w-full resize-none rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-white/35 focus:ring-2 focus:ring-white/10"
                          />
                          <span className="block text-right text-xs text-neutral-500">
                            {bio.length}/700
                          </span>
                        </label>

                        <div>
                          <label className="block min-w-0 space-y-2">
                            <span className="flex items-center justify-between gap-3 text-sm font-medium text-neutral-200">
                              <span className="flex items-center gap-2">
                                <Instagram size={15} aria-hidden="true" />
                                Instagram
                              </span>
                              <span className="text-xs font-normal text-neutral-500">
                                Required
                              </span>
                            </span>
                            <span className="flex min-h-11 min-w-0 overflow-hidden rounded-md border border-white/10 bg-[#101010] transition focus-within:border-white/35 focus-within:ring-2 focus-within:ring-white/10">
                              <span className="flex shrink-0 items-center border-r border-white/10 bg-white/[0.03] px-2.5 text-sm text-neutral-500 sm:px-3">
                                {INSTAGRAM_PROFILE_LABEL}
                              </span>
                              <input
                                type="text"
                                inputMode="text"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                name="instagram"
                                required
                                value={instagramHandle}
                                onChange={(event) =>
                                  setInstagramHandle(
                                    getInstagramHandle(event.target.value)
                                  )
                                }
                                placeholder="artist"
                                aria-label="Instagram profile path"
                                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-white outline-none placeholder:text-neutral-600"
                              />
                            </span>
                            <span className="block text-xs text-neutral-500">
                              Paste a profile link or enter only your username.
                            </span>
                          </label>
                        </div>
                      </div>
                    )}
                  </section>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleBackStep}
                      disabled={currentStep === 0}
                      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/10 px-3.5 py-1.5 text-sm text-neutral-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                      Back
                    </button>

                    {currentStep < stepHeadings.length - 1 ? (
                      <button
                        type="button"
                        onClick={handleNext}
                        aria-disabled={!canContinue}
                        className={`inline-flex min-h-9 items-center gap-2 rounded-md border border-white/20 bg-white/[0.08] px-4 py-1.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(0,0,0,0.22)] transition hover:border-white/35 hover:bg-white/[0.13] ${
                          !canContinue ? "opacity-60" : ""
                        }`}
                      >
                        Next
                        <ArrowRight
                          size={16}
                          className="text-white"
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!allStepsComplete || submitting}
                        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/20 bg-white/[0.08] px-4 py-1.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(0,0,0,0.22)] transition hover:border-white/35 hover:bg-white/[0.13] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submitting ? (
                          <LoaderCircle
                            size={16}
                            className="animate-spin text-white"
                            aria-hidden="true"
                          />
                        ) : (
                          <Save
                            size={16}
                            className="text-white"
                            aria-hidden="true"
                          />
                        )}
                        {submitting ? "Creating profile..." : "Create profile"}
                      </button>
                    )}
                  </div>
                </div>

                <aside className="h-fit min-w-0 rounded-lg border border-white/10 bg-[#101010]/95 p-4 sm:p-5 xl:sticky xl:top-24">
                  <div className="flex items-center gap-4">
                    <img
                      src={user.photoURL || "/fallback-avatar.jpg"}
                      alt={displayName || user.displayName || "Artist avatar"}
                      className="h-20 w-20 rounded-full border border-white/10 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-white">
                        {displayName || user.displayName || "Display name"}
                      </p>
                      <p className="truncate text-sm text-neutral-400">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  <p className="mt-5 line-clamp-5 text-sm leading-6 text-neutral-300">
                    {bio ||
                      "Your bio preview will appear here as clients browse your profile."}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {specialties.length > 0 ? (
                      specialties.slice(0, 6).map((style) => (
                        <span
                          key={style}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-200"
                        >
                          {style}
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
                      <span className="text-neutral-400">Shop</span>
                      <span className="max-w-44 truncate text-right text-white">
                        {selectedShop?.id === UNLISTED_SHOP_ID
                          ? unlistedShopName.trim() || "Pending shop review"
                          : selectedShop?.name || "Not selected"}
                      </span>
                    </div>
                  </div>
                </aside>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
};

export default ArtistSignupPage;
