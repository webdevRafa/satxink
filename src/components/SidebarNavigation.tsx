// SidebarNavigation.tsx
import React from "react";
type ViewType = "requests" | "offers" | "confirmed";
interface SidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const SidebarNavigation: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
}) => {
  const views: ViewType[] = ["requests", "offers", "confirmed"];

  return (
    <aside className="w-full md:w-64 p-4 bg-zinc-900 rounded-xl mb-4 md:mb-0">
      <ul className="space-y-2">
        {views.map((view) => (
          <li key={view}>
            <button
              onClick={() => onViewChange(view)}
              className={`w-full text-left px-4 py-2 rounded-lg transition-all ${
                activeView === view
                  ? "bg-white text-black font-bold"
                  : "text-white hover:bg-zinc-800"
              }`}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default SidebarNavigation;
