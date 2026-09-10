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
            Your flash & booking tools.
            <br />
            Set up for $500.
          </h2>
        </div>
        <p className="section-intro">
          $500 one-time setup, then $100/month for hosting, support, and requested
          changes. Your shop pays database usage and email delivery costs separately.
        </p>
      </div>
      <div className="setup-grid">
        <article className="setup-card pricing-card">
          <h3>Setup & deployment</h3>
          <p className="price-amount"><strong>$500</strong> <span>one time</span></p>
          <p>Your website or portal, database, and integrations—connected for one setup fee.</p>
          <ul className="check-list">
            <li><Check aria-hidden="true" />Full website or branded portal deployment.</li>
            <li><Check aria-hidden="true" />Your own database, powered by Google Firebase.</li>
            <li><Check aria-hidden="true" />Stripe payment and email integrations configured.</li>
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
