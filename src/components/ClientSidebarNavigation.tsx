interface Props {
  activeView: "liked" | "requests" | "offers" | "bookings";
  onViewChange: (view: Props["activeView"]) => void;
}

const ClientSidebarNavigation: React.FC<Props> = ({
  activeView,
  onViewChange,
}) => {
  const links = [
    { key: "liked", label: "Liked Artists" },
    { key: "requests", label: "My Requests" },
    { key: "offers", label: "Offers" },
    { key: "bookings", label: "Bookings" },
  ];

  return (
    <aside className="hidden md:block w-64 p-4 bg-[var(--color-bg-base)] rounded-xl sticky top-30 self-start h-fit">
      <nav className="flex md:flex-col gap-2 md:gap-4">
        {links.map((link) => (
          <button
            key={link.key}
            onClick={() => onViewChange(link.key as Props["activeView"])}
            className={`w-full text-left px-4 py-2 rounded text-sm font-medium ${
              activeView === link.key
                ? "text-white font-bold"
                : "text-neutral-400 hover:bg-[var(--color-bg-card)]"
            }`}
          >
            {link.label}
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default ClientSidebarNavigation;
