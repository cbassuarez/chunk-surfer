import assert from 'node:assert/strict';
import { vfdGlyph, VFD_COLS, VFD_ROWS } from '../../../public/labs/chunk-surfer/src/render/vfd-font.js';

const dots=(glyph)=>vfdGlyph(glyph).reduce((n,row)=>n+row.toString(2).replaceAll('0','').length,0);
assert.equal(VFD_COLS,5);assert.equal(VFD_ROWS,7);
assert.deepEqual(vfdGlyph('A'),[0b01110,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001]);
assert.deepEqual(vfdGlyph('z'),vfdGlyph('Z'));
assert.equal(dots(' '),0);
assert.ok(dots('8')>dots('1'));
assert.deepEqual(vfdGlyph('-'),[0,0,0,0b11111,0,0,0]);
assert.equal(vfdGlyph('\u2603'),null);

console.log('✓ fixed 5x7 character-VFD grid');
console.log('✓ uppercase, digit and punctuation glyphs');
console.log('✓ dormant/unknown glyph contracts');
