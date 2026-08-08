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
import { exteriorAmbientInstances } from '../src/game/exterior-ambient.js';

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

const normal=exteriorAmbientInstances({timeSec:12,reducedMotion:false});
const reduced=exteriorAmbientInstances({timeSec:12,reducedMotion:true});
assert.equal(normal.length,EXTERIOR_AMBIENT_NODES.length);
assert.ok(normal.every(({structural,ambient})=>!structural&&ambient),'ambient actors must never block routes');
assert.notDeepEqual(normal.map(({x,z})=>[x,z]),reduced.map(({x,z})=>[x,z]),'reduced motion changes ambient cadence');

assert.ok(conservatory.positionMigrations.some(({id})=>id==='yard-former-stables'));
assert.ok(DISTRICT_BOUNDS.x0<0&&DISTRICT_BOUNDS.y0<0);

console.log(`exterior civic block ok — ${streetWalk.size} reachable cells, ${EXTERIOR_LOTS.length} occupied lots, ${CONSERVATORY_PROPS.filter(({mesh})=>mesh==='city_parked_car').length} parked vehicles`);
