export type MotionStyle = "rise" | "slide" | "scale";
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
    style: element.matches(".flash-visual, .owner-visual") ? "scale"
      : element.matches("li, details, .profile-link-example, .setup-card-top") ? "slide"
        : "rise",
  }));
}

type MotionEnvironment = {
  document: Document;
  window: Window;
  Observer: typeof IntersectionObserver | undefined;
};

export function motionKeyframes(style: MotionStyle, inward = { x: -1, y: 1 }): Keyframe[] {
  const transform = style === "slide" ? `translate3d(${inward.x * 14}px, 0, 0)`
    : style === "scale" ? `translate3d(0, ${inward.y * 12}px, 0) scale(1.02)`
      : `translate3d(0, ${inward.y * 20}px, 0)`;
  return [{ opacity: 0, transform }, { opacity: 1, transform: "none" }];
}

/**
 * Content stays mounted and visible by default. Only transient animation instances
 * are created on entry; exit, completion, focus, and teardown all release them.
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
  const pending = new Map(targets.map(target => [target.element, target]));
  const active = new Map<HTMLElement, Animation>();
  const order = new Map(targets.map((target, index) => [target.element, index]));
  let observer: IntersectionObserver | null = null;
  let disposed = false;

  function settle(element: HTMLElement) {
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

  function entered(entries: Pick<IntersectionObserverEntry, "target" | "isIntersecting" | "boundingClientRect">[]) {
    if (!canRun()) return;
    const stagger = new Map<Element, number>();
    // Layout visibility is individual, so long mobile sections never pre-run.
    entries.sort((a, b) => (order.get(a.target as HTMLElement) ?? 0) - (order.get(b.target as HTMLElement) ?? 0));
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      const target = pending.get(element);
      if (!target) continue;
      if (!entry.isIntersecting) {
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
        // Move toward the viewport, never out across the entry boundary. This
        // prevents a transform from generating its own false exit notification.
        const rect = entry.boundingClientRect;
        const inward = {
          x: rect.left + rect.width / 2 < win.innerWidth / 2 ? 1 : -1,
          y: rect.top + rect.height / 2 < win.innerHeight / 2 ? 1 : -1,
        };
        const animation = element.animate(motionKeyframes(target.style, inward), {
          duration: options.mobileMenu ? 380 : target.style === "scale" ? 700 : 560,
          delay: Math.min(index * (options.mobileMenu ? 65 : 75), 300),
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
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
      const visibleEntries = Array.from(pending.keys()).map(element => ({
        target: element,
        boundingClientRect: element.getBoundingClientRect(),
        isIntersecting: true,
      })).filter(({ boundingClientRect: rect }) => rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.top < win.innerHeight
        && rect.right > 0 && rect.left < win.innerWidth);
      for (const element of pending.keys()) observer?.observe(element);
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

  observer = new Observer(entered, { threshold: 0, rootMargin: "0px" });
  root.addEventListener("focusin", focusContent);
  doc.addEventListener("visibilitychange", syncVisibility);
  win.addEventListener("beforeprint", dispose);
  reducedMotion.addEventListener("change", syncVisibility);
  mobile?.addEventListener("change", syncVisibility);
  syncVisibility();
  return dispose;
}
