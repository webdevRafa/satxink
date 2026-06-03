import { Fragment, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { DollarSign, Layers, X } from "lucide-react";
import type { Booking } from "../types/Booking";

type AddSessionsInput = {
  additionalSessionCount: number;
  addedArtistAmountCents: number;
  message: string;
};

type AddSessionsAmendmentDialogProps = {
  booking: Booking | null;
  onClose: () => void;
  onSubmit: (booking: Booking, input: AddSessionsInput) => Promise<void>;
};

const AddSessionsAmendmentDialog = ({
  booking,
  onClose,
  onSubmit,
}: AddSessionsAmendmentDialogProps) => {
  const [sessionCount, setSessionCount] = useState("1");
  const [addedAmount, setAddedAmount] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!booking) return;
    setSessionCount("1");
    setAddedAmount("");
    setMessage("");
    setIsSubmitting(false);
  }, [booking]);

  const handleSubmit = async () => {
    if (!booking) return;

    const parsedSessionCount = Math.floor(Number(sessionCount));
    const parsedAddedAmount = Number(addedAmount);

    if (!Number.isFinite(parsedSessionCount) || parsedSessionCount <= 0) {
      return;
    }

    if (!Number.isFinite(parsedAddedAmount) || parsedAddedAmount <= 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(booking, {
        additionalSessionCount: parsedSessionCount,
        addedArtistAmountCents: Math.round(parsedAddedAmount * 100),
        message: message.trim(),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Transition appear show={!!booking} as={Fragment}>
      <Dialog as="div" className="relative z-[140]" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="scale-95 opacity-0"
            enterTo="scale-100 opacity-100"
            leave="ease-in duration-150"
            leaveFrom="scale-100 opacity-100"
            leaveTo="scale-95 opacity-0"
          >
            <Dialog.Panel className="w-full max-w-lg rounded-lg border border-white/10 bg-[#111111] p-5 text-white shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                    Add sessions
                  </p>
                  <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                    Adjust project scope
                  </Dialog.Title>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                  aria-label="Close add sessions modal"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="mt-3 text-sm leading-6 text-neutral-400">
                V1 only supports adding sessions with added artist price. The client must accept before totals change.
              </p>

              <div className="mt-5 grid gap-4">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-200">
                    <Layers size={16} />
                    Additional sessions
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    step="1"
                    value={sessionCount}
                    onChange={(event) => setSessionCount(event.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/25"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-200">
                    <DollarSign size={16} />
                    Added artist amount
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={addedAmount}
                    onChange={(event) => setAddedAmount(event.target.value)}
                    placeholder="0"
                    className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/25"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">
                    Note for client
                  </span>
                  <textarea
                    rows={3}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Optional context for the added scope"
                    className="w-full resize-none rounded-md border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-white/25"
                  />
                </label>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-4! py-3! text-sm! font-semibold text-white transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4! py-3! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Layers size={16} />
                  {isSubmitting ? "Sending..." : "Send proposal"}
                </button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
};

export default AddSessionsAmendmentDialog;
