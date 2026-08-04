// Helical flights: does the arc rasterise into a stair, or into a stair with
// holes in it?
//
// Every assertion here was a real failure mode measured while building this.
// A helix is a straight logical corridor wrapped onto a ring, and the wrapping
// is where it goes wrong: sample the ring at each angle and you get duplicate
// cells (the player steps and the camera does not move) and uncovered cells
// (rock pits in the tread ring). Partitioning the annulus instead makes both
// impossible by construction — so these tests exist to keep it a partition.
//
// This compiles its own synthetic plan rather than the conservatory, because the
// rule is about the mechanism and should hold for any arc anyone authors later.
// Safe to do: test/run-all.mjs spawns each file as its own process.
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import { STEP_UP } from '../src/data/floorplan/legend.js';

const TAU = Math.PI * 2;
const CENTRE = { x: 20, z: 20 };
const R_IN = 0.90, R_OUT = 2.95;
// 100 annulus cells over 20 wedges is exactly 5 each — a uniform partition, and
// the reason the run is 2.5 m (5 cells) wide: every cell of the ring then has a
// logical address and there is no tread fill at all. 24 treads was tried first
// and rasterises to a 3-cell wedge, which cannot carry a 4-cell run.
const TREADS = 20, WIDTH = 2.5;
const arc = {
  center: CENTRE, rInner: R_IN, rOuter: R_OUT, theta0: 0, sweep: TAU,
  newel: { floor: -0.60, ceil: 13.40 },
};
const flight = (id, y, fromH, toH, extra) => ({
  id, from: { x: 0, y }, to: { x: (TREADS - 1) / 2, y },
  fromH, toH, rises: TREADS, width: WIDTH, arc, ...extra,
});

FP.compile([{
  id: 'spiral_test', layer: 'spiral', space: 'spiral', renderGroup: 'ground',
  origin: { x: 0, y: 0 }, physicalOrigin: { x: 0, y: 0 }, base: 0,
  rows: Array.from({ length: 60 }, () => ' '.repeat(60)),
  stairs: [{
    id: 'test-spiral', zone: 'stair', material: 'serviceConcrete', head: 2.2,
    flights: [
      flight('lower', 40, 0, 4.8, { ceilFrom: 4.45, ceilTo: 9.65, groupFrom: 'ground', groupTo: 'upper' }),
      flight('upper', 45, 4.8, 10.0, { ceil: 13.40, groupFrom: 'upper', groupTo: 'academic' }),
    ],
    landings: [],
  }],
}], { width: 60, height: 60 });

const plan = FP.floorplan();
const phys = FP.physicalSpanData();
const cx = CENTRE.x * 2, cz = CENTRE.z * 2, ri = R_IN * 2, ro = R_OUT * 2;

{
  // Two coils stacked in one footprint is the entire premise. If they ever
  // vertically intersect the compiler is right to call it two structures in one
  // place, and the spiral is not buildable at these dimensions.
  assert.equal(phys.overlaps.length, 0, 'stacked coils must not be reported as overlaps');
  assert.equal(plan.arcs.length, 2, 'both flights registered an arc');
}

{
  // INJECTIVE. A duplicate is a tread the camera does not move across.
  const seen = new Map();
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) {
    const i = y * plan.w + x;
    if (plan.solid[i] || !plan.arcId[i]) continue;
    const k = `${plan.physicalX[i]},${plan.physicalY[i]}:${plan.arcId[i]}`;
    assert.ok(!seen.has(k), `two logical cells share physical ${k}`);
    seen.set(k, [x, y]);
  }
  assert.equal(seen.size, TREADS * 5 * 2, 'every tread cell of both coils is addressed exactly once');
}

{
  // SURJECTIVE onto the annulus. An uncovered cell is a hole in the tread ring.
  const addressed = new Set();
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) {
    const i = y * plan.w + x;
    if (!plan.solid[i] && plan.arcId[i]) addressed.add(`${plan.physicalX[i]},${plan.physicalY[i]}`);
  }
  const filled = new Set(plan.stairFill.map((f) => `${f.px},${f.pz}`));
  const holes = [];
  let annulus = 0;
  for (let pz = Math.floor(cz - ro) - 1; pz <= Math.ceil(cz + ro) + 1; pz++)
    for (let px = Math.floor(cx - ro) - 1; px <= Math.ceil(cx + ro) + 1; px++) {
      const r = Math.hypot(px + .5 - cx, pz + .5 - cz);
      if (r < ri || r > ro) continue;
      annulus++;
      if (!addressed.has(`${px},${pz}`) && !filled.has(`${px},${pz}`)) holes.push(`${px},${pz}`);
    }
  assert.equal(holes.length, 0, `annulus cells with no geometry: ${holes.slice(0, 8).join(' ')}`);
  assert.equal(annulus, 100, 'the authored annulus is 100 cells');
}

{
  // Risers. The last tread sits one riser BELOW the top, because `rises` counts
  // the step onto the landing — that is what makes the arrival a step rather
  // than a seam you are already level with.
  for (const [row, fromH, toH] of [[80, 0, 4.8], [90, 4.8, 10.0]]) {
    const hs = [];
    for (let s = 0; s < TREADS; s++) {
      const i = row * plan.w + s;
      if (!plan.solid[i]) hs.push(plan.floor[i]);
    }
    assert.equal(hs.length, TREADS, 'the whole run is walkable');
    // plan.floor is a Float32Array, so 4.8 stores as 4.800000190734863.
    assert.ok(Math.abs(hs[0] - fromH) < 1e-5, 'the first tread is at the bottom height');
    const rise = (toH - fromH) / TREADS;
    assert.ok(Math.abs(hs[TREADS - 1] - (toH - rise)) < 1e-6, 'the last tread is one riser short of the top');
    for (let k = 1; k < hs.length; k++) {
      assert.ok(Math.abs(hs[k] - hs[k - 1]) <= STEP_UP + 1e-5,
        `riser ${(hs[k] - hs[k - 1]).toFixed(3)} exceeds STEP_UP`);
    }
  }
}

{
  // THE SOFFIT. The scene shader draws one floor/ceiling pair per column, so the
  // coil overhead can never be seen as geometry. The lower flight's ceiling is
  // authored as the floor of the coil above minus a slab, which draws the right
  // underside at every bearing without the renderer fetching the other span.
  for (const [key, list] of phys.cells) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.floor - b.floor);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].floor >= sorted[i - 1].ceil - 1e-6,
        `coils intersect at ${key}: ceil ${sorted[i - 1].ceil} over floor ${sorted[i].floor}`);
    }
  }
}

{
  // The well. One span through the full height, so it resolves identically from
  // every observer height — which is the only reason it is visible at all.
  const newel = phys.cells.get(`${Math.round(cx)},${Math.round(cz)}`) || [];
  assert.equal(newel.length, 1, 'the newel is a single span, not a stack');
  assert.ok(Math.abs(newel[0].floor - -0.60) < 1e-5, 'the well opens below the bottom tread');
  assert.ok(Math.abs(newel[0].ceil - 13.40) < 1e-5, 'and closes above the top one');
}

{
  // The yaw offset turns the world under the player. It must be zero off an arc
  // (which is the entire building today), and go once round over one revolution.
  assert.equal(FP.arcYawOffset(0, 0, 0, 0), 0, 'no arc, no rotation');
  const bearings = [];
  for (let s = 0; s < TREADS; s++) {
    const p = FP.logicalToPhysical(s, 80);
    bearings.push(FP.arcYawOffset(s, 80, p.x, p.z));
  }
  const wrap = (v) => ((v % TAU) + TAU) % TAU;
  const steps = bearings.slice(1).map((v, i) => wrap(v - bearings[i]));
  const total = steps.reduce((a, b) => a + b, 0);
  // Monotone: it never turns back on itself. The step is deliberately NOT
  // asserted to be even — a raster cannot put cell centres at even angles, and
  // the measured spread is 8.8-33.7 degrees against an 18.0 mean. The camera
  // eases that; the geometry is not distorted to hide it.
  for (const s of steps) assert.ok(s > 0 && s < Math.PI, 'the turn never reverses');
  // Bearings are read at each wedge's OUTERMOST cell, which is not its centre, so
  // the total is a revolution less one tread give or take a wedge — not an exact
  // multiple. What must hold is that it goes round once and does not lap.
  assert.ok(total > TAU * 0.85 && total < TAU,
    `one revolution, got ${(total * 180 / Math.PI).toFixed(1)} degrees`);
}

{
  // logicalToPhysical must stay byte-identical on integers even on an arc:
  // registerConnector compares those results for exact coincidence, and ~25 call
  // sites pass integers meaning "that cell". Only the sub-cell offset rotates.
  for (let s = 0; s < TREADS; s++) {
    const i = 80 * plan.w + s;
    const p = FP.logicalToPhysical(s, 80);
    assert.equal(p.x, plan.physicalX[i], 'integer x is the raw physical cell');
    assert.equal(p.z, plan.physicalY[i], 'integer z is the raw physical cell');
  }
  const off = FP.logicalToPhysical(5.5, 80.5), base = FP.logicalToPhysical(5, 80);
  const dx = off.x - base.x, dz = off.z - base.z;
  assert.ok(Math.abs(Math.hypot(dx, dz) - Math.hypot(0.5, 0.5)) < 1e-9,
    'the sub-cell offset is rotated, not scaled');
}

{
  // THE FIVE-METRE HOLE. Nearest-by-height picks the wrong coil over a large
  // part of the climb: standing on the top tread of the lower helix, the upper
  // helix's floor is nearer to the eye than the lower helix's own treads behind
  // you, so the stair you just walked redraws itself a storey up. Without the
  // owner preference this assertion fails across most of the ring, and in play
  // it looks like a renderer fault rather than a span-selection one.
  const lower = plan.arcs[0], upper = plan.arcs[1];
  assert.ok(lower && upper, 'both coils registered');

  // Stand on the LAST tread of the lower coil — the worst case, where the coil
  // above is closest in height.
  const topTread = { x: TREADS - 1, y: 80 };
  const slice = FP.physicalRenderPlanFor(topTread.x, topTread.y);
  const here = FP.logicalToPhysical(topTread.x, topTread.y);
  assert.ok(here.arcId, 'the observer is on an arc');

  let drawn = 0, wrong = [];
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) {
    const i = y * plan.w + x;
    if (plan.solid[i] || plan.arcId[i] !== here.arcId) continue;
    const px = plan.physicalX[i], pz = plan.physicalY[i];
    const j = pz * slice.w + px;
    if (slice.solid[j]) continue;
    drawn++;
    // The slice must show THIS coil's tread height, not the one above it.
    if (Math.abs(slice.floor[j] - plan.floor[i]) > 1e-4) {
      wrong.push(`${px},${pz}: drew ${slice.floor[j].toFixed(2)} want ${plan.floor[i].toFixed(2)}`);
    }
  }
  assert.ok(drawn > 80, `the lower coil is drawn at all (${drawn} columns)`);
  assert.equal(wrong.length, 0,
    `columns drawing the wrong coil: ${wrong.length}/${drawn} — ${wrong.slice(0, 4).join(' | ')}`);
}

console.log('# helical flights ok');
