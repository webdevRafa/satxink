import type {
  Flash,
  FlashAvailabilityStatus,
  FlashPublicationStatus,
  FlashRepeatability,
} from "../types/Flash";

export const DEFAULT_FLASH_REPEATABILITY: FlashRepeatability = "repeatable";
export const ONE_OF_ONE_BADGE_LABEL = "One of one";

export const getFlashRepeatability = (
  flash?: Pick<Flash, "repeatability"> | null
): FlashRepeatability =>
  flash?.repeatability === "one_of_one" ? "one_of_one" : "repeatable";

export const getFlashAvailabilityStatus = (
  flash?: Pick<Flash, "availabilityStatus"> | null
): FlashAvailabilityStatus =>
  flash?.availabilityStatus === "held" || flash?.availabilityStatus === "sold"
    ? flash.availabilityStatus
    : "available";

export const getFlashPublicationStatus = (
  flash?: Pick<Flash, "publicationStatus"> | null
): FlashPublicationStatus =>
  flash?.publicationStatus === "draft" ? "draft" : "published";

export const isFlashPublished = (
  flash?: Pick<Flash, "publicationStatus" | "marketplaceVisible"> | null
) =>
  Boolean(flash) &&
  getFlashPublicationStatus(flash) === "published" &&
  flash?.marketplaceVisible !== false;

export const isFlashAvailableForClients = (
  flash?: Pick<
    Flash,
    "availabilityStatus" | "isAvailable" | "marketplaceVisible" | "publicationStatus"
  > | null
) =>
  Boolean(flash) &&
  isFlashPublished(flash) &&
  flash?.isAvailable !== false &&
  getFlashAvailabilityStatus(flash) === "available";

export const isOneOfOneFlash = (
  flash?: Pick<Flash, "repeatability"> | null
) => getFlashRepeatability(flash) === "one_of_one";

export const getFlashBadgeLabel = (
  flash?: Pick<
    Flash,
    | "availabilityStatus"
    | "isAvailable"
    | "marketplaceVisible"
    | "publicationStatus"
    | "repeatability"
  > | null
) =>
  isFlashAvailableForClients(flash) && isOneOfOneFlash(flash)
    ? ONE_OF_ONE_BADGE_LABEL
    : null;
