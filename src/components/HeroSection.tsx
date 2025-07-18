import { Link } from "react-router-dom";
import backgroundImage from "../assets/images/satx-inked.webp";
import { useState } from "react";
import logo from "../assets/satx-short-sep.svg";

export const HeroSection = () => {
  const isIOS =
    typeof window !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream;

  const [isHovered, setIsHovered] = useState(false);

  return (
    <section className="relative h-[70vh] overflow-hidden flex items-center justify-center text-center px-4 bg-black">
      {/* Background Image Layer */}
      <div
        className="absolute inset-0 bg-center bg-cover bg-no-repeat z-0"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundAttachment: isIOS ? "scroll" : "fixed",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      />

      {/* Frosted Glass Effect Layer */}
      <div
        className={`absolute inset-0 z-10 transition-all duration-300 ${
          isHovered
            ? "bg-black/70 backdrop-blur-sm"
            : "bg-black/60 backdrop-blur-none"
        }`}
      />

      {/* Foreground Content */}
      <div className="relative z-20 max-w-3xl text-white">
        <img
          className="animate-pulse w-[90%] mx-auto max-w-[200px] mb-6"
          src={logo}
          alt=""
        />
        <h1 data-aos="fade-in" className="text-2xl! font-semibold mb-0">
          A marketplace for the culture.
        </h1>
        <p data-aos="fade-in" className="text-base text-gray-300 mb-6">
          Show love, drop ideas, and get inked.
        </p>
        <div className="flex flex-col md:flex-row justify-center gap-4">
          <Link
            to="/artists"
            data-aos="fade-in"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="p-2 text-white max-w-[300px] group mx-auto transition duration-350 border-2 border-neutral-600 hover:border-white hover:bg-[#111111] rounded"
          >
            Find an Artist
          </Link>
        </div>
      </div>
    </section>
  );
};
