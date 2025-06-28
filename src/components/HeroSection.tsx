import { Link } from "react-router-dom";
import backgroundImage from "../assets/images/darkblurhero.webp";
import { useState } from "react";

export const HeroSection = () => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section className="relative h-[90vh] overflow-hidden flex items-center justify-center text-center px-4 bg-black">
      {/* Background Image Layer */}
      <div
        className="absolute inset-0 bg-center bg-cover bg-no-repeat z-0"
        style={{
          backgroundImage: `url(${backgroundImage})`,
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
        <h1
          data-aos="fade-in"
          className="text-3xl md:text-4xl font-semibold mb-4"
        >
          Connecting You to San Antonio’s Best Tattoo Artists
        </h1>
        <p data-aos="fade-in" className="text-base text-gray-300 mb-6">
          Browse portfolios, post your idea, and find your perfect match.
        </p>
        <div className="flex flex-col md:flex-row justify-center gap-4">
          <Link
            to="/artists"
            data-aos="fade-in"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="px-6 py-3 text-white max-w-[300px] group mx-auto transition duration-350 border-2 border-neutral-600 hover:border-white hover:bg-[#111111] rounded"
          >
            Find an Artist
          </Link>
        </div>
      </div>
    </section>
  );
};
