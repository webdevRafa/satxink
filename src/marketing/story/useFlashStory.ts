import { useEffect, useRef, useState } from "react";
import { eligibleForStory } from "./storyModel";

/** One scene owner for both chapters. The static document is always the base. */
export function useFlashStory() {
  const root = useRef<HTMLDivElement>(null);
  const [staticMode, setStaticMode] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element || staticMode || typeof IntersectionObserver === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    let cleanup: (() => void) | undefined;
    let pending = false;
    let generation = 0;
    let controller: AbortController | undefined;
    const release = () => { generation++; controller?.abort(); cleanup?.(); cleanup = undefined; pending = false; };
    const setup = () => {
      if (!eligibleForStory(innerWidth, innerHeight, media.matches, !!connection?.saveData)) { release(); return; }
      if (cleanup || pending) return;
      pending = true;
      controller = new AbortController();
      const signal = controller.signal;
      const version = ++generation;
      void import("./createStoryExperience").then(async ({ createStoryExperience }) => {
        if (signal.aborted) return;
        const dispose = await createStoryExperience(element, signal);
        if (version !== generation) dispose(); else { cleanup = dispose; pending = false; }
      }).catch(() => { if (version === generation) pending = false; });
    };
    const approach = () => {
      const sections = element.querySelectorAll<HTMLElement>(".flash-story");
      if (Array.from(sections).some(s => { const r = s.getBoundingClientRect(); return r.top < innerHeight * 1.8 && r.bottom > 0; })) setup();
    };
    const observer = new IntersectionObserver(approach, { rootMargin: "80% 0px" });
    element.querySelectorAll(".flash-story").forEach(s => observer.observe(s));
    const change = () => {
      if (!eligibleForStory(innerWidth, innerHeight, media.matches, !!connection?.saveData)) release();
      else approach();
    };
    media.addEventListener("change", change);
    window.addEventListener("resize", change);
    approach();
    return () => { observer.disconnect(); media.removeEventListener("change", change); window.removeEventListener("resize", change); release(); };
  }, [staticMode]);
  return { root, staticMode, toggleStory: () => setStaticMode(value => !value) };
}
