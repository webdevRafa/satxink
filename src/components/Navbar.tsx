import { Link } from "react-router-dom";
import logo from "../assets/satxlogo.svg";
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

  const handleLogout = () => {
    setIsOpen(false);
    signOutUser(navigate);
  };
  const handleLogin = () => {
    setIsOpen(false);
    signInWithGoogle(navigate);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserRole(userSnap.data().role);
        }
      } else {
        setUserRole(null);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <nav
      className="sticky top-0 z-50 w-full mx-auto px-4 py-4 shadow-sm border-b border-[#1f1f1f]"
      style={{ backgroundColor: "var(--color-bg-base)" }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/">
          <img className="w-24" src={logo} alt="SATX Ink Logo" />
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
            About
          </Link>

          {userRole === "artist" && (
            <Link
              to="/client-posts"
              className="text-neutral-300 hover:text-white transition duration-250 bg-[var(--color-bg-card)] p-3"
            >
              Client Posts
            </Link>
          )}

          {user ? (
            <Link to="/dashboard">
              <img
                src={user?.photoURL || "/fallback-avatar.jpg"}
                alt="User Avatar"
                className="w-10 h-10 rounded-full border border-white cursor-pointer"
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
                className="text-white hover:text-orange-400 bg-[var(--color-bg-card)]"
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
        className={`fixed inset-0 z-50 bg-black/70 transition-opacity duration-300 flex justify-end ${
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className={`w-[80%] max-w-xs h-full bg-[#0e0e0e] p-6 shadow-xl relative transition-transform duration-300 ease-in-out ${
            isOpen ? "translate-x-0" : "translate-x-[100%]"
          }`}
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
                src={user?.photoURL || "/fallback-avatar.jpg"}
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
            {user && userRole === "artist" && (
              <Link
                to="/client-posts"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 hover:text-orange-400"
              >
                <Home size={18} /> Client Posts
              </Link>
            )}
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
