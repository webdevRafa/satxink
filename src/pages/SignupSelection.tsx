import { useEffect, useState } from "react";
import logo from "../assets/satx-short-sep.svg";
import ClientSignupPage from "./ClientSignupPage";
import ArtistSignupPage from "./ArtistSignupPage";

const videoSrc =
  "https://player.vimeo.com/progressive_redirect/playback/1104639139/rendition/1080p/file.mp4?loc=external&oauth2_token_id=1797553058&signature=aa6c80a11fddadd4e21ba35033d40c97f9ab557b80a6b60bdf47ddf6c64f5e50";

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

  // Let user reset and go back to selection screen
  const handleBack = () => setSelectedRole(null);

  return (
    <div
      className="relative flex items-center justify-center w-screen overflow-hidden text-white"
      style={{ height: "calc(var(--vh, 1vh) * 100)" }}
    >
      {/* Background Video */}
      <video
        src={videoSrc}
        autoPlay
        muted
        loop
        playsInline
        className="absolute top-0 left-0 w-full h-full object-cover"
        style={{ minWidth: "100vw", minHeight: "100vh" }}
      />
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xs"></div>

      {/* Foreground Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-4 w-full">
        {!selectedRole && (
          <>
            {/* Selection Screen */}
            <img
              className="max-w-[210px] mb-2"
              src={logo}
              alt="SATX Ink logo"
            />
            <h2 className="text-2xl md:text-3xl font-light!">
              Your City. Your Ink. Your Platform.
            </h2>
            <p className="text-white! text-xl! font-light mt-8 mb-2">
              Pick your path
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setSelectedRole("client")}
                className="px-3! py-1! text-white text-sm! border-2 border-neutral-300 rounded hover:bg-neutral-300 hover:text-black transition"
              >
                I'm a Client
              </button>
              <button
                onClick={() => setSelectedRole("artist")}
                className="px-3! py-1! text-white text-sm! border-2 border-neutral-300 rounded hover:bg-neutral-300 hover:text-black transition"
              >
                I'm an Artist
              </button>
            </div>
          </>
        )}

        {selectedRole === "client" && (
          <div className="w-full max-w-3xl relative z-20 rounded-lg p-4">
            <ClientSignupPage onBack={handleBack} />
          </div>
        )}

        {selectedRole === "artist" && (
          <div className="w-full max-w-4xl relative z-20 rounded-lg p-4">
            <ArtistSignupPage onBack={handleBack} />
          </div>
        )}
      </div>
    </div>
  );
}
