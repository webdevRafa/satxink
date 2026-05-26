export const getTodayDateInputValue = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const isPastDateInputValue = (
  dateValue: string,
  todayDateInput = getTodayDateInputValue()
) => Boolean(dateValue) && dateValue < todayDateInput;

export const hasPastDateInputValue = (
  dateValues: string[],
  todayDateInput = getTodayDateInputValue()
) => dateValues.filter(Boolean).some((dateValue) => isPastDateInputValue(dateValue, todayDateInput));

export const isDateRangeBackwards = (startDate: string, endDate: string) =>
  Boolean(startDate && endDate && endDate < startDate);
