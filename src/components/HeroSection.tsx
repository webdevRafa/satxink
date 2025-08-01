import { Link } from "react-router-dom";
import backgroundImage from "../assets/images/satx-inked.webp";
import { useState } from "react";

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
      <div className="relative z-20 max-w-3xl text-neutral-400">
        <div className="flex flex-col md:flex-row gap-2 items-start">
          <div>
            <h1 data-aos="fade-in" className="text-2xl!">
              Tap in with the city’s best.
            </h1>
            <p
              data-aos="fade-in"
              className=" text-gray-300 translate-y-[-5px] text-sm mb-6 text-left"
            >
              Search by style. Drop ideas. Book directly.
            </p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row justify-center gap-4">
          <Link
            to="/artists"
            data-aos="fade-in"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="p-2 text-neutral-200 max-w-[300px] border-2 border-neutral-300 group mx-auto transition duration-350   text-sm!"
          >
            Browse Artists
          </Link>
        </div>
      </div>
    </section>
  );
};
