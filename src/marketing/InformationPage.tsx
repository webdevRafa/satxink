import { ArrowUpRight } from "lucide-react";

export function InformationPage({ kind }: { kind: "privacy" | "terms" }) {
  return (
    <article className="section shell information-page">
      <p className="eyebrow">SATX INK · Updated September 13, 2026</p>
      {kind === "privacy" ? (
        <>
          <h1>Privacy on this website.</h1>
          <p>
            This website introduces SATX INK software to tattoo shop owners. It
            does not provide tattoo booking, account registration, or payment
            checkout.
          </p>
          <h2>When you get in touch</h2>
          <p>
            The demo inquiry link opens your email application. Nothing is
            submitted through a website form. If you send an email, SATX INK
            receives your email address and the information you choose to
            include, so we can respond to your inquiry. Please do not include
            payment card details or private client records.
          </p>
          <h2>While you browse</h2>
          <p>
            We use Vercel Web Analytics to understand visits and improve this
            website. It collects aggregate statistics such as page views,
            referring websites, browser and device types, and approximate
            location. It does not use third-party cookies or track you across
            other websites. Learn more about{" "}
            <a className="inline-link" href="https://vercel.com/docs/analytics/privacy-policy">
              Vercel Web Analytics privacy
            </a>.
          </p>
          <p>
            This website does not request camera, microphone, or location
            permission. The website host may process normal request information
            to deliver the site.
          </p>
          <p>
            Fonts are requested from Google Fonts and Adobe Fonts, whose
            services receive the network information needed to serve those
            resources. Product screenshots, recordings, and example artwork
            are served with this website.
          </p>
          <h2>Shop installations and earlier accounts</h2>
          <p>
            A separately installed shop system has its own configuration and
            data practices. This marketing page does not describe those
            installations or change the handling of data previously provided to
            the earlier SATX INK platform. Contact us with questions about an
            earlier account or your information.
          </p>
        </>
      ) : (
        <>
          <h1>About this system.</h1>
          <p>
            SATX INK provides tattoo studios with tools to manage their artists,
            publish flash, handle booking requests, and collect deposits through
            Stripe.
          </p>
          <p>
            Shop owners can invite their team and update shop hours and events.
            Artists can upload individual designs or full flash sheets, review
            requests, offer appointment times, and connect their own Stripe
            accounts to receive payments.
          </p>
          <h2>A conversation, not a booking</h2>
          <p>
            A demo inquiry is a request to discuss the system. It does not
            create a tattoo appointment, purchase, subscription, or installation
            agreement. Tattoo clients should contact their shop or artist
            directly.
          </p>
          <h2>Your installation</h2>
          <p>
            SATX INK setup and support fees are published in our{" "}
            <a className="inline-link" href="/pricing">Pricing & Support</a>
            {" "}page. Installation details and third-party services are
            confirmed before setup. Payment and email
            features require the relevant providers to be configured for the
            shop. A companion portal is a configured website connected by links,
            not an embedded plugin.
          </p>
          <h2>Illustrative visuals</h2>
          <p>
            Product screenshots and recordings show the software in a demo
            studio with example flash artwork and data. They illustrate how the
            system works and do not show live customer records.
          </p>
        </>
      )}
      <h2>Contact SATX INK</h2>
      <p>
        For questions about the website, your information, or a possible
        installation, email{" "}
        <a className="inline-link" href="mailto:support@satxink.com">
          support@satxink.com <ArrowUpRight size={15} />
        </a>
        .
      </p>
    </article>
  );
}
