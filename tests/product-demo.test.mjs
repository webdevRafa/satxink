import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/marketing/MarketingSite.tsx', import.meta.url),
  'utf8',
);

test('hero leads with the live demo and an explicit sales conversation action', () => {
  assert.match(source, /Your artists\. Your bookings\./);
  assert.match(source, /href="https:\/\/demo\.satxink\.com\/"/);
  assert.match(source, /Explore the demo/);
  assert.match(source, /href="#contact"/);
  assert.match(source, /Talk about your shop/);
});

test('product recording is user controlled, lazy, and has a static fallback', () => {
  assert.match(source, /<video[\s\S]*?controls[\s\S]*?playsInline/);
  assert.match(source, /preload="none"/);
  assert.match(source, /poster="\/media\/flash-marketplace-demo-poster\.jpg"/);
  assert.match(source, /src="\/media\/flash-marketplace-demo\.mp4"/);
  assert.doesNotMatch(source, /<video[\s\S]*?autoPlay/);
});
