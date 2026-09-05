# Cinematic hero revision — September 5, 2026

## What changed

The nearly static 12-second drift is replaced with an authored 18-second first-person-style camera route: wide room corner, approach, logo close-up, alternate arcing return. Wide and desktop cameras move up to 6.49m from their opening positions; portrait moves up to 5.45m. Both translation and rotation are baked for all three cameras in one synchronized clip. The renderer follows the selected camera directly rather than applying Desktop-relative deltas.

The chair/task lamp have been repositioned, the complete TATTOO STUDIO SOFTWARE descriptor remains visible, and the separate gallery caption stays removed. Every poster was rerendered. The owner section now uses dedicated 4:5 and 4:3 images, not a cropped landscape image. Hero controls are outside the canvas to protect branding.

## Asset contract

See `public/studio/README.md` and `public/studio/cinematic/asset-report.json`. The current versioned asset directory is `/studio/cinematic/`. Original web files remain at `/studio/` for rollback compatibility, but are no longer referenced by the site.

Blender master, GLB, PNGs, WebPs, original SVGs, composition report, and usage README are exported to:

`C:\Users\Ralph\OneDrive\Documents\Blender Projects\SATX_INK_Studio`

The pre-cinematic package and previously open unsaved scene are backed up under the Codex workspace's `work/cinematic-backup/`.

## Verification

- Blender export and fresh reimport: one 18-second clip, six channels, 433 samples per channel; all camera transforms match the source within floating-point tolerance; exact matching endpoint poses.
- Sampled caption ray casts: no foreground blockers throughout the responsive camera paths. Brand bounds remain inside each native aspect ratio.
- Production TypeScript/Vite build and 18 marketing tests pass. The Three loader/mixer test reads the actual shipped animation bytes, verifies >5m travel, matching loop endpoints, live camera object references, and responsive optics.
- Browser checks: desktop camera motion, pause/resume controls, mobile static default and optional 3D, offscreen pause, desktop portrait and mobile landscape owner images without horizontal overflow.
- Browser regression fixtures: reduced-motion static default, live reduced-motion change disposes the canvas, model HTTP failure, unavailable WebGL, and sustained low frame rate all preserve a working poster.

Three.js stays dynamically loaded. DPR remains capped at 1.25, playback at 30 rendered frames/sec. Reduced-motion/data-saving users, slow networks, and lower-spec devices default to static images. No background video, extra rendering dependency, backend, payment flow, or marketing claims were added.

## Mobile autoplay and renderer lifetime follow-up

Screen width no longer blocks autoplay. Capable phones start the camera animation automatically when the hero is visible. The performance and accessibility safeguards remain in place.

The previous implementation only paused offscreen and retained GPU resources. It now aborts pending loading and disposes the canvas, renderer, model geometries/materials/textures, shadow resources, environment map, and WebGL context whenever the hero leaves the viewport or the document becomes hidden. Re-entry creates a fresh renderer from the opening pose. The lightweight poster and wrapper remain mounted to preserve layout. Browser HTTP caching may retain downloaded bytes; no live scene or GPU context is cached by the application.

Autoplay scheduling is separate from user intent. Exiting before the startup delay does not consume autoplay; Pause and Static choices survive scrolling. Load/WebGL/performance failures remain on the poster without repeated automatic attempts.

The `lifecycle` and `slow-load` fixtures mount the production component and expose DOM telemetry for actual WebGL context loss, draw calls, canvases and cancelled loads. These test-only instruments are not shipped. Browser checks confirm automatic phone-size playback, zero live contexts/canvases with unchanged draw-call counts offscreen, automatic recreation on return, preserved Pause/Static choices, hidden-document cleanup, and cancellation/recovery during delayed model loading.
