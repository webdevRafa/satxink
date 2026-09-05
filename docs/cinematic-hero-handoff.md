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

Three.js stays dynamically loaded. DPR remains capped at 1.25, playback at 30 rendered frames/sec. Phones, reduced-motion/data-saving users, slow networks, and lower-spec devices default to static images. No background video, extra rendering dependency, backend, payment flow, or marketing claims were added.
