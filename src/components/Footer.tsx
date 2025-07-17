import { Link } from "react-router-dom";
import logo from "../assets/satx-short-sep.svg";

export const Footer = () => {
  return (
    <footer
      className="px-4 py-10 text-sm pb-30"
      style={{
        backgroundColor: "var(--color-bg-footer)",
        color: "var(--color-text-muted)",
      }}
    >
      <div
        data-aos="fade-right"
        className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4"
      >
        <div className="text-center md:text-left">
          <img data-aos="fade-up" className="w-25" src={logo} alt="" />
        </div>

        <div data-aos="fade-left" className="flex gap-6">
          <a href="/about" className="hover:underline">
            About
          </a>
          <a href="/faq" className="hover:underline">
            FAQ
          </a>
          <a href="/contact" className="hover:underline">
            Contact
          </a>
        </div>
      </div>

      <div
        data-aos="fade-up"
        className="mt-6 text-center flex gap-3 justify-center"
      >
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
      </div>
    </footer>
  );
};
