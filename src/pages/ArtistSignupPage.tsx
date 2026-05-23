import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { Listbox } from "@headlessui/react";
import slugify from "slugify";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Globe,
  Instagram,
  LoaderCircle,
  Save,
  Sparkles,
  UserRound,
} from "lucide-react";

import { GoogleSignupButton } from "../components/GoogleSignupButton";
import logo from "../assets/satx-short-sep.svg";
import { auth, db } from "../firebase/firebaseConfig";
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

const SPECIALTIES = [
  "Blackwork",
  "Linework",
  "Dotwork",
  "Color",
  "Realism",
  "Neo-Traditional",
  "Micro",
  "Geometric",
  "Anime",
  "Traditional",
  "Japanese",
  "Ornamental",
  "Fine Line",
  "Color Realism",
];

const stepHeadings = ["Shop", "Style", "Payments", "Profile"];

const stepDescriptions = [
  "Connect your profile to the studio clients should see on your public profile.",
  "Choose the styles that best describe your work and add your social channels.",
  "Set how clients should pay deposits and appointment balances.",
  "Choose the public name and bio clients will remember.",
];

const stepIcons = [Building2, Sparkles, CreditCard, UserRound];

const ArtistSignupPage = ({ onBack }: { onBack?: () => void }) => {
  const [paymentType, setPaymentType] = useState<string>("");
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [externalHandle, setExternalHandle] = useState<string>("");
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [isNameTaken, setIsNameTaken] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [formVisible, setFormVisible] = useState<boolean>(false);

  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [isShopDropdownOpen, setIsShopDropdownOpen] = useState(false);

  const [submitting, setSubmitting] = useState<boolean>(false);

  const [displayName, setDisplayName] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [instagram, setInstagram] = useState<string>("");
  const [facebook, setFacebook] = useState<string>("");
  const [defaultDepositAmount, setDefaultDepositAmount] =
    useState<string>("100");

  const navigate = useNavigate();

  useEffect(() => {
    setSubmitting(false);
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

  useEffect(() => {
    const fetchShops = async () => {
      const snapshot = await getDocs(collection(db, "shops"));
      const shopList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Shop, "id">),
      }));
      setShops(shopList);
    };
    fetchShops();
  }, []);

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
        where("slug", "==", slug)
      );
      const snapshot = await getDocs(nameQuery);
      setIsNameTaken(snapshot.docs.some((docSnap) => docSnap.id !== user.uid));
      setIsCheckingName(false);
    }, 650);

    return () => window.clearTimeout(timer);
  }, [displayName, user]);

  const sanitizeUrl = (url: string) => {
    if (!url) return "";
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return "https://" + trimmed;
    }
    return trimmed;
  };

  const isValidUrl = (url: string) => {
    try {
      if (!url) return true;
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

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
      : currentStep === 2
      ? paymentType === "internal" ||
        Boolean(
          paymentType === "external" && selectedMethod && externalHandle.trim()
        )
      : Boolean(
          displayName.trim() && bio.trim() && !isNameTaken && !isCheckingName
        );

  const stepCompletion = [
    Boolean(selectedShop),
    specialties.length > 0,
    paymentType === "internal" ||
      Boolean(
        paymentType === "external" && selectedMethod && externalHandle.trim()
      ),
    Boolean(displayName.trim() && bio.trim() && !isNameTaken && !isCheckingName),
  ];
  const allStepsComplete = stepCompletion.every(Boolean);
  const progress = Math.round(
    (stepCompletion.filter(Boolean).length / stepCompletion.length) * 100
  );
  const ActiveStepIcon = stepIcons[currentStep];

  const getStepWarning = (step: number) => {
    if (step === 0) return "Select your shop before continuing.";
    if (step === 1) return "Choose at least one specialty before continuing.";
    if (step === 2) return "Choose a payment option before continuing.";
    return "Add an available display name and a bio before creating your profile.";
  };

  const handleStepCardClick = (targetStep: number) => {
    if (targetStep <= currentStep) {
      setCurrentStep(targetStep);
      return;
    }

    const firstIncompleteStep = stepCompletion.findIndex(
      (isComplete, index) => index < targetStep && !isComplete
    );

    if (firstIncompleteStep !== -1) {
      setCurrentStep(firstIncompleteStep);
      toast.error(getStepWarning(firstIncompleteStep));
      return;
    }

    setCurrentStep(targetStep);
  };

  const handleNext = () => {
    if (!canContinue) {
      toast.error("Complete this step before continuing.");
      return;
    }

    setCurrentStep((step) => Math.min(step + 1, stepHeadings.length - 1));
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

    const sanitizedInstagram = sanitizeUrl(instagram);
    const sanitizedFacebook = sanitizeUrl(facebook);
    const depositAmount = Number(defaultDepositAmount || 0);

    if (!isValidUrl(sanitizedInstagram) || !isValidUrl(sanitizedFacebook)) {
      toast.error("One or more of your social links are not valid URLs.");
      setSubmitting(false);
      return;
    }

    if (Number.isNaN(depositAmount) || depositAmount < 0) {
      toast.error("Default deposit must be zero or greater.");
      setSubmitting(false);
      return;
    }

    if (isCheckingName || isNameTaken) {
      toast.error("Choose an available display name before submitting.");
      setSubmitting(false);
      return;
    }

    const finalPaymentTiming = "before";
    setSubmitting(true);

    const slug = slugify(displayName, { lower: true, strict: true });

    try {
      await runTransaction(db, async (transaction) => {
        const slugQuery = query(
          collection(db, "users"),
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
          shopId: selectedShop ? selectedShop.id : "",
          specialties,
          socialLinks: {
            instagram: sanitizedInstagram,
            facebook: sanitizedFacebook,
          },
          avatarUrl: user.photoURL || "",
          email: user.email || "",
          featured: false,
          isVerified: false,
          role: "artist",
          createdAt: serverTimestamp(),
          paymentType,
          depositPolicy: {
            amount: depositAmount,
            depositRequired: true,
            nonRefundable: true,
          },
          finalPaymentTiming,
          ...(paymentType === "external" && {
            externalPaymentDetails: {
              method: selectedMethod,
              handle: externalHandle,
            },
          }),
          likedBy: [],
          updatedAt: serverTimestamp(),
          profileComplete: true,
        };

        const artistRef = doc(db, "users", user.uid);
        transaction.set(artistRef, newArtist, { merge: true });
      });

      navigate("/dashboard");
    } catch (err: any) {
      console.error("Artist profile submission failed:", err);
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-aos="fade-up"
      className="min-h-screen w-full overflow-y-auto px-4 pb-10 pt-24 text-white md:pt-28"
    >
      <div className="mx-auto w-full max-w-6xl">
        <button
          type="button"
          onClick={() => (onBack ? onBack() : navigate("/signup"))}
          className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>

        {!user && (
          <section className="mx-auto max-w-xl rounded-lg border border-white/10 bg-[#121212]/90 p-6 text-center shadow-2xl shadow-black/30 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Artist signup
            </p>
            <h1 className="mt-3 flex flex-wrap items-center justify-center gap-2 text-3xl! font-semibold text-white">
              <span>Join</span>
              <img
                src={logo}
                alt="SATX Ink logo"
                className="max-w-[108px] translate-y-[-2px]"
              />
              <span>as an Artist</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-neutral-400">
              Create your artist profile, showcase your portfolio, and connect
              with local clients.
            </p>
            <div className="mt-7">
              <GoogleSignupButton role="artist" />
            </div>
            <p className="mx-auto mt-4 max-w-sm text-xs! text-neutral-500!">
              We only collect your name, profile picture, and email from Google
              to set up your account. By signing up, you agree to our{" "}
              <Link
                to="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition hover:text-white"
              >
                Terms
              </Link>
              .
            </p>
          </section>
        )}

        {formVisible && user && (
          <form
            autoComplete="off"
            onSubmit={handleArtistSubmit}
            className="space-y-6 text-left"
          >
            <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
                  Artist onboarding
                </p>
                <h1 className="mt-2 flex flex-wrap items-center gap-2 text-3xl! font-semibold text-white">
                  <span>Join</span>
                  <img
                    src={logo}
                    alt="SATX Ink logo"
                    className="max-w-[104px] translate-y-[-2px]"
                  />
                  <span>as an Artist</span>
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-neutral-400">
                  Build the profile clients will see before they request,
                  book, or follow your work.
                </p>
              </div>

              <div className="min-w-56">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Setup progress</span>
                  <span>{progress}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all ${
                      progress === 100 ? "bg-emerald-400" : "bg-white"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-5">
                <div className="grid gap-2 sm:grid-cols-4">
                  {stepHeadings.map((heading, index) => {
                    const StepIcon = stepIcons[index];
                    const isActive = currentStep === index;
                    const isComplete = stepCompletion[index];

                    return (
                      <button
                        key={heading}
                        type="button"
                        onClick={() => handleStepCardClick(index)}
                        className={`rounded-lg border p-3 text-left transition ${
                          isActive
                            ? "border-white/25 bg-white/[0.08] text-white"
                            : isComplete
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                            : "border-white/10 bg-white/[0.03] text-neutral-400 hover:border-white/20 hover:text-white"
                        }`}
                      >
                        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-white/5">
                          {isComplete ? (
                            <Check size={16} aria-hidden="true" />
                          ) : (
                            <StepIcon size={16} aria-hidden="true" />
                          )}
                        </span>
                        <span className="block text-sm font-semibold">
                          {heading}
                        </span>
                        <span
                          className={`mt-1 block text-xs ${
                            isComplete ? "text-emerald-200" : "text-neutral-500"
                          }`}
                        >
                          {isComplete ? "Complete" : "Required"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <section className="rounded-lg border border-white/10 bg-[#121212]/90 p-5 shadow-2xl shadow-black/20 backdrop-blur">
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                      <ActiveStepIcon size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="mb-0! text-lg!">
                        {stepHeadings[currentStep]}
                      </h2>
                      <p className="text-sm text-neutral-400">
                        {stepDescriptions[currentStep]}
                      </p>
                    </div>
                  </div>

                  {currentStep === 0 && (
                    <div data-aos="fade-in" className="relative z-50 space-y-4">
                      <Listbox
                        value={selectedShop}
                        onChange={(shop) => {
                          setSelectedShop(shop);
                          setIsShopDropdownOpen(false);
                        }}
                      >
                        {() => (
                          <div
                            className="relative z-50"
                            onBlur={() =>
                              window.setTimeout(
                                () => setIsShopDropdownOpen(false),
                                120
                              )
                            }
                          >
                            <Listbox.Button
                              onClick={() =>
                                setIsShopDropdownOpen((open) => !open)
                              }
                              className="relative w-full cursor-pointer rounded-md border border-white/10 bg-[#101010] px-3 py-3 pr-10 text-left text-white outline-none transition hover:border-white/25 focus:border-[var(--color-primary)]"
                            >
                              <span className="block truncate">
                                {selectedShop
                                  ? selectedShop.name
                                  : "Select your shop"}
                              </span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              </span>
                            </Listbox.Button>
                            <Listbox.Options className="absolute z-[120] mt-2 max-h-64 w-full overflow-auto rounded-md border border-white/10 bg-[#050505] py-1 text-white shadow-2xl shadow-black ring-1 ring-black before:absolute before:inset-0 before:-z-10 before:rounded-md before:bg-[#050505]">
                              {shops.map((shop) => (
                                <Listbox.Option
                                  key={shop.id}
                                  value={shop}
                                  className={({ active, selected }) =>
                                    `relative cursor-pointer select-none px-4 py-3 text-sm ${
                                      active || selected
                                        ? "bg-white/10 text-white"
                                        : "text-neutral-300"
                                    }`
                                  }
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="font-medium">{shop.name}</p>
                                    {selectedShop?.id === shop.id && (
                                      <Check
                                        size={16}
                                        className="mt-1 text-emerald-300"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </div>
                                </Listbox.Option>
                              ))}
                            </Listbox.Options>
                          </div>
                        )}
                      </Listbox>

                      {selectedShop && (
                        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-sm font-semibold text-white">
                            {selectedShop.name}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {currentStep === 1 && (
                    <div data-aos="fade-in" className="space-y-5">
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                        {SPECIALTIES.map((style) => {
                          const selected = specialties.includes(style);
                          return (
                            <button
                              key={style}
                              type="button"
                              onClick={() => toggleSpecialty(style)}
                              className={`rounded-md border px-3 py-3 text-left text-sm transition ${
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

                    </div>
                  )}

                  {currentStep === 2 && (
                    <div data-aos="fade-in" className="space-y-5">
                      <div className="grid gap-3 md:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentType("internal");
                            setSelectedMethod("");
                          }}
                          className={`rounded-lg border p-4 text-left transition ${
                            paymentType === "internal"
                              ? "border-white bg-white text-[#0b0b0b]"
                              : "border-white/10 bg-[#101010] text-neutral-300 hover:border-white/25"
                          }`}
                        >
                          <span className="block text-sm font-semibold">
                            Stripe
                          </span>
                          <span className="mt-1 block text-xs opacity-70">
                            In-app deposits and payouts.
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentType("external")}
                          className={`rounded-lg border p-4 text-left transition ${
                            paymentType === "external"
                              ? "border-white bg-white text-[#0b0b0b]"
                              : "border-white/10 bg-[#101010] text-neutral-300 hover:border-white/25"
                          }`}
                        >
                          <span className="block text-sm font-semibold">
                            External
                          </span>
                          <span className="mt-1 block text-xs opacity-70">
                            CashApp, Venmo, Zelle, or similar.
                          </span>
                        </button>
                      </div>

                      {paymentType === "external" && (
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-sm font-medium text-neutral-200">
                              Preferred method
                            </span>
                            <select
                              name="externalMethod"
                              value={selectedMethod}
                              onChange={(e) => setSelectedMethod(e.target.value)}
                              className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                            >
                              <option value="">Select a method</option>
                              <option value="cashapp">CashApp</option>
                              <option value="venmo">Venmo</option>
                              <option value="zelle">Zelle</option>
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="text-sm font-medium text-neutral-200">
                              Payment handle
                            </span>
                            <input
                              type="text"
                              name="externalHandle"
                              value={externalHandle}
                              onChange={(e) => setExternalHandle(e.target.value)}
                              placeholder={
                                selectedMethod === "zelle"
                                  ? "Email or phone number"
                                  : selectedMethod === "cashapp"
                                  ? "$YourCashTag"
                                  : "@yourusername or phone"
                              }
                              className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                            />
                          </label>
                        </div>
                      )}

                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-neutral-200">
                          Default deposit amount
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={defaultDepositAmount}
                          onChange={(e) =>
                            setDefaultDepositAmount(e.target.value)
                          }
                          placeholder="100"
                          className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                        />
                        <span className="block text-xs text-neutral-500">
                          This is your default client deposit for new offers,
                          not a signup charge.
                        </span>
                      </label>
                    </div>
                  )}

                  {currentStep === 3 && (
                    <div data-aos="fade-in" className="space-y-4">
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-neutral-200">
                          Display name
                        </span>
                        <input
                          type="text"
                          name="displayName"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Ink by Alex"
                          className={`w-full rounded-md border bg-[#101010] px-3 py-2 text-white outline-none transition ${
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

                      <label className="space-y-2">
                        <span className="text-sm font-medium text-neutral-200">
                          Bio
                        </span>
                        <textarea
                          name="bio"
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          rows={6}
                          maxLength={700}
                          placeholder="Tell clients about your style, process, and booking vibe."
                          className="w-full resize-none rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                        />
                        <span className="block text-right text-xs text-neutral-500">
                          {bio.length}/700
                        </span>
                      </label>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                          <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                            <Instagram size={15} aria-hidden="true" />
                            Instagram
                          </span>
                          <input
                            type="url"
                            name="instagram"
                            value={instagram}
                            onChange={(e) => setInstagram(e.target.value)}
                            placeholder="instagram.com/artist"
                            className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                            <Globe size={15} aria-hidden="true" />
                            Facebook
                          </span>
                          <input
                            type="url"
                            name="facebook"
                            value={facebook}
                            onChange={(e) => setFacebook(e.target.value)}
                            placeholder="facebook.com/artist"
                            className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </section>

                <div
                  className={`relative z-0 flex items-center justify-between ${
                    currentStep === 0 && isShopDropdownOpen
                      ? "invisible pointer-events-none"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentStep((step) => Math.max(step - 1, 0))
                    }
                    disabled={currentStep === 0}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Back
                  </button>

                  {currentStep < 3 ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      aria-disabled={!canContinue}
                      className={`inline-flex items-center gap-2 rounded-md bg-white px-5 py-2 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85 ${
                        !canContinue ? "opacity-60" : ""
                      }`}
                    >
                      Next
                      <ArrowRight
                        size={16}
                        className="text-[#0b0b0b]!"
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!allStepsComplete || submitting}
                      className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? (
                        <LoaderCircle
                          size={16}
                          className="animate-spin text-[#0b0b0b]!"
                          aria-hidden="true"
                        />
                      ) : (
                        <Save
                          size={16}
                          className="text-[#0b0b0b]!"
                          aria-hidden="true"
                        />
                      )}
                      {submitting ? "Creating profile..." : "Create profile"}
                    </button>
                  )}
                </div>
              </div>

              <aside className="h-fit rounded-lg border border-white/10 bg-[#101010]/95 p-5 xl:sticky xl:top-24">
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
                      {selectedShop?.name || "Not selected"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-400">Payments</span>
                    <span className="capitalize text-white">
                      {paymentType === "internal"
                        ? "Stripe"
                        : paymentType === "external"
                        ? "External"
                        : "Not selected"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-400">Default deposit</span>
                    <span className="text-white">
                      ${defaultDepositAmount || "0"}
                    </span>
                  </div>
                </div>
              </aside>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ArtistSignupPage;
