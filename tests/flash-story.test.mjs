import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/marketing/story/storyModel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { storyFrame, eligibleForStory } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const asset = path => new URL(`../public/media/flash-story/${path}`, import.meta.url);
const manifest = JSON.parse(readFileSync(asset('scene-manifest.json')));

test('motion policy keeps narrow, short, reduced-motion, and data-saver screens static', () => {
  assert.equal(eligibleForStory(1440, 900, false, false), true);
  for (const values of [[390, 844, false, false], [1440, 600, false, false], [1440, 900, true, false], [1440, 900, false, true]]) assert.equal(eligibleForStory(...values), false);
});

test('forward and reverse scroll use complete deterministic poses and finite interpolation', () => {
  for (const chapter of ['collection', 'booking']) {
    const forward = Array.from({ length: 101 }, (_, i) => storyFrame(chapter, i / 100));
    for (let i = 100; i >= 0; i--) {
      const frame = storyFrame(chapter, i / 100);
      assert.deepEqual(frame, forward[i]);
      assert.ok(frame.mix >= 0 && frame.mix <= 1);
      for (const pose of [frame.from, frame.to]) {
        assert.ok(manifest.cameras[pose].desktop.verticalSpan > 0);
        for (const name of manifest.nodeNames) {
          const transform = manifest.poses[pose][name];
          assert.equal(transform.position.length, 3);
          assert.ok([...transform.position, ...transform.rotationDegrees, ...transform.scale].every(Number.isFinite));
        }
      }
    }
  }
});

test('card extraction and source texture swap happen at the same boundary in both directions', () => {
  assert.equal(storyFrame('collection', .399999).extracted, false);
  assert.equal(storyFrame('collection', .4).extracted, true);
  assert.equal(storyFrame('collection', .4).from, 'extraction-start');
  assert.equal(storyFrame('collection', .399999).from, 'sheet-lift');
  assert.equal(storyFrame('collection', 1).to, 'online-collection');
  assert.equal(storyFrame('booking', 1).to, 'deposit');
});

test('production GLB preserves semantic nodes, hinge hierarchy, and small transfer budget', () => {
  const buffer = readFileSync(asset('portfolio.glb'));
  assert.equal(buffer.toString('utf8', 0, 4), 'glTF');
  assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.length);
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)));
  for (const name of manifest.nodeNames) assert.ok(json.nodes.find(n => n.name === name), name);
  const hinge = json.nodes.find(n => n.name === 'Portfolio_FrontPivot');
  assert.ok(hinge.children.map(i => json.nodes[i].name).includes('Brand_Decal'));
  assert.deepEqual(json.extensionsRequired ?? [], []);
  assert.ok(buffer.length + statSync(asset('sheet-extracted.jpg')).size < 2_000_000);
});

test('every illustrated step has desktop and mobile fallbacks, and both real videos remain', () => {
  for (const pose of ['closed-portfolio', 'sheet-lift', 'extraction-start', 'online-collection', 'request', 'artist-review', 'artist-offer', 'deposit']) {
    for (const suffix of ['', '-480']) assert.ok(statSync(asset(`${pose}${suffix}.webp`)).size < 150_000);
  }
  const page = readFileSync(new URL('../src/marketing/MarketingSite.tsx', import.meta.url), 'utf8');
  assert.match(page, /src="\/media\/flash-marketplace-demo.mp4"/);
  assert.match(page, /src="\/media\/artist-flash-demo.mp4"/);
  assert.ok(page.indexOf('Beyond the appointment') < page.indexOf('id="your-setup"'));
});
