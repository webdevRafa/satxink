import { Link } from "react-router-dom";
import backgroundImage from "../assets/images/tattoo-hero.jpg"; // use your preferred image

export const HeroSection = () => {
  return (
    <section
      className="relative h-[90vh] flex items-center justify-center text-center px-4"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      ></div>

      {/* Content */}
      <div className="relative z-10 max-w-3xl text-white">
        <h1
          data-aos="fade-down"
          className="text-3xl md:text-4xl font-semibold mb-4"
        >
          Connecting You to San Antonio’s Best Tattoo Artists
        </h1>
        <p data-aos="fade-right" className="text-base text-gray-300 mb-6">
          Browse portfolios, post your idea, and find your perfect match.
        </p>
        <div className="flex flex-col md:flex-row justify-center gap-4">
          <Link
            data-aos="fade-right"
            to="/artists"
            className="bg-[#b6382d] text-white px-6 py-3 rounded-md font-medium hover:bg-[#a53228] transition"
          >
            Browse Artists
          </Link>
        </div>
      </div>
    </section>
  );
};
