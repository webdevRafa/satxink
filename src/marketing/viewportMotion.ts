export type MotionStyle = "fade" | "blur";
export type MotionTarget = {
  element: HTMLElement;
  group: Element;
  style: MotionStyle;
};

const pageSelector = [
  "main h1", "main h2", "main h3", "main p", "main li",
  "main .feature-number", "main .flash-visual", "main .owner-visual",
  "main .profile-link-example", "main .setup-card-top", "main .text-link",
  "main .button", "main .setup-card > a", "main .email-row",
  "main .faq-list details", ".site-footer > *",
].join(",");
const excludedSelector = ".studio-viewer, [role='status'], [aria-live], .sr-only";
const groupSelector = [
  ".hero-copy", ".section-heading", ".feature-columns", ".artist-highlights",
  ".workflow", ".owner-feature", ".check-list", ".setup-card",
  ".pricing-support-note", ".audience-features", ".faq-list",
  ".contact-layout", ".site-footer", "section",
].join(",");

/** Semantic content only: never animate a parent of the 3D viewer or a live region. */
export function pageMotionTargets(root: HTMLElement): MotionTarget[] {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(pageSelector))
    .filter(element => !element.closest(excludedSelector)
      && !element.querySelector(excludedSelector));
  const selected = new Set(candidates);
  return candidates.filter(element => {
    for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
      if (selected.has(parent)) return false;
    }
    return true;
  }).map(element => ({
    element,
    group: element.closest(groupSelector) ?? root,
    style: element.matches("h1, h2, h3, .section-intro, .hero-intro > p") ? "blur" : "fade",
  }));
}

type MotionEnvironment = {
  document: Document;
  window: Window;
  Observer: typeof IntersectionObserver | undefined;
};

export function motionKeyframes(style: MotionStyle): Keyframe[] {
  // Neither effect changes the observed box, so an entrance cannot move an item
  // across the viewport boundary or generate its own exit notification.
  return style === "blur" ? [
    { opacity: 0, filter: "blur(3px)", offset: 0 },
    { opacity: 1, filter: "blur(0px)", offset: 0.8 },
    { opacity: 1, filter: "blur(0px)", offset: 1 },
  ] : [{ opacity: 0 }, { opacity: 1 }];
}

/**
 * Content is visible without JS. Eligible unseen targets are pre-armed with a
 * static opacity state; only in-viewport items receive animation instances.
 */
export function createViewportMotion(
  root: HTMLElement,
  targets: MotionTarget[],
  options: { mobileMenu?: boolean } = {},
  environment: MotionEnvironment = { document, window, Observer: globalThis.IntersectionObserver },
) {
  const { document: doc, window: win, Observer } = environment;
  if (!Observer || !win.matchMedia || targets.length === 0) return () => {};

  const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = options.mobileMenu ? win.matchMedia("(max-width: 1000px)") : null;
  if ([reducedMotion, mobile].some(media => media &&
    (typeof media.addEventListener !== "function" || typeof media.removeEventListener !== "function"))) {
    return () => {};
  }
  const pending = new Map(targets.map(target => [target.element, target]));
  const active = new Map<HTMLElement, Animation>();
  const order = new Map(targets.map((target, index) => [target.element, index]));
  let observer: IntersectionObserver | null = null;
  let disposed = false;

  function settle(element: HTMLElement) {
    element.removeAttribute("data-motion-pending");
    const animation = active.get(element);
    if (animation) {
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
      active.delete(element);
    }
    pending.delete(element);
    observer?.unobserve(element);
    if (pending.size === 0) dispose();
  }

  function canRun() {
    return !disposed && !doc.hidden && !reducedMotion.matches && (!mobile || mobile.matches);
  }

  function entered(entries: Pick<IntersectionObserverEntry, "target" | "isIntersecting" | "intersectionRatio">[]) {
    if (!canRun()) return;
    const stagger = new Map<Element, number>();
    // Layout visibility is individual, so long mobile sections never pre-run.
    entries.sort((a, b) => (order.get(a.target as HTMLElement) ?? 0) - (order.get(b.target as HTMLElement) ?? 0));
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      const target = pending.get(element);
      if (!target) continue;
      if (!entry.isIntersecting || entry.intersectionRatio <= 0) {
        if (active.has(element)) settle(element);
        continue;
      }
      if (active.has(element)) continue;
      if (element.contains(doc.activeElement) || typeof element.animate !== "function") {
        settle(element);
        continue;
      }
      const index = stagger.get(target.group) ?? 0;
      stagger.set(target.group, index + 1);
      try {
        const animation = element.animate(motionKeyframes(target.style), {
          duration: options.mobileMenu ? 360 : target.style === "blur" ? 600 : 460,
          delay: Math.min(index * (options.mobileMenu ? 55 : 60), options.mobileMenu ? 220 : 180),
          easing: "cubic-bezier(0.2, 0.65, 0.3, 1)",
          // Hold the final frame until settle removes the pending opacity state.
          fill: "both",
          iterations: 1,
        });
        active.set(element, animation);
        animation.onfinish = () => settle(element);
        animation.oncancel = () => settle(element);
      } catch {
        // Unsupported animation never hides or blocks the page.
        settle(element);
      }
    }
  }

  function syncVisibility() {
    observer?.disconnect();
    if (doc.hidden || reducedMotion.matches || (mobile && !mobile.matches)) {
      for (const element of Array.from(active.keys())) settle(element);
    }
    // Respect a preference change immediately and leave all content static.
    if (reducedMotion.matches || (mobile && !mobile.matches)) {
      dispose();
      return;
    }
    if (canRun()) {
      // Collect layout reads first, then animate. Called from a layout effect so
      // the hero/menu cannot flash visible before their first entry animation.
      const visibleEntries = Array.from(pending.keys()).map(element => {
        const rect = element.getBoundingClientRect();
        const width = Math.max(0, Math.min(rect.right, win.innerWidth) - Math.max(rect.left, 0));
        const height = Math.max(0, Math.min(rect.bottom, win.innerHeight) - Math.max(rect.top, 0));
        return { target: element, isIntersecting: width > 0 && height > 0,
          intersectionRatio: rect.width * rect.height > 0 ? width * height / (rect.width * rect.height) : 0 };
      }).filter(entry => entry.isIntersecting);
      for (const element of pending.keys()) {
        if (typeof element.animate !== "function" || element.contains(doc.activeElement)) {
          settle(element);
          continue;
        }
        // Pre-arm even far-below-fold content before paint, without animations,
        // timers, blur, or compositor hints running while it is offscreen.
        element.setAttribute("data-motion-pending", "");
        observer?.observe(element);
      }
      entered(visibleEntries);
    }
  }

  function focusContent(event: Event) {
    for (const element of pending.keys()) {
      if (element.contains(event.target as Node)) settle(element);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    observer = null;
    for (const element of pending.keys()) element.removeAttribute("data-motion-pending");
    for (const animation of active.values()) {
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
    }
    active.clear();
    pending.clear();
    order.clear();
    root.removeEventListener("focusin", focusContent);
    doc.removeEventListener("visibilitychange", syncVisibility);
    win.removeEventListener("beforeprint", dispose);
    reducedMotion.removeEventListener("change", syncVisibility);
    mobile?.removeEventListener("change", syncVisibility);
  }

  try {
    // Edge contact is not visible area; 1% ensures another callback after touch.
    observer = new Observer(entered, { threshold: [0, 0.01], rootMargin: "0px" });
    root.addEventListener("focusin", focusContent);
    doc.addEventListener("visibilitychange", syncVisibility);
    win.addEventListener("beforeprint", dispose);
    reducedMotion.addEventListener("change", syncVisibility);
    mobile?.addEventListener("change", syncVisibility);
    syncVisibility();
  } catch {
    // Even partial observer setup failure must restore every pre-armed target.
    dispose();
  }
  return dispose;
}
