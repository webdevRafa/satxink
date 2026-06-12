import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Save,
  Sparkles,
  UserRound,
} from "lucide-react";

import { db } from "../firebase/firebaseConfig";
import logo from "../assets/satx-short-sep.svg";
import { TATTOO_STYLES } from "../types/TattooStyle";
import { formatClientFullName, splitFullName } from "../utils/clientDisplayName";

const styleOptions = TATTOO_STYLES;

const ClientProfileSetupPage = () => {
  const auth = getAuth();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredStyles, setPreferredStyles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });

    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    if (!user) return;

    const providerName = splitFullName(user.displayName || "");
    setFirstName((current) => current || providerName.firstName);
    setLastName((current) => current || providerName.lastName);

    const loadExistingProfile = async () => {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) return;

      const data = userSnap.data();
      const nameParts = splitFullName(data.name || data.displayName || "");

      setFirstName((current) =>
        current ||
        (typeof data.firstName === "string" ? data.firstName : nameParts.firstName)
      );
      setLastName((current) =>
        current ||
        (typeof data.lastName === "string" ? data.lastName : nameParts.lastName)
      );
      setPreferredStyles(
        Array.isArray(data.preferredStyles) ? data.preferredStyles : []
      );
    };

    loadExistingProfile().catch((error) => {
      console.error("Failed to load client profile setup data:", error);
    });
  }, [user]);

  const hasRequiredName = Boolean(firstName.trim() && lastName.trim());
  const fullName = useMemo(
    () => formatClientFullName(firstName, lastName, ""),
    [firstName, lastName]
  );
  const setupProgress = hasRequiredName ? 100 : 0;

  const toggleStyle = (style: string) => {
    setPreferredStyles((current) =>
      current.includes(style)
        ? current.filter((selectedStyle) => selectedStyle !== style)
        : [...current, style]
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasRequiredName) {
      toast.error("Add your first and last name before finishing setup.");
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
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          name: fullName,
          displayName: fullName,
          email: currentUser.email || "",
          avatarUrl: currentUser.photoURL || "",
          preferredStyles,
          location: "",
          bio: "",
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
              <span>Set up your</span>
              <img
                src={logo}
                alt="SATX Ink logo"
                className="max-w-[104px] translate-y-[-2px]"
              />
              <span>profile</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-400">
              Confirm your name and optionally choose tattoo styles you already
              know you like.
            </p>
          </div>

          <div className="min-w-56">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Setup ready</span>
              <span>{setupProgress}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${
                  setupProgress === 100 ? "bg-emerald-400" : "bg-white"
                }`}
                style={{ width: `${setupProgress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-white/10 bg-[#121212]/90 p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                  <UserRound size={18} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="mb-0! text-lg!">Name</h2>
                  <p className="text-sm text-neutral-400">
                    This is the name attached to your client account.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-neutral-200">
                    First name
                  </span>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="Ralph"
                    className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-neutral-200">
                    Last name
                  </span>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Garcia"
                    className="w-full rounded-md border border-white/10 bg-[#101010] px-3 py-2 text-white outline-none transition focus:border-[var(--color-primary)]"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#121212]/90 p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                  <Sparkles size={18} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="mb-0! text-lg!">Styles</h2>
                  <p className="text-sm text-neutral-400">
                    Optional. Pick any styles you already know you like.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {styleOptions.map((style) => {
                  const selected = preferredStyles.includes(style);

                  return (
                    <button
                      key={style}
                      type="button"
                      onClick={() => toggleStyle(style)}
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
            </section>

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={!hasRequiredName || submitting}
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
            </div>
          </div>

          <aside className="h-fit rounded-lg border border-white/10 bg-[#101010]/95 p-5 xl:sticky xl:top-24">
            <div className="flex items-center gap-4">
              <img
                src={user?.photoURL || "/fallback-avatar.jpg"}
                alt={fullName || user?.displayName || "Client avatar"}
                className="h-20 w-20 rounded-full border border-white/10 object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-white">
                  {fullName || user?.displayName || "Client name"}
                </p>
                <p className="truncate text-sm text-neutral-400">
                  {user?.email || "Signed in securely"}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-neutral-400">Name</span>
                <span className="max-w-44 truncate text-right text-white">
                  {fullName || "Required"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-neutral-400">Style picks</span>
                <span className="text-white">{preferredStyles.length}</span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {preferredStyles.length > 0 ? (
                preferredStyles.slice(0, 8).map((style) => (
                  <span
                    key={style}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-200"
                  >
                    {style}
                  </span>
                ))
              ) : (
                <span className="text-sm text-neutral-500">
                  No styles selected yet.
                </span>
              )}
            </div>

            {hasRequiredName && (
              <div className="mt-5 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <Check size={16} aria-hidden="true" />
                  Ready to finish
                </span>
              </div>
            )}
          </aside>
        </div>
      </form>
    </div>
  );
};

export default ClientProfileSetupPage;
