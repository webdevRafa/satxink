import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/marketing/headerCta.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const { createHeaderCtaReveal, HEADER_CTA_DELAY_MS } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

class RevealHost extends EventTarget {
  now = 0;
  nextId = 0;
  timers = new Map();
  scrollListeners = new Set();
  addEventListener(type, callback, options) {
    if (type === 'scroll') this.scrollListeners.add(callback);
    super.addEventListener(type, callback, options);
  }
  removeEventListener(type, callback) {
    if (type === 'scroll') this.scrollListeners.delete(callback);
    super.removeEventListener(type, callback);
  }
  setTimeout(callback, delay) {
    const id = this.nextId++;
    this.timers.set(id, { callback, due: this.now + delay });
    return id;
  }
  clearTimeout(id) { this.timers.delete(id); }
  advance(ms) {
    this.now += ms;
    for (const [id, timer] of this.timers) {
      if (timer.due <= this.now) {
        this.timers.delete(id);
        timer.callback();
      }
    }
  }
  scroll() { this.dispatchEvent(new Event('scroll')); }
}

function fixture() {
  const host = new RevealHost();
  let reveals = 0;
  const controller = createHeaderCtaReveal(() => { reveals++; }, host);
  return { host, controller, reveals: () => reveals };
}

test('the navbar CTA stays hidden on an idle page, with no running timer', () => {
  const f = fixture();
  f.host.advance(60_000);
  assert.equal(f.reveals(), 0);
  assert.equal(f.host.timers.size, 0);
  f.controller.dispose();
});

test('the first scroll reveals the CTA only after the full 12-second delay', () => {
  const f = fixture();
  assert.equal(HEADER_CTA_DELAY_MS, 12_000);
  f.host.scroll();
  assert.equal(f.host.scrollListeners.size, 0);
  f.host.advance(11_999);
  assert.equal(f.reveals(), 0);
  f.host.advance(1);
  assert.equal(f.reveals(), 1);
  assert.equal(f.host.timers.size, 0);
  f.controller.dispose();
});

test('opening the mobile menu starts the delay without needing a scroll', () => {
  const f = fixture();
  f.controller.engage();
  f.host.advance(11_999);
  assert.equal(f.reveals(), 0);
  f.host.advance(1);
  assert.equal(f.reveals(), 1);
  f.controller.dispose();
});

test('repeated scrolling or menu openings neither restart nor duplicate the delay', () => {
  const f = fixture();
  f.host.scroll();
  f.host.advance(6_000);
  f.controller.engage();
  f.host.scroll();
  assert.equal(f.host.timers.size, 1);
  f.host.advance(6_000);
  assert.equal(f.reveals(), 1);
  f.controller.engage();
  f.host.advance(60_000);
  assert.equal(f.reveals(), 1);
  assert.equal(f.host.timers.size, 0);
  f.controller.dispose();
});

test('unmount before engagement removes the scroll listener and prevents scheduling', () => {
  const f = fixture();
  f.controller.dispose();
  f.host.scroll();
  f.controller.engage();
  assert.equal(f.host.scrollListeners.size, 0);
  assert.equal(f.host.timers.size, 0);
  assert.equal(f.reveals(), 0);
});

test('unmount during the delay cancels the pending reveal, including timer ID zero', () => {
  const f = fixture();
  f.controller.engage();
  f.host.advance(6_000);
  f.controller.dispose();
  f.controller.dispose();
  assert.equal(f.host.timers.size, 0);
  f.host.advance(60_000);
  assert.equal(f.reveals(), 0);
});

test('effect cleanup and remount leave only the current reveal active', () => {
  const f = fixture();
  f.host.scroll();
  f.controller.dispose();
  let currentReveals = 0;
  const current = createHeaderCtaReveal(() => { currentReveals++; }, f.host);
  f.host.scroll();
  f.host.advance(12_000);
  assert.equal(f.reveals(), 0);
  assert.equal(currentReveals, 1);
  current.dispose();
  assert.equal(f.host.scrollListeners.size, 0);
  assert.equal(f.host.timers.size, 0);
});
