import { Fragment, useEffect, useState } from "react";
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
  email?: string;
  avatarUrl?: string;
  location?: string;
  createdAt?: any;
  [key: string]: any;
}

interface GenericRecord {
  id: string;
  [key: string]: any;
}

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
  const links: { key: AdminView; label: string; icon: any }[] = [
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
          {data.map((artist) => (
            <button
              key={artist.id}
              onClick={() => onSelect(artist)}
              className="grid grid-cols-4 gap-4 w-full px-4 py-3 text-left text-sm hover:bg-white/[0.03] focus:outline-none focus:ring-1 focus:ring-white"
            >
              {/* Name with avatar and copy icon */}
              <span className="flex items-center gap-3">
                {artist.avatarUrl ? (
                  <img
                    src={artist.avatarUrl}
                    alt={artist.displayName || "Artist avatar"}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-white/10" />
                )}
                <span className="flex items-center gap-1 truncate">
                  {artist.displayName || artist.id}
                  {artist.id && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(String(artist.id)).then(
                          () => toast.success("Copied to clipboard"),
                          () => toast.error("Failed to copy")
                        );
                      }}
                      className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </span>
              </span>
              {/* Email */}
              <span>{artist.email || "-"}</span>
              {/* Shop/studio */}
              <span>
                {artist.shopName ||
                  artist.studioName ||
                  artist.shopId ||
                  artist.location ||
                  "-"}
              </span>
              {/* Joined date */}
              <span>
                {artist.createdAt &&
                typeof artist.createdAt.toDate === "function"
                  ? new Date(artist.createdAt.toDate()).toLocaleDateString()
                  : artist.createdAt?.seconds
                  ? new Date(
                      artist.createdAt.seconds * 1000
                    ).toLocaleDateString()
                  : "-"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

const RequestsTable: React.FC<TableProps<GenericRecord>> = ({
  data,
  onSelect,
}) => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">Tattoo requests</h2>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[700px] divide-y divide-white/10">
          <div className="grid grid-cols-5 gap-4 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-neutral-300">
            <span>Request</span>
            <span>Client</span>
            <span>Artist</span>
            <span>Budget</span>
            <span>Created</span>
          </div>
          {data.map((req) => (
            <button
              key={req.id}
              onClick={() => onSelect(req)}
              className="grid grid-cols-5 gap-4 w-full px-4 py-3 text-left text-sm hover:bg-white/[0.03] focus:outline-none focus:ring-1 focus:ring-white"
            >
              {/* Request description */}
              <span className="truncate">
                {req.description || req.bodyPlacement || req.size || req.id}
              </span>
              {/* Client with avatar and copy icon */}
              <span className="flex items-center gap-2">
                {req.clientAvatar ? (
                  <img
                    src={req.clientAvatar}
                    alt={req.clientName || "Client"}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-white/10" />
                )}
                <span className="flex items-center gap-1 truncate">
                  {req.clientName || req.clientId || "-"}
                  {req.clientId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard
                          .writeText(String(req.clientId))
                          .then(
                            () => toast.success("Copied to clipboard"),
                            () => toast.error("Failed to copy")
                          );
                      }}
                      className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </span>
              </span>
              {/* Artist with avatar and copy icon */}
              <span className="flex items-center gap-2">
                {req.artistAvatar ||
                req.artistAvatarUrl ||
                (req.artist &&
                  (req.artist.avatarUrl ||
                    req.artist.avatarURL ||
                    req.artist.avatar)) ? (
                  <img
                    src={
                      (req.artistAvatar as string) ||
                      (req.artistAvatarUrl as string) ||
                      (req.artist?.avatarUrl as string) ||
                      (req.artist?.avatarURL as string) ||
                      (req.artist?.avatar as string)
                    }
                    alt={req.artistName || req.artist?.displayName || "Artist"}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-white/10" />
                )}
                <span className="flex items-center gap-1 truncate">
                  {req.artistName ||
                    req.artist?.displayName ||
                    req.artistId ||
                    "-"}
                  {req.artistId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard
                          .writeText(String(req.artistId))
                          .then(
                            () => toast.success("Copied to clipboard"),
                            () => toast.error("Failed to copy")
                          );
                      }}
                      className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </span>
              </span>
              {/* Budget */}
              <span>
                {typeof req.budget === "number"
                  ? `$${req.budget.toFixed(2)}`
                  : req.budget || "-"}
              </span>
              {/* Created date and time */}
              <span>
                {req.createdAt && typeof req.createdAt.toDate === "function"
                  ? new Date(req.createdAt.toDate()).toLocaleString()
                  : req.createdAt?.seconds
                  ? new Date(req.createdAt.seconds * 1000).toLocaleString()
                  : "-"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

const OffersTable: React.FC<TableProps<GenericRecord>> = ({
  data,
  onSelect,
}) => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">Tattoo offers</h2>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[700px] divide-y divide-white/10">
          <div className="grid grid-cols-5 gap-4 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-neutral-300">
            <span>Offer</span>
            <span>Artist</span>
            <span>Client</span>
            <span>Price</span>
            <span>Created</span>
          </div>
          {data.map((offer) => (
            <button
              key={offer.id}
              onClick={() => onSelect(offer)}
              className="grid grid-cols-5 gap-4 w-full px-4 py-3 text-left text-sm hover:bg-white/[0.03] focus:outline-none focus:ring-1 focus:ring-white"
            >
              {/* Offer title/description with ID copy */}
              <span className="flex items-center gap-1 truncate">
                {offer.flashTitle || offer.description || offer.id}
                {offer.id && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(String(offer.id)).then(
                        () => toast.success("Copied to clipboard"),
                        () => toast.error("Failed to copy")
                      );
                    }}
                    className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                  >
                    <Copy size={14} />
                  </button>
                )}
              </span>
              {/* Artist with avatar and copy icon */}
              <span className="flex items-center gap-2">
                {offer.artistAvatar ? (
                  <img
                    src={offer.artistAvatar}
                    alt={offer.artistName || "Artist"}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-white/10" />
                )}
                <span className="flex items-center gap-1 truncate">
                  {offer.artistName || offer.artistId || "-"}
                  {offer.artistId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard
                          .writeText(String(offer.artistId))
                          .then(
                            () => toast.success("Copied to clipboard"),
                            () => toast.error("Failed to copy")
                          );
                      }}
                      className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </span>
              </span>
              {/* Client with avatar and copy icon */}
              <span className="flex items-center gap-2">
                {offer.clientAvatar ? (
                  <img
                    src={offer.clientAvatar}
                    alt={offer.clientName || "Client"}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-white/10" />
                )}
                <span className="flex items-center gap-1 truncate">
                  {offer.clientName || offer.clientId || "-"}
                  {offer.clientId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard
                          .writeText(String(offer.clientId))
                          .then(
                            () => toast.success("Copied to clipboard"),
                            () => toast.error("Failed to copy")
                          );
                      }}
                      className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </span>
              </span>
              {/* Price */}
              <span>
                {typeof offer.price === "number"
                  ? `$${offer.price.toFixed(2)}`
                  : typeof offer.flashPrice === "number"
                  ? `$${offer.flashPrice.toFixed(2)}`
                  : offer.price || offer.flashPrice || "-"}
              </span>
              {/* Created */}
              <span>
                {offer.createdAt && typeof offer.createdAt.toDate === "function"
                  ? new Date(offer.createdAt.toDate()).toLocaleDateString()
                  : offer.createdAt?.seconds
                  ? new Date(
                      offer.createdAt.seconds * 1000
                    ).toLocaleDateString()
                  : "-"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

const BookingsTable: React.FC<TableProps<GenericRecord>> = ({
  data,
  onSelect,
}) => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">Bookings</h2>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[800px] divide-y divide-white/10">
          <div className="grid grid-cols-6 gap-4 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-neutral-300">
            <span>ID</span>
            <span>Client</span>
            <span>Artist</span>
            <span>Status</span>
            <span>Total</span>
            <span>Created</span>
          </div>
          {data.map((booking) => {
            // Compute a total price fallback for bookings with missing totalPrice
            let totalNum: number | undefined;
            if (typeof booking.price === "number") {
              totalNum = booking.price;
            } else if (typeof booking.totalPrice === "number") {
              totalNum = booking.totalPrice;
            } else if (typeof booking.totalAmount === "number") {
              totalNum = booking.totalAmount;
            } else {
              const paid =
                typeof booking.totalArtistPaidAmount === "number"
                  ? booking.totalArtistPaidAmount
                  : 0;
              const deposit =
                typeof booking.depositAmount === "number"
                  ? booking.depositAmount
                  : 0;
              const remaining =
                typeof booking.remainingBalanceAmount === "number"
                  ? booking.remainingBalanceAmount
                  : 0;
              const remainingPaid =
                typeof booking.remainingPaidAmount === "number"
                  ? booking.remainingPaidAmount
                  : 0;
              const sum = paid + deposit + remaining + remainingPaid;
              totalNum = sum > 0 ? sum : undefined;
            }
            const totalLabel =
              typeof totalNum === "number" && !Number.isNaN(totalNum)
                ? `$${totalNum.toFixed(2)}`
                : "-";
            return (
              <button
                key={booking.id}
                onClick={() => onSelect(booking)}
                className="grid grid-cols-6 gap-4 w-full px-4 py-3 text-left text-sm hover:bg-white/[0.03] focus:outline-none focus:ring-1 focus:ring-white"
              >
                {/* Booking ID with copy icon */}
                <span className="flex items-center gap-1 truncate">
                  {booking.id}
                  {booking.id && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(String(booking.id)).then(
                          () => toast.success("Copied to clipboard"),
                          () => toast.error("Failed to copy")
                        );
                      }}
                      className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </span>
                {/* Client with avatar and copy icon */}
                <span className="flex items-center gap-2">
                  {booking.clientAvatar ? (
                    <img
                      src={booking.clientAvatar}
                      alt={booking.clientName || "Client"}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-white/10" />
                  )}
                  <span className="flex items-center gap-1 truncate">
                    {booking.clientName || booking.clientId || "-"}
                    {booking.clientId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard
                            .writeText(String(booking.clientId))
                            .then(
                              () => toast.success("Copied to clipboard"),
                              () => toast.error("Failed to copy")
                            );
                        }}
                        className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                  </span>
                </span>
                {/* Artist with avatar and copy icon */}
                <span className="flex items-center gap-2">
                  {booking.artistAvatar ? (
                    <img
                      src={booking.artistAvatar}
                      alt={booking.artistName || "Artist"}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-white/10" />
                  )}
                  <span className="flex items-center gap-1 truncate">
                    {booking.artistName || booking.artistId || "-"}
                    {booking.artistId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard
                            .writeText(String(booking.artistId))
                            .then(
                              () => toast.success("Copied to clipboard"),
                              () => toast.error("Failed to copy")
                            );
                        }}
                        className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                  </span>
                </span>
                {/* Status */}
                <span className="capitalize">{booking.status || "-"}</span>
                {/* Total */}
                <span>{totalLabel}</span>
                {/* Created date and time */}
                <span>
                  {booking.createdAt &&
                  typeof booking.createdAt.toDate === "function"
                    ? new Date(booking.createdAt.toDate()).toLocaleString()
                    : booking.createdAt?.seconds
                    ? new Date(
                        booking.createdAt.seconds * 1000
                      ).toLocaleString()
                    : "-"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const SessionsTable: React.FC<TableProps<GenericRecord>> = ({
  data,
  onSelect,
}) => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">Sessions</h2>
      <div className="w-full overflow-x-auto rounded-lg border border-white/10">
        <div className="min-w-[800px] divide-y divide-white/10">
          <div className="grid grid-cols-6 gap-4 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-neutral-300">
            <span>ID</span>
            <span>Client</span>
            <span>Artist</span>
            <span>Scheduled</span>
            <span>Status</span>
            <span>Created</span>
          </div>
          {data.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelect(session)}
              className="grid grid-cols-6 gap-4 w-full px-4 py-3 text-left text-sm hover:bg-white/[0.03] focus:outline-none focus:ring-1 focus:ring-white"
            >
              {/* Session ID */}
              <span className="truncate">{session.id}</span>
              {/* Client with avatar and copy icon */}
              <span className="flex items-center gap-2">
                {session.clientAvatar ? (
                  <img
                    src={session.clientAvatar}
                    alt={session.clientName || "Client"}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-white/10" />
                )}
                <span className="flex items-center gap-1 truncate">
                  {session.clientName || session.clientId || "-"}
                  {session.clientId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard
                          .writeText(String(session.clientId))
                          .then(
                            () => toast.success("Copied to clipboard"),
                            () => toast.error("Failed to copy")
                          );
                      }}
                      className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </span>
              </span>
              {/* Artist with avatar and copy icon */}
              <span className="flex items-center gap-2">
                {session.artistAvatar ? (
                  <img
                    src={session.artistAvatar}
                    alt={session.artistName || "Artist"}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-white/10" />
                )}
                <span className="flex items-center gap-1 truncate">
                  {session.artistName || session.artistId || "-"}
                  {session.artistId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard
                          .writeText(String(session.artistId))
                          .then(
                            () => toast.success("Copied to clipboard"),
                            () => toast.error("Failed to copy")
                          );
                      }}
                      className="ml-1 flex-shrink-0 text-neutral-400 hover:text-white"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </span>
              </span>
              {/* Scheduled date/time */}
              <span>
                {session.scheduledAt &&
                typeof session.scheduledAt.toDate === "function"
                  ? new Date(session.scheduledAt.toDate()).toLocaleString()
                  : session.scheduledAt?.seconds
                  ? new Date(
                      session.scheduledAt.seconds * 1000
                    ).toLocaleString()
                  : session.scheduledAt || "-"}
              </span>
              {/* Status */}
              <span className="capitalize">{session.status || "-"}</span>
              {/* Created date and time */}
              <span>
                {session.createdAt &&
                typeof session.createdAt.toDate === "function"
                  ? new Date(session.createdAt.toDate()).toLocaleString()
                  : session.createdAt?.seconds
                  ? new Date(session.createdAt.seconds * 1000).toLocaleString()
                  : "-"}
              </span>
            </button>
          ))}
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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeView, setActiveView] = useState<AdminView>("artists");

  const [artists, setArtists] = useState<ArtistRecord[]>([]);
  const [requests, setRequests] = useState<GenericRecord[]>([]);
  const [offers, setOffers] = useState<GenericRecord[]>([]);
  const [bookings, setBookings] = useState<GenericRecord[]>([]);
  const [sessions, setSessions] = useState<GenericRecord[]>([]);

  const [selectedItem, setSelectedItem] = useState<
    GenericRecord | ArtistRecord | null
  >(null);

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
        const aDate =
          a.createdAt && typeof a.createdAt.toDate === "function"
            ? a.createdAt.toDate()
            : a.createdAt?.seconds
            ? new Date(a.createdAt.seconds * 1000)
            : null;
        const bDate =
          b.createdAt && typeof b.createdAt.toDate === "function"
            ? b.createdAt.toDate()
            : b.createdAt?.seconds
            ? new Date(b.createdAt.seconds * 1000)
            : null;
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
    sessions: sessions.length,
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
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
        {activeView === "offers" && (
          <OffersTable
            data={offers}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
        {activeView === "bookings" && (
          <BookingsTable
            data={bookings}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
        {activeView === "sessions" && (
          <SessionsTable
            data={sessions}
            onSelect={(item) => setSelectedItem(item)}
          />
        )}
      </main>
      <PreviewModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
};

export default AdminDashboardView;
