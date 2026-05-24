import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Compass,
  Heart,
  MessageSquareText,
  Search,
  Sparkles,
} from "lucide-react";

import { GoogleSignupButton } from "../components/GoogleSignupButton";
import logo from "../assets/satx-short-sep.svg";

const clientBenefits = [
  {
    title: "Discover better matches",
    body: "Tell us what you like so SATX Ink can surface artists, flash, and tagged work that fit your taste.",
    icon: Search,
  },
  {
    title: "Save the right artists",
    body: "Follow artists, keep references close, and come back when the idea is ready.",
    icon: Heart,
  },
  {
    title: "Book when it makes sense",
    body: "Request custom work or claim flash. Payments happen later when you accept an offer.",
    icon: MessageSquareText,
  },
];

const ClientSignupPage = ({ onBack }: { onBack?: () => void }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    navigate("/signup");
  };

  return (
    <div data-aos="fade-up" className="w-full px-4 pb-24 pt-4 text-white">
      <div className="mx-auto w-full max-w-6xl">
        <button
          type="button"
          onClick={handleBack}
          className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch">
          <div className="rounded-lg border border-white/10 bg-[#121212]/90 p-6 text-left shadow-2xl shadow-black/30 backdrop-blur md:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                <Compass size={20} aria-hidden="true" />
              </span>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Client signup
              </p>
            </div>

            <h1 className="mt-5 flex flex-wrap items-center gap-2 text-3xl! font-semibold leading-tight text-white md:text-4xl!">
              <span>Join</span>
              <img
                src={logo}
                alt="SATX Ink logo"
                className="max-w-[108px] translate-y-[-2px] md:max-w-[124px]"
              />
              <span>as a Client</span>
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-300 md:text-base">
              Build a taste profile for your next tattoo. We will use your
              style picks, interests, and inspiration tags to make browsing feel
              more personal as artists add more work to SATX Ink.
            </p>

            <div className="mt-7 flex flex-col gap-4 border-y border-white/10 py-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">
                  Start with Google
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  No Stripe setup. No payment step. Just your client profile.
                </p>
              </div>
              <GoogleSignupButton role="client" />
            </div>

            <p className="mt-4 max-w-xl text-xs! leading-5 text-neutral-500!">
              We only collect your name, profile picture, and email from Google
              to set up your account. By signing up, you agree to our{" "}
              <Link
                to="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition hover:text-white"
              >
                Terms
              </Link>
              .
            </p>
          </div>

          <aside className="rounded-lg border border-white/10 bg-[#101010]/95 p-5 shadow-2xl shadow-black/20 backdrop-blur">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-[var(--color-primary)]">
                <Sparkles size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">
                  What happens next
                </p>
                <p className="text-xs text-neutral-500">
                  A short discovery setup
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {clientBenefits.map((benefit) => {
                const BenefitIcon = benefit.icon;

                return (
                  <div key={benefit.title} className="flex gap-3">
                    <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5 text-neutral-200">
                      <BenefitIcon size={16} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {benefit.title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-neutral-400">
                        {benefit.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
};

export default ClientSignupPage;
