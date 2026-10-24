import assert from 'node:assert/strict';
import * as A from '../tools/chunk_surfer/main-stair-audit.mjs';
import { MAIN_STAIR_WALL_ORIGIN, MAIN_STAIR_WALL_SITES as sites } from '../src/data/main-stair-wall-treatment.js';

assert.deepEqual(MAIN_STAIR_WALL_ORIGIN, [63, 0, 36]);
assert.equal(new Set(sites.map(s => s.id)).size, sites.length);
assert.ok(sites.length > 0 && sites.length <= 12, 'a finite architectural treatment, not a new surrounding shell');

const poses = [
  { floor: 0, x: 61.5, z: 30.5, label: 'ground approach' },
  { floor: 4.8, x: 64.75, z: 34.25, label: 'upper landing' },
  { floor: 10, x: 62.25, z: 38.25, label: 'academic arrival' },
];
for (const flight of A.STAIR.flights) {
  for (let i = 0; i <= flight.rises; i++) {
    const angle = flight.theta0 + flight.sweep * (i + .1) / flight.rises;
    poses.push({
      floor: flight.fromH + (flight.toH - flight.fromH) * i / flight.rises,
      x: 63 + Math.sin(angle) * 1.65,
      z: 36 - Math.cos(angle) * 1.65,
      label: `${flight.id} ${i}`,
    });
  }
}
assert.equal(poses.length, 65);
const observers = poses.map(pose => {
  const logical = A.logicalAt(pose.x, pose.z, pose.floor);
  assert.ok(logical && logical.distanceM < .6, `ordinary observer belongs to the real route: ${pose.label}`);
  return { pose, slice: A.observerSlice(logical.x, logical.y) };
});

function occupied(slice, [x, y, z]) {
  const px = Math.floor(x / A.CELL) - slice.originX;
  const pz = Math.floor(z / A.CELL) - slice.originY;
  assert.ok(px >= 0 && px < slice.w && pz >= 0 && pz < slice.h, 'wall sample is in the actual renderer plan');
  const i = pz * slice.w + px;
  return !!(slice.drawnFlags[i] & A.F.SOLID)
    || y < slice.drawnFloor[i] - .001
    || y > slice.drawnCeil[i] + .001;
}

let samples = 0;
for (const site of sites) {
  assert.ok(['intact', 'overpainted', 'sealed'].includes(site.kind));
  assert.equal(site.validation.observerSamples, observers.length);
  assert.deepEqual(site.renderGroups, ['ground', 'upper', 'academic'], 'a single fixed architectural treatment survives floor changes');
  assert.ok(site.maxProjection > 0 && site.maxProjection <= .16);
  assert.ok(Math.abs(site.normal.reduce((s, v, i) => s + v * site.tangent[i], 0)) < 1e-10);
  assert.equal(Math.hypot(...site.normal), 1);
  assert.equal(Math.hypot(...site.tangent), 1);
  assert.equal(-site.tangent[2] * site.normal[0] + site.tangent[0] * site.normal[2], 1,
    'local U, world up and front normal form a right handed basis without reflected winding');
  if (site.origin[1] > 4.8 && site.origin[1] < 10) assert.ok(site.maxProjection <= .12, 'upper relief retains the outer tread clearance');
  let exposed = 0;
  for (const { pose, slice } of observers) {
    for (let u = 0; u <= 8; u++) for (let h = 0; h <= 8; h++) {
      const along = site.width * (u / 8 - .5);
      const at = site.origin.map((v, i) => v + site.tangent[i] * along + (i === 1 ? site.height * h / 8 : 0));
      const behind = at.map((v, i) => v - site.normal[i] * .02);
      const front = at.map((v, i) => v + site.normal[i] * .02);
      assert.ok(occupied(slice, behind), `${site.id} has no real wall backing at ${at.join(',')} from ${pose.label}`);
      if (!occupied(slice, front)) exposed++;
      samples++;
    }
  }
  assert.ok(exposed > 0, `${site.id} has an actually exposed room-facing wall surface`);
}

// This specific tempting bay failed the source audit: it crosses the academic
// opening. Catch the error even if a future layout happens to hide its edge.
assert.ok(!sites.some(s => s.origin[2] === 30 && s.origin[0] > 63));
assert.ok(!sites.some(s => s.origin[1] < 4.8 && (s.origin[0] === 60 || s.origin[2] === 33)),
  'the open ground stairwell is not mistaken for a complete masonry enclosure');
assert.ok(!sites.some(s => s.origin[1] >= 10 && s.origin[2] === 33),
  'no false wall closes the academic loggia when its observer slice opens');

console.log(`Main stair wall sites: ${sites.length} bays, ${observers.length} ordinary route observers, ${samples} backed surface samples passed.`);
