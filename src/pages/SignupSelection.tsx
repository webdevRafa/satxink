import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/satx-short-sep.svg";

const videoSrc =
  "https://player.vimeo.com/progressive_redirect/playback/1104639139/rendition/1080p/file.mp4?loc=external&oauth2_token_id=1797553058&signature=aa6c80a11fddadd4e21ba35033d40c97f9ab557b80a6b60bdf47ddf6c64f5e50";

export default function SignupSelection() {
  const navigate = useNavigate();

  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };
    setVh();
    window.addEventListener("resize", setVh);
    return () => window.removeEventListener("resize", setVh);
  }, []);

  return (
    <div
      className="relative flex items-center justify-center w-screen overflow-hidden text-white"
      style={{ height: "calc(var(--vh, 1vh) * 100)" }}
    >
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
      <div className="relative z-10 flex flex-col items-center text-center px-4">
        <img className="max-w-[220px]" src={logo} alt="SATX Ink logo" />
        <h2 className="text-md!">A marketplace for the culture.</h2>
        <h2 className="text-sm! text-neutral-300! my-10">
          How will you be using this platform?
        </h2>
        <div className="flex gap-4">
          <button
            onClick={() => navigate("/signup/client")}
            className="px-3! py-1! text-white border-2 border-neutral-300 rounded hover:bg-neutral-300 hover:text-black transition"
          >
            As a Client
          </button>
          <button
            onClick={() => navigate("/signup/artist")}
            className="px-3! py-1! text-white border-2 border-neutral-300 rounded hover:bg-neutral-300 hover:text-black transition"
          >
            As an Artist
          </button>
        </div>
      </div>
    </div>
  );
}
