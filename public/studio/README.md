# SATX INK studio assets

The `cinematic/` directory contains the current September 5, 2026 camera revision. Versioned URLs avoid loading cached older assets. The sign reads “TATTOO STUDIO SOFTWARE”; the separate gallery caption is removed. The chair and task lamp have been repositioned to keep the descriptor unobstructed throughout the camera route.

- `cinematic/satx-ink-studio.glb`: self-contained glTF 2.0 binary, 3,385,708 bytes, 87,718 triangles, four cameras, eight punctual lights, six embedded images. No external textures or decoder required.
- `cinematic/satx-ink-hero-wide.webp`: 2100 × 900 opening hero poster.
- `cinematic/satx-ink-hero-mobile.webp`: 960 × 1200 opening mobile poster.
- `cinematic/satx-ink-hero-desktop.webp`: 1920 × 1080 alternate view.
- `cinematic/satx-ink-studio-detail.webp`: 1600 × 1200 owner image for narrow layouts.
- `cinematic/satx-ink-studio-owner.webp`: 1000 × 1250 dedicated owner portrait.
- `flash-01.svg` through `flash-03.svg`: original illustrative flash artwork created for this scene. Not customer work or software screenshots.
- `cinematic/asset-report.json`: Blender export and round-trip validation, not browser performance certification.

The editable `.blend`, full-size PNG renders, authoring scripts, and backup are maintained outside the website repository. Only web assets are shipped here. Older root-level web exports remain for rollback compatibility; the current site uses the `cinematic/` model and images.

## Runtime contract

`Hero_Cinematic_18s` contains synchronized translation and quaternion channels for `Hero_Copy_Right`, `Hero_Desktop`, and `Hero_Mobile`: 433 samples each, 0–18 seconds, with matching endpoint poses. Follow the selected **animated camera's absolute world pose**; do not transfer Desktop-relative drift. `Studio_Detail` remains static.

The wide route travels approximately 6.49 metres toward the logo, then returns along an alternate arc. The mobile route travels approximately 5.45 metres. Fixed 32mm wide / 36mm mobile lenses use Blender AUTO sensor fit. Camera metadata is exported at 21:9; derive the poster-matching FOV from that metadata rather than assuming the older 16:9 export.

Phones, reduced-motion/data-saving settings, and lower-spec devices default to static images. Capable desktops automatically play the path. Optional 3D can be paused or swapped to a poster, and falls back on load/WebGL/performance failure. Rendering pauses offscreen and in hidden tabs. Playback controls sit outside the image so they cannot obscure branding.
