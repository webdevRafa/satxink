// src/components/ArtistCard.tsx
interface ArtistCardProps {
  name: string;
  avatarUrl: string;
  specialties: string[];
}

const ArtistCard = ({ name, avatarUrl, specialties }: ArtistCardProps) => {
  return (
    <div className="bg-[#1c1c1c] text-white rounded-xl  shadow-md flex flex-row items-start md:items-center">
      <img
        src={avatarUrl || "/fallback.jpg"}
        alt={name}
        className="w-max md:w-20 md:h-20 object-cover md:rounded-full md:translate-x-[-10px] opacity-50 md:opacity-100"
      />
      <div className="p-2 md:4">
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
