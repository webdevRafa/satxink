import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const policySource = readFileSync(new URL('../src/marketing/heroPolicy.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const policy = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const desktop = { reducedMotion: false, saveData: false, effectiveType: '4g', memory: 8, cores: 8, width: 1440 };

test('capable desktop can automatically load 3D', () => assert.equal(policy.shouldAutoLoad3D(desktop), true));
for (const [name, override] of [
  ['reduced motion', { reducedMotion: true }], ['data saver', { saveData: true }],
  ['slow 2G', { effectiveType: 'slow-2g' }], ['2G', { effectiveType: '2g' }],
  ['3G', { effectiveType: '3g' }], ['4 GB memory', { memory: 4 }],
  ['four cores', { cores: 4 }], ['phone', { width: 390 }],
]) test(`${name} defaults to a poster`, () => assert.equal(policy.shouldAutoLoad3D({ ...desktop, ...override }), false));
test('missing hardware hints are safe to evaluate', () => assert.equal(policy.shouldAutoLoad3D({ reducedMotion: false, width: 1200 }), true));
test('camera selection follows the exact picture breakpoint', () => {
  assert.equal(policy.heroViewForWidth(599).camera, 'Hero_Mobile');
  assert.equal(policy.heroViewForWidth(600).camera, 'Hero_Copy_Right');
});
test('wide FOV matches the authored Blender poster', () => {
  assert.ok(Math.abs(policy.posterMatchedFieldOfView(35.1154, 16 / 9, 21 / 9, 21 / 9) - 27.1075) < .001);
});
test('portrait FOV uses Blender AUTO sensor fit', () => {
  assert.ok(Math.abs(policy.posterMatchedFieldOfView(22.4578, 16 / 9, .8, .8) - 38.8801) < .001);
});
test('capped-height mobile canvas matches object-fit cover', () => {
  const native = policy.posterMatchedFieldOfView(22.4578, 16 / 9, .8, .8);
  const capped = policy.posterMatchedFieldOfView(22.4578, 16 / 9, .8, 1.1);
  assert.ok(capped < native);
  assert.ok(Math.abs(Math.tan(native * Math.PI / 360) * .8 - Math.tan(capped * Math.PI / 360) * 1.1) < 1e-10);
});
test('only sustained low frame rate causes an automatic fallback', () => {
  assert.equal(policy.isSustainedLowFrameRate(5, 500), false);
  assert.equal(policy.isSustainedLowFrameRate(59, 3000), true);
  assert.equal(policy.isSustainedLowFrameRate(60, 3000), false);
  assert.equal(policy.isSustainedLowFrameRate(90, 3000), false);
});
test('shipped GLB is self-contained and retains its camera animation', () => {
  const data = readFileSync(new URL('../public/studio/satx-ink-studio.glb', import.meta.url));
  assert.equal(data.readUInt32LE(0), 0x46546c67);
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  const gltf = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  assert.equal(gltf.cameras.length, 4);
  assert.ok(gltf.images.every(image => Number.isInteger(image.bufferView) && !image.uri));
  assert.ok(gltf.animations.some(animation => animation.name === 'Hero_Ambient_Drift_12s'));
  const report = JSON.parse(readFileSync(new URL('../public/studio/asset-report.json', import.meta.url), 'utf8'));
  assert.equal(report.bytes, data.length);
  assert.equal(report.caption_revision.sign_caption, 'TATTOO STUDIO SOFTWARE');
  assert.equal(report.checks.gallery_caption_removed, true);
});
test('web posters have the expected format and all approved artwork is present', () => {
  for (const name of ['desktop', 'wide', 'mobile']) {
    const data = readFileSync(new URL(`../public/studio/satx-ink-hero-${name}.webp`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WEBP');
    assert.ok(data.length < 100_000);
  }
  for (let index = 1; index <= 3; index++) assert.match(readFileSync(new URL(`../public/studio/flash-0${index}.svg`, import.meta.url), 'utf8'), /<svg/);
});
test('production output keeps 3D lazy and the legacy backend out of the public bundle', () => {
  const output = new URL('../dist/assets/', import.meta.url);
  const files = readdirSync(output);
  assert.ok(files.some(file => file.startsWith('studioRenderer-') && file.endsWith('.js')));
  const index = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.ok(!/modulepreload[^>]+studioRenderer/.test(index));
  assert.ok(!index.includes('satx-ink-studio.glb'));
  for (const file of files.filter(file => file.endsWith('.js'))) {
    assert.doesNotMatch(readFileSync(new URL(file, output), 'utf8'), /identitytoolkit\.googleapis|firestore\.googleapis|firebaseapp\.com|cloudfunctions\.net/);
  }
  const sitemap = readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
  assert.doesNotMatch(sitemap, /\/artists|\/flash|\/dashboard|\/signup/);
});
