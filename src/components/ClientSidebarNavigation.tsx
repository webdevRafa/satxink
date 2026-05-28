import { CalendarCheck, Heart, Inbox, ReceiptText, Ticket, UserRound } from "lucide-react";

interface Props {
  activeView:
    | "profile"
    | "liked"
    | "requests"
    | "offers"
    | "bookings"
    | "sessions"
    | "eventPasses";
  onViewChange: (view: Props["activeView"]) => void;
  counts?: Partial<Record<Props["activeView"], number>>;
}

const ClientSidebarNavigation: React.FC<Props> = ({
  activeView,
  onViewChange,
  counts = {},
}) => {
  const links = [
    { key: "profile", label: "Profile", icon: UserRound },
    { key: "liked", label: "Liked Artists", icon: Heart },
    { key: "requests", label: "My Requests", icon: Inbox },
    { key: "offers", label: "Offers", icon: ReceiptText },
    { key: "bookings", label: "Bookings", icon: CalendarCheck },
    { key: "sessions", label: "Sessions", icon: CalendarCheck },
    { key: "eventPasses", label: "Event Passes", icon: Ticket },
  ];

  return (
    <aside className="hidden md:block w-64 p-4 bg-black/20 border-r border-white/5 sticky top-20 self-start h-[calc(100vh-5rem)]">
      <nav className="flex md:flex-col gap-2">
        {links.map((link) => (
          <button
            key={link.key}
            onClick={() => onViewChange(link.key as Props["activeView"])}
            className={`w-full inline-flex items-center gap-3 text-left px-4 py-3 rounded-md text-sm font-semibold transition ${
              activeView === link.key
                ? "bg-white/[0.08] text-white"
                : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <link.icon size={17} aria-hidden="true" />
            <span className="flex-1">{link.label}</span>
            {link.key !== "profile" &&
              typeof counts[link.key as Props["activeView"]] === "number" &&
              (counts[link.key as Props["activeView"]] || 0) > 0 && (
              <span
                className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs ${
                  activeView === link.key
                    ? "bg-white/15 text-white"
                    : "bg-white/[0.06] text-neutral-400"
                }`}
              >
                {counts[link.key as Props["activeView"]]}
              </span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default ClientSidebarNavigation;
