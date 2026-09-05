import { useEffect, useRef, useState } from "react";
import { Image, Pause, Play } from "lucide-react";
import { shouldAutoLoad3D } from "./heroPolicy";
import type { StudioController } from "./studioRenderer";

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
type DeviceNavigator = Navigator & {
  deviceMemory?: number;
  connection?: Connection;
};

export function StudioHero() {
  const stage = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<StudioController | null>(null);
  const visible = useRef(false);
  const [inViewport, setInViewport] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [autoEligible, setAutoEligible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [requested, setRequested] = useState(false);
  const [mode, setMode] = useState<
    "poster" | "loading" | "ready" | "unavailable"
  >("poster");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const optedOut = useRef(false);
  const autoStartTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const device = navigator as DeviceNavigator;
    function policyChanged() {
      setReducedMotion(media.matches);
      setAutoEligible(
        shouldAutoLoad3D({
          reducedMotion: media.matches,
          saveData: device.connection?.saveData,
          effectiveType: device.connection?.effectiveType,
          memory: device.deviceMemory,
          cores: device.hardwareConcurrency,
          width: window.innerWidth,
        }),
      );
      if (media.matches || device.connection?.saveData) setRequested(false);
    }
    policyChanged();
    media.addEventListener("change", policyChanged);
    device.connection?.addEventListener("change", policyChanged);
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.isIntersecting;
        setInViewport(visible.current);
      },
      { threshold: 0 },
    );
    if (stage.current) observer.observe(stage.current);
    const visibilityChanged = () => setPageVisible(!document.hidden);
    visibilityChanged();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      clearTimeout(autoStartTimer.current);
      observer.disconnect();
      media.removeEventListener("change", policyChanged);
      device.connection?.removeEventListener("change", policyChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);

  useEffect(() => {
    if (
      !inViewport || !pageVisible || !autoEligible || requested ||
      optedOut.current || failed
    ) return;
    // Delay optional 3D behind the high-priority poster, on phones and desktop.
    // Exiting before this fires cancels it without consuming future autoplay.
    const timer = setTimeout(() => setRequested(true), 900);
    autoStartTimer.current = timer;
    return () => clearTimeout(timer);
  }, [inViewport, pageVisible, autoEligible, requested, failed]);

  useEffect(() => {
    // Visibility owns the renderer lifetime, independently of the user's choice
    // to play, pause, or use a static image. Cleanup aborts loads and frees GPU
    // resources; returning to view can create a fresh renderer automatically.
    if (
      !requested || reducedMotion || !inViewport || !pageVisible ||
      failed || !host.current
    ) {
      setMode(failed ? "unavailable" : "poster");
      return;
    }
    const target = host.current;
    const abort = new AbortController();
    let current: StudioController | undefined;
    let cancelled = false;
    function fallback() {
      if (cancelled) return;
      clearTimeout(timeout);
      setMode("unavailable");
      setFailed(true);
      current?.dispose();
      controller.current = null;
      abort.abort();
    }
    setMode("loading");
    const timeout = setTimeout(fallback, 18000);
    import("./studioRenderer")
      .then((module) => {
        if (cancelled) return undefined;
        return module.createStudioRenderer(target, {
          signal: abort.signal,
          onError: fallback,
        });
      })
      .then((result) => {
        clearTimeout(timeout);
        if (!result) return;
        if (cancelled || abort.signal.aborted) {
          result.dispose();
          return;
        }
        current = result;
        controller.current = result;
        result.setPlaying(
          visible.current && !document.hidden && !pausedRef.current,
        );
        setMode("ready");
      })
      .catch(() => {
        if (!abort.signal.aborted) fallback();
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      abort.abort();
      current?.dispose();
      controller.current = null;
    };
  }, [requested, reducedMotion, inViewport, pageVisible, failed]);

  function togglePause() {
    pausedRef.current = !paused;
    setPaused(!paused);
    controller.current?.setPlaying(
      paused && visible.current && !document.hidden,
    );
  }
  function usePoster() {
    clearTimeout(autoStartTimer.current);
    optedOut.current = true;
    setRequested(false);
  }

  return (
    <div className="studio-viewer">
      <div ref={stage} className="studio-stage" data-studio-mode={mode}>
        <picture>
          <source
            media="(max-width: 599px)"
            srcSet="/studio/cinematic/satx-ink-hero-mobile.webp"
          />
          <img
            src="/studio/cinematic/satx-ink-hero-wide.webp"
            alt="An illustrative tattoo studio with SATX INK tattoo studio software branding, framed flash artwork, and a red client chair."
            width="2100"
            height="900"
            fetchPriority="high"
          />
        </picture>
        <div
          ref={host}
          className={`studio-canvas ${mode === "ready" ? "is-ready" : ""}`}
          aria-hidden="true"
        />
      </div>
      <div className="studio-toolbar">
        <div className="studio-caption">
          Your shop’s identity. One connected system.
        </div>
        <div className="studio-controls">
          {mode === "ready" ? (
            <>
              <button
                type="button"
                onClick={togglePause}
                aria-label={
                  paused ? "Resume studio motion" : "Pause studio motion"
                }
              >
                {paused ? <Play size={14} /> : <Pause size={14} />}{" "}
                {paused ? "Resume" : "Pause motion"}
              </button>
              <button type="button" onClick={usePoster}>
                <Image size={14} /> Static view
              </button>
            </>
          ) : mode === "loading" ? (
            <button type="button" onClick={usePoster}>
              Loading 3D · Cancel
            </button>
          ) : !reducedMotion && mode !== "unavailable" ? (
            <button
              type="button"
              onClick={() => {
                clearTimeout(autoStartTimer.current);
                optedOut.current = true;
                pausedRef.current = false;
                setPaused(false);
                setRequested(true);
              }}
            >
              <Play size={15} /> Play animation{" "}
              <span className="download-size">3.4 MB</span>
            </button>
          ) : (
            <span className="static-badge">
              <Image size={14} /> Static view
            </span>
          )}
        </div>
      </div>
      <span className="sr-only" role="status">
        {mode === "unavailable"
          ? "Showing the studio image because 3D is unavailable or too demanding for this device."
          : mode === "ready"
            ? "3D studio loaded. Motion can be paused."
            : mode === "loading"
              ? "Loading optional 3D studio. The image remains available."
              : "Showing the studio image."}
      </span>
    </div>
  );
}
