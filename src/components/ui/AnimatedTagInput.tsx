import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { X } from "lucide-react";

type AnimatedTagInputProps = {
  value: string[];
  onChange: (nextTags: string[]) => void;
  label?: ReactNode;
  helperText?: string;
  emptyPlaceholder?: string;
  addPlaceholder?: string;
  displayPrefix?: string;
  maxTags?: number;
  onLimitExceeded?: () => void;
  normalizeTag?: (tag: string) => string;
  className?: string;
  inputAriaLabel?: string;
  disabled?: boolean;
};

const defaultNormalizeTag = (tag: string) =>
  tag.trim().replace(/^#/, "").toLowerCase();

const normalizeIncomingTags = (
  rawValue: string,
  normalizeTag: (tag: string) => string
) =>
  rawValue
    .split(/[\s,]+/)
    .map((tag) => normalizeTag(tag.trim().replace(/^#/, "")))
    .filter(Boolean);

const mergeTags = (
  currentTags: string[],
  incomingTags: string[],
  maxTags?: number
) => {
  const existing = new Set(currentTags.map((tag) => tag.toLowerCase()));
  const merged = [...currentTags];
  let hitLimit = false;

  incomingTags.forEach((tag) => {
    const normalizedKey = tag.toLowerCase();
    if (!normalizedKey || existing.has(normalizedKey)) return;

    if (maxTags && merged.length >= maxTags) {
      hitLimit = true;
      return;
    }

    merged.push(tag);
    existing.add(normalizedKey);
  });

  return { merged, hitLimit };
};

const AnimatedTagInput = ({
  value,
  onChange,
  label,
  helperText = "Press space or comma to create a tag.",
  emptyPlaceholder = "dragon, color, anime",
  addPlaceholder = "Add another",
  displayPrefix = "#",
  maxTags,
  onLimitExceeded,
  normalizeTag = defaultNormalizeTag,
  className = "",
  inputAriaLabel = "Add tag",
  disabled = false,
}: AnimatedTagInputProps) => {
  const [draft, setDraft] = useState("");

  const addTags = (rawValue: string) => {
    const incomingTags = normalizeIncomingTags(rawValue, normalizeTag);
    if (incomingTags.length === 0) return;

    const { merged, hitLimit } = mergeTags(value, incomingTags, maxTags);
    if (hitLimit) onLimitExceeded?.();
    onChange(merged);
  };

  const handleDraftChange = (nextValue: string) => {
    if (!/[\s,]/.test(nextValue)) {
      setDraft(nextValue);
      return;
    }

    const parts = nextValue.split(/[\s,]+/);
    const endsWithSeparator = /[\s,]$/.test(nextValue);
    const completedParts = endsWithSeparator ? parts : parts.slice(0, -1);

    addTags(completedParts.join(" "));
    setDraft(endsWithSeparator ? "" : parts[parts.length - 1] || "");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", "Tab", ",", " "].includes(event.key) && draft.trim()) {
      event.preventDefault();
      addTags(draft);
      setDraft("");
      return;
    }

    if (event.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleBlur = () => {
    if (!draft.trim()) return;
    addTags(draft);
    setDraft("");
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className={className}>
      {label && (
        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          {label}
        </span>
      )}
      <div className="mt-2 flex min-h-[52px] w-full flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-3! py-2! transition focus-within:border-red-400/70">
        {value.map((tag) => (
          <span
            key={tag}
            className="flash-upload-tag-pill inline-flex max-w-full items-center gap-1.5 rounded-full border border-red-200/20 bg-red-500/10 px-2.5! py-1.5! text-xs font-semibold text-red-100"
          >
            <span className="truncate">
              {displayPrefix}
              {tag}
            </span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full p-0.5! text-red-100/70 transition hover:bg-white/10 hover:text-white"
              aria-label={`Remove ${tag}`}
              disabled={disabled}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          aria-label={inputAriaLabel}
          placeholder={value.length > 0 ? addPlaceholder : emptyPlaceholder}
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={disabled}
          className="min-w-[9rem] flex-1 bg-transparent px-1! py-1.5! text-sm text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
        />
      </div>
      {helperText && (
        <p className="mt-1.5 text-[11px] leading-4 text-zinc-600">
          {helperText}
        </p>
      )}
    </div>
  );
};

export default AnimatedTagInput;
