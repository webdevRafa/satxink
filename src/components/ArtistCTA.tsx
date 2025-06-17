export const ArtistCTA = () => {
  return (
    <section
      data-aos="fade-left"
      className="px-4 py-12 max-w-6xl mx-auto text-center rounded-lg"
      style={{ backgroundColor: "var(--color-bg-card)" }}
    >
      <h2 className="mb-4">Tattoo Artist?</h2>
      <p className="mb-6" style={{ color: "var(--color-text-muted)" }}>
        Get listed, gain exposure, and grow your client base in San Antonio.
      </p>
      <a
        href="/signup"
        className="inline-block font-medium text-sm px-6 py-3 rounded-md transition"
        style={{
          backgroundColor: "var(--color-primary)",
          color: "white",
        }}
        onMouseOver={(e) =>
          (e.currentTarget.style.backgroundColor = "var(--color-primary-hover)")
        }
        onMouseOut={(e) =>
          (e.currentTarget.style.backgroundColor = "var(--color-primary)")
        }
      >
        Create Artist Profile
      </a>
    </section>
  );
};
