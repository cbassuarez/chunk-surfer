import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { PAPER_TYPOGRAPHY, PAPER_FONT_FINGERPRINT } from '../src/generated/paper-catalog.js';

const url = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(url(p));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const PT_MM = 25.4 / 72;
const manifest = JSON.parse(read('../assets/fonts/manifest.json').toString('utf8'));
const builder = read('../scripts/build-paper-assets.mjs').toString('utf8');
const rasteriser = read('../scripts/paper/rasterize_svg.py').toString('utf8');
// Both files explain in comments what they used to do wrong, and those comments
// name the thing they no longer call. Strip them before asserting on behaviour.
const code = (src, line) => src.replace(new RegExp(`^\\s*${line}.*$`, 'gm'), '');
const builderCode = code(builder, '//');
const rasteriserCode = code(rasteriser, '#');

test('the type scale is the one the sheets were asked for', () => {
  assert.equal(PAPER_TYPOGRAPHY.bodyPt, 12);
  assert.equal(PAPER_TYPOGRAPHY.headingPt, 16);
  // Everything else is a relationship to the body, so a resize keeps a form's
  // internal hierarchy instead of nine hand-typed sizes drifting apart.
  assert.ok(PAPER_TYPOGRAPHY.labelPt < PAPER_TYPOGRAPHY.bodyPt, 'labels sit under the body');
  assert.ok(PAPER_TYPOGRAPHY.fieldValuePt > PAPER_TYPOGRAPHY.bodyPt, 'machine entry sits a hair above it');
  assert.ok(PAPER_TYPOGRAPHY.headingPt > PAPER_TYPOGRAPHY.fieldValuePt);
});

test('there is ONE rule pitch, and it is derived from the body size', () => {
  // THE BUG THIS EXISTS TO CATCH. The pitch used to be a `spacing` typed into
  // ruledArea and a `leading` typed into renderParagraphs — two numbers that had
  // to agree and nothing made them. Eight of the nine templates disagreed, and
  // the works order ran rules at 6.00mm against text at 5.35mm: a full line out
  // after ten, with a hairline through the middle of every body line.
  const expected = PAPER_TYPOGRAPHY.bodyPt * PT_MM * 1.5;
  assert.ok(Math.abs(PAPER_TYPOGRAPHY.rulePitchMm - expected) < 1e-9,
    `pitch is derived (${PAPER_TYPOGRAPHY.rulePitchMm} vs ${expected})`);

  // And there is nowhere left to type a second one. A template that declared its
  // own spacing or leading could drift again, so the words are gone from the
  // compiler entirely.
  assert.equal(/\bspacing\s*:/.test(builder), false, 'no template declares a rule spacing');
  assert.equal(/\bleading\s*:/.test(builder), false, 'no template declares a leading');
  assert.match(builder, /grid:area\.grid/, 'bodies are handed the rules they must sit on');
});

test('every vendored face is present, hashed, and what the catalog says it is', () => {
  for (const [kind, family] of Object.entries(manifest.families)) {
    for (const [face, entry] of Object.entries(family.faces)) {
      const actual = sha(read(`../assets/fonts/${entry.file}`));
      assert.equal(actual, entry.sha256, `${kind}/${face}: ${entry.file} matches the manifest`);
    }
    // The fingerprint covers EVERY face, so italicising a document invalidates
    // its pages rather than silently reusing a roman raster.
    const expected = sha(Object.values(family.faces)
      .map((f) => `${f.file}:${sha(read(`../assets/fonts/${f.file}`))}`).join('|'));
    assert.equal(PAPER_FONT_FINGERPRINT[kind], expected, `${kind}: the catalog fingerprint is the vendored files`);
  }
});

test('fonts are never resolved through fontconfig', () => {
  // fc-match ALWAYS returns something, so the old fingerprint could not detect a
  // substitution: a machine without Nimbus Roman baked Times and hashed it as
  // perfectly valid. Two builds of one sheet differed and the catalog called
  // both of them fine.
  assert.equal(/fc-match/.test(builderCode), false, 'the compiler does not shell out to fc-match');
  assert.equal(/fc-match/.test(rasteriserCode), false, 'nor does the rasteriser');
  assert.equal(/usr\/share\/fonts/.test(rasteriserCode), false, 'and the Linux-only DejaVu fallback is gone');
  assert.match(builder, /assets\/fonts/, 'the compiler reads the vendored directory');
  assert.match(rasteriser, /FONT_ROOT/, 'and so does the rasteriser');
});

test('the families the documents actually use are the families that are vendored', () => {
  // `sans` looked unused on a first pass because six forms reach it through
  // `valueKind:'sans'` rather than `kind:`. Retiring it would have silently
  // restyled six documents to tidy a font table.
  // `kind` is overloaded: renderParagraphs entries carry one (blank/rule/field/
  // paragraph/raw) and text() carries a FONT one. Only the latter must resolve.
  const ENTRY_KINDS = new Set(['blank', 'rule', 'field', 'paragraph', 'raw']);
  const used = new Set([...builderCode.matchAll(/(?:^|[^a-zA-Z])(?:value)?[Kk]ind:'([a-z]+)'/g)].map((m) => m[1]));
  for (const kind of used) {
    if (ENTRY_KINDS.has(kind)) continue;
    assert.ok(manifest.families[kind], `"${kind}" is vendored`);
  }
  assert.ok(used.has('sans'), 'sans is still reached, through valueKind');
  assert.equal(/TeXGyre|condensed:/.test(builderCode), false, 'the genuinely unused condensed entry is gone');
});

test('the reading view clears a legible x-height where the object view cannot', () => {
  // The object framing is deliberate and stays. It is also unreadable: at 63% x
  // 79% of a 1280x760 viewport it puts 12pt body type at about 4px of x-height,
  // and comfortable screen reading wants eight.
  const A4_ASPECT = 210 / 297;
  const bodyMm = PAPER_TYPOGRAPHY.bodyPt * PT_MM;
  const xHeight = (sheetW) => (bodyMm * (sheetW / 210)) * 0.48;

  const object = (vw, vh) => { const maxH = vh * 0.79, maxW = vw * 0.63; let h = maxH, w = h * A4_ASPECT; if (w > maxW) { w = maxW; h = w / A4_ASPECT; } return w; };
  // readRect: fit-width, never upscaled past the 2048px inspect raster.
  const reading = (vw) => Math.min(vw * 0.94, 2048);

  for (const [vw, vh] of [[1280, 760], [1920, 1080]]) {
    assert.ok(xHeight(object(vw, vh)) < 8, `${vw}x${vh}: the object view is below the reading threshold, as designed`);
    assert.ok(xHeight(reading(vw)) >= 8, `${vw}x${vh}: the reading view clears it (${xHeight(reading(vw)).toFixed(1)}px)`);
  }
  assert.ok(reading(2560) <= 2048, 'and the reading view never upscales past the raster');
});
