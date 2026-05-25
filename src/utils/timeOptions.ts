export type SelectOption = {
  value: string;
  label: string;
};

export const quarterHourTimeOptions: SelectOption[] = Array.from(
  { length: 24 * 4 },
  (_, index) => {
    const totalMinutes = index * 15;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}`;
    const displayHour = hour % 12 || 12;
    const suffix = hour >= 12 ? "PM" : "AM";

    return {
      value,
      label: `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`,
    };
  }
);

