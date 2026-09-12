import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/marketing/MarketingSite.tsx', import.meta.url),
  'utf8',
);

test('hero leads with the live demo and an explicit sales conversation action', () => {
  assert.match(source, /Flash, booking requests, and deposits/);
  assert.match(source, /href="https:\/\/demo\.satxink\.com\/"/);
  assert.match(source, /Explore the demo/);
  assert.match(source, /href="#contact"/);
  assert.match(source, /Request a walkthrough/);
});

test('copy explains approval-first booking and separate portal scope', () => {
  const steps = readFileSync(new URL('../src/marketing/story/FlashStorySection.tsx', import.meta.url), 'utf8');
  assert.match(steps, /not an automatic booking/);
  assert.match(steps, /offered time/);
  assert.match(steps, /remaining tattoo balance is settled at the shop/);
  assert.match(source, /not an embedded plugin or a shared-login integration/);
  assert.match(source, /Portal profiles use your portal’s domain/);
});

test('pricing preserves amounts and discloses separate operating costs', () => {
  const pricing = readFileSync(new URL('../src/marketing/PricingSection.tsx', import.meta.url), 'utf8');
  assert.match(pricing, /\$500/);
  assert.match(pricing, /\$100/);
  assert.match(pricing, /Hosting & developer support/);
  assert.match(pricing, /Database usage and email delivery are additional costs paid by your shop/);
});

test('product recording autoplays inline without controls and retains its poster', () => {
  const component = readFileSync(new URL('../src/marketing/ViewportVideo.tsx', import.meta.url), 'utf8');
  const video = component.match(/<video\b[^>]*>/)[0];
  for (const attribute of ['autoPlay', 'muted', 'loop', 'playsInline']) {
    assert.match(video, new RegExp(`\\b${attribute}\\b`));
  }
  assert.doesNotMatch(video, /\bcontrols\b/);
  assert.match(source, /poster="\/media\/flash-marketplace-demo-poster\.jpg"/);
  assert.match(source, /src="\/media\/flash-marketplace-demo\.mp4"/);
});
