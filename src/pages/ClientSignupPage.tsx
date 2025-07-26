// pages/ClientSignupPage.tsx
import { GoogleSignupButton } from "../components/GoogleSignupButton";
import logo from "../assets/satx-short-sep.svg";

const ClientSignupPage = ({ onBack }: { onBack: () => void }) => {
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
        <h1 className="flex items-center justify-center flex-wrap text-3xl! md:text-4xl!  gap-2 mb-1 leading-tight font-light!">
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
        <p className="text-sm text-neutral-500! mt-4 mb-8">
          We’ll use your Google info to create your account. You can complete
          your profile afterward.
        </p>

        {/* Divider Section */}
        <div className="mt-12 border-t border-neutral-700! pt-8 text-left">
          <h2 className="text-2xl font-semibold text-white mb-4">
            How it works
          </h2>
          <ul className="space-y-3 text-neutral-400! text-base list-disc list-inside">
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
