import "./index.css";
import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import ScrollToTop from "./helpers/ScrollToTop";

// @ts-expect-error aos does not ship the type shape used by this app.
import AOS from "aos";
import "aos/dist/aos.css";
// components
import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
import LiveBookingToasts from "./components/LiveBookingToasts";
import AgeGate from "./components/AgeGate";
// pages
import { HomePage } from "./pages/HomePage";
import { ArtistsPage } from "./pages/ArtistsPage";
import { ClientPostsPage } from "./pages/ClientPostsPage";
import { AboutPage } from "./pages/AboutPage";
import DevAddDocs from "./pages/DevAddDocs";
import LoginPage from "./pages/LoginPage";
import { ArtistProfilePage } from "./pages/ArtistProfilePage";
import Clients from "./pages/Clients";
import ArtistDashboard from "./pages/ArtistDashboard";
import FlashSheetEditor from "./pages/FlashSheetEditor";
import ClientDashboard from "./pages/ClientDashboard";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import ClientProfileSetupPage from "./pages/ClientProfileSetupPage";
import DashboardRedirectPage from "./pages/DashboardRedirectPage";
import SignupSelection from "./pages/SignupSelection";
import PaymentPage from "./pages/payment/PaymentPage";
import PaymentSuccessPage from "./pages/payment/PaymentSuccessPage";
import Dashboard from "./pages/Dashboard";
import FlashSheetDetailPage from "./pages/FlashSheetDetailPage";
import FlashMarketplacePage from "./pages/FlashMarketplacePage";
import PublicFlashSheetPage from "./pages/PublicFlashSheetPage";
import AdminDashboardView from "./pages/AdminDashboardView";

function App() {
  const { pathname } = useLocation(); // <- cleaner than location.pathname

  AOS.init({
    duration: 700,
    easing: "ease-out",
    once: true,
    mirror: false,
    // 👇 This forces AOS to watch the actual window
    disableMutationObserver: false,
  });
  useEffect(() => {
    window.addEventListener("load", () => {
      AOS.refreshHard();
    });
  }, []);
  // Refresh AOS on every route change
  useEffect(() => {
    const timeout = setTimeout(() => {
      AOS.refreshHard(); // force AOS to re-calculate positions
    }, 100); // give it a little delay to allow DOM to settle

    return () => clearTimeout(timeout); // cleanup
  }, [pathname]);
  return (
    <>
      <Navbar />
      <Toaster position="top-center" reverseOrder={false} />
      <AgeGate />
      <LiveBookingToasts />
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/artist-dashboard" element={<ArtistDashboard />} />
        <Route path="/client-dashboard" element={<ClientDashboard />} />
        <Route path="/artists" element={<ArtistsPage />} />
        <Route path="/flash" element={<FlashMarketplacePage />} />
        <Route
          path="/flash/sheets/:sheetId"
          element={<PublicFlashSheetPage />}
        />
        <Route path="/client-posts" element={<ClientPostsPage />} />
        <Route path="/dashboard" element={<DashboardRedirectPage />} />
        <Route path="/signup" element={<SignupSelection />} />
        <Route
          path="/signup/client"
          element={<SignupSelection initialRole="client" />}
        />
        <Route
          path="/signup/artist"
          element={<SignupSelection initialRole="artist" />}
        />
        <Route path="/payment/:bookingId" element={<PaymentPage />} />
        <Route path="/payment-success" element={<PaymentSuccessPage />} />
        <Route path="/admin" element={<AdminDashboardView />} />

        <Route
          path="/client-profile-setup"
          element={<ClientProfileSetupPage />}
        />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/dev-add-docs" element={<DevAddDocs />} />
        <Route path="/login-page" element={<LoginPage />} />
        <Route path="/artists/:id" element={<ArtistProfilePage />} />
        <Route path="/flash-sheet/:id" element={<FlashSheetDetailPage />} />

        <Route path="/flash-sheet/:sheetId" element={<FlashSheetEditor />} />
      </Routes>

      <Footer />
    </>
  );
}

export default App;
