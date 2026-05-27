import { Fragment, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
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

const formatDate = (value: unknown) => {
  const date = getTimestampDate(value);
  return date ? date.toLocaleDateString() : "-";
};

const formatDateTime = (value: unknown) => {
  const date = getTimestampDate(value);
  return date ? date.toLocaleString() : "-";
};

const formatStatusLabel = (status: unknown) => {
  if (!status || typeof status !== "string") return "-";
  return status.replace(/_/g, " ");
};

const getString = (record: GenericRecord | UserRecord | undefined, key: string) => {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : "";
};

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

const getOfferStatusLabel = (offer: GenericRecord) => {
  const status = getString(offer, "status");
  if (status === "accepted") return "Client accepted";
  if (status === "declined") return "Client declined";
  if (status === "expired") return "Expired";
  return "Waiting for client";
};

const getRequestStatusLabel = (request: GenericRecord, offers: GenericRecord[]) => {
  const requestId = request.id;
  const requestStatus = getString(request, "status");
  const hasOffer = offers.some((offer) => getString(offer, "requestId") === requestId);
  return hasOffer || requestStatus === "offered"
    ? "Artist responded"
    : "Waiting for offer";
};

const getTotalLabel = (booking: GenericRecord) => {
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
  return typeof totalNum === "number" ? `$${totalNum.toFixed(2)}` : "-";
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
  <span className="flex min-w-0 items-center gap-2">
    {avatar ? (
      <img
        src={avatar}
        alt={name || fallbackLabel}
        className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
      />
    ) : (
      <div className="h-6 w-6 flex-shrink-0 rounded-full bg-white/10" />
    )}
    <span className="flex min-w-0 items-center gap-1">
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
}

const ArtistsTable: React.FC<TableProps<ArtistRecord>> = ({
  data,
  onSelect,
}) => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">Artists</h2>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[600px] divide-y divide-white/10">
          {/* Header */}
          <div className="grid grid-cols-4 gap-4 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-neutral-300">
            <span>Name</span>
            <span>Email</span>
            <span>Shop</span>
            <span>Joined</span>
          </div>
          {/* Rows */}
          {data.map((artist) => {
            const artistName = getUserName(artist, artist.id);
            return (
              <button
                key={artist.id}
                onClick={() => onSelect(artist)}
                className="grid grid-cols-4 gap-4 w-full px-4 py-3 text-left text-sm hover:bg-white/[0.03] focus:outline-none focus:ring-1 focus:ring-white"
              >
                <PersonCell
                  name={artistName}
                  avatar={getUserAvatar(artist)}
                  fallbackLabel="Artist"
                  copyValue={artist.id}
                />
                <span>{artist.email || "-"}</span>
                <span>
                  {getString(artist, "shopName") ||
                    getString(artist, "studioName") ||
                    getString(artist, "shopId") ||
                    getString(artist, "location") ||
                    "-"}
                </span>
                <span>{formatDate(artist.createdAt)}</span>
              </button>
            );
          })}
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
> = ({ data, onSelect, offers, usersById }) => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">Tattoo requests</h2>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[700px] divide-y divide-white/10">
          <div className="grid grid-cols-5 gap-4 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-neutral-300">
            <span>Status</span>
            <span>Client</span>
            <span>Artist</span>
            <span>Budget</span>
            <span>Created</span>
          </div>
          {data.map((req) => {
            const clientId = getString(req, "clientId");
            const artistId = getString(req, "artistId");
            return (
              <button
                key={req.id}
                onClick={() => onSelect(req)}
                className="grid grid-cols-5 gap-4 w-full px-4 py-3 text-left text-sm hover:bg-white/[0.03] focus:outline-none focus:ring-1 focus:ring-white"
              >
                <span className="truncate capitalize">
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
                <span>{formatBudget(req)}</span>
                <span>{formatDateTime(req.createdAt)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const OffersTable: React.FC<
  TableProps<GenericRecord> & {
    usersById: UserLookup;
  }
> = ({ data, onSelect, usersById }) => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">Tattoo offers</h2>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[860px] divide-y divide-white/10">
          <div className="grid grid-cols-6 gap-4 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-neutral-300">
            <span>Offer</span>
            <span>Artist</span>
            <span>Client</span>
            <span>Price</span>
            <span>Status</span>
            <span>Created</span>
          </div>
          {data.map((offer) => {
            const artistId = getString(offer, "artistId");
            const clientId = getString(offer, "clientId");
            return (
              <button
                key={offer.id}
                onClick={() => onSelect(offer)}
                className="grid grid-cols-6 gap-4 w-full px-4 py-3 text-left text-sm hover:bg-white/[0.03] focus:outline-none focus:ring-1 focus:ring-white"
              >
                <span className="flex items-center gap-1 truncate">
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
                <span>{formatMoney(offer.price || offer.flashPrice)}</span>
                <span className="truncate capitalize">{getOfferStatusLabel(offer)}</span>
                <span>{formatDate(offer.createdAt)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const BookingsTable: React.FC<
  TableProps<GenericRecord> & {
    usersById: UserLookup;
  }
> = ({ data, onSelect, usersById }) => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">Bookings</h2>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[980px] divide-y divide-white/10">
          <div className="grid grid-cols-7 gap-4 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-neutral-300">
            <span>ID</span>
            <span>Client</span>
            <span>Artist</span>
            <span>Status</span>
            <span>Session</span>
            <span>Total</span>
            <span>Created</span>
          </div>
          {data.map((booking) => {
            const clientId = getString(booking, "clientId");
            const artistId = getString(booking, "artistId");
            return (
              <button
                key={booking.id}
                onClick={() => onSelect(booking)}
                className="grid grid-cols-7 gap-4 w-full px-4 py-3 text-left text-sm hover:bg-white/[0.03] focus:outline-none focus:ring-1 focus:ring-white"
              >
                <span className="flex items-center gap-1 truncate">
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
                <span className="capitalize">{formatStatusLabel(booking.status)}</span>
                <span>{getFirstAppointmentLabel(booking)}</span>
                <span>{getTotalLabel(booking)}</span>
                <span>{formatDateTime(booking.createdAt)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const SessionsTable: React.FC<
  TableProps<GenericRecord> & {
    usersById: UserLookup;
  }
> = ({ data, onSelect, usersById }) => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">Sessions</h2>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[1040px] divide-y divide-white/10">
          <div className="grid grid-cols-7 gap-4 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-neutral-300">
            <span>Session</span>
            <span>Client</span>
            <span>Artist</span>
            <span>Booking</span>
            <span>Scheduled</span>
            <span>Status</span>
            <span>Progress</span>
          </div>
          {data.map((session) => {
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
                className="grid grid-cols-7 gap-4 w-full px-4 py-3 text-left text-sm hover:bg-white/[0.03] focus:outline-none focus:ring-1 focus:ring-white"
              >
                <span className="truncate">
                  Session {activeSession}
                  {String(session.adminSessionSource || "") === "booking" ? (
                    <span className="ml-2 text-xs text-neutral-500">from booking</span>
                  ) : null}
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
                <span className="flex items-center gap-1 truncate">
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
                <span>{getFirstAppointmentLabel(session)}</span>
                <span className="capitalize">{formatStatusLabel(session.status)}</span>
                <span>
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
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const results: UserRecord[] = [];
      snap.forEach((docSnap) => {
        results.push({ id: docSnap.id, ...docSnap.data() } as UserRecord);
      });
      setUsers(results);
    });
    // Artists
    // Avoid requiring a composite index for ordering by createdAt on a filtered query.
    // Instead, query all artists and perform client-side sorting by createdAt descending.
    const artistsQuery = query(
      collection(db, "users"),
      where("role", "==", "artist")
    );
    const unsubArtists = onSnapshot(artistsQuery, (snap) => {
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
    });
    // Booking requests
    const requestsQuery = query(
      collection(db, "bookingRequests"),
      orderBy("createdAt", "desc")
    );
    const unsubRequests = onSnapshot(requestsQuery, (snap) => {
      const results: GenericRecord[] = [];
      snap.forEach((docSnap) => {
        results.push({ id: docSnap.id, ...docSnap.data() } as GenericRecord);
      });
      setRequests(results);
    });
    // Offers
    const offersQuery = query(
      collection(db, "offers"),
      orderBy("createdAt", "desc")
    );
    const unsubOffers = onSnapshot(offersQuery, (snap) => {
      const results: GenericRecord[] = [];
      snap.forEach((docSnap) => {
        results.push({ id: docSnap.id, ...docSnap.data() } as GenericRecord);
      });
      setOffers(results);
    });
    // Bookings
    const bookingsQuery = query(
      collection(db, "bookings"),
      orderBy("createdAt", "desc")
    );
    const unsubBookings = onSnapshot(bookingsQuery, (snap) => {
      const results: GenericRecord[] = [];
      snap.forEach((docSnap) => {
        results.push({ id: docSnap.id, ...docSnap.data() } as GenericRecord);
      });
      setBookings(results);
    });
    // Sessions
    const sessionsQuery = query(
      collection(db, "sessions"),
      orderBy("createdAt", "desc")
    );
    const unsubSessions = onSnapshot(sessionsQuery, (snap) => {
      const results: GenericRecord[] = [];
      snap.forEach((docSnap) => {
        results.push({ id: docSnap.id, ...docSnap.data() } as GenericRecord);
      });
      setSessions(results);
    });
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
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
        {activeView === "requests" && (
          <RequestsTable
            data={requests}
            offers={offers}
            usersById={usersById}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
        {activeView === "offers" && (
          <OffersTable
            data={offers}
            usersById={usersById}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
        {activeView === "bookings" && (
          <BookingsTable
            data={bookings}
            usersById={usersById}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
        {activeView === "sessions" && (
          <SessionsTable
            data={sessionRows}
            usersById={usersById}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
      </main>
      <PreviewModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
};

export default AdminDashboardView;
