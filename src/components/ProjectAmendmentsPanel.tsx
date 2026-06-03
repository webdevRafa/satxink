import { Check, Clock3, X } from "lucide-react";
import type { ProjectAmendment } from "../types/Booking";

type ViewerRole = "artist" | "client";
export type AmendmentResponse = "accepted" | "declined" | "cancelled";

type ProjectAmendmentsPanelProps = {
  amendments: ProjectAmendment[];
  viewerRole: ViewerRole;
  currentUserId?: string | null;
  onRespond: (amendmentId: string, response: AmendmentResponse) => void;
  className?: string;
};

const ProjectAmendmentsPanel = ({
  amendments,
  viewerRole,
  currentUserId,
  onRespond,
  className = "",
}: ProjectAmendmentsPanelProps) => (
  <section className={`rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 ${className}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-white">
          Pending project changes
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-50/70">
          {amendments.length > 0
            ? "Review proposals before the project schedule, scope, or pause state changes."
            : "No project amendments are waiting right now."}
        </p>
      </div>
      <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-xs font-medium text-amber-50">
        {amendments.length}
      </span>
    </div>

    {amendments.length > 0 && (
      <div className="mt-4 space-y-3">
        {amendments.map((amendment) => {
          const proposedByViewer =
            amendment.proposedByRole === viewerRole ||
            Boolean(currentUserId && amendment.proposedById === currentUserId);

          return (
            <article
              key={amendment.id}
              className="rounded-md border border-white/10 bg-black/25 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {getAmendmentTitle(amendment)}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-amber-50/75">
                    {getAmendmentDescription(amendment)}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-neutral-300">
                  <Clock3 size={13} />
                  {proposedByViewer ? "Sent" : "Needs review"}
                </span>
              </div>

              {amendment.message && (
                <p className="mt-3 rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-neutral-300">
                  {amendment.message}
                </p>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {proposedByViewer ? (
                  <button
                    type="button"
                    onClick={() => onRespond(amendment.id, "cancelled")}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-black/25 px-4! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10 sm:col-span-2"
                  >
                    <X size={16} />
                    Cancel proposal
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onRespond(amendment.id, "accepted")}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4! py-2.5! text-sm! font-semibold text-black transition hover:bg-white/85"
                    >
                      <Check size={16} />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => onRespond(amendment.id, "declined")}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-black/25 px-4! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10"
                    >
                      <X size={16} />
                      Decline
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    )}
  </section>
);

const getAmendmentTitle = (amendment: ProjectAmendment) => {
  if (amendment.type === "add_sessions") return "Add sessions / adjust scope";
  if (amendment.type === "schedule_next_session") return "Schedule next session";
  if (amendment.type === "pause_project") return "Pause project";
  return "Resume project";
};

const getAmendmentDescription = (amendment: ProjectAmendment) => {
  if (amendment.type === "add_sessions") {
    return `${amendment.additionalSessionCount || 0} added session${
      amendment.additionalSessionCount === 1 ? "" : "s"
    } for ${formatCents(amendment.addedArtistAmountCents)}. New project total: ${formatCents(
      amendment.proposedPriceCents
    )}.`;
  }

  if (amendment.type === "schedule_next_session") {
    const date = amendment.proposedSelectedDate;
    return date?.date && date?.time
      ? `Proposed appointment: ${date.date} at ${date.time}.`
      : "A new appointment time was proposed.";
  }

  if (amendment.type === "pause_project") {
    return amendment.pausedUntil
      ? `Pause this project until ${amendment.pausedUntil}.`
      : "Pause this project for now.";
  }

  return "Resume this project.";
};

const formatCents = (amountCents?: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amountCents || 0) / 100);

export default ProjectAmendmentsPanel;
