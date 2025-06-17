// src/pages/ArtistsPage.tsx
import artist from "../assets/images/artist.jpg";
const artists = [
  {
    name: "Michael Rivera",
    style: "Black & Grey\nRealism",
    image: artist,
  },
  {
    name: "Jessica Chen",
    style: "Neo-Traditional\nBlackwork",
    image: artist,
  },
  {
    name: "Alex Torres",
    style: "Traditional\nJapanese",
    image: artist,
  },
  {
    name: "Sarah Martin",
    style: "Fine Line\nColor",
    image: artist,
  },
  {
    name: "Ana Lopez",
    style: "Blackwork\nOrnamental",
    image: artist,
  },
  {
    name: "Carlos Vega",
    style: "Color Realism",
    image: artist,
  },
];

export const ArtistsPage = () => {
  return (
    <main className="px-4 py-12 max-w-6xl mx-auto">
      <h1 className="text-3xl font-semibold text-white mb-2">
        All Tattoo Artists
      </h1>
      <p className="text-gray-400 mb-8">
        Discover talented artists from San Antonio, browse by style, and view
        their work.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {artists.map((artist, index) => (
          <div
            key={index}
            className="bg-[#1c1c1c] text-white rounded-xl overflow-hidden shadow-md"
          >
            <img
              src={artist.image}
              alt={artist.name}
              className="w-full h-52 object-cover"
            />
            <div className="p-4">
              <h3 className="text-base font-semibold">{artist.name}</h3>
              <p className="text-sm text-gray-400 whitespace-pre-line leading-tight">
                {artist.style}
              </p>
              <a
                href="#"
                className="block mt-4 bg-[#2c2c2c] hover:bg-[#3a3a3a] text-white text-sm py-2 rounded-md text-center transition"
              >
                View Portfolio
              </a>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
};
