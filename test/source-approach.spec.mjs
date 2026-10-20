// Hanging Shore preserves later Source pacing while replacing the first
// approach with real distance, fixed shores and an independent physical lift.
import assert from 'node:assert/strict';
import { CELL } from '../src/data/floorplan/legend.js';
import { MOVE_MS } from '../src/config.js';
import { SOURCE_APPROACH_CELLS, SOURCE_LIFTS, SOURCE_TIERS, SOURCE_TIER_BY_ID } from '../src/data/source-level.js';
import { SOURCE_HANGING_SHORE as SHORE, SOURCE_SHORE_DIRECT_METRES } from '../src/data/source-hanging-shore.js';
import { sourceApproachLights } from '../src/data/source-landing.js';
import { SOURCE_APPROACH_PACE, SOURCE_APPROACH_RED_ONSET_SECONDS, SOURCE_APPROACH_TARGET_SECONDS,
  SOURCE_APPROACH_TRAVEL_CELLS, SOURCE_PLAN_WINDOW, createSourceSpaceRuntime, sourceLandscapeFloorAt } from '../src/game/source-space-runtime.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET as P } from '../src/game/chunk-surf-god.js';
import { applySourceEmergencyTorch, resolveTorchLook } from '../src/render/lighting-model.js';
assert.equal(SOURCE_APPROACH_CELLS,SHORE.approachCells);
assert.equal(SOURCE_APPROACH_TRAVEL_CELLS*CELL,SOURCE_SHORE_DIRECT_METRES);
// Option B: about 35 seconds from the FOH door to the deck.
assert.ok(SOURCE_APPROACH_TARGET_SECONDS>=33&&SOURCE_APPROACH_TARGET_SECONDS<=37);
assert.equal(SOURCE_APPROACH_RED_ONSET_SECONDS,Infinity);
assert.ok(Math.abs(SOURCE_APPROACH_TRAVEL_CELLS*MOVE_MS*SOURCE_APPROACH_PACE/1000-SOURCE_APPROACH_TARGET_SECONDS)<1e-9);

// Later tier depths and their contiguous boundaries remain authored Source.
const depth=id=>Math.abs(SOURCE_TIER_BY_ID[id].from-SOURCE_TIER_BY_ID[id].to);
assert.equal(depth('fork'),80);assert.equal(depth('trace'),100);assert.equal(depth('return'),120);
const field=SOURCE_TIERS.filter(t=>t.field);
for(let i=1;i<field.length;i++)assert.equal(field[i].from,field[i-1].to);
let worst=0;
for(let y=field[0].from-10;y>=field.at(-1).to+10;y--){
  const rise=Math.abs(sourceLandscapeFloorAt(0,y)-sourceLandscapeFloorAt(0,y-1));
  assert.ok(rise<=.45,`later Source spine cliff at ${y}`);worst=Math.max(worst,rise);
}
assert.ok(worst>.2,'later Source was flattened');
assert.equal(SOURCE_LIFTS.length,0,'later Source stairs acquired ride controllers');

// A rolling bounded plan follows the long approach. It does not allocate a
// square containing both distant shores and every later Source chapter.
const built=buildChunkSurfGodPreset(P.LANDING,{seed:4417});
const r=createSourceSpaceRuntime({initialState:built.state}),o=r.state().landscapeOrigin;
const door=SHORE.portal.z/CELL;
const start={x:o.x+8,y:o.y+door-12,facing:0},mid={x:o.x+8,y:o.y+door-300,facing:0};
r.setPlayerPosition(start);const a=r.geometry.renderPlanFor(start.x,start.y);
r.setPlayerPosition(mid);const b=r.geometry.renderPlanFor(mid.x,mid.y);
assert.ok(a.w<=SOURCE_PLAN_WINDOW&&b.w<=SOURCE_PLAN_WINDOW);
assert.notEqual(a.originY,b.originY,'long first nothingness left the plan behind');
assert.equal(r.geometry.floorAt(mid.x,mid.y),0);
assert.ok(r.geometry.cellAt(mid.x+1000,mid.y)?.sourceShore,'lateral free walking found a field boundary');
assert.equal(r.sourceObjective().target,null);
assert.deepEqual(sourceApproachLights(),[]);
assert.equal(r.sourceEmergencyLightingFrame().active,false);
assert.equal(r.localLights().some(l=>l.kind==='emergency'),false);
assert.equal(r.propInstances(mid.x,mid.y,{reducedMotion:true}).some(p=>p.sourceVoidHorizon||p.sourceConnector||p.sourceStructure),false);
const torch=r.sourceFlashlightFrame();assert.equal(torch.profile,'shore');assert.equal(torch.xray,false);
const applied=applySourceEmergencyTorch(resolveTorchLook(),torch);
assert.equal(applied.sourceTorchMode,'none');assert.ok(applied.power>0);
console.log('source approach specs passed');
