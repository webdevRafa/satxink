import CustomSelect from "./CustomSelect";
import { quarterHourTimeOptions } from "../../utils/timeOptions";

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
}: QuarterHourTimeSelectProps) => (
  <CustomSelect
    value={value}
    onChange={onChange}
    options={
      minTime
        ? quarterHourTimeOptions.filter((option) => option.value >= minTime)
        : quarterHourTimeOptions
    }
    placeholder={placeholder}
    className={className}
    buttonClassName={buttonClassName}
    optionsClassName="max-h-64"
  />
);

export default QuarterHourTimeSelect;
