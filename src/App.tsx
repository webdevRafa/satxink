import "./index.css";
import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// @ts-ignore
import AOS from "aos";
import "aos/dist/aos.css";
// components
import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
// pages
import { HomePage } from "./pages/HomePage";
import { ArtistsPage } from "./pages/ArtistsPage";
import { ClientPostsPage } from "./pages/ClientPostsPage";
import { AboutPage } from "./pages/AboutPage";
import { SignupPage } from "./pages/SignupPage";
import DevAddDocs from "./pages/DevAddDocs";
import LoginPage from "./pages/LoginPage";
import { ArtistProfilePage } from "./pages/ArtistProfilePage";
import Clients from "./pages/Clients";
import ArtistDashboard from "./pages/ArtistDashboard";

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

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/artist-dashboard" element={<ArtistDashboard />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/artists" element={<ArtistsPage />} />
        <Route path="/client-posts" element={<ClientPostsPage />} />
        <Route path="/dev-add-docs" element={<DevAddDocs />} />
        <Route path="/login-page" element={<LoginPage />} />
        <Route path="/artists/:id" element={<ArtistProfilePage />} />
      </Routes>

      <Footer />
    </>
  );
}

export default App;
