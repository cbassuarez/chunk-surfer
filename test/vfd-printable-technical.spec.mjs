import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { vfdGlyph, vfdGlyphMissing } from '../src/render/vfd-font.js';

const missing = Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32)).filter(vfdGlyphMissing);
assert.deepEqual(missing, [], 'all printable ASCII,including technical/source notation,has a ROM glyph');
const old = " !\"#%&'()*+,-./0123456789:;<=>?ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_`abcdefghijklmnopqrstuvwxyz─│▌▲■Ⅱ◆◇‹›éÉáÁøØ—–‘’“”…•↑↓";
assert.equal(createHash('sha256').update(JSON.stringify([...old].map(ch => [ch, vfdGlyph(ch)]))).digest('hex'),
  'ef2adfd0119f54612d5fff70e6d0ab57b7c8969c8d7abaff0220a899bcd89484',
  'approved existing ASCII and instrument symbols retain every matrix dot');
const mirror = rows => rows.map(row => parseInt(row.toString(2).padStart(5, '0').split('').reverse().join(''), 2));
assert.deepEqual(vfdGlyph('\\'), mirror(vfdGlyph('/')), 'slash directions are physically distinct');
assert.deepEqual(vfdGlyph('}'), mirror(vfdGlyph('{')), 'braces retain their opposite orientation');
assert.deepEqual(vfdGlyph('|'), Array(7).fill(4), 'pipe is a complete vertical stroke');
for (const [a, b] of [['$', 'S'], ['@', 'O'], ['^', '↑'], ['~', '-']]) assert.notDeepEqual(vfdGlyph(a), vfdGlyph(b), `${a} stays distinguishable from ${b}`);
for (const ch of '$@\\^{|}~') {
  assert.equal(vfdGlyph(ch).length, 7);
  assert.ok(vfdGlyph(ch).some(row => row > 0));
  assert.ok(vfdGlyph(ch).every(row => Number.isInteger(row) && row >= 0 && row < 32));
}
console.log('Complete printable technical ROM coverage;approved glyphs unchanged');
