import React from "react";
import { RiInstagramFill } from "react-icons/ri";
import { SiWebmoney } from "react-icons/si";
import { FaFacebook } from "react-icons/fa";

type Artist = {
  id: string;
  displayName: string;
  email: string;
  bio: string;
  avatarUrl: string;
  specialties: string[];
  socialLinks?: {
    instagram?: string;
    website?: string;
    facebook?: string;
  };
  depositPolicy: {
    amount: number;
    depositRequired: boolean;
    nonRefundable: boolean;
  };
  finalPaymentTiming: "before" | "after";
};

type ArtistProfileHeaderProps = {
  artist: Artist;
  onAvatarClick?: () => void;
};

const ArtistProfileHeader: React.FC<ArtistProfileHeaderProps> = ({
  artist,
  onAvatarClick,
}) => {
  return (
    <div className="bg-[var(--color-bg-base)] flex flex-col items-center md:flex-row md:items-start gap-6 md:gap-10 p-6 ">
      {/* Avatar */}
      <div className="relative group">
        <img
          src={artist.avatarUrl}
          alt="Artist Avatar"
          className="w-28 h-28 rounded-full object-cover border-2 border-neutral-600"
        />
        {onAvatarClick && (
          <button
            onClick={onAvatarClick}
            className="absolute bottom-0 right-0 text-xs px-2 py-1 bg-black bg-opacity-70 rounded hover:bg-opacity-90 group-hover:opacity-100 transition"
          >
            Change
          </button>
        )}
      </div>

      {/* Info */}
      <div>
        <h2 className="text-2xl font-semibold mb-1!">{artist.displayName}</h2>
        <p className="text-neutral-400 italic mt-0!">{artist.bio}</p>

        {/* Specialties */}
        <div className="flex flex-wrap gap-2 mt-3">
          {artist.specialties.map((style, i) => (
            <span
              key={i}
              className="px-3 py-1 text-sm bg-neutral-800 rounded-full border border-neutral-600"
            >
              {style}
            </span>
          ))}
        </div>

        {/* Social Links */}
        <div className="flex gap-4 mt-3 text-lg text-neutral-300">
          {artist.socialLinks?.instagram && (
            <a
              href={artist.socialLinks.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-pink-500"
            >
              <RiInstagramFill />
            </a>
          )}
          {artist.socialLinks?.website && (
            <a
              href={artist.socialLinks.website}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-400"
            >
              <SiWebmoney />
            </a>
          )}
          {artist.socialLinks?.facebook && (
            <a
              href={artist.socialLinks.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-500"
            >
              <FaFacebook />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArtistProfileHeader;
