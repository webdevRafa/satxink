import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

const AGE_GATE_STORAGE_KEY = "satxinkAgeConfirmedV1";
const AGE_GATE_EXEMPT_PATHS = new Set(["/terms", "/privacy"]);

export default function AgeGate() {
  const { pathname } = useLocation();
  const [isConfirmed, setIsConfirmed] = useState(() => {
    try {
      return localStorage.getItem(AGE_GATE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const isExemptPath = AGE_GATE_EXEMPT_PATHS.has(pathname);
  const shouldShowAgeGate = !isConfirmed && !isExemptPath;

  useEffect(() => {
    if (!shouldShowAgeGate) return;

    const scrollY = window.scrollY;
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    const previousDocumentOverflow = documentElement.style.overflow;
    const previousDocumentOverscroll = documentElement.style.overscrollBehavior;

    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      documentElement.style.overflow = previousDocumentOverflow;
      documentElement.style.overscrollBehavior = previousDocumentOverscroll;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [shouldShowAgeGate]);

  const confirmAge = () => {
    try {
      localStorage.setItem(AGE_GATE_STORAGE_KEY, "true");
    } catch {
      // Browsers can block storage in private or locked-down modes.
    }

    setIsConfirmed(true);
  };

  const leaveSite = () => {
    window.location.assign("https://www.google.com");
  };

  if (!shouldShowAgeGate) {
    return null;
  }

  return (
    <div
      aria-labelledby="age-gate-title"
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-[90] isolate flex h-[100dvh] min-h-[100svh] items-center justify-center overflow-y-auto overscroll-contain bg-black px-4 py-6 text-white sm:py-8"
    >
      <div className="w-full max-w-md rounded-lg border border-white/12 bg-[#121212] p-6 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white/7 text-[var(--color-primary)]">
            <ShieldCheck size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Age confirmation
            </p>
          </div>
        </div>
        <h2
          id="age-gate-title"
          className="mt-5 text-xl! font-semibold leading-tight text-white"
        >
          SATX Ink is for visitors 18 and older.
        </h2>
        <p className="mt-5 text-sm leading-6 text-neutral-300">
          This site may include tattoo and body-art imagery with mature themes.
          Please confirm that you are 18 or older before continuing.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={confirmAge}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-black transition hover:bg-neutral-200"
          >
            I am 18+
          </button>
          <button
            type="button"
            onClick={leaveSite}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Leave
          </button>
        </div>

        <p className="mt-5 text-xs leading-5 text-neutral-500">
          By continuing, you acknowledge the SATX Ink{" "}
          <Link
            className="underline transition hover:text-white"
            rel="noopener noreferrer"
            target="_blank"
            to="/terms"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            className="underline transition hover:text-white"
            rel="noopener noreferrer"
            target="_blank"
            to="/privacy"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
