import { Link } from "react-router-dom";
import logo from "../assets/satxlogo.svg";
import { signInWithGoogle, signOutUser, auth } from "../firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

export const Navbar = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(auth.currentUser);
  const [userRole, setUserRole] = useState<"artist" | "client" | null>(null);

  const handleLogout = () => {
    setIsOpen(false); // close mobile nav
    signOutUser(navigate); // 👈 pass navigate into the function
  };
  const handleLogin = () => {
    setIsOpen(false); // close mobile nav first
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
      className="sticky top-0 z-50 w-full  mx-auto px-4 py-4 shadow-sm border-b border-[#1f1f1f]"
      style={{ backgroundColor: "var(--color-bg-base)" }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/">
          <img className="w-25" src={logo} alt="SATX Ink Logo" />
        </Link>

        {/* Desktop nav */}
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
          {/* Only visible if user is an artist */}
          {userRole === "artist" && (
            <Link
              to="/client-posts"
              className="text-neutral-300 hover:text-white transition duration-250 bg-[var(--color-bg-card)] p-3"
            >
              Client Posts
            </Link>
          )}
          {user && (
            <div className="relative group">
              <Link to="/dashboard">
                <img
                  src={user?.photoURL || "/fallback-avatar.jpg"}
                  alt="User Avatar"
                  className="w-10 h-10 rounded-full cursor-pointer"
                />
              </Link>
            </div>
          )}

          {!user && (
            <>
              <Link
                to="/signup"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
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

        {/* Mobile menu button */}
        <button
          className="md:hidden text-white focus:outline-none"
          onClick={() => setIsOpen(!isOpen)}
        >
          ☰
        </button>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="mt-4 md:hidden flex flex-col gap-4 text-sm px-2 pb-4">
          {user ? (
            <>
              {userRole === "artist" && (
                <Link
                  to="/client-posts"
                  onClick={() => setIsOpen(false)}
                  className="text-white hover:text-orange-400"
                >
                  Client Posts
                </Link>
              )}

              <Link
                to="/dashboard"
                onClick={() => setIsOpen(false)}
                className="text-white hover:text-orange-400"
              >
                Dashboard
              </Link>

              <button
                onClick={handleLogout}
                className="text-left text-white hover:text-red-400"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/signup"
                onClick={() => {
                  setIsOpen(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="text-white hover:text-orange-400"
              >
                Signup
              </Link>

              <button
                onClick={() => {
                  setIsOpen(false);
                  handleLogin();
                }}
                className="text-left text-white hover:text-orange-400"
              >
                Login
              </button>
            </>
          )}
          <Link
            to="/artists"
            onClick={() => setIsOpen(false)}
            className="text-white hover:text-orange-400"
          >
            Artists
          </Link>
          <Link
            to="/about"
            onClick={() => setIsOpen(false)}
            className="text-white hover:text-orange-400"
          >
            About
          </Link>
        </div>
      )}
    </nav>
  );
};
