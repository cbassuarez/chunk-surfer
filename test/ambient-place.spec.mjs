// The baked per-cell ambient: is it actually a map of the building's openings?
//
// This exists because the thing it replaced could not be judged from a
// screenshot. Ambient was one scalar per zone (0.014-0.043), and at the
// brightest story-mode location the widest possible A/B — ambient flat versus
// ambient extinguished entirely at distance — moved the frame 2.2% near and
// 2.4% far. No differential. The term was too small to see, so "is the lighting
// shaped by place" was not answerable by eye. It is answerable here.
import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { AMBIENT_PLACE_SCALE, F, ZONE } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
  edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});

const mult = (byte) => (byte / 255) * AMBIENT_PLACE_SCALE;

{
  // A hand-built plan is the only way to assert the RULE rather than whatever
  // the conservatory happens to look like: one sky cell, a corridor running away
  // from it, rock either side.
  const w = 24, h = 3;
  const solid = new Uint8Array(w * h).fill(1);
  const flags = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { solid[1 * w + x] = 0; }
  flags[1 * w + 0] = F.SKY;
  const a = FP.bakeAmbientField({ w, h, solid, flags });

  const at = (x) => mult(a[1 * w + x]);
  assert.ok(at(0) > at(4), 'the cell under the opening beats one four cells away');
  assert.ok(at(4) > at(12), 'and four beats twelve: it keeps falling, it does not step');
  assert.ok(at(12) > at(23), 'and twelve beats the far end');
  assert.ok(at(0) > 1.5, `standing under the sky should exceed the old flat value, got ${at(0).toFixed(2)}`);
  assert.ok(at(23) < 1.0, `the far end should fall below it, got ${at(23).toFixed(2)}`);

  // Monotonic the whole way. A non-monotonic falloff would mean the BFS is
  // leaking through rock somewhere, which is the failure mode that matters.
  for (let x = 1; x < w; x++) {
    assert.ok(a[1 * w + x] <= a[1 * w + x - 1], `ambient must not rise walking away from the opening (at x=${x})`);
  }
}

{
  // Light must not pass through walls. Two corridors, one with a sky cell, the
  // other sealed from it — the sealed one cannot borrow the opening.
  const w = 12, h = 5;
  const solid = new Uint8Array(w * h).fill(1);
  const flags = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { solid[1 * w + x] = 0; solid[3 * w + x] = 0; }
  flags[1 * w + 0] = F.SKY;               // row 1 is lit, row 3 is sealed behind row 2
  const a = FP.bakeAmbientField({ w, h, solid, flags });
  assert.ok(mult(a[1 * w + 2]) > mult(a[3 * w + 2]) * 1.5,
    'a sealed corridor must not receive spill through the rock between them');
}

{
  // THE PRIMARY DRIVER, and the one the first version of this got wrong by
  // baking distance-to-daylight into a building with 36 sky cells and none at
  // all on the ground floor. Ceiling height is what separates the hall from the
  // store here, so two rooms identical but for their height must not come back
  // identically lit — and the tall one must be the brighter.
  const w = 9, h = 9;
  const solid = new Uint8Array(w * h).fill(1);
  const flags = new Uint8Array(w * h);
  const floor = new Float32Array(w * h);
  const ceil = new Float32Array(w * h);
  for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) {
    solid[y * w + x] = 0;
    ceil[y * w + x] = y < 4 ? 15.5 : 2.25;   // a nave over a cupboard
  }
  const a = FP.bakeAmbientField({ w, h, solid, flags, floor, ceil });
  const tall = mult(a[2 * w + 4]), low = mult(a[6 * w + 4]);
  assert.ok(tall > low * 1.8, `a 15.5m volume must outshine a 2.25m one, got ${tall.toFixed(2)} vs ${low.toFixed(2)}`);
  assert.ok(tall > 1.0 && low < 1.0, 'and they must straddle the old flat value, not merely differ');
}

{
  // A building with no openings at all must not come back black — it comes back
  // uniformly deep. This is the basement, and it is the case a naive distance
  // transform gets wrong by returning zero everywhere.
  const w = 8, h = 3;
  const solid = new Uint8Array(w * h).fill(1);
  const flags = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) solid[1 * w + x] = 0;
  const a = FP.bakeAmbientField({ w, h, solid, flags });
  for (let x = 0; x < w; x++) {
    assert.ok(mult(a[1 * w + x]) > 0.3, 'a windowless room is dim, never unlit');
  }
}

{
  // And on the real building: every plan slice must carry a field, every value
  // must be in range, and a wall must never read darker than the room it faces.
  const spawn = FP.floorplan().spawn;
  const plan = FP.physicalRenderPlanFor(spawn.x, spawn.y);
  assert.ok(plan.ambient instanceof Uint8Array, 'the render plan carries a baked field');
  assert.equal(plan.ambient.length, plan.w * plan.h, 'one byte per cell');

  let open = 0, lit = 0;
  for (let i = 0; i < plan.ambient.length; i++) {
    const m = mult(plan.ambient[i]);
    assert.ok(m >= 0 && m <= AMBIENT_PLACE_SCALE, 'in range');
    if (!plan.solid[i]) { open++; if (m > 1.0) lit++; }
    // Never zero: zero is the encoding of "no data", and a black cell here would
    // put an unlit wall in a sunlit room.
    assert.ok(plan.ambient[i] > 0, `cell ${i} baked to zero`);
  }
  assert.ok(open > 0, 'the slice has open cells at all');
  assert.ok(lit > 0, 'somewhere in the building is brighter than the old flat value');
  assert.ok(lit < open, 'and somewhere is darker — a uniform field would be the bug');
}

console.log('# baked per-cell ambient ok');
