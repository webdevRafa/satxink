// src/pages/AboutPage.tsx

export const AboutPage = () => {
  return (
    <main
      data-aos="fade-in"
      className="px-4 py-12 max-w-3xl mx-auto text-white h-[700px] mt-20"
    >
      <h1 className="text-3xl font-semibold mb-4">
        <span className="text-gray-300">about</span> SATX
        <span className="text-[#b6382d]">INK</span>
      </h1>

      <p className="text-gray-300 leading-relaxed mb-6">
        SATXINK is a community-driven platform dedicated to connecting tattoo
        clients with the best artists in San Antonio, Texas. Whether you're
        looking to find the perfect artist for your next piece or you're a
        talented artist wanting to showcase your work, this is your home base.
      </p>

      <p className="text-gray-300 leading-relaxed mb-6">
        We feature a growing list of verified local artists with unique styles,
        and we give clients the ability to share ideas and get matched to the
        right professional. From black and grey realism to traditional,
        fine-line, and color — SATXInk is where SA’s ink culture lives.
      </p>

      <p className="text-gray-300 leading-relaxed">
        Want to join the scene?{" "}
        <a
          href="/signup"
          className="text-white underline hover:text-orange-300"
        >
          Sign up as an artist
        </a>{" "}
        and get featured.
      </p>
    </main>
  );
};
