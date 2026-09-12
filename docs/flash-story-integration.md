# Living Flash Portfolio — marketing integration

## Scope

Two GSAP ScrollTrigger chapters use one shared Three.js renderer and the supplied optimized model. The hero/client video and artist publishing video remain real HTML videos in their original sections. Booking/product backend code is untouched. Owner events and opt-in email content now sit together before setup and pricing.

The model is an illustration of the workflow, not an interactive booking interface. No payment calls, customer data, or invented transaction results are part of the scene.

## Assets

- `public/media/flash-story/portfolio.glb`: supplied optimized GLB, 568,944 bytes; SHA256 `7d5ac7919a58ebb3b15bf7b3b2ba72319c03872c514dd43b27ee4bf7c99e9b8a`.
- `scene-manifest.json`: supplied glTF coordinates, complete poses, and camera guides.
- `sheet-extracted.jpg`: alternate atlas, assigned only to the cloned sheet material.
- WebP illustrations: supplied desktop and 480px stills for each story step.

The baseline GLB is identical in hierarchy/geometry but uses a higher-quality atlas; it is not loaded or shipped a second time. Blender source, original artwork, and production scripts remain in the user's supplied ZIP, outside the website source. Preserve that package for future asset editing. Artwork is user-supplied; this implementation does not establish third-party trademark/artwork licensing.

## Choreography and performance

`storyModel.ts` specifies deterministic progress intervals, with holds between transformations. At 40% of Chapter A the sheet switches texture and the individual cards appear at their matching source slots in the same render. Reverse scrubbing restores the original sheet atomically. All rotations interpolate quaternions; the cover rotates through its authored hinge, with the decal attached.

Optional enhancement loads on approach only for screens >=1024px wide and >=700px tall, normal motion preference, and no save-data hint. The lazy GSAP/Three.js chunk is about 202 KB gzipped; it is excluded from the initial page bundle. The approximately 0.57 MB GLB and alternate atlas are shared between chapters. One canvas moves between chapter hosts; no continuous render loop or video textures. DPR is capped at 1.5. Pin distances are 2 and 2.5 viewport heights. Native scroll, no wheel interception, no snap, no body lock.

All eight steps exist in an ordered HTML reading sequence. Mobile, reduced-motion, unsupported WebGL, failed loading, insufficient text space, and context loss use the illustrated static layout. The story has an explicit static-mode control and each pin has a skip link. Videos have separate pause/play controls and default to posters under reduced motion. This Vite app is still client-rendered: the change does not add no-JavaScript SSR.

## Validation / review

Run `npm run build`, `npm run test:marketing`, and targeted ESLint on changed marketing modules. Tests cover policy, complete poses, deterministic reverse scrubbing, the exact extraction boundary, supplied GLB hierarchy and asset budgets, both retained recordings, and existing marketing behavior.

Review desktop forward/backward scroll, skip/navigation links, static mode, mobile, reduced motion, and window resizing on the deployed site. Automated checks are not a substitute for cross-device visual/performance QA; no measured FPS or conversion improvement is claimed.

## Revert

This integration is isolated in one Git commit on the marketing repository. Revert that commit with `git revert <integration-commit>` and push the revert. This preserves later unrelated work and restores the prior video-led marketing layout. Do not use a hard reset. No Firebase function redeployment is needed for this marketing-only change.
