// Local Vite-only browser fixture. Not imported by production and not in public/.
// Simulates browser signals before mounting the real production component.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioHero } from "../src/marketing/StudioHero";
import "../src/index.css";

const scenario = new URLSearchParams(location.search).get("case") ?? "desktop";
let reduced = scenario === "reduced-motion";
const realMatchMedia = window.matchMedia.bind(window);
const reducedList = new EventTarget() as MediaQueryList;
Object.defineProperties(reducedList, {
  matches: { get: () => reduced },
  media: { value: "(prefers-reduced-motion: reduce)" },
});
window.matchMedia = (query) =>
  query === "(prefers-reduced-motion: reduce)"
    ? reducedList
    : realMatchMedia(query);
Object.defineProperty(navigator, "deviceMemory", {
  configurable: true,
  value: scenario === "low-memory" ? 2 : 8,
});
Object.defineProperty(navigator, "hardwareConcurrency", {
  configurable: true,
  value: 8,
});
const connection = new EventTarget();
Object.assign(connection, {
  saveData: scenario === "save-data",
  effectiveType: scenario === "slow-network" ? "2g" : "4g",
});
Object.defineProperty(navigator, "connection", {
  configurable: true,
  value: connection,
});

if (scenario === "model-error") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) =>
    String(input).includes("satx-ink-studio.glb")
      ? Promise.resolve(
          new Response("Simulated asset failure", { status: 503 }),
        )
      : originalFetch(input, init);
}
if (scenario === "no-webgl") {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    kind: string,
    options?: unknown,
  ) {
    if (kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl")
      return null;
    return getContext.call(this, kind as "2d", options);
  } as typeof getContext;
}
if (scenario === "slow-render") {
  const requestFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    requestFrame(() => {
      setTimeout(() => callback(performance.now()), 100);
    });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="shell" style={{ paddingBlock: 32 }}>
      <h1>Local hero regression: {scenario}</h1>
      <p>This is a test fixture, not a public marketing page.</p>
      <a className="button" href="mailto:support@satxink.com">
        Demo contact remains accessible
      </a>
      <div style={{ marginTop: 24 }}>
        <StudioHero />
      </div>
      {scenario === "motion-change" && (
        <button
          className="button"
          style={{ marginTop: 24 }}
          onClick={() => {
            reduced = true;
            reducedList.dispatchEvent(new Event("change"));
          }}
        >
          Enable reduced motion test
        </button>
      )}
    </main>
  </StrictMode>,
);
