import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

type ViewTab =
  | "requests"
  | "offers"
  | "bookings"
  | "pending" // represents pending_payment
  | "confirmed"
  | "paid"
  | "cancelled"
  | "calendar"
  | "flashes"
  | "gallery";

interface SidebarProps {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
}

const SidebarNavigation: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
}) => {
  const [showBookingsDropdown, setShowBookingsDropdown] = useState(false);

  const tabs = [
    { key: "requests", label: "Requests" },
    { key: "offers", label: "Offers" },
    { key: "bookings", label: "Bookings" },
    { key: "flashes", label: "Flashes" },
    { key: "gallery", label: "Gallery" },
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
                  <span>{label}</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                      showBookingsDropdown ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {showBookingsDropdown && (
                  <ul className="ml-8 mt-2 space-y-1">
                    {bookingTabs.map(({ key: subKey, label }) => (
                      <li key={subKey}>
                        <button
                          onClick={() => onTabChange(subKey as ViewTab)}
                          className={`w-full text-left px-3 py-1 rounded-lg transition-all ${
                            activeTab === subKey
                              ? "text-white font-bold"
                              : "text-neutral-400 hover:bg-[var(--color-bg-card)]"
                          }`}
                        >
                          {label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <button
                onClick={() => onTabChange(key as ViewTab)}
                className={`w-full text-left px-4 py-2 rounded-lg transition-all ${
                  activeTab === key
                    ? "text-white font-bold"
                    : "text-neutral-400 hover:bg-[var(--color-bg-card)]"
                }`}
              >
                {label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default SidebarNavigation;
