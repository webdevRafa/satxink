import { type FormEvent, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Mail,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import logo from "../assets/satx-short-sep.svg";
import { db } from "../firebase/firebaseConfig";

const footerLinks = [
  { label: "Artists", to: "/artists" },
  { label: "Flash", to: "/flash" },
  { label: "Events", to: "/events" },
  { label: "About", to: "/about" },
];

const artistLinks = [
  { label: "Join as artist", to: "/signup/artist" },
  { label: "Claim shop", to: "/shop-dashboard" },
  { label: "Artist login", to: "/login-page" },
];

const trustSignals = [
  { label: "Verified local artists", icon: CheckCircle2 },
  { label: "Ready-to-request flash", icon: Sparkles },
  { label: "SATX event discovery", icon: CalendarDays },
];

type ContactFormState = {
  name: string;
  email: string;
  audience: string;
  topic: string;
  message: string;
};

const initialContactForm: ContactFormState = {
  name: "",
  email: "",
  audience: "client",
  topic: "general",
  message: "",
};

export const Footer = () => {
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactForm, setContactForm] =
    useState<ContactFormState>(initialContactForm);

  const updateContactField = (
    field: keyof ContactFormState,
    value: string
  ) => {
    setContactForm((current) => ({ ...current, [field]: value }));
  };

  const handleContactSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!contactForm.name.trim() || !contactForm.email.trim()) {
      toast.error("Please include your name and email.");
      return;
    }

    if (contactForm.message.trim().length < 12) {
      toast.error("Please add a little more detail to your message.");
      return;
    }

    try {
      setIsSubmitting(true);
      await addDoc(collection(db, "contactMessages"), {
        name: contactForm.name.trim(),
        email: contactForm.email.trim(),
        audience: contactForm.audience,
        topic: contactForm.topic,
        message: contactForm.message.trim(),
        source: "footer",
        status: "new",
        createdAt: serverTimestamp(),
      });
      toast.success("Message sent.");
      setContactForm(initialContactForm);
      setIsContactOpen(false);
    } catch (error) {
      console.error("Failed to send contact message:", error);
      toast.error("Could not send your message.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <footer className="border-t border-white/10 bg-[#0b0b0b] px-4 pb-20 pt-12 text-sm text-neutral-400">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="space-y-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-xl">
                <img className="h-auto w-28" src={logo} alt="SATX Ink" />
                <p className="mt-5 max-w-lg text-base leading-7 text-neutral-300">
                  San Antonio tattoo discovery for clients, artists, flash,
                  events, and bookings that need to feel clean from first look
                  to final deposit.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:min-w-[330px]">
                {trustSignals.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
                    >
                      <Icon
                        size={16}
                        className="text-[var(--color-primary)]"
                        aria-hidden="true"
                      />
                      <p className="mt-2 text-[11px] font-semibold leading-4 text-neutral-200">
                        {item.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                to="/artists"
                className="group flex items-center justify-between rounded-lg border border-white/10 bg-white text-black px-4 py-4 font-semibold transition hover:bg-white/90"
              >
                <span className="flex items-center gap-2">
                  <Search size={17} aria-hidden="true" />
                  Browse artists
                </span>
                <ArrowUpRight
                  size={17}
                  className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden="true"
                />
              </Link>
              <button
                type="button"
                onClick={() => setIsContactOpen(true)}
                className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] px-4 py-4 font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.07]"
              >
                <span className="flex items-center gap-2">
                  <Mail size={17} aria-hidden="true" />
                  Contact SATX Ink
                </span>
                <ArrowUpRight
                  size={17}
                  className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden="true"
                />
              </button>
            </div>
          </section>

          <section className="grid gap-8 sm:grid-cols-3 lg:grid-cols-2">
            <FooterLinkGroup title="Explore" links={footerLinks} />
            <FooterLinkGroup title="For artists" links={artistLinks} />
            <div className="sm:col-span-3 lg:col-span-2">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                Local focus
              </p>
              <p className="mt-3 leading-6 text-neutral-300">
                Built around SATX shops, artists, public flash drops, and tattoo
                events so clients can move from discovery to booking with less
                guesswork.
              </p>
            </div>
          </section>
        </div>

        <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-4 border-t border-white/10 pt-5 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} SATX Ink. Built for San Antonio
            tattoo culture.
          </p>
          <div className="flex flex-wrap gap-5">
            <Link to="/terms" className="transition hover:text-white">
              Terms of Service
            </Link>
            <Link to="/privacy" className="transition hover:text-white">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>

      {isContactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 text-white backdrop-blur-md">
          <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Contact SATX Ink
                </p>
                <h2 className="mt-1 text-xl! font-semibold! text-white">
                  Tell us what you need
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsContactOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-0! text-white transition hover:bg-white/10"
                aria-label="Close contact form"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-4 p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <ContactField label="Name">
                  <input
                    value={contactForm.name}
                    onChange={(event) =>
                      updateContactField("name", event.target.value)
                    }
                    className={contactInputClass}
                    autoComplete="name"
                    required
                  />
                </ContactField>
                <ContactField label="Email">
                  <input
                    type="email"
                    value={contactForm.email}
                    onChange={(event) =>
                      updateContactField("email", event.target.value)
                    }
                    className={contactInputClass}
                    autoComplete="email"
                    required
                  />
                </ContactField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <ContactField label="I am a">
                  <select
                    value={contactForm.audience}
                    onChange={(event) =>
                      updateContactField("audience", event.target.value)
                    }
                    className={contactInputClass}
                  >
                    <option value="client">Client</option>
                    <option value="artist">Artist</option>
                    <option value="shop">Shop</option>
                    <option value="event_host">Event host</option>
                    <option value="other">Other</option>
                  </select>
                </ContactField>
                <ContactField label="Topic">
                  <select
                    value={contactForm.topic}
                    onChange={(event) =>
                      updateContactField("topic", event.target.value)
                    }
                    className={contactInputClass}
                  >
                    <option value="general">General question</option>
                    <option value="artist_onboarding">Artist onboarding</option>
                    <option value="shop_claim">Shop claim</option>
                    <option value="events">Events</option>
                    <option value="support">Support</option>
                    <option value="partnership">Partnership</option>
                  </select>
                </ContactField>
              </div>

              <ContactField label="Message">
                <textarea
                  value={contactForm.message}
                  onChange={(event) =>
                    updateContactField("message", event.target.value)
                  }
                  className={`${contactInputClass} min-h-36 resize-y py-3`}
                  placeholder="Share the context, link, artist name, booking issue, or opportunity we should know about."
                  required
                />
              </ContactField>

              <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-neutral-500">
                  Messages are sent to the SATX Ink admin inbox.
                </p>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-5! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSubmitting ? "Sending..." : "Send message"}
                  <Send size={16} aria-hidden="true" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

const FooterLinkGroup = ({
  title,
  links,
}: {
  title: string;
  links: { label: string; to: string }[];
}) => (
  <div>
    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
      {title}
    </p>
    <div className="mt-3 grid gap-2">
      {links.map((link) => (
        <Link
          key={link.label}
          to={link.to}
          className="w-fit text-sm font-medium text-neutral-300 transition hover:text-white"
        >
          {link.label}
        </Link>
      ))}
    </div>
  </div>
);

const ContactField = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
    <span>{label}</span>
    {children}
  </label>
);

const contactInputClass =
  "w-full rounded-md border border-white/10 bg-black/35 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none transition placeholder:text-neutral-600 focus:border-white/30";
