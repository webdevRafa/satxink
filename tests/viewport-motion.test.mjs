import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/marketing/viewportMotion.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const { createViewportMotion, pageMotionTargets, motionKeyframes } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

class Events {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, target = this) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, target });
  }
  listenerCount() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
}
class Element extends Events {
  animations = [];
  rect = { top: 1000, bottom: 1100, left: 40, right: 240, width: 200, height: 100 };
  getBoundingClientRect() { return this.rect; }
  parentElement = null;
  selectors = new Set();
  descendants = [];
  contains(other) {
    for (let node = other; node; node = node.parentElement) if (node === this) return true;
    return false;
  }
  matches(selector) { return selector.split(',').some(s => this.selectors.has(s.trim())); }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
  querySelector(selector) { return this.descendants.find(node => node.matches(selector)) ?? null; }
  animate(keyframes, options) {
    const animation = {
      keyframes, options, cancelled: false, onfinish: null, oncancel: null,
      cancel() { this.cancelled = true; this.oncancel?.(); },
      finish() { this.onfinish?.(); },
    };
    this.animations.push(animation);
    return animation;
  }
}

function fixture(count = 3, settings = {}) {
  const root = new Element();
  const elements = Array.from({ length: count }, () => new Element());
  elements.forEach(element => { element.parentElement = root; });
  if (settings.initiallyVisible) elements.forEach(element => {
    element.rect = { ...element.rect, top: 100, bottom: 200 };
  });
  const doc = new Events();
  doc.hidden = settings.hidden ?? false;
  doc.activeElement = null;
  const reduced = new Events();
  reduced.matches = settings.reduced ?? false;
  const mobile = new Events();
  mobile.matches = settings.mobile ?? true;
  const win = new Events();
  win.innerHeight = 800;
  win.innerWidth = 1200;
  win.matchMedia = query => query.includes('reduced-motion') ? reduced : mobile;
  const observers = [];
  class Observer {
    observed = new Set();
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      observers.push(this);
    }
    observe(element) { this.observed.add(element); }
    unobserve(element) { this.observed.delete(element); }
    disconnect() { this.observed.clear(); }
    entries(entries) { this.callback(entries); }
    enter(...nodes) { this.entries(nodes.map(target => ({ target, isIntersecting: true, boundingClientRect: target.rect }))); }
    leave(...nodes) { this.entries(nodes.map(target => ({ target, isIntersecting: false, boundingClientRect: target.rect }))); }
  }
  const targets = elements.map(element => ({ element, group: root, style: 'rise' }));
  const environment = { document: doc, window: win, Observer };
  const dispose = createViewportMotion(root, targets, settings.menu ? { mobileMenu: true } : {}, environment);
  return { root, elements, targets, doc, reduced, mobile, win, environment, observers, observer: observers[0], dispose };
}

test('nothing animates until individual content enters the viewport', () => {
  const f = fixture();
  assert.equal(f.observer.observed.size, 3);
  assert.ok(f.elements.every(element => element.animations.length === 0));
  f.observer.enter(f.elements[0]);
  assert.equal(f.elements[0].animations.length, 1);
  assert.equal(f.elements[1].animations.length, 0);
  f.dispose();
});

test('initially visible hero or menu content starts synchronously without a visible flash', () => {
  for (const menu of [false, true]) {
    const f = fixture(3, { initiallyVisible: true, menu });
    assert.ok(f.elements.every(element => element.animations.length === 1));
    f.observer.enter(...f.elements);
    assert.ok(f.elements.every(element => element.animations.length === 1));
    f.dispose();
  }
});

test('entry translations move inward so animation cannot trigger its own viewport exit', () => {
  const f = fixture(2);
  f.elements[0].rect = { top: 795, bottom: 895, left: 40, right: 240, width: 200, height: 100 };
  f.elements[1].rect = { top: -95, bottom: 5, left: 40, right: 240, width: 200, height: 100 };
  f.observer.enter(...f.elements);
  assert.equal(f.elements[0].animations[0].keyframes[0].transform, 'translate3d(0, -20px, 0)');
  assert.equal(f.elements[1].animations[0].keyframes[0].transform, 'translate3d(0, 20px, 0)');
  // Visuals grow slightly outward instead of shrinking the intersecting edge away.
  assert.match(motionKeyframes('scale', { x: 1, y: -1 })[0].transform, /scale\(1\.02\)/);
  f.dispose();
});

test('horizontal edge entries and viewport-spanning visuals keep intersecting', () => {
  const f = fixture(3);
  f.targets[0].style = 'slide';
  f.targets[1].style = 'slide';
  f.targets[2].style = 'scale';
  f.elements[0].rect = { top: 100, bottom: 200, left: -195, right: 5, width: 200, height: 100 };
  f.elements[1].rect = { top: 100, bottom: 200, left: 1195, right: 1395, width: 200, height: 100 };
  f.elements[2].rect = { top: -300, bottom: 1300, left: 40, right: 240, width: 200, height: 1600 };
  f.observer.enter(...f.elements);
  assert.equal(f.elements[0].animations[0].keyframes[0].transform, 'translate3d(14px, 0, 0)');
  assert.equal(f.elements[1].animations[0].keyframes[0].transform, 'translate3d(-14px, 0, 0)');
  assert.equal(f.elements[2].animations[0].keyframes[0].transform, 'translate3d(0, -12px, 0) scale(1.02)');
  f.dispose();
});

test('entry order is stable with a bounded stagger and no delay for later isolated entries', () => {
  const f = fixture(8);
  f.observer.enter(...f.elements.slice(0, 7).reverse());
  assert.deepEqual(f.elements.slice(0, 7).map(e => e.animations[0].options.delay), [0, 75, 150, 225, 300, 300, 300]);
  f.observer.enter(f.elements[7]);
  assert.equal(f.elements[7].animations[0].options.delay, 0);
  f.dispose();
});

test('leaving cancels active and delayed animations, unobserves, and does not replay', () => {
  const f = fixture();
  f.observer.enter(...f.elements);
  f.observer.leave(f.elements[1]);
  assert.equal(f.elements[1].animations[0].cancelled, true);
  assert.equal(f.observer.observed.has(f.elements[1]), false);
  f.observer.enter(f.elements[1]);
  assert.equal(f.elements[1].animations.length, 1);
  f.dispose();
});

test('completed animations release their effects and all listeners after the last reveal', () => {
  const f = fixture();
  f.observer.enter(...f.elements);
  f.elements.forEach(element => element.animations[0].finish());
  assert.ok(f.elements.every(element => element.animations[0].cancelled));
  assert.equal(f.observer.observed.size, 0);
  for (const eventTarget of [f.root, f.doc, f.win, f.reduced]) assert.equal(eventTarget.listenerCount(), 0);
  f.dispose();
});

test('hidden tabs cancel active work and resume observing only unseen content', () => {
  const f = fixture();
  f.observer.enter(f.elements[0]);
  f.doc.hidden = true;
  f.doc.emit('visibilitychange');
  assert.equal(f.elements[0].animations[0].cancelled, true);
  assert.equal(f.observer.observed.size, 0);
  f.observer.enter(f.elements[1]);
  assert.equal(f.elements[1].animations.length, 0);
  f.doc.hidden = false;
  f.doc.emit('visibilitychange');
  assert.equal(f.observer.observed.size, 2);
  assert.equal(f.observer.observed.has(f.elements[0]), false);
  f.dispose();
});

test('initial reduced motion stays static and a runtime preference change cancels everything', () => {
  const staticPage = fixture(3, { reduced: true });
  assert.equal(staticPage.observer.observed.size, 0);
  staticPage.observer.enter(...staticPage.elements);
  assert.ok(staticPage.elements.every(element => element.animations.length === 0));
  const f = fixture();
  f.observer.enter(...f.elements);
  f.reduced.matches = true;
  f.reduced.emit('change');
  assert.ok(f.elements.every(element => element.animations[0].cancelled));
  assert.equal(f.observer.observed.size, 0);
  assert.equal(f.reduced.listenerCount(), 0);
});

test('keyboard focus immediately settles active or unseen content', () => {
  const f = fixture();
  const link = new Element();
  link.parentElement = f.elements[0];
  f.observer.enter(f.elements[0]);
  f.root.emit('focusin', link);
  assert.equal(f.elements[0].animations[0].cancelled, true);
  f.doc.activeElement = f.elements[1];
  f.observer.enter(f.elements[1]);
  assert.equal(f.elements[1].animations.length, 0);
  f.root.emit('focusin', f.elements[2]);
  f.observer.enter(f.elements[2]);
  assert.equal(f.elements[2].animations.length, 0);
});

test('missing observers or animation support leave readable static content', () => {
  const f = fixture();
  f.dispose();
  const cleanup = createViewportMotion(f.root, f.targets, {}, { ...f.environment, Observer: undefined });
  cleanup();
  const fallback = fixture();
  fallback.elements[0].animate = undefined;
  fallback.elements[1].animate = () => { throw new Error('unsupported'); };
  fallback.observer.enter(...fallback.elements);
  assert.equal(fallback.observer.observed.size, 1);
  fallback.dispose();
});

test('mobile menu is faster, staggered, and cancels on desktop resizing', () => {
  const f = fixture(5, { menu: true });
  f.observer.enter(...f.elements);
  assert.deepEqual(f.elements.map(e => e.animations[0].options.delay), [0, 65, 130, 195, 260]);
  assert.equal(f.elements[0].animations[0].options.duration, 380);
  f.mobile.matches = false;
  f.mobile.emit('change');
  assert.ok(f.elements.every(element => element.animations[0].cancelled));
  assert.equal(f.observer.observed.size, 0);
  assert.equal(f.mobile.listenerCount(), 0);
});

test('menu close/unmount cleans up and reopening starts a fresh stagger', () => {
  const f = fixture(5, { menu: true });
  f.observer.enter(...f.elements);
  f.dispose();
  assert.ok(f.elements.every(element => element.animations[0].cancelled));
  assert.equal(f.observer.observed.size, 0);
  const closeAgain = createViewportMotion(f.root, f.targets, { mobileMenu: true }, f.environment);
  f.observers[1].enter(...f.elements);
  assert.deepEqual(f.elements.map(e => e.animations[1].options.delay), [0, 65, 130, 195, 260]);
  closeAgain();
  for (const target of [f.root, f.doc, f.win, f.reduced, f.mobile]) assert.equal(target.listenerCount(), 0);
});

test('printing and effect cleanup remove all animation effects and stale callbacks', () => {
  const f = fixture();
  f.observer.enter(...f.elements);
  f.win.emit('beforeprint');
  f.dispose();
  f.observer.enter(...f.elements);
  assert.ok(f.elements.every(element => element.animations.length === 1 && element.animations[0].cancelled));
  assert.equal(f.doc.listenerCount(), 0);
});

test('styles only animate opacity and transform and finish at the unstyled position', () => {
  for (const style of ['rise', 'slide', 'scale']) {
    const frames = motionKeyframes(style);
    assert.deepEqual(Object.keys(frames[0]).sort(), ['opacity', 'transform']);
    assert.deepEqual(frames[1], { opacity: 1, transform: 'none' });
  }
});

test('target discovery excludes 3D, live regions, their ancestors, and nested reveal units', () => {
  const root = new Element();
  const heading = new Element();
  const viewer = new Element(); viewer.selectors.add('.studio-viewer');
  const caption = new Element(); caption.parentElement = viewer;
  const containingViewer = new Element(); containingViewer.descendants = [viewer];
  const status = new Element(); status.selectors.add("[role='status']");
  const list = new Element(); list.selectors.add('li');
  const listParagraph = new Element(); listParagraph.parentElement = list;
  const visual = new Element(); visual.selectors.add('.owner-visual');
  root.querySelectorAll = selector => {
    for (const required of ['main h1', 'main h2', 'main h3', 'main p', 'main li', 'main .faq-list details', '.site-footer > *']) {
      assert.ok(selector.includes(required));
    }
    return [heading, caption, containingViewer, status, list, listParagraph, visual];
  };
  const targets = pageMotionTargets(root);
  assert.deepEqual(targets.map(target => target.element), [heading, list, visual]);
  assert.deepEqual(targets.map(target => target.style), ['rise', 'slide', 'scale']);
});
