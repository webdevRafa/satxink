import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getAuth } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Check,
  Clock3,
  Compass,
  Heart,
  LoaderCircle,
  MapPin,
  Save,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";

import { db } from "../firebase/firebaseConfig";
import logo from "../assets/satx-short-sep.svg";
import { TATTOO_STYLES } from "../types/TattooStyle";

type InterestGroup = {
  id: string;
  label: string;
  body: string;
  tags: string[];
};

const styleOptions = TATTOO_STYLES;

const interestGroups: InterestGroup[] = [
  {
    id: "anime",
    label: "Anime",
    body: "Characters, panels, and animated worlds.",
    tags: ["Dragon Ball Z", "Naruto", "One Piece", "Demon Slayer", "Studio Ghibli"],
  },
  {
    id: "sports",
    label: "Sports",
    body: "Teams, athletes, and hometown pride.",
    tags: ["Spurs", "Cowboys", "Longhorns", "Astros", "UFC"],
  },
  {
    id: "music",
    label: "Music",
    body: "Lyrics, genres, icons, and album energy.",
    tags: ["Hip Hop", "Tejano", "Metal", "Country", "R&B"],
  },
  {
    id: "culture",
    label: "Culture",
    body: "Heritage, city symbols, and personal roots.",
    tags: ["San Antonio", "Puro SA", "Chicano", "Tex-Mex", "Lowrider"],
  },
  {
    id: "nature",
    label: "Nature",
    body: "Animals, florals, landscapes, and symbols.",
    tags: ["Roses", "Snakes", "Butterflies", "Skulls", "Mountains"],
  },
  {
    id: "gaming",
    label: "Gaming",
    body: "Characters, worlds, and nostalgia.",
    tags: ["Pokemon", "Zelda", "Final Fantasy", "Mortal Kombat", "PlayStation"],
  },
];

const tattooGoals = [
  "Custom piece",
  "Flash drop",
  "Cover-up",
  "First tattoo",
  "Matching tattoo",
  "Sleeve planning",
];

const budgetRanges = [
  "Just browsing",
  "Under $200",
  "$200-$500",
  "$500-$1,000",
  "$1,000+",
];

const timeframeOptions = [
  "No rush",
  "This month",
  "Next 2-3 months",
  "Specific date",
];

const stepHeadings = ["Basics", "Style", "Interests", "Plan"];

const stepDescriptions = [
  "Choose the name artists and the community will see.",
  "Optionally choose tattoo styles that can shape your recommendations.",
  "Optionally pick interests and tags that can connect you with relevant artist work.",
  "Optionally tell us what kind of tattoo journey you are starting.",
];

const stepIcons = [UserRound, Sparkles, Heart, Compass];

const ClientProfileSetupPage = () => {
  const auth = getAuth();
  const user = auth.currentUser;
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(0);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [preferredStyles, setPreferredStyles] = useState<string[]>([]);
  const [selectedInterestCategories, setSelectedInterestCategories] = useState<
    string[]
  >([]);
  const [selectedInterestTags, setSelectedInterestTags] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [budgetRange, setBudgetRange] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedInterestLabels = useMemo(
    () =>
      interestGroups
        .filter((group) => selectedInterestCategories.includes(group.id))
        .map((group) => group.label),
    [selectedInterestCategories]
  );

  const stepCompletion = [
    Boolean(displayName.trim()),
    preferredStyles.length > 0,
    selectedInterestTags.length > 0,
    selectedGoals.length > 0,
  ];

  const hasRequiredBasics = Boolean(displayName.trim());
  const progress = hasRequiredBasics ? 100 : 0;
  const canContinue = currentStep === 0 ? hasRequiredBasics : true;
  const ActiveStepIcon = stepIcons[currentStep];

  const toggleValue = (
    value: string,
    setter: Dispatch<SetStateAction<string[]>>
  ) => {
    setter((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const toggleInterestGroup = (group: InterestGroup) => {
    setSelectedInterestCategories((prev) =>
      prev.includes(group.id)
        ? prev.filter((category) => category !== group.id)
        : [...prev, group.id]
    );
  };

  const getStepWarning = (step: number) => {
    if (step === 0) return "Add your display name before continuing.";
    return "This step is optional. You can finish now or add more detail.";
  };

  const handleStepCardClick = (targetStep: number) => {
    setCurrentStep(targetStep);
  };

  const handleNext = () => {
    if (!canContinue) {
      toast.error(getStepWarning(currentStep));
      return;
    }

    setCurrentStep((step) => Math.min(step + 1, stepHeadings.length - 1));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasRequiredBasics) {
      setCurrentStep(0);
      toast.error(getStepWarning(0));
      return;
    }

    const currentUser = getAuth().currentUser;
    if (!currentUser) {
      toast.error("Please sign in before finishing your profile.");
      navigate("/signup");
      return;
    }

    setSubmitting(true);

    try {
      const userRef = doc(db, "users", currentUser.uid);
      await setDoc(
        userRef,
        {
          name: displayName.trim(),
          displayName: displayName.trim(),
          email: currentUser.email || "",
          avatarUrl: currentUser.photoURL || "",
          bio: bio.trim(),
          location: location.trim(),
          preferredStyles,
          interestCategories: selectedInterestLabels,
          interestTags: selectedInterestTags,
          tattooGoals: selectedGoals,
          budgetRange,
          timeframe,
          discoveryPreferences: {
            categories: selectedInterestLabels,
            tags: selectedInterestTags,
            tattooGoals: selectedGoals,
            budgetRange,
            timeframe,
            updatedAt: serverTimestamp(),
          },
          profileComplete: true,
          role: "client",
          updatedAt: serverTimestamp(),
          onboardingCompletedAt: serverTimestamp(),
        },
        { merge: true }
      );

      navigate("/dashboard");
    } catch (error) {
      console.error("Profile update failed:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen px-4 pb-24 pt-28 text-white">
      <form
        autoComplete="off"
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-6xl space-y-6 text-left"
      >
        <Link
          to="/signup"
          className="inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </Link>

        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Client onboarding
            </p>
            <h1 className="mt-2 flex flex-wrap items-center gap-2 text-3xl! font-semibold text-white">
              <span>Shape your</span>
              <img
                src={logo}
                alt="SATX Ink logo"
                className="max-w-[104px] translate-y-[-2px]"
              />
              <span>feed</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-400">
              Help SATX Ink understand what you like so artist work, flash, and
              recommendations can feel more personal over time.
            </p>
          </div>

          <div className="min-w-56">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Profile ready</span>
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
                const isRequired = index === 0;

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
                    <span className="block text-sm font-semibold">{heading}</span>
                    <span
                      className={`mt-1 block text-xs ${
                        isComplete ? "text-emerald-200" : "text-neutral-500"
                      }`}
                    >
                      {isComplete ? "Complete" : isRequired ? "Required" : "Optional"}
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
                  <h2 className="mb-0! text-lg!">{stepHeadings[currentStep]}</h2>
                  <p className="text-sm text-neutral-400">
                    {stepDescriptions[currentStep]}
                  </p>
                </div>
              </div>

              {currentStep === 0 && (
                <div data-aos="fade-in" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-neutral-200">
                        Display name
                      </span>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Ralph"
                        className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                        <MapPin size={15} aria-hidden="true" />
                        Location (optional)
                      </span>
                      <input
                        type="text"
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                        placeholder="San Antonio, TX"
                        className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                      />
                    </label>
                  </div>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-neutral-200">
                      What are you looking for? (optional)
                    </span>
                    <textarea
                      value={bio}
                      onChange={(event) => setBio(event.target.value)}
                      rows={5}
                      maxLength={500}
                      placeholder="A short note about your tattoo taste, ideas, or the kind of artists you want to find."
                      className="w-full resize-none rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                    />
                    <span className="block text-right text-xs text-neutral-500">
                      {bio.length}/500
                    </span>
                  </label>
                </div>
              )}

              {currentStep === 1 && (
                <div data-aos="fade-in" className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {styleOptions.map((style) => {
                    const selected = preferredStyles.includes(style);

                    return (
                      <button
                        key={style}
                        type="button"
                        onClick={() => toggleValue(style, setPreferredStyles)}
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
              )}

              {currentStep === 2 && (
                <div data-aos="fade-in" className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    {interestGroups.map((group) => {
                      const selected = selectedInterestCategories.includes(group.id);

                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => toggleInterestGroup(group)}
                          className={`rounded-lg border p-4 text-left transition ${
                            selected
                              ? "border-white bg-white text-[#0b0b0b]"
                              : "border-white/10 bg-[#101010] text-neutral-300 hover:border-white/25"
                          }`}
                        >
                          <span className="block text-sm font-semibold">
                            {group.label}
                          </span>
                          <span className="mt-1 block text-xs opacity-70">
                            {group.body}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-3 border-t border-white/10 pt-5">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-white">
                        Interest tags
                      </p>
                      <p className="text-xs text-neutral-500">
                        {selectedInterestTags.length} selected
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {interestGroups.flatMap((group) =>
                        group.tags.map((tag) => {
                          const selected = selectedInterestTags.includes(tag);
                          const categorySelected =
                            selectedInterestCategories.includes(group.id);

                          return (
                            <button
                              key={`${group.id}-${tag}`}
                              type="button"
                              onClick={() => toggleValue(tag, setSelectedInterestTags)}
                              className={`rounded-full border px-3 py-2 text-xs transition ${
                                selected
                                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white"
                                  : categorySelected
                                  ? "border-white/20 bg-white/[0.06] text-neutral-200 hover:border-white/30"
                                  : "border-white/10 bg-[#101010] text-neutral-400 hover:border-white/25 hover:text-white"
                              }`}
                            >
                              #{tag.replace(/\s+/g, "")}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div data-aos="fade-in" className="space-y-5">
                  <div>
                    <p className="mb-3 text-sm font-medium text-neutral-200">
                      What are you here to do?
                    </p>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {tattooGoals.map((goal) => {
                        const selected = selectedGoals.includes(goal);

                        return (
                          <button
                            key={goal}
                            type="button"
                            onClick={() => toggleValue(goal, setSelectedGoals)}
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                        <BadgeDollarSign size={15} aria-hidden="true" />
                        Budget range
                      </span>
                      <select
                        value={budgetRange}
                        onChange={(event) => setBudgetRange(event.target.value)}
                        className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                      >
                        <option value="">Select a range</option>
                        {budgetRanges.map((range) => (
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
                        value={timeframe}
                        onChange={(event) => setTimeframe(event.target.value)}
                        className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                      >
                        <option value="">Select a timeline</option>
                        {timeframeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </section>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}
                disabled={currentStep === 0}
                className="inline-flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back
              </button>

              <div className="flex flex-wrap items-center justify-end gap-3">
                {currentStep < stepHeadings.length - 1 && (
                  <button
                    type="submit"
                    disabled={!hasRequiredBasics || submitting}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? "Saving..." : "Finish setup"}
                  </button>
                )}

                {currentStep < stepHeadings.length - 1 ? (
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
                  disabled={!hasRequiredBasics || submitting}
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
                  {submitting ? "Saving profile..." : "Finish setup"}
                </button>
                )}
              </div>
            </div>
          </div>

          <aside className="h-fit rounded-lg border border-white/10 bg-[#101010]/95 p-5 xl:sticky xl:top-24">
            <div className="flex items-center gap-4">
              <img
                src={user?.photoURL || "/fallback-avatar.jpg"}
                alt={displayName || user?.displayName || "Client avatar"}
                className="h-20 w-20 rounded-full border border-white/10 object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-white">
                  {displayName || user?.displayName || "Client name"}
                </p>
                <p className="truncate text-sm text-neutral-400">
                  {user?.email || "Signed in with Google"}
                </p>
              </div>
            </div>

            <p className="mt-5 line-clamp-5 text-sm leading-6 text-neutral-300">
              {bio ||
                "Your profile note helps artists understand your taste before you request work."}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {[...preferredStyles, ...selectedInterestTags].length > 0 ? (
                [...preferredStyles, ...selectedInterestTags].slice(0, 8).map((tag) => (
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
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-neutral-400">Location</span>
                <span className="max-w-44 truncate text-right text-white">
                  {location || "Not selected"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-neutral-400">Style picks</span>
                <span className="text-white">{preferredStyles.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-neutral-400">Interest tags</span>
                <span className="text-white">{selectedInterestTags.length}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-neutral-400">Plan</span>
                <span className="max-w-44 truncate text-right text-white">
                  {selectedGoals[0] || "Not selected"}
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-md border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                  <Search size={16} aria-hidden="true" />
                </span>
                <p className="text-xs leading-5 text-neutral-400">
                  These tags can later match against artist gallery and flash
                  tags like #DragonBallZ, #Spurs, or #FineLine.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
};

export default ClientProfileSetupPage;
