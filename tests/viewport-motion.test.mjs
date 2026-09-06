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
  attributes = new Map();
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
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
    enter(...nodes) { this.entries(nodes.map(target => ({ target, isIntersecting: true, intersectionRatio: 0.5 }))); }
    leave(...nodes) { this.entries(nodes.map(target => ({ target, isIntersecting: false, intersectionRatio: 0 }))); }
  }
  const targets = elements.map(element => ({ element, group: root, style: settings.menu ? 'blur' : 'fade' }));
  const environment = { document: doc, window: win, Observer };
  const dispose = createViewportMotion(root, targets, settings.menu ? { mobileMenu: true } : {}, environment);
  return { root, elements, targets, doc, reduced, mobile, win, environment, observers, observer: observers[0], dispose };
}

test('unseen content is pre-armed before paint without running offscreen animations', () => {
  const f = fixture();
  assert.equal(f.observer.observed.size, 3);
  assert.ok(f.elements.every(element => element.animations.length === 0));
  assert.ok(f.elements.every(element => element.hasAttribute('data-motion-pending')));
  f.observer.enter(f.elements[0]);
  assert.equal(f.elements[0].animations.length, 1);
  assert.equal(f.elements[1].animations.length, 0);
  f.dispose();
  assert.ok(f.elements.every(element => !element.hasAttribute('data-motion-pending')));
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

test('viewport edge contact does not start motion but positive-area entry starts exactly once', () => {
  const f = fixture(2);
  assert.deepEqual(f.observer.options.threshold, [0, 0.01]);
  f.observer.entries(f.elements.map(target => ({ target, isIntersecting: true, intersectionRatio: 0 })));
  assert.ok(f.elements.every(element => element.animations.length === 0));
  assert.ok(f.elements.every(element => element.hasAttribute('data-motion-pending')));
  f.observer.enter(...f.elements);
  f.observer.enter(...f.elements);
  assert.ok(f.elements.every(element => element.animations.length === 1));
  f.dispose();
});

test('an active item reaching zero-area edge contact immediately releases its animation', () => {
  const f = fixture(2);
  f.observer.enter(f.elements[0]);
  f.observer.entries(f.elements.map(target => ({ target, isIntersecting: true, intersectionRatio: 0 })));
  assert.equal(f.elements[0].animations[0].cancelled, true);
  assert.equal(f.elements[0].hasAttribute('data-motion-pending'), false);
  assert.equal(f.elements[1].animations.length, 0);
  assert.equal(f.elements[1].hasAttribute('data-motion-pending'), true);
  f.dispose();
});

test('initial rect measurement excludes edge contact and admits a viewport-spanning target', () => {
  const f = fixture(4);
  f.dispose();
  f.elements[0].rect = { top: 800, bottom: 900, left: 40, right: 240, width: 200, height: 100 };
  f.elements[1].rect = { top: -100, bottom: 0, left: 40, right: 240, width: 200, height: 100 };
  f.elements[2].rect = { top: 100, bottom: 200, left: 1200, right: 1400, width: 200, height: 100 };
  f.elements[3].rect = { top: -300, bottom: 1300, left: 40, right: 240, width: 200, height: 1600 };
  const cleanup = createViewportMotion(f.root, f.targets, {}, f.environment);
  assert.deepEqual(f.elements.map(element => element.animations.length), [0, 0, 0, 1]);
  cleanup();
});

test('entry order is stable with a bounded stagger and no delay for later isolated entries', () => {
  const f = fixture(8);
  f.observer.enter(...f.elements.slice(0, 7).reverse());
  assert.deepEqual(f.elements.slice(0, 7).map(e => e.animations[0].options.delay), [0, 60, 120, 180, 180, 180, 180]);
  f.observer.enter(f.elements[7]);
  assert.equal(f.elements[7].animations[0].options.delay, 0);
  f.dispose();
});

test('leaving cancels active and delayed animations, unobserves, and does not replay', () => {
  const f = fixture();
  f.observer.enter(...f.elements);
  f.observer.leave(f.elements[1]);
  assert.equal(f.elements[1].animations[0].cancelled, true);
  assert.equal(f.elements[1].hasAttribute('data-motion-pending'), false);
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
  assert.ok(f.elements.every(element => !element.hasAttribute('data-motion-pending')));
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
  assert.equal(f.elements[0].hasAttribute('data-motion-pending'), false);
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
  assert.ok(staticPage.elements.every(element => !element.hasAttribute('data-motion-pending')));
  staticPage.observer.enter(...staticPage.elements);
  assert.ok(staticPage.elements.every(element => element.animations.length === 0));
  const f = fixture();
  f.observer.enter(...f.elements);
  f.reduced.matches = true;
  f.reduced.emit('change');
  assert.ok(f.elements.every(element => element.animations[0].cancelled));
  assert.ok(f.elements.every(element => !element.hasAttribute('data-motion-pending')));
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
  assert.equal(f.elements[0].hasAttribute('data-motion-pending'), false);
  f.doc.activeElement = f.elements[1];
  f.observer.enter(f.elements[1]);
  assert.equal(f.elements[1].animations.length, 0);
  f.root.emit('focusin', f.elements[2]);
  f.observer.enter(f.elements[2]);
  assert.equal(f.elements[2].animations.length, 0);
  assert.ok(f.elements.every(element => !element.hasAttribute('data-motion-pending')));
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
  assert.ok(fallback.elements.slice(0, 2).every(element => !element.hasAttribute('data-motion-pending')));
  fallback.dispose();
});

test('partial observer setup failure restores all armed content', () => {
  const f = fixture();
  f.dispose();
  class BrokenObserver {
    observe() { throw new Error('observer setup failed'); }
    disconnect() {}
    unobserve() {}
  }
  const cleanup = createViewportMotion(f.root, f.targets, {}, { ...f.environment, Observer: BrokenObserver });
  assert.ok(f.elements.every(element => !element.hasAttribute('data-motion-pending')));
  for (const target of [f.root, f.doc, f.win, f.reduced]) assert.equal(target.listenerCount(), 0);
  cleanup();
});

test('older media-query APIs fall back to static content without throwing during cleanup', () => {
  const f = fixture();
  f.dispose();
  const legacyWindow = { ...f.win, matchMedia: () => ({ matches: false }) };
  const cleanup = createViewportMotion(f.root, f.targets, {}, { ...f.environment, window: legacyWindow });
  assert.ok(f.elements.every(element => !element.hasAttribute('data-motion-pending')));
  cleanup();
});

test('completion removes pending opacity before cancelling the held final frame', () => {
  const f = fixture(1);
  f.observer.enter(...f.elements);
  const element = f.elements[0];
  const animation = element.animations[0];
  assert.equal(animation.options.fill, 'both');
  animation.cancel = () => {
    assert.equal(element.hasAttribute('data-motion-pending'), false);
    animation.cancelled = true;
  };
  animation.finish();
  assert.equal(animation.cancelled, true);
});

test('mobile menu is faster, staggered, and cancels on desktop resizing', () => {
  const f = fixture(5, { menu: true });
  f.observer.enter(...f.elements);
  assert.deepEqual(f.elements.map(e => e.animations[0].options.delay), [0, 55, 110, 165, 220]);
  assert.equal(f.elements[0].animations[0].options.duration, 360);
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
  assert.deepEqual(f.elements.map(e => e.animations[1].options.delay), [0, 55, 110, 165, 220]);
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
  assert.ok(f.elements.every(element => !element.hasAttribute('data-motion-pending')));
  assert.equal(f.doc.listenerCount(), 0);
});

test('effects never alter geometry, and selected blur resolves fully to crisp text', () => {
  for (const style of ['fade', 'blur']) {
    const frames = motionKeyframes(style);
    assert.ok(frames.every(frame => !('transform' in frame) && !('translate' in frame) && !('scale' in frame)));
    assert.equal(frames.at(-1).opacity, 1);
  }
  assert.equal(motionKeyframes('blur')[0].filter, 'blur(3px)');
  assert.equal(motionKeyframes('blur').at(-1).filter, 'blur(0px)');
  assert.ok(motionKeyframes('fade').every(frame => !('filter' in frame)));
});

test('target discovery excludes 3D, live regions, their ancestors, and nested reveal units', () => {
  const root = new Element();
  const heading = new Element();
  heading.selectors.add('h2');
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
  assert.deepEqual(targets.map(target => target.style), ['blur', 'fade', 'fade']);
});
