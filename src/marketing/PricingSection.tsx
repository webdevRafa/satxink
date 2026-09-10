import { ArrowUpRight, Check } from "lucide-react";

export function PricingSection() {
  return (
    <section
      id="pricing-support"
      className="section shell pricing-section"
      aria-labelledby="pricing-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Pricing & Support</p>
          <h2 id="pricing-title">
            More than a website.
            <br />
            Your shop’s own system.
          </h2>
        </div>
        <div>
          <p className="section-intro">
            Give every artist a profile, bring your flash collection online,
            schedule drops, and turn client requests into booking offers and
            deposits—all under your shop’s brand. <strong>We get it set up for $500.</strong>
          </p>
          <p>
            Then $100/month includes hosting, direct developer support, and
            requested changes. Database usage and email delivery cost extra.
          </p>
        </div>
      </div>
      <div className="setup-grid">
        <article className="setup-card pricing-card">
          <h3>Your shop’s system, set up for you</h3>
          <p className="price-amount"><strong>$500</strong> <span>one time</span></p>
          <p>A new shop website or branded portal, with the tools your artists and clients use together.</p>
          <ul className="check-list">
            <li><Check aria-hidden="true" />Artist profiles with portfolios, available flash, and a link to share.</li>
            <li><Check aria-hidden="true" />Upload flash sheets, crop designs, and offer one-of-one work.</li>
            <li><Check aria-hidden="true" />Publish now or schedule a flash drop for later.</li>
            <li><Check aria-hidden="true" />Review requests, offer appointment times, and collect deposits.</li>
            <li><Check aria-hidden="true" />Grow your opt-in email list and share shop updates.</li>
          </ul>
        </article>
        <article className="setup-card pricing-card">
          <h3>Hosting & developer support</h3>
          <p className="price-amount"><strong>$100</strong> <span>per month</span></p>
          <p>Includes hosting, direct support, and fixes or changes you request for your setup. Database usage and email delivery are additional costs paid by your shop.</p>
          <ul className="check-list">
            <li><Check aria-hidden="true" />Hosting for your SATX INK website or portal.</li>
            <li><Check aria-hidden="true" />Direct support from the developer behind SATX INK.</li>
            <li><Check aria-hidden="true" />Requested fixes and changes for your setup.</li>
          </ul>
        </article>
      </div>
      <p className="pricing-plan-note">
        Full website or branded portal. The same setup fee and monthly support
        for every shop.
      </p>
      <div className="pricing-support-note">
        <div>
          <h3>You’re supported beyond launch.</h3>
          <p>
            Need help or want a change to your setup? Work directly with the
            developer behind SATX INK. Hosting, support, and requested fixes or
            changes are included in your $100 monthly fee. Database usage and
            email delivery costs are separate.
          </p>
        </div>
        <a className="button" href="#contact">
          Request a walkthrough <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
