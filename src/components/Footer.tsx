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
          <img
            data-aos="fade-up"
            className="w-25"
            src={logo}
            alt="SATX Ink Logo"
          />
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

      {/* Legal Links */}
      <div className="mt-6 text-center flex gap-8 justify-center text-base font-medium">
        <a href="/terms" className="hover:underline">
          Terms of Service
        </a>
        <a href="/privacy-policy" className="hover:underline">
          Privacy Policy
        </a>
      </div>
    </footer>
  );
};
