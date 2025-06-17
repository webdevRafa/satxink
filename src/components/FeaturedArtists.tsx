import artist from "../assets/images/artist.jpg";
const artists = [
  {
    name: "Michael Rivera",
    style: "Black & Grey\nRealism",
    image: artist, // replace with your actual path
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
];

export const FeaturedArtists = () => {
  return (
    <section
      data-aos="fade-up"
      className="px-4 py-12 max-w-6xl mx-auto bg-[#121212]"
    >
      <h2>Featured Artists</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mt-6">
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
    </section>
  );
};
