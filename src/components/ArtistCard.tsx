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
  hasPreviewIntent?: boolean;
  isPreviewActive?: boolean;
  isPreviewLoading?: boolean;
  previewUnavailable?: boolean;
  socialLinks?: SocialLinks;
}

const ArtistCard = ({
  name,
  avatarUrl,
  specialties,
  previewUrl,
  previewAlt,
  hasPreviewIntent = false,
  isPreviewActive = false,
  isPreviewLoading = false,
  previewUnavailable = false,
}: ArtistCardProps) => {
  const displayName = name || "Artist";
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const maxVisibleSpecialties = 3;
  const displaySpecialties = getCanonicalTattooStyles(specialties);
  const visibleSpecialties = displaySpecialties.slice(0, maxVisibleSpecialties);
  const hiddenSpecialtyCount = Math.max(
    displaySpecialties.length - maxVisibleSpecialties,
    0
  );
  const shouldRenderPreviewPanel = hasPreviewIntent;
  const shouldRenderPreviewImage =
    hasPreviewIntent && Boolean(previewUrl) && !previewFailed;

  useEffect(() => {
    setPreviewLoaded(false);
    setPreviewFailed(false);

    if (!hasPreviewIntent || !previewUrl) return;

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
  }, [hasPreviewIntent, previewUrl]);

  return (
    <div className="group h-[148px] overflow-hidden rounded-lg border border-white/5 bg-[#121212] text-white shadow-md transition duration-300 hover:border-white/15 hover:bg-[#202020]">
      <div className="relative grid h-full grid-cols-[72px_minmax(0,1fr)] gap-4 p-4">
        <img
          src={avatarUrl || "/fallback.jpg"}
          alt={displayName}
          className="relative z-10 my-auto h-16 w-16 rounded-full border border-white/10 object-cover shadow-lg"
        />

        <div className="relative z-10 flex h-full min-w-0 flex-col justify-center">
          <h3 className="truncate text-base font-semibold text-neutral-100">
            {displayName}
          </h3>
          <div
            className={`mt-2 flex h-[48px] flex-wrap content-start items-start gap-1.5 overflow-hidden transition duration-300 ease-out ${
              isPreviewActive
                ? "-translate-x-4 opacity-0"
                : "translate-x-0 opacity-100"
            }`}
          >
            {visibleSpecialties.length > 0 ? (
              <>
                {visibleSpecialties.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-[11px] font-medium leading-none text-neutral-300"
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
          <span className="inline-flex w-fit translate-y-1 rounded-md px-4 py-2 text-sm font-medium text-white! opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:text-white group-hover:opacity-100">
            View artist profile
          </span>
        </div>

        {shouldRenderPreviewPanel && (
          <div
            className={`pointer-events-none absolute bottom-4 right-4 top-4 z-20 w-[88px] overflow-hidden rounded-md border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-black/30 shadow-[0_18px_35px_rgba(0,0,0,0.35)] transition duration-300 ease-out ${
              isPreviewActive
                ? "translate-x-0 opacity-100"
                : "translate-x-5 opacity-0"
            }`}
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-black/20 transition-opacity duration-300 ${
                previewLoaded || previewFailed || previewUnavailable
                  ? "opacity-0"
                  : "opacity-100"
              }`}
            />
            {isPreviewLoading && !previewUrl && (
              <div className="preview-loading-sheen absolute inset-0" />
            )}
            {(previewFailed || previewUnavailable) && (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/[0.055] via-white/[0.025] to-black/30 px-2 text-center text-[10px] font-semibold leading-tight text-neutral-500">
                Preview unavailable
              </div>
            )}
            {shouldRenderPreviewImage && (
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
                  previewLoaded ? "scale-100 opacity-95" : "scale-105 opacity-0"
                }`}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtistCard;
