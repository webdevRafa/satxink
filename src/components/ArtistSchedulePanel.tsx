import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from "lucide-react";

import type { Booking } from "../types/Booking";
import { getClientNameParts } from "../utils/clientDisplayName";

type ArtistSchedulePanelProps = {
  bookings: Booking[];
  onOpenRecord: (booking: Booking) => void;
  onOpenSessions: () => void;
};

type ScheduleEvent = {
  booking: Booking;
  dateKey: string;
  durationMinutes: number;
  end: Date;
  start: Date;
  title: string;
};

const HOUR_HEIGHT = 72;
const DEFAULT_DURATION_MINUTES = 120;
const DAY_COUNT = 7;
const SCHEDULE_START_HOUR = 8;
const SCHEDULE_END_HOUR = 24;

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const startOfWeek = (date: Date) => {
  const next = startOfDay(date);
  const mondayOffset = (next.getDay() + 6) % DAY_COUNT;
  next.setDate(next.getDate() - mondayOffset);
  return next;
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const addMonths = (date: Date, amount: number) => {
  const next = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  next.setHours(0, 0, 0, 0);
  return next;
};

const toDateKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const toMonthKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
  ].join("-");

const parseBookingStart = (booking: Booking) => {
  const { date, time } = booking.selectedDate || {};
  if (!date || !time || date === "TBD" || time === "TBD") return null;

  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return null;
  }

  const start = new Date(year, month - 1, day, hours, minutes);
  return Number.isNaN(start.getTime()) ? null : start;
};

const getDurationMinutes = (booking: Booking) => {
  const estimatedHours = booking.estimatedHoursPerSession;
  if (typeof estimatedHours !== "number" || estimatedHours <= 0) {
    return DEFAULT_DURATION_MINUTES;
  }

  return Math.min(Math.max(Math.round(estimatedHours * 60), 60), 8 * 60);
};

const getAppointmentTitle = (booking: Booking) => {
  if (booking.flashTitle?.trim()) return booking.flashTitle.trim();
  return "Flash appointment";
};

const getStatusPresentation = (booking: Booking) => {
  if (booking.sessionStatus === "in_progress") {
    return {
      label: "In progress",
      classes:
        "border-red-300/40 bg-red-500/15 text-red-50 hover:bg-red-500/20",
      dot: "bg-red-300",
    };
  }

  if (booking.sessionStatus === "completed") {
    return {
      label: "Completed",
      classes:
        "border-emerald-300/30 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15",
      dot: "bg-emerald-300",
    };
  }

  if (booking.status === "pending_payment") {
    return {
      label: "Deposit pending",
      classes:
        "border-amber-300/35 bg-amber-300/10 text-amber-50 hover:bg-amber-300/15",
      dot: "bg-amber-300",
    };
  }

  if (booking.status === "paid") {
    return {
      label: "Paid",
      classes:
        "border-violet-300/30 bg-violet-300/10 text-violet-50 hover:bg-violet-300/15",
      dot: "bg-violet-300",
    };
  }

  return {
    label: "Confirmed",
    classes:
      "border-sky-300/30 bg-sky-300/10 text-sky-50 hover:bg-sky-300/15",
    dot: "bg-sky-300",
  };
};

const formatTime = (date: Date) =>
  date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

const formatHour = (hour: number) =>
  hour === SCHEDULE_END_HOUR
    ? "12 AM"
    : new Date(2026, 0, 1, hour).toLocaleTimeString("en-US", {
        hour: "numeric",
      });

const formatWeekRange = (weekStart: Date) => {
  const weekEnd = addDays(weekStart, DAY_COUNT - 1);
  const startLabel = weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endLabel = weekEnd.toLocaleDateString("en-US", {
    month:
      weekStart.getMonth() === weekEnd.getMonth() ? undefined : "short",
    day: "numeric",
    year:
      weekStart.getFullYear() === weekEnd.getFullYear()
        ? undefined
        : "numeric",
  });

  return `${startLabel} – ${endLabel}, ${weekEnd.getFullYear()}`;
};

const getScrollTarget = (
  events: ScheduleEvent[],
  startHour: number,
  now: Date,
  includeNow: boolean
) => {
  const firstEventMinutes = events.length
    ? events[0].start.getHours() * 60 + events[0].start.getMinutes()
    : null;
  const nowMinutes = includeNow
    ? now.getHours() * 60 + now.getMinutes()
    : null;
  const focusMinutes =
    firstEventMinutes === null
      ? nowMinutes ?? startHour * 60
      : nowMinutes === null
        ? firstEventMinutes
        : Math.min(firstEventMinutes, nowMinutes);

  return Math.max(
    0,
    ((focusMinutes - startHour * 60) / 60) * HOUR_HEIGHT - HOUR_HEIGHT
  );
};

const getEventLayouts = (events: ScheduleEvent[]) => {
  const layouts = new Map<
    string,
    { columnCount: number; columnIndex: number }
  >();
  const clusters: ScheduleEvent[][] = [];

  events.forEach((event) => {
    const currentCluster = clusters[clusters.length - 1];
    const clusterEnd = currentCluster?.reduce(
      (latest, item) => Math.max(latest, item.end.getTime()),
      0
    );

    if (!currentCluster || event.start.getTime() >= clusterEnd) {
      clusters.push([event]);
    } else {
      currentCluster.push(event);
    }
  });

  clusters.forEach((cluster) => {
    const columnEndTimes: number[] = [];
    const assignedColumns = cluster.map((event) => {
      let columnIndex = columnEndTimes.findIndex(
        (endTime) => endTime <= event.start.getTime()
      );
      if (columnIndex === -1) {
        columnIndex = columnEndTimes.length;
      }
      columnEndTimes[columnIndex] = event.end.getTime();
      return { event, columnIndex };
    });
    const columnCount = Math.max(columnEndTimes.length, 1);

    assignedColumns.forEach(({ event, columnIndex }) => {
      layouts.set(event.booking.id, { columnCount, columnIndex });
    });
  });

  return layouts;
};

const ArtistSchedulePanel = ({
  bookings,
  onOpenRecord,
  onOpenSessions,
}: ArtistSchedulePanelProps) => {
  const today = useMemo(() => startOfDay(new Date()), []);
  const todayKey = toDateKey(today);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const desktopScrollerRef = useRef<HTMLDivElement | null>(null);
  const mobileScrollerRef = useRef<HTMLDivElement | null>(null);

  const scheduledEvents = useMemo(
    () =>
      bookings
        .filter((booking) => booking.status !== "cancelled")
        .map((booking): ScheduleEvent | null => {
          const start = parseBookingStart(booking);
          if (!start) return null;

          const durationMinutes = getDurationMinutes(booking);
          return {
            booking,
            dateKey: toDateKey(start),
            durationMinutes,
            end: new Date(start.getTime() + durationMinutes * 60 * 1000),
            start,
            title: getAppointmentTitle(booking),
          };
        })
        .filter((event): event is ScheduleEvent => Boolean(event))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [bookings]
  );

  const unscheduledBookings = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status !== "cancelled" &&
          booking.sessionStatus !== "completed" &&
          !parseBookingStart(booking)
      ),
    [bookings]
  );

  const weekDays = useMemo(
    () =>
      Array.from({ length: DAY_COUNT }, (_, index) =>
        addDays(weekStart, index)
      ),
    [weekStart]
  );
  const weekStartKey = toDateKey(weekStart);
  const weekEndKey = toDateKey(weekDays[DAY_COUNT - 1]);
  const weekEvents = useMemo(
    () =>
      scheduledEvents.filter(
        (event) =>
          event.dateKey >= weekStartKey && event.dateKey <= weekEndKey
      ),
    [scheduledEvents, weekEndKey, weekStartKey]
  );
  const selectedDayEvents = useMemo(
    () => weekEvents.filter((event) => event.dateKey === selectedDateKey),
    [selectedDateKey, weekEvents]
  );
  const startHour = SCHEDULE_START_HOUR;
  const endHour = SCHEDULE_END_HOUR;
  const visibleMonthDate = useMemo(() => {
    const [year, month, day] = selectedDateKey.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [selectedDateKey]);
  const visibleMonthKey = toMonthKey(visibleMonthDate);
  const monthOptions = useMemo(() => {
    const optionStart = addMonths(today, -12);
    const options = Array.from({ length: 37 }, (_, index) =>
      addMonths(optionStart, index)
    );

    if (!options.some((date) => toMonthKey(date) === visibleMonthKey)) {
      options.push(
        new Date(
          visibleMonthDate.getFullYear(),
          visibleMonthDate.getMonth(),
          1
        )
      );
      options.sort((a, b) => a.getTime() - b.getTime());
    }

    return options;
  }, [today, visibleMonthDate, visibleMonthKey]);

  const hourLabels = useMemo(
    () =>
      Array.from(
        { length: endHour - startHour + 1 },
        (_, index) => startHour + index
      ),
    [endHour, startHour]
  );
  const gridHeight = (endHour - startHour) * HOUR_HEIGHT;
  const bookedHours = weekEvents.reduce(
    (total, event) => total + event.durationMinutes / 60,
    0
  );
  const nextEvent = scheduledEvents.find(
    (event) => event.end.getTime() >= Date.now()
  );

  useEffect(() => {
    if (
      selectedDateKey < weekStartKey ||
      selectedDateKey > weekEndKey
    ) {
      setSelectedDateKey(weekStartKey);
    }
  }, [selectedDateKey, weekEndKey, weekStartKey]);

  useEffect(() => {
    const now = new Date();
    const weekContainsToday =
      todayKey >= weekStartKey && todayKey <= weekEndKey;
    const desktopTarget = getScrollTarget(
      weekEvents,
      startHour,
      now,
      weekContainsToday
    );
    const mobileTarget = getScrollTarget(
      selectedDayEvents,
      startHour,
      now,
      selectedDateKey === todayKey
    );

    if (desktopScrollerRef.current) {
      desktopScrollerRef.current.scrollTop = desktopTarget;
    }
    if (mobileScrollerRef.current) {
      mobileScrollerRef.current.scrollTop = mobileTarget;
    }
  }, [
    selectedDateKey,
    selectedDayEvents,
    startHour,
    todayKey,
    weekEndKey,
    weekEvents,
    weekStartKey,
  ]);

  const moveWeek = (amount: number) => {
    const nextWeek = addDays(weekStart, amount * DAY_COUNT);
    setWeekStart(nextWeek);
    setSelectedDateKey(toDateKey(nextWeek));
  };

  const goToToday = () => {
    setWeekStart(startOfWeek(today));
    setSelectedDateKey(todayKey);
  };

  const jumpToMonth = (monthKey: string) => {
    const [year, month] = monthKey.split("-").map(Number);
    const targetDate = new Date(year, month - 1, 1);
    setWeekStart(startOfWeek(targetDate));
    setSelectedDateKey(toDateKey(targetDate));
  };

  return (
    <section className="mt-6 flex w-full min-w-0 max-w-[1400px] flex-col gap-4">
      <div className="order-1 rounded-xl border border-white/10 bg-[#101010]/95 p-3.5 shadow-[0_18px_60px_rgba(0,0,0,0.22)] sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-300">
              <CalendarDays size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl! font-semibold text-white sm:text-2xl!">
                Schedule
              </h1>
              <p className="mt-0.5 text-xs leading-5 text-neutral-400 sm:text-sm">
                Weekly flash appointments at a glance.
              </p>
            </div>
          </div>

          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:flex lg:items-end lg:justify-end">
            <label className="min-w-0">
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Jump to month
              </span>
              <select
                value={visibleMonthKey}
                onChange={(event) => jumpToMonth(event.target.value)}
                className="h-9 w-full min-w-0 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm font-semibold text-neutral-200 outline-none transition hover:border-white/25 focus:border-white/30 focus:ring-2 focus:ring-white/10 sm:min-w-40"
                aria-label="Jump to month"
              >
                {monthOptions.map((month) => (
                  <option
                    key={toMonthKey(month)}
                    value={toMonthKey(month)}
                    className="bg-neutral-950 text-white"
                  >
                    {month.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Week navigation
              </span>
              <div
                className="grid grid-cols-[36px_minmax(0,1fr)_36px] gap-1.5 sm:grid-cols-[36px_auto_36px]"
                aria-label="Week navigation"
              >
                <button
                  type="button"
                  onClick={() => moveWeek(-1)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] p-0! text-neutral-300 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
                  aria-label="Previous week"
                  title="Previous week"
                >
                  <ChevronLeft size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={goToToday}
                  className="min-h-9! rounded-lg! border border-white/10 bg-white/[0.035] px-4! py-1.5! text-sm! font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.07]"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => moveWeek(1)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] p-0! text-neutral-300 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
                  aria-label="Next week"
                  title="Next week"
                >
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Week of
            </span>
            <p className="text-sm font-semibold text-white sm:text-base">
              {formatWeekRange(weekStart)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-neutral-400 sm:justify-end">
            <ScheduleLegend color="bg-sky-300" label="Confirmed" />
            <ScheduleLegend color="bg-amber-300" label="Deposit pending" />
            <ScheduleLegend color="bg-violet-300" label="Paid" />
            <ScheduleLegend color="bg-red-300" label="In progress" />
            <ScheduleLegend color="bg-emerald-300" label="Completed" />
          </div>
        </div>
      </div>

      <div className="order-3 rounded-xl border border-white/10 bg-[#101010]/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-5 md:order-2">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          <ScheduleStat
            label="This week"
            value={`${weekEvents.length}`}
            detail={weekEvents.length === 1 ? "appointment" : "appointments"}
          />
          <ScheduleStat
            label="Booked time"
            value={`${Number.isInteger(bookedHours) ? bookedHours : bookedHours.toFixed(1)}h`}
            detail="estimated"
          />
          <ScheduleStat
            className="col-span-2 lg:col-span-1"
            label="Next up"
            value={
              nextEvent
                ? nextEvent.start.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "Clear"
            }
            detail={
              nextEvent
                ? `${formatTime(nextEvent.start)} · ${
                    getClientNameParts(nextEvent.booking).fullName
                  }`
                : "No upcoming work"
            }
          />
        </div>

        {unscheduledBookings.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.065] p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-300/10 text-amber-200">
                <CalendarX2 size={17} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-amber-50">
                  {unscheduledBookings.length}{" "}
                  {unscheduledBookings.length === 1
                    ? "session needs"
                    : "sessions need"}{" "}
                  a date
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-50/65">
                  Schedule outstanding work from the Sessions workspace so it
                  appears on this calendar.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSessions}
              className="ml-11 inline-flex min-h-0! w-fit shrink-0 items-center gap-2 rounded-lg! border border-amber-100/15 bg-amber-50/10 px-3! py-2! text-xs! font-semibold text-amber-50 transition hover:border-amber-100/30 hover:bg-amber-50/15 sm:ml-0"
            >
              Review sessions
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="order-2 rounded-xl border border-white/10 bg-[#0d0d0d] shadow-[0_18px_60px_rgba(0,0,0,0.25)] md:order-3">
        <div className="border-b border-white/10 p-3 md:hidden">
          <div className="grid grid-cols-7 gap-1" aria-label="Select schedule day">
            {weekDays.map((day) => {
              const dateKey = toDateKey(day);
              const isSelected = dateKey === selectedDateKey;
              const eventCount = weekEvents.filter(
                (event) => event.dateKey === dateKey
              ).length;

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDateKey(dateKey)}
                  className={`relative flex min-h-14! min-w-0 flex-col items-center justify-center rounded-lg! border px-0! py-1.5! transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                    isSelected
                      ? "border-white/25 bg-white text-black"
                      : dateKey === todayKey
                        ? "border-red-300/30 bg-red-500/10 text-red-50"
                        : "border-white/8 bg-white/[0.025] text-neutral-400 hover:border-white/20 hover:text-white"
                  }`}
                  aria-pressed={isSelected}
                  aria-label={`${day.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}, ${eventCount} ${
                    eventCount === 1 ? "appointment" : "appointments"
                  }`}
                >
                  <span className="text-[9px] font-semibold uppercase">
                    {day.toLocaleDateString("en-US", { weekday: "narrow" })}
                  </span>
                  <span className="mt-0.5 text-sm font-bold">
                    {day.getDate()}
                  </span>
                  {eventCount > 0 && (
                    <span
                      className={`absolute bottom-1 h-1 w-1 rounded-full ${
                        isSelected ? "bg-black/60" : "bg-sky-300"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div
          ref={mobileScrollerRef}
          className="request-modal-scrollbar max-h-[68vh] overflow-y-auto md:hidden"
        >
          <div
            className="grid grid-cols-[54px_minmax(0,1fr)]"
            style={{ height: gridHeight }}
          >
            <TimeRail
              endHour={endHour}
              hourLabels={hourLabels}
              startHour={startHour}
            />
            <ScheduleDayColumn
              date={weekDays.find(
                (day) => toDateKey(day) === selectedDateKey
              ) || weekDays[0]}
              events={selectedDayEvents}
              gridHeight={gridHeight}
              onOpenRecord={onOpenRecord}
              startHour={startHour}
              todayKey={todayKey}
            />
          </div>
        </div>

        <div
          ref={desktopScrollerRef}
          className="request-modal-scrollbar hidden max-h-[72vh] overflow-auto md:block"
        >
          <div className="min-w-[980px]">
            <div className="sticky top-0 z-30 grid grid-cols-[64px_repeat(7,minmax(126px,1fr))] border-b border-white/10 bg-[#111111]/95 backdrop-blur-xl">
              <div className="sticky left-0 z-40 flex items-center justify-center border-r border-white/10 bg-[#111111] py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                Time
              </div>
              {weekDays.map((day) => {
                const dateKey = toDateKey(day);
                const isToday = dateKey === todayKey;
                return (
                  <div
                    key={dateKey}
                    className={`border-r border-white/8 px-2 py-3 text-center last:border-r-0 ${
                      isToday ? "bg-red-500/[0.07]" : ""
                    }`}
                  >
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        isToday ? "text-red-300" : "text-neutral-500"
                      }`}
                    >
                      {day.toLocaleDateString("en-US", { weekday: "short" })}
                    </p>
                    <p
                      className={`mt-1 text-lg font-semibold ${
                        isToday ? "text-white" : "text-neutral-300"
                      }`}
                    >
                      {day.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            <div
              className="grid grid-cols-[64px_repeat(7,minmax(126px,1fr))]"
              style={{ height: gridHeight }}
            >
              <TimeRail
                endHour={endHour}
                hourLabels={hourLabels}
                startHour={startHour}
              />
              {weekDays.map((day) => {
                const dateKey = toDateKey(day);
                return (
                  <ScheduleDayColumn
                    key={dateKey}
                    date={day}
                    events={weekEvents.filter(
                      (event) => event.dateKey === dateKey
                    )}
                    gridHeight={gridHeight}
                    onOpenRecord={onOpenRecord}
                    startHour={startHour}
                    todayKey={todayKey}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const ScheduleLegend = ({
  color,
  label,
}: {
  color: string;
  label: string;
}) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
    {label}
  </span>
);

const ScheduleStat = ({
  className = "",
  detail,
  label,
  value,
}: {
  className?: string;
  detail: string;
  label: string;
  value: string;
}) => (
  <div
    className={`min-w-0 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3 ${className}`}
  >
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      {label}
    </p>
    <div className="mt-1 flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 text-xl font-semibold text-white">{value}</span>
      <span className="min-w-0 truncate text-xs text-neutral-500">{detail}</span>
    </div>
  </div>
);

const TimeRail = ({
  endHour,
  hourLabels,
  startHour,
}: {
  endHour: number;
  hourLabels: number[];
  startHour: number;
}) => (
  <div className="sticky left-0 z-20 border-r border-white/10 bg-[#0d0d0d]">
    {hourLabels.map((hour) => (
      <span
        key={hour}
        className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-neutral-600"
        style={{
          top:
            hour === endHour
              ? (endHour - startHour) * HOUR_HEIGHT - 1
              : (hour - startHour) * HOUR_HEIGHT,
        }}
      >
        {formatHour(hour)}
      </span>
    ))}
  </div>
);

const ScheduleDayColumn = ({
  date,
  events,
  gridHeight,
  onOpenRecord,
  startHour,
  todayKey,
}: {
  date: Date;
  events: ScheduleEvent[];
  gridHeight: number;
  onOpenRecord: (booking: Booking) => void;
  startHour: number;
  todayKey: string;
}) => {
  const dateKey = toDateKey(date);
  const eventLayouts = getEventLayouts(events);
  const isToday = dateKey === todayKey;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeTop =
    ((nowMinutes - startHour * 60) / 60) * HOUR_HEIGHT;
  const showCurrentTime =
    isToday && currentTimeTop >= 0 && currentTimeTop <= gridHeight;

  return (
    <div
      className={`relative min-w-0 border-r border-white/8 last:border-r-0 ${
        isToday ? "bg-red-500/[0.018]" : ""
      }`}
    >
      {Array.from(
        { length: Math.ceil(gridHeight / HOUR_HEIGHT) + 1 },
        (_, index) => (
          <span
            key={index}
            className="absolute inset-x-0 border-t border-white/[0.055]"
            style={{ top: index * HOUR_HEIGHT }}
          />
        )
      )}

      {events.length === 0 && (
        <div className="absolute inset-x-3 top-5 rounded-lg border border-dashed border-white/8 px-3 py-4 text-center text-xs text-neutral-600 md:hidden">
          No appointments this day
        </div>
      )}

      {events.map((event) => {
        const startMinutes =
          event.start.getHours() * 60 + event.start.getMinutes();
        const top =
          ((startMinutes - startHour * 60) / 60) * HOUR_HEIGHT + 3;
        const height = Math.max(
          54,
          (event.durationMinutes / 60) * HOUR_HEIGHT - 6
        );
        const clientName = getClientNameParts(event.booking).fullName;
        const presentation = getStatusPresentation(event.booking);
        const layout = eventLayouts.get(event.booking.id) || {
          columnCount: 1,
          columnIndex: 0,
        };
        const columnWidth = 100 / layout.columnCount;

        return (
          <button
            key={event.booking.id}
            type="button"
            onClick={() => onOpenRecord(event.booking)}
            className={`group absolute min-w-0 overflow-hidden rounded-lg! border p-2! text-left shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition hover:z-10 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.28)] focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${presentation.classes}`}
            style={{
              height: Math.min(height, gridHeight - top - 3),
              left: `calc(${layout.columnIndex * columnWidth}% + 4px)`,
              top: Math.max(3, top),
              width: `calc(${columnWidth}% - 8px)`,
            }}
            aria-label={`${clientName}, ${event.title}, ${formatTime(
              event.start
            )} to ${formatTime(event.end)}, ${presentation.label}`}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-75">
              <span className={`h-1.5 w-1.5 rounded-full ${presentation.dot}`} />
              {formatTime(event.start)}–{formatTime(event.end)}
            </span>
            <span className="mt-1 block truncate text-xs font-bold sm:text-sm">
              {clientName}
            </span>
            <span className="mt-0.5 block truncate text-[11px] opacity-75">
              {event.title}
            </span>
            {height >= 86 && (
              <span className="mt-1.5 flex min-w-0 items-center gap-1 text-[10px] opacity-65">
                <MapPin size={11} className="shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {event.booking.shopName || "Private studio"}
                </span>
              </span>
            )}
          </button>
        );
      })}

      {showCurrentTime && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 border-t border-red-400"
          style={{ top: currentTimeTop }}
          aria-hidden="true"
        >
          <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.12)]" />
        </div>
      )}
    </div>
  );
};

export default ArtistSchedulePanel;
