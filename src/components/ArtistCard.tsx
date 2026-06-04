// src/components/ArtistCard.tsx
import { useEffect, useRef, useState } from "react";
import { getCanonicalTattooStyles } from "../types/TattooStyle";

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
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const maxVisibleSpecialties = previewUrl ? 2 : 3;
  const displaySpecialties = getCanonicalTattooStyles(specialties);
  const visibleSpecialties = displaySpecialties.slice(0, maxVisibleSpecialties);
  const hiddenSpecialtyCount = Math.max(
    displaySpecialties.length - maxVisibleSpecialties,
    0
  );
  const layoutClass = previewUrl
    ? "grid h-full grid-cols-[72px_minmax(0,1fr)_72px] gap-4 p-4 sm:grid-cols-[72px_minmax(0,1fr)_86px]"
    : "grid h-full grid-cols-[72px_minmax(0,1fr)] gap-4 p-4";

  useEffect(() => {
    setPreviewLoaded(false);
    setPreviewFailed(false);

    if (!previewUrl) return;

    const image = previewImageRef.current;
    if (!image) return;

    if (image.complete) {
      if (image.naturalWidth > 0) {
        setPreviewLoaded(true);
      } else {
        setPreviewFailed(true);
      }

      return;
    }

    const handleLoad = () => {
      setPreviewFailed(false);
      setPreviewLoaded(true);
    };
    const handleError = () => {
      setPreviewLoaded(false);
      setPreviewFailed(true);
    };

    image.addEventListener("load", handleLoad);
    image.addEventListener("error", handleError);

    return () => {
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };
  }, [previewUrl]);

  return (
    <div className="group h-[148px] overflow-hidden rounded-lg border border-white/5 bg-[#121212]  hover:bg-[#202020] text-white shadow-md transition duration-300 hover:border-white/15 hover:from-[#171717] hover:to-[#282828]">
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
                    className=" px-2 py-1 text-[11px] font-medium leading-none text-neutral-300"
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
          <span className="inline-flex w-fit translate-y-1 rounded-md px-4 py-2 text-sm font-medium text-neutral-300 opacity-0 transition duration-200 group-hover:translate-y-0  group-hover:text-white group-hover:opacity-100">
            View artist profile
          </span>
        </div>

        {previewUrl && (
          <div className="relative h-full overflow-hidden rounded-md border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-black/30">
            <div
              className={`absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-black/20 transition-opacity duration-300 ${
                previewLoaded || previewFailed ? "opacity-0" : "opacity-100"
              }`}
            />
            {previewFailed && (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/[0.055] via-white/[0.025] to-black/30 px-2 text-center text-[10px] font-semibold leading-tight text-neutral-500">
                Preview unavailable
              </div>
            )}
            <img
              ref={previewImageRef}
              src={previewUrl}
              alt={previewAlt || `${displayName} portfolio preview`}
              loading="lazy"
              decoding="async"
              onLoad={() => {
                setPreviewFailed(false);
                setPreviewLoaded(true);
              }}
              onError={() => {
                setPreviewLoaded(false);
                setPreviewFailed(true);
              }}
              className={`block h-full w-full min-w-full object-cover transition duration-500 ${
                previewLoaded && !previewFailed
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
