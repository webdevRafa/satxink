import { Fragment, useState, type FC } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { ChevronDown, X } from "lucide-react";
import MobileNavbarPortal from "./MobileNavbarPortal";

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
  | "payments";

interface SidebarProps {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  counts?: Partial<Record<ViewTab, number>>;
}

const SidebarNavigation: FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  counts = {},
}) => {
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const tabs = [
    { key: "requests", label: "Requests" },
    { key: "offers", label: "Offers" },
    { key: "bookings", label: "Bookings" },
    { key: "sessions", label: "Sessions" },
    { key: "projects", label: "Projects" },
    { key: "flashes", label: "Flash Studio" },
    { key: "gallery", label: "Gallery" },
    { key: "payments", label: "Payments" },
    { key: "calendar", label: "Calendar Sync" },
    { key: "profile", label: "Profile" },
  ];

  const activeLabel =
    tabs.find((tab) => tab.key === activeTab)?.label ||
    "Dashboard";
  const activeCount =
    typeof counts[activeTab] === "number" ? counts[activeTab] : undefined;

  const handleMobileTabChange = (tab: ViewTab) => {
    onTabChange(tab);
    setShowMobileMenu(false);
  };

  return (
    <>
      <MobileNavbarPortal>
        <button
          type="button"
          onClick={() => setShowMobileMenu(true)}
          className="mx-auto flex h-9 w-full max-w-48 min-w-0 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.045] px-2.5! py-0! text-sm! font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          aria-label={`Open artist dashboard menu. Current workspace: ${activeLabel}${
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
        <ul className="space-y-2">
          {tabs.map(({ key, label }) => (
            <li key={key}>
              <button
                onClick={() => onTabChange(key as ViewTab)}
                className={`inline-flex w-full items-center gap-2 text-left px-4 py-2 rounded-lg transition-all ${
                  activeTab === key
                    ? "text-white font-bold"
                    : "text-neutral-400 hover:bg-[var(--color-bg-card)]"
                }`}
              >
                <span>{label}</span>
                {typeof counts[key as ViewTab] === "number" &&
                  (counts[key as ViewTab] || 0) > 0 && (
                    <CountBadge count={counts[key as ViewTab] || 0} active={activeTab === key} />
                  )}
              </button>
            </li>
          ))}
        </ul>
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
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 flex items-end">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="translate-y-full opacity-80"
              enterTo="translate-y-0 opacity-100"
              leave="ease-in duration-200"
              leaveFrom="translate-y-0 opacity-100"
              leaveTo="translate-y-full opacity-80"
            >
              <Dialog.Panel className="max-h-[82vh] w-full overflow-hidden rounded-t-2xl border border-white/10 bg-[#111111] text-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5! py-4!">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                      Artist dashboard
                    </p>
                    <Dialog.Title className="mt-1 text-lg! font-semibold! text-white">
                      Choose a workspace
                    </Dialog.Title>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMobileMenu(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-neutral-300 transition hover:bg-white/10 hover:text-white"
                    aria-label="Close dashboard menu"
                  >
                    <X size={17} aria-hidden="true" />
                  </button>
                </div>

                <div className="request-modal-scrollbar max-h-[64vh] overflow-y-auto px-3! py-3!">
                  <ul className="space-y-1">
                    {tabs.map(({ key, label }) => (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => handleMobileTabChange(key as ViewTab)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3! py-3! text-left text-sm font-semibold transition ${
                            activeTab === key
                              ? "bg-white text-black"
                              : "bg-white/[0.025] text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <span className="min-w-0 flex-1">{label}</span>
                          {typeof counts[key as ViewTab] === "number" &&
                            (counts[key as ViewTab] || 0) > 0 && (
                              <MobileCountBadge count={counts[key as ViewTab] || 0} active={activeTab === key} />
                            )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </>
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

const MobileCountBadge = ({
  count,
  active,
}: {
  count: number;
  active: boolean;
}) => (
  <span
    className={`ml-auto min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${
      active ? "bg-black/10 text-black" : "bg-white/[0.06] text-neutral-400"
    }`}
  >
    {count}
  </span>
);

export default SidebarNavigation;
