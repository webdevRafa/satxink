import { Link } from "react-router-dom";
import logo from "../assets/satx-short-sep.svg";
import { signInWithGoogle, signOutUser, auth } from "../firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import {
  CalendarDays,
  Image,
  LogOut,
  Home,
  Users,
  Info,
  Menu,
  ChevronDown,
  X,
} from "lucide-react";

export const Navbar = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(auth.currentUser);
  const [userRole, setUserRole] = useState<"artist" | "client" | null>(null);
  const [userDoc, setUserDoc] = useState<any>(null);
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
        const data = userSnap.data();
        setUserRole(data.role);
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

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-50 px-4 py-4 transition-colors duration-400 ${
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

          <Link to="/events" className="text-neutral-300 hover:text-orange-400">
            Events
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
        className={`fixed inset-0 z-90 bg-black/50 backdrop-blur-sm transition-opacity duration-300 flex justify-end ${
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className={`w-[80%] max-w-xs h-full relative transition-transform duration-300 ease-in-out
      ${isOpen ? "translate-x-0" : "translate-x-full"}
      bg-[#121212]/70 backdrop-blur-md  p-6 shadow-xl
    `}
        >
          {/* Close Button */}
          <button
            className="absolute top-3 right-3 text-white text-xl"
            onClick={() => setIsOpen(false)}
          >
            <X size={22} aria-hidden="true" />
            <span className="sr-only">Close menu</span>
          </button>

          {/* Profile Summary */}
          {user && (
            <div className="mb-6 flex items-center gap-3">
              <img
                src={userDoc?.avatarUrl || "/fallback-avatar.jpg"}
                alt="Avatar"
                className="w-10 h-10 rounded-full border border-gray-500"
              />
              <div>
                <p className="text-white text-sm">{user.displayName}</p>
                <p className="text-gray-400 text-xs capitalize">{userRole}</p>
              </div>
            </div>
          )}

          {/* Menu Items */}
          <nav className="flex flex-col gap-4 text-white text-base">
            {user && (
              <Link
                to="/dashboard"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 hover:text-orange-400"
              >
                <Home size={18} /> Dashboard
              </Link>
            )}
            <Link
              to="/artists"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 hover:text-orange-400"
            >
              <Users size={18} /> Artists
            </Link>

            <Link
              to="/events"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 hover:text-orange-400"
            >
              <CalendarDays size={18} /> Events
            </Link>

            <Link
              to="/flash"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 hover:text-orange-400"
            >
              <Image size={18} /> Flash
            </Link>

            <Link
              to="/about"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 hover:text-orange-400"
            >
              <Info size={18} /> About
            </Link>

            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 mt-4 text-left hover:text-red-400"
              >
                <LogOut size={18} /> Log out
              </button>
            ) : (
              <>
                <Link
                  to="/signup"
                  onClick={() => setIsOpen(false)}
                  className="hover:text-orange-400"
                >
                  Signup
                </Link>
                <button
                  onClick={handleLogin}
                  className="text-left hover:text-orange-400"
                >
                  Login
                </button>
              </>
            )}
          </nav>
        </div>
      </div>
    </nav>
  );
};
