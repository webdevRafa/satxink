// src/pages/AboutPage.tsx

export const AboutPage = () => {
  return (
    <main
      data-aos="fade-in"
      className="px-6 md:px-4 py-12 max-w-3xl mx-auto text-white w-full h-[98vh] flex items-center justify-center"
    >
      <div>
        <p className="text-gray-300 leading-relaxed mb-6">
          SATXINK is a community-driven platform dedicated to connecting tattoo
          clients with artists in San Antonio, Texas. Clients can discover
          available flash from local artists, and artists can showcase designs
          that are ready to book.
        </p>

        <p className="text-gray-300 leading-relaxed mb-6">
          We feature a growing list of verified local artists with distinct
          styles and make it simple to request a specific flash design, choose
          an appointment, and secure the booking with a deposit.
        </p>
      </div>
    </main>
  );
};
