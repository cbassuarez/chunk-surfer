import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {EXTERIOR_PUB as PUB,pubLogicalAt,pubPhysicalFromLocal,pubPhysicalAt,pubPhysicalYaw,pubExteriorLogicalAt,PUB_YARD_CONNECTORS,pubYardCellClaimed} from '../src/data/exterior-pub.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {PUB_ACTORS} from '../src/data/pub-population.js';
import {PUB_LIGHT_ANCHORS} from '../src/data/exterior-pub-furnishings.js';
import {CONSERVATORY_LIGHTS} from '../src/data/conservatory-lights.js';
import {EXTERIOR_COLLISION_GEOMETRY} from '../src/data/generated/exterior-collision.js';
import {courtyardWalk,pubBodyWorld} from './helpers/exterior-pub-route.mjs';
import {YARD_SERVICE_RANGES} from '../src/data/exterior-district.js';
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const start=[conservatory.spawn.x*2,conservatory.spawn.y*2];
const runtime=p=>[Math.floor(p.x*2),Math.floor(p.y*2)];
const packed=fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url));
const gltf=JSON.parse(packed.subarray(20,20+packed.readUInt32LE(12)));
const sameHeading=(actual,expected)=>assert.ok(Math.abs(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected)))<1e-12,
  `physical heading ${actual} must equal ${expected} modulo one turn`);

test('the Lyric inhabits the existing accessible rehearsal range, retaining that row and roof',()=>{
  assert.deepEqual(PUB.bounds,{x0:31,x1:47,z0:29.05,z1:34.45});
  const range=YARD_SERVICE_RANGES.find(r=>r.id===PUB.building.id);
  assert.ok(range);assert.equal(range.id,'yard-rehearsal-annex');
  assert.deepEqual([range.physical.x-range.w/2,range.physical.x+range.w/2,range.physical.y-range.d/2,range.physical.y+range.d/2],[31,47,29,39]);
  const row=PROPS.renderInstances({inscriptions:false}).find(p=>p.id===range.id);
  const facade=PROPS.renderInstances({inscriptions:false}).find(p=>p.id==='pub-complete-frontage');
  assert.ok(row,'the retained range cannot disappear because its old yard cell was masked by its own new room');
  const rowAt=pubPhysicalAt({x:range.physical.x,z:range.physical.y}),facadeAt=pubPhysicalAt(PUB.facadeAnchor);
  assert.deepEqual([row.x,row.z],[rowAt.x,rowAt.z]);sameHeading(row.yaw,pubPhysicalYaw(0));
  assert.deepEqual([facade.x,facade.z],[facadeAt.x,facadeAt.z]);sameHeading(facade.yaw,pubPhysicalYaw(-Math.PI/2));
  assert.equal(range.height,PUB.building.roofHeight);
  const mesh=gltf.meshes.find(m=>m.name==='exterior_pub_frontage');assert.ok(mesh,'the real movable shell is present');
  const signs=m=>(m.extras?.lettering||[]).filter(s=>s.id?.startsWith('pub-lyric-fascia-'));
  assert.equal(signs(mesh).length,2);
  assert.equal(signs(gltf.meshes.find(m=>m.name==='district_civic_frontage')).length,0,'the separate shell is the only Lyric sign owner');
  assert.ok(EXTERIOR_COLLISION_GEOMETRY.exterior_pub_frontage,'source-derived collision follows the real pub');
});

test('ordinary movement reaches both Lyric doors within the block, enters and returns without crossing a street',()=>{
  for(const d of PUB.doors){
    for(const publicDoor of PUB.doors)FP.setDoorOpen(publicDoor.id,false);
    const doorstep=runtime(pubExteriorLogicalAt(d.id)),route=courtyardWalk(FP,PROPS,start,doorstep);
    assert.ok(route,`${d.id}: ordinary spawn-to-pub route through the accessible block`);
    for(const p of route){const w=pubBodyWorld(FP,p);assert.ok(w.x>=0&&w.x<=49&&w.z>=0&&w.z<92,'the whole path stays on the block side of the road');}
    assert.equal(FP.zoneAt(...doorstep),ZONE.dock,'the external apron remains outdoor pavement');
    const toward=[doorstep[0],doorstep[1]+1];
    assert.equal(FP.canStep(...doorstep,...toward,{keys:new Set()}).ok,false,'the normal closed door blocks actual entry');
    const opened=FP.interactDoor(...doorstep,[0,1],new Set());assert.equal(opened?.id,d.id);assert.equal(opened.opened,true);
    FP.tickDoors(1.1,{playerX:doorstep[0],playerY:doorstep[1]});
    const walk=[doorstep];for(let i=0;i<4;i++){
      const p=walk.at(-1),next=[p[0],p[1]+1],step=FP.canStep(...p,...next,{keys:new Set()});
      assert.equal(step.ok,true,`${d.id}: step ${i} through open paired leaf`);assert.equal(step.redirect,undefined);
      assert.equal(PROPS.propCanOccupy(...next,{from:{x:p[0],y:p[1]}}),true);walk.push(next);
    }
    assert.equal(FP.zoneAt(...walk.at(-1)),ZONE.pub);
    const back=courtyardWalk(FP,PROPS,walk.at(-1),start);assert.ok(back,`${d.id}: normal exit and whole return to arrival`);
  }
});

test('pub logical save addresses, people, lights and service move together while the public apron gets a real seam',()=>{
  const d=PUB.doors[0];assert.deepEqual(pubLogicalAt(d.x,d.z),{x:35.25,y:445.25});
  const rendered=PROPS.renderInstances({inscriptions:false});
  for(const actor of PUB_ACTORS){const actual=rendered.find(p=>p.id===actor.id),w=pubPhysicalFromLocal(actor.local);assert.ok(actual,actor.id);assert.ok(Math.abs(actual.x-w.x)<1e-9&&Math.abs(actual.z-w.z)<1e-9,actor.id);sameHeading(actual.yaw,pubPhysicalYaw(actor.yaw));}
  for(const lamp of PUB_LIGHT_ANCHORS){const actual=CONSERVATORY_LIGHTS.find(l=>l.id===lamp.id),w=pubPhysicalFromLocal(lamp);assert.ok(actual,lamp.id);assert.equal(actual.x,w.x);assert.equal(actual.z,w.z);}
  assert.equal(PUB_YARD_CONNECTORS.length,0,'the cardinal physical apron joins its real neighbor without the obsolete translation-only connector');
  for(const door of PUB.doors){const point=runtime(pubExteriorLogicalAt(door.id));assert.equal(FP.usesPhysicalNavigationAt(...point),true);assert.equal(FP.physicalQuarterTurnsAt(...point),3);}
  assert.equal(pubYardCellClaimed(39,31),true,'the hidden yard copy beneath the inhabited room cannot be walked through');
  for(const[x,z]of[[26,86],[33,88],[40,89]])assert.equal(pubYardCellClaimed(x,z),false,'the retired tower-side footprint cannot retain hidden pub collision');
});
