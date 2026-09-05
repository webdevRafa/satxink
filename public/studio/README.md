# SATX INK studio assets

These assets were supplied and approved by the site owner. They are the September 5, 2026 corrected exports: the sign reads “TATTOO STUDIO SOFTWARE”; the separate gallery caption is removed.

- `satx-ink-studio.glb`: self-contained glTF 2.0 binary, 3,368,020 bytes, 87,718 triangles, four cameras, eight punctual lights, six embedded images. No external textures or decoder required.
- `satx-ink-hero-wide.webp`: 2100 × 900 hero poster.
- `satx-ink-hero-mobile.webp`: 960 × 1200 mobile hero poster.
- `satx-ink-hero-desktop.webp`: 1920 × 1080 alternate view.
- `satx-ink-studio-detail.webp`: 1600 × 1200 detail image.
- `flash-01.svg` through `flash-03.svg`: original illustrative flash artwork created for this scene. Not customer work or software screenshots.
- `asset-report.json`: Blender export and round-trip validation, not browser performance certification.

The editable `.blend`, full-size PNG renders, and backup are maintained outside the website repository. Only web assets are shipped here.

Runtime contract: preserve `Hero_Copy_Right` (wide), `Hero_Mobile` (portrait), and `Hero_Desktop` (animated reference) cameras, plus the `Hero_Ambient_Drift_12s` looping animation. The renderer transfers the animated reference camera's relative motion to the selected authored view. Changing those names requires a corresponding renderer/test update.
