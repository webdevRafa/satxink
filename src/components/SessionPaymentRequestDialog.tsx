import { Fragment, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { DollarSign, X } from "lucide-react";
import type { Booking } from "../types/Booking";

type SessionPaymentRequestInput = {
  amountCents: number;
  note: string;
};

type SessionPaymentRequestDialogProps = {
  booking: Booking | null;
  suggestedAmount: number;
  onClose: () => void;
  onSubmit: (
    booking: Booking,
    input: SessionPaymentRequestInput
  ) => Promise<void>;
};

const SessionPaymentRequestDialog = ({
  booking,
  suggestedAmount,
  onClose,
  onSubmit,
}: SessionPaymentRequestDialogProps) => {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!booking) return;
    setAmount(suggestedAmount > 0 ? String(suggestedAmount) : "");
    setNote("");
    setIsSubmitting(false);
  }, [booking, suggestedAmount]);

  const parsedAmount = Number(amount);
  const amountChanged =
    Number.isFinite(parsedAmount) &&
    Math.round(parsedAmount * 100) !== Math.round(suggestedAmount * 100);
  const canSubmit =
    Boolean(booking) &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    (!amountChanged || note.trim().length > 0);

  const handleSubmit = async () => {
    if (!booking || !canSubmit) return;

    setIsSubmitting(true);
    try {
      await onSubmit(booking, {
        amountCents: Math.round(parsedAmount * 100),
        note: note.trim(),
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
                    Session payment
                  </p>
                  <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                    Request installment
                  </Dialog.Title>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                  aria-label="Close payment request modal"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="mt-3 text-sm leading-6 text-neutral-400">
                Send the client a payment request before this later project
                session can begin.
              </p>

              <div className="mt-5 grid gap-4">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-200">
                    <DollarSign size={16} />
                    Amount due
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/25"
                  />
                  <span className="mt-2 block text-xs leading-5 text-neutral-500">
                    Suggested amount: ${suggestedAmount}
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">
                    Note
                  </span>
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={
                      amountChanged
                        ? "Required when changing the suggested amount"
                        : "Optional payment context"
                    }
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
                  disabled={isSubmitting || !canSubmit}
                  onClick={handleSubmit}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4! py-3! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DollarSign size={16} />
                  {isSubmitting ? "Sending..." : "Request payment"}
                </button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
};

export default SessionPaymentRequestDialog;
