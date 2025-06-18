// src/components/ArtistCard.tsx
interface ArtistCardProps {
  name: string;
  avatarUrl: string;
  specialties: string[];
}

const ArtistCard = ({ name, avatarUrl, specialties }: ArtistCardProps) => {
  return (
    <div className="bg-[#1c1c1c] text-white rounded-xl overflow-hidden shadow-md">
      <img
        src={avatarUrl || "/fallback.jpg"}
        alt={name}
        className="w-full h-52 object-cover"
      />
      <div className="p-4">
        <h3 className="text-base font-semibold">{name}</h3>
        <p className="text-sm text-gray-400 leading-tight">
          {specialties?.join(", ") || "No specialties listed"}
        </p>
        <a
          href="#"
          className="block mt-4 bg-[#2c2c2c] hover:bg-[#3a3a3a] text-white text-sm py-2 rounded-md text-center transition"
        >
          View Portfolio
        </a>
      </div>
    </div>
  );
};

export default ArtistCard;
