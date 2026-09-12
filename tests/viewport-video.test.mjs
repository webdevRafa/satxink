import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('viewport videos mount only in view, release media on cleanup, and respect hidden tabs', async () => {
  const effects = [];
  let active = false;
  let callback;
  let disconnected = false;
  const listeners = new Map();
  const calls = [];
  let rect = { width: 353, height: 650, top: 900, bottom: 1550, left: 0, right: 353 };
  const element = { getBoundingClientRect: () => rect };
  const media = {
    play: () => { calls.push('play'); return Promise.resolve(); },
    pause: () => calls.push('pause'),
    removeAttribute: name => calls.push(`remove:${name}`),
    load: () => calls.push('load'),
  };
  let refTarget = element;
  const hooks = {
    useRef: () => ({ current: refTarget }),
    useState: initial => typeof initial === 'function' ? [initial(), () => {}] : [active, value => { active = value; }],
    useEffect: effect => effects.push(effect),
  };
  const document = { hidden: false,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  const window = { innerHeight: 800, innerWidth: 1200, addEventListener() {}, removeEventListener() {} };
  class Observer {
    constructor(fn) { callback = fn; }
    observe(target) { assert.equal(target, element); }
    disconnect() { disconnected = true; }
  }
  const source = readFileSync(new URL('../src/marketing/ViewportVideo.tsx', import.meta.url), 'utf8')
    .replace(/import .* from "react";/, 'const { useEffect, useRef, useState } = hooks;')
    .replace('export function ViewportVideo', 'function ViewportVideo');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022,
  } });
  const React = { createElement: (type, props, ...children) => ({ type, props, children }) };
  const { ViewportVideo, ActiveVideo } = new Function('hooks', 'React', 'document', 'window', 'IntersectionObserver',
    `${outputText}; return { ViewportVideo, ActiveVideo };`)(hooks, React, document, window, Observer);
  const props = { src: '/test.mp4', poster: '/test.jpg', width: 720, height: 1326, label: 'Demo' };
  assert.equal(ViewportVideo(props).children[0].type, 'img');
  const cleanup = effects.pop()();
  assert.equal(active, false);
  rect = { ...rect, top: 100, bottom: 750 };
  callback([{ isIntersecting: true, intersectionRect: { width: 353, height: 650 } }]);
  assert.equal(active, true);
  assert.equal(ViewportVideo(props).children[0].type, ActiveVideo);
  document.hidden = true;
  listeners.get('visibilitychange')();
  assert.equal(active, false);
  document.hidden = false;
  listeners.get('visibilitychange')();
  assert.equal(active, true);
  callback([{ isIntersecting: true, intersectionRect: { width: 353, height: 0 } }]);
  assert.equal(active, false);
  assert.equal(ViewportVideo(props).children[0].type, 'img');
  refTarget = media;
  ActiveVideo(props);
  const release = effects.pop()();
  assert.equal(media.src, '/test.mp4');
  assert.equal(media.muted, true);
  release();
  assert.deepEqual(calls, ['play', 'pause', 'remove:src', 'load']);
  cleanup();
  assert.equal(disconnected, true);
  assert.equal(listeners.size, 0);
});
