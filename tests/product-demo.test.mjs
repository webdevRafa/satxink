import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/marketing/MarketingSite.tsx', import.meta.url),
  'utf8',
);

test('hero leads with the live demo and an explicit sales conversation action', () => {
  assert.match(source, /A dedicated system for/);
  assert.match(source, /href="https:\/\/demo\.satxink\.com\/"/);
  assert.match(source, /Explore the demo/);
  assert.match(source, /href="#contact"/);
  assert.match(source, /Talk about your shop/);
});

test('product recording autoplays inline without controls and retains its poster', () => {
  const video = source.match(/<video\b[^>]*>/)[0];
  for (const attribute of ['autoPlay', 'muted', 'loop', 'playsInline']) {
    assert.match(video, new RegExp(`\\b${attribute}\\b`));
  }
  assert.doesNotMatch(video, /\bcontrols\b/);
  assert.match(source, /poster="\/media\/flash-marketplace-demo-poster\.jpg"/);
  assert.match(source, /src="\/media\/flash-marketplace-demo\.mp4"/);
});
