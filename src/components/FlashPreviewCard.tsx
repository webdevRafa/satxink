import type { ReactNode } from "react";
import { ImageOff, Tag } from "lucide-react";

import { getFlashBadgeLabel } from "../utils/flashAvailability";
import {
  formatFlashPrice,
  getFlashArtistName,
  getFlashPreviewUrl,
  getFlashTitle,
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
  children,
}: {
  flash: FlashPreviewShape;
  alt?: string;
  badgeLabel?: string | null;
  showBadge?: boolean;
  className?: string;
  imageClassName?: string;
  children?: ReactNode;
}) => {
  const previewUrl = getFlashPreviewUrl(flash);
  const resolvedBadgeLabel = showBadge
    ? badgeLabel ?? getFlashBadgeLabel(flash)
    : null;

  return (
    <div className={cx("relative aspect-square overflow-hidden bg-black/30", className)}>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={alt || getFlashTitle(flash)}
          className={cx(
            "h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]",
            imageClassName
          )}
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="text-white/25" size={36} />
        </div>
      )}

      {resolvedBadgeLabel && (
        <span className="absolute left-3 top-3 rounded-full border border-red-300/30 bg-red-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-red-100 backdrop-blur">
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
    <span className="relative mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/[0.06] shadow-sm">
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
  const tag = tags?.find((item) => item.trim().length > 0);
  if (!tag) return null;

  return (
    <span
      className={cx(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/45",
        className
      )}
    >
      <Tag size={10} className="shrink-0" />
      <span className="truncate">{tag}</span>
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

  return (
    <div className={cx("flex min-h-[42px] items-start gap-2", className)}>
      {showArtist && <FlashArtistAvatar artist={artist} name={artistName} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="my-0! min-w-0 flex-1 truncate text-sm! font-semibold text-white">
            {getFlashTitle(flash)}
          </h3>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-2 py-0.5 text-[11px] font-bold leading-none text-white/80">
            {formatFlashPrice(flash.price)}
          </span>
        </div>
        {showArtist && (
          <p className="mt-0.5 truncate text-xs text-white/50">
            by {artistName}
          </p>
        )}
        {showTag && (
          <div className="mt-2 flex min-h-5 min-w-0">
            <FlashTinyTag tags={flash.tags} />
          </div>
        )}
      </div>
    </div>
  );
};
