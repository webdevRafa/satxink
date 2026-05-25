import { Listbox } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import type { SelectOption } from "../../utils/timeOptions";

type CustomSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  className?: string;
  buttonClassName?: string;
  optionsClassName?: string;
};

const CustomSelect = ({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  buttonClassName = "",
  optionsClassName = "",
}: CustomSelectProps) => {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Listbox value={value} onChange={onChange}>
      {({ open }) => (
        <div className={`relative ${className}`}>
          <Listbox.Button
            className={`relative w-full cursor-pointer rounded-md border border-white/10 bg-black/35 px-3 py-3 pr-10 text-left text-sm text-white outline-none transition hover:border-white/25 focus:border-white/35 ${buttonClassName}`}
          >
            <span
              className={`block truncate ${
                selectedOption ? "text-white" : "text-neutral-500"
              }`}
            >
              {selectedOption?.label || placeholder}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <ChevronDown
                size={16}
                className={`text-neutral-400 transition-transform ${
                  open ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </span>
          </Listbox.Button>
          <Listbox.Options
            className={`shop-picker-scrollbar absolute z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-md border border-white/10 bg-[#050505] p-1 text-white shadow-2xl shadow-black ring-1 ring-black/60 focus:outline-none ${optionsClassName}`}
          >
            {options.map((option) => (
              <Listbox.Option
                key={option.value}
                value={option.value}
                className={({ active, selected }) =>
                  `relative cursor-pointer select-none rounded-md py-2.5 pl-3 pr-9 text-sm transition ${
                    active || selected
                      ? "bg-white/10 text-white"
                      : "text-neutral-300"
                  }`
                }
              >
                {({ selected }) => (
                  <>
                    <span className="block truncate">{option.label}</span>
                    {selected && (
                      <span className="absolute inset-y-0 right-2 flex items-center text-[var(--color-primary)]">
                        <Check size={15} aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </div>
      )}
    </Listbox>
  );
};

export default CustomSelect;
