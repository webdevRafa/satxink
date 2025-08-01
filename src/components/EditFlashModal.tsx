// EditFlashModal.tsx
import { useState } from "react";
import type { Flash } from "../types/Flash";

type Props = {
  flash: Flash;
  onClose: () => void;
  onSave: (id: string, title: string, price: number | null) => void;
  onDelete?: (flash: Flash) => void;
};

const EditFlashModal = ({ flash, onClose, onSave, onDelete }: Props) => {
  const [title, setTitle] = useState(flash.title || "");
  const [price, setPrice] = useState(flash.price?.toString() || "");

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-md text-white space-y-4">
        <span className="text-sm text-gray-400">Edit Flash</span>

        <div className="flex justify-center">
          <img
            src={flash.thumbUrl || flash.webp90Url}
            alt={flash.title}
            className="w-48 h-48 object-cover rounded-md shadow"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded bg-zinc-800 text-white"
            placeholder="Enter title"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Price</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full px-3 py-2 rounded bg-zinc-800 text-white"
            placeholder="Price (optional)"
          />
        </div>

        <div className="flex justify-between mt-6">
          {onDelete && (
            <button
              onClick={() => onDelete(flash)}
              className="bg-rose-600 text-white px-4 py-2 rounded hover:bg-rose-700"
            >
              Delete
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="bg-zinc-700 text-white px-4 py-2 rounded"
            >
              Cancel
            </button>
            <button
              onClick={() =>
                onSave(flash.id, title, price ? parseFloat(price) : null)
              }
              className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditFlashModal;
