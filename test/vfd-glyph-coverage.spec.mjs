import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { VFD_COLS, VFD_ROWS, vfdGlyph, vfdGlyphMissing } from '../src/render/vfd-font.js';
import { fitText, fitLines, fits, fitReport } from '../src/render/fit-text.js';

// ── EVERY CHARACTER THE UI DRAWS HAS A GLYPH ─────────────────────────────────
//
// The UI layer is a 5×7 dot-matrix ROM, and it USED to return early on a code
// it had no glyph for: right cell, right colour, zero pixels. A missing glyph
// was therefore completely invisible and read as a spacing bug, which is why it
// cost real time twice — once on the minimap's diamonds, once on the skills
// tree's PENDING mark.
//
// When this test was written, FIFTY-THREE characters were being handed to
// uiGlyph from real draw calls with no glyph behind them, including uiBox's own
// box-drawing set (so the box primitive had never drawn a box), the speech
// cursor that is on screen through every line of dialogue in the game, the
// scroll arrows in settings and the field case, and the take screen's own
// TAKE HELD marker.
//
// So: scan every string literal in src/ and require a glyph for every non-ASCII
// character in one. It over-reads a little — a literal is not always drawn —
// but the cost of a false positive is one ROM entry, and the cost of a false
// negative is invisible UI nobody can report.
//
// THE SCAN CANNOT COVER ASCII, and that is where it leaked. Widening it to all
// printable ASCII floods on JS syntax — every `${}` in the codebase reports '$'
// as a missing glyph. So ASCII is asserted directly against the ROM instead,
// below, which is what caught '&' printing as a tofu box in
// "ACHIEVEMENTS & RUN HISTORY" on the post-run screen.

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.js')) out.push(path);
  }
  return out;
};

// Comments are full of box-drawing dividers that are never drawn.
const stripComments = (source) => source
  .replace(/\r\n?/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');

assert.ok(
  !stripComments("// comment-only '♪'\r\n").includes('♪'),
  'CRLF whole-line comments are stripped before glyph scanning',
);
assert.ok(
  !stripComments("// comment-only 'ˆ'\r\n").includes('ˆ'),
  'CRLF comment literals never become VFD glyph requirements',
);

const LITERAL = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g;

{
  const holes = new Map();
  for (const file of walk('src')) {
    for (const match of stripComments(readFileSync(file, 'utf8')).matchAll(LITERAL)) {
      for (const ch of (match[1] ?? match[2] ?? match[3] ?? '')) {
        if (ch.charCodeAt(0) < 128 || !vfdGlyphMissing(ch)) continue;
        if (!holes.has(ch)) holes.set(ch, new Set());
        holes.get(ch).add(file);
      }
    }
  }
  const report = [...holes].map(([ch, files]) =>
    `${JSON.stringify(ch)} U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} — ${[...files].join(', ')}`);
  assert.deepEqual(report, [],
    'these characters are drawn and have no glyph, so they render as nothing:\n  ' + report.join('\n  '));
}

// The ROM's own shape. A malformed entry would draw a corrupt character rather
// than nothing, which is harder to spot than a hole.
for (const ch of ['A', '0', '─', '│', '▌', '▲', '■', 'Ⅱ', '◆', '◇']) {
  const rows = vfdGlyph(ch);
  assert.ok(rows, `${ch} is in the ROM`);
  assert.equal(rows.length, VFD_ROWS, `${ch} has ${VFD_ROWS} rows`);
  for (const row of rows) {
    assert.ok(Number.isInteger(row) && row >= 0 && row < (1 << VFD_COLS),
      `${ch} has a row outside ${VFD_COLS} columns`);
  }
}

// A genuinely unknown code is reported as missing, and a space is not.
assert.equal(vfdGlyphMissing('\u{1F600}'), true, 'an emoji has no glyph and says so');
assert.equal(vfdGlyphMissing(' '), false, 'a space is a space, not a hole');
assert.equal(vfdGlyphMissing('é'), false, 'accented lower case folds to its capital');

// ── TEXT FITS THE BOX IT IS DRAWN IN ─────────────────────────────────────────
//
// uiText has no bounds check of its own — it draws a glyph per cell and keeps
// going, past the panel bezel and past the edge of the canvas — so this is the
// helper every caller has to use. It always marks a cut: an amputation with no
// mark is the actual bug, because `MASTER TAKE` cut to `MASTER TA` reads as a
// different move rather than as a shortened one.
assert.equal(fitText('MASTER TAKE', 11), 'MASTER TAKE');
assert.equal(fitText('MASTER TAKE', 9), 'MASTER T…');
assert.equal(fitText('MASTER TAKE', null), 'MASTER TAKE', 'no budget means no change');
assert.equal(fitText('MASTER TAKE', 1), '…');
assert.equal(fitText('MASTER TAKE', 0), '');
assert.equal(fitText(null, 6), '');
assert.ok(fitText('MASTER TAKE', 9).length <= 9, 'and the result really does fit');

// uiWrap leaves a word longer than the width over-wide; this one breaks it.
assert.deepEqual(fitLines('SUPERCALIFRAGILISTIC', 8), ['SUPERCAL', 'IFRAGILI', 'STIC']);
assert.deepEqual(fitLines('one two three', 8), ['one two', 'three']);
assert.deepEqual(fitLines('one two three four', 8, 2), ['one two', 'three…'],
  'the ellipsis goes on the last line kept, not on every line');
for (const line of fitLines('the run below it loses continuity and comes back', 14)) {
  assert.ok(line.length <= 14, `"${line}" fits`);
}

assert.equal(fits('HOLD', 9), true);
assert.equal(fits('MASTER TAKE', 9), false);
assert.deepEqual(
  fitReport([{ label: 'move', text: 'MASTER TAKE', max: 9 }, { label: 'ok', text: 'HOLD', max: 9 }]),
  [{ label: 'move', text: 'MASTER TAKE', max: 9, length: 11, over: 2 }],
  'the report names what does not fit and by how much');

console.log('vfd glyph coverage and text fitting ok');

// ── THE PRINTABLE ASCII THE INTERFACE IS ALLOWED TO USE ──────────────────────
//
// Asserted against the ROM rather than discovered by scanning, because the scan
// above is structurally blind to ASCII. If a label needs a character that is not
// on this line, the character gets a glyph and the line grows — the one thing
// that must not happen is a label shipping a hollow box.
{
  const REQUIRED = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;-_=/+?!'\"()[]#%&*<>";
  const missing = [...REQUIRED].filter((ch) => vfdGlyphMissing(ch));
  assert.deepEqual(missing, [], `the ROM is missing printable ASCII the UI uses: ${missing.join(' ')}`);
}
