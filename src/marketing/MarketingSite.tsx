import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Globe2,
  Mail,
  Menu,
  MoveUpRight,
  Users,
  X,
} from "lucide-react";
// Restore the previous modern logo with satx-ink-modern.svg, or the original with satx-short-sep.svg.
import logo from "../assets/satx-ink-modern-optical.svg";
import { ViewportVideo } from "./ViewportVideo";
import { InformationPage } from "./InformationPage";
import { PricingSection } from "./PricingSection";
import { createHeaderCtaReveal } from "./headerCta";
import { createViewportMotion, pageMotionTargets } from "./viewportMotion";
import { MobileNavigation } from "./MobileNavigation";

const demoEmail =
  "mailto:support@satxink.com?subject=SATX%20INK%20demo%20inquiry&body=Hi%20SATX%20INK%2C%0A%0AI%27d%20like%20to%20see%20how%20the%20system%20could%20work%20for%20my%20shop.%0A%0AShop%20name%3A%20%0ACurrent%20website%20(if%20any)%3A%20%0ANumber%20of%20artists%20and%20locations%3A%20%0AInterested%20in%20a%20full%20website%20or%20companion%20portal%3A%20%0A%0AThanks!";
const navigation = [
  ["How it works", "how-it-works"],
  ["For owners", "for-owners"],
  ["For artists", "for-artists"],
  ["Your setup", "your-setup"],
  ["Pricing & Support", "pricing-support"],
];
const steps = [
  [
    "Show your work",
    "Publish the designs you want to tattoo. Clients discover your available flash on your shop’s marketplace.",
  ],
  [
    "Client sends a request",
    "A client requests a published design and shares their preferred placement, size, and timing for you to review.",
  ],
  [
    "You set the terms",
    "Review the request and create your offer, including the deposit. If it’s not a fit, you can decline.",
  ],
  [
    "You offer the times",
    "Give the client a few appointment options that work for you. You decide what goes on your schedule.",
  ],
  [
    "Client chooses a time",
    "The client accepts one of the appointment options you offered—not any open slot on your calendar.",
  ],
  [
    "Client pays the deposit",
    "After accepting, the client pays your deposit through Stripe and sees the remaining balance to pay at the shop.",
  ],
];
const faqs = [
  [
    "Is this just a website?",
    "The website is the public-facing part of a connected system. Artists have tools for portfolios, flash, requests, offers, and appointments. Owners have a workspace for the shop’s content, team, locations, and records.",
  ],
  [
    "Can I keep the website I already have?",
    "Yes. A branded companion portal can sit alongside your current site, normally on a subdomain. Your website links visitors to the artists, flash, and booking experience. It is a separately configured site, not an embedded plugin or a shared-login integration.",
  ],
  [
    "Is there a limit on artists or locations?",
    "There is no limit on the number of artists or studio locations in your shop’s installation. Invite your team and assign artists to locations. We’ll review your setup together so the configuration matches how your shop operates.",
  ],
  [
    "Can artists upload an entire flash sheet?",
    "Yes. Artists upload a sheet, crop out individual designs, add their details, and publish them as requestable flash in the shop’s marketplace. Clients can explore a complete sheet or browse its individual designs. The artist controls the cropping and publishing.",
  ],
  [
    "Can an artist share their own profile?",
    "Yes. Each artist has a shareable profile under the shop’s domain, such as tattooshop.com/artistname. They can put that link in their Instagram bio or share it directly, bringing people to their portfolio and available flash.",
  ],
  [
    "Can clients book any time they want?",
    "No. In the flash workflow, clients request a design first. The artist reviews the request and offers appointment options. Clients choose from those options; they do not have unrestricted access to the artist’s schedule.",
  ],
  [
    "How do deposits and one-of-one designs work?",
    "The artist includes a deposit in the offer. The client accepts an appointment option, then pays through Stripe. Checkout shows the payment breakdown and applicable service fee. The remaining tattoo balance is settled at the shop. Holds and sold states manage availability for one-of-one flash. Stripe setup is required for each installation.",
  ],
  [
    "Does the system work on a phone?",
    "Yes. It is a responsive browser-based system for clients, artists, and owners. Artists can manage their work and review requests from a phone or desktop. No native app download is required.",
  ],
];

function ContactSection() {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  async function copyEmail() {
    try {
      await navigator.clipboard.writeText("support@satxink.com");
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }
  return (
    <section id="contact" className="section contact-section">
      <div className="shell contact-layout">
        <div>
          <p className="eyebrow">Let’s talk about your shop</p>
          <h2>
            Your next chapter
            <br />
            starts with a conversation.
          </h2>
          <p className="section-intro">
            Walk through the client experience, the artist workspace, and the
            owner tools. Then find the setup that fits your shop.
          </p>
        </div>
        <div className="contact-actions">
          <a className="button" href={demoEmail}>
            Request a demo <ArrowUpRight size={18} />
          </a>
          <p className="email-note">
            Opens your email app with an inquiry draft.
            <br />
            No account or payment needed.
          </p>
          <div className="email-row">
            <a href="mailto:support@satxink.com">support@satxink.com</a>
            <button
              type="button"
              className="icon-button"
              aria-label="Copy email address"
              onClick={copyEmail}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <p role="status" className="copy-status">
            {copyFailed
              ? "Please select and copy the email address above."
              : copied
                ? "Email address copied."
                : ""}
          </p>
        </div>
      </div>
    </section>
  );
}

function HomePage() {
  return (
    <>
      <section className="hero shell" aria-labelledby="hero-title">
        <div className="hero-layout">
          <div className="hero-copy">
            <p className="eyebrow">
              <span /> Software for tattoo shops
            </p>
            <h1 id="hero-title">
              A dedicated system for <em>your tattoo shop.</em>
            </h1>
            <p>
              Publish available flash, review requests, send booking offers,
              and collect deposits—all under your shop’s brand. Start with a
              new website or connect the system to the one you already have.
            </p>
            <div className="hero-actions">
              <a
                className="hero-demo-link"
                href="https://demo.satxink.com/"
                target="_blank"
                rel="noreferrer"
              >
                Explore the demo <ArrowUpRight size={18} />
              </a>
              <a className="text-link" href="#contact">
                Talk about your shop <ArrowRight size={16} />
              </a>
            </div>
            <p className="hero-note">No account needed to browse the demo.</p>
          </div>

          <figure className="product-demo">
              <ViewportVideo
                src="/media/flash-marketplace-demo.mp4"
                width={720}
                height={1298}
                poster="/media/flash-marketplace-demo-poster.jpg"
                label="Client walkthrough: choose a flash design and send a flash request."
              />
            <figcaption>
              <a
                href="https://demo.satxink.com/flash"
                target="_blank"
                rel="noreferrer"
              >
                Try it live <ArrowUpRight size={16} />
              </a>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section shell connection-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Here’s how it works</p>
            <h2>Bring your team’s flash online.</h2>
          </div>
          <p className="section-intro">
            SATX INK gives your shop a dedicated flash marketplace, exclusively
            for you and your artists. Getting your team’s work online is simple.
          </p>
        </div>
        <div className="feature-columns">
          <article>
            <span className="feature-number">01 / INVITE</span>
            <h3>Bring your artists on board.</h3>
            <p>
              Send your artists an invite. After a quick onboarding,
              they’re ready to start adding their work.
            </p>
          </article>
          <article>
            <span className="feature-number">02 / PUBLISH</span>
            <h3>Drop the flash.</h3>
            <p>
              Artists upload their flash sheets and publish their designs
              to your shop’s live marketplace, where clients can browse the work.
            </p>
          </article>
          <article>
            <span className="feature-number">03 / SHARE</span>
            <h3>Share your links</h3>
            <p>
              Every artist gets their own public profile and a unique link
              they can share on Instagram or anywhere else they post their work.
            </p>
          </article>
        </div>
      </section>

      <section id="for-artists" className="section artist-section">
        <div className="shell split-section">
          <figure className="artist-demo">
            <ViewportVideo
              src="/media/artist-flash-demo.mp4"
              width={720}
              height={1294}
              poster="/media/artist-flash-demo-poster.jpg"
              label="Artist walkthrough: create and publish flash designs for clients to browse."
            />
          </figure>
          <div>
            <p className="eyebrow">For the artists</p>
            <h2>A storefront for every artist</h2>
            <p className="section-intro">
              Give every artist a place to showcase their portfolio, publish
              available flash, and receive requests—all under your shop’s brand.
              They manage their designs, set their prices, and share their own link.
            </p>
            <div className="profile-link-example">
              <p>One link for your Instagram bio.</p>
              <code>
                tattooshop.com/<strong>artistname</strong>
              </code>
              <span>Example profile address on your shop’s domain.</span>
            </div>
            <div className="artist-highlights">
              <article>
                <h3>Plan the drop. Share the link.</h3>
                <p>
                  Schedule a flash sheet to go live at a time you choose.
                  Each sheet gets its own link, ready to promote on Instagram
                  and bring clients straight to the drop.
                </p>
              </article>
              <article>
                <h3>Make one-of-one work stand out.</h3>
                <p>
                  Offer non-repeatable designs meant to be tattooed only once.
                  That exclusivity gives clients a reason to act when a
                  design they love goes live.
                </p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="section shell workflow-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Booking on your terms</p>
            <h2>
              Your business.
              <br />
              You call the shots.
            </h2>
          </div>
          <p className="section-intro">
            Clients request the work. You control the schedule. Choose the
            requests you take on, set your offer, and give clients appointment
            options that work for you.
          </p>
        </div>
        <ol className="workflow">
          {steps.map(([title, description], index) => (
            <li key={title}>
              <div className="step-top">
                <span>{String(index + 1).padStart(2, "0")}</span>
                {index < steps.length - 1 && (
                  <ArrowRight size={18} aria-hidden="true" />
                )}
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <p className="workflow-note">
          <Check size={16} /> A request is not an automatic booking. Your
          approval comes first; the client chooses a time, then pays the deposit.
        </p>
      </section>

      <section id="for-owners" className="section owner-section">
        <div className="shell split-section owner-layout">
          <div>
            <p className="eyebrow">For the shop owners</p>
            <h2>
              Run your shop.
              <br />
              Grow your audience.
            </h2>
            <p className="section-intro">
              Your brand, backed by tools you can manage yourself. Update your
              website, keep your shop’s details current, and build an audience
              that wants to hear from you—all from your admin dashboard.
            </p>
            <div className="owner-feature">
              <Globe2 />
              <div>
                <h3>Keep your website yours.</h3>
                <p>
                  Change your logo, background image, and website text whenever
                  you need to. Your public-facing website stays in your hands.
                </p>
              </div>
            </div>
            <div className="owner-feature">
              <Users />
              <div>
                <h3>Manage the everyday details.</h3>
                <p>
                  Update store hours, manage team members, and keep your shop’s
                  information current in one place.
                </p>
              </div>
            </div>
            <div className="owner-feature">
              <CalendarDays />
              <div>
                <h3>Give your news a place to land.</h3>
                <p>
                  Publish events and announcements on your website so clients
                  know what’s coming up at your shop.
                </p>
              </div>
            </div>
            <div className="owner-feature">
              <Mail />
              <div>
                <h3>Grow your list with every opt-in.</h3>
                <p>
                  Clients can sign up with Google and choose to receive your
                  emails. Those who opt in are automatically added to your
                  mailing list, ready for promotional campaigns you send from
                  your dashboard. No manual list-building.
                </p>
              </div>
            </div>
          </div>
          <figure className="owner-visual">
            <picture>
              <source
                media="(max-width: 760px)"
                srcSet="/studio/cinematic/satx-ink-studio-detail.webp"
              />
              <img
                src="/studio/cinematic/satx-ink-studio-owner.webp"
                alt="Close-up of the SATX INK illustrative studio, showing the workstation and framed flash art"
                width="1000"
                height="1250"
                loading="lazy"
              />
            </picture>
            <figcaption>
              <span>
                Your brand.
                <br />
                Your tools to grow.
              </span>
              <MoveUpRight size={32} />
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="your-setup" className="section shell setup-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Two ways to make it yours</p>
            <h2>Options for every studio.</h2>
          </div>
          <p className="section-intro">
            Whether you’re starting fresh or keeping a website you already
            love, we offer two setup options—each installed and configured
            for your shop.
          </p>
        </div>
        <div className="setup-grid">
          <article className="setup-card">
            <div className="setup-card-top">
              <span>01 / A NEW WEBSITE + TOOLS</span>
              <Globe2 size={24} />
            </div>
            <h3>A new shop website + SATX INK tools.</h3>
            <p>
              Start fresh with a website for your shop, with your marketplace,
              booking tools, and dashboards connected under your brand.
            </p>
            <ul className="check-list">
              <li>
                <Check />Your website, artist profiles, and flash under your domain.
              </li>
              <li>
                <Check />
                Owner, artist, and client dashboards included.
              </li>
              <li>
                <Check />Manage website content and branding from your admin dashboard.
              </li>
            </ul>
            <a href="#contact">
              Talk about a new website <ArrowUpRight size={18} />
            </a>
          </article>
          <article className="setup-card">
            <div className="setup-card-top">
              <span>02 / ALONGSIDE YOUR WEBSITE</span>
              <ArrowUpRight size={24} />
            </div>
            <h3>Your existing website + a branded SATX INK portal.</h3>
            <p>
              Keep your current website. Add SATX INK tools through a separate
              portal branded for your shop and linked from your site.
            </p>
            <ul className="check-list">
              <li>
                <Check />Your marketplace, booking tools, and dashboards in one portal.
              </li>
              <li>
                <Check />
                <span className="portal-hosting-copy">
                  Hosted on a subdomain, linked to your website.
                  <span className="portal-address-example">
                    <span>Example address</span>
                    <code>https://portal.shopname.com</code>
                  </span>
                </span>
              </li>
              <li>
                <Check />
                Keep your existing website’s design and content management.
              </li>
            </ul>
            <a href="#contact">
              Talk about a branded portal <ArrowUpRight size={18} />
            </a>
          </article>
        </div>
        <p className="setup-note">
          Each setup is individually installed and configured. We’ll review your
          domain, payment setup, and installation requirements together.
        </p>
      </section>

      <PricingSection />

      <section className="audience-section">
        <div className="shell audience-layout">
          <div>
            <p className="eyebrow">Beyond the appointment</p>
            <h2>
              Give people a reason
              <br />
              to come back.
            </h2>
          </div>
          <div className="audience-features">
            <article>
              <CalendarDays />
              <div>
                <h3>Keep what’s happening visible.</h3>
                <p>
                  Publish shop events and promotions with images, dates, and
                  location details.
                </p>
              </div>
            </article>
            <article>
              <Mail />
              <div>
                <h3>Reach the people who opted in.</h3>
                <p>
                  Compose and preview branded promotional emails with images and
                  links. Send to clients who have chosen to hear from you.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="faq" className="section shell faq-section">
        <div>
          <p className="eyebrow">A few good questions</p>
          <h2>Before we talk.</h2>
          <p>
            Want to discuss your shop’s setup?
            <br />
            <a className="inline-link" href="#contact">
              Let’s walk through it <ArrowUpRight size={15} />
            </a>
          </p>
        </div>
        <div className="faq-list">
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronDown size={18} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <ContactSection />
    </>
  );
}

function RetiredPage() {
  return (
    <section className="section shell information-page">
      <p className="eyebrow">A new chapter for SATX INK</p>
      <h1>
        This is now the home
        <br />
        of our tattoo shop software.
      </h1>
      <p>
        SATX INK is a promotional website for shop owners. The previous
        marketplace, artist accounts, and tattoo-booking pages are no longer
        available here.
      </p>
      <p>
        Looking for a tattoo appointment? Please contact the shop or artist
        directly. Interested in the system for your shop?
      </p>
      <Link className="button" to="/">
        Explore the system <ArrowRight size={18} />
      </Link>
    </section>
  );
}

export function MarketingSite() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerCtaVisible, setHeaderCtaVisible] = useState(false);
  const headerCtaReveal = useRef<ReturnType<typeof createHeaderCtaReveal> | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(location.pathname);
  const page = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (location.pathname !== "/" || !page.current) return;
    return createViewportMotion(page.current, pageMotionTargets(page.current));
  }, [location.pathname]);
  useEffect(() => {
    const reveal = createHeaderCtaReveal(() => setHeaderCtaVisible(true));
    headerCtaReveal.current = reveal;
    return () => {
      reveal.dispose();
      headerCtaReveal.current = null;
    };
  }, []);
  useEffect(() => {
    const path = location.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    const home = path === "/";
    document.title = home
      ? "SATX INK | Websites & Booking Software for Tattoo Shops"
      : path === "/privacy"
        ? "Privacy | SATX INK"
        : path === "/terms"
          ? "Website Information | SATX INK"
          : "Page Unavailable | SATX INK";
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content =
      home || ["/privacy", "/terms"].includes(path)
        ? "index, follow"
        : "noindex, follow";
    const canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (canonical) canonical.href = `https://www.satxink.com${path}`;
  }, [location.pathname]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (previousPath.current !== location.pathname) {
        document.getElementById("main")?.focus({ preventScroll: true });
        previousPath.current = location.pathname;
      }
      if (location.hash)
        document.getElementById(location.hash.slice(1))?.scrollIntoView();
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.hash]);
  useEffect(() => {
    if (!menuOpen) return;
    const desktop = window.matchMedia("(min-width: 1001px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    desktop.addEventListener("change", closeOnDesktop);
    closeOnDesktop();
    return () => {
      document.removeEventListener("keydown", escape);
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [menuOpen]);
  return (
    <div ref={page} className="marketing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="shell header-inner">
          <Link
            to="/"
            aria-label="SATX INK home"
            onClick={() => setMenuOpen(false)}
          >
            <img
              className="brand-logo"
              src={logo}
              alt="SATX INK"
              width="156"
              height="47"
            />
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            {navigation.map(([label, id]) => (
              <a key={id} href={`/#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <a
            className="button button-small header-cta"
            href="/#contact"
            data-visible={headerCtaVisible}
            aria-hidden={!headerCtaVisible}
            tabIndex={headerCtaVisible ? undefined : -1}
            onClick={() => setMenuOpen(false)}
          >
            Let’s talk <ArrowUpRight size={16} />
          </a>
          <button
            ref={menuButton}
            className="mobile-menu-button icon-button"
            type="button"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => {
              if (!menuOpen) headerCtaReveal.current?.engage();
              setMenuOpen(!menuOpen);
            }}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {menuOpen && <MobileNavigation items={navigation} onNavigate={() => setMenuOpen(false)} />}
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/privacy" element={<InformationPage kind="privacy" />} />
          <Route path="/terms" element={<InformationPage kind="terms" />} />
          <Route
            path="/about"
            element={<Navigate to="/#how-it-works" replace />}
          />
          <Route
            path="/contact"
            element={<Navigate to="/#contact" replace />}
          />
          <Route path="/faq" element={<Navigate to="/#faq" replace />} />
          <Route path="*" element={<RetiredPage />} />
        </Routes>
      </main>
      <footer className="shell site-footer">
        <div>
          <Link to="/" aria-label="SATX INK home">
            <img
              className="brand-logo"
              src={logo}
              alt="SATX INK"
              width="156"
              height="47"
            />
          </Link>
          <p>
            Tattoo studio software.
            <br />
            Built around the work.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="/#pricing-support">Pricing & Support</a>
          <a href="/#contact">Contact</a>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Website information</Link>
        </nav>
        <span className="copyright">© {new Date().getFullYear()} SATX INK</span>
      </footer>
    </div>
  );
}
