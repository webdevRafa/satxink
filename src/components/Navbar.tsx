import { Link, NavLink, useNavigate } from "react-router-dom";
import logo from "../assets/satx-short-sep.svg";
import { signOutUser, auth } from "../firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { AuthProviderSignInButtons } from "./GoogleSignupButton";
import {
  ArrowRight,
  Image,
  LogOut,
  Search,
  Users,
  Info,
  Menu,
  UserPlus,
  X,
} from "lucide-react";

const mobileNavItems = [
  {
    label: "Artists",
    description: "Browse verified San Antonio tattooers.",
    to: "/artists",
    icon: Users,
  },
  {
    label: "Flash",
    description: "Find ready-to-request designs and sheets.",
    to: "/flash",
    icon: Image,
  },
  {
    label: "About",
    description: "Learn how SATX Ink connects clients and artists.",
    to: "/about",
    icon: Info,
  },
];

const desktopNavItems = [
  { label: "Artists", to: "/artists" },
  { label: "Flash", to: "/flash" },
];

type NavbarUserDoc = {
  avatarUrl?: string;
  displayName?: string;
  name?: string;
  role?: "artist" | "client";
};

const getAvatarInitial = (label?: string | null) => {
  const trimmedLabel = label?.trim();
  return trimmedLabel ? trimmedLabel.charAt(0).toUpperCase() : "S";
};

export const Navbar = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(auth.currentUser);
  const [userRole, setUserRole] = useState<"artist" | "client" | null>(null);
  const [userDoc, setUserDoc] = useState<NavbarUserDoc | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isUserDocLoading, setIsUserDocLoading] = useState(
    Boolean(auth.currentUser)
  );
  const [isScrolled, setIsScrolled] = useState(false);
  const [showSignInOptions, setShowSignInOptions] = useState(false);
  const signInMenuRef = useRef<HTMLDivElement | null>(null);

  const firestoreAvatarUrl = userDoc?.avatarUrl?.trim() || "";
  const avatarLabel =
    userDoc?.name || userDoc?.displayName || user?.displayName || "User avatar";
  const avatarInitial = getAvatarInitial(
    userDoc?.name || userDoc?.displayName || user?.displayName || user?.email
  );

  const renderNavbarAvatar = (
    className: string,
    fallbackTextClassName: string
  ) => {
    if (isUserDocLoading) {
      return (
        <span
          className={`${className} block animate-pulse bg-white/[0.08]`}
          aria-hidden="true"
        />
      );
    }

    if (firestoreAvatarUrl) {
      return (
        <img src={firestoreAvatarUrl} alt={avatarLabel} className={className} />
      );
    }

    return (
      <span
        className={`${className} flex items-center justify-center bg-white/[0.08] ${fallbackTextClassName}`}
        aria-label={avatarLabel}
      >
        {avatarInitial}
      </span>
    );
  };

  const handleLogout = () => {
    setIsOpen(false);
    setShowSignInOptions(false);
    signOutUser(navigate);
  };
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    const retryTimers: number[] = [];

    const clearRetryTimers = () => {
      retryTimers.forEach((timerId) => window.clearTimeout(timerId));
      retryTimers.length = 0;
    };

    const tryFetchUserData = async (uid: string, retries = 2) => {
      try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (!isSubscribed || auth.currentUser?.uid !== uid) return;

        if (userSnap.exists()) {
          const data = userSnap.data() as NavbarUserDoc;
          setUserRole(data.role ?? null);
          setUserDoc(data);
          setIsUserDocLoading(false);
        } else if (retries > 0) {
          const retryTimerId = window.setTimeout(() => {
            tryFetchUserData(uid, retries - 1);
          }, 1000);
          retryTimers.push(retryTimerId);
        } else {
          setUserRole(null);
          setUserDoc(null);
          setIsUserDocLoading(false);
        }
      } catch {
        if (!isSubscribed || auth.currentUser?.uid !== uid) return;
        setUserRole(null);
        setUserDoc(null);
        setIsUserDocLoading(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      clearRetryTimers();
      setIsAuthLoading(false);
      setUser(firebaseUser);
      setUserRole(null);
      setUserDoc(null);
      if (firebaseUser) setShowSignInOptions(false);

      if (firebaseUser) {
        setIsUserDocLoading(true);
        tryFetchUserData(firebaseUser.uid);
      } else {
        setIsUserDocLoading(false);
      }
    });

    return () => {
      isSubscribed = false;
      clearRetryTimers();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!showSignInOptions) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        signInMenuRef.current &&
        !signInMenuRef.current.contains(event.target as Node)
      ) {
        setShowSignInOptions(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowSignInOptions(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showSignInOptions]);

  useEffect(() => {
    if (!isOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-[90] select-none px-4 py-4 transition-colors duration-400 ${
        isScrolled
          ? "bg-[var(--color-bg-footer)]  shadow-sm"
          : "bg-transparent border-transparent"
      }`}
    >
      <div className="max-w-[1600px] mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/">
          <img className="w-20" src={logo} alt="SATX Ink Logo" />
        </Link>

        {/* Desktop Nav */}
        <div className="hidden items-center gap-3 text-sm md:flex">
          <div
            className={`flex items-center gap-1 rounded-full  px-1.5 py-1 transition duration-300 `}
          >
            {desktopNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-sm text-white transition ${
                    isActive
                      ? "bg-white/[0.10] text-white! shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
                      : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <NavLink
            to="/about"
            className={({ isActive }) =>
              `rounded-full px-3 py-1.5 text-xs font-medium transition text-neutral-300 ${
                isActive
                  ? "bg-white/[0.10] text-white! shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
                  : "text-neutral-400 hover:bg-white/[0.055] hover:text-white"
              }`
            }
          >
            About SATX INK
          </NavLink>

          <div className="flex w-[168px] shrink-0 justify-end">
            {isAuthLoading ? (
              <div
                className={`flex h-10 w-full items-center justify-between rounded-full border px-3 transition duration-300 ${
                  isScrolled
                    ? "border-white/10 bg-white/[0.035]"
                    : "border-white/[0.08] bg-black/[0.10]"
                }`}
                aria-hidden="true"
              >
                <span className="h-2 w-16 animate-pulse rounded-full bg-white/[0.08]" />
                <span className="h-8 w-8 animate-pulse rounded-full border border-white/10 bg-white/[0.08]" />
              </div>
            ) : user ? (
              <Link
                to="/dashboard"
                aria-label="Open dashboard"
                className="flex items-center rounded-full border border-white/10 bg-white/5 p-1 text-neutral-200 transition hover:border-orange-400/60 hover:text-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-400/50"
              >
                {renderNavbarAvatar(
                  "w-8 h-8 rounded-full border border-white/30 object-cover",
                  "text-sm font-semibold text-white"
                )}
              </Link>
            ) : (
              <div
                ref={signInMenuRef}
                className={`relative flex items-center gap-1.5 rounded-full border p-1 transition duration-300 ${
                  isScrolled
                    ? "border-white/10 bg-white/[0.035]"
                    : "border-white/[0.08] bg-black/[0.10]"
                }`}
              >
                <NavLink
                  to="/signup"
                  className={({ isActive }) =>
                    `inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition hover:text-white! ${
                      isActive
                        ? "border-white/25 bg-white/[0.05] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
                        : "border-white/[0.12] bg-white/[0.01] text-neutral-400! hover:border-white/25 hover:bg-white/[0.10]"
                    }`
                  }
                >
                  Join
                </NavLink>
                <button
                  type="button"
                  onClick={() => setShowSignInOptions((current) => !current)}
                  aria-expanded={showSignInOptions}
                  className="inline-flex h-8 shrink-0 items-center rounded-full! px-3.5! py-0! text-sm! font-semibold! whitespace-nowrap text-neutral-400 transition hover:bg-white/[0.07] hover:text-white"
                >
                  Sign in
                </button>
                {showSignInOptions && (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-lg border border-white/10 bg-[#101010]/98 p-3 shadow-2xl shadow-black/45 backdrop-blur-xl">
                    <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      Continue with
                    </p>
                    <AuthProviderSignInButtons
                      onComplete={() => setShowSignInOptions(false)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Hamburger Button */}
        <button
          className="md:hidden text-white focus:outline-none"
          onClick={() => setIsOpen(true)}
        >
          <Menu />
        </button>
      </div>

      {/* Slide-In Mobile Menu */}
      <div
        className={`fixed inset-0 z-[110] flex h-dvh justify-end overflow-hidden bg-black/70 backdrop-blur-md transition-opacity duration-300 md:hidden ${
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden={!isOpen}
      >
        <div
          className={`relative flex h-dvh w-[min(92vw,430px)] flex-col overflow-hidden border-l border-white/10 bg-[#101010]/95 shadow-2xl shadow-black/60 backdrop-blur-xl transition-transform duration-300 ease-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}`}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent)]" />

          <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-4">
            <Link to="/" onClick={() => setIsOpen(false)}>
              <img className="w-20" src={logo} alt="SATX Ink Logo" />
            </Link>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
              onClick={() => setIsOpen(false)}
              aria-label="Close menu"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="relative flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            {isAuthLoading ? (
              <section
                className="rounded-lg border border-white/10 bg-white/[0.04] p-4"
                aria-hidden="true"
              >
                <div className="flex items-center gap-3">
                  <span className="h-12 w-12 animate-pulse rounded-full border border-white/10 bg-white/[0.08]" />
                  <div className="min-w-0 flex-1">
                    <span className="block h-3 w-32 animate-pulse rounded-full bg-white/[0.08]" />
                    <span className="mt-2 block h-2 w-20 animate-pulse rounded-full bg-white/[0.055]" />
                  </div>
                </div>
                <span className="mt-4 block h-10 animate-pulse rounded-md bg-white/[0.08]" />
              </section>
            ) : user ? (
              <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-3">
                  {renderNavbarAvatar(
                    "h-12 w-12 rounded-full border border-white/20 object-cover",
                    "text-lg font-semibold text-white"
                  )}
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">
                      {userDoc?.name || user.displayName || "Signed in"}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                      {userRole || "Account"}
                    </span>
                  </div>
                </div>
                <Link
                  to="/dashboard"
                  onClick={() => setIsOpen(false)}
                  className="mt-4 flex h-10 items-center justify-between rounded-md bg-white px-3 text-sm font-semibold text-[#0b0b0b]! transition hover:bg-white/85"
                >
                  Open dashboard
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </section>
            ) : (
              <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                  Start here
                </span>
                <h2 className="mt-2 mb-0! text-xl! font-semibold! text-white">
                  Find artists and flash in SATX.
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link
                    to="/signup/client"
                    onClick={() => setIsOpen(false)}
                    className="flex h-10 items-center justify-center gap-2 rounded-md bg-white px-3 text-xs font-semibold text-[#0b0b0b]! transition hover:bg-white/85"
                  >
                    <UserPlus size={15} aria-hidden="true" />
                    Client signup
                  </Link>
                  <Link
                    to="/signup/artist"
                    onClick={() => setIsOpen(false)}
                    className="flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white transition hover:bg-white/10"
                  >
                    <UserPlus size={15} aria-hidden="true" />
                    Artist signup
                  </Link>
                </div>
                <div className="mt-4 border-t border-white/10 pt-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Already have an account?
                  </span>
                  <AuthProviderSignInButtons
                    className="mt-3"
                    onComplete={() => setIsOpen(false)}
                  />
                </div>
              </section>
            )}

            <section className="mt-5">
              <span className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                Explore
              </span>
              <div className="mt-3 grid gap-2">
                {mobileNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsOpen(false)}
                      className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.025] p-3 transition hover:border-white/20 hover:bg-white/[0.06]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[var(--color-primary)] transition group-hover:bg-[var(--color-primary)] group-hover:text-white">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-neutral-500">
                          {item.description}
                        </span>
                      </span>
                      <ArrowRight
                        size={16}
                        className="text-neutral-600 transition group-hover:translate-x-0.5 group-hover:text-white"
                        aria-hidden="true"
                      />
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="mt-5 grid grid-cols-2 gap-2">
              <Link
                to="/artists"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-white/10 bg-white/[0.025] p-3 transition hover:bg-white/[0.06]"
              >
                <Search
                  size={16}
                  className="text-[var(--color-primary)]"
                  aria-hidden="true"
                />
                <span className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Browse
                </span>
                <span className="mt-1 block text-sm font-semibold text-white">
                  Local artists
                </span>
              </Link>
              <Link
                to="/signup/artist"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-white/10 bg-white/[0.025] p-3 transition hover:bg-white/[0.06]"
              >
                <UserPlus
                  size={16}
                  className="text-[var(--color-primary)]"
                  aria-hidden="true"
                />
                <span className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Artists
                </span>
                <span className="mt-1 block text-sm font-semibold text-white">
                  Join SATX Ink
                </span>
              </Link>
            </section>
          </div>

          <div className="relative border-t border-white/10 bg-black/20 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs leading-5 text-neutral-500">
                Built for San Antonio tattoo discovery.
              </span>
              {user ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex h-9! shrink-0 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3! py-0! text-xs! font-semibold text-white transition hover:bg-red-500/10 hover:text-red-300"
                >
                  <LogOut size={15} aria-hidden="true" />
                  Log out
                </button>
              ) : (
                <Link
                  to="/signup"
                  onClick={() => setIsOpen(false)}
                  className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white transition hover:bg-white/10"
                >
                  Signup
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
