// src/components/ArtistCard.tsx
import { useEffect, useState } from "react";

interface SocialLinks {
  facebook?: string;
  instagram?: string;
  website?: string;
}

interface ArtistCardProps {
  name?: string;
  avatarUrl: string;
  specialties: string[];
  likedBy: string[];
  previewUrl?: string;
  previewAlt?: string;
  socialLinks?: SocialLinks;
}

const ArtistCard = ({
  name,
  avatarUrl,
  specialties,
  previewUrl,
  previewAlt,
}: ArtistCardProps) => {
  const displayName = name || "Artist";
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const maxVisibleSpecialties = previewUrl ? 2 : 3;
  const visibleSpecialties = specialties?.slice(0, maxVisibleSpecialties) || [];
  const hiddenSpecialtyCount = Math.max(
    (specialties?.length || 0) - maxVisibleSpecialties,
    0
  );
  const layoutClass = previewUrl
    ? "grid h-full grid-cols-[72px_minmax(0,1fr)_72px] gap-4 p-4 sm:grid-cols-[72px_minmax(0,1fr)_86px]"
    : "grid h-full grid-cols-[72px_minmax(0,1fr)] gap-4 p-4";

  useEffect(() => {
    setPreviewLoaded(false);
  }, [previewUrl]);

  return (
    <div className="group h-[148px] overflow-hidden rounded-lg border border-white/5 bg-gradient-to-r from-[#121212] via-[#181818] to-[#202020] text-white shadow-md transition duration-300 hover:border-white/15 hover:from-[#171717] hover:to-[#282828]">
      <div className={layoutClass}>
        <img
          src={avatarUrl || "/fallback.jpg"}
          alt={displayName}
          className="my-auto h-16 w-16 rounded-full border border-white/10 object-cover shadow-lg"
        />

        <div className="flex h-full min-w-0 flex-col justify-center">
          <h3 className="truncate text-base font-semibold text-neutral-100">
            {displayName}
          </h3>
          <div className="mt-2 flex h-[48px] flex-wrap content-start items-start gap-1.5 overflow-hidden">
            {visibleSpecialties.length > 0 ? (
              <>
                {visibleSpecialties.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium leading-none text-neutral-300"
                  >
                    {tag}
                  </span>
                ))}
                {hiddenSpecialtyCount > 0 && (
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-medium leading-none text-neutral-300">
                    +{hiddenSpecialtyCount}
                  </span>
                )}
              </>
            ) : (
              <span className="pt-1 text-sm text-gray-500">
                No specialties listed
              </span>
            )}
          </div>
          <span className="inline-flex w-fit translate-y-1 rounded-md bg-white/[0.08] px-4 py-2 text-sm font-medium text-neutral-300 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:bg-white/[0.12] group-hover:text-white group-hover:opacity-100">
            View Page
          </span>
        </div>

        {previewUrl && (
          <div className="relative h-full overflow-hidden rounded-md border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-black/30">
            <div
              className={`absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-black/20 transition-opacity duration-300 ${
                previewLoaded ? "opacity-0" : "opacity-100"
              }`}
            />
            <img
              src={previewUrl}
              alt={previewAlt || `${displayName} portfolio preview`}
              loading="lazy"
              decoding="async"
              onLoad={() => setPreviewLoaded(true)}
              className={`block h-full w-full min-w-full object-cover transition duration-500 ${
                previewLoaded
                  ? "opacity-90 group-hover:scale-105 group-hover:opacity-100"
                  : "opacity-0"
              }`}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtistCard;
