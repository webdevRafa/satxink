import { Link } from "react-router-dom";
import logo from "../assets/satx-short-sep.svg";
import { signInWithGoogle, signOutUser, auth } from "../firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import {
  ArrowRight,
  Image,
  LogOut,
  LogIn,
  Home,
  Search,
  Users,
  Info,
  Menu,
  ChevronDown,
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

type NavbarUserDoc = {
  avatarUrl?: string;
  displayName?: string;
  name?: string;
  role?: "artist" | "client";
};

export const Navbar = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(auth.currentUser);
  const [userRole, setUserRole] = useState<"artist" | "client" | null>(null);
  const [userDoc, setUserDoc] = useState<NavbarUserDoc | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    setIsOpen(false);
    setIsAccountMenuOpen(false);
    signOutUser(navigate);
  };
  const handleLogin = () => {
    setIsOpen(false);
    setIsAccountMenuOpen(false);
    signInWithGoogle(navigate);
  };
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const tryFetchUserData = async (uid: string, retries = 2) => {
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data() as NavbarUserDoc;
        setUserRole(data.role ?? null);
        setUserDoc(data);
      } else if (retries > 0) {
        setTimeout(() => tryFetchUserData(uid, retries - 1), 1000);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        tryFetchUserData(firebaseUser.uid);
      } else {
        setUserRole(null);
        setUserDoc(null);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setIsAccountMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAccountMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isAccountMenuOpen]);

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
      className={`fixed top-0 left-0 w-full z-[90] px-4 py-4 transition-colors duration-400 ${
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
        <div className="hidden md:flex items-center gap-6 text-sm">
          <Link
            to="/artists"
            className="text-neutral-300 hover:text-orange-400"
          >
            Artists
          </Link>

          <Link to="/flash" className="text-neutral-300 hover:text-orange-400">
            Flash
          </Link>

          <Link to="/about" className="text-neutral-300 hover:text-orange-400">
            About
          </Link>

          {user ? (
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 pr-2 text-neutral-200 transition hover:border-orange-400/60 hover:text-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-400/50"
              >
                <img
                  src={
                    userDoc?.avatarUrl ||
                    user.photoURL ||
                    "/fallback-avatar.jpg"
                  }
                  alt={userDoc?.name || user.displayName || "User avatar"}
                  className="w-8 h-8 rounded-full border border-white/30 object-cover"
                />
                <ChevronDown
                  size={16}
                  className={`transition-transform ${
                    isAccountMenuOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>

              {isAccountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-3 w-64 overflow-hidden rounded-lg border border-white/10 bg-[#121212]/95 text-white shadow-2xl shadow-black/40 backdrop-blur-md"
                >
                  <div className="border-b border-white/10 px-4 py-3">
                    <p className="truncate text-sm font-medium">
                      {userDoc?.name || user.displayName || "Signed in"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-neutral-400 capitalize">
                      {userRole || user.email || "Account"}
                    </p>
                  </div>
                  <Link
                    to="/dashboard"
                    role="menuitem"
                    onClick={() => setIsAccountMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-200 transition hover:bg-white/5 hover:text-orange-300"
                  >
                    <Home size={17} aria-hidden="true" />
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-neutral-200 transition hover:bg-red-500/10 hover:text-red-300"
                  >
                    <LogOut size={17} aria-hidden="true" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                to="/signup"
                className="text-neutral-300 hover:text-orange-400"
              >
                Signup
              </Link>
              <button
                onClick={handleLogin}
                className="text-white py-1! px-2! font-light! hover:text-[var(--color-primary)]"
              >
                Login
              </button>
            </>
          )}
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
            {user ? (
              <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-3">
                  <img
                    src={
                      userDoc?.avatarUrl ||
                      user.photoURL ||
                      "/fallback-avatar.jpg"
                    }
                    alt={userDoc?.name || user.displayName || "User avatar"}
                    className="h-12 w-12 rounded-full border border-white/20 object-cover"
                  />
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
                  <button
                    type="button"
                    onClick={handleLogin}
                    className="flex h-10! items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3! py-0! text-xs! font-semibold text-white transition hover:bg-white/10"
                  >
                    <LogIn size={15} aria-hidden="true" />
                    Login
                  </button>
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
