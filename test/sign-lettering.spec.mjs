// SIGNS HAVE TO READ.
//
// Every mesh in this pack faces LOCAL -Z — the prop matrix turns that into
// (sin yaw, -cos yaw), which is why a placed figure looks at you and a van's
// windscreen points down the road. A reader standing in front of that face is
// looking toward +Z, and for them local +X runs to the LEFT.
//
// So a line of type laid out with its first character at the most negative x and
// each one after it further along +X arrives MIRRORED, and every placard, banner
// and dock sign in the game was mirror-written for exactly that reason. It is
// not a bug anybody catches by reading the layout code: the arithmetic looks
// like ordinary left-to-right text and the error lives entirely in which way the
// reader is facing.
//
// This decodes the ink straight out of the built GLB and reads it back. If the
// layout is ever flipped again, this fails with the reversed string in the
// message rather than with a coordinate.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bytes = readFileSync('public/assets/conservatory-props.glb');
assert.equal(bytes.subarray(0, 4).toString('ascii'), 'glTF');
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
const binStart = 20 + jsonLength + 8;

const componentBytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
function accessorValues(index) {
  const accessor = gltf.accessors[index], view = gltf.bufferViews[accessor.bufferView];
  const width = accessor.type === 'VEC3' ? 3 : 1;
  const size = componentBytes[accessor.componentType];
  const stride = view.byteStride || size * width;
  const offset = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const out = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const at = offset + i * stride, row = [];
    for (let c = 0; c < width; c += 1) {
      const p = at + c * size;
      row.push(accessor.componentType === 5126 ? bytes.readFloatLE(p)
        : accessor.componentType === 5125 ? bytes.readUInt32LE(p)
          : accessor.componentType === 5123 ? bytes.readUInt16LE(p) : bytes.readUInt8(p));
    }
    out.push(width === 1 ? row[0] : row);
  }
  return out;
}

// The five-by-seven stock the pack sets type in. Duplicated here on purpose:
// a decoder that shared the encoder's table could not detect a mirrored table.
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '11100'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
};
const BLANK = '0000000000000000000000000000000000000'.slice(0, 35);
const flat = (rows) => rows.join('');
const BY_PATTERN = new Map(Object.entries(GLYPHS).map(([ch, rows]) => [flat(rows), ch]));
BY_PATTERN.set(BLANK, ' ');

// Read one line of type off a sign mesh and return what a person standing in
// front of it would see.
function readSign(name) {
  const mesh = gltf.meshes.find((entry) => entry.name === name);
  assert.ok(mesh, `${name} is missing from the prop pack`);
  // The ink is the one primitive that is a flat sheet of plates: every vertex on
  // a single plane, four per plate. The board, its edging and its accent strips
  // are boxes and span a depth, so they cannot be confused with it.
  let ink = null;
  for (const primitive of mesh.primitives) {
    const pos = accessorValues(primitive.attributes.POSITION);
    if (pos.length < 40 || pos.length % 4) continue;
    const z0 = pos[0][2];
    if (!pos.every((q) => Math.abs(q[2] - z0) < 1e-5)) continue;
    if (!ink || pos.length > ink.length) ink = pos;
  }
  assert.ok(ink, `${name} carries no rasterised lettering`);

  // Four consecutive vertices are one plate (see addPlate); its centre is their
  // mean. Working from centres rather than corners keeps the grid independent of
  // how much smaller than its cell each plate is drawn.
  const centres = [];
  for (let i = 0; i < ink.length; i += 4) {
    let x = 0, y = 0;
    for (let c = 0; c < 4; c += 1) { x += ink[i + c][0]; y += ink[i + c][1]; }
    centres.push([x / 4, y / 4]);
  }
  const uniq = (values) => [...new Set(values.map((v) => Math.round(v * 10000) / 10000))].sort((a, b) => a - b);
  const xs = uniq(centres.map((c) => c[0])), ys = uniq(centres.map((c) => c[1]));
  const gap = (list) => Math.min(...list.slice(1).map((v, i) => v - list[i]).filter((d) => d > 1e-5));
  const dot = Math.min(gap(xs), gap(ys));
  const cell = (v, base) => Math.round((v - base) / dot);
  const lit = new Set(centres.map(([x, y]) => `${cell(x, xs[0])},${cell(y, ys[0])}`));
  const maxX = cell(xs[xs.length - 1], xs[0]), maxY = cell(ys[ys.length - 1], ys[0]);

  // READER'S ORDER. Their right is local -X, so the screen column runs from the
  // largest x downward; the screen row runs from the largest y downward.
  const rows = [];
  for (let row = 0; row <= maxY; row += 1) {
    let line = '';
    for (let col = 0; col <= maxX; col += 1) line += lit.has(`${maxX - col},${maxY - row}`) ? '1' : '0';
    rows.push(line);
  }
  assert.equal(rows.length, 7, `${name} is not set in the five-by-seven stock`);
  const width = rows[0].length;
  let text = '';
  for (let at = 0; at + 5 <= width; at += 6) {
    text += BY_PATTERN.get(rows.map((line) => line.slice(at, at + 5)).join('')) ?? '\u00bf';
  }
  return text.trimEnd();
}

for (const [mesh, expected] of [
  ['vigil_part_sign_save', 'SAVE ELLERY'],
  ['scene_dock_sign_foh', 'FRONT OF HOUSE'],
]) {
  const read = readSign(mesh);
  assert.equal(read, expected,
    `${mesh} reads "${read}" to somebody standing in front of it — type is laid out toward the reader's left`);
}

// And the ink is PRINTED, not built. One flat plate per lit pixel, two
// triangles: a box would be twelve, five faces of which are never seen and all
// six of which are lit, so raised type reads as embossed pigment rather than as
// print — and a two-word placard cost four thousand triangles.
{
  const stats = JSON.parse(readFileSync('public/assets/conservatory-props.stats.json', 'utf8'));
  for (const name of ['vigil_part_sign_save', 'vigil_part_banner', 'scene_dock_sign_foh']) {
    assert.ok(stats.meshes[name].triangles < 1200,
      `${name} is ${stats.meshes[name].triangles} triangles — the lettering has gone back to solid geometry`);
  }
}

console.log('sign lettering specs passed (type reads forward and is rasterised)');
