// /pages/TermsOfService.tsx
// /pages/TermsOfService.tsx
export default function TermsOfService() {
  return (
    <div className="prose prose-invert max-w-4xl mx-auto px-6 py-40 text-sm">
      <h1 className="text-center text-3xl font-bold mb-6">Terms of Service</h1>

      <p className="mb-20">
        By using <strong>SATX INK</strong>, you agree to the following terms.
        These terms are in place to protect both clients and artists and ensure
        a respectful, safe, and transparent booking experience.
      </p>

      <div className="mb-10">
        <h2>Age and Mature Content</h2>
        <p>
          SATX INK is intended for users and visitors who are 18 years of age or
          older. The platform may display tattoo and body-art imagery with
          mature themes, and by continuing to use the site you acknowledge that
          you are at least 18 and comfortable viewing this content.
        </p>
      </div>

      <div className="mb-10">
        <h2>User Conduct</h2>
        <p>
          Users agree to communicate respectfully and honestly with artists and
          other users. Any form of harassment, spam, or abuse may result in
          account suspension or removal from the platform.
        </p>
      </div>

      <div className="mb-10">
        <h2>Deposits & Booking</h2>
        <p>
          To confirm a tattoo appointment, clients are required to pay a
          non-refundable deposit. This deposit reserves your time with the
          artist and allows them to begin preparing for your session.
        </p>
        <p>
          The deposit amount is set by the artist and displayed at the time of
          booking. This deposit is{" "}
          <strong>non-refundable under all circumstances</strong>.
        </p>
        <p>
          For custom tattoos, each session is booked separately. A session
          deposit cannot exceed 50% of that session&apos;s artist quote, and
          SATX INK does not offer prepayment of an entire custom project or an
          entire custom-tattoo session.
        </p>
      </div>

      <div className="mb-10">
        <h2>Session Balances & Cancellations</h2>
        <p>
          The unpaid balance for a custom-tattoo session becomes due only after
          the artist marks that session complete and is settled directly with
          the artist at the shop. The artist records the shop payment in SATX
          INK after it is received.
        </p>
        <p>
          Multi-session projects are divided into session allocations. Each new
          session requires its own deposit before it begins, and the balance for
          one session must be settled before the next session is scheduled.
          Failure to pay a completed session balance may pause the project or
          result in account restrictions.
        </p>
        <p>
          If you cancel your appointment <strong>within 24 hours</strong> of the
          scheduled time, the session deposit remains non-refundable to
          compensate the artist for reserved time and preparation.
        </p>
      </div>

      <div className="mb-10">
        <h2>Rescheduling</h2>
        <p>
          If you need to reschedule, you may be required to coordinate new
          available dates with the artist. Artists are not obligated to refund
          deposits if rescheduling is requested without reasonable notice.
        </p>
      </div>

      <div className="mb-10">
        <h2>Artist Responsibility</h2>
        <p>
          Artists are responsible for maintaining accurate availability,
          responding to booking requests promptly, and fulfilling appointments
          professionally. Repeated cancellations or no-shows may result in
          removal from the platform.
        </p>
      </div>

      <div className="mb-10">
        <h2>Platform Responsibility</h2>
        <p>
          SATX INK is a facilitator of appointments and is not liable for the
          outcome of any tattoo session, including artistic quality or
          health-related concerns. Users should do their own due diligence when
          booking.
        </p>
      </div>

      <div className="mb-10">
        <h2>Changes to These Terms</h2>
        <p>
          SATX INK reserves the right to update these terms at any time.
          Continued use of the platform after changes are published constitutes
          acceptance of the updated terms.
        </p>

        <p className="mt-20 text-center text-gray-400 text-xs">
          Last updated: July 23, 2026
        </p>
      </div>
    </div>
  );
}
