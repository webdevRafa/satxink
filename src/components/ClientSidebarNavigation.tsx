import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  CalendarCheck,
  ChevronDown,
  Heart,
  Inbox,
  Layers,
  LayoutDashboard,
  ReceiptText,
  UserRound,
  X,
} from "lucide-react";
import MobileNavbarPortal from "./MobileNavbarPortal";

interface Props {
  activeView:
    | "overview"
    | "profile"
    | "following"
    | "requests"
    | "offers"
    | "bookings"
    | "sessions"
    | "projects";
  onViewChange: (view: Props["activeView"]) => void;
  counts?: Partial<Record<Props["activeView"], number>>;
}

const ClientSidebarNavigation: React.FC<Props> = ({
  activeView,
  onViewChange,
  counts = {},
}) => {
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const links = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "following", label: "Following", icon: Heart },
    { key: "requests", label: "Requests", icon: Inbox },
    { key: "offers", label: "Offers", icon: ReceiptText },
    { key: "bookings", label: "Bookings", icon: CalendarCheck },
    { key: "sessions", label: "Sessions", icon: CalendarCheck },
    { key: "projects", label: "Projects", icon: Layers },
    { key: "profile", label: "Profile", icon: UserRound },
  ];
  const activeLabel =
    links.find((link) => link.key === activeView)?.label || "Dashboard";
  const activeCount =
    typeof counts[activeView] === "number" ? counts[activeView] : undefined;

  const handleViewChange = (view: Props["activeView"]) => {
    onViewChange(view);
    setShowMobileMenu(false);
  };

  return (
    <>
      <MobileNavbarPortal>
        <button
          type="button"
          onClick={() => setShowMobileMenu(true)}
          className="mx-auto flex h-9 w-full max-w-48 min-w-0 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.045] px-2.5! py-0! text-sm! font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          aria-label={`Open client dashboard menu. Current workspace: ${activeLabel}${
            typeof activeCount === "number" && activeCount > 0
              ? `, ${activeCount} items`
              : ""
          }`}
          aria-haspopup="dialog"
          aria-expanded={showMobileMenu}
        >
          <span className="min-w-0 truncate">{activeLabel}</span>
          {typeof activeCount === "number" && activeCount > 0 && (
            <span className="min-w-5 shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-4 text-white">
              {activeCount}
            </span>
          )}
          <ChevronDown
            size={14}
            className={`shrink-0 text-neutral-400 transition-transform ${
              showMobileMenu ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
      </MobileNavbarPortal>

      <aside className="hidden h-fit w-64 shrink-0 self-start rounded-xl bg-[var(--color-bg-base)] p-4 md:sticky md:top-24 md:block">
        <nav className="space-y-2">
          {links.map((link) => (
            <DashboardNavButton
              key={link.key}
              active={activeView === link.key}
              count={counts[link.key as Props["activeView"]]}
              icon={link.icon}
              label={link.label}
              onClick={() => handleViewChange(link.key as Props["activeView"])}
            />
          ))}
        </nav>
      </aside>

      <Transition appear show={showMobileMenu} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-[70] md:hidden"
          onClose={setShowMobileMenu}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-start justify-center p-4 pt-24">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="scale-95 opacity-0"
                enterTo="scale-100 opacity-100"
                leave="ease-in duration-150"
                leaveFrom="scale-100 opacity-100"
                leaveTo="scale-95 opacity-0"
              >
                <Dialog.Panel className="w-full max-w-sm rounded-lg border border-white/10 bg-[#111111] p-4 text-white shadow-2xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                        Client dashboard
                      </p>
                      <Dialog.Title className="mt-1 text-lg! font-semibold! text-white">
                        Choose workspace
                      </Dialog.Title>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMobileMenu(false)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                      aria-label="Close dashboard menu"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <nav className="space-y-2">
                    {links.map((link) => (
                      <DashboardNavButton
                        key={link.key}
                        active={activeView === link.key}
                        count={counts[link.key as Props["activeView"]]}
                        icon={link.icon}
                        label={link.label}
                        onClick={() =>
                          handleViewChange(link.key as Props["activeView"])
                        }
                      />
                    ))}
                  </nav>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
};

const DashboardNavButton = ({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  icon: typeof LayoutDashboard;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex w-full items-center gap-3 rounded-lg px-4! py-3! text-left text-sm! font-semibold transition ${
      active
        ? "bg-white/[0.08] text-white"
        : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
    }`}
  >
    <Icon size={17} aria-hidden="true" />
    <span className="flex-1">{label}</span>
    {typeof count === "number" && count > 0 && (
      <span
        className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs ${
          active ? "bg-white/15 text-white" : "bg-white/[0.06] text-neutral-400"
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

export default ClientSidebarNavigation;
