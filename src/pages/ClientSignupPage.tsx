import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, MessageSquareText, Search } from "lucide-react";

import { AuthProviderSignupButtons } from "../components/GoogleSignupButton";
import { ViewportReveal } from "../components/ViewportReveal";
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
    body: "Request custom work, claim flash, and keep your tattoo ideas organized as you find the right artist.",
    icon: MessageSquareText,
  },
];

type ClientSignupBenefit = (typeof clientBenefits)[number];

const ClientSignupRevealSection = ({
  benefit,
  index,
}: {
  benefit: ClientSignupBenefit;
  index: number;
}) => {
  const BenefitIcon = benefit.icon;
  const directions = ["left", "right", "up"] as const;

  return (
    <ViewportReveal
      className="group relative grid gap-4 border-t border-white/10 py-8 text-left sm:grid-cols-[92px_minmax(0,1fr)] sm:gap-8 md:py-10"
      delay={260 + index * 140}
      direction={directions[index] ?? "up"}
    >
      <div className="flex items-center gap-3 sm:block">
        <span className="mt-0 inline-flex text-neutral-500 transition duration-500 group-hover:text-neutral-200 sm:mt-5">
          <BenefitIcon size={21} aria-hidden="true" />
        </span>
      </div>

      <div>
        <h2 className="text-xl! font-bold leading-tight text-white sm:text-2xl!">
          {benefit.title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-300! sm:text-base">
          {benefit.body}
        </p>
      </div>

      <span
        className="pointer-events-none absolute left-0 top-0 h-px w-36 bg-gradient-to-r from-[var(--color-primary)] via-white/50 to-transparent opacity-100 transition-all duration-700"
        aria-hidden="true"
      />
    </ViewportReveal>
  );
};

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
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center py-8 text-center md:py-14 lg:py-16">
          <ViewportReveal delay={40} direction="up">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back
            </button>
          </ViewportReveal>

          <ViewportReveal
            className="mt-0 max-w-3xl md:mt-5"
            delay={120}
            direction="up"
          >
            <h1 className="font-termina text-4xl! font-bold leading-[0.95] text-white">
              Find the right artist for your next tattoo.
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-neutral-300">
              Browse real artist work, compare styles, and request your next
              tattoo with less guesswork.
            </p>
          </ViewportReveal>

          <ViewportReveal
            className="mt-12 w-full max-w-2xl border-t border-white/10 pt-10 md:mt-16 md:pt-12"
            delay={720}
            direction="up"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Browse / book
            </p>
            <h2 className="mt-4 flex flex-wrap items-center justify-center gap-2 text-3xl! font-semibold leading-tight text-white sm:text-4xl!">
              <span>Join</span>
              <img
                src={logo}
                alt="SATX Ink logo"
                className="max-w-[112px] translate-y-[-2px]"
              />
              <span>as a Client</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-neutral-400 sm:text-base">
              Start with Google or Apple, then create a short taste profile so
              SATX Ink can make browsing feel more personal.
            </p>

            <div className="mt-7 flex justify-center">
              <AuthProviderSignupButtons role="client" />
            </div>

            <p className="mx-auto mt-6 max-w-md text-xs! leading-5 text-neutral-500!">
              We use the name and email from your sign-in provider to set up
              your account. By signing up, you agree to our{" "}
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
          </ViewportReveal>

          <div className="mt-12 w-full max-w-3xl md:mt-16">
            {clientBenefits.map((benefit, index) => (
              <ClientSignupRevealSection
                key={benefit.title}
                benefit={benefit}
                index={index}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ClientSignupPage;
