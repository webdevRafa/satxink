import type { FlashRepeatability } from "../types/Flash";

type FlashRepeatabilityControlProps = {
  value: FlashRepeatability;
  onChange: (value: FlashRepeatability) => void;
  label?: string;
  description?: string;
  labelClassName?: string;
  descriptionClassName?: string;
  disabled?: boolean;
  compact?: boolean;
};

const options: Array<{
  value: FlashRepeatability;
  label: string;
}> = [
  {
    value: "repeatable",
    label: "Repeatable",
  },
  {
    value: "one_of_one",
    label: "1 of 1",
  },
];

const FlashRepeatabilityControl = ({
  value,
  onChange,
  label = "Availability",
  description,
  labelClassName,
  descriptionClassName,
  disabled = false,
  compact = false,
}: FlashRepeatabilityControlProps) => (
  <div
    className={`rounded-2xl border border-white/10 bg-white/[0.03] ${
      compact ? "p-3" : "p-4"
    }`}
  >
    <div>
      <p className={labelClassName || "text-sm font-semibold text-white"}>
        {label}
      </p>
      {description && !compact && (
        <p
          className={
            descriptionClassName || "mt-1 text-xs leading-5 text-zinc-500"
          }
        >
          {description}
        </p>
      )}
    </div>
    <div
      className={`relative grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-black/35 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
        compact ? "mt-2" : "mt-4"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <span
        className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-lg border border-red-300/35 bg-red-500/15 shadow-[0_12px_28px_rgba(248,113,113,0.12),inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-300 ease-out"
        style={{
          width: "calc((100% - 0.5rem) / 2)",
          transform:
            value === "one_of_one" ? "translateX(100%)" : "translateX(0)",
        }}
      />
      {options.map((option) => {
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            aria-pressed={active}
            className={`relative z-10 flex h-11 items-center justify-center rounded-lg px-3! text-sm font-semibold transition disabled:cursor-not-allowed ${
              active
                ? "text-white"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  </div>
);

export default FlashRepeatabilityControl;
