// pages/ClientSignupPage.tsx
import { GoogleSignupButton } from "../components/GoogleSignupButton";
import logo from "../assets/logo.svg";

const ClientSignupPage = () => {
  return (
    <div className="min-h-screen  text-white flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <h1 className="flex items-center justify-center flex-wrap text-4xl md:text-5xl font-bold mb-6 gap-2 text-center">
          <span>Join</span>
          <img
            src={logo}
            alt="SATX Ink logo"
            className="max-w-[100px] inline-block"
          />
          <span>as a Client</span>
        </h1>
        <p className="text-zinc-300 mb-8 text-lg">
          Find the right tattoo artist for your vision. Sign up to post your
          ideas, message artists, and explore styles.
        </p>

        <GoogleSignupButton />

        <p className="text-sm text-zinc-500 mt-4">
          We’ll use your Google info to create your account. You can complete
          your profile afterward.
        </p>

        <div className="mt-10 border-t border-zinc-700 pt-6 text-left">
          <h2 className="text-xl font-semibold mb-3">How it works</h2>
          <ul className="space-y-2 text-zinc-400 list-disc list-inside">
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
