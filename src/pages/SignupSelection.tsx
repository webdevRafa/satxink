import { useEffect, useState } from "react";
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
            <div className="mx-auto max-w-2xl lg:mb-20">
              <h1 className="font-termina text-3xl font-bold leading-tight text-white ">
                San Antonio's Tattoo Hub.
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-neutral-200! md:text-base">
                Start with the side of SATX Ink you need today. Clients get a
                tailored discovery setup, while artists build the profile people
                browse before they book.
              </p>
            </div>

            <div className="mt-9 grid gap-4 text-left md:grid-cols-2 px-2 md:px-5">
              {roleCards.map((card) => {
                return (
                  <button
                    key={card.role}
                    type="button"
                    onClick={() => setSelectedRole(card.role)}
                    className="group rounded-lg border border-white/10 bg-[#121212]/55 p-5 text-left shadow-2xl shadow-black/20 backdrop-blur transition hover:border-white/25 hover:bg-[#171717]/95"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="mt-5 text-xs uppercase tracking-[0.18em] text-neutral-500">
                          {card.eyebrow}
                        </p>
                        <h2 className="mt-2 text-2xl! font-semibold text-white">
                          {card.title}
                        </h2>
                        <p className="mt-3 min-h-16 text-sm leading-6 text-neutral-400">
                          {card.body}
                        </p>
                      </div>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-neutral-300 transition group-hover:border-white group-hover:bg-white group-hover:text-[#0b0b0b]">
                        <ArrowRight
                          className="w-[40px]"
                          size={17}
                          aria-hidden="true"
                        />
                      </span>
                    </div>
                  </button>
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
