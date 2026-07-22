import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, MessageSquareText, Search } from "lucide-react";

import { AuthProviderSignupButtons } from "../components/GoogleSignupButton";
import { ViewportReveal } from "../components/ViewportReveal";
import logo from "../assets/satx-short-sep.svg";

const clientBenefits = [
  {
    title: "Discover better matches",
    body: "Find artists based on the style you're looking for.",
    icon: Search,
  },
  {
    title: "Keep up with your favorite artists",
    body: "Follow artists and get notified when they drop new flash.",
    icon: Heart,
  },
  {
    title: "Simplified booking",
    body: "Request custom work/flash. SATX Ink makes booking incredibly simple and organized. From the idea to the ink.",
    icon: MessageSquareText,
  },
];

type ClientSignupBenefit = (typeof clientBenefits)[number];

const ClientSignupBenefitSection = ({
  benefit,
}: {
  benefit: ClientSignupBenefit;
}) => {
  const BenefitIcon = benefit.icon;

  return (
    <article className="group relative grid gap-4 border-t border-white/10 py-8 text-left sm:grid-cols-[92px_minmax(0,1fr)] sm:gap-8 md:py-10">
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
    </article>
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
            className="mt-12 w-full max-w-2xl  pt-10 md:mt-16 md:pt-12"
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
              Easily signup using Google or Apple
            </p>

            <div className="mt-7 flex justify-center">
              <AuthProviderSignupButtons role="client" />
            </div>

            <p className="mx-auto mt-6  text-xs! leading-5 text-neutral-500!">
              We only use the name, email and avatar from your sign-in provider
              to set up your account. For more information, please view our
              &nbsp;
              <Link
                to="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition hover:text-white"
              >
                Terms
              </Link>
              &nbsp; and &nbsp;
              <Link
                to="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition hover:text-white"
              >
                Privacy Policy
              </Link>
            </p>
          </ViewportReveal>

          <div className="mt-12 w-full max-w-3xl md:mt-16">
            {clientBenefits.map((benefit) => (
              <ClientSignupBenefitSection
                key={benefit.title}
                benefit={benefit}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ClientSignupPage;
