const styles = [
  "Black & Grey",
  "Color",
  "Realism",
  "Traditional",
  "Japanese",
  "Fine Line",
];

export const BrowseByStyle = () => {
  return (
    <section data-aos="fade-right" className="px-4 py-12 max-w-6xl mx-auto">
      <h2>Browse by Style</h2>

      <div className="flex flex-wrap gap-3 mt-6">
        {styles.map((style, index) => (
          <button
            key={index}
            className="px-4 py-2 rounded-md text-sm"
            style={{
              backgroundColor: "var(--color-bg-button)",
              color: "var(--color-text-light)",
            }}
          >
            {style}
          </button>
        ))}
      </div>
    </section>
  );
};
