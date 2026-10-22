// THE BAKED SKIRTING MUST MATCH THE FLOORPLAN IT WAS BAKED FROM.
//
// Baseboards are generated from the compiled plan by build-props.mjs, which is
// the only thing that makes them attached — the previous attempt hand-typed a
// second wall's coordinates and floated. But baking has its own hazard: the
// floorplan is edited constantly, sometimes by somebody else working in
// parallel, and skirting that no longer matches its wall is the same bug
// wearing a new hat.
//
// So the pack records a digest of the wall runs it was built from, and this
// fails when they have moved on.
//
//   node tools/chunk_surfer/build-props.mjs
//
// is the fix, every time.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import {baseboardWallRuns,baseboardWallRunsDigest} from '../src/world/baseboard-hosting.js';
import { BASEBOARDS, PLAN_HASH, PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import * as PROPS from '../src/game/props.js';

FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});

const plan = {
  size: FP.planSize, isSolid: FP.isSolid, floorAt: FP.floorAt, zoneAt: FP.zoneAt,
  materialAt: FP.materialAt, doorAt: FP.doorAt, logicalToPhysical: FP.logicalToPhysical,
  physicalRenderPlanFor: FP.physicalRenderPlanFor,
};

const runs = baseboardWallRuns(plan);
const fresh = crypto.createHash('sha256').update(baseboardWallRunsDigest(runs,plan)).digest('hex');

assert.equal(fresh, PLAN_HASH,
  'The floorplan has changed since the prop pack was built, so the baked baseboards '
  + 'no longer match the walls they are drawn against.\n'
  + '  Rebuild: node tools/chunk_surfer/build-props.mjs');

// Every render group that has walls must have skirting, or a whole floor of the
// building quietly has none.
const groups = new Set(runs.filter((r) => r.renderGroup).map((r) => r.renderGroup));
for (const g of groups) {
  assert.ok(BASEBOARDS[g], `render group '${g}' has wall runs but no baked skirting`);
}
assert.ok(groups.size >= 5, 'suspiciously few render groups carry walls');

// A baked group is relative to the FIRST host's full physical transform,
// including its floor. W3 makes the current ground anchor a1.05m sill; that
// is safe only because builder vertices subtract that same height and runtime
// restores it. A blanket floorOverride0 would lower the whole group instead.
PROPS.propsInit(FP);
for(const [group,baked]of Object.entries(BASEBOARDS)){
  const prop=PROPS.propById(`baseboard-${group}`),anchorFloor=FP.floorAt(baked.anchor.x,baked.anchor.y);
  assert.ok(prop,`${group}: baked skirting has a runtime instance`);
  assert.ok(Math.abs(prop.floor+(prop.elevation||0)-anchorFloor)<1e-6,`${group}: runtime restores the exact baked anchor-height basis`);
  const lowestFloor=Math.min(...runs.filter(run=>run.renderGroup===group).map(run=>run.floor));
  const lowestVertexWorld=PROP_BOUNDS[baked.mesh].min[1]+prop.floor+(prop.elevation||0);
  assert.ok(Math.abs(lowestVertexWorld-lowestFloor)<=.0011,
    `${group}: actual packed low vertex${lowestVertexWorld} meets its floor${lowestFloor}, including a raised sill anchor`);
}

console.log(`baseboard freshness ok — ${runs.length} runs across ${groups.size} render groups`);
