import "./index.css";
import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";
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

function App() {
  useEffect(() => {
    AOS.init({
      duration: 700, // animation duration in ms
      once: true, // only animate once per element
      easing: "ease-out", // optional
    });
  }, []);

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
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
