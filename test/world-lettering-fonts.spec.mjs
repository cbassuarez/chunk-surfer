import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import SOURCE_ATLAS from '../content/chunk-surf/source-atlas.json' with { type: 'json' };
import { WORLD_LETTERING_FONT_FILES } from '../src/render/world-lettering-fonts.js';
import { fitWorldLetteringLine } from '../src/render/world-lettering-layout.js';

// Inspect the actual shipped outlines. Browser fallback must not conceal a
// missing code symbol or authored redaction block in the selected mono face.
function unicodeGlyphIndex(bytes) {
  let cmap;
  for (let i = 0; i < bytes.readUInt16BE(4); i++) {
    const p = 12 + i * 16;
    if (bytes.toString('ascii', p, p + 4) === 'cmap') cmap = bytes.readUInt32BE(p + 8);
  }
  assert.ok(cmap, 'font contains a character map');
  let table;
  for (let i = 0; i < bytes.readUInt16BE(cmap + 2); i++) {
    const p = cmap + 4 + i * 8, offset = cmap + bytes.readUInt32BE(p + 4);
    if ([0, 3].includes(bytes.readUInt16BE(p)) && bytes.readUInt16BE(offset) === 4) table = offset;
  }
  assert.ok(table, 'vendored font has a Unicode BMP mapping');
  const count = bytes.readUInt16BE(table + 6) / 2, end = table + 14;
  const start = end + count * 2 + 2, delta = start + count * 2, range = delta + count * 2;
  return code => {
    for (let i = 0; i < count; i++) {
      if (code > bytes.readUInt16BE(end + i * 2)) continue;
      const first = bytes.readUInt16BE(start + i * 2);
      if (code < first) return 0;
      const d = bytes.readInt16BE(delta + i * 2), r = bytes.readUInt16BE(range + i * 2);
      if (!r) return (code + d) & 65535;
      const glyph = bytes.readUInt16BE(range + i * 2 + r + 2 * (code - first));
      return glyph ? (glyph + d) & 65535 : 0;
    }
    return 0;
  };
}
const printable = Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32));
const source = Object.values(SOURCE_ATLAS.sectors).flatMap(sector => sector.sourceLines.map(line => line.text)).join('\n');
const sourceGlyphs = [...new Set(source + '█—…')].filter(char => !['\n', '\r', '\t'].includes(char));
for (const face of WORLD_LETTERING_FONT_FILES) {
  const glyph = unicodeGlyphIndex(readFileSync(`public/assets/fonts/${face.file}`));
  for (const char of printable) assert.ok(glyph(char.codePointAt(0)), `${face.role} lacks printable ${JSON.stringify(char)}`);
  if (face.role === 'mono') for (const char of sourceGlyphs) {
    assert.ok(glyph(char.codePointAt(0)), `Source face lacks actual source glyph ${JSON.stringify(char)}`);
  }
}

// The physical line fitter includes both bearings and vertical ink extents.
// Its only size adjustment is a uniform font size; all copy remains exact.
const ctx = {
  measureText(text) {
    const size = parseFloat(this.font);
    return { width: text.length * size * .6, actualBoundingBoxLeft: 2 * size / 14,
      actualBoundingBoxRight: text.length * size * .6 + size / 14,
      actualBoundingBoxAscent: size * .75, actualBoundingBoxDescent: size * .25 };
  },
};
const copy = '  A LONG WHOLE PHYSICAL INSCRIPTION  ';
const fit = fitWorldLetteringLine(ctx, copy, { width: 90, height: 10, maxFont: 28 });
assert.equal(fit.text, copy); assert.equal(fit.fits, true);
assert.ok(fit.width <= 90 && fit.ascent + fit.descent <= 10);
assert.equal(ctx.font, fit.font); assert.ok(fit.font.includes('"World Lettering Mono"'));
assert.ok(fit.fontSize < 28 && fit.fontSize >= 1);
assert.equal(ctx.textAlign, 'left'); assert.equal(ctx.textBaseline, 'alphabetic');
const impossible = fitWorldLetteringLine(ctx, copy, { width: 1, height: 1, maxFont: 28, minFont: 10 });
assert.equal(impossible.fits, false, 'unfit copy reports failure rather than claiming a clipped fit');
assert.throws(() => fitWorldLetteringLine(ctx, copy, { width: 0 }), RangeError);
console.log('Pinned outline coverage and complete physical-line fitting pass');
