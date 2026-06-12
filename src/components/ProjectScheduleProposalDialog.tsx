import { Fragment, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { CalendarDays, X } from "lucide-react";
import type { Booking } from "../types/Booking";
import QuarterHourTimeSelect from "./ui/QuarterHourTimeSelect";
import {
  getTodayDateInputValue,
  isPastDateInputValue,
} from "../utils/dateInputGuards";

type ScheduleProposalInput = {
  date: string;
  time: string;
  message: string;
};

type ProjectScheduleProposalDialogProps = {
  booking: Booking | null;
  viewerRole: "artist" | "client";
  onClose: () => void;
  onSubmit: (booking: Booking, input: ScheduleProposalInput) => Promise<void>;
};

const ProjectScheduleProposalDialog = ({
  booking,
  viewerRole,
  onClose,
  onSubmit,
}: ProjectScheduleProposalDialogProps) => {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const today = getTodayDateInputValue();

  useEffect(() => {
    if (!booking) return;
    setDate("");
    setTime("");
    setMessage("");
    setIsSubmitting(false);
  }, [booking]);

  const handleSubmit = async () => {
    if (!booking || !date || !time || isPastDateInputValue(date, today)) return;

    setIsSubmitting(true);
    try {
      await onSubmit(booking, {
        date,
        time,
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
                    {viewerRole === "artist" ? "Plan session" : "Request session"}
                  </p>
                  <Dialog.Title className="mt-1 text-xl! font-semibold! text-white">
                    {viewerRole === "artist"
                      ? "Propose next session"
                      : "Request next session"}
                  </Dialog.Title>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                  aria-label="Close schedule proposal modal"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="mt-3 text-sm leading-6 text-neutral-400">
                The appointment is not changed until the other side accepts this proposal.
              </p>

              <div className="mt-5 grid gap-4">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-200">
                    <CalendarDays size={16} />
                    Date
                  </span>
                  <input
                    type="date"
                    min={today}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-white/25"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">
                    Time
                  </span>
                  <QuarterHourTimeSelect
                    value={time}
                    onChange={setTime}
                    placeholder="Select a time"
                    buttonClassName="border-white/10 bg-black/25 py-3 text-white"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-200">
                    Note
                  </span>
                  <textarea
                    rows={3}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Optional scheduling context"
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
                  disabled={isSubmitting || !date || !time || isPastDateInputValue(date, today)}
                  onClick={handleSubmit}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4! py-3! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CalendarDays size={16} />
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

export default ProjectScheduleProposalDialog;
