import { useState } from "react";
import { GoogleSignupButton } from "../components/GoogleSignupButton";
import logo from "../assets/satx-short-sep.svg";
import { Link } from "react-router-dom";

const ClientSignupPage = ({ onBack }: { onBack?: () => void }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div
      data-aos="fade-up"
      className="min-h-screen text-white flex items-center justify-center px-4"
    >
      <div className="max-w-2xl w-full text-center">
        <button
          onClick={onBack}
          className="self-start mb-1 text-neutral-500! hover:text-white! text-sm! underline"
        >
          ← Back
        </button>

        {/* Headline */}
        <h1 className="flex items-center justify-center flex-wrap text-2xl! gap-2 mb-1 leading-tight font-light!">
          <span>Join</span>
          <img
            src={logo}
            alt="SATX Ink logo"
            className="max-w-[90px] inline-block translate-y-[-2px]"
          />
          <span>as a client</span>
        </h1>

        {/* Description */}
        <p className="text-neutral-300 text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed">
          Find the right tattoo artist for your vision. Sign up to post your
          ideas, message artists, and explore styles — all in one place.
        </p>

        {/* Google Signup */}
        <GoogleSignupButton role="client" />

        {/* Subtext */}
        <p className="text-xs! text-neutral-400! mt-2 max-w-[300px] mx-auto text-center">
          We only collect your name, profile picture, and email from Google to
          set up your account. By signing up, you agree to our{" "}
          <Link
            to="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white transition"
          >
            Terms
          </Link>
          .
        </p>
        <div className="hidden md:block   p-6 text-left">
          <h2 className="text-lg font-semibold text-white">How it works</h2>

          <ul className="space-y-4 text-neutral-400 text-xs! list-none">
            <li>
              <span className="text-white">Sign up with Google</span> — get
              started instantly with one click, no forms or passwords.
            </li>
            <li>
              <span className="text-white">Set up your profile</span> — share
              your style preferences, location, and inspiration pics so artists
              know exactly what you’re looking for.
            </li>
            <li>
              <span className="text-white">Discover artists</span> — browse by
              style, explore portfolios, and follow your favorites.
            </li>
            <li>
              <span className="text-white">Request & book</span> — post your
              idea, receive offers from artists, and accept or decline with a
              single click. Booking is simple and stress‑free.
            </li>
          </ul>
        </div>
        {/* Button to open modal */}
        <div className="block md:hidden mt-8 text-center">
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-sm text-white underline hover:text-neutral-300 transition"
          >
            How it works
          </button>
        </div>

        {/* Modal */}
        {isModalOpen && (
          <div
            data-aos="zoom-in"
            className="fixed inset-0 z-50 flex items-center justify-center bg-opacity-70 px-4"
          >
            <div className="bg-gradient-to-br from-[var(--color-bg-footer)] via-[var(--color-bg-card)] to-[var(--color-bg-footer)] rounded-lg shadow-lg max-w-xl w-full py-20 overflow-y-auto p-6 text-left">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-white">
                  How it works
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-neutral-400 hover:text-white text-lg"
                >
                  ✕
                </button>
              </div>
              <ul className="space-y-4 text-neutral-400 text-sm list-none">
                <li>
                  <span className="text-white">Sign up with Google</span> — get
                  started instantly with one click, no forms or passwords.
                </li>
                <li>
                  <span className="text-white">Set up your profile</span> —
                  share your style preferences, location, and inspiration pics
                  so artists know exactly what you’re looking for.
                </li>
                <li>
                  <span className="text-white">Discover artists</span> — browse
                  by style, explore portfolios, and follow your favorites.
                </li>
                <li>
                  <span className="text-white">Request & book</span> — post your
                  idea, receive offers from artists, and accept or decline with
                  a single click. Booking is simple and stress‑free.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientSignupPage;
