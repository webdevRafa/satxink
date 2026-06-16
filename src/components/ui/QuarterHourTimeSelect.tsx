import CustomSelect from "./CustomSelect";
import { quarterHourTimeOptions } from "../../utils/timeOptions";
import { useMemo } from "react";

type QuarterHourTimeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  minTime?: string;
};

const QuarterHourTimeSelect = ({
  value,
  onChange,
  placeholder = "Select time",
  className = "",
  buttonClassName = "",
  minTime,
}: QuarterHourTimeSelectProps) => {
  const options = useMemo(
    () =>
      minTime
        ? quarterHourTimeOptions.filter((option) => option.value >= minTime)
        : quarterHourTimeOptions,
    [minTime]
  );

  return (
    <CustomSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      className={className}
      buttonClassName={buttonClassName}
      optionsClassName="max-h-64"
    />
  );
};

export default QuarterHourTimeSelect;
