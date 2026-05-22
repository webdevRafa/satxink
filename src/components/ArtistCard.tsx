// src/components/ArtistCard.tsx
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
  const visibleSpecialties = specialties?.slice(0, 3) || [];
  const hiddenSpecialtyCount = Math.max((specialties?.length || 0) - 3, 0);
  const layoutClass = previewUrl
    ? "grid h-full grid-cols-[72px_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[72px_minmax(0,1fr)_86px]"
    : "grid h-full grid-cols-[72px_minmax(0,1fr)] gap-4 p-4";

  return (
    <div className="group min-h-[128px] overflow-hidden rounded-lg border border-white/5 bg-gradient-to-r from-[#121212] via-[#181818] to-[#202020] text-white shadow-md transition duration-300 hover:border-white/15 hover:from-[#171717] hover:to-[#282828]">
      <div className={layoutClass}>
        <img
          src={avatarUrl || "/fallback.jpg"}
          alt={displayName}
          className="my-auto h-16 w-16 rounded-full border border-white/10 object-cover shadow-lg"
        />

        <div className="flex min-w-0 flex-col justify-center">
          <h3 className="truncate text-base font-semibold text-neutral-100">
            {displayName}
          </h3>
          <div className="mt-2 flex min-h-[26px] flex-wrap items-start gap-1.5">
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
              <span className="text-sm text-gray-500">
                No specialties listed
              </span>
            )}
          </div>
          <span className="mt-4 inline-flex w-fit rounded-md bg-white/[0.08] px-4 py-2 text-sm font-medium text-neutral-300 transition group-hover:bg-white/[0.12] group-hover:text-white">
            View Page
          </span>
        </div>

        {previewUrl && (
          <div className="hidden h-full min-h-[88px] overflow-hidden rounded-md border border-white/10 bg-black/30 sm:block">
            <img
              src={previewUrl}
              alt={previewAlt || `${displayName} portfolio preview`}
              loading="lazy"
              className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-105 group-hover:opacity-100"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtistCard;
