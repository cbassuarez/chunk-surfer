import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CHUNK_SURF_ROOMS } from '../src/data/chunk-surf-script.js';
import { CELL, MATERIAL, ZONE } from '../src/data/floorplan/legend.js';
import {
  freshChunkSurfState,
  reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';
import {
  SOURCE_ATLAS,
  SOURCE_PLAN_SNAP,
  SOURCE_PLAN_WINDOW,
  createSourceSpaceRuntime,
  validateSourceAtlas,
} from '../src/game/source-space-runtime.js';

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function hallState(distance = 0) {
  let state = freshChunkSurfState({ seed: 4417, returnPoint: { x: 86, y: 58 } });
  state = reduceChunkSurf(state, { type: 'SOURCE_ENTERED', returnPoint: state.returnPoint });
  return reduceChunkSurf(state, { type: 'HALL_ADVANCED', distance });
}

assert.equal(validateSourceAtlas(SOURCE_ATLAS).ok, true);
assert.equal(SOURCE_ATLAS.schemaVersion, 2);
assert.equal(SOURCE_ATLAS.exactSource, true);
assert.equal(SOURCE_ATLAS.stats.sectors, 8);
assert.doesNotMatch(JSON.stringify(SOURCE_ATLAS), /https?:\/\//i);
assert.doesNotMatch(JSON.stringify(SOURCE_ATLAS), /\/Users\//);
assert.doesNotMatch(JSON.stringify(SOURCE_ATLAS), /\b(process\.env|import\.meta\.env)\b/);
assert.ok(CHUNK_SURF_ROOMS.every((room) => !('lines' in room) && !('tunedLines' in room)), 'visible pseudo-code was removed from authored narrative data');

for (const entry of Object.values(SOURCE_ATLAS.entries)) {
  const file = await readFile(resolve(entry.file), 'utf8');
  const exact = file.split(/\r?\n/)[entry.line - 1];
  assert.equal(exact, entry.text, `${entry.file}:${entry.line} is exact`);
  assert.equal(hash(exact), entry.hash, `${entry.file}:${entry.line} hash matches`);
  assert.ok(entry.tokens.every((token) => exact.slice(token.start, token.end) === token.text), 'token offsets refer to exact text');
}

{
  const runtime = createSourceSpaceRuntime({ initialState: hallState(0) });
  const plan = runtime.geometry.renderPlanFor(0, 0);
  assert.equal(plan.w, SOURCE_PLAN_WINDOW);
  assert.equal(plan.h, SOURCE_PLAN_WINDOW);
  assert.equal(Math.abs(plan.originX % SOURCE_PLAN_SNAP), 0);
  assert.equal(Math.abs(plan.originY % SOURCE_PLAN_SNAP), 0);
  for (const [x, y] of [[0, 0], [5, -40], [-5, -80], [7, -20]]) {
    const localX = Math.floor(x - plan.originX), localY = Math.floor(y - plan.originY);
    const flags = plan.rgba[(localY * plan.w + localX) * 4 + 2];
    assert.equal(Boolean(flags & 1), runtime.geometry.isSolid(x, y), `render/collision parity at ${x},${y}`);
  }
  assert.equal(runtime.geometry.zoneAt(0, -50), ZONE.sourceSpace);
}

{
  const counts=[];
  for (const distance of [0, 28, 56, 84, 112]) {
    const runtime=createSourceSpaceRuntime({initialState:hallState(distance)});
    counts.push(runtime.propInstances(0,-distance/CELL).length);
  }
  assert.ok(counts.every((count,index)=>index===0||count>=counts[index-1]), 'page population is monotonic');
  assert.ok(counts.at(-1) >= 600, 'haystack population reaches the authored cap');
}

{
  let state=hallState(112);
  state=reduceChunkSurf(state,{type:'HAYSTACK_REACHED',origin:{x:0,y:-224},slot:3});
  const runtime=createSourceSpaceRuntime({initialState:state});
  const pages=runtime.propInstances(0,-224);
  assert.equal(pages.filter((page)=>page.interactiveId==='source-page').length,1,'exactly one page is interactive');
  assert.ok(pages.every((page)=>page.matrix?.length===16),'all pages use complete matrices');
  assert.ok(runtime.textInstances({px:0,py:-224}).every((text)=>SOURCE_ATLAS.entries[text.sourceId]),'page decals carry provenance-backed source');
}

{
  let state=hallState(112);
  state=reduceChunkSurf(state,{type:'HAYSTACK_REACHED',origin:{x:0,y:-224},slot:0});
  state=reduceChunkSurf(state,{type:'HAYSTACK_PAGE_FOUND',landscapeOrigin:{x:0,y:-246}});
  const runtime=createSourceSpaceRuntime({initialState:state});
  const before=runtime.geometry.logicalToPhysical(0,-238);
  runtime.tick(5.5,{px:0,py:-238,facing:0});
  const after=runtime.geometry.logicalToPhysical(0,-238);
  assert.deepEqual({x:after.x,z:after.z},{x:before.x,z:before.z},'transformation never teleports the player');
  assert.equal(runtime.state().phase,'landscape');
  assert.ok([MATERIAL.sourceField,MATERIAL.sourcePath,MATERIAL.sourceFault].includes(runtime.geometry.materialAt(0,-250)));
}

console.log('chunk-surf 3d source-space specs passed');
