import { useEffect } from "react";
import { matchPath, useLocation } from "react-router-dom";

const SITE_NAME = "SATX Ink";

const dashboardTabTitles: Record<string, string> = {
  requests: "Requests",
  offers: "Offers",
  bookings: "Bookings",
  sessions: "Sessions",
  schedule: "Schedule",
  "flash-studio": "Flash Studio",
  gallery: "Gallery",
  payments: "Payments",
  "calendar-sync": "Calendar Sync",
  profile: "Profile",
};

const staticRouteTitles = [
  { path: "/flash/sheets/:sheetId", title: "Flash Sheet" },
  { path: "/flash-sheet/:id", title: "Flash Sheet Editor" },
  { path: "/artists/:id", title: "Artist Profile" },
  { path: "/artists", title: "San Antonio Tattoo Artists" },
  { path: "/about", title: "About" },
  { path: "/signup/client", title: "Join as a Client" },
  { path: "/signup/artist", title: "Join as an Artist" },
  { path: "/signup", title: "Join" },
  { path: "/client-profile-setup", title: "Complete Your Profile" },
  { path: "/payment-success", title: "Payment Confirmed" },
  { path: "/payment/:bookingId", title: "Secure Payment" },
  { path: "/privacy", title: "Privacy Policy" },
  { path: "/terms", title: "Terms of Service" },
  { path: "/login-page", title: "Sign In" },
  { path: "/admin", title: "Admin Dashboard" },
  { path: "/:artistSlug", title: "Artist Profile" },
] as const;

const formatTitle = (pageTitle: string) => `${pageTitle} | ${SITE_NAME}`;

const getRouteTitle = (pathname: string, search: string) => {
  if (pathname === "/") {
    return `${SITE_NAME} | San Antonio Flash Marketplace`;
  }

  if (pathname === "/flash") {
    return new URLSearchParams(search).get("tab") === "sheets"
      ? formatTitle("Flash Sheets")
      : formatTitle("Flash Marketplace");
  }

  if (pathname === "/dashboard") {
    const tab = new URLSearchParams(search).get("tab");
    const tabTitle = tab ? dashboardTabTitles[tab] : undefined;
    return formatTitle(tabTitle ? `${tabTitle} Dashboard` : "Dashboard");
  }

  const matchedRoute = staticRouteTitles.find(({ path }) =>
    matchPath({ path, end: true }, pathname)
  );

  return matchedRoute ? formatTitle(matchedRoute.title) : SITE_NAME;
};

const RouteDocumentTitle = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    document.title = getRouteTitle(pathname, search);
  }, [pathname, search]);

  return null;
};

export default RouteDocumentTitle;
