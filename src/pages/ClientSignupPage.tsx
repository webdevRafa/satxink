// pages/ClientSignupPage.tsx
import { GoogleSignupButton } from "../components/GoogleSignupButton";
import logo from "../assets/satx-short-sep.svg";

const ClientSignupPage = ({ onBack }: { onBack: () => void }) => {
  return (
    <div
      data-aos="fade-in"
      className="min-h-screen text-white flex items-center justify-center px-4"
    >
      <div className="max-w-2xl w-full text-center">
        <button
          onClick={onBack}
          className="self-start mb-6 text-zinc-400 hover:text-white text-sm underline"
        >
          ← Back
        </button>

        {/* Headline */}
        <h1 className="flex items-center justify-center flex-wrap text-4xl md:text-5xl font-bold gap-3 mb-4 leading-tight">
          <span>Join</span>
          <img
            src={logo}
            alt="SATX Ink logo"
            className="max-w-[90px] inline-block"
          />
          <span>as a Client</span>
        </h1>

        {/* Description */}
        <p className="text-zinc-300 text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed">
          Find the right tattoo artist for your vision. Sign up to post your
          ideas, message artists, and explore styles — all in one place.
        </p>

        {/* Google Signup */}
        <GoogleSignupButton role="client" />

        {/* Subtext */}
        <p className="text-sm text-zinc-500 mt-4 mb-8">
          We’ll use your Google info to create your account. You can complete
          your profile afterward.
        </p>

        {/* Divider Section */}
        <div className="mt-12 border-t border-zinc-700 pt-8 text-left">
          <h2 className="text-2xl font-semibold text-white mb-4">
            How it works
          </h2>
          <ul className="space-y-3 text-zinc-400 text-base list-disc list-inside">
            <li>Sign up with Google</li>
            <li>Complete your profile (bio, location, inspiration pics)</li>
            <li>Browse tattoo artists by style & location</li>
            <li>Send booking requests or DM your favorite artists</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ClientSignupPage;
