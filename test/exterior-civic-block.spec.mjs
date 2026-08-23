import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { MATERIAL, ZONE } from '../src/data/floorplan/legend.js';
import {
  DISTRICT_BOUNDS,
  DISTRICT_COURTS,
  ELLERY_LINEAGE,
  ELLERY_MASSING,
  EXTERIOR_AMBIENT_NODES,
  EXTERIOR_INSPECTABLES,
  EXTERIOR_LOTS,
  districtLogicalAt,
} from '../src/data/exterior-district.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import { exteriorAmbientInstances, exteriorHeadlightLights } from '../src/game/exterior-ambient.js';
import { EXTERIOR_LORE, exteriorLoreConversation, exteriorLoreLines } from '../src/data/exterior-lore.js';
import { YARD_BENCH_ACTION, yardBenchSeatPose, yardBenchSitFrame, yardBenchStandFrame } from '../src/game/yard-bench-action.js';
import * as PROPS from '../src/game/props.js';

const plan=FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,
  doors:conservatory.doors,
});
FP.setSpawn(conservatory.spawn.x,conservatory.spawn.y);

assert.deepEqual(ELLERY_LINEAGE.map(({year})=>year),[1888,1908,1912,1936,1967,1986,2026]);
assert.equal(ELLERY_LINEAGE.find(({id})=>id==='chapel').year,1908);
assert.equal(ELLERY_MASSING.length,5);
assert.ok(ELLERY_MASSING.find(({id})=>id==='hall').setback>=8,'fly tower remains withdrawn');
assert.ok(EXTERIOR_LOTS.length>=10&&EXTERIOR_LOTS.every(({occupied})=>occupied));
assert.equal(DISTRICT_COURTS.length,4,'each side has a secondary court or passage');
assert.equal(EXTERIOR_INSPECTABLES.length,4,'lineage is physically inspectable');

const slice=FP.physicalRenderPlanFor(...Object.values(FP.toRuntimePoint(conservatory.spawn)));
assert.ok(slice.originX<0&&slice.originY<0,'the first-class world includes negative city coordinates');
assert.ok(slice.w>350&&slice.h>280,'the ground render slice contains the surrounding block');
const overlaps=FP.physicalSpanData().overlaps;
assert.ok(overlaps.length===0,`physical plan overlaps: ${overlaps.length}`);

const point=(x,y)=>FP.toRuntimePoint(districtLogicalAt(x,y));
const key=({x,y})=>`${x},${y}`;
function flood(keys=new Set()){
  const start=FP.spawn(),seen=new Set([key(start)]),queue=[start];
  while(queue.length){
    const here=queue.shift(),connector=FP.connectorDestination(here.x,here.y);
    if(connector&&!seen.has(key(connector))){seen.add(key(connector));queue.push(connector);}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const next={x:here.x+dx,y:here.y+dy};if(seen.has(key(next)))continue;
      const move=FP.canStep(here.x,here.y,next.x,next.y,{keys});if(!move.ok)continue;
      const destination=move.redirect||next;if(seen.has(key(destination)))continue;
      seen.add(key(destination));queue.push(destination);
    }
  }
  return seen;
}

// The whole neighborhood, including every court end, is optional and reachable
// before taking a key from the porter.
const streetWalk=flood();
const loopProbes=[[-7,-7],[-7,50],[50,-7],[135,50],[50,99]];
for(const [x,y] of loopProbes)assert.ok(streetWalk.has(key(point(x,y))),`street loop stranded at ${x},${y}`);
for(const court of DISTRICT_COURTS){
  const x=(court.x0+court.x1)/2,y=(court.y0+court.y1)/2;
  assert.ok(streetWalk.has(key(point(x,y))),`court stranded: ${court.id}`);
}

// A route ends in authored masonry, never in the legacy infinite generator.
// The main-loop guard is important too: migrated/debug state may still carry a
// non-zero procedural depth while Ellery's plan remains the active world.
const westCourtEnd=point(-30,24);
assert.equal(FP.canStep(westCourtEnd.x,westCourtEnd.y,westCourtEnd.x-2,westCourtEnd.y).ok,false,'the west mews terminates at an occupied threshold');
const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(mainSource,/if\(RENDERER==='3d' && \(usingPlan\(\)\|\|depth===0\)\)/,'authored containment survives stale procgen depth');

for(const [x,y] of loopProbes){
  const cell=FP.cellAt(...Object.values(point(x,y)));
  assert.equal(cell.zone,ZONE.street);
  assert.equal(cell.material,MATERIAL.wetTarmac);
  assert.ok(cell.ceil>=8&&cell.ceil<=16,'street ceiling follows its neighboring frontage');
}
const pavement=FP.cellAt(...Object.values(point(-13,40)));
assert.equal(pavement.zone,ZONE.civicCourt);
assert.equal(pavement.material,MATERIAL.wetPaving);

// With the porter-issued master available, the unchanged direct job route still
// reaches the authored get-in point behind the grey service door.
for(const door of FP.doorState())if(!door.keyId||door.keyId==='master')FP.setDoorOpen(door.id,true);
const keyedWalk=flood(new Set(['master']));
assert.ok(keyedWalk.has(key(FP.toRuntimePoint(conservatory.greyDoorApproach))),'grey door spine is unreachable');

const propIds=new Set(CONSERVATORY_PROPS.map(({id})=>id));
const propMeshes=new Set(CONSERVATORY_PROPS.map(({mesh})=>mesh));
for(const name of ['district_terrace_frontage','district_civic_frontage','district_workshop_frontage','district_passage_frontage']){
  assert.ok(PROP_MESH[name]&&!PROP_MESH[name].blocks,`${name} contract missing`);
  assert.ok(propMeshes.has(name),`${name} has no world placement`);
}
for(const inspectable of EXTERIOR_INSPECTABLES)assert.ok(propIds.has(inspectable.id));
assert.ok(CONSERVATORY_PROPS.filter(({mesh})=>mesh==='city_parked_car').length>=8,'streets are insufficiently occupied');

const loreProps=CONSERVATORY_PROPS.filter(({action})=>action==='exterior-lore');
assert.equal(loreProps.length,3,'three optional exterior conversations are authored');
assert.deepEqual(new Set(loreProps.map(({loreId})=>loreId)),new Set(Object.keys(EXTERIOR_LORE)));
assert.ok(loreProps.every(({blocks})=>blocks===false),'side-lore locals never obstruct the route');
for(const prop of loreProps){
  assert.ok(exteriorLoreLines(prop.loreId)?.length>=2,`${prop.id} has no first conversation`);
  assert.ok(exteriorLoreLines(prop.loreId,{revisited:true})?.length>=1,`${prop.id} has no revisit line`);
  const conversation=exteriorLoreConversation(prop.loreId);
  assert.equal(conversation.startAt,'start');
  assert.ok(Object.keys(conversation.tree).length>=10,`${prop.id} is still a short speech rather than a conversation tree`);
  assert.ok(conversation.tree.start.choices.length>=4,`${prop.id} has no meaningful opening decision board`);
  assert.equal(exteriorLoreConversation(prop.loreId,{revisited:true}).startAt,'return');
  for(const [nodeId,node] of Object.entries(conversation.tree)){
    if(node.goto)assert.ok(conversation.tree[node.goto],`${prop.id}:${nodeId} points to missing dialogue node ${node.goto}`);
    for(const choice of node.choices||[])assert.ok(!choice.goto||conversation.tree[choice.goto],`${prop.id}:${nodeId} points to missing dialogue node ${choice.goto}`);
  }
}
assert.deepEqual(loreProps.map(({mesh})=>mesh),[
  'exterior_bus_woman','exterior_mews_neighbor','exterior_pub_driver',
]);
const lookBench=CONSERVATORY_PROPS.find(({id})=>id==='yard-look-bench');
assert.equal(lookBench?.action,'yard-vigil-bench');
assert.equal(PROP_MESH[lookBench?.mesh]?.blocks,false);
PROPS.propsInit(FP);
for(const prop of [...loreProps,lookBench]){
  assert.ok(PROPS.propById(prop.id),`${prop.id} was filtered out of the compiled world`);
  assert.ok(PROPS.pathToProp(FP.spawn().x,FP.spawn().y,prop.id,new Set()),`${prop.id} cannot be reached from arrival`);
}

const propStats=JSON.parse(readFileSync(new URL('../public/assets/conservatory-props.stats.json',import.meta.url),'utf8'));
assert.ok(propStats.meshes.yard_van.triangles>=1200,'the van front has regressed to a block proxy');
assert.ok(propStats.meshes.yard_look_bench.triangles>=180,'the sit/look bench needs a readable authored silhouette');
assert.ok(propStats.bounds.yard_van.min[2]>=-3.6&&propStats.bounds.yard_van.max[2]<=3.1,'front detail escaped the established van footprint');
assert.ok(propStats.meshes.city_moving_car.triangles>=500,'moving traffic regressed to a sliding low-detail car proxy');
for(const mesh of['exterior_bus_woman','exterior_mews_neighbor','exterior_pub_driver']){
  assert.ok(propStats.meshes[mesh].triangles>=500,`${mesh} has regressed to a featureless figure`);
}

const compiledBench=PROPS.propById('yard-look-bench');
const seat=yardBenchSeatPose(compiledBench);
assert.ok(Math.abs(seat.yaw-Math.PI/2)>.05,'the authored seat does not turn to compose the gate overlook');
const sitEnd=yardBenchSitFrame({origin:{x:seat.approachX,y:seat.approachY,yaw:seat.yaw-Math.PI,pitch:0},seat,elapsed:YARD_BENCH_ACTION.sitDuration});
assert.equal(sitEnd.done,true);
assert.deepEqual([sitEnd.x,sitEnd.y],[seat.x,seat.y]);
assert.ok(sitEnd.floorOffset<-.65,'sitting never lowers the first-person eye to seated height');
const standEnd=yardBenchStandFrame({seat,look:{yaw:seat.yaw,pitch:seat.pitch},elapsed:YARD_BENCH_ACTION.standDuration});
assert.equal(standEnd.done,true);
assert.deepEqual([standEnd.x,standEnd.y],[seat.approachX,seat.approachY]);

const spanner=CONSERVATORY_PROPS.find(({id})=>id==='van-adjustable-spanner');
assert.ok(spanner.elevation>=1,'the optional spanner has fallen back onto the wet floor');
assert.match(spanner.label,/blue-handled/);
assert.equal(spanner.y,CONSERVATORY_PROPS.find(({id})=>id==='yard-van').y,'the spanner is not on the van shelf');

const normal=exteriorAmbientInstances({timeSec:12,reducedMotion:false});
const reduced=exteriorAmbientInstances({timeSec:12,reducedMotion:true});
assert.equal(normal.length,EXTERIOR_AMBIENT_NODES.length);
assert.ok(normal.every(({structural,ambient})=>!structural&&ambient),'ambient actors must never block routes');
assert.notDeepEqual(normal.map(({x,z})=>[x,z]),reduced.map(({x,z})=>[x,z]),'reduced motion changes ambient cadence');
const traffic=EXTERIOR_AMBIENT_NODES.filter(({kind})=>kind==='vehicle');
assert.ok(traffic.length>=4,'the district needs a bus and several moving cars');
assert.ok(traffic.every(({headlights})=>headlights),'every moving road vehicle must carry working night lamps');
const trafficAt12=normal.filter(({id})=>traffic.some((node)=>id===`exterior-ambient:${node.id}`));
assert.ok(trafficAt12.every(({headlights})=>headlights),'headlight state was dropped from the runtime traffic instances');
const trafficAt18=exteriorAmbientInstances({timeSec:18}).filter(({id})=>traffic.some((node)=>id===`exterior-ambient:${node.id}`));
assert.notDeepEqual(trafficAt12.map(({x,z})=>[x,z]),trafficAt18.map(({x,z})=>[x,z]),'moving cars must advance along their roads');
for(const instance of trafficAt12){
  const node=traffic.find(({id})=>instance.id===`exterior-ambient:${id}`),dx=node.to.x-node.from.x,dz=node.to.z-node.from.z,len=Math.hypot(dx,dz);
  const front=[Math.sin(instance.yaw),-Math.cos(instance.yaw)];
  assert.ok((front[0]*dx+front[1]*dz)/len>.999,`${node.id} drives forward rather than reversing down-route`);
}
const headlightPools=exteriorHeadlightLights({timeSec:12,origin:{x:trafficAt12[0].x,z:trafficAt12[0].z}});
assert.equal(headlightPools.length,4,'the two nearest road vehicles need paired headlight pools');
assert.ok(headlightPools.every(({color,intensity,radius})=>color[0]>color[2]&&intensity>0&&radius>=8),'headlights do not illuminate warm wet-road pools');
for(const pool of headlightPools){
  const car=normal.find(({id})=>id===pool.headlightOf);
  const ahead=(pool.x-car.x)*Math.sin(car.yaw)+(pool.z-car.z)*-Math.cos(car.yaw);
  assert.ok(ahead>3,'a headlight pool is not projected ahead of its moving car');
}
const propRendererSource=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
assert.match(propRendererSource,/matDef\.emissiveFactor/,'GLB emissive headlamp materials are ignored by the prop renderer');
assert.match(propRendererSource,/\+uMaterialEmissive/,'visible headlamp emission is not applied to prop colour');

assert.ok(conservatory.positionMigrations.some(({id})=>id==='yard-former-stables'));
assert.ok(DISTRICT_BOUNDS.x0<0&&DISTRICT_BOUNDS.y0<0);

console.log(`exterior civic block ok — ${streetWalk.size} reachable cells, ${EXTERIOR_LOTS.length} occupied lots, ${CONSERVATORY_PROPS.filter(({mesh})=>mesh==='city_parked_car').length} parked vehicles`);
