// Local Vite-only browser fixture. Not imported by production and not in public/.
// Simulates browser signals before mounting the real production component.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { StudioHero } from "../src/marketing/StudioHero";
import "../src/index.css";

const scenario = new URLSearchParams(location.search).get("case") ?? "desktop";
const lifecycle = ["lifecycle", "slow-load"].includes(scenario);
const diagnostics = { contextsCreated: 0, drawCalls: 0, cancelledLoads: 0 };
const contexts = new Set<WebGLRenderingContext | WebGL2RenderingContext>();
if (lifecycle) {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement, kind: string, options?: unknown,
  ) {
    const context = getContext.call(this, kind as "2d", options);
    if ((kind === "webgl" || kind === "webgl2") && context) {
      const gl = context as unknown as WebGLRenderingContext;
      if (!contexts.has(gl)) {
        contexts.add(gl);
        diagnostics.contextsCreated++;
        const drawElements = gl.drawElements.bind(gl);
        gl.drawElements = (...args) => { diagnostics.drawCalls++; drawElements(...args); };
        const drawArrays = gl.drawArrays.bind(gl);
        gl.drawArrays = (...args) => { diagnostics.drawCalls++; drawArrays(...args); };
      }
    }
    return context;
  } as typeof getContext;
}
if (scenario === "slow-load") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => !String(input).includes("satx-ink-studio.glb")
    ? originalFetch(input, init)
    : new Promise((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        diagnostics.cancelledLoads++;
        reject(new DOMException("Fixture load cancelled", "AbortError"));
      };
      const timer = setTimeout(() => {
        init?.signal?.removeEventListener("abort", cancel);
        originalFetch(input, init).then(resolve, reject);
      }, 3000);
      init?.signal?.addEventListener("abort", cancel, { once: true });
      if (init?.signal?.aborted) cancel();
    });
}
let hidden = false;
if (lifecycle) Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });

// eslint-disable-next-line react-refresh/only-export-components -- Standalone test entry point, not a production component module.
function LifecycleDiagnostics() {
  const [snapshot, setSnapshot] = useState("");
  useEffect(() => {
    // Test-only DOM telemetry, including retained contexts to verify actual
    // context loss rather than assuming a removed canvas means GPU cleanup.
    const interval = setInterval(() => setSnapshot(JSON.stringify({
      ...diagnostics,
      liveContexts: [...contexts].filter(context => !context.isContextLost()).length,
      canvases: document.querySelectorAll(".studio-canvas canvas").length,
      mode: document.querySelector<HTMLElement>(".studio-stage")?.dataset.studioMode,
      playback: document.querySelector<HTMLCanvasElement>(".studio-canvas canvas")?.dataset.playback,
    })), 100);
    return () => clearInterval(interval);
  }, []);
  return <output data-testid="lifecycle-diagnostics" style={{ display: "block", fontSize: 14 }}>{snapshot}</output>;
}
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
    <main className="shell" id="hero-start" style={{ paddingBlock: 32 }}>
      <h1>Local hero regression: {scenario}</h1>
      <p>This is a test fixture, not a public marketing page.</p>
      <a className="button" href="mailto:support@satxink.com">
        Demo contact remains accessible
      </a>
      <div style={{ marginTop: 24 }}>
        <StudioHero />
      </div>
      {lifecycle && <>
        <LifecycleDiagnostics />
        <a className="button" href="#away">Scroll away from hero</a>
        <button className="button" onClick={() => {
          hidden = !hidden;
          document.dispatchEvent(new Event("visibilitychange"));
        }}>Toggle hidden page test</button>
        <div style={{ height: "180vh" }} />
        <section id="away" style={{ minHeight: "110vh" }}>
          <h2>Hero is outside the viewport</h2>
          <a className="button" href="#hero-start">Return to hero</a>
          <button className="button" onClick={() => {
            document.getElementById("hero-start")?.scrollIntoView({ behavior: "instant" });
            setTimeout(() => document.getElementById("away")?.scrollIntoView({ behavior: "instant" }), 100);
          }}>Briefly visit hero test</button>
        </section>
      </>}
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
