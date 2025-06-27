import { Link } from "react-router-dom";
import backgroundImage from "../assets/images/darkblurhero.webp"; // use your preferred image

export const HeroSection = () => {
  return (
    <section
      className="relative h-[90vh] flex items-center justify-center text-center px-4 bg-fixed"
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
            className="px-6 py-3 text-white! transition duration-300 hover:text-[#121212]! border-2 border-neutral-300 hover:bg-neutral-300 rounded"
          >
            Find an Artist
          </Link>
        </div>
      </div>
    </section>
  );
};
