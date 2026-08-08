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
import { wallRuns, wallRunsDigest } from '../src/world/wall-contact.js';
import { BASEBOARDS, PLAN_HASH } from '../src/data/generated/prop-geometry.js';

FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});

const plan = {
  size: FP.planSize, isSolid: FP.isSolid, floorAt: FP.floorAt, zoneAt: FP.zoneAt,
  materialAt: FP.materialAt, doorAt: FP.doorAt, logicalToPhysical: FP.logicalToPhysical,
};

const runs = wallRuns(plan);
const fresh = crypto.createHash('sha256').update(wallRunsDigest(runs)).digest('hex');

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

console.log(`baseboard freshness ok — ${runs.length} runs across ${groups.size} render groups`);
