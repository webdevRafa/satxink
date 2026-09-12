import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createStoryRenderer } from "./createStoryRenderer";
import { eligibleForStory, storyFrame } from "./storyModel";
import type { Chapter } from "./storyModel";

gsap.registerPlugin(ScrollTrigger);

export async function createStoryExperience(root: HTMLElement, signal?: AbortSignal) {
  let disposed = false;
  let failed = false;
  const cleanups: (() => void)[] = [];
  const views: { section: HTMLElement; stage: HTMLElement; host: HTMLElement; chapter: Chapter; progress: number }[] = [];
  let renderer: Awaited<ReturnType<typeof createStoryRenderer>> | undefined;
  const dispose = () => {
    if (disposed) return; disposed = true;
    const reading = views.find(v => { const r = v.stage.getBoundingClientRect(); return r.top <= 120 && r.bottom > 120; });
    const readingStep = reading?.section.querySelector<HTMLElement>(`[data-step="${storyFrame(reading.chapter, reading.progress).step}"]`);
    cleanups.reverse().forEach(fn => fn());
    renderer?.dispose();
    views.forEach(v => { v.section.removeAttribute("data-enhanced"); v.stage.style.removeProperty("height"); v.host.parentElement?.removeAttribute("data-rendered"); });
    ScrollTrigger.refresh();
    if (readingStep?.isConnected) readingStep.scrollIntoView({ behavior: "instant", block: "center" });
  };
  try {
    renderer = await createStoryRenderer(() => { failed = true; dispose(); }, signal);
    if (failed) { renderer.dispose(); return dispose; }
    if (signal?.aborted || !root.isConnected || !eligibleForStory(innerWidth, innerHeight, matchMedia("(prefers-reduced-motion: reduce)").matches, false)) { dispose(); return dispose; }
    const headerHeight = () => document.querySelector(".site-header")?.getBoundingClientRect().height ?? 88;
    let drawFrame = 0;
    const draw = () => {
      drawFrame = 0;
      if (disposed || document.hidden) return;
      // Exactly one canvas / WebGL context is reused between both chapters.
      const visible = views.filter(v => { const r = v.stage.getBoundingClientRect(); return r.bottom > headerHeight() && r.top < innerHeight; });
      const view = visible.sort((a, b) => Math.abs(a.stage.getBoundingClientRect().top - headerHeight()) - Math.abs(b.stage.getBoundingClientRect().top - headerHeight()))[0];
      if (view) {
        const body = view.section.querySelector<HTMLElement>(".story-body")!;
        const copy = view.section.querySelector<HTMLElement>(".story-copy")!;
        if (copy.offsetHeight > body.clientHeight + 2) { dispose(); return; }
        try { renderer!.draw(view.host, view.chapter, view.progress); } catch { dispose(); }
      }
    };
    const requestDraw = () => { if (!drawFrame && !document.hidden) drawFrame = requestAnimationFrame(draw); };
    for (const section of root.querySelectorAll<HTMLElement>(".flash-story")) {
      const stage = section.querySelector<HTMLElement>(".story-stage")!;
      const host = section.querySelector<HTMLElement>(".story-canvas-host")!;
      const chapter = section.dataset.chapter as Chapter;
      section.dataset.enhanced = "true";
      stage.style.height = `${innerHeight - headerHeight()}px`;
      const inner = section.querySelector<HTMLElement>(".story-inner")!;
      if (inner.scrollHeight > stage.clientHeight + 2) { section.removeAttribute("data-enhanced"); stage.style.removeProperty("height"); continue; }
      const view = { section, stage, host, chapter, progress: 0 }; views.push(view);
      const items = Array.from(section.querySelectorAll<HTMLElement>(".story-steps li"));
      const track = section.querySelector<HTMLElement>(".story-track span")!;
      const state = { progress: 0 };
      const update = () => {
        view.progress = state.progress;
        const step = storyFrame(chapter, state.progress).step;
        items.forEach((item, index) => { item.dataset.current = String(index === step); });
        track.style.transform = `scaleX(${.04 + state.progress * .96})`;
        requestDraw();
      };
      const animation = gsap.to(state, { progress: 1, duration: 1, ease: "none", paused: true, onUpdate: update });
      const trigger = ScrollTrigger.create({
        trigger: stage, pin: stage, animation, start: () => `top ${headerHeight()}`,
        end: () => `+=${innerHeight * (chapter === "collection" ? 2 : 2.5)}`,
        scrub: .3, invalidateOnRefresh: true,
        onRefresh: () => { stage.style.height = `${innerHeight - headerHeight()}px`; requestDraw(); },
        onToggle: requestDraw,
      });
      cleanups.push(() => { trigger.kill(true); animation.kill(); items.forEach(i => i.removeAttribute("data-current")); track.style.removeProperty("transform"); });
      update();
    }
    window.addEventListener("scroll", requestDraw, { passive: true });
    window.addEventListener("resize", requestDraw);
    document.addEventListener("visibilitychange", requestDraw);
    cleanups.push(() => { cancelAnimationFrame(drawFrame); window.removeEventListener("scroll", requestDraw); window.removeEventListener("resize", requestDraw); document.removeEventListener("visibilitychange", requestDraw); });
    // Reflow after fonts settle, and give deep links their final pinned-document position.
    const hashAtStart = location.hash;
    const initialScroll = scrollY;
    void document.fonts.ready.then(() => {
      if (disposed) return;
      ScrollTrigger.refresh(); requestDraw();
      if (hashAtStart && location.hash === hashAtStart && Math.abs(scrollY - initialScroll) < 8) document.getElementById(hashAtStart.slice(1))?.scrollIntoView({ behavior: "instant" });
    });
    ScrollTrigger.refresh(); requestDraw();
    return dispose;
  } catch (error) { dispose(); throw error; }
}
