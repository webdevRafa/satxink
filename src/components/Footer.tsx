import { type FormEvent, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ArrowUpRight, ChevronDown, Mail, Send, X } from "lucide-react";
import toast from "react-hot-toast";
import { db } from "../firebase/firebaseConfig";

const audienceOptions = [
  { value: "client", label: "Client" },
  { value: "artist", label: "Artist" },
  { value: "other", label: "Other" },
];

const topicOptions = [
  { value: "general", label: "General question" },
  { value: "artist_onboarding", label: "Artist onboarding" },
  { value: "support", label: "Support" },
  { value: "partnership", label: "Partnership" },
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

  const updateContactField = (field: keyof ContactFormState, value: string) => {
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
      <footer className="relative z-50 border-t border-white/10 bg-[#0b0b0b]/95 px-5 py-8 text-sm text-neutral-400 backdrop-blur-md md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 border-b border-white/10 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.52fr)] lg:items-end">
            <section className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white!">
                SATX INK<sup className="ml-1 text-[0.58em]">TM</sup>
              </p>
            </section>

            <section className="flex gap-3 items-center">
              <div className="flex flex-col md:flex-row w-full gap-1 md:gap-5">
                <Link
                  to="/terms"
                  className="transition w-full hover:text-white"
                >
                  Terms of Service
                </Link>
                <Link
                  to="/privacy"
                  className="transition w-full  hover:text-white"
                >
                  Privacy Policy
                </Link>
              </div>
              <button
                type="button"
                onClick={() => setIsContactOpen(true)}
                className="group inline-flex h-11! w-full max-w-[200px] items-center justify-center gap-2 rounded-md border border-white/10  px-4! py-0! text-sm! font-semibold text-white/75 hover:text-white transition  sm:w-auto"
              >
                <Mail size={16} aria-hidden="true" />
                Contact
                <ArrowUpRight
                  size={15}
                  className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden="true"
                />
              </button>
            </section>
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

            <form
              onSubmit={handleContactSubmit}
              className="space-y-4 p-5 sm:p-6"
            >
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
                  <ContactSelect
                    value={contactForm.audience}
                    options={audienceOptions}
                    onChange={(value) => updateContactField("audience", value)}
                  />
                </ContactField>
                <ContactField label="Topic">
                  <ContactSelect
                    value={contactForm.topic}
                    options={topicOptions}
                    onChange={(value) => updateContactField("topic", value)}
                  />
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

              <div className="flex justify-end border-t border-white/10 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-white/10 px-5! text-sm! font-semibold text-white transition  disabled:cursor-wait disabled:opacity-60 sm:w-auto group"
                >
                  {isSubmitting ? "Sending..." : "Send message"}
                  <Send
                    size={16}
                    className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

const ContactField = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
    <span>{label}</span>
    {children}
  </div>
);

const ContactSelect = ({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className="relative normal-case tracking-normal"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          !(nextTarget instanceof Node) ||
          !event.currentTarget.contains(nextTarget)
        ) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={`${contactInputClass} flex h-11 items-center justify-between gap-3 text-left`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{selectedOption.label}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-neutral-400 transition duration-200 ${
            isOpen ? "rotate-180 text-white" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-md border border-white/10 bg-[#181818] py-1 shadow-2xl shadow-black/50"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold transition ${
                  isSelected
                    ? "bg-white/[0.08] text-white"
                    : "text-neutral-300 hover:bg-white/[0.05] hover:text-white"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span>{option.label}</span>
                {isSelected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const contactInputClass =
  "w-full rounded-md border border-white/10 bg-black/35 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none transition placeholder:text-neutral-600 focus:border-white/30";
