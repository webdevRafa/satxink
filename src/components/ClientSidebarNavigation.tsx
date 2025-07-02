interface Props {
  activeView: "liked" | "requests" | "offers" | "confirmed";
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
    { key: "confirmed", label: "Bookings" },
  ];

  return (
    <aside className="w-full md:w-64 bg-[#1a1a1a] border-r border-neutral-800 p-4">
      <nav className="flex md:flex-col gap-2 md:gap-4">
        {links.map((link) => (
          <button
            key={link.key}
            onClick={() => onViewChange(link.key as Props["activeView"])}
            className={`w-full text-left px-4 py-2 rounded text-sm font-medium ${
              activeView === link.key
                ? "bg-white text-black"
                : "bg-neutral-800 hover:bg-neutral-700 text-white"
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
