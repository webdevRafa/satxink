import { useState } from "react";
import type { Flash } from "../types/Flash";
import { DollarSign, Save, Tag, Trash2, X } from "lucide-react";
import AnimatedTagInput from "./ui/AnimatedTagInput";

type Props = {
  flash: Flash;
  onClose: () => void;
  onSave: (
    id: string,
    title: string,
    price: number | null,
    tags: string[]
  ) => void;
  onDelete?: (flash: Flash) => void;
};

const EditFlashModal = ({ flash, onClose, onSave, onDelete }: Props) => {
  const [title, setTitle] = useState(flash.title || "");
  const [price, setPrice] = useState(flash.price?.toString() || "");
  const [tags, setTags] = useState<string[]>(flash.tags || []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-xl">
      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111111] text-white shadow-2xl md:grid-cols-[0.9fr_1.1fr]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-white/5 p-2! text-zinc-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Close edit flash modal"
        >
          <X size={18} />
        </button>

        <div className="border-b border-white/10 bg-black/30 p-5 md:border-b-0 md:border-r md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Manage flash
          </p>
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/35">
            <img
              src={flash.thumbUrl || flash.webp90Url || flash.fullUrl}
              alt={flash.title || "Flash preview"}
              className="aspect-square w-full object-cover"
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Update the marketplace details clients see when they browse your
            flash. Tags help this design surface in search and recommendations.
          </p>
        </div>

        <div className="p-5 md:p-6">
          <h2 className="text-2xl! font-bold text-white">Edit flash details</h2>
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-zinc-300">Title</span>
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
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4! py-3! text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/70"
                placeholder="Optional"
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
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
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
                    title,
                    price ? parseFloat(price) : null,
                    tags
                  )
                }
                className="modal-action-button inline-flex items-center justify-center gap-2 rounded-lg! bg-white px-3! py-2! text-xs! font-semibold text-black transition hover:bg-zinc-200"
              >
                <Save size={16} />
                Save changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditFlashModal;
