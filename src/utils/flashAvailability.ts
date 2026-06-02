import type {
  Flash,
  FlashAvailabilityStatus,
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

export const isFlashAvailableForClients = (
  flash?: Pick<Flash, "availabilityStatus" | "isAvailable"> | null
) =>
  Boolean(flash) &&
  flash?.isAvailable !== false &&
  getFlashAvailabilityStatus(flash) === "available";

export const isOneOfOneFlash = (
  flash?: Pick<Flash, "repeatability"> | null
) => getFlashRepeatability(flash) === "one_of_one";

export const getFlashBadgeLabel = (
  flash?: Pick<Flash, "availabilityStatus" | "isAvailable" | "repeatability"> | null
) =>
  isFlashAvailableForClients(flash) && isOneOfOneFlash(flash)
    ? ONE_OF_ONE_BADGE_LABEL
    : null;
