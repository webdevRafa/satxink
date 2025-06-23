import { Link } from "react-router-dom";
import logo from "../assets/satxlogo.svg";
import { signInWithGoogle, signOutUser, auth } from "../firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  return (
    <nav
      className="sticky top-0 z-50 w-full px-4 py-4 shadow-sm border-b border-[#1f1f1f]"
      style={{ backgroundColor: "var(--color-bg-base)" }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/">
          <img className="w-25" src={logo} alt="SATX Ink Logo" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          <Link to="/artists" className="text-white hover:text-orange-400">
            Artists
          </Link>
          <Link to="/client-posts" className="text-white hover:text-orange-400">
            Client Posts
          </Link>
          <Link to="/about" className="text-white hover:text-orange-400">
            About
          </Link>

          {user && (
            <>
              <Link
                to="/artist-dashboard"
                className="text-white hover:text-orange-400"
              >
                Artist Dashboard
              </Link>
              <Link
                to="/client-dashboard"
                className="text-white hover:text-orange-400"
              >
                Client Dashboard
              </Link>
              {user && (
                <div className="relative group">
                  <Link to="/client-dashboard">
                    <img
                      src={user?.photoURL || "/fallback-avatar.jpg"}
                      alt="User Avatar"
                      className="w-10 h-10 rounded-full cursor-pointer"
                    />
                  </Link>
                </div>
              )}
            </>
          )}

          {!user && (
            <>
              <Link
                to="/signup/client"
                className="text-white hover:text-orange-400"
              >
                Join as Client
              </Link>
              <button
                onClick={signInWithGoogle}
                className="text-white hover:text-orange-400"
              >
                Login
              </button>
              <Link
                to="/signup"
                className="ml-4 px-5 py-2 rounded-md font-medium transition text-sm"
                style={{
                  backgroundColor: "var(--color-primary)",
                  color: "white",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-primary-hover)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-primary)")
                }
              >
                Join as Artist
              </Link>
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
          <Link to="/artists" className="text-white hover:text-orange-400">
            Artists
          </Link>
          <Link to="/client-posts" className="text-white hover:text-orange-400">
            Client Posts
          </Link>
          <Link to="/about" className="text-white hover:text-orange-400">
            About
          </Link>

          {user ? (
            <>
              <Link
                to="/artist-dashboard"
                className="text-white hover:text-orange-400"
              >
                Artist Dashboard
              </Link>
              <Link
                to="/client-dashboard"
                className="text-white hover:text-orange-400"
              >
                Client Dashboard
              </Link>
              <button
                onClick={signOutUser}
                className="text-left text-white hover:text-red-400"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/signup/client"
                className="text-white hover:text-orange-400"
              >
                Join as Client
              </Link>
              <button
                onClick={signInWithGoogle}
                className="text-left text-white hover:text-orange-400"
              >
                Login
              </button>
              <Link
                to="/signup"
                className="px-4 py-2 mt-2 rounded-md font-medium text-white text-center"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                Join as Artist
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
};
