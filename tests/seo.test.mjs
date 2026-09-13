import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const dist = new URL('../dist/', import.meta.url);
const read = file => readFileSync(new URL(file, dist), 'utf8');
const pages = [
  ['index.html', '/', 'Tattoo Shop Software', 'Flash, booking requests, and deposits'],
  ['privacy.html', '/privacy', 'Privacy Policy', 'When you get in touch'],
  ['terms.html', '/terms', 'Website Information', 'Your installation'],
  ['tattoo-shop-management-software.html', '/tattoo-shop-management-software', 'Tattoo Shop Management Software', 'Keep hours, events and shop information current.'],
  ['tattoo-flash-booking-software.html', '/tattoo-flash-booking-software', 'Tattoo Flash Booking Software', 'Upload a single design or a complete flash sheet.'],
  ['tattoo-shop-websites.html', '/tattoo-shop-websites', 'Tattoo Shop Websites', 'Choose where the experience lives.'],
  ['pricing.html', '/pricing', 'Tattoo Shop Software Pricing', 'Allow for the services your shop uses.'],
  ['texas.html', '/texas', 'Tattoo Shop Software in Texas', 'Starting with tattoo shops in Texas.'],
  ['about.html', '/about', 'About SATX INK', 'Artists make the booking decisions.'],
  ['guides/launch-a-tattoo-flash-drop.html', '/guides/launch-a-tattoo-flash-drop', 'How to Launch a Tattoo Flash Drop', 'Prepare the sheet and individual designs.'],
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

test('all public page links and section anchors resolve to emitted content', () => {
  const documents = new Map(pages.map(([file, path]) => [path, read(file)]));
  const titles = new Set();
  const descriptions = new Set();
  for (const [path, html] of documents) {
    titles.add(html.match(/<title>([^<]+)<\/title>/)[1]);
    descriptions.add(html.match(/name="description" content="([^"]+)"/)[1]);
    for (const [, href] of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
      const url = new URL(href.replaceAll('&amp;', '&'), `https://www.satxink.com${path}`);
      if (url.origin !== 'https://www.satxink.com') continue;
      const target = documents.get(url.pathname);
      assert.ok(target, `${path} links to missing page ${url.pathname}`);
      if (url.hash) assert.ok(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${path} has a broken anchor ${href}`);
    }
  }
  assert.equal(titles.size, pages.length, 'Each public page needs a distinct title');
  assert.equal(descriptions.size, pages.length, 'Each public page needs a distinct description');
});

test('new pages are linked from home and have breadcrumb schema matching their visible identity', () => {
  const home = read('index.html');
  for (const [file, path] of pages.slice(3)) {
    assert.ok(home.includes(`href="${path}"`), `${path} is orphaned from the homepage`);
    const html = read(file);
    const json = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)[1];
    const schema = JSON.parse(json);
    assert.equal(schema['@type'], 'BreadcrumbList');
    assert.equal(schema.itemListElement[1].item, `https://www.satxink.com${path}`);
    assert.ok(html.includes(`aria-current="page">${schema.itemListElement[1].name.replaceAll('&', '&amp;')}</span>`));
  }
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(!config.redirects.some(redirect => redirect.source === '/about'));
});

test('pricing is consistent and the portal comparison preserves the existing website distinction', () => {
  const pricing = read('pricing.html');
  assert.match(pricing, /\$500/);
  assert.match(pricing, /\$100/);
  assert.match(pricing, /Database usage and email delivery are additional costs paid by your shop/);
  assert.match(pricing, /href="\/#contact"/);
  const websites = read('tattoo-shop-websites.html');
  assert.match(websites, /<table>/);
  assert.match(websites, /not an embedded plugin or a shared-login integration/);
});

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
