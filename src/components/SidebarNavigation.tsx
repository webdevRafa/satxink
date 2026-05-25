import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

type ViewTab =
  | "profile"
  | "requests"
  | "offers"
  | "bookings"
  | "sessions"
  | "projects"
  | "pending" // represents pending_payment
  | "confirmed"
  | "paid"
  | "cancelled"
  | "calendar"
  | "flashes"
  | "gallery"
  | "events"
  | "payments";

interface SidebarProps {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  counts?: Partial<Record<ViewTab, number>>;
}

const SidebarNavigation: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  counts = {},
}) => {
  const [showBookingsDropdown, setShowBookingsDropdown] = useState(false);

  const tabs = [
    { key: "profile", label: "Profile" },
    { key: "requests", label: "Requests" },
    { key: "offers", label: "Offers" },
    { key: "bookings", label: "Bookings" },
    { key: "sessions", label: "Sessions" },
    { key: "projects", label: "Projects" },
    { key: "flashes", label: "Flashes" },
    { key: "gallery", label: "Gallery" },
    { key: "events", label: "Events" },
    { key: "payments", label: "Payments" },
    { key: "calendar", label: "Calendar Sync" },
  ];

  const bookingTabs = [
    { key: "pending", label: "Pending" }, // internally maps to pending_payment
    { key: "confirmed", label: "Confirmed" },
    { key: "paid", label: "Paid" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <aside className="hidden md:block w-64 p-4 bg-[var(--color-bg-base)] rounded-xl sticky top-30 self-start h-fit">
      <ul className="space-y-2">
        {tabs.map(({ key, label }) => (
          <li key={key}>
            {key === "bookings" ? (
              <>
                <button
                  onClick={() => setShowBookingsDropdown((prev) => !prev)}
                  className={`flex items-center justify-between w-full px-4 py-2 rounded-lg transition-all ${
                    [
                      "pending",
                      "confirmed",
                      "paid",
                      "cancelled",
                      "bookings",
                    ].includes(activeTab)
                      ? "text-white font-bold"
                      : "text-neutral-400 hover:bg-[var(--color-bg-card)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {label}
                    {typeof counts.bookings === "number" && (
                      <CountBadge count={counts.bookings} active={["pending", "confirmed", "paid", "cancelled", "bookings"].includes(activeTab)} />
                    )}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showBookingsDropdown ? "rotate-180" : ""}`} />
                </button>
                {showBookingsDropdown && (
                  <ul className="ml-8 mt-2 space-y-1">
                    {bookingTabs.map(({ key: subKey, label }) => (
                      <li key={subKey}>
                        <button
                          onClick={() => onTabChange(subKey as ViewTab)}
                          className={`flex w-full items-center gap-2 text-left px-3 py-1 rounded-lg transition-all ${
                            activeTab === subKey
                              ? "text-white font-bold"
                              : "text-neutral-400 hover:bg-[var(--color-bg-card)]"
                          }`}
                        >
                          <span>{label}</span>
                          {typeof counts[subKey as ViewTab] === "number" && (
                            <CountBadge count={counts[subKey as ViewTab] || 0} active={activeTab === subKey} />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <button
                onClick={() => onTabChange(key as ViewTab)}
                className={`inline-flex w-full items-center gap-2 text-left px-4 py-2 rounded-lg transition-all ${
                  activeTab === key
                    ? "text-white font-bold"
                    : "text-neutral-400 hover:bg-[var(--color-bg-card)]"
                }`}
              >
                <span>{label}</span>
                {typeof counts[key as ViewTab] === "number" && (
                  <CountBadge count={counts[key as ViewTab] || 0} active={activeTab === key} />
                )}
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
};

const CountBadge = ({ count, active }: { count: number; active: boolean }) => (
  <span
    className={`ml-auto min-w-6 rounded-full px-2 py-0.5 text-center text-xs ${
      active ? "bg-white/15 text-white" : "bg-white/[0.06] text-neutral-400"
    }`}
  >
    {count}
  </span>
);

export default SidebarNavigation;
