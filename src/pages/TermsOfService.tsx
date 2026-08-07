export default function TermsOfService() {
  return (
    <div className="prose prose-invert mx-auto max-w-4xl px-6 py-40 text-sm">
      <h1 className="mb-6 text-center text-3xl font-bold">Terms of Service</h1>

      <p className="mb-20">
        By using <strong>SATX INK</strong>, you agree to these terms. They are
        intended to support a respectful, safe, and transparent flash-tattoo
        booking experience for clients and artists.
      </p>

      <div className="mb-10">
        <h2>Age and Mature Content</h2>
        <p>
          SATX INK is intended for users and visitors who are 18 years of age or
          older. The platform may display tattoo and body-art imagery with
          mature themes. By continuing, you confirm that you are at least 18
          and comfortable viewing this content.
        </p>
      </div>

      <div className="mb-10">
        <h2>Flash Designs and Availability</h2>
        <p>
          Artists publish the flash designs, prices, repeatability, and
          availability shown on SATX INK. Submitting a request does not reserve
          a design or confirm an appointment. A booking is confirmed only after
          the artist sends an offer, the client accepts an appointment option,
          and the required deposit is successfully paid.
        </p>
        <p>
          One-of-one flash may become unavailable while another request is being
          completed. Repeatable flash may be booked more than once at the
          artist&apos;s discretion.
        </p>
      </div>

      <div className="mb-10">
        <h2>Deposits and Booking</h2>
        <p>
          Each flash appointment requires a deposit through Stripe. The amount
          is displayed before checkout and reserves the selected appointment
          with the artist. Deposits are non-refundable unless the artist or
          applicable law requires otherwise.
        </p>
        <p>
          SATX INK processes only the booking deposit. The remaining balance is
          paid directly to the artist at the shop after the appointment and may
          be marked paid by the artist in SATX INK.
        </p>
      </div>

      <div className="mb-10">
        <h2>Cancellations and Rescheduling</h2>
        <p>
          If a client cancels or requests a new time, the artist may require a
          new deposit. Artists are not obligated to refund a deposit when a
          client cancels or reschedules, subject to applicable law and any terms
          shown before payment.
        </p>
      </div>

      <div className="mb-10">
        <h2>User Conduct</h2>
        <p>
          Users must communicate respectfully and provide accurate booking
          information. Harassment, spam, fraud, abuse, or misuse of the platform
          may result in account restriction or removal.
        </p>
      </div>

      <div className="mb-10">
        <h2>Artist Responsibility</h2>
        <p>
          Artists are responsible for the accuracy of their flash listings,
          prices, availability, licensing, shop information, and appointment
          services. Artists must comply with applicable health, safety, and
          professional requirements.
        </p>
      </div>

      <div className="mb-10">
        <h2>Platform Responsibility</h2>
        <p>
          SATX INK provides marketplace, scheduling, and deposit-payment tools.
          It does not perform tattoo services and does not guarantee an
          appointment, a particular artistic outcome, or the conduct of a user.
          Clients should review the artist and shop before booking.
        </p>
      </div>

      <div className="mb-10">
        <h2>Changes to These Terms</h2>
        <p>
          SATX INK may update these terms. Continued use after revised terms are
          published constitutes acceptance of the updated terms.
        </p>

        <p className="mt-20 text-center text-xs text-gray-400">
          Last updated: August 7, 2026
        </p>
      </div>
    </div>
  );
}
