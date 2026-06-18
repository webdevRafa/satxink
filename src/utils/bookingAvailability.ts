import type { FieldValue, Timestamp } from "firebase/firestore";

export type BookingAvailability = {
  monthKeys?: string[];
  updatedAt?: Date | Timestamp | FieldValue | null;
};

export type BookingMonthOption = {
  key: string;
  label: string;
  shortLabel: string;
  year: number;
  monthIndex: number;
};

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "long" });
const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

export const getRollingBookingMonthOptions = (
  baseDate = new Date()
): BookingMonthOption[] => {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);

  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const year = date.getFullYear();
    const monthIndex = date.getMonth();
    const monthNumber = String(monthIndex + 1).padStart(2, "0");

    return {
      key: `${year}-${monthNumber}`,
      label: `${MONTH_FORMATTER.format(date)} ${year}`,
      shortLabel: `${SHORT_MONTH_FORMATTER.format(date)} ${year}`,
      year,
      monthIndex,
    };
  });
};

export const normalizeBookingMonthKeys = (
  value: unknown,
  allowedKeys = getRollingBookingMonthOptions().map((option) => option.key)
) => {
  const allowed = new Set(allowedKeys);
  const keys = Array.isArray(value) ? value : [];

  return Array.from(
    new Set(
      keys.filter(
        (key): key is string =>
          typeof key === "string" &&
          MONTH_KEY_PATTERN.test(key) &&
          allowed.has(key)
      )
    )
  ).sort();
};

export const getBookingAvailabilityMonthKeys = (
  availability?: BookingAvailability | null,
  allowedKeys?: string[]
) => normalizeBookingMonthKeys(availability?.monthKeys, allowedKeys);

export const formatBookingMonthLabel = (
  monthKeys: string[],
  options = getRollingBookingMonthOptions()
) => {
  const optionByKey = new Map(options.map((option) => [option.key, option]));
  const months = normalizeBookingMonthKeys(
    monthKeys,
    options.map((option) => option.key)
  )
    .map((key) => optionByKey.get(key))
    .filter((option): option is BookingMonthOption => Boolean(option));

  if (months.length === 0) return "";

  const groups: BookingMonthOption[][] = [];

  months.forEach((month) => {
    const currentGroup = groups[groups.length - 1];
    const previous = currentGroup?.[currentGroup.length - 1];
    const isConsecutive =
      previous &&
      new Date(month.year, month.monthIndex).getTime() ===
        new Date(previous.year, previous.monthIndex + 1).getTime();

    if (currentGroup && isConsecutive) {
      currentGroup.push(month);
      return;
    }

    groups.push([month]);
  });

  const allSameYear = months.every((month) => month.year === months[0].year);

  if (allSameYear) {
    const monthParts = groups.map((group) => {
      const first = group[0];
      const last = group[group.length - 1];
      return group.length === 1
        ? getMonthName(first)
        : `${getMonthName(first)}-${getMonthName(last)}`;
    });

    return `${monthParts.join(", ")} ${months[0].year}`;
  }

  return groups
    .map((group) => {
      const first = group[0];
      const last = group[group.length - 1];

      if (group.length === 1) return `${getMonthName(first)} ${first.year}`;

      return `${getMonthName(first)} ${first.year}-${getMonthName(last)} ${
        last.year
      }`;
    })
    .join(", ");
};

export const getBookingAvailabilityLabel = (
  availability?: BookingAvailability | null,
  fallback = "Availability not listed"
) => {
  const monthLabel = formatBookingMonthLabel(
    getBookingAvailabilityMonthKeys(availability)
  );

  return monthLabel ? `Booking ${monthLabel}` : fallback;
};

const getMonthName = (option: BookingMonthOption) =>
  MONTH_FORMATTER.format(new Date(option.year, option.monthIndex, 1));
