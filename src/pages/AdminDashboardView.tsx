import { Fragment, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebase/firebaseConfig";
import {
  Users,
  Inbox,
  ReceiptText,
  CalendarCheck,
  Clock,
  Copy,
  Code,
  FileDown,
  Star,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import toast from "react-hot-toast";

/**
 * AdminDashboardView
 *
 * This component exposes a hidden administrative dashboard for the SATX Ink
 * platform. Only users with an `admin` role stored in the Firestore
 * `users` collection can access this view. The admin dashboard surfaces
 * read‑only tables for artists, booking requests, offers, bookings and
 * sessions. Each table supports a modal preview of the underlying record.
 *
 * The UI intentionally mirrors the dark gradient aesthetic used in the
 * existing client and artist dashboards. Navigation appears as a
 * sidebar on medium+ viewports and collapses into tabs on mobile. Table
 * rows are clickable to reveal a modal containing all data for the
 * selected record. If there are too many fields to comfortably fit in
 * the preview, administrators can scroll the modal content.
 */

// Define the available admin views. Keeping this as a type helps with
// compile‑time checking and ensures our navigation stays in sync.
type AdminView = "artists" | "requests" | "offers" | "bookings" | "sessions";
type StripeFilter = "all" | "connected" | "not_connected";
type FeaturedFilter = "all" | "featured" | "not_featured";
type ArtistAttentionFilter = "all" | "needs_stripe" | "missing_name";
type RequestStatusFilter = "all" | "waiting" | "responded" | "other";
type RequestAttentionFilter = "all" | "waiting_24h";
type OfferStatusFilter = "all" | "waiting" | "accepted" | "declined" | "other";
type OfferAttentionFilter = "all" | "waiting_24h";
type BookingStatusFilter =
  | "all"
  | "pending_payment"
  | "deposit_paid"
  | "paid"
  | "confirmed"
  | "cancelled"
  | "other";
type BookingAttentionFilter = "all" | "waiting_deposit" | "open_balance" | "missing_session";
type DateFilterMode = "created" | "session";
type ReportPeriod = "custom" | "today" | "week" | "month" | "quarter" | "year";
type SessionStatusFilter =
  | "all"
  | "not_started"
  | "in_progress"
  | "completed"
  | "awaiting_next_session"
  | "other";
type SessionAttentionFilter = "all" | "overdue" | "missing_date";

// Define minimal shape interfaces for our Firestore documents. These
// interfaces are intentionally permissive – any additional fields
// returned from Firestore will be forwarded to the preview modal for
// inspection. A real implementation might refine these types based on
// production schemas.
interface ArtistRecord {
  id: string;
  displayName?: string;
  name?: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
  avatar?: string;
  photoURL?: string;
  location?: string;
  featured?: boolean;
  createdAt?: unknown;
  [key: string]: unknown;
}

interface GenericRecord {
  id: string;
  [key: string]: unknown;
}

type UserRecord = GenericRecord & {
  displayName?: string;
  name?: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
  avatar?: string;
  photoURL?: string;
  role?: string;
};

type UserLookup = Record<string, UserRecord>;

type TimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

type CollectionStatus = {
  loading: boolean;
  error: string;
  updatedAt: Date | null;
};

const tableHeaderClass =
  "grid items-center gap-4 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-neutral-300";
const tableRowClass =
  "grid min-h-[62px] w-full items-center gap-4 px-4 py-3 text-left text-sm hover:bg-white/[0.03] focus:outline-none focus:ring-1 focus:ring-white";
const inlineCellClass = "flex min-h-8 min-w-0 items-center";

const normalizeSearch = (value: unknown) =>
  String(value || "").trim().toLowerCase();

const matchesSearch = (needle: string, values: unknown[]) => {
  const normalized = normalizeSearch(needle);
  if (!normalized) return true;
  return values.some((value) => normalizeSearch(value).includes(normalized));
};

const copyToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Failed to copy");
  }
};

const getTimestampDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === "function") return timestamp.toDate();
    if (typeof timestamp.seconds === "number") {
      return new Date(timestamp.seconds * 1000);
    }
  }
  return null;
};

const getComparableDate = (value: unknown) => {
  const date = getTimestampDate(value);
  if (date) return date;
  if (value && typeof value === "object") {
    const selected = formatSelectedDate(value);
    if (selected) {
      const parsed = new Date(selected);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  return null;
};

const formatDate = (value: unknown) => {
  const date = getTimestampDate(value);
  return date ? date.toLocaleDateString() : "-";
};

const formatDateTime = (value: unknown) => {
  const date = getTimestampDate(value);
  return date ? date.toLocaleString() : "-";
};

const formatUpdatedAt = (date: Date | null) =>
  date
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "not synced";

const formatStatusLabel = (status: unknown) => {
  if (!status || typeof status !== "string") return "-";
  return status.replace(/_/g, " ");
};

const getString = (record: GenericRecord | UserRecord | undefined, key: string) => {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : "";
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to load this data.";

const getNumber = (record: GenericRecord, key: string) => {
  const value = record[key];
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
};

const getUserName = (user: UserRecord | undefined, fallbackId?: string) =>
  user?.displayName ||
  user?.name ||
  user?.username ||
  getString(user, "fullName") ||
  fallbackId ||
  "";

const getUserAvatar = (user: UserRecord | undefined) =>
  user?.avatarUrl || user?.avatar || user?.photoURL || "";

const getPersonName = (
  record: GenericRecord,
  usersById: UserLookup,
  nameKeys: string[],
  idKeys: string[]
) => {
  const id = idKeys.map((key) => getString(record, key)).find(Boolean);
  const userName = getUserName(id ? usersById[id] : undefined, "");
  if (userName) return userName;
  return nameKeys.map((key) => getString(record, key)).find(Boolean) || id || "-";
};

const getPersonAvatar = (
  record: GenericRecord,
  usersById: UserLookup,
  avatarKeys: string[],
  idKeys: string[]
) => {
  const explicitAvatar = avatarKeys
    .map((key) => getString(record, key))
    .find(Boolean);
  if (explicitAvatar) return explicitAvatar;
  const id = idKeys.map((key) => getString(record, key)).find(Boolean);
  return id ? getUserAvatar(usersById[id]) : "";
};

const formatMoney = (value: unknown) => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return `$${value.toFixed(2)}`;
  }
  return typeof value === "string" && value.trim() ? value : "-";
};

const formatNumberAsMoney = (value: number) => `$${value.toFixed(2)}`;

const getOfferAmount = (offer: GenericRecord) =>
  getNumber(offer, "price") ?? getNumber(offer, "flashPrice");

const isInMoneyRange = (
  value: number | undefined,
  minValue: string,
  maxValue: string
) => {
  const min = minValue ? Number(minValue) : undefined;
  const max = maxValue ? Number(maxValue) : undefined;
  if (typeof value !== "number") return !minValue && !maxValue;
  if (typeof min === "number" && !Number.isNaN(min) && value < min) return false;
  if (typeof max === "number" && !Number.isNaN(max) && value > max) return false;
  return true;
};

const isInDateRange = (
  value: unknown,
  startDate: string,
  endDate: string
) => {
  if (!startDate && !endDate) return true;
  const date = getComparableDate(value);
  if (!date) return false;
  if (startDate) {
    const start = new Date(`${startDate}T00:00:00`);
    if (date < start) return false;
  }
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999`);
    if (date > end) return false;
  }
  return true;
};

const formatBudget = (record: GenericRecord) => {
  const budget = record.budget;
  if (typeof budget === "number") return `$${budget.toFixed(2)}`;
  if (typeof budget === "string" && budget.trim()) return budget;
  const min = getNumber(record, "budgetMin");
  const max = getNumber(record, "budgetMax");
  if (typeof min === "number" && typeof max === "number") return `$${min}-${max}`;
  if (typeof min === "number") return `$${min}+`;
  if (typeof max === "number") return `Up to $${max}`;
  return "-";
};

const getBudgetAmount = (record: GenericRecord) => {
  const numericBudget = getNumber(record, "budget");
  if (typeof numericBudget === "number") return numericBudget;
  const max = getNumber(record, "budgetMax");
  if (typeof max === "number") return max;
  const min = getNumber(record, "budgetMin");
  if (typeof min === "number") return min;
  const budget = getString(record, "budget");
  const numbers = budget.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  return numbers.length ? Math.max(...numbers) : undefined;
};

const formatSelectedDate = (selectedDate: unknown) => {
  if (!selectedDate || typeof selectedDate !== "object") return "";
  const value = selectedDate as { date?: unknown; time?: unknown };
  const date = typeof value.date === "string" ? value.date : "";
  const time = typeof value.time === "string" ? value.time : "";
  if (!date || date === "TBD") return date || "";
  const [year, month, day] = date.split("-").map(Number);
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  if (!year || !month || !day) return [date, time].filter(Boolean).join(" ");
  return new Date(year, month - 1, day, hours, minutes).toLocaleString();
};

const getFirstAppointmentLabel = (booking: GenericRecord) => {
  const selectedDate = formatSelectedDate(booking.selectedDate);
  if (selectedDate) return selectedDate;
  const scheduledAt = formatDateTime(booking.scheduledAt);
  if (scheduledAt !== "-") return scheduledAt;
  const appointmentAt = formatDateTime(booking.appointmentAt);
  if (appointmentAt !== "-") return appointmentAt;
  if (Array.isArray(booking.appointmentTimes) && booking.appointmentTimes.length) {
    return formatDateTime(booking.appointmentTimes[0]);
  }
  if (Array.isArray(booking.dateOptions) && booking.dateOptions.length) {
    return formatSelectedDate(booking.dateOptions[0]) || "-";
  }
  return "-";
};

const getFirstAppointmentValue = (booking: GenericRecord) => {
  if (booking.selectedDate) return booking.selectedDate;
  if (booking.scheduledAt) return booking.scheduledAt;
  if (booking.appointmentAt) return booking.appointmentAt;
  if (Array.isArray(booking.appointmentTimes) && booking.appointmentTimes.length) {
    return booking.appointmentTimes[0];
  }
  if (Array.isArray(booking.dateOptions) && booking.dateOptions.length) {
    return booking.dateOptions[0];
  }
  return null;
};

const getOfferStatusKey = (offer: GenericRecord): OfferStatusFilter => {
  const status = getString(offer, "status");
  if (status === "accepted") return "accepted";
  if (status === "declined") return "declined";
  if (!status || status === "pending") return "waiting";
  return "other";
};

const getBookingStatusKey = (booking: GenericRecord): BookingStatusFilter => {
  const status = getString(booking, "status");
  if (
    status === "pending_payment" ||
    status === "deposit_paid" ||
    status === "paid" ||
    status === "confirmed" ||
    status === "cancelled"
  ) {
    return status;
  }
  return "other";
};

const getSessionStatusKey = (session: GenericRecord): SessionStatusFilter => {
  const status = getString(session, "status");
  if (
    status === "not_started" ||
    status === "in_progress" ||
    status === "completed" ||
    status === "awaiting_next_session"
  ) {
    return status;
  }
  return "other";
};

const isOlderThanHours = (value: unknown, hours: number) => {
  const date = getComparableDate(value);
  if (!date) return false;
  return Date.now() - date.getTime() >= hours * 60 * 60 * 1000;
};

const hasOpenBalance = (booking: GenericRecord) =>
  (getNumber(booking, "remainingBalanceAmount") || 0) > 0 ||
  (getNumber(booking, "remainingBalanceCents") || 0) > 0;

const hasFirstAppointment = (booking: GenericRecord) =>
  getFirstAppointmentLabel(booking) !== "-";

const isPastDate = (value: unknown) => {
  const date = getComparableDate(value);
  return Boolean(date && date.getTime() < Date.now());
};

const isRequestAttentionMatch = (
  request: GenericRecord,
  offers: GenericRecord[],
  filter: RequestAttentionFilter
) => {
  if (filter === "all") return true;
  return (
    filter === "waiting_24h" &&
    getRequestStatusKey(request, offers) === "waiting" &&
    isOlderThanHours(request.createdAt, 24)
  );
};

const isOfferAttentionMatch = (
  offer: GenericRecord,
  filter: OfferAttentionFilter
) => {
  if (filter === "all") return true;
  return (
    filter === "waiting_24h" &&
    getOfferStatusKey(offer) === "waiting" &&
    isOlderThanHours(offer.createdAt, 24)
  );
};

const isBookingAttentionMatch = (
  booking: GenericRecord,
  filter: BookingAttentionFilter
) => {
  if (filter === "all") return true;
  if (filter === "waiting_deposit") return getBookingStatusKey(booking) === "pending_payment";
  if (filter === "open_balance") return hasOpenBalance(booking);
  return !hasFirstAppointment(booking);
};

const isSessionAttentionMatch = (
  session: GenericRecord,
  filter: SessionAttentionFilter
) => {
  if (filter === "all") return true;
  const appointmentValue = getFirstAppointmentValue(session);
  if (filter === "missing_date") return !appointmentValue;
  return (
    isPastDate(appointmentValue) &&
    !["completed", "cancelled"].includes(getString(session, "status"))
  );
};

const getRequestAttentionCount = (
  requests: GenericRecord[],
  offers: GenericRecord[]
) =>
  requests.filter((request) =>
    isRequestAttentionMatch(request, offers, "waiting_24h")
  ).length;

const getOfferAttentionCount = (offers: GenericRecord[]) =>
  offers.filter((offer) => isOfferAttentionMatch(offer, "waiting_24h")).length;

const getBookingAttentionCount = (
  bookings: GenericRecord[],
  filter: BookingAttentionFilter
) =>
  bookings.filter((booking) => isBookingAttentionMatch(booking, filter)).length;

const getSessionAttentionCount = (
  sessions: GenericRecord[],
  filter: SessionAttentionFilter
) =>
  sessions.filter((session) => isSessionAttentionMatch(session, filter)).length;

const getArtistAttentionCount = (
  artists: ArtistRecord[],
  filter: ArtistAttentionFilter
) =>
  artists.filter((artist) => {
    if (filter === "needs_stripe") return !isStripeConnected(artist);
    if (filter === "missing_name") return !getUserName(artist, "");
    return true;
  }).length;

const getInitialCollectionStatus = (): Record<AdminView, CollectionStatus> => ({
  artists: { loading: false, error: "", updatedAt: null },
  requests: { loading: false, error: "", updatedAt: null },
  offers: { loading: false, error: "", updatedAt: null },
  bookings: { loading: false, error: "", updatedAt: null },
  sessions: { loading: false, error: "", updatedAt: null },
});

const markAllCollectionsLoading = (): Record<AdminView, CollectionStatus> => ({
  artists: { loading: true, error: "", updatedAt: null },
  requests: { loading: true, error: "", updatedAt: null },
  offers: { loading: true, error: "", updatedAt: null },
  bookings: { loading: true, error: "", updatedAt: null },
  sessions: { loading: true, error: "", updatedAt: null },
});

const getCollectionSuccessState = (): CollectionStatus => ({
  loading: false,
  error: "",
  updatedAt: new Date(),
});

const getCollectionErrorState = (error: unknown): CollectionStatus => ({
  loading: false,
  error: getErrorMessage(error),
  updatedAt: null,
});

const getOfferStatusLabel = (offer: GenericRecord) => {
  const status = getString(offer, "status");
  if (status === "accepted") return "Client accepted";
  if (status === "declined") return "Client declined";
  if (status === "expired") return "Expired";
  if (!status || status === "pending") return "Waiting for client";
  return formatStatusLabel(status);
};

const getRequestStatusLabel = (request: GenericRecord, offers: GenericRecord[]) => {
  const requestId = request.id;
  const requestStatus = getString(request, "status");
  const hasOffer = offers.some((offer) => getString(offer, "requestId") === requestId);
  return hasOffer || requestStatus === "offered"
    ? "Artist responded"
    : "Waiting for offer";
};

const getRequestStatusKey = (
  request: GenericRecord,
  offers: GenericRecord[]
): RequestStatusFilter => {
  const label = getRequestStatusLabel(request, offers);
  if (label === "Artist responded") return "responded";
  if (label === "Waiting for offer") return "waiting";
  return "other";
};

const getTotalLabel = (booking: GenericRecord) => {
  const totalNum = getBookingTotalAmount(booking);
  return typeof totalNum === "number" ? `$${totalNum.toFixed(2)}` : "-";
};

const getBookingTotalAmount = (booking: GenericRecord) => {
  let totalNum = getNumber(booking, "price");
  totalNum ??= getNumber(booking, "totalPrice");
  totalNum ??= getNumber(booking, "totalAmount");
  if (typeof totalNum !== "number") {
    const paid = getNumber(booking, "totalArtistPaidAmount") || 0;
    const deposit = getNumber(booking, "depositAmount") || 0;
    const remaining = getNumber(booking, "remainingBalanceAmount") || 0;
    const remainingPaid = getNumber(booking, "remainingPaidAmount") || 0;
    const sum = paid + deposit + remaining + remainingPaid;
    totalNum = sum > 0 ? sum : undefined;
  }
  return totalNum;
};

const isStripeConnected = (artist: GenericRecord) => {
  const connect = artist.stripeConnect;
  if (!connect || typeof connect !== "object") return false;
  const status = connect as {
    onboardingComplete?: unknown;
    chargesEnabled?: unknown;
    payoutsEnabled?: unknown;
    detailsSubmitted?: unknown;
    accountId?: unknown;
  };
  return Boolean(
    status.accountId &&
      status.onboardingComplete &&
      status.chargesEnabled &&
      status.payoutsEnabled &&
      status.detailsSubmitted
  );
};

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getReportRange = (period: ReportPeriod) => {
  const now = new Date();
  const start = new Date(now);
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    const day = start.getDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - daysSinceMonday);
    start.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (period === "quarter") {
    const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(quarterStartMonth, 1);
    start.setHours(0, 0, 0, 0);
  } else if (period === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }

  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(now),
  };
};

const getReportPeriodLabel = (period: ReportPeriod) => {
  if (period === "today") return "Today";
  if (period === "week") return "This week";
  if (period === "month") return "This month";
  if (period === "quarter") return "This quarter";
  if (period === "year") return "This year";
  return "Custom";
};

const csvEscape = (value: unknown) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

const downloadTextFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const buildSessionRows = (
  sessions: GenericRecord[],
  bookings: GenericRecord[]
): GenericRecord[] => {
  const explicitRows = sessions.map((session) => ({
    ...session,
    adminSessionSource: "session",
  }));

  const bookingRows = bookings
    .filter((booking) => {
      const estimatedSessions = getNumber(booking, "estimatedSessionCount") || 1;
      return (
        estimatedSessions > 1 ||
        Boolean(booking.sessionStatus) ||
        getString(booking, "projectType") === "multi_session"
      );
    })
    .map((booking) => ({
      ...booking,
      id:
        getString(booking, "sessionId") ||
        `${booking.id}-session-${getNumber(booking, "activeSessionNumber") || 1}`,
      bookingId: booking.id,
      scheduledAt: booking.scheduledAt || booking.selectedDate,
      status: booking.sessionStatus || booking.status,
      adminSessionSource: "booking",
    }));

  const seen = new Set<string>();
  return [...explicitRows, ...bookingRows].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
};

const PersonCell = ({
  name,
  avatar,
  fallbackLabel,
  copyValue,
}: {
  name: string;
  avatar?: string;
  fallbackLabel: string;
  copyValue?: string;
}) => (
  <span className="flex min-h-8 min-w-0 items-center gap-2">
    {avatar ? (
      <img
        src={avatar}
        alt={name || fallbackLabel}
        className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
      />
    ) : (
      <div className="h-6 w-6 flex-shrink-0 rounded-full bg-white/10" />
    )}
    <span className="flex min-w-0 items-center gap-1 leading-none">
      <span className="truncate">{name || fallbackLabel}</span>
      {copyValue && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(copyValue);
          }}
          className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
          aria-label={`Copy ${fallbackLabel} ID`}
        >
          <Copy size={14} />
        </button>
      )}
    </span>
  </span>
);

const ToolPanel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-end gap-3 border-b border-white/10 pb-4">
    {children}
  </div>
);

const ToolField = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="flex min-w-[170px] flex-col gap-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
    <span>{label}</span>
    {children}
  </label>
);

const toolInputClass =
  "h-10 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm normal-case tracking-normal text-white outline-none transition placeholder:text-neutral-600 focus:border-white/25";

const ToolInput = ({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "date";
}) => (
  <input
    type={type}
    value={value}
    placeholder={placeholder}
    onChange={(event) => onChange(event.target.value)}
    className={toolInputClass}
  />
);

const ToolSelect = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
}) => (
  <select
    value={value}
    onChange={(event) => onChange(event.target.value as T)}
    className={`${toolInputClass} pr-8`}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value} className="bg-[#111]">
        {option.label}
      </option>
    ))}
  </select>
);

const ClearToolsButton = ({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="h-10 rounded-md border border-white/10 px-3 text-sm font-semibold text-neutral-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
  >
    Clear
  </button>
);

const ToggleFeaturedButton = ({
  artist,
}: {
  artist: ArtistRecord;
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const featured = artist.featured === true;

  const handleToggle = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "users", artist.id), {
        featured: !featured,
      });
      toast.success(featured ? "Artist unfeatured" : "Artist featured");
    } catch (error) {
      console.error("Failed to update featured artist", error);
      toast.error("Could not update featured status");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isSaving}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition ${
        featured
          ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
          : "border-white/10 text-neutral-500 hover:border-white/25 hover:text-white"
      } disabled:opacity-50`}
      aria-label={featured ? "Remove featured artist" : "Mark artist featured"}
      title={featured ? "Featured" : "Mark featured"}
    >
      <Star size={15} fill={featured ? "currentColor" : "none"} />
    </button>
  );
};

const ReportMetric = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <div className="min-w-[132px] rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      {label}
    </p>
    <p className="mt-1 text-base font-semibold text-white">{value}</p>
  </div>
);

const ReportActionButton = ({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 px-3 text-sm font-semibold text-neutral-200 transition hover:border-white/25 hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
  >
    {children}
  </button>
);

const DataHealth = ({
  status,
  total,
  visible,
}: {
  status?: CollectionStatus;
  total: number;
  visible: number;
}) => (
  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
      {visible} visible / {total} total
    </span>
    <span
      className={`rounded-full border px-3 py-1 ${
        status?.error
          ? "border-red-300/30 bg-red-400/10 text-red-200"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      {status?.loading
        ? "syncing..."
        : status?.error
        ? `sync issue: ${status.error}`
        : `updated ${formatUpdatedAt(status?.updatedAt || null)}`}
    </span>
  </div>
);

const QuickFilterButton = ({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
      active
        ? "border-white/30 bg-white text-black"
        : "border-white/10 text-neutral-300 hover:border-white/25 hover:text-white"
    }`}
  >
    <span>{label}</span>
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        active ? "bg-black/10 text-black" : "bg-white/[0.08] text-neutral-300"
      }`}
    >
      {count}
    </span>
  </button>
);

const EmptyTableState = ({
  total,
  visible,
}: {
  total: number;
  visible: number;
}) =>
  visible === 0 ? (
    <div className="px-4 py-8 text-center text-sm text-neutral-500">
      {total ? "No records match these tools." : "No records found yet."}
    </div>
  ) : null;

/**
 * AdminSidebarNavigation
 *
 * Navigation component for the admin dashboard. Renders a list of
 * buttons with icons and optional count badges. When a link is active
 * the background and text colours are inverted to indicate focus.
 */
interface SidebarProps {
  activeView: AdminView;
  onChange: (view: AdminView) => void;
  counts: Partial<Record<AdminView, number>>;
}

const AdminSidebarNavigation: React.FC<SidebarProps> = ({
  activeView,
  onChange,
  counts,
}) => {
  const links: {
    key: AdminView;
    label: string;
    icon: ComponentType<LucideProps>;
  }[] = [
    { key: "artists", label: "Artists", icon: Users },
    { key: "requests", label: "Requests", icon: Inbox },
    { key: "offers", label: "Offers", icon: ReceiptText },
    { key: "bookings", label: "Bookings", icon: CalendarCheck },
    { key: "sessions", label: "Sessions", icon: Clock },
  ];
  return (
    <aside className="hidden md:block w-64 p-4 bg-black/20 border-r border-white/5 sticky top-20 self-start h-[calc(100vh-5rem)]">
      <nav className="flex md:flex-col gap-2">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <button
              key={link.key}
              onClick={() => onChange(link.key)}
              className={`w-full inline-flex items-center gap-3 text-left px-4 py-3 rounded-md text-sm font-semibold transition ${
                activeView === link.key
                  ? "bg-white/[0.08] text-white"
                  : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <Icon size={17} aria-hidden="true" />
              <span className="flex-1">{link.label}</span>
              {typeof counts[link.key] === "number" &&
                (counts[link.key] || 0) > 0 && (
                  <span
                    className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs ${
                      activeView === link.key
                        ? "bg-white/15 text-white"
                        : "bg-white/[0.06] text-neutral-400"
                    }`}
                  >
                    {counts[link.key]}
                  </span>
                )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

/**
 * PreviewModal
 *
 * Modal component used to display full details of any selected record. It
 * accepts a generic `item` object which is stringified for easy
 * inspection. The modal will be dismissed when the overlay or close
 * button is clicked.
 */
interface PreviewModalProps {
  item: GenericRecord | ArtistRecord | null;
  onClose: () => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ item, onClose }) => {
  // Track whether to show a formatted UI or raw JSON. Defaults to UI.
  const [viewMode, setViewMode] = useState<"ui" | "json">("ui");

  /** Copy arbitrary text to the clipboard and show a toast. */
  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch (err) {
      console.error("Failed to copy", err);
      toast.error("Failed to copy");
    }
  };

  /** Convert camelCase or snake_case keys to Title Case with spaces. */
  const formatKey = (key: string) => {
    const withSpaces = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
  };

  /** Determine if a field should display a copy button based on its key. */
  const isCopyField = (key: string, value: unknown) => {
    if (!value) return false;
    const lower = key.toLowerCase();
    return lower === "id" || lower.endsWith("id") || lower.endsWith("uid");
  };

  /** Render a polished UI listing of all fields on the record. */
  const renderUI = () => {
    if (!item) return null;
    return (
      <div className="space-y-3">
        {Object.entries(item).map(([key, value]) => {
          if (value === undefined || value === null) return null;
          const label = formatKey(key);
          let display: React.ReactNode;
          if (typeof value === "boolean") {
            display = value ? "Yes" : "No";
          } else if (Array.isArray(value)) {
            display = value.join(", ");
          } else if (typeof value === "object" && value !== null) {
            // Attempt to pretty-print nested objects
            try {
              display = (
                <pre className="whitespace-pre-wrap break-all text-xs text-neutral-300">
                  {JSON.stringify(value, null, 2)}
                </pre>
              );
            } catch {
              display = String(value);
            }
          } else if (typeof value === "string") {
            const isImage = /https?:\/\/.*\.(?:png|jpe?g|webp|gif)/i.test(
              value
            );
            if (isImage) {
              display = (
                <img
                  src={value}
                  alt={label}
                  className="h-10 w-10 rounded border border-white/10 object-cover"
                />
              );
            } else {
              display = value;
            }
          } else {
            display = String(value);
          }
          return (
            <div key={key} className="flex items-start gap-3">
              <span className="min-w-[120px] font-medium text-neutral-400">
                {label}
              </span>
              <div className="flex-1 break-all text-neutral-300">{display}</div>
              {isCopyField(key, value) && (
                <button
                  onClick={() => copyToClipboard(String(value))}
                  type="button"
                  className="flex items-center text-neutral-400 hover:text-white"
                >
                  <Copy size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Transition.Root show={item !== null} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 transition-opacity" />
        </Transition.Child>
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center p-4 text-center sm:p-6">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative w-full max-w-2xl transform overflow-hidden rounded-lg bg-[#111] p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-start justify-between">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-white"
                  >
                    Record details
                  </Dialog.Title>
                  <div className="flex items-center gap-2">
                    {item && (
                      <button
                        type="button"
                        onClick={() =>
                          setViewMode((m) => (m === "ui" ? "json" : "ui"))
                        }
                        className="rounded-md p-1 text-neutral-400 hover:text-white"
                        aria-label={
                          viewMode === "ui"
                            ? "View raw JSON"
                            : "View formatted UI"
                        }
                      >
                        {viewMode === "ui" ? (
                          <Code size={18} />
                        ) : (
                          <span className="text-xs font-semibold">UI</span>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-md p-1 text-neutral-400 hover:text-white"
                      onClick={onClose}
                    >
                      <span className="sr-only">Close</span>×
                    </button>
                  </div>
                </div>
                <div className="mt-4 max-h-[70vh] overflow-y-auto request-modal-scrollbar border-t border-white/10 pt-4">
                  {item &&
                    (viewMode === "json" ? (
                      <pre className="whitespace-pre-wrap break-all text-sm text-neutral-300">
                        {JSON.stringify(item, null, 2)}
                      </pre>
                    ) : (
                      renderUI()
                    ))}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};

/**
 * Data table components
 *
 * Each table accepts a list of records and a callback to invoke when a
 * row is clicked. The tables use a combination of grids and flex
 * containers to mirror the styling of the existing dashboards. If a
 * particular field is missing on a record it will simply render
 * nothing for that cell.
 */
interface TableProps<T> {
  data: T[];
  onSelect: (item: T) => void;
  status?: CollectionStatus;
}

const ArtistsTable: React.FC<TableProps<ArtistRecord>> = ({
  data,
  onSelect,
  status,
}) => {
  const [search, setSearch] = useState("");
  const [stripeFilter, setStripeFilter] = useState<StripeFilter>("all");
  const [featuredFilter, setFeaturedFilter] = useState<FeaturedFilter>("all");
  const [attentionFilter, setAttentionFilter] =
    useState<ArtistAttentionFilter>("all");

  const filteredArtists = useMemo(
    () =>
      data.filter((artist) => {
        const stripeConnected = isStripeConnected(artist);
        const featured = artist.featured === true;
        const matchesStripe =
          stripeFilter === "all" ||
          (stripeFilter === "connected" && stripeConnected) ||
          (stripeFilter === "not_connected" && !stripeConnected);
        const matchesFeatured =
          featuredFilter === "all" ||
          (featuredFilter === "featured" && featured) ||
          (featuredFilter === "not_featured" && !featured);
        const matchesAttention =
          attentionFilter === "all" ||
          (attentionFilter === "needs_stripe" && !stripeConnected) ||
          (attentionFilter === "missing_name" && !getUserName(artist, ""));
        return (
          matchesStripe &&
          matchesFeatured &&
          matchesAttention &&
          matchesSearch(search, [
            artist.id,
            artist.displayName,
            artist.name,
            artist.username,
            artist.email,
          ])
        );
      }),
    [attentionFilter, data, featuredFilter, search, stripeFilter]
  );

  const hasActiveTools =
    search ||
    stripeFilter !== "all" ||
    featuredFilter !== "all" ||
    attentionFilter !== "all";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold text-white">Artists</h2>
        <DataHealth status={status} total={data.length} visible={filteredArtists.length} />
      </div>
      <div className="flex flex-wrap gap-2">
        <QuickFilterButton
          label="Needs Stripe"
          count={getArtistAttentionCount(data, "needs_stripe")}
          active={attentionFilter === "needs_stripe"}
          onClick={() =>
            setAttentionFilter(
              attentionFilter === "needs_stripe" ? "all" : "needs_stripe"
            )
          }
        />
        <QuickFilterButton
          label="Missing name"
          count={getArtistAttentionCount(data, "missing_name")}
          active={attentionFilter === "missing_name"}
          onClick={() =>
            setAttentionFilter(
              attentionFilter === "missing_name" ? "all" : "missing_name"
            )
          }
        />
      </div>
      <ToolPanel>
        <ToolField label="Search">
          <ToolInput
            value={search}
            onChange={setSearch}
            placeholder="Display name, email, or ID"
          />
        </ToolField>
        <ToolField label="Stripe">
          <ToolSelect
            value={stripeFilter}
            onChange={setStripeFilter}
            options={[
              { label: "All artists", value: "all" },
              { label: "Connected", value: "connected" },
              { label: "Not connected", value: "not_connected" },
            ]}
          />
        </ToolField>
        <ToolField label="Featured">
          <ToolSelect
            value={featuredFilter}
            onChange={setFeaturedFilter}
            options={[
              { label: "All artists", value: "all" },
              { label: "Featured", value: "featured" },
              { label: "Not featured", value: "not_featured" },
            ]}
          />
        </ToolField>
        <ClearToolsButton
          disabled={!hasActiveTools}
          onClick={() => {
            setSearch("");
            setStripeFilter("all");
            setFeaturedFilter("all");
            setAttentionFilter("all");
          }}
        />
      </ToolPanel>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[920px] divide-y divide-white/10">
          {/* Header */}
          <div className={`${tableHeaderClass} grid-cols-[minmax(220px,1.2fr)_minmax(210px,1fr)_minmax(170px,.8fr)_minmax(120px,.55fr)_minmax(120px,.55fr)_80px]`}>
            <span>Name</span>
            <span>Email</span>
            <span>Shop</span>
            <span>Stripe</span>
            <span>Joined</span>
            <span>Featured</span>
          </div>
          {/* Rows */}
          {filteredArtists.map((artist) => {
            const artistName = getUserName(artist, artist.id);
            const stripeConnected = isStripeConnected(artist);
            return (
              <button
                key={artist.id}
                onClick={() => onSelect(artist)}
                className={`${tableRowClass} grid-cols-[minmax(220px,1.2fr)_minmax(210px,1fr)_minmax(170px,.8fr)_minmax(120px,.55fr)_minmax(120px,.55fr)_80px]`}
              >
                <PersonCell
                  name={artistName}
                  avatar={getUserAvatar(artist)}
                  fallbackLabel="Artist"
                  copyValue={artist.id}
                />
                <span className={inlineCellClass}>{artist.email || "-"}</span>
                <span className={`${inlineCellClass} truncate`}>
                  {getString(artist, "shopName") ||
                    getString(artist, "studioName") ||
                    getString(artist, "shopId") ||
                    getString(artist, "location") ||
                    "-"}
                </span>
                <span className={inlineCellClass}>
                  {stripeConnected ? "Connected" : "Not connected"}
                </span>
                <span className={inlineCellClass}>{formatDate(artist.createdAt)}</span>
                <span className={inlineCellClass}>
                  <ToggleFeaturedButton artist={artist} />
                </span>
              </button>
            );
          })}
          <EmptyTableState total={data.length} visible={filteredArtists.length} />
        </div>
      </div>
    </section>
  );
};

const RequestsTable: React.FC<
  TableProps<GenericRecord> & {
    offers: GenericRecord[];
    usersById: UserLookup;
  }
> = ({ data, onSelect, offers, usersById, status }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>("all");
  const [attentionFilter, setAttentionFilter] =
    useState<RequestAttentionFilter>("all");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");

  const filteredRequests = useMemo(
    () =>
      data.filter((request) => {
        const clientName = getPersonName(
          request,
          usersById,
          ["clientName"],
          ["clientId"]
        );
        const artistName = getPersonName(
          request,
          usersById,
          ["artistName", "displayName"],
          ["artistId"]
        );
        const status = getRequestStatusKey(request, offers);
        const matchesStatus =
          statusFilter === "all" || statusFilter === status;
        const budgetAmount = getBudgetAmount(request);
        return (
          matchesStatus &&
          isRequestAttentionMatch(request, offers, attentionFilter) &&
          isInMoneyRange(budgetAmount, minBudget, maxBudget) &&
          matchesSearch(search, [
            request.id,
            clientName,
            artistName,
            getString(request, "clientId"),
            getString(request, "artistId"),
          ])
        );
      }),
    [
      attentionFilter,
      data,
      maxBudget,
      minBudget,
      offers,
      search,
      statusFilter,
      usersById,
    ]
  );

  const hasActiveTools =
    search || statusFilter !== "all" || attentionFilter !== "all" || minBudget || maxBudget;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold text-white">Tattoo requests</h2>
        <DataHealth status={status} total={data.length} visible={filteredRequests.length} />
      </div>
      <div className="flex flex-wrap gap-2">
        <QuickFilterButton
          label="Waiting 24h"
          count={getRequestAttentionCount(data, offers)}
          active={attentionFilter === "waiting_24h"}
          onClick={() =>
            setAttentionFilter(
              attentionFilter === "waiting_24h" ? "all" : "waiting_24h"
            )
          }
        />
      </div>
      <ToolPanel>
        <ToolField label="Search">
          <ToolInput
            value={search}
            onChange={setSearch}
            placeholder="Client, artist, or request ID"
          />
        </ToolField>
        <ToolField label="Status">
          <ToolSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: "All requests", value: "all" },
              { label: "Waiting for offer", value: "waiting" },
              { label: "Artist responded", value: "responded" },
              { label: "Other", value: "other" },
            ]}
          />
        </ToolField>
        <ToolField label="Min budget">
          <ToolInput value={minBudget} onChange={setMinBudget} type="number" />
        </ToolField>
        <ToolField label="Max budget">
          <ToolInput value={maxBudget} onChange={setMaxBudget} type="number" />
        </ToolField>
        <ClearToolsButton
          disabled={!hasActiveTools}
          onClick={() => {
            setSearch("");
            setStatusFilter("all");
            setAttentionFilter("all");
            setMinBudget("");
            setMaxBudget("");
          }}
        />
      </ToolPanel>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[700px] divide-y divide-white/10">
          <div className={`${tableHeaderClass} grid-cols-5`}>
            <span>Status</span>
            <span>Client</span>
            <span>Artist</span>
            <span>Budget</span>
            <span>Created</span>
          </div>
          {filteredRequests.map((req) => {
            const clientId = getString(req, "clientId");
            const artistId = getString(req, "artistId");
            return (
              <button
                key={req.id}
                onClick={() => onSelect(req)}
                className={`${tableRowClass} grid-cols-5`}
              >
                <span className={`${inlineCellClass} truncate capitalize`}>
                  {getRequestStatusLabel(req, offers)}
                </span>
                <PersonCell
                  name={
                    getPersonName(req, usersById, ["clientName"], ["clientId"])
                  }
                  avatar={getPersonAvatar(
                    req,
                    usersById,
                    ["clientAvatar", "clientAvatarUrl"],
                    ["clientId"]
                  )}
                  fallbackLabel="Client"
                  copyValue={clientId}
                />
                <PersonCell
                  name={
                    getPersonName(
                      req,
                      usersById,
                      ["artistName", "displayName"],
                      ["artistId"]
                    )
                  }
                  avatar={getPersonAvatar(
                    req,
                    usersById,
                    ["artistAvatar", "artistAvatarUrl"],
                    ["artistId"]
                  )}
                  fallbackLabel="Artist"
                  copyValue={artistId}
                />
                <span className={inlineCellClass}>{formatBudget(req)}</span>
                <span className={inlineCellClass}>{formatDateTime(req.createdAt)}</span>
              </button>
            );
          })}
          <EmptyTableState total={data.length} visible={filteredRequests.length} />
        </div>
      </div>
    </section>
  );
};

const OffersTable: React.FC<
  TableProps<GenericRecord> & {
    usersById: UserLookup;
  }
> = ({ data, onSelect, usersById, status }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OfferStatusFilter>("all");
  const [attentionFilter, setAttentionFilter] =
    useState<OfferAttentionFilter>("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const filteredOffers = useMemo(
    () =>
      data.filter((offer) => {
        const artistName = getPersonName(
          offer,
          usersById,
          ["displayName", "artistName"],
          ["artistId"]
        );
        const clientName = getPersonName(
          offer,
          usersById,
          ["clientName"],
          ["clientId"]
        );
        const offerStatus = getOfferStatusKey(offer);
        const matchesStatus =
          statusFilter === "all" || statusFilter === offerStatus;
        return (
          matchesStatus &&
          isOfferAttentionMatch(offer, attentionFilter) &&
          isInMoneyRange(getOfferAmount(offer), minPrice, maxPrice) &&
          matchesSearch(search, [
            offer.id,
            artistName,
            clientName,
            getString(offer, "artistId"),
            getString(offer, "clientId"),
          ])
        );
      }),
    [attentionFilter, data, maxPrice, minPrice, search, statusFilter, usersById]
  );

  const hasActiveTools =
    search || statusFilter !== "all" || attentionFilter !== "all" || minPrice || maxPrice;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold text-white">Tattoo offers</h2>
        <DataHealth status={status} total={data.length} visible={filteredOffers.length} />
      </div>
      <div className="flex flex-wrap gap-2">
        <QuickFilterButton
          label="Waiting 24h"
          count={getOfferAttentionCount(data)}
          active={attentionFilter === "waiting_24h"}
          onClick={() =>
            setAttentionFilter(
              attentionFilter === "waiting_24h" ? "all" : "waiting_24h"
            )
          }
        />
      </div>
      <ToolPanel>
        <ToolField label="Search">
          <ToolInput
            value={search}
            onChange={setSearch}
            placeholder="Artist, client, or offer ID"
          />
        </ToolField>
        <ToolField label="Status">
          <ToolSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: "All offers", value: "all" },
              { label: "Waiting for client", value: "waiting" },
              { label: "Client accepted", value: "accepted" },
              { label: "Client declined", value: "declined" },
              { label: "Other", value: "other" },
            ]}
          />
        </ToolField>
        <ToolField label="Min price">
          <ToolInput value={minPrice} onChange={setMinPrice} type="number" />
        </ToolField>
        <ToolField label="Max price">
          <ToolInput value={maxPrice} onChange={setMaxPrice} type="number" />
        </ToolField>
        <ClearToolsButton
          disabled={!hasActiveTools}
          onClick={() => {
            setSearch("");
            setStatusFilter("all");
            setAttentionFilter("all");
            setMinPrice("");
            setMaxPrice("");
          }}
        />
      </ToolPanel>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[860px] divide-y divide-white/10">
          <div className={`${tableHeaderClass} grid-cols-6`}>
            <span>Offer</span>
            <span>Artist</span>
            <span>Client</span>
            <span>Price</span>
            <span>Status</span>
            <span>Created</span>
          </div>
          {filteredOffers.map((offer) => {
            const artistId = getString(offer, "artistId");
            const clientId = getString(offer, "clientId");
            return (
              <button
                key={offer.id}
                onClick={() => onSelect(offer)}
                className={`${tableRowClass} grid-cols-6`}
              >
                <span className="flex min-h-8 min-w-0 items-center gap-1 truncate">
                  {getString(offer, "flashTitle") ||
                    getString(offer, "description") ||
                    offer.id}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(String(offer.id));
                    }}
                    className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                    aria-label="Copy offer ID"
                  >
                    <Copy size={14} />
                  </button>
                </span>
                <PersonCell
                  name={getPersonName(
                    offer,
                    usersById,
                    ["displayName", "artistName"],
                    ["artistId"]
                  )}
                  avatar={getPersonAvatar(
                    offer,
                    usersById,
                    ["artistAvatar", "artistAvatarUrl"],
                    ["artistId"]
                  )}
                  fallbackLabel="Artist"
                  copyValue={artistId}
                />
                <PersonCell
                  name={getPersonName(offer, usersById, ["clientName"], ["clientId"])}
                  avatar={getPersonAvatar(
                    offer,
                    usersById,
                    ["clientAvatar", "clientAvatarUrl"],
                    ["clientId"]
                  )}
                  fallbackLabel="Client"
                  copyValue={clientId}
                />
                <span className={inlineCellClass}>
                  {formatMoney(getOfferAmount(offer))}
                </span>
                <span className={`${inlineCellClass} truncate capitalize`}>
                  {getOfferStatusLabel(offer)}
                </span>
                <span className={inlineCellClass}>{formatDate(offer.createdAt)}</span>
              </button>
            );
          })}
          <EmptyTableState total={data.length} visible={filteredOffers.length} />
        </div>
      </div>
    </section>
  );
};

const BookingsTable: React.FC<
  TableProps<GenericRecord> & {
    usersById: UserLookup;
    adminUser: UserRecord | null;
  }
> = ({ data, onSelect, usersById, adminUser, status }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BookingStatusFilter>("all");
  const [attentionFilter, setAttentionFilter] =
    useState<BookingAttentionFilter>("all");
  const [dateMode, setDateMode] = useState<DateFilterMode>("created");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("custom");
  const [isSavingReport, setIsSavingReport] = useState(false);

  const filteredBookings = useMemo(
    () =>
      data.filter((booking) => {
        const artistName = getPersonName(
          booking,
          usersById,
          ["artistName", "displayName"],
          ["artistId"]
        );
        const clientName = getPersonName(
          booking,
          usersById,
          ["clientName"],
          ["clientId"]
        );
        const dateValue =
          dateMode === "created"
            ? booking.createdAt
            : getFirstAppointmentValue(booking);
        const bookingStatus = getBookingStatusKey(booking);
        const matchesStatus =
          statusFilter === "all" || bookingStatus === statusFilter;
        return (
          matchesStatus &&
          isBookingAttentionMatch(booking, attentionFilter) &&
          isInDateRange(dateValue, startDate, endDate) &&
          matchesSearch(search, [
            booking.id,
            artistName,
            clientName,
            getString(booking, "artistId"),
            getString(booking, "clientId"),
          ])
        );
      }),
    [
      attentionFilter,
      data,
      dateMode,
      endDate,
      search,
      startDate,
      statusFilter,
      usersById,
    ]
  );

  const hasActiveTools =
    search ||
    statusFilter !== "all" ||
    attentionFilter !== "all" ||
    startDate ||
    endDate ||
    dateMode !== "created";
  const reportRows = filteredBookings;
  const reportSummary = useMemo(() => {
    const statusCounts = reportRows.reduce<Record<string, number>>((counts, booking) => {
      const status = getString(booking, "status") || "unknown";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
    const quotedTotal = reportRows.reduce(
      (sum, booking) => sum + (getBookingTotalAmount(booking) || 0),
      0
    );
    const depositTotal = reportRows.reduce(
      (sum, booking) => sum + (getNumber(booking, "depositAmount") || 0),
      0
    );
    const remainingTotal = reportRows.reduce(
      (sum, booking) => sum + (getNumber(booking, "remainingBalanceAmount") || 0),
      0
    );
    const dateValues = reportRows
      .map((booking) =>
        getComparableDate(
          dateMode === "created" ? booking.createdAt : getFirstAppointmentValue(booking)
        )
      )
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      bookingCount: reportRows.length,
      quotedTotal,
      depositTotal,
      remainingTotal,
      statusCounts,
      firstDate: dateValues[0],
      lastDate: dateValues[dateValues.length - 1],
    };
  }, [dateMode, reportRows]);

  const applyReportPeriod = (period: ReportPeriod) => {
    setReportPeriod(period);
    if (period === "custom") return;
    const range = getReportRange(period);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleStartDateChange = (value: string) => {
    setReportPeriod("custom");
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setReportPeriod("custom");
    setEndDate(value);
  };

  const getReportFilename = (extension: "csv" | "json") => {
    const basis = dateMode === "created" ? "created" : "session";
    const period = getReportPeriodLabel(reportPeriod).toLowerCase().replace(/\s+/g, "-");
    const range = `${startDate || "all"}-to-${endDate || "all"}`;
    return `satxink-bookings-${basis}-${period}-${range}.${extension}`;
  };

  const getReportPayload = () =>
    reportRows.map((booking) => {
      const artistName = getPersonName(
        booking,
        usersById,
        ["artistName", "displayName"],
        ["artistId"]
      );
      const clientName = getPersonName(
        booking,
        usersById,
        ["clientName"],
        ["clientId"]
      );
      return {
        bookingId: booking.id,
        clientName,
        clientId: getString(booking, "clientId"),
        artistName,
        artistId: getString(booking, "artistId"),
        status: formatStatusLabel(booking.status),
        firstAppointment: getFirstAppointmentLabel(booking),
        createdAt: formatDateTime(booking.createdAt),
        total: getBookingTotalAmount(booking) || 0,
        deposit: getNumber(booking, "depositAmount") || 0,
        remainingBalance: getNumber(booking, "remainingBalanceAmount") || 0,
        offerId: getString(booking, "offerId"),
        sourceType: getString(booking, "sourceType"),
        projectType: getString(booking, "projectType"),
      };
    });

  const saveReport = async () => {
    if (!reportSummary.bookingCount || isSavingReport) return;
    setIsSavingReport(true);
    try {
      const savedSummary = {
        bookingCount: reportSummary.bookingCount,
        quotedTotal: reportSummary.quotedTotal,
        depositTotal: reportSummary.depositTotal,
        remainingTotal: reportSummary.remainingTotal,
        statusCounts: reportSummary.statusCounts,
        firstDate: reportSummary.firstDate?.toISOString() || null,
        lastDate: reportSummary.lastDate?.toISOString() || null,
      };
      await addDoc(collection(db, "adminReports"), {
        type: "bookings",
        generatedAt: serverTimestamp(),
        generatedBy: adminUser
          ? {
              id: adminUser.id,
              email: adminUser.email || null,
              name: getUserName(adminUser, adminUser.id),
            }
          : null,
        period: getReportPeriodLabel(reportPeriod),
        dateBasis: dateMode,
        startDate: startDate || null,
        endDate: endDate || null,
        summary: savedSummary,
        bookings: getReportPayload(),
      });
      toast.success("Booking report saved");
    } catch (error) {
      console.error("Failed to save booking report", error);
      toast.error("Could not save booking report");
    } finally {
      setIsSavingReport(false);
    }
  };

  const downloadCsvReport = () => {
    const rows = getReportPayload();
    const headers = [
      "bookingId",
      "clientName",
      "clientId",
      "artistName",
      "artistId",
      "status",
      "firstAppointment",
      "createdAt",
      "total",
      "deposit",
      "remainingBalance",
      "offerId",
      "sourceType",
      "projectType",
    ];
    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) =>
        headers.map((header) => csvEscape(row[header as keyof typeof row])).join(",")
      ),
    ].join("\n");
    downloadTextFile(getReportFilename("csv"), csv, "text/csv;charset=utf-8");
  };

  const downloadJsonReport = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      period: getReportPeriodLabel(reportPeriod),
      dateBasis: dateMode,
      startDate: startDate || null,
      endDate: endDate || null,
      summary: reportSummary,
      bookings: getReportPayload(),
    };
    downloadTextFile(
      getReportFilename("json"),
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  };

  const copyReportSummary = () => {
    const topStatuses = Object.entries(reportSummary.statusCounts)
      .map(([status, count]) => `${formatStatusLabel(status)}: ${count}`)
      .join(", ");
    copyToClipboard(
      [
        `SATX Ink bookings report`,
        `Period: ${getReportPeriodLabel(reportPeriod)}`,
        `Date basis: ${dateMode === "created" ? "created date" : "session date"}`,
        `Range: ${startDate || "all"} to ${endDate || "all"}`,
        `Bookings: ${reportSummary.bookingCount}`,
        `Quoted total: ${formatNumberAsMoney(reportSummary.quotedTotal)}`,
        `Deposits: ${formatNumberAsMoney(reportSummary.depositTotal)}`,
        `Remaining balance: ${formatNumberAsMoney(reportSummary.remainingTotal)}`,
        `Statuses: ${topStatuses || "none"}`,
      ].join("\n")
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold text-white">Bookings</h2>
        <DataHealth status={status} total={data.length} visible={filteredBookings.length} />
      </div>
      <div className="flex flex-wrap gap-2">
        <QuickFilterButton
          label="Waiting deposit"
          count={getBookingAttentionCount(data, "waiting_deposit")}
          active={attentionFilter === "waiting_deposit"}
          onClick={() =>
            setAttentionFilter(
              attentionFilter === "waiting_deposit" ? "all" : "waiting_deposit"
            )
          }
        />
        <QuickFilterButton
          label="Open balance"
          count={getBookingAttentionCount(data, "open_balance")}
          active={attentionFilter === "open_balance"}
          onClick={() =>
            setAttentionFilter(
              attentionFilter === "open_balance" ? "all" : "open_balance"
            )
          }
        />
        <QuickFilterButton
          label="Missing session"
          count={getBookingAttentionCount(data, "missing_session")}
          active={attentionFilter === "missing_session"}
          onClick={() =>
            setAttentionFilter(
              attentionFilter === "missing_session" ? "all" : "missing_session"
            )
          }
        />
      </div>
      <ToolPanel>
        <ToolField label="Search">
          <ToolInput
            value={search}
            onChange={setSearch}
            placeholder="Artist, client, booking ID"
          />
        </ToolField>
        <ToolField label="Status">
          <ToolSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: "All bookings", value: "all" },
              { label: "Waiting for deposit", value: "pending_payment" },
              { label: "Deposit paid", value: "deposit_paid" },
              { label: "Paid in full", value: "paid" },
              { label: "Confirmed", value: "confirmed" },
              { label: "Cancelled", value: "cancelled" },
              { label: "Other", value: "other" },
            ]}
          />
        </ToolField>
        <ToolField label="Date type">
          <ToolSelect
            value={dateMode}
            onChange={setDateMode}
            options={[
              { label: "Created date", value: "created" },
              { label: "Session date", value: "session" },
            ]}
          />
        </ToolField>
        <ToolField label="From">
          <ToolInput value={startDate} onChange={handleStartDateChange} type="date" />
        </ToolField>
        <ToolField label="To">
          <ToolInput value={endDate} onChange={handleEndDateChange} type="date" />
        </ToolField>
        <ClearToolsButton
          disabled={!hasActiveTools}
          onClick={() => {
            setSearch("");
            setStatusFilter("all");
            setAttentionFilter("all");
            setDateMode("created");
            setReportPeriod("custom");
            setStartDate("");
            setEndDate("");
          }}
        />
      </ToolPanel>
      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-[190px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Booking reports
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {getReportPeriodLabel(reportPeriod)} snapshot
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ReportMetric label="Bookings" value={reportSummary.bookingCount} />
              <ReportMetric
                label="Quoted"
                value={formatNumberAsMoney(reportSummary.quotedTotal)}
              />
              <ReportMetric
                label="Deposits"
                value={formatNumberAsMoney(reportSummary.depositTotal)}
              />
              <ReportMetric
                label="Remaining"
                value={formatNumberAsMoney(reportSummary.remainingTotal)}
              />
              <ReportMetric
                label="Span"
                value={
                  reportSummary.firstDate && reportSummary.lastDate
                    ? `${formatDate(reportSummary.firstDate)} - ${formatDate(
                        reportSummary.lastDate
                      )}`
                    : "-"
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["today", "week", "month", "quarter", "year"] as ReportPeriod[]).map(
              (period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => applyReportPeriod(period)}
                  className={`h-9 rounded-md border px-3 text-sm font-semibold transition ${
                    reportPeriod === period
                      ? "border-white/30 bg-white text-black"
                      : "border-white/10 text-neutral-300 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {getReportPeriodLabel(period)}
                </button>
              )
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2 text-sm text-neutral-400">
            {Object.entries(reportSummary.statusCounts).length ? (
              Object.entries(reportSummary.statusCounts).map(([status, count]) => (
                <span
                  key={status}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-1"
                >
                  {formatStatusLabel(status)}: {count}
                </span>
              ))
            ) : (
              <span>No bookings in this report window</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <ReportActionButton
              onClick={saveReport}
              disabled={!reportSummary.bookingCount || isSavingReport}
            >
              <FileDown size={15} />
              {isSavingReport ? "Saving..." : "Save report"}
            </ReportActionButton>
            <ReportActionButton
              onClick={copyReportSummary}
              disabled={!reportSummary.bookingCount}
            >
              <Copy size={15} />
              Copy summary
            </ReportActionButton>
            <ReportActionButton
              onClick={downloadCsvReport}
              disabled={!reportSummary.bookingCount}
            >
              <FileDown size={15} />
              CSV
            </ReportActionButton>
            <ReportActionButton
              onClick={downloadJsonReport}
              disabled={!reportSummary.bookingCount}
            >
              <FileDown size={15} />
              JSON
            </ReportActionButton>
          </div>
        </div>
      </div>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[980px] divide-y divide-white/10">
          <div className={`${tableHeaderClass} grid-cols-7`}>
            <span>ID</span>
            <span>Client</span>
            <span>Artist</span>
            <span>Status</span>
            <span>Session</span>
            <span>Total</span>
            <span>Created</span>
          </div>
          {filteredBookings.map((booking) => {
            const clientId = getString(booking, "clientId");
            const artistId = getString(booking, "artistId");
            return (
              <button
                key={booking.id}
                onClick={() => onSelect(booking)}
                className={`${tableRowClass} grid-cols-7`}
              >
                <span className="flex min-h-8 min-w-0 items-center gap-1 truncate">
                  {booking.id}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(String(booking.id));
                    }}
                    className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                    aria-label="Copy booking ID"
                  >
                    <Copy size={14} />
                  </button>
                </span>
                <PersonCell
                  name={getPersonName(booking, usersById, ["clientName"], ["clientId"])}
                  avatar={getPersonAvatar(
                    booking,
                    usersById,
                    ["clientAvatar", "clientAvatarUrl"],
                    ["clientId"]
                  )}
                  fallbackLabel="Client"
                  copyValue={clientId}
                />
                <PersonCell
                  name={getPersonName(
                    booking,
                    usersById,
                    ["artistName", "displayName"],
                    ["artistId"]
                  )}
                  avatar={getPersonAvatar(
                    booking,
                    usersById,
                    ["artistAvatar", "artistAvatarUrl"],
                    ["artistId"]
                  )}
                  fallbackLabel="Artist"
                  copyValue={artistId}
                />
                <span className={`${inlineCellClass} capitalize`}>
                  {formatStatusLabel(booking.status)}
                </span>
                <span className={inlineCellClass}>{getFirstAppointmentLabel(booking)}</span>
                <span className={inlineCellClass}>{getTotalLabel(booking)}</span>
                <span className={inlineCellClass}>{formatDateTime(booking.createdAt)}</span>
              </button>
            );
          })}
          <EmptyTableState total={data.length} visible={filteredBookings.length} />
        </div>
      </div>
    </section>
  );
};

const SessionsTable: React.FC<
  TableProps<GenericRecord> & {
    usersById: UserLookup;
  }
> = ({ data, onSelect, usersById, status }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SessionStatusFilter>("all");
  const [attentionFilter, setAttentionFilter] =
    useState<SessionAttentionFilter>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredSessions = useMemo(
    () =>
      data.filter((session) => {
        const artistName = getPersonName(
          session,
          usersById,
          ["artistName", "displayName"],
          ["artistId"]
        );
        const clientName = getPersonName(
          session,
          usersById,
          ["clientName"],
          ["clientId"]
        );
        const sessionStatus = getSessionStatusKey(session);
        const matchesStatus =
          statusFilter === "all" || sessionStatus === statusFilter;
        return (
          matchesStatus &&
          isSessionAttentionMatch(session, attentionFilter) &&
          isInDateRange(getFirstAppointmentValue(session), startDate, endDate) &&
          matchesSearch(search, [
            session.id,
            getString(session, "bookingId"),
            artistName,
            clientName,
            getString(session, "artistId"),
            getString(session, "clientId"),
          ])
        );
      }),
    [attentionFilter, data, endDate, search, startDate, statusFilter, usersById]
  );

  const hasActiveTools =
    search || statusFilter !== "all" || attentionFilter !== "all" || startDate || endDate;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold text-white">Sessions</h2>
        <DataHealth status={status} total={data.length} visible={filteredSessions.length} />
      </div>
      <div className="flex flex-wrap gap-2">
        <QuickFilterButton
          label="Overdue"
          count={getSessionAttentionCount(data, "overdue")}
          active={attentionFilter === "overdue"}
          onClick={() =>
            setAttentionFilter(attentionFilter === "overdue" ? "all" : "overdue")
          }
        />
        <QuickFilterButton
          label="Missing date"
          count={getSessionAttentionCount(data, "missing_date")}
          active={attentionFilter === "missing_date"}
          onClick={() =>
            setAttentionFilter(
              attentionFilter === "missing_date" ? "all" : "missing_date"
            )
          }
        />
      </div>
      <ToolPanel>
        <ToolField label="Search">
          <ToolInput
            value={search}
            onChange={setSearch}
            placeholder="Artist, client, booking, or ID"
          />
        </ToolField>
        <ToolField label="Status">
          <ToolSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: "All sessions", value: "all" },
              { label: "Not started", value: "not_started" },
              { label: "In progress", value: "in_progress" },
              { label: "Completed", value: "completed" },
              { label: "Awaiting next", value: "awaiting_next_session" },
              { label: "Other", value: "other" },
            ]}
          />
        </ToolField>
        <ToolField label="From">
          <ToolInput value={startDate} onChange={setStartDate} type="date" />
        </ToolField>
        <ToolField label="To">
          <ToolInput value={endDate} onChange={setEndDate} type="date" />
        </ToolField>
        <ClearToolsButton
          disabled={!hasActiveTools}
          onClick={() => {
            setSearch("");
            setStatusFilter("all");
            setAttentionFilter("all");
            setStartDate("");
            setEndDate("");
          }}
        />
      </ToolPanel>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[1040px] divide-y divide-white/10">
          <div className={`${tableHeaderClass} grid-cols-7`}>
            <span>Session</span>
            <span>Client</span>
            <span>Artist</span>
            <span>Booking</span>
            <span>Scheduled</span>
            <span>Status</span>
            <span>Progress</span>
          </div>
          {filteredSessions.map((session) => {
            const clientId = getString(session, "clientId");
            const artistId = getString(session, "artistId");
            const bookingId = getString(session, "bookingId");
            const activeSession =
              getNumber(session, "activeSessionNumber") ||
              getNumber(session, "sessionNumber") ||
              1;
            const totalSessions =
              getNumber(session, "estimatedSessionCount") ||
              getNumber(session, "totalSessions") ||
              1;
            const remainingBalance = getNumber(session, "remainingBalanceAmount");
            return (
              <button
                key={session.id}
                onClick={() => onSelect(session)}
                className={`${tableRowClass} grid-cols-7`}
              >
                <span className={`${inlineCellClass} truncate`}>
                  Session {activeSession}
                </span>
                <PersonCell
                  name={getPersonName(session, usersById, ["clientName"], ["clientId"])}
                  avatar={getPersonAvatar(
                    session,
                    usersById,
                    ["clientAvatar", "clientAvatarUrl"],
                    ["clientId"]
                  )}
                  fallbackLabel="Client"
                  copyValue={clientId}
                />
                <PersonCell
                  name={getPersonName(
                    session,
                    usersById,
                    ["artistName", "displayName"],
                    ["artistId"]
                  )}
                  avatar={getPersonAvatar(
                    session,
                    usersById,
                    ["artistAvatar", "artistAvatarUrl"],
                    ["artistId"]
                  )}
                  fallbackLabel="Artist"
                  copyValue={artistId}
                />
                <span className="flex min-h-8 min-w-0 items-center gap-1 truncate">
                  {bookingId || "-"}
                  {bookingId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(bookingId);
                      }}
                      className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                      aria-label="Copy booking ID"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </span>
                <span className={inlineCellClass}>{getFirstAppointmentLabel(session)}</span>
                <span className={`${inlineCellClass} capitalize`}>
                  {formatStatusLabel(session.status)}
                </span>
                <span className={inlineCellClass}>
                  {activeSession}/{totalSessions}
                  {typeof remainingBalance === "number" &&
                    remainingBalance > 0 && (
                      <span className="ml-2 text-neutral-500">
                        {formatMoney(remainingBalance)} due
                      </span>
                    )}
                </span>
              </button>
            );
          })}
          <EmptyTableState total={data.length} visible={filteredSessions.length} />
        </div>
      </div>
    </section>
  );
};

/**
 * Main admin dashboard component. Handles authentication/authorization,
 * real‑time data subscriptions and conditional rendering of tables.
 */
const AdminDashboardView: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeView, setActiveView] = useState<AdminView>("artists");

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [artists, setArtists] = useState<ArtistRecord[]>([]);
  const [requests, setRequests] = useState<GenericRecord[]>([]);
  const [offers, setOffers] = useState<GenericRecord[]>([]);
  const [bookings, setBookings] = useState<GenericRecord[]>([]);
  const [sessions, setSessions] = useState<GenericRecord[]>([]);
  const [collectionStatuses, setCollectionStatuses] = useState(
    getInitialCollectionStatus
  );

  const [selectedItem, setSelectedItem] = useState<
    GenericRecord | ArtistRecord | null
  >(null);

  const usersById = useMemo<UserLookup>(
    () =>
      users.reduce<UserLookup>((lookup, user) => {
        lookup[user.id] = user;
        return lookup;
      }, {}),
    [users]
  );

  const sessionRows = useMemo(
    () => buildSessionRows(sessions, bookings),
    [sessions, bookings]
  );

  // Listen for auth changes and fetch user role
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userAuth) => {
      if (userAuth) {
        try {
          const snap = await getDoc(doc(db, "users", userAuth.uid));
          if (snap.exists()) {
            const data = snap.data();
            // Only allow users with the admin role through
            if (data && data.role === "admin") {
              setCurrentUser({ id: userAuth.uid, ...data });
            }
          }
        } catch (err) {
          console.error("Failed to load user for admin dashboard", err);
        }
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to Firestore collections once an admin is authenticated
  useEffect(() => {
    if (!currentUser) return;
    setCollectionStatuses(markAllCollectionsLoading());
    const updateStatus = (view: AdminView, status: CollectionStatus) => {
      setCollectionStatuses((current) => ({ ...current, [view]: status }));
    };
    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const results: UserRecord[] = [];
        snap.forEach((docSnap) => {
          results.push({ id: docSnap.id, ...docSnap.data() } as UserRecord);
        });
        setUsers(results);
      },
      (error) => {
        console.error("Failed to load users for admin dashboard", error);
        toast.error("Could not load user lookup data");
      }
    );
    // Artists
    // Avoid requiring a composite index for ordering by createdAt on a filtered query.
    // Instead, query all artists and perform client-side sorting by createdAt descending.
    const artistsQuery = query(
      collection(db, "users"),
      where("role", "==", "artist")
    );
    const unsubArtists = onSnapshot(
      artistsQuery,
      (snap) => {
        const results: ArtistRecord[] = [];
        snap.forEach((docSnap) => {
          results.push({ id: docSnap.id, ...docSnap.data() } as ArtistRecord);
        });
        results.sort((a, b) => {
          const aDate = getTimestampDate(a.createdAt);
          const bDate = getTimestampDate(b.createdAt);
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          return bDate.getTime() - aDate.getTime();
        });
        setArtists(results);
        updateStatus("artists", getCollectionSuccessState());
      },
      (error) => updateStatus("artists", getCollectionErrorState(error))
    );
    // Booking requests
    const requestsQuery = query(
      collection(db, "bookingRequests"),
      orderBy("createdAt", "desc")
    );
    const unsubRequests = onSnapshot(
      requestsQuery,
      (snap) => {
        const results: GenericRecord[] = [];
        snap.forEach((docSnap) => {
          results.push({ id: docSnap.id, ...docSnap.data() } as GenericRecord);
        });
        setRequests(results);
        updateStatus("requests", getCollectionSuccessState());
      },
      (error) => updateStatus("requests", getCollectionErrorState(error))
    );
    // Offers
    const offersQuery = query(
      collection(db, "offers"),
      orderBy("createdAt", "desc")
    );
    const unsubOffers = onSnapshot(
      offersQuery,
      (snap) => {
        const results: GenericRecord[] = [];
        snap.forEach((docSnap) => {
          results.push({ id: docSnap.id, ...docSnap.data() } as GenericRecord);
        });
        setOffers(results);
        updateStatus("offers", getCollectionSuccessState());
      },
      (error) => updateStatus("offers", getCollectionErrorState(error))
    );
    // Bookings
    const bookingsQuery = query(
      collection(db, "bookings"),
      orderBy("createdAt", "desc")
    );
    const unsubBookings = onSnapshot(
      bookingsQuery,
      (snap) => {
        const results: GenericRecord[] = [];
        snap.forEach((docSnap) => {
          results.push({ id: docSnap.id, ...docSnap.data() } as GenericRecord);
        });
        setBookings(results);
        updateStatus("bookings", getCollectionSuccessState());
      },
      (error) => updateStatus("bookings", getCollectionErrorState(error))
    );
    // Sessions
    const sessionsQuery = query(
      collection(db, "sessions"),
      orderBy("createdAt", "desc")
    );
    const unsubSessions = onSnapshot(
      sessionsQuery,
      (snap) => {
        const results: GenericRecord[] = [];
        snap.forEach((docSnap) => {
          results.push({ id: docSnap.id, ...docSnap.data() } as GenericRecord);
        });
        setSessions(results);
        updateStatus("sessions", getCollectionSuccessState());
      },
      (error) => updateStatus("sessions", getCollectionErrorState(error))
    );
    return () => {
      unsubUsers();
      unsubArtists();
      unsubRequests();
      unsubOffers();
      unsubBookings();
      unsubSessions();
    };
  }, [currentUser]);

  // Compute counts for navigation badges
  const navCounts: Partial<Record<AdminView, number>> = {
    artists: artists.length,
    requests: requests.length,
    offers: offers.length,
    bookings: bookings.length,
    sessions: sessionRows.length,
  };

  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen text-white">
        Loading admin tools...
      </div>
    );
  }
  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen text-white">
        You do not have permission to view this page.
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#121212] pt-20 text-white md:flex-row">
      <AdminSidebarNavigation
        activeView={activeView}
        onChange={setActiveView}
        counts={navCounts}
      />
      <main className="flex-1 p-6 space-y-8">
        {activeView === "artists" && (
          <ArtistsTable
            data={artists}
            status={collectionStatuses.artists}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
        {activeView === "requests" && (
          <RequestsTable
            data={requests}
            offers={offers}
            usersById={usersById}
            status={collectionStatuses.requests}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
        {activeView === "offers" && (
          <OffersTable
            data={offers}
            usersById={usersById}
            status={collectionStatuses.offers}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
        {activeView === "bookings" && (
          <BookingsTable
            data={bookings}
            usersById={usersById}
            adminUser={currentUser}
            status={collectionStatuses.bookings}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
        {activeView === "sessions" && (
          <SessionsTable
            data={sessionRows}
            usersById={usersById}
            status={collectionStatuses.sessions}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
      </main>
      <PreviewModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
};

export default AdminDashboardView;
