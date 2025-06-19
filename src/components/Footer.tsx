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
          © {new Date().getFullYear()} SATX
          <span style={{ color: "var(--color-primary)" }}>ink</span>
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

      <div data-aos="fade-up" className="mt-6 text-center">
        <a
          href="https://instagram.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mx-2 hover:underline"
        >
          IG
        </a>
        <a
          href="https://facebook.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mx-2 hover:underline"
        >
          FB
        </a>
        <a
          href="https://tiktok.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mx-2 hover:underline"
        >
          TikTok
        </a>
      </div>
    </footer>
  );
};
