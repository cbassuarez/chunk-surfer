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
  sourceLandscapeFloorAt,
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

function landscapeState(){
  let state=hallState(112);
  state=reduceChunkSurf(state,{type:'HAYSTACK_REACHED',origin:{x:0,y:-224},slot:0});
  state=reduceChunkSurf(state,{type:'HAYSTACK_PAGE_FOUND',landscapeOrigin:{x:0,y:-252}});
  return reduceChunkSurf(state,{type:'TRANSFORMATION_COMPLETED'});
}

function fullyOpenLandscapeState(){
  let state=landscapeState();
  for(const id of ['fork-room','recordist-loop','body-room'])state=reduceChunkSurf(state,{type:'LANDMARK_TUNED',id});
  return state;
}

assert.equal(validateSourceAtlas(SOURCE_ATLAS).ok, true);
assert.equal(SOURCE_ATLAS.schemaVersion, 3);
assert.equal(SOURCE_ATLAS.exactSource, true);
assert.equal(SOURCE_ATLAS.stats.sectors, 8);
assert.doesNotMatch(JSON.stringify(SOURCE_ATLAS), /https?:\/\//i);
assert.doesNotMatch(JSON.stringify(SOURCE_ATLAS), /\/Users\//);
assert.doesNotMatch(JSON.stringify(SOURCE_ATLAS), /\b(process\.env|import\.meta\.env)\b/);
assert.ok(Object.keys(SOURCE_ATLAS.symbols).length>0&&SOURCE_ATLAS.references.length>0,'the atlas includes provenance-safe symbol relationships');
assert.ok(SOURCE_ATLAS.references.every((reference)=>SOURCE_ATLAS.entries[reference.entryId]?.hash===reference.hash),'every reference edge points back to an exact validated line');
assert.ok(CHUNK_SURF_ROOMS.every((room) => !('lines' in room) && !('tunedLines' in room)), 'visible pseudo-code was removed from authored narrative data');

const mainSource=await readFile(resolve('src/main.js'),'utf8');
const rendererSource=await readFile(resolve('src/render/r3d.js'),'utf8');
const crossingSource=await readFile(resolve('src/game/source-tower-transition-scene.js'),'utf8');
assert.match(mainSource,/tickHushAudio\(dt\);\s*tickChunkSurfOffer\(\);\s*tickSourceSpace\(dt\);/,'chapel Source offer is evaluated in the live world loop');
assert.match(mainSource,/function tickChunkSurfOffer\(\)\{[\s\S]*?return false;[\s\S]*?\}/,'proximity polling cannot auto-enter Source Space');
assert.match(mainSource,/ENTER SOURCE/,'the chapel threshold exposes an explicit Source interaction');
assert.match(mainSource,/if\(usingSourceSpace\(\)\)\{drawSourceHud\(cols,rows\);return;\}/,'Source uses its own HUD before any building map, battery, or takes UI');
assert.match(mainSource,/if\(SPEECH\.isSpeaking\(\)\|\|scenes\.blocksInput\(\)\)chunkSurfRuntime\.protectMoment/,'dialogue and blocking handoffs suspend Source pursuit');
assert.match(mainSource,/usingSourceSpace\(\)\)\{\s*const result=chunkSurfRuntime\.tuneFocused\([\s\S]*?if\(result\.handled\)\{[\s\S]*?return;\s*\}[\s\S]*?\}\s*if\(itemLost\('torch'\)\)/,'In Source, F tunes a focused landmark and otherwise falls through to the torch (the flashlight stays available)');
assert.match(mainSource,/textSpace:\s*sourceTextSpaceActive\(\)/,'only Source Space proper selects the clear text renderer');
assert.match(mainSource,/CHUNK_SURF_PHASE\.TRANSFORMING,CHUNK_SURF_PHASE\.LANDSCAPE,CHUNK_SURF_PHASE\.FINAL,CHUNK_SURF_PHASE\.COMPLETED/,'the physical long hall is excluded from text rendering');
assert.match(mainSource,/onDone:beginSourceTowerTransition/,'the completed Source endpoint feeds the tower crossing route');
assert.match(crossingSource,/r3dBeginDatamosh\?\.\(\{ reducedMotion \}\)/,'the endpoint route starts the authored datamosh renderer');
assert.match(rendererSource,/if \(textSpaceActive\) \{[\s\S]*drawTextSpace\(P3\.propTargets\(\)\.color\);[\s\S]*return;/,'Source Space exits before the normal material and pixel-mesh stack');
assert.match(rendererSource,/uSunrise/,'the text-space shader owns the deterministic sunrise look');
assert.match(mainSource,/r3dSetSourceScene\(scene\)/,'Source rendering is submitted as one keyed static and dynamic payload');

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
  const runtime=createSourceSpaceRuntime({initialState:hallState(0)});
  const sheets=runtime.propInstances(0,0);
  assert.deepEqual(runtime.textInstances({px:0,py:0}),[],'the long hall never uses Source Space text geometry');
  assert.ok(sheets.length>=180,'the regular 3D hall begins full of real sheet meshes');
  assert.ok(sheets.every((entry)=>entry.mesh==='loose_note'&&entry.matrix?.length===16),'every hall page is a rendered 3D sheet');
  assert.ok(sheets.some((entry)=>Math.abs(entry.matrix[12])>2.8),'sheet meshes reach both physical walls');
  assert.ok(sheets.some((entry)=>entry.matrix[13]>4),'sheet meshes occupy the ceiling as well as the floor');
  assert.equal(runtime.probe().pageCount,180,'the dense sheet field exists before hall progression');
}

{
  const runtime=createSourceSpaceRuntime({initialState:fullyOpenLandscapeState()});
  const architecture=[
    ...runtime.textInstances({px:0,py:-252}),
    ...runtime.textInstances({px:0,py:-394}),
    ...runtime.textInstances({px:80,py:-564}),
  ];
  // The long-hall page sheets end, but the open field surfaces the cathédrale
  // engloutie: real building meshes (vaults, bells, pews, the organ) leaking up
  // through the code, denser toward the end. They render via renderPropPass and
  // are composited by the text-space shader (solid stone half made of source).
  const leaked=[[0,-320],[0,-440],[0,-540],[40,-470],[-40,-390]].flatMap(([x,y])=>runtime.propInstances(x,y,{time:2}));
  assert.ok(leaked.length>0,'the open field surfaces drowned architecture as real meshes');
  assert.ok(leaked.some((entry)=>['chapel_vault','pew','altar_table','lectern','tower_bell_01','tower_bell_04','tower_frame','organ_console','organ_pipes','grand_piano','hall_structure','chapel_inner_screen'].includes(entry.mesh)),'real building geometry surfaces through the field (cathédrale engloutie)');
  assert.ok(leaked.every((entry)=>typeof entry.mesh==='string'&&entry.matrix?.length===16),'every surfaced/drift piece is a placed mesh');
  assert.ok(architecture.length>=450,'the authored causeways are densely described by overlapping source geometry');
  assert.ok(['ramp','frame','span','monolith','pillar','endpoint','reference'].every((surface)=>architecture.some((entry)=>entry.semantic===`text-architecture:${surface}`)), 'ramps, references, and large-scale structures are all built from source text');
  assert.ok(architecture.filter((entry)=>entry.overlapLayer!=='base').length>=180,'offset source layers overlap across the map');
  assert.ok(architecture.filter((entry)=>entry.redacted).length>=30,'selected source tokens are visibly redacted');
  for(const entry of architecture){
    const source=SOURCE_ATLAS.entries[entry.sourceId];
    assert.ok(source,`${entry.id} retains atlas provenance`);
    assert.equal(entry.sourceFile,source.file);
    assert.equal(entry.sourceLine,source.line);
    assert.equal(entry.sourceHash,source.hash);
    if(entry.semantic==='text-architecture:reference')assert.ok(source.tokens.some((token)=>token.kind==='identifier'&&token.text===entry.text),'reference architecture displays an exact identifier token');
    else if(entry.redacted) assert.notEqual(entry.text,source.text,'a redacted display line differs from its protected source');
    else assert.equal(entry.text,source.text,'unredacted architecture displays exact repository source');
    assert.doesNotMatch(entry.text,/https?:\/\//i);
    assert.doesNotMatch(entry.text,/\/Users\//);
  }
  assert.ok(architecture.every((entry)=>entry.matrix?.length===16&&[...entry.matrix].every(Number.isFinite)),'all text architecture uses complete finite matrices');
  assert.ok(sourceLandscapeFloorAt(0,-320)>12,'the terminal occupies the top of a substantial final ramp');
  for(let depth=0;depth<339;depth+=1)assert.ok(Math.abs(sourceLandscapeFloorAt(0,-depth-1)-sourceLandscapeFloorAt(0,-depth))<=.45,'every ramp step remains walkable without jumping');
  assert.ok(runtime.geometry.cellAt(80,-564),'the final horizon is reachable');
  // The field is now one open, freely-roamable ground (Oblivion-style) — off the
  // routes is walkable, not an invisible causeway wall. The routes survive only
  // as brighter path material for wayfinding; the only hard edge is the field's
  // own perimeter, rendered as a visible wall of code.
  assert.ok(runtime.geometry.cellAt(40,-450),'off-route space is open, walkable ground — no invisible causeway walls');
  assert.equal(runtime.geometry.cellAt(0,-900),null,'beyond the field perimeter there is no ground (sky, not corridor)');
}

{
  let state=hallState(112);
  state=reduceChunkSurf(state,{type:'HAYSTACK_REACHED',origin:{x:0,y:-224},slot:3});
  const runtime=createSourceSpaceRuntime({initialState:state});
  const sheets=runtime.propInstances(0,-224);
  assert.deepEqual(runtime.textInstances({px:0,py:-224}),[],'the haystack remains in the physical renderer');
  assert.equal(sheets.filter((entry)=>entry.interactiveId==='source-page').length,1,'exactly one real sheet mesh is interactive');
  const searchable=sheets.find((entry)=>entry.interactiveId==='source-page');
  const camera=runtime.geometry.logicalToPhysical(0,-224);
  assert.ok(Math.hypot(searchable.matrix[12]-camera.x*CELL,searchable.matrix[14]-camera.z*CELL)<=12,'interactive sheet is rendered near the haystack player in physical space');
}

{
  let state=hallState(112);
  state=reduceChunkSurf(state,{type:'HAYSTACK_REACHED',origin:{x:0,y:-224},slot:0});
  state=reduceChunkSurf(state,{type:'HAYSTACK_PAGE_FOUND',landscapeOrigin:{x:0,y:-252}});
  const runtime=createSourceSpaceRuntime({initialState:state});
  const before=runtime.geometry.logicalToPhysical(0,-238);
  runtime.tick(5.5,{px:0,py:-238,facing:0});
  const after=runtime.geometry.logicalToPhysical(0,-238);
  assert.deepEqual({x:after.x,z:after.z},{x:before.x,z:before.z},'transformation never teleports the player');
  assert.equal(runtime.state().phase,'landscape');
  assert.ok([MATERIAL.sourceField,MATERIAL.sourcePath,MATERIAL.sourceFault].includes(runtime.geometry.materialAt(0,-250)));
}

{
  let state=landscapeState();
  for(const event of [
    {type:'LANDMARK_TUNED',id:'fork-room'},
    {type:'LANDMARK_TUNED',id:'recordist-loop'},
    {type:'LANDMARK_TUNED',id:'body-room'},
    {type:'FINAL_REACHED'},
  ])state=reduceChunkSurf(state,event);
  let completed=null;
  const runtime=createSourceSpaceRuntime({initialState:state,onComplete:(result,snapshot)=>{completed={result,snapshot};}});
  const endpoint={x:80,y:-566,facing:0};
  runtime.setPlayerPosition(endpoint);
  assert.equal(runtime.finalEncounterRequest()?.adapter,'combat-v1','the terminal endpoint requests shared signal combat');
  const resolved=runtime.resolveFinalEncounter({outcome:'rescue',won:true,channels:{rescue:4,contain:0,submit:0},turns:8,compatibility:{adapter:'combat-v1'}});
  assert.equal(resolved.handled,true,'winning signal combat completes Source Space');
  assert.equal(runtime.state().completed,true);
  assert.ok(completed?.snapshot?.sourceIds?.length,'endpoint completion produces the snapshot consumed by the datamosh route');
}

console.log('chunk-surf 3d source-space specs passed');
