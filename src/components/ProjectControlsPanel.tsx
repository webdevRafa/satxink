import {
  CalendarDays,
  Clock3,
  CreditCard,
  Layers,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Booking, ProjectAmendment } from "../types/Booking";
import ProjectAmendmentsPanel, {
  type AmendmentResponse,
} from "./ProjectAmendmentsPanel";
import ProjectSessionTimeline from "./ProjectSessionTimeline";

type ViewerRole = "artist" | "client";

type ProjectControlsPanelProps = {
  booking: Booking;
  viewerRole: ViewerRole;
  currentUserId?: string | null;
  amendments: ProjectAmendment[];
  onRespondToAmendment: (
    amendmentId: string,
    response: AmendmentResponse
  ) => void;
  onAddSessions?: () => void;
  onPlanNextSession?: () => void;
  onPauseProject?: () => void;
  onResumeProject?: () => void;
  onPayPlatformFee?: () => void;
  className?: string;
};

const ProjectControlsPanel = ({
  booking,
  viewerRole,
  currentUserId,
  amendments,
  onRespondToAmendment,
  onAddSessions,
  onPlanNextSession,
  onPauseProject,
  onResumeProject,
  onPayPlatformFee,
  className = "",
}: ProjectControlsPanelProps) => {
  const projectStatus = booking.projectStatus || "active";
  const isPaused = projectStatus === "paused";
  const isLocked =
    booking.status === "pending_payment" ||
    booking.status === "cancelled" ||
    projectStatus === "completed";
  const pendingPlatformFeeCents = Number(booking.pendingPlatformFeeCents || 0);
  const canUseControls = !isLocked;

  return (
    <section className={`mt-5 space-y-4 ${className}`}>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">
              Project controls
            </p>
            <p className="mt-1 text-sm leading-6 text-neutral-400">
              Manage additive scope, session timing, and project availability from the record.
            </p>
          </div>
          <ProjectStatusBadge status={projectStatus} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ProjectFact
            icon={<CalendarDays size={16} />}
            label="Current appointment"
            value={formatAppointment(booking.selectedDate)}
          />
          <ProjectFact
            icon={<Layers size={16} />}
            label="Sessions"
            value={`${Number(booking.completedSessionCount || 0)}/${getEstimatedSessionCount(
              booking
            )} complete`}
          />
          <ProjectFact
            icon={<Clock3 size={16} />}
            label="Next session"
            value={`Session ${getActiveSessionNumber(booking)} of ${getEstimatedSessionCount(
              booking
            )}`}
          />
          <ProjectFact
            icon={<CreditCard size={16} />}
            label="Pending platform fee"
            value={formatCents(pendingPlatformFeeCents)}
          />
        </div>

        {pendingPlatformFeeCents > 0 && (
          <div className="mt-4 rounded-md border border-sky-300/20 bg-sky-300/10 p-3">
            <p className="text-sm font-semibold text-white">
              Platform fee pending
            </p>
            <p className="mt-1 text-sm leading-6 text-sky-50/75">
              SATX Ink needs the added platform fee before the next session can start.
            </p>
            {onPayPlatformFee && (
              <button
                type="button"
                onClick={onPayPlatformFee}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4! py-2.5! text-sm! font-semibold text-black transition hover:bg-white/85"
              >
                <CreditCard size={16} />
                Pay platform fee
              </button>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {onAddSessions && (
            <button
              type="button"
              disabled={!canUseControls}
              onClick={onAddSessions}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-black/25 px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Layers size={16} />
              Add sessions / adjust scope
            </button>
          )}

          {onPlanNextSession && (
            <button
              type="button"
              disabled={!canUseControls}
              onClick={onPlanNextSession}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-black/25 px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <CalendarDays size={16} />
              {viewerRole === "artist" ? "Plan next session" : "Request next session"}
            </button>
          )}

          {isPaused ? (
            <button
              type="button"
              disabled={!canUseControls || !onResumeProject}
              onClick={onResumeProject}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-3! py-2.5! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <PlayCircle size={16} />
              Resume project
            </button>
          ) : (
            <button
              type="button"
              disabled={!canUseControls || !onPauseProject}
              onClick={onPauseProject}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-black/25 px-3! py-2.5! text-sm! font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <PauseCircle size={16} />
              {viewerRole === "client" ? "Take a break" : "Pause project"}
            </button>
          )}
        </div>

        {isLocked && (
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            Project tools unlock after payment and are unavailable for cancelled or completed projects.
          </p>
        )}
      </div>

      <ProjectAmendmentsPanel
        amendments={amendments}
        viewerRole={viewerRole}
        currentUserId={currentUserId}
        onRespond={onRespondToAmendment}
      />

      <ProjectSessionTimeline booking={booking} />
    </section>
  );
};

const ProjectFact = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) => (
  <div className="rounded-md border border-white/10 bg-black/25 p-3">
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-neutral-500">
      {icon}
      {label}
    </div>
    <p className="mt-2 text-sm font-medium text-white">{value}</p>
  </div>
);

const ProjectStatusBadge = ({ status }: { status: string }) => {
  const className =
    status === "paused"
      ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
      : status === "completed"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : "border-sky-300/20 bg-sky-300/10 text-sky-100";

  return (
    <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${className}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
};

const getEstimatedSessionCount = (booking: Booking) =>
  Math.max(Number(booking.estimatedSessionCount || 1), 1);

const getActiveSessionNumber = (booking: Booking) =>
  Math.max(Number(booking.activeSessionNumber || 1), 1);

const formatCents = (amountCents?: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amountCents || 0) / 100);

const formatAppointment = (date?: { date: string; time: string }) => {
  if (!date?.date || !date?.time || date.date === "TBD") return "TBD";

  const [year, month, day] = date.date.split("-").map(Number);
  const [hours, minutes] = date.time.split(":").map(Number);

  return new Date(year, month - 1, day, hours, minutes).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default ProjectControlsPanel;
