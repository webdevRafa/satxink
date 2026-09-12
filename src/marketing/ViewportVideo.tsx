import { useEffect, useRef, useState } from "react";

type Props = { src: string; poster: string; width: number; height: number; label: string };

function ActiveVideo({ src, poster, width, height, label }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current!;
    video.muted = true;
    video.src = src;
    void video.play().catch(() => { /* The poster remains if autoplay is blocked. */ });
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load(); // Abort downloads and release the media resource before removal.
    };
  }, [src]);
  return <video ref={ref} autoPlay muted loop playsInline preload="none"
    poster={poster} width={width} height={height} aria-label={label} />;
}

export function ViewportVideo(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const element = host.current!;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const changeMotion = () => setPaused(!!motion?.matches);
    motion?.addEventListener("change", changeMotion);
    let inView = false;
    const update = () => setActive(inView && !document.hidden);
    const measure = () => {
      const rect = element.getBoundingClientRect();
      inView = rect.width > 0 && rect.height > 0 && rect.bottom > 0 &&
        rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
      update();
    };
    const observer = typeof IntersectionObserver === "undefined" ? null :
      new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
        update();
      }, { threshold: 0 });
    measure();
    observer?.observe(element);
    if (!observer) {
      window.addEventListener("scroll", measure, { passive: true });
      window.addEventListener("resize", measure);
    }
    document.addEventListener("visibilitychange", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", measure);
      motion?.removeEventListener("change", changeMotion);
    };
  }, []);
  return <div ref={host} className="viewport-video" style={{ aspectRatio: `${props.width} / ${props.height}` }}>
    {active && !paused ? <ActiveVideo {...props} /> :
      <img src={props.poster} width={props.width} height={props.height} alt={props.label} />}
    <button type="button" className="video-motion-toggle" onClick={() => setPaused(value => !value)}
      aria-label={`${paused ? "Play" : "Pause"} ${props.label}`}>
      {paused ? "Play walkthrough" : "Pause walkthrough"}
    </button>
  </div>;
}
