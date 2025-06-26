import { Heart } from "lucide-react";

// src/components/ArtistCard.tsx
interface SocialLinks {
  facebook?: string;
  instagram?: string;
  website?: string;
}

interface ArtistCardProps {
  name: string;
  avatarUrl: string;
  specialties: string[];
  likedBy: string[];
  socialLinks?: SocialLinks;
}

const ArtistCard = ({
  name,
  avatarUrl,
  specialties,
  likedBy,
}: ArtistCardProps) => {
  return (
    <div className="bg-gradient-to-r  from-[#121212]  to-[#1c1c1c]  text-white rounded-xl  shadow-md flex flex-row  md:items-center group relative ">
      <img
        src={avatarUrl || "/fallback.jpg"}
        alt={name}
        className=" w-20 h-20 object-cover rounded-full md:translate-x-[-10px] md:opacity-100 my-auto "
      />
      <div className="p-2 md:4">
        <h3 className="text-base font-semibold">{name}</h3>
        <p className="text-sm text-gray-400 leading-tight">
          {specialties?.join(", ") || "No specialties listed"}
        </p>
        <a
          href="#"
          className="block mt-4 bg-[#2c2c2c] hover:bg-[#3a3a3a] text-white text-sm py-2 rounded-md text-center transition max-w-[120px]"
        >
          View Portfolio
        </a>
      </div>
    </div>
  );
};

export default ArtistCard;
