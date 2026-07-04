import type { ReactNode } from "react";
import { ImageOff, Tag } from "lucide-react";

import { getFlashBadgeLabel } from "../utils/flashAvailability";
import {
  formatFlashPrice,
  getFlashArtistName,
  getFlashPreviewUrl,
  getFlashTitle,
  getFlashVisualTitle,
  type FlashPreviewArtist,
  type FlashPreviewShape,
} from "../utils/flashPreview";

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

export const FlashPreviewImage = ({
  flash,
  alt,
  badgeLabel,
  showBadge = true,
  className,
  imageClassName,
  imageLoading = "lazy",
  imageFetchPriority,
  children,
}: {
  flash: FlashPreviewShape;
  alt?: string;
  badgeLabel?: string | null;
  showBadge?: boolean;
  className?: string;
  imageClassName?: string;
  imageLoading?: "eager" | "lazy";
  imageFetchPriority?: "high" | "low" | "auto";
  children?: ReactNode;
}) => {
  const previewUrl = getFlashPreviewUrl(flash);
  const resolvedBadgeLabel = showBadge
    ? badgeLabel ?? getFlashBadgeLabel(flash)
    : null;

  return (
    <div
      className={cx(
        "relative aspect-square overflow-hidden bg-black/30",
        className
      )}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={alt || getFlashTitle(flash)}
          className={cx(
            "h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]",
            imageClassName
          )}
          loading={imageLoading}
          decoding="async"
          fetchPriority={imageFetchPriority}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="text-white/25" size={36} />
        </div>
      )}

      {resolvedBadgeLabel && (
        <span className="absolute left-3 top-3 border border-[#b6382d] bg-[#b6382d]/60 backdrop-blur-xs px-3 py-1 text-[10px]  uppercase tracking-[0.12em] text-white!">
          {resolvedBadgeLabel}
        </span>
      )}

      {children}
    </div>
  );
};

export const FlashArtistAvatar = ({
  artist,
  name,
}: {
  artist?: FlashPreviewArtist | null;
  name?: string;
}) => {
  const artistName = name || getFlashArtistName(artist);

  return (
    <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/[0.06] shadow-sm">
      {artist?.avatarUrl ? (
        <img
          src={artist.avatarUrl}
          alt={artistName}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-white/55">
          {artistName.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
};

export const FlashTinyTag = ({
  tags,
  className,
}: {
  tags?: string[];
  className?: string;
}) => {
  const visibleTags =
    tags
      ?.map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 2) || [];
  const extraCount = Math.max(
    (tags?.filter((item) => item.trim()).length || 0) - visibleTags.length,
    0
  );
  if (visibleTags.length === 0) return null;

  return (
    <span
      className={cx("flex min-w-0 flex-wrap items-center gap-1.5", className)}
    >
      {visibleTags.map((tag) => (
        <span
          key={tag}
          className="inline-flex min-w-0 max-w-[7.5rem] items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[10px] font-semibold text-white/45"
        >
          <Tag size={10} className="shrink-0" />
          <span className="truncate">{tag}</span>
        </span>
      ))}
      {extraCount > 0 && (
        <span className="inline-flex shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-white/35">
          +{extraCount}
        </span>
      )}
    </span>
  );
};

export const FlashPreviewMeta = ({
  flash,
  artist,
  showArtist = true,
  showTag = true,
  className,
}: {
  flash: FlashPreviewShape;
  artist?: FlashPreviewArtist | null;
  showArtist?: boolean;
  showTag?: boolean;
  className?: string;
}) => {
  const artistName = getFlashArtistName(artist);
  const visualTitle = getFlashVisualTitle(flash);

  return (
    <div className={cx("flex min-h-[98px] flex-col", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {showArtist && (
            <FlashArtistAvatar artist={artist} name={artistName} />
          )}
          <div className="min-w-0">
            {showArtist ? (
              <>
                <p className="my-0 truncate text-sm! font-semibold leading-tight text-white">
                  {artistName}
                </p>
              </>
            ) : visualTitle ? (
              <p className="my-0 truncate text-sm! font-semibold leading-tight text-white">
                {visualTitle}
              </p>
            ) : (
              <span className="sr-only">Flash design</span>
            )}
          </div>
        </div>
        <span className="shrink-0 l  px-2.5 py-1 text-sm! font-bold leading-none text-white/85 shadow-sm">
          {formatFlashPrice(flash.price)}
        </span>
      </div>

      {showTag && (
        <div className="mt-auto flex min-h-6 min-w-0 pt-3">
          <FlashTinyTag tags={flash.tags} />
        </div>
      )}
    </div>
  );
};
