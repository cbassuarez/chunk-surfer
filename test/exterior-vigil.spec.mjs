// THE QUIET VIGIL: roster, routes, writing, persistence and unsynchronised life.

import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync} from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import * as PROPS from '../src/game/props.js';
import {freshSave} from '../src/game/save.js';
import {ENDING_MANIFEST,endingContractErrors} from '../src/data/endings.js';
import {ENDING_IDS} from '../src/progression/schema.js';
import {
  VIGIL_CLEARANCES,VIGIL_CROWD,VIGIL_ENDING_ACTIONS,VIGIL_ENDING_INSERTS,VIGIL_ENDING_OMISSIONS,
  VIGIL_LINKED_CHAPELS_FLAG,VIGIL_MESHES,VIGIL_MIN_CORRIDOR,VIGIL_OBSERVATIONS,VIGIL_PART_MESHES,
  VIGIL_STATIC_PARTS,VIGIL_VOICES,vigilConversation,vigilFigures,vigilParts,
} from '../src/data/exterior-vigil.js';
import {
  VIGIL_ACTION_CONCURRENCY,VIGIL_ACTION_MAX_WAIT_MS,VIGIL_ACTION_MIN_WAIT_MS,VIGIL_OBSERVATION_BUDGET,
  freshExteriorVigilState,freshVigilActionState,normalizeExteriorVigilState,reduceExteriorVigilObservation,
  scheduleVigilActions,vigilActionFrame,vigilContextAt,vigilYardPhysical,
} from '../src/game/exterior-vigil.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});
FP.setSpawn(conservatory.spawn.x,conservatory.spawn.y);PROPS.propsInit(FP);
const figures=vigilFigures(),named=figures.filter((entry)=>entry.talkable),parts=vigilParts();

// Roster and procedural silhouette grammar.
assert.equal(figures.length,24);assert.equal(named.length,6);assert.equal(VIGIL_CROWD.length,18);
assert.equal(new Set(figures.map(({id})=>id)).size,24);
const backgroundMeshes=new Set(VIGIL_CROWD.map(({mesh})=>mesh));
assert.ok(backgroundMeshes.size>=12,`only ${backgroundMeshes.size} background silhouettes`);
for(const suffix of['umbrella','placard','flask','seated','pamphlets','camera'])assert.ok([...backgroundMeshes].some((mesh)=>mesh.includes(suffix)),`no ${suffix} silhouette`);
const buildSource=readFileSync('tools/chunk_surfer/build-props.mjs','utf8');
const humanGenerator=buildSource.slice(buildSource.indexOf('function buildExteriorLocal'),buildSource.indexOf("buildExteriorLocal('exterior_bus_woman'"));
assert.doesNotMatch(humanGenerator,/addEllipsoid|headY[^\n]+MAT\.terracotta|headY[^\n]+MAT\.black[^\n]+\.0[12]/,'exterior people still have toy facial modelling');
assert.match(humanGenerator,/addCylinder\([^\n]+,6\)/,'heads and gloves are faceted');
for(const local of['exterior_bus_woman','exterior_mews_neighbor','exterior_pub_driver'])assert.match(buildSource,new RegExp(`buildExteriorLocal\\('${local}'`),`${local} did not receive the shared rebuild`);

// Built body bounds are inside truthful colliders. Independent kit is non-
// blocking and contained by its linked actor's declared envelope at rest.
for(const [name,box] of Object.entries(VIGIL_MESHES)){
  const bounds=PROP_BOUNDS[name];assert.ok(bounds,`${name} missing from pack`);assert.equal(box.blocks,true);
  const w=2*Math.max(Math.abs(bounds.min[0]),Math.abs(bounds.max[0])),d=2*Math.max(Math.abs(bounds.min[2]),Math.abs(bounds.max[2]));
  assert.ok(w<=box.w+1e-6,`${name} mesh wider than collision`);assert.ok(d<=box.d+1e-6,`${name} mesh deeper than collision`);assert.ok(bounds.max[1]<=box.h+1e-6,`${name} taller than collision`);
  assert.deepEqual(PROP_MESH[name],box);
}
for(const [name,box] of Object.entries(VIGIL_PART_MESHES)){assert.ok(PROP_BOUNDS[name],`${name} missing`);assert.equal(box.blocks,false);assert.deepEqual(PROP_MESH[name],box);}
for(const part of parts.filter(({actorId})=>actorId)){
  const actor=figures.find(({id})=>id===part.actorId),envelope=VIGIL_MESHES[actor.mesh],bounds=PROP_BOUNDS[part.mesh];
  assert.ok(bounds.min[0]>=-envelope.w/2-1e-6&&bounds.max[0]<=envelope.w/2+1e-6,`${part.id} escapes ${actor.id} sideways`);
  assert.ok(bounds.min[2]>=-envelope.d/2-1e-6&&bounds.max[2]<=envelope.d/2+1e-6,`${part.id} escapes ${actor.id} in depth`);
  assert.ok(bounds.max[1]<=envelope.h+1e-6,`${part.id} escapes ${actor.id} vertically`);
}

const bodyProps=figures.map(({id})=>CONSERVATORY_PROPS.find((prop)=>prop.id===id));
assert.ok(bodyProps.every(Boolean));assert.equal(bodyProps.filter(({action})=>action==='exterior-vigil').length,6);
assert.ok(bodyProps.every(({blocks})=>blocks===true));
for(const part of parts){const prop=CONSERVATORY_PROPS.find(({id})=>id===part.id);assert.ok(prop,`${part.id} unplaced`);assert.equal(prop.blocks,false);assert.equal(prop.interactive,false);}

// Authored four-metre lanes, non-overlapping bodies and collision-aware routes.
const PAD=.20,padded=(figure)=>{const box=VIGIL_MESHES[figure.mesh],c=Math.abs(Math.cos(figure.yaw)),s=Math.abs(Math.sin(figure.yaw)),hx=box.w/2*c+box.d/2*s+PAD,hy=box.w/2*s+box.d/2*c+PAD;return{x0:figure.x-hx,x1:figure.x+hx,y0:figure.y-hy,y1:figure.y+hy};};
for(const clearance of VIGIL_CLEARANCES){assert.ok(Math.min(clearance.x1-clearance.x0,clearance.y1-clearance.y0)>=VIGIL_MIN_CORRIDOR);for(const figure of figures){const a=padded(figure),overlap=a.x0<clearance.x1&&a.x1>clearance.x0&&a.y0<clearance.y1&&a.y1>clearance.y0;assert.ok(!overlap,`${figure.id} blocks ${clearance.id}`);}}
for(let i=0;i<figures.length;i+=1)for(let j=i+1;j<figures.length;j+=1){const a=padded(figures[i]),b=padded(figures[j]);assert.ok(!(a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0),`${figures[i].id} overlaps ${figures[j].id}`);}
const yardPoint=(x,y)=>FP.toRuntimePoint({x:50+x,y:200+y}),key=({x,y})=>`${x},${y}`;
function walk(){const start=FP.spawn(),seen=new Set([key(start)]),queue=[start],keys=new Set(['master']);while(queue.length){const here=queue.shift(),connector=FP.connectorDestination(here.x,here.y);if(connector&&!seen.has(key(connector))){seen.add(key(connector));queue.push(connector);}for(const [dx,dy] of[[1,0],[-1,0],[0,1],[0,-1]]){const next={x:here.x+dx,y:here.y+dy};if(seen.has(key(next)))continue;const move=FP.canStep(here.x,here.y,next.x,next.y,{keys});if(!move.ok)continue;const dest=move.redirect||next;if(seen.has(key(dest))||!PROPS.propCanOccupy(dest.x,dest.y))continue;seen.add(key(dest));queue.push(dest);}}return seen;}
for(const door of FP.doorState())if(!door.keyId||door.keyId==='master')FP.setDoorOpen(door.id,true);
const reachable=walk();
for(const [label,x,y] of[['park entrance',10,23],['fountain',10,33],['west apron',16,53],['south porch',26,73],['forecourt',31,53],['yard spine',26,34]])assert.ok(reachable.has(key(yardPoint(x,y))),`${label} unreachable`);
for(const figure of named)assert.ok(reachable.has(key(yardPoint(figure.approach.x,figure.approach.y))),`${figure.id} cannot be approached`);

// Six bounded conversations, two subjects, three truthful phases and organic
// name reveal. Spoken word counts include all authored paths, not directions or
// player prompts; return branches remain available without bloating first talk.
for(const [id,voice] of Object.entries(VIGIL_VOICES)){
  assert.equal(vigilConversation(id,{phase:'first'}).startAt,'start');
  assert.equal(vigilConversation(id,{phase:'immediate-revisit'}).startAt,'revisit');
  assert.equal(vigilConversation(id,{phase:'returned'}).startAt,'return');
  assert.ok((voice.tree.start.choices||[]).filter(({goto})=>goto).length>=2);assert.ok((voice.tree.start.choices||[]).some(({goto})=>!goto));
  const spoken=Object.values(voice.tree).flatMap((node)=>node.lines||[]).filter(({who})=>who!=='me'&&who!=='direction');
  const words=spoken.flatMap(({text})=>text.trim().split(/\s+/)).length;assert.ok(words>=170&&words<=230,`${id} has ${words} spoken words`);
  assert.notEqual(voice.tree.start.lines[0].who,voice.name,`${id} announces a name before its object reveals it`);
  assert.match(voice.tree.start.lines.find(({who})=>who==='direction')?.text||'',new RegExp(voice.name.split(' ')[0]+'|'+voice.name.split(' ')[1],'i'));
  for(const [nodeId,node] of Object.entries(voice.tree)){
    let run=0;for(const line of node.lines||[]){if(line.who===voice.name)run+=1;else run=0;assert.ok(run<=2,`${id}:${nodeId} gives a three-line answer`);}
    assert.ok(node.art?.id,`${id}:${nodeId} loses documentary art`);
  }
  assert.doesNotMatch((voice.tree.revisit.lines||[]).map(({text})=>text).join(' '),/you were in there|you went inside|since you came out/i,`${id} invents an entry on an immediate revisit`);
  assert.doesNotMatch(JSON.stringify(voice.tree),/as a (?:historian|recordist|custodian|student)|what witnessing means|evidence gets crushed|one instrument|transmitter|demolition is mercy/i,`${id} self-describes its thematic job`);
}

const setters=[];for(const [id,voice] of Object.entries(VIGIL_VOICES))for(const [node,nodeData] of Object.entries(voice.tree))if((nodeData.set||[]).includes(VIGIL_LINKED_CHAPELS_FLAG))setters.push({id,node});
assert.deepEqual(setters,[{id:'vigil-malcolm-vey',node:'line'}]);
assert.doesNotMatch(readFileSync('src/game/source-space-runtime.js','utf8'),/linkedChapels\s*(&&|\?)[^\n]*HORIZON_EXIT/,'recognition flag became an access gate');

// Twelve distinct documentary plates, bounded and object-centred.
const media=JSON.parse(readFileSync('content/media/story-art.media.json','utf8')),artById=new Map(media.storyArt.map((entry)=>[entry.id,entry]));
const artIds=Object.values(VIGIL_VOICES).flatMap((voice)=>[voice.art.id,voice.detailArt.id]);
assert.equal(new Set(artIds).size,12);
for(const id of artIds){const art=artById.get(id),asset=media.assets.find(({id:assetId})=>assetId===art?.assetId);assert.ok(art&&asset,`${id} unregistered`);assert.notEqual(art.tone,'person');assert.doesNotMatch(art.alt,/portrait|face|man in|woman in|person in/i);const file=`public/${asset.path}`;assert.ok(existsSync(file));assert.ok(statSync(file).size<500_000,`${file} oversized`);}

// Signs are authored language, not stripe texture.
const slogans=new Set([...VIGIL_CROWD.map(({note})=>note),...VIGIL_STATIC_PARTS.map(({label})=>label)]);
for(const slogan of['KEEP ELLERY STANDING','NO FIRST STRIKE / 06:00','SAVE THE 1908 CHAPEL','OUR ROOMS / OUR RECORD','WHO SIGNED THIS OFF?'])assert.ok(slogans.has(slogan),`${slogan} missing`);
assert.match(buildSource,/Five-by-seven raised lettering/);assert.match(buildSource,/raisedVigilLine/);
for(const mesh of['vigil_part_sign_save','vigil_part_sign_strike','vigil_part_sign_chapel','vigil_part_sign_record','vigil_part_sign_signed','vigil_part_banner'])assert.ok(PROP_BOUNDS[mesh].max[0]-PROP_BOUNDS[mesh].min[0]>=1.3,`${mesh} too narrow to read`);

// Two observations per run, context rather than fixed coordinates, persistent
// after reload, and a required walk into a different cluster for the second.
assert.equal(VIGIL_OBSERVATIONS.length,6);assert.equal(VIGIL_OBSERVATION_BUDGET,2);assert.ok(VIGIL_OBSERVATIONS.every((entry)=>entry.text.split(/\s+/).length<16));
assert.ok(vigilContextAt(28.8,52.8)?.cluster==='forecourt-east');
let observationState=freshExteriorVigilState('run-a'),first=null;
for(let i=0;i<20&&!first;i+=1){const step=reduceExteriorVigilObservation(observationState,{x:28.8,y:52.8,dtMs:1000,runId:'run-a'});observationState=step.state;first=step.observation;}
assert.ok(first);const reloaded=normalizeExteriorVigilState(JSON.parse(JSON.stringify(observationState)),{runId:'run-a'});assert.ok(reloaded.seen.includes(first.id));
let sameCluster=null;for(let i=0;i<20;i+=1){const step=reduceExteriorVigilObservation(observationState,{x:28.8,y:52.8,dtMs:1000,movedMetres:1});observationState=step.state;sameCluster||=step.observation;}assert.equal(sameCluster,null);
let second=null;for(let i=0;i<20&&!second;i+=1){const step=reduceExteriorVigilObservation(observationState,{x:39.8,y:43.2,dtMs:1000,movedMetres:i===0?15:0});observationState=step.state;second=step.observation;}assert.ok(second&&second.id!==first.id);assert.equal(observationState.emitted,2);
for(let i=0;i<40;i+=1)observationState=reduceExteriorVigilObservation(observationState,{x:37.4,y:64.2,dtMs:1000,movedMetres:1}).state;
assert.equal(observationState.emitted,2);assert.equal(new Set(observationState.seen).size,2);
assert.equal(reduceExteriorVigilObservation(observationState,{x:37.4,y:64.2,dtMs:5000,blocked:true}).observation,null);
assert.equal(freshSave().exteriorVigil,null,'old saves do not require migration');

// Unsynchronised actions: 9–24 second cadence, at most two, actor lock during
// conversation, held reduced-motion pose and identical timing/collision.
assert.equal(VIGIL_ACTION_CONCURRENCY,2);assert.equal(VIGIL_ACTION_MIN_WAIT_MS,9_000);assert.equal(VIGIL_ACTION_MAX_WAIT_MS,24_000);
let actionState={...freshVigilActionState('run-a'),waitMs:0};
let actionStep=scheduleVigilActions(actionState,{actors:figures,listener:{x:28.8,y:52.8},dtMs:0,runId:'run-a'});assert.equal(actionStep.state.active.length,1);
const firstActor=actionStep.state.active[0].actorId;
actionStep=scheduleVigilActions({...actionStep.state,waitMs:0},{actors:figures,listener:{x:28.8,y:52.8},dtMs:0,runId:'run-a'});assert.equal(actionStep.state.active.length,2);assert.equal(new Set(actionStep.state.active.map(({actorId})=>actorId)).size,2);
actionStep=scheduleVigilActions(actionStep.state,{actors:figures,listener:{x:28.8,y:52.8},dtMs:16,lockedActorId:firstActor});assert.ok(actionStep.state.active.every(({actorId})=>actorId!==firstActor));
const action={action:'placard-lower',durationMs:2400};const animated=vigilActionFrame(action,1200),reduced=vigilActionFrame(action,1200,{reducedMotion:true});assert.equal(animated.done,reduced.done);assert.ok(reduced.part&&Math.abs(reduced.part.dy)>.1);assert.equal(vigilActionFrame(action,2400).done,true);
for(const figure of figures){const before={x:figure.x,y:figure.y};vigilActionFrame({action:figure.actionSet[0],durationMs:2000},1000);assert.deepEqual({x:figure.x,y:figure.y},before,'action changed collision placement');}

// Only three visible endings mention or move the gathering.
assert.deepEqual(endingContractErrors(),[]);
assert.deepEqual(Object.keys(VIGIL_ENDING_INSERTS).sort(),['drugged','surfaced','tower-won']);
assert.deepEqual(Object.keys(VIGIL_ENDING_ACTIONS).sort(),['drugged','surfaced','tower-won']);
assert.deepEqual([...VIGIL_ENDING_OMISSIONS].sort(),['contact-lost','contact-won','helped','inversion','sacrifice','tower-lost']);
for(const id of ENDING_IDS)assert.ok(VIGIL_ENDING_INSERTS[id]||VIGIL_ENDING_OMISSIONS.includes(id),`${id} has no viewpoint decision`);
for(const [id,actions] of Object.entries(VIGIL_ENDING_ACTIONS))for(const action of actions)assert.ok(ENDING_MANIFEST[id].environment.some((step)=>step.kind==='vigil'&&step.action===action.action&&step.cluster===action.cluster));
for(const id of VIGIL_ENDING_OMISSIONS){const prose=JSON.stringify(ENDING_MANIFEST[id]).toLowerCase();assert.doesNotMatch(prose,/quiet vigil|the protesters|the protestors|the crowd outside/,`${id} narrates an unseen vigil`);}

assert.deepEqual(vigilYardPhysical(50,200),{x:0,y:0});
assert.equal(CONSERVATORY_PROPS.filter(({action})=>action==='exterior-lore').length,3,'ordinary exterior dialogue changed');
console.log(`exterior vigil specs passed (${figures.length} people, ${backgroundMeshes.size} background silhouettes, ${artIds.length} documentary plates)`);
