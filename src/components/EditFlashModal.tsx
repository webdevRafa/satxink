import { useEffect, useState } from "react";
import type { Flash, FlashRepeatability } from "../types/Flash";
import { DollarSign, Save, Tag, Trash2, X } from "lucide-react";
import AnimatedTagInput from "./ui/AnimatedTagInput";
import FlashRepeatabilityControl from "./FlashRepeatabilityControl";
import {
  FLASH_DESCRIPTION_MAX_LENGTH,
  normalizeFlashDescription,
} from "../utils/flashSourceQuality";
import {
  getFlashAvailabilityStatus,
  getFlashPublicationStatus,
  getFlashRepeatability,
} from "../utils/flashAvailability";

type Props = {
  flash: Flash;
  onClose: () => void;
  onSave: (
    id: string,
    title: string | null,
    price: number | null,
    description: string | null,
    tags: string[],
    repeatability: FlashRepeatability
  ) => void;
  onDelete?: (flash: Flash) => void;
};

const parsePositivePrice = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const EditFlashModal = ({ flash, onClose, onSave, onDelete }: Props) => {
  const [title, setTitle] = useState(flash.title || "");
  const [price, setPrice] = useState(flash.price?.toString() || "");
  const [description, setDescription] = useState(flash.description || "");
  const [tags, setTags] = useState<string[]>(flash.tags || []);
  const [repeatability, setRepeatability] = useState(
    getFlashRepeatability(flash)
  );
  const availabilityStatus = getFlashAvailabilityStatus(flash);
  const publicationStatus = getFlashPublicationStatus(flash);
  const isSold = availabilityStatus === "sold";
  const parsedPrice = parsePositivePrice(price);
  const canSave = publicationStatus === "draft" || parsedPrice !== null;

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/85 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-[max(env(safe-area-inset-top),0.5rem)] backdrop-blur-xl md:items-center md:p-8">
      <div
        className="relative grid h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_1rem)] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_1rem)] w-full max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111111] text-white shadow-2xl md:h-[min(44rem,calc(100dvh_-_4rem))] md:max-h-[min(44rem,calc(100dvh_-_4rem))] md:grid-cols-[0.9fr_1.1fr] md:grid-rows-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-flash-details-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/55 p-2! text-zinc-300 shadow-lg shadow-black/25 transition hover:bg-white/10 hover:text-white"
          aria-label="Close edit flash modal"
        >
          <X size={18} />
        </button>

        <div className="min-h-0 border-b border-white/10 bg-black/30 p-4 md:border-b-0 md:border-r md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Manage flash
          </p>
          <div className="mx-auto mt-4 aspect-square max-h-[min(28dvh,14.5rem)] w-full max-w-[14.5rem] overflow-hidden rounded-2xl border border-white/10 bg-black/35 md:mt-5 md:max-h-none md:max-w-none">
            <img
              src={flash.thumbUrl || flash.webp90Url || flash.fullUrl}
              alt={flash.title || "Flash preview"}
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-400 md:mt-4">
            Update the marketplace details clients see when they browse your
            flash. Tags help this design surface in search and recommendations.
          </p>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="shrink-0 px-5 pt-5 md:px-6 md:pt-6">
            <h2
              id="edit-flash-details-title"
              className="text-2xl! font-bold text-white"
            >
              Edit flash details
            </h2>
          </div>

          <div className="request-modal-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-4">
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-zinc-300">
                  Title
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
                  placeholder="Enter title"
                />
              </label>

              <label className="block">
                <span className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                  <DollarSign size={16} />
                  Price
                </span>
                <input
                  type="number"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
                  placeholder={
                    publicationStatus === "draft" ? "Optional" : "Required"
                  }
                />
              </label>

              <AnimatedTagInput
                value={tags}
                onChange={setTags}
                label={
                  <>
                    <Tag size={16} />
                    Tags
                  </>
                }
                emptyPlaceholder="traditional, rose, blackwork"
              />

              <label className="block">
                <span className="text-sm font-semibold text-zinc-300">
                  Short public note
                </span>
                <textarea
                  value={description}
                  onChange={(e) =>
                    setDescription(
                      e.target.value.slice(0, FLASH_DESCRIPTION_MAX_LENGTH)
                    )
                  }
                  className="mt-2 min-h-20 w-full resize-none rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
                  placeholder="Optional context clients should know."
                />
                <span className="mt-1 block text-right text-[11px] text-zinc-600">
                  {description.length}/{FLASH_DESCRIPTION_MAX_LENGTH}
                </span>
              </label>

              <FlashRepeatabilityControl
                value={repeatability}
                onChange={setRepeatability}
                label="Availability"
                description={
                  isSold
                    ? "This design has already been purchased and can no longer be changed."
                    : "Use one of one for designs that should disappear once a client starts checkout."
                }
                disabled={isSold}
              />

              {availabilityStatus !== "available" && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300">
                  Status:{" "}
                  <span className="font-semibold capitalize text-white">
                    {availabilityStatus}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-white/10 bg-[#111111]/95 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-18px_42px_rgba(0,0,0,0.28)] md:px-6 md:py-3">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(flash)}
                  className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! border border-red-400/20 bg-red-500/10 px-3! py-2! text-xs! font-semibold text-red-200 transition hover:bg-red-500/20"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={onClose}
                  className="modal-action-button rounded-lg! border border-white/10 bg-white/5 px-3! py-2! text-xs! font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onSave(
                      flash.id,
                      title.trim() || null,
                      parsedPrice,
                      normalizeFlashDescription(description),
                      tags,
                      repeatability
                    )
                  }
                  disabled={!canSave}
                  className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-white/60 disabled:text-black disabled:opacity-100"
                >
                  <Save size={16} />
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditFlashModal;
