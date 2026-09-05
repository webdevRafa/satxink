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
            Clear pricing.
            <br />
            Real support.
          </h2>
        </div>
        <p className="section-intro">
          The same SATX INK rates for every shop. Whether you choose a full
          website or a branded portal, your setup fee and monthly support
          stay the same.
        </p>
      </div>
      <div className="setup-grid">
        <article className="setup-card pricing-card">
          <h3>Complete deployment</h3>
          <p className="price-amount"><strong>$500</strong> <span>one time</span></p>
          <p>One setup payment to get your shop’s system up and running.</p>
          <ul className="check-list">
            <li><Check aria-hidden="true" />Full website or branded portal deployment.</li>
            <li><Check aria-hidden="true" />Your own database, powered by Google Firebase.</li>
            <li><Check aria-hidden="true" />Stripe payment and email integrations configured.</li>
          </ul>
        </article>
        <article className="setup-card pricing-card">
          <h3>Maintenance & developer support</h3>
          <p className="price-amount"><strong>$100</strong> <span>per month</span></p>
          <p>Ongoing care for your system, with a developer in your corner.</p>
          <ul className="check-list">
            <li><Check aria-hidden="true" />Service maintenance, fixes, and ongoing changes.</li>
            <li><Check aria-hidden="true" />Direct support from the developer behind SATX INK.</li>
            <li><Check aria-hidden="true" />Additional public-facing website customization at no extra cost.</li>
          </ul>
        </article>
      </div>
      <div className="pricing-support-note">
        <div>
          <h3>You’re supported beyond launch.</h3>
          <p>
            Need help or want to change how your public-facing website looks?
            Work directly with the developer who built your setup. That support
            and customization are included in your $100 monthly fee—not a
            separate bill every time you want to make a change.
          </p>
        </div>
        <a className="button" href="#contact">
          Let’s talk about your setup <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
