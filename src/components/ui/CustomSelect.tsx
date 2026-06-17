import { Listbox } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import type { SelectOption } from "../../utils/timeOptions";

type CustomSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  className?: string;
  buttonClassName?: string;
  optionsClassName?: string;
  optionsPlacement?: "bottom" | "top";
};

const CustomSelect = ({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  buttonClassName = "",
  optionsClassName = "",
  optionsPlacement = "bottom",
}: CustomSelectProps) => {
  const selectedOption = options.find((option) => option.value === value);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [optionsStyle, setOptionsStyle] = useState<CSSProperties>({});

  const updateOptionsPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button || typeof window === "undefined") return;

    const rect = button.getBoundingClientRect();
    const gap = 8;
    const preferredMaxHeight = 256;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const shouldPlaceAbove =
      optionsPlacement === "top" ||
      (optionsPlacement === "bottom" && spaceBelow < 180 && spaceAbove > spaceBelow);
    const availableSpace = shouldPlaceAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(144, Math.min(preferredMaxHeight, availableSpace));

    setOptionsStyle({
      left: rect.left,
      maxHeight,
      position: "fixed",
      top: shouldPlaceAbove
        ? Math.max(gap, rect.top - gap - maxHeight)
        : rect.bottom + gap,
      width: rect.width,
      zIndex: 240,
    });
  }, [optionsPlacement]);

  return (
    <Listbox value={value} onChange={onChange}>
      {({ open }) => (
        <div className={`relative ${className}`}>
          <Listbox.Button
            ref={buttonRef}
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
          <PortaledOptions
            open={open}
            options={options}
            optionsClassName={optionsClassName}
            optionsStyle={optionsStyle}
            updateOptionsPosition={updateOptionsPosition}
          />
        </div>
      )}
    </Listbox>
  );
};

const PortaledOptions = ({
  open,
  options,
  optionsClassName,
  optionsStyle,
  updateOptionsPosition,
}: {
  open: boolean;
  options: SelectOption[];
  optionsClassName: string;
  optionsStyle: CSSProperties;
  updateOptionsPosition: () => void;
}) => {
  const optionsRef = useRef<HTMLUListElement | null>(null);
  const positionFrameRef = useRef<number | null>(null);

  const scheduleOptionsPositionUpdate = useCallback(
    (event?: Event) => {
      if (
        event?.target instanceof Node &&
        optionsRef.current?.contains(event.target)
      ) {
        return;
      }

      if (positionFrameRef.current !== null) return;

      positionFrameRef.current = window.requestAnimationFrame(() => {
        positionFrameRef.current = null;
        updateOptionsPosition();
      });
    },
    [updateOptionsPosition]
  );

  useLayoutEffect(() => {
    if (open) updateOptionsPosition();
  }, [open, updateOptionsPosition]);

  useEffect(() => {
    if (!open) return undefined;

    window.addEventListener("resize", scheduleOptionsPositionUpdate, {
      passive: true,
    });
    window.addEventListener("scroll", scheduleOptionsPositionUpdate, {
      capture: true,
      passive: true,
    });

    return () => {
      if (positionFrameRef.current !== null) {
        window.cancelAnimationFrame(positionFrameRef.current);
        positionFrameRef.current = null;
      }

      window.removeEventListener("resize", scheduleOptionsPositionUpdate);
      window.removeEventListener("scroll", scheduleOptionsPositionUpdate, true);
    };
  }, [open, scheduleOptionsPositionUpdate]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <Listbox.Options
      ref={optionsRef}
      style={optionsStyle}
      className={`shop-picker-scrollbar overflow-y-auto rounded-md border border-white/10 bg-[#050505] p-1 text-white shadow-2xl shadow-black ring-1 ring-black/60 focus:outline-none ${optionsClassName}`}
    >
      {options.map((option) => (
        <Listbox.Option
          key={option.value}
          value={option.value}
          className={({ active, selected }) =>
            `relative cursor-pointer select-none rounded-md py-2.5 pl-3 pr-9 text-sm transition ${
              active || selected ? "bg-white/10 text-white" : "text-neutral-300"
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
    </Listbox.Options>,
    document.body
  );
};

export default CustomSelect;
