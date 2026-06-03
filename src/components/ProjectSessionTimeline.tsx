import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { CalendarDays, Camera, Check, Clock3, CreditCard } from "lucide-react";
import { db } from "../firebase/firebaseConfig";
import type { Booking } from "../types/Booking";

type TimelineSession = {
  id: string;
  sessionNumber: number;
  status?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  startedAt?: unknown;
  completedAt?: unknown;
  amountDue?: number;
  amountDueCents?: number;
  paidAmount?: number;
  paidAmountCents?: number;
  paymentStatus?: string;
  photoUrls?: string[];
};

type ProjectSessionTimelineProps = {
  booking: Booking | null;
  title?: string;
  className?: string;
};

const ProjectSessionTimeline = ({
  booking,
  title = "Session timeline",
  className = "",
}: ProjectSessionTimelineProps) => {
  const [sessions, setSessions] = useState<TimelineSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!booking?.id) {
      setSessions([]);
      return;
    }

    setIsLoading(true);
    const sessionsRef = collection(
      db,
      "bookingSessions",
      booking.id,
      "sessions"
    );

    return onSnapshot(
      sessionsRef,
      (snap) => {
        const rows = snap.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .map((session) => normalizeTimelineSession(session))
          .sort((a, b) => a.sessionNumber - b.sessionNumber);

        setSessions(rows);
        setIsLoading(false);
      },
      (error) => {
        console.error("Project session timeline listener failed:", error);
        setSessions([]);
        setIsLoading(false);
      }
    );
  }, [booking?.id]);

  const visibleSessions = useMemo(
    () => (sessions.length > 0 ? sessions : buildFallbackSessions(booking)),
    [booking, sessions]
  );

  if (!booking) return null;

  return (
    <section className={`rounded-lg border border-white/10 bg-white/[0.03] p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs leading-5 text-neutral-400">
            {isLoading
              ? "Loading session history..."
              : `${visibleSessions.length} planned session${
                  visibleSessions.length === 1 ? "" : "s"
                }`}
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-xs font-medium text-neutral-300">
          {booking.projectStatus || "active"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {visibleSessions.map((session) => {
          const photoCount = session.photoUrls?.length || 0;

          return (
            <article
              key={session.id}
              className="rounded-md border border-white/10 bg-black/25 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Session {session.sessionNumber}
                  </p>
                  <p className="mt-1 text-xs capitalize text-neutral-400">
                    {(session.status || "planned").replace("_", " ")}
                  </p>
                </div>
                <SessionToneBadge status={session.status} />
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <TimelineFact
                  icon={<CalendarDays size={14} />}
                  label="Scheduled"
                  value={formatScheduledTime(session)}
                />
                <TimelineFact
                  icon={<Clock3 size={14} />}
                  label="Started"
                  value={formatTimestamp(session.startedAt)}
                />
                <TimelineFact
                  icon={<Check size={14} />}
                  label="Completed"
                  value={formatTimestamp(session.completedAt)}
                />
                <TimelineFact
                  icon={<CreditCard size={14} />}
                  label="Payment"
                  value={formatPayment(session)}
                />
              </div>

              {photoCount > 0 && session.photoUrls && (
                <div className="mt-3">
                  <div className="flex items-center gap-2 text-xs text-neutral-300">
                    <Camera size={14} />
                    {photoCount} photo{photoCount === 1 ? "" : "s"} attached
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {session.photoUrls.slice(0, 3).map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt={`Session ${session.sessionNumber} record`}
                        className="h-16 w-full rounded-md border border-white/10 object-cover"
                      />
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

const TimelineFact = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) => (
  <div className="rounded-md border border-white/10 bg-white/[0.025] p-2">
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-neutral-500">
      {icon}
      {label}
    </div>
    <p className="mt-1 text-xs font-medium text-white">{value}</p>
  </div>
);

const SessionToneBadge = ({ status }: { status?: string }) => {
  const className =
    status === "completed"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : status === "in_progress"
      ? "border-sky-300/25 bg-sky-300/10 text-sky-100"
      : "border-amber-300/20 bg-amber-300/10 text-amber-100";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {status === "completed"
        ? "Done"
        : status === "in_progress"
        ? "Live"
        : "Planned"}
    </span>
  );
};

const normalizeTimelineSession = (
  session: Record<string, unknown>
): TimelineSession => ({
  ...session,
  id: String(session.id || `session-${session.sessionNumber || 1}`),
  sessionNumber: Math.max(Number(session.sessionNumber || 1), 1),
  status: typeof session.status === "string" ? session.status : undefined,
  scheduledDate:
    typeof session.scheduledDate === "string" ? session.scheduledDate : undefined,
  scheduledTime:
    typeof session.scheduledTime === "string" ? session.scheduledTime : undefined,
  photoUrls: Array.isArray(session.photoUrls)
    ? session.photoUrls.filter((url): url is string => typeof url === "string")
    : [],
});

const buildFallbackSessions = (booking: Booking | null): TimelineSession[] => {
  if (!booking) return [];

  const totalSessions = Math.max(Number(booking.estimatedSessionCount || 1), 1);
  const activeSessionNumber = Math.max(Number(booking.activeSessionNumber || 1), 1);
  const completedCount = Math.max(Number(booking.completedSessionCount || 0), 0);
  const pendingSessionNumber = Number(
    booking.pendingSessionNumber || activeSessionNumber
  );

  return Array.from({ length: totalSessions }, (_, index) => {
    const sessionNumber = index + 1;
    const isCompleted = sessionNumber <= completedCount;
    const isActive = sessionNumber === activeSessionNumber;
    const status = isCompleted
      ? "completed"
      : isActive
      ? booking.sessionStatus || "planned"
      : "planned";

    return {
      id: `fallback-session-${sessionNumber}`,
      sessionNumber,
      status,
      scheduledDate: isActive ? booking.selectedDate?.date : undefined,
      scheduledTime: isActive ? booking.selectedDate?.time : undefined,
      startedAt: isActive ? booking.sessionStartedAt : undefined,
      completedAt:
        isActive || isCompleted ? booking.sessionCompletedAt : undefined,
      amountDue: sessionNumber === pendingSessionNumber
        ? booking.pendingSessionPaymentAmount
        : undefined,
      amountDueCents: sessionNumber === pendingSessionNumber
        ? booking.pendingSessionPaymentAmountCents
        : undefined,
      paymentStatus:
        sessionNumber === pendingSessionNumber
          ? booking.remainingPaymentStatus
          : isCompleted
          ? "confirmed"
          : undefined,
      photoUrls:
        isActive && Array.isArray(booking.sessionPhotoUrls)
          ? booking.sessionPhotoUrls
          : [],
    };
  });
};

const formatScheduledTime = (session: TimelineSession) => {
  if (!session.scheduledDate || session.scheduledDate === "TBD") return "TBD";
  return session.scheduledTime
    ? `${session.scheduledDate} at ${session.scheduledTime}`
    : session.scheduledDate;
};

const formatTimestamp = (value: unknown) => {
  const date = parseTimestamp(value);
  if (!date) return "Not recorded";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const parseTimestamp = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    "seconds" in value &&
    typeof (value as { seconds?: unknown }).seconds === "number"
  ) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  return null;
};

const formatPayment = (session: TimelineSession) => {
  const amountCents =
    typeof session.amountDueCents === "number"
      ? session.amountDueCents
      : typeof session.amountDue === "number"
      ? Math.round(session.amountDue * 100)
      : typeof session.paidAmountCents === "number"
      ? session.paidAmountCents
      : typeof session.paidAmount === "number"
      ? Math.round(session.paidAmount * 100)
      : 0;
  const amountText =
    amountCents > 0
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(amountCents / 100)
      : "$0.00";
  const status = session.paymentStatus || "not_due";

  return `${amountText} - ${status.replace(/_/g, " ")}`;
};

export default ProjectSessionTimeline;
