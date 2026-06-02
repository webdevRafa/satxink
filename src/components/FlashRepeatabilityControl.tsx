import { Check } from "lucide-react";
import type { FlashRepeatability } from "../types/Flash";

type FlashRepeatabilityControlProps = {
  value: FlashRepeatability;
  onChange: (value: FlashRepeatability) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  compact?: boolean;
};

const options: Array<{
  value: FlashRepeatability;
  label: string;
  description: string;
}> = [
  {
    value: "repeatable",
    label: "Repeatable",
    description: "Multiple clients can request this design.",
  },
  {
    value: "one_of_one",
    label: "One of one",
    description: "Hide this design once checkout starts.",
  },
];

const FlashRepeatabilityControl = ({
  value,
  onChange,
  label = "Availability",
  description,
  disabled = false,
  compact = false,
}: FlashRepeatabilityControlProps) => (
  <div
    className={`rounded-2xl border border-white/10 bg-white/[0.03] ${
      compact ? "p-3" : "p-4"
    }`}
  >
    <div>
      <p className="text-sm font-semibold text-white">{label}</p>
      {description && !compact && (
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      )}
    </div>
    <div className={`${compact ? "mt-2" : "mt-3"} grid gap-2 sm:grid-cols-2`}>
      {options.map((option) => {
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={`flex items-center justify-between gap-3 rounded-xl border px-3! text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
              compact ? "min-h-11 py-2.5!" : "min-h-[5.25rem] py-3!"
            } ${
              active
                ? "border-red-300/45 bg-red-500/10 text-white"
                : "border-white/10 bg-black/25 text-zinc-300 hover:border-white/20 hover:bg-white/[0.05]"
            }`}
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {option.label}
              </span>
              {!compact && (
                <span className="mt-1 block text-xs leading-5 text-zinc-500">
                  {option.description}
                </span>
              )}
            </span>
            {active && <Check size={15} className="shrink-0 text-red-100" />}
          </button>
        );
      })}
    </div>
  </div>
);

export default FlashRepeatabilityControl;
