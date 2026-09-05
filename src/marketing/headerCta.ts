export const HEADER_CTA_DELAY_MS = 12_000;

type RevealHost = Pick<
  Window,
  "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout"
>;

/** Start one delay after scrolling or opening the menu, never on page load. */
export function createHeaderCtaReveal(
  onReveal: () => void,
  host: RevealHost = window,
) {
  let started = false;
  let disposed = false;
  let timer: number | undefined;

  function engage() {
    if (started || disposed) return;
    started = true;
    host.removeEventListener("scroll", engage);
    timer = host.setTimeout(() => {
      timer = undefined;
      if (!disposed) onReveal();
    }, HEADER_CTA_DELAY_MS);
  }

  host.addEventListener("scroll", engage, { passive: true });

  return {
    engage,
    dispose() {
      disposed = true;
      host.removeEventListener("scroll", engage);
      if (timer !== undefined) host.clearTimeout(timer);
    },
  };
}
