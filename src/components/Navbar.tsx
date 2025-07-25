import { Link } from "react-router-dom";
import logo from "../assets/satx-short-sep.svg";
import { signInWithGoogle, signOutUser, auth } from "../firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { LogOut, Home, Users, Info, Menu } from "lucide-react";

export const Navbar = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(auth.currentUser);
  const [userRole, setUserRole] = useState<"artist" | "client" | null>(null);
  const [userDoc, setUserDoc] = useState<any>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  const handleLogout = () => {
    setIsOpen(false);
    signOutUser(navigate);
  };
  const handleLogin = () => {
    setIsOpen(false);
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

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-50 px-4 py-4 transition-colors duration-400 ${
        isScrolled
          ? "bg-[var(--color-bg-footer)]  shadow-sm"
          : "bg-transparent border-transparent"
      }`}
    >
      <div className="max-w-[1400px] mx-auto flex items-center justify-between">
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
          <Link to="/about" className="text-neutral-300 hover:text-orange-400">
            Events
          </Link>

          {userDoc?.avatarUrl ? (
            <Link to="/dashboard">
              <img
                src={userDoc.avatarUrl}
                alt="User Avatar"
                className="w-9 h-9 rounded-full border border-white cursor-pointer"
              />
            </Link>
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
                className="text-white font-light! hover:text-[var(--color-primary)] bg-[var(--color-bg-card)]/30 hover:bg-[var(--color-bg-footer)]/60"
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
            ✕
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
              to="/about"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 hover:text-orange-400"
            >
              <Info size={18} /> About
            </Link>

            {user ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 mt-4 text-left hover:text-red-400"
              >
                <LogOut size={18} /> Logout
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
