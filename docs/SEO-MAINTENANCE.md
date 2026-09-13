# SEO maintenance

The public site is a marketing site for software buyers. Legacy artist, booking, dashboard and Firebase files are not public marketing routes.

## Build and verify

Run `npm run build`, then `npm run test:marketing`. The build emits static HTML for all public pages, a `404.html`, `sitemap.xml` and `robots.txt` into `dist`. React hydrates the same components in the browser. No production SSR server or additional dependencies are required. `dist-ssr` contains the build-only renderer and must not be deployed.

`src/marketing/seo.ts` is the shared metadata and sitemap route registry. `index.html` is a build template; inspect `dist/*.html` to check the actual production metadata. Never deploy the source template or run only `vite build`: the complete npm build is required. Vercel is configured to run that command and serve `dist`.

The crawler files are generated during production builds rather than stored in `public`. Use `npm run preview` to inspect them. Development mode keeps SPA routing for local editing; production preview uses static routing so unknown URLs do not inherit homepage content.

## Adding a page

1. Write a useful React page and register its route in `src/marketing/MarketingSite.tsx`.
2. Add its canonical path, unique title and description to `publicPages` in `src/marketing/seo.ts`.
3. Add descriptive internal links from the relevant home section and navigation/footer.
4. Remove any conflicting alias in `vercel.json` (for example, `/about` currently redirects to a home section).
5. Extend `tests/seo.test.mjs` and rebuild. Verify direct navigation, hydration, metadata, internal links and sitemap inclusion.

Only include public pages with substantive content. Do not add demo URLs, account pages, checkout URLs, filtered URLs, fragment links or placeholder city pages. Do not invent `lastmod` dates on each build. Keep the canonical origin `https://www.satxink.com` consistent with the live apex-to-www redirect.

## Hosting checks after deployment

- `/`, `/privacy`, `/terms`, `/robots.txt` and `/sitemap.xml` must return 200. Privacy and terms must have their own canonical and description in the initial HTML.
- An invented path must return HTTP 404. Vercel should serve the generated custom `404.html`; verify this on the actual deployment because Vite preview uses its own generic 404 response.
- `/about`, `/contact` and `/faq` should redirect permanently to their matching homepage sections. Do not restore a wildcard rewrite to `index.html`.
- Verify HTTP and non-www hosts redirect to the preferred HTTPS www host. Domain redirects are managed at the host and are not newly configured by this change.
- Keep preview deployments protected or noindexed. Apply a noindex header in the separate demo deployment, not globally to this production marketing site. Robots.txt must allow crawling for crawlers to see a noindex directive.
- Check deployed HTML for unintended `X-Robots-Tag: noindex` headers, and inspect it using Search Console's live URL test.

## Launch and content

The announced Texas launch is September 20, 2026. The dated notice is deliberately not a countdown. Revisit homepage copy and metadata when the service has launched; describe actual availability then. Do not claim nationwide coverage, guaranteed bookings, instant payouts, customer outcomes or ratings without evidence.

Organization and WebSite JSON-LD identify SATX INK as a software provider. They do not claim a tattoo studio address or fabricate reviews. A launch date is not an incorporation date or a tattoo event. A separate software rich-result implementation would need its own accurate eligibility review.

The detailed audit and recommended page plan are in `SEO-AUDIT-2026-09-13.md`. Changes are local until explicitly published.
