// SidebarNavigation.tsx
import React from "react";

type SidebarProps = {
  currentView: string;
  setCurrentView: (view: string) => void;
};

const SidebarNavigation: React.FC<SidebarProps> = ({
  currentView,
  setCurrentView,
}) => {
  const views = ["Booking Requests", "Offers Made", "Confirmed Bookings"];

  return (
    <aside className="w-full md:w-64 p-4 bg-zinc-900 rounded-xl mb-4 md:mb-0">
      <ul className="space-y-2">
        {views.map((view) => (
          <li key={view}>
            <button
              onClick={() => setCurrentView(view)}
              className={`w-full text-left px-4 py-2 rounded-lg transition-all ${
                currentView === view
                  ? "bg-white text-black font-bold"
                  : "text-white hover:bg-zinc-800"
              }`}
            >
              {view}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default SidebarNavigation;
