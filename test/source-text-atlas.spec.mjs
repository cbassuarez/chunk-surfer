import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sourceTextAtlasInputs, sourceTextAtlasCacheKey, planSourceTextAtlas, paintSourceTextAtlas, sourceTextQuadMatrix } from '../src/render/source-text-atlas.js';
import { WORLD_LETTERING_FONT_FILES, ensureWorldLetteringFonts, worldLetteringFontsStatus } from '../src/render/world-lettering-fonts.js';

class MeasureContext {
  font = '10px test'; fontKerning = 'auto'; textBaseline = 'middle'; textAlign = 'center';
  drawn = []; stack = [];
  save() { this.stack.push({ font: this.font, fontKerning: this.fontKerning, textBaseline: this.textBaseline, textAlign: this.textAlign }); }
  restore() { Object.assign(this, this.stack.pop()); }
  measureText(text) {
    const size = parseFloat(this.font), width = [...text].length * size * .6;
    return { width, actualBoundingBoxLeft: text.startsWith('j') ? 1.25 : 0,
      actualBoundingBoxRight: width + (text.endsWith('f') ? 1.5 : 0),
      actualBoundingBoxAscent: size * .8, actualBoundingBoxDescent: size * .2 };
  }
  clearRect() {}
  fillText(text, x, y) { this.drawn.push({ text, x, y }); }
}

// Different redaction is different copy, even when it carries the same sourceID.
const corpus = ['  exact(source); ', 'raw █ omission', 'duplicate', 'jfoverhangf'];
const instances = [{ text: 'duplicate' }, { text: 'literal required route', interactiveId: 'exit' }, { text: 'raw OMITTED omission', sourceId: 'same' }];
const input = sourceTextAtlasInputs(corpus, instances);
assert.equal(input.length, 6);
assert.equal(input.find(entry => entry.text === 'duplicate').priority, 1);
assert.equal(input.find(entry => entry.text === 'literal required route').priority, 2);
assert.ok(input.some(entry => entry.text === '  exact(source); '), 'indentation and trailing spaces survive');
assert.notEqual(sourceTextAtlasCacheKey(corpus, instances), sourceTextAtlasCacheKey(corpus, instances.slice(0, -1)), 'resident variant changes cannot reuse stale glyphs');
assert.notEqual(sourceTextAtlasCacheKey(corpus, instances), sourceTextAtlasCacheKey(corpus, instances, { role: 'monoBold' }), 'real font face is part of atlas identity');

const ctx = new MeasureContext();
const plan = planSourceTextAtlas(ctx, { corpus, instances, size: 256 });
assert.equal(plan.requested, 6); assert.equal(plan.accepted, 6); assert.equal(plan.omitted.length, 0);
assert.equal(plan.bytes, 256 * 256 * 4);
assert.equal(plan.gpuBytesWithMipmaps, (4 * 256 * 256 - 1) * 4 / 3, 'GPU cost includes the production mip chain');
assert.equal(ctx.font, '10px test', 'measurement restores the caller Canvas state');
for (const [text, entry] of plan.entries) {
  assert.equal(entry.text, text); assert.equal(entry.lines.map(line => line.text).join('\n'), text, 'atlas allocation never edits source');
  assert.ok(entry.x >= 0 && entry.y >= 0 && entry.x + entry.width <= plan.size && entry.y + entry.height <= plan.size);
  for (const other of plan.entries.values()) {
    if (entry === other) continue;
    assert.ok(entry.x + entry.width <= other.x || other.x + other.width <= entry.x || entry.y + entry.height <= other.y || other.y + other.height <= entry.y, 'allocated rectangles do not overlap');
  }
  assert.ok(entry.uv.every(value => value >= 0 && value <= 1));
}
const overhang = plan.entries.get('jfoverhangf');
assert.ok(overhang.contentWidth >= overhang.lines[0].left + overhang.lines[0].right, 'ink bearings are included,not merely text advance');
paintSourceTextAtlas(ctx, plan);
assert.deepEqual(ctx.drawn.map(row => row.text).sort(), input.map(entry => entry.text).sort(), 'every exact allocated string is actually painted');

const overflow = planSourceTextAtlas(new MeasureContext(), {
  corpus: Array.from({ length: 30 }, (_, i) => `unused long base row ${i}`),
  instances: [{ text: 'EXIT', interactiveId: 'exit' }, { text: 'RESIDENT' }],
  size: 32, minFont: 8, maxFont: 8,
});
assert.equal(overflow.entries.has('EXIT'), true, 'interactive copy gets capacity before unused corpus');
assert.equal(overflow.interactiveOmissions, 0);
assert.ok(overflow.omitted.length > 0, 'a true capacity failure is reported instead of clipping ink');
assert.ok(overflow.omitted.every(entry => entry.reason), 'each omission explains its failure');

// Rotated quads keep their translation and never exceed their authored bounds.
const matrix = new Float32Array([0, 0, -8, 0, 0, .5, 0, 0, 1, 0, 0, 0, 19, 3, -9, 1]);
const before = [...matrix], fitted = sourceTextQuadMatrix(matrix, { aspect: 4 });
assert.deepEqual([...matrix], before, 'fitting does not mutate shared architecture matrices');
assert.deepEqual([...fitted.slice(12)], [...matrix.slice(12)]);
assert.ok(Math.hypot(...fitted.slice(0, 3)) <= 8 && Math.hypot(...fitted.slice(4, 7)) <= .5);
assert.ok(Math.abs(Math.hypot(...fitted.slice(0, 3)) / Math.hypot(...fitted.slice(4, 7)) - 4) < 1e-6, 'glyph aspect survives the real world transform');

// Font distribution bytes match the existing reviewed source files.
for (const face of WORLD_LETTERING_FONT_FILES) {
  const bytes = readFileSync(`public/assets/fonts/${face.file}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), face.sha256);
  assert.deepEqual(bytes, readFileSync(`assets/fonts/${face.file}`));
}
assert.ok(readFileSync('public/assets/fonts/LICENSE.urw-base35.txt', 'utf8').includes('GNU AFFERO'));

// Font readiness is a real asynchronous gate,not a CSS fallback existence check.
const fontSet = { added: [], add(face) { this.added.push(face); } }, ownerDocument = { fonts: fontSet };
let complete;
const pending = new Promise(resolve => { complete = resolve; });
class Font { constructor(family, source) { this.family = family; this.source = source; } async load() { await pending; return this; } }
const loading = ensureWorldLetteringFonts({ ownerDocument, FontFaceClass: Font, assetUrl: p => `https://test.invalid/${p}` });
assert.equal(worldLetteringFontsStatus(ownerDocument).ready, false);
assert.equal(worldLetteringFontsStatus(ownerDocument).pending, true);
assert.equal(ensureWorldLetteringFonts({ ownerDocument, FontFaceClass: Font }), loading, 'concurrent bakers share one load');
complete(); const loaded = await loading;
assert.equal(loaded.ready, true); assert.equal(fontSet.added.length, WORLD_LETTERING_FONT_FILES.length);
assert.equal(worldLetteringFontsStatus(ownerDocument).ready, true);
const failedOwner = { fonts: { add() {} } };
class FailedFont { async load() { throw new Error('font unavailable'); } }
await assert.rejects(ensureWorldLetteringFonts({ ownerDocument: failedOwner, FontFaceClass: FailedFont }), /font load failed/);
assert.equal(worldLetteringFontsStatus(failedOwner).ready, false, 'failed loads never claim pinned typography');

console.log('Source atlas lossless allocation,aspect,priority and font-loading contracts pass');
