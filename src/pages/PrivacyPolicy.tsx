// /pages/PrivacyPolicy.tsx
export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 text-gray-200 mt-30">
      <h1 className="text-4xl font-bold mb-2 text-center">Privacy Policy</h1>

      <p className="mb-6 text-center text-gray-400">
        Last updated: {new Date().toLocaleDateString()}
      </p>

      <div className="space-y-6">
        <section>
          <h2 className="text-2xl font-semibold mb-2">
            1. Information We Collect
          </h2>
          <p>
            SATX Ink collects basic user information such as your name, email
            address, and profile photo to connect clients and tattoo artists. We
            may also collect additional details you provide voluntarily, such as
            preferred tattoo styles and booking requests.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-2">
            2. How We Use Your Data
          </h2>
          <p>
            We use your data only to provide our services: connecting clients
            with artists, facilitating bookings, and improving our platform. We
            never sell your information to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-2">
            3. Data Storage and Security
          </h2>
          <p>
            Your information is stored securely using Firebase services. We take
            reasonable measures to protect your data from unauthorized access or
            disclosure.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-2">4. Your Rights</h2>
          <p>
            You can request to update or delete your personal data at any time
            by contacting us. We will process such requests in accordance with
            applicable laws.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-2">5. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact
            us at:
            <br />
            <a
              href="mailto:support@satxink.com"
              className="text-blue-400 underline"
            >
              support@satxink.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
