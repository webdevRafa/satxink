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
      </div>

      <div className="mb-10">
        <h2>Final Payments & Cancellations</h2>
        <p>
          If the artist requires payment in full before the session, the
          remaining balance will be collected via Stripe checkout. If you cancel
          your appointment <strong>within 24 hours</strong> of the scheduled
          time, the final payment may <strong>not be refunded</strong>. This is
          to compensate the artist for lost time and preparation.
        </p>
        <p>
          If the artist allows payment after the session, payment must be made
          promptly as agreed upon. Failure to pay may result in a ban from the
          platform.
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
          Last updated: July 16, 2025
        </p>
      </div>
    </div>
  );
}
