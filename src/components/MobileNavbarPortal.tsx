import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const MOBILE_NAVBAR_PORTAL_ID = "mobile-navbar-dashboard-slot";

const MobileNavbarPortal = ({ children }: { children: ReactNode }) => {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById(MOBILE_NAVBAR_PORTAL_ID));
  }, []);

  return portalTarget ? createPortal(children, portalTarget) : null;
};

export default MobileNavbarPortal;
