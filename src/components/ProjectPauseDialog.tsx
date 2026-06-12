import { Fragment, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { PauseCircle, PlayCircle, X } from "lucide-react";
import type { Booking } from "../types/Booking";
import {
  getTodayDateInputValue,
  isPastDateInputValue,
} from "../utils/dateInputGuards";

type PauseProjectInput = {
  reason: string;
  pausedUntil: string;
};

type ProjectPauseDialogProps = {
  booking: Booking | null;
  mode: "pause" | "resume";
  viewerRole: "artist" | "client";
  onClose: () => void;
  onSubmit: (booking: Booking, input: PauseProjectInput) => Promise<void>;
};

const ProjectPauseDialog = ({
  booking,
  mode,
  viewerRole,
  onClose,
  onSubmit,
}: ProjectPauseDialogProps) => {
  const [reason, setReason] = useState("");
  const [pausedUntil, setPausedUntil] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const today = getTodayDateInputValue();
  const isPause = mode === "pause";

  useEffect(() => {
    if (!booking) return;
    setReason("");
    setPausedUntil("");
    setIsSubmitting(false);
  }, [booking, mode]);

  const handleSubmit = async () => {
    if (!booking) return;
    if (isPause && pausedUntil && isPastDateInputValue(pausedUntil, today)) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(booking, {
        reason: reason.trim(),
        pausedUntil: isPause ? pausedUntil : "",
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
                    {isPause
                      ? viewerRole === "client"
                        ? "Take a break"
                        : "Pause project"
                      : "Resume project"}
                  </p>
                  <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                    {isPause ? "Pause this project" : "Resume this project"}
                  </Dialog.Title>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                  aria-label="Close project pause modal"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="mt-3 text-sm leading-6 text-neutral-400">
                {isPause
                  ? "This updates the project status only. It does not create a checkout or change payment history."
                  : "This moves the project back to active without changing pricing or payment history."}
              </p>

              <div className="mt-5 grid gap-4">
                {isPause && (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-neutral-200">
                      Pause until
                    </span>
                    <input
                      type="date"
                      min={today}
                      value={pausedUntil}
                      onChange={(event) => setPausedUntil(event.target.value)}
                      className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/25"
                    />
                  </label>
                )}

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">
                    {isPause ? "Reason" : "Resume note"}
                  </span>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={isPause ? "Optional pause reason" : "Optional resume note"}
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
                  disabled={
                    isSubmitting ||
                    (isPause &&
                      Boolean(pausedUntil) &&
                      isPastDateInputValue(pausedUntil, today))
                  }
                  onClick={handleSubmit}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4! py-3! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPause ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                  {isSubmitting ? "Saving..." : isPause ? "Pause project" : "Resume project"}
                </button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ProjectPauseDialog;
