import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { MATERIAL } from '../src/data/floorplan/legend.js';

// The march walks through these squares without reading or testing a cell, so
// a square that is too big draws through a wall. Check the field by brute force.
const source = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
const begin = source.indexOf('const PLAN_SKIP_RADIUS_MAX');
const end = source.indexOf('export function r3dSetPlan(');
assert.ok(begin >= 0 && end > begin);
const sandbox = { MATERIAL };
vm.createContext(sandbox);
vm.runInContext(`${source.slice(begin, end)}\nglobalThis.field=planSkipField;globalThis.RMAX=PLAN_SKIP_RADIUS_MAX;`, sandbox);
const { field, RMAX } = sandbox;

const SOLID = 1, SKY = 4;
function randomPlan(w, h, seed) {
  let s = seed;
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const rgba = new Uint8Array(w * h * 4), material = new Uint8Array(w * h).fill(MATERIAL.serviceConcrete);
  // Rooms and yards: broad regions of one kind, then scattered walls, kerbs and water.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, outdoors = (x >> 4) % 2 === (y >> 5) % 2;
    rgba[i * 4] = outdoors ? 60 + ((x >> 3) % 3) : 64;
    rgba[i * 4 + 1] = outdoors ? 200 : 100 + ((y >> 4) % 2);
    rgba[i * 4 + 2] = outdoors ? SKY : 0;
    if (rand() < 0.01) rgba[i * 4 + 2] |= SOLID;
    if (rand() < 0.003) material[i] = MATERIAL.wetTile;
    if (outdoors && rand() < 0.002) rgba[i * 4 + 2] |= 128;   // walled sky
  }
  return { rgba, material };
}

function classOf(rgba, material, i) {
  const flags = rgba[i * 4 + 2];
  if ((flags & SOLID) || material[i] === MATERIAL.wetTile) return null;
  return (flags & SKY) ? 'sky' : `${rgba[i * 4]}:${rgba[i * 4 + 1]}`;
}

function squareHolds(rgba, material, w, h, x, y, r) {
  if (x - r < 0 || y - r < 0 || x + r >= w || y + r >= h) return false;
  const k = classOf(rgba, material, y * w + x);
  if (k === null) return false;
  for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
    if (classOf(rgba, material, yy * w + xx) !== k) return false;
  }
  return true;
}

test('every open-ground square is open, uniform, maximal and carries its highest floor', () => {
  for (const [w, h, seed] of [[97, 61, 1], [140, 90, 7]]) {
    const { rgba, material } = randomPlan(w, h, seed);
    const { radius, floorMax } = field(rgba, material, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, r = radius[i];
      if (classOf(rgba, material, i) === null) { assert.equal(r, 0); continue; }
      assert.ok(squareHolds(rgba, material, w, h, x, y, r), `square at ${x},${y} r=${r} must hold`);
      if (r < RMAX) assert.ok(!squareHolds(rgba, material, w, h, x, y, r + 1), `square at ${x},${y} r=${r} must be maximal`);
      let highest = 0;
      for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) highest = Math.max(highest, rgba[(yy * w + xx) * 4]);
      assert.equal(floorMax[i], highest, `highest floor at ${x},${y}`);
    }
  }
});

test('the march spends its 192-step budget on walked cells too', () => {
  const march = source.slice(source.indexOf('ACROSS OPEN GROUND WITHOUT LOOKING'), source.indexOf('bool xSide = sideT.x < sideT.y;'));
  assert.match(march, /marchStep\+\+;\s*if\(marchStep >= 192 \|\| tEnter > MAXD\) break;/);
  assert.match(march, /if\(min\(sideT\.x, sideT\.y\) >= tClear\) break;/);
});
