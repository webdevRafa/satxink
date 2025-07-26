// pages/ClientSignupPage.tsx
import { GoogleSignupButton } from "../components/GoogleSignupButton";
import logo from "../assets/satx-short-sep.svg";
import { Link } from "react-router-dom";

const ClientSignupPage = ({ onBack }: { onBack?: () => void }) => {
  return (
    <div
      data-aos="fade-up"
      className="min-h-screen text-white flex items-center justify-center px-4"
    >
      <div className="max-w-2xl w-full text-center">
        <button
          onClick={onBack}
          className="self-start mb-1 text-neutral-500! hover:text-white! text-sm underline"
        >
          ← Back
        </button>

        {/* Headline */}
        <h1 className="flex items-center justify-center flex-wrap text-3xl! gap-2 mb-1 leading-tight font-light!">
          <span>Join</span>
          <img
            src={logo}
            alt="SATX Ink logo"
            className="max-w-[90px] inline-block"
          />
          <span>as a client</span>
        </h1>

        {/* Description */}
        <p className="text-neutral-300! text-lg! md:text-xl! max-w-xl mx-auto mb-10 leading-relaxed">
          Find the right tattoo artist for your vision. Sign up to post your
          ideas, message artists, and explore styles — all in one place.
        </p>

        {/* Google Signup */}
        <GoogleSignupButton role="client" />

        {/* Subtext */}
        <p className="text-xs! text-neutral-400! mt-2! max-w-[300px] mx-auto text-center">
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

        {/* Divider Section */}
        <div className="mt-12 border-t border-neutral-700 pt-8 text-left">
          <h2 className="text-2xl font-semibold text-white mb-4">
            How it works
          </h2>
          <ul className="space-y-4 text-neutral-400 text-base list-none list-inside">
            <li>
              <span className="text-white font-medium">
                Sign up with Google
              </span>{" "}
              — get started instantly with one click, no forms or passwords.
            </li>
            <li>
              <span className="text-white font-medium">
                Set up your profile
              </span>{" "}
              — share your style preferences, location, and inspiration pics so
              artists know exactly what you’re looking for.
            </li>
            <li>
              <span className="text-white font-medium">Discover artists</span> —
              browse by style, explore portfolios, and follow your favorites.
            </li>
            <li>
              <span className="text-white font-medium">Request & book</span> —
              post your idea, receive offers from artists, and accept or decline
              with a single click. Booking is simple and stress‑free.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ClientSignupPage;
