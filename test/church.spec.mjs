import assert from 'node:assert/strict';

import * as FP from '../src/world/floorplan.js';
import { conservatory as d } from '../src/data/floorplan/conservatory.js';
import { F, ZONE, ZONE_WORLD } from '../src/data/floorplan/legend.js';
import { CHURCH_BOUNDS, CHURCH_HEIGHTS } from '../src/data/st-brendans.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';

FP.compile(d.levels, {
  width: d.width, height: d.height, widenCorridors: d.widenCorridors,
  connectors: d.connectors || [], edgePortals: d.edgePortals || [], doors: d.doors || [],
});

// The yard island is parked at logical (50,200); yard-local (lx,ly) is (50+lx, 200+ly).
const L = (lx, ly) => ({ x: 50 + lx, y: 200 + ly });
const cellAt = (lx, ly) => { const r = FP.toRuntimePoint(L(lx, ly)); return FP.cellAt(r.x, r.y); };

// ── the church is a real interior ───────────────────────────────────────────
{
  const tower = cellAt(16, 57), nave = cellAt(16, 70), chancel = cellAt(16, 84);
  for (const [name, cell] of [['tower', tower], ['nave', nave], ['chancel', chancel]]) {
    assert.ok(cell, `the ${name} is solid — st brendan's has no inside`);
    assert.equal(cell.floor, 0, `the ${name} does not stand on the yard's grade`);
    assert.equal(cell.zone, ZONE.church, `the ${name} is not on the church's own zone`);
  }
  // In scale with Ellery, whose own bands run 8.6m to 17.6m. The first pass of
  // this put a 22m tower next to a 27.5m yard ceiling and drew a monolith.
  assert.ok(tower.ceil > nave.ceil && nave.ceil > chancel.ceil, 'the church has no hierarchy of heights');
  assert.ok(tower.ceil <= 18, `the tower is ${tower.ceil}m — taller than anything Ellery has`);
}

// ── ZONE.church must NOT read as outdoors ───────────────────────────────────
//
// This is the whole bug the first pass had. physicalRenderPlanFor treats
// dock/street/civicCourt/serviceYard as exterior and wipes the raymarched slice
// to open sky at −8m; a church on the yard's zone therefore rendered as loose
// volumes floating over a void. If anyone adds ZONE.church to that set again,
// the floating island comes back.
{
  const EXTERIOR = [ZONE.dock, ZONE.street, ZONE.civicCourt, ZONE.serviceYard];
  assert.ok(!EXTERIOR.includes(ZONE.church), 'ZONE.church is an exterior zone again — it will render as a floating island');
  // And it must not be wired into the conservatoire's own chapel, or standing in
  // a different building across the yard reports the player as standing in the
  // nave that ends the game.
  assert.equal(ZONE_WORLD[ZONE.church], 'main_b3');
  assert.notEqual(ZONE_WORLD[ZONE.church], ZONE_WORLD[ZONE.chapel]);
  assert.notEqual(ZONE_WORLD[ZONE.church], ZONE_WORLD[ZONE.bellTower]);
}

// ── no pit in the tarmac ────────────────────────────────────────────────────
//
// The exterior slice has no solid geometry — outdoors, buildings are meshes —
// but the church's FLOOR has to survive that filter or the footprint falls
// through to the fill's −8m and the yard gets a thirty-metre hole in it.
{
  const observer = FP.toRuntimePoint(L(16, 45));          // on the tarmac, north of the doors
  const slice = FP.physicalRenderPlanFor(observer.x, observer.y);
  const at = (lx, ly) => {
    // Locate the footprint through logicalToPhysical rather than by assuming the
    // yard's physical embedding. Assuming it is how the first pass of this test
    // sampled the wrong cells and reported a monolith as fixed.
    const r = FP.toRuntimePoint(L(lx, ly));
    const p = FP.logicalToPhysical(r.x, r.y);
    const i = (Math.round(p.z) - slice.originY) * slice.w + (Math.round(p.x) - slice.originX);
    assert.ok(i >= 0 && i < slice.w * slice.h, 'church sample fell outside the exterior slice');
    return { solid: slice.solid[i], floor: slice.floor[i], ceil: slice.ceil[i], sky: !!(slice.flags[i] & F.SKY) };
  };

  // Compared LATERALLY, against tarmac on the same row. The yard bands its
  // ceiling along its depth on purpose (YARD_ROOFLINE), so a church cell and a
  // yard cell twelve metres north are supposed to differ; only a difference
  // ACROSS the same row is a step the church itself introduced.
  for (const [name, lx, ly] of [['tower', 16, 57], ['nave', 16, 70], ['chancel', 16, 84], ['a wall', 9, 70]]) {
    const c = at(lx, ly);
    const yard = at(34, ly);                              // open tarmac, same row
    assert.equal(c.solid, 0, `the ${name} is solid in the exterior slice — outdoors this game has no raymarched walls`);
    assert.ok(c.floor > -1, `the ${name} footprint is a pit from outside (floor ${c.floor})`);
    // THE MONOLITH. This is the assertion that matters, and the one the first
    // pass of this file did not make. The exterior slice is filled to a single
    // ceiling; any cell that punches a lower one into it is a ceiling STEP, and
    // r3d draws a ceiling step as geometry hanging from the higher side. Over an
    // open yard that is a black slab in the sky with nothing under it.
    assert.equal(c.ceil, yard.ceil,
      `the ${name} has a ceiling step against the yard (${c.ceil} vs ${yard.ceil}) — that hangs a slab over the tarmac`);
    assert.ok(c.sky, `the ${name} is roofed in the exterior slice — the roof belongs to a mesh, not to the ground`);
  }
}

// ── and you can walk all of it ──────────────────────────────────────────────
{
  const start = FP.toRuntimePoint(L(16, 50));
  const key = (x, y) => `${x},${y}`;
  const queue = [[Math.round(start.x), Math.round(start.y)]];
  const seen = new Set([key(queue[0][0], queue[0][1])]);
  for (let i = 0; i < queue.length && i < 200000; i += 1) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (seen.has(k) || !FP.canStep(x, y, nx, ny).ok) continue;
      seen.add(k); queue.push([nx, ny]);
    }
  }
  for (const [name, lx, ly] of [['tower', 16, 57], ['nave', 16, 70], ['west transept', 7, 74], ['chancel', 16, 84]]) {
    const p = FP.toRuntimePoint(L(lx, ly));
    const near = [...seen].some((k) => { const [x, y] = k.split(',').map(Number); return Math.hypot(x - p.x, y - p.y) <= 2; });
    assert.ok(near, `the ${name} cannot be walked to from the tarmac`);
  }
}

// ── the mesh has not drifted off the plan ───────────────────────────────────
//
// The whole reason data/st-brendans.js exists is that build-props.mjs and the
// floorplan read the SAME manifest. This is the assertion that keeps them
// honest: an elevation modelled against a remembered plan drifts off it the
// first time a transept moves, and a church whose mesh and whose walls disagree
// is one you can see through.
{
  const bounds = PROP_BOUNDS.st_brendan_church;
  assert.ok(bounds, 'st_brendan_church is not in the prop pack — run the props build');
  const halfX = (CHURCH_BOUNDS.x1 - CHURCH_BOUNDS.x0) / 2;
  const halfZ = (CHURCH_BOUNDS.y1 - CHURCH_BOUNDS.y0) / 2;
  // The mesh may exceed the footprint — buttresses project and roofs overhang —
  // but only by a parapet's worth. Anything more means it is no longer built
  // around the plan's centre.
  const SLOP = 3.5;
  assert.ok(Math.abs(bounds.min[0]) <= halfX + SLOP && bounds.max[0] <= halfX + SLOP,
    `the church mesh is ${bounds.min[0]}..${bounds.max[0]} across a ${halfX * 2}m footprint`);
  assert.ok(Math.abs(bounds.min[2]) <= halfZ + SLOP && bounds.max[2] <= halfZ + SLOP,
    `the church mesh is ${bounds.min[2]}..${bounds.max[2]} along a ${halfZ * 2}m footprint`);
  // It has to actually reach tower height, or the belfry is not standing where
  // the eighteen metres of empty shaft below it are.
  assert.ok(bounds.max[1] >= CHURCH_HEIGHTS.tower,
    `the mesh tops out at ${bounds.max[1]}m but the tower shaft is ${CHURCH_HEIGHTS.tower}m`);
  assert.ok(bounds.min[1] >= -0.01, 'the church mesh hangs below its own grade');
}

console.log("st brendan's specs passed");
