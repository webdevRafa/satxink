import { useEffect, useRef, useState } from "react";
import { ArrowRight, Brush, UserRound } from "lucide-react";

import ClientSignupPage from "./ClientSignupPage";
import ArtistSignupPage from "./ArtistSignupPage";

const videoSrc =
  "https://player.vimeo.com/progressive_redirect/playback/1104639139/rendition/1080p/file.mp4?loc=external&oauth2_token_id=1797553058&signature=aa6c80a11fddadd4e21ba35033d40c97f9ab557b80a6b60bdf47ddf6c64f5e50";

const roleCards = [
  {
    role: "client" as const,
    title: "I am a Client",
    body: "Find artists, save flash, and build a taste profile that helps SATX Ink show you better matches.",
    eyebrow: "Browse and book",
    icon: UserRound,
    highlights: ["Local flash", "Community art"],
  },
  {
    role: "artist" as const,
    title: "I am an Artist",
    body: "Get discovered by local clients, showcase your work, and make it easier for people to connect with you.",
    eyebrow: "Get listed",
    icon: Brush,
    highlights: ["Get discovered", "Connect with clients"],
  },
];

type RevealDirection = "up" | "left" | "right";

type SignupRevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: RevealDirection;
};

const getHiddenTransform = (direction: RevealDirection) => {
  if (direction === "left") return "translate3d(-18px, 18px, 0) scale(0.985)";
  if (direction === "right") return "translate3d(18px, 18px, 0) scale(0.985)";
  return "translate3d(0, 24px, 0) scale(0.99)";
};

const SignupReveal = ({
  children,
  className = "",
  delay = 0,
  direction = "up",
}: SignupRevealProps) => {
  const revealRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = revealRef.current;
    if (!element) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.2,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={revealRef}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? "translate3d(0, 0, 0) scale(1)"
          : getHiddenTransform(direction),
        filter: isVisible ? "blur(0px)" : "blur(10px)",
        transitionProperty: "opacity, transform, filter",
        transitionDuration: "850ms",
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: isVisible ? "auto" : "opacity, transform, filter",
      }}
    >
      {children}
    </div>
  );
};

export default function SignupSelection() {
  const [selectedRole, setSelectedRole] = useState<"client" | "artist" | null>(
    null
  );

  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };
    setVh();
    window.addEventListener("resize", setVh);
    return () => window.removeEventListener("resize", setVh);
  }, []);

  const handleBack = () => setSelectedRole(null);

  return (
    <div className="relative flex min-h-screen w-screen items-center justify-center overflow-x-hidden text-white">
      <video
        src={videoSrc}
        autoPlay
        muted
        loop
        playsInline
        className="fixed inset-0 h-screen w-full object-cover"
        style={{ minWidth: "100vw", minHeight: "100vh" }}
      />
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" />

      <div className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-4 py-24 text-center">
        {!selectedRole && (
          <section className="w-full max-w-5xl mt-25">
            <SignupReveal
              className="mx-auto max-w-2xl lg:mb-20"
              delay={80}
              direction="up"
            >
              <h1 className="font-termina text-3xl font-bold leading-tight text-white ">
                San Antonio's Tattoo Hub.
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-neutral-200! md:text-base">
                Start with the side of SATX Ink you need today. Clients get a
                tailored discovery setup, while artists build the profile people
                browse before they book.
              </p>
            </SignupReveal>

            <div className="mt-9 grid gap-4 text-left md:grid-cols-2 px-2 md:px-5">
              {roleCards.map((card, index) => {
                return (
                  <SignupReveal
                    key={card.role}
                    delay={240 + index * 140}
                    direction={index === 0 ? "left" : "right"}
                    className="h-full"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedRole(card.role)}
                      className="group relative h-full w-full overflow-hidden rounded-lg border border-white/10 bg-[#121212]/55 p-5 text-left shadow-2xl shadow-black/20 backdrop-blur transition duration-500 hover:-translate-y-1 hover:border-white/25 hover:bg-[#171717]/95 hover:shadow-black/35"
                    >
                      <span
                        className="pointer-events-none absolute inset-x-4 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-[var(--color-primary)] via-white/40 to-transparent opacity-0 transition duration-700 group-hover:scale-x-100 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="mt-5 text-xs uppercase tracking-[0.18em] text-neutral-500 transition duration-500 group-hover:text-neutral-300">
                            {card.eyebrow}
                          </p>
                          <h2 className="mt-2 text-2xl! font-semibold text-white">
                            {card.title}
                          </h2>
                          <p className="mt-3 min-h-16 text-sm leading-6 text-neutral-400">
                            {card.body}
                          </p>
                        </div>
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-neutral-300 transition duration-500 group-hover:translate-x-0.5 group-hover:border-white group-hover:bg-white group-hover:text-[#0b0b0b]">
                          <ArrowRight
                            className="w-[40px]"
                            size={17}
                            aria-hidden="true"
                          />
                        </span>
                      </div>
                    </button>
                  </SignupReveal>
                );
              })}
            </div>
          </section>
        )}

        {selectedRole === "client" && (
          <div className="relative z-20 w-full max-w-7xl rounded-lg p-4">
            <ClientSignupPage onBack={handleBack} />
          </div>
        )}

        {selectedRole === "artist" && (
          <div className="relative z-20 w-full max-w-7xl rounded-lg p-4">
            <ArtistSignupPage onBack={handleBack} />
          </div>
        )}
      </div>
    </div>
  );
}
