import { ArrowUpRight } from "lucide-react";

export function InformationPage({ kind }: { kind: "privacy" | "terms" }) {
  return (
    <article className="section shell information-page">
      <p className="eyebrow">SATX INK · Updated September 5, 2026</p>
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
            The optional 3D studio is displayed in your browser. This website
            does not request camera, microphone, or location access. It does not
            include advertising trackers, analytics scripts, or account cookies.
            The website host may process normal request information to deliver
            the site.
          </p>
          <p>
            Fonts are requested from Google Fonts and Adobe Fonts, whose
            services receive the network information needed to serve those
            resources. The studio model and artwork are served with this
            website.
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
          <h1>About this website.</h1>
          <p>
            SATX INK provides information about a branded website and
            flash-booking system individually installed for tattoo shops. SATX
            INK is a software provider, not a tattoo studio.
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
            Pricing, installation scope, third-party services, and any ongoing
            services are discussed and agreed separately. Payment and email
            features require the relevant providers to be configured for the
            shop. A companion portal is a configured website connected by links,
            not an embedded plugin.
          </p>
          <h2>Illustrative visuals</h2>
          <p>
            The studio scene and example flash artwork illustrate the product’s
            tattoo-shop context. They are not live customer records or
            screenshots of the software. The 3D scene does not represent a
            tattoo-placement, virtual try-on, or AI-artwork feature.
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
