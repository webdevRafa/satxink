# SATX INK marketing website

Vite, React, TypeScript, and Tailwind CSS promotional site for individually installed tattoo shop software. The public site no longer mounts the previous marketplace, authentication, booking, or checkout application.

## Develop and verify

```sh
npm ci
npm run dev
npm run lint
npm run build
npm run test:marketing
npm run preview
```

Run the production build before `test:marketing`: the tests also verify the built bundle and its lazy-loading boundaries. No Firebase or Stripe environment variables are required for the marketing site.

## Content and inquiries

- `src/marketing/MarketingSite.tsx`: promotional copy, navigation, FAQs, and demo contact.
- `src/marketing/InformationPage.tsx`: marketing-site privacy and website information.
- `src/index.css`: existing SATX INK charcoal/red visual language, responsive layouts, and motion preferences.
- Demo links open a prefilled email to **support@satxink.com**, approved by the site owner. The site does not pretend to submit a lead form; a copy-address alternative is provided.
- `/about`, `/contact`, and `/faq` redirect to relevant sections. Other former app URLs show a retirement message instead of exposing the old application.

## Animated hero

The current Blender export and responsive WebP posters live in `public/studio/cinematic/`. The wall descriptor reads **TATTOO STUDIO SOFTWARE**; the old gallery caption was removed. Illustrative flash artwork is identified as such, not presented as a real customer's work or a product screenshot.

`StudioHero.tsx` immediately displays the poster and loads the Three.js renderer only when appropriate. `studioRenderer.ts` follows the selected camera's authored 18-second room-to-logo journey with a smooth arcing return and responsive wide/mobile paths. It caps rendering at 30 fps and pixel ratio at 1.25, pauses offscreen or in hidden tabs, and provides pause/static controls outside the image. The owner section uses dedicated portrait/landscape renders to keep branding uncropped. See `docs/cinematic-hero-handoff.md` for the revision and verification details.

Small screens, reduced motion, data saving, slow connections, and exposed low-memory/low-core hints default to static images. Device signals are best-effort, not a guarantee of hardware performance; explicit 3D opt-in is available except with reduced motion. WebGL failure, model errors, an 18-second load timeout, and sustained rendering below 20 fps retain or restore the poster. The GLB is self-contained and approximately 3.4 MB; no `.blend` or large source PNG files ship.

## Regression checks

`tests/hero-policy.test.mjs` covers policy decisions, camera framing, low-frame-rate detection, GLB structure, corrected asset metadata, static assets, sitemap, and production bundle isolation.

For browser checks, use the development server's `/tests/hero-fixture.html?case=...` with `desktop`, `reduced-motion`, `save-data`, `low-memory`, `slow-network`, `model-error`, `no-webgl`, `slow-render`, or `motion-change`. These fixtures simulate signals before mounting the actual hero. They are not imported or included in the production build. Simulation supplements, but does not replace, testing on physical low-end devices and Safari/Firefox.

## Deployment and legacy boundaries

The intended release is the existing GitHub `main` branch and its existing hosting integration. Build output is `dist/`; the existing Vercel SPA rewrite is retained. This rebuild does not provision a separate host, change DNS, deploy Firebase functions/rules, delete customer data, or modify existing payment accounts.

Legacy source and backend configuration remain in the repository for recovery and reference, but are not imported by the marketing entry point. Production bundle checks verify that Firebase/Auth/Firestore clients are absent. Old source still contributes three existing React fast-refresh lint warnings; there are no marketing lint errors.

Changing the model later requires updating its matching WebP posters and keeping the camera/animation names documented in `public/studio/README.md`. After a release, verify the actual hosting deployment separately from the GitHub commit.
