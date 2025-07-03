import React, { useState } from "react";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 p-4 bg-[var(--color-bg-base)] rounded-xl sticky top-30 self-start h-fit">
        <ul className="space-y-2">
          {views.map((view) => (
            <li key={view}>
              <button
                onClick={() => onViewChange(view)}
                className={`w-full text-left px-4 py-2 rounded-lg transition-all ${
                  activeView === view
                    ? "text-white font-bold"
                    : "text-neutral-400 hover:bg-[var(--color-bg-card)]"
                }`}
              >
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Mobile Toggle Button */}
      <div className="md:hidden mb-4 sticky top-20 z-50">
        <button
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="text-white px-4 py-2 bg-[var(--color-bg-base)] rounded-lg w-full"
        >
          {mobileMenuOpen ? "Close Menu" : "Menu"}
        </button>

        {/* Mobile Dropdown Menu */}
        <div
          className={`transition-all duration-300 overflow-hidden bg-[var(--color-bg-base)] ${
            mobileMenuOpen ? "max-h-96" : "max-h-0"
          }`}
        >
          <ul className="space-y-2 bg-[var(--color-bg-base)] rounded-xl p-4">
            {views.map((view) => (
              <li key={view}>
                <button
                  onClick={() => {
                    onViewChange(view);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-all ${
                    activeView === view
                      ? "bg-gradient-to-b from-[var(--color-bg-base)] to-[var(--color-bg-card)]"
                      : "text-white hover:bg-[var(--color-bg-card)]"
                  }`}
                >
                  {view.charAt(0).toUpperCase() + view.slice(1)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
};

export default SidebarNavigation;
