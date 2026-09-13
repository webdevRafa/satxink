import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { render, renderSeoHead, publicPages, SITE_URL } from '../dist-ssr/entry-server.js';

const output = new URL('../dist/', import.meta.url);
const template = await readFile(new URL('index.html', output), 'utf8');
if (!template.includes('<!--seo-start-->') || !template.includes('<div id="root"></div>')) {
  throw new Error('Prerender template markers are missing. Refusing to ship empty page content.');
}
for (const path of [...publicPages.map(page => page.path), '/404']) {
  const html = template
    .replace(/<!--seo-start-->[\s\S]*?<!--seo-end-->/, () => renderSeoHead(path))
    .replace('<div id="root"></div>', () => `<div id="root">${render(path)}</div>`);
  const filename = path === '/' ? 'index.html' : `${path.slice(1)}.html`;
  const target = new URL(filename, output);
  await mkdir(new URL('.', target), { recursive: true });
  await writeFile(target, html);
}
// No invented lastmod timestamps: add dates only when meaningful page changes are tracked.
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${publicPages.filter(page => page.indexable).map(page => `  <url><loc>${SITE_URL}${page.path}</loc></url>`).join('\n')}
</urlset>
`;
await writeFile(new URL('sitemap.xml', output), sitemap);
await writeFile(new URL('robots.txt', output), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
console.log(`Prerendered ${publicPages.length} public pages, a noindex 404 page, sitemap.xml and robots.txt.`);
