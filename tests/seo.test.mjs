import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const dist = new URL('../dist/', import.meta.url);
const read = file => readFileSync(new URL(file, dist), 'utf8');
const pages = [
  ['index.html', '/', 'Tattoo Shop Software', 'Flash, booking requests, and deposits'],
  ['privacy.html', '/privacy', 'Privacy Policy', 'When you get in touch'],
  ['terms.html', '/terms', 'Website Information', 'Your installation'],
];

for (const [file, path, title, body] of pages) {
  test(`${path} serves its content and metadata before JavaScript runs`, () => {
    const html = read(file);
    const head = html.split('</head>')[0];
    assert.match(head, new RegExp(`<title>[^<]*${title}`));
    assert.equal((head.match(/<title>/g) ?? []).length, 1);
    assert.equal((head.match(/rel="canonical"/g) ?? []).length, 1);
    assert.ok(head.includes(`rel="canonical" href="https://www.satxink.com${path}"`));
    assert.ok(head.includes(`property="og:url" content="https://www.satxink.com${path}"`));
    assert.match(head, /name="robots" content="index, follow/);
    assert.match(head, /name="description" content="[^"]+"/);
    assert.ok(html.includes(body));
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<div id="root"><\/div>|\/src\/|<!--seo-start-->/);
    for (const [, asset] of html.matchAll(/(?:src|href)="(\/(?:assets|media)\/[^"?#]+)"/g)) {
      assert.ok(existsSync(new URL(asset.slice(1), dist)), `Missing rendered asset: ${asset}`);
    }
  });
}

test('homepage states the Texas launch and artist Stripe connection with valid brand schema', () => {
  const html = read('index.html');
  assert.match(html, /<time dateTime="2026-09-20">September 20, 2026<\/time>/i);
  assert.match(html, /Texas launch/);
  assert.match(html, /Each artist connects their own Stripe account/);
  const json = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)?.[1];
  assert.ok(json);
  const schema = JSON.parse(json);
  assert.equal(schema['@context'], 'https://schema.org');
  assert.deepEqual(schema['@graph'].map(entity => entity['@type']), ['Organization', 'WebSite']);
  assert.doesNotMatch(json, /aggregateRating|LocalBusiness|TattooParlor/);
});

test('sitemap lists only canonical public pages and robots advertises that sitemap', () => {
  const sitemap = read('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls, pages.map(([, path]) => `https://www.satxink.com${path}`));
  assert.doesNotMatch(sitemap, /lastmod|priority|demo\.|\/404|\/dashboard|\/payment|\/signup/);
  assert.match(read('robots.txt'), /Allow: \/\s+Sitemap: https:\/\/www.satxink.com\/sitemap.xml/);
});

test('missing pages have noindex HTML and cannot inherit a homepage canonical', () => {
  const html = read('404.html');
  assert.match(html, /<title>Page Not Found \| SATX INK<\/title>/);
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.doesNotMatch(html, /rel="canonical"|application\/ld\+json/);
  assert.match(html, /no longer\s+available here/);
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.rewrites, undefined);
  assert.equal(config.cleanUrls, true);
});
