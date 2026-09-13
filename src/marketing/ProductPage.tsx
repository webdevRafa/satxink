import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { contentPages } from "./pageContent";
import type { ContentPage } from "./pageContent";
import { MarketplaceScreenshot } from "./MarketplaceScreenshot";
import { PricingSection } from "./PricingSection";

export function ProductPage({ page }: { page: ContentPage }) {
  return (
    <article className={`product-page product-page-${page.presentation ?? "overview"}`}>
      <header className="shell product-intro">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{page.label}</span>
        </nav>
        <p className="eyebrow">{page.eyebrow}</p>
        <h1>{page.heading}</h1>
        <p className="product-lead">{page.intro}</p>
        <div className="product-actions">
          <a className="button" href="/#contact">Request a walkthrough <ArrowUpRight size={18} /></a>
          <a className="text-link" href="https://demo.satxink.com/" target="_blank" rel="noreferrer">Explore the demo <ArrowUpRight size={16} /></a>
        </div>
      </header>

      {page.presentation === "flash" && <figure className="shell product-screenshot">
        <MarketplaceScreenshot />
        <figcaption>A demo studio’s flash collection: individual designs, artist attribution and one-of-one availability.</figcaption>
      </figure>}

      {page.presentation === "websites" && <section className="shell product-comparison" aria-labelledby="compare-heading">
        <h2 id="compare-heading">Choose where the experience lives.</h2>
        <div className="comparison-scroll" role="region" aria-label="Website and portal comparison" tabIndex={0}>
          <table>
            <caption>Full website and companion portal at a glance</caption>
            <thead><tr><th scope="col">Your setup</th><th scope="col">Full website</th><th scope="col">Companion portal</th></tr></thead>
            <tbody>
              <tr><th scope="row">Public website</th><td>A new SATX INK shop website</td><td>Keep your current website</td></tr>
              <tr><th scope="row">Example address</th><td>yourshop.com</td><td>portal.yourshop.com</td></tr>
              <tr><th scope="row">Artists, flash and booking</th><td>On your new shop website</td><td>In your linked SATX INK portal</td></tr>
              <tr><th scope="row">Content editing</th><td>Supported content in the owner dashboard</td><td>Portal content in SATX INK; original site with its current provider</td></tr>
              <tr><th scope="row">Published SATX INK fees</th><td>$500 setup + $100/month</td><td>$500 setup + $100/month</td></tr>
            </tbody>
          </table>
        </div>
        <p className="product-caption">Example domains only. Database usage and email delivery cost extra. <Link className="inline-link" to="/pricing">See pricing and scope.</Link></p>
      </section>}

      {page.presentation === "pricing" && <PricingSection />}

      <div className="shell product-reading-layout">
        <aside className="product-contents">
          <nav aria-label="On this page">
            <p className="eyebrow">On this page</p>
            {page.sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.heading}</a>)}
          </nav>
        </aside>
        <div className="product-chapters">
          {page.sections.map((section, index) => <section id={section.id} key={section.id} className="product-chapter">
            <span className="chapter-number">{String(index + 1).padStart(2, "0")}</span>
            <h2>{section.heading}</h2>
            {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && <ul>{section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>}
          </section>)}
        </div>
      </div>

      <section className="shell product-related" aria-labelledby="related-heading">
        <p className="eyebrow">Keep exploring</p>
        <h2 id="related-heading">See how the pieces fit your shop.</h2>
        <div className="related-links">
          {page.related.map(path => {
            const related = contentPages.find(item => item.path === path)!;
            return <Link key={path} to={path}><span>{related.label}</span><ArrowRight size={20} aria-hidden="true" /></Link>;
          })}
        </div>
      </section>
      <section className="product-contact">
        <div className="shell">
          <p className="eyebrow">Let’s talk about your shop</p>
          <h2>Bring your questions to a walkthrough.</h2>
          <p>See the owner tools, artist workspace and client experience. Then discuss your shop’s setup and timing.</p>
          <a className="button" href="/#contact">Request a walkthrough <ArrowUpRight size={18} /></a>
        </div>
      </section>
    </article>
  );
}
