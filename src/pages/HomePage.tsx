import { HeroSection } from "../components/HeroSection";
import { BrowseByStyle } from "../components/BrowseByStyle";
import { useNavigate } from "react-router-dom";

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <>
      <div>
        <HeroSection />
        <div className="bg-[#121212] text-white">
          {/* Hero Section */}
          <section className="relative bg-gradient-to-b from-[#1a1a1a] via-[#121212] to-[#0f0f0f] text-center py-28">
            <h1 className="text-5xl font-bold mb-4">
              Find Your Next Tattoo Artist in San Antonio
            </h1>
            <p className="max-w-2xl mx-auto text-gray-400 text-lg mb-8">
              Discover artists by style, browse custom flash, and book your next
              session — all in one place.
            </p>
            <button
              onClick={() => navigate("/artists")}
              className="px-6 py-3 bg-white text-black rounded-full text-lg font-medium hover:bg-gray-200 transition"
            >
              Start Browsing
            </button>
          </section>

          {/* How It Works */}
          <section className="py-20 max-w-6xl mx-auto px-6 text-center space-y-12">
            <h2 className="text-3xl font-bold mb-8">How SATX Ink Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <div className="p-6 bg-[#1a1a1a] rounded-xl shadow hover:shadow-lg transition">
                <h3 className="text-xl font-semibold mb-3">
                  1. Browse Artists
                </h3>
                <p className="text-gray-400">
                  Search by style, location, or tags to find the perfect artist
                  for your next tattoo.
                </p>
              </div>
              <div className="p-6 bg-[#1a1a1a] rounded-xl shadow hover:shadow-lg transition">
                <h3 className="text-xl font-semibold mb-3">
                  2. Explore the Flash Marketplace
                </h3>
                <p className="text-gray-400">
                  See pre-drawn flash from artists across San Antonio, ready to
                  claim and book instantly.
                </p>
              </div>
              <div className="p-6 bg-[#1a1a1a] rounded-xl shadow hover:shadow-lg transition">
                <h3 className="text-xl font-semibold mb-3">3. Book Easily</h3>
                <p className="text-gray-400">
                  Request a tattoo, get offers, and pay securely — all handled
                  through SATX Ink.
                </p>
              </div>
            </div>
          </section>

          {/* Browse by Style */}
          <BrowseByStyle />

          {/* Flash Marketplace Preview */}
          <section className="py-16 max-w-6xl mx-auto px-6">
            <h2 className="text-3xl font-bold mb-6">Flash Marketplace</h2>
            <p className="text-gray-400 max-w-2xl mb-8">
              Claim unique flash designs from top artists — ready for your next
              appointment.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Placeholder images until dynamic data */}
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="bg-[#1c1c1c] rounded-lg h-52 shadow hover:shadow-lg transition"
                >
                  <div className="h-full flex items-center justify-center text-gray-500">
                    Flash {i}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <button
                onClick={() => navigate("/artists")}
                className="px-5 py-2 bg-white text-black rounded-full font-medium hover:bg-gray-200 transition"
              >
                Browse Flashes
              </button>
            </div>
          </section>

          {/* Booking Made Simple */}
          <section className="py-20 bg-[#1a1a1a] text-center px-6">
            <h2 className="text-3xl font-bold mb-4">Booking, Simplified</h2>
            <p className="max-w-2xl mx-auto text-gray-400 mb-8">
              No endless messaging or scheduling headaches. Post your request,
              get offers from artists, and book online with confidence.
            </p>
            <button
              onClick={() => navigate("/dashboard")}
              className="px-6 py-3 bg-white text-black rounded-full text-lg font-medium hover:bg-gray-200 transition"
            >
              Post a Tattoo Request
            </button>
          </section>

          {/* Artist Signup CTA */}
        </div>
      </div>
    </>
  );
};
