import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {EXTERIOR_PUB as PUB,pubLogicalAt,pubWorldFromLocal,pubExteriorLogicalAt,PUB_YARD_CONNECTORS,pubYardCellClaimed} from '../src/data/exterior-pub.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {PUB_ACTORS} from '../src/data/pub-population.js';
import {PUB_LIGHT_ANCHORS} from '../src/data/exterior-pub-furnishings.js';
import {CONSERVATORY_LIGHTS} from '../src/data/conservatory-lights.js';
import {EXTERIOR_COLLISION_GEOMETRY} from '../src/data/generated/exterior-collision.js';
import {districtPubWalk,pubBodyWorld} from './helpers/exterior-pub-route.mjs';
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const start=[conservatory.spawn.x*2,conservatory.spawn.y*2];
const runtime=p=>[Math.floor(p.x*2),Math.floor(p.y*2)];
const packed=fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url));
const gltf=JSON.parse(packed.subarray(20,20+packed.readUInt32LE(12)));

test('the real Lyric occupies the perpendicular south row first two deeds, not the tower courtyard',()=>{
  assert.deepEqual(PUB.bounds,{x0:-14,x1:2,z0:107.05,z1:112.45});
  const row=PROPS.renderInstances({inscriptions:false}).find(p=>p.id==='district-south-row-a');
  const facade=PROPS.renderInstances({inscriptions:false}).find(p=>p.id==='pub-complete-frontage');
  assert.deepEqual([row.x,row.z,row.yaw],[18,107.05,-Math.PI/2]);
  assert.deepEqual([facade.x,facade.z,facade.yaw],[-6,107.05,-Math.PI/2]);
  assert.equal(facade.z,row.z,'the actual facade shares the shop row front');
  assert.equal(facade.x,row.x-24,'the two-deed midpoint is exactly the original row slot');
  const mesh=gltf.meshes.find(m=>m.name==='exterior_pub_frontage');assert.ok(mesh,'the real movable shell is present');
  const signs=m=>(m.extras?.lettering||[]).filter(s=>s.id?.startsWith('pub-lyric-fascia-'));
  assert.equal(signs(mesh).length,2);
  assert.equal(signs(gltf.meshes.find(m=>m.name==='district_civic_frontage')).length,0,'the separate shell is the only Lyric sign owner');
  assert.ok(EXTERIOR_COLLISION_GEOMETRY.exterior_pub_frontage,'source-derived collision follows the real pub');
  // A closed ordinary shop formerly occupied these same bays. Its entire
  // ground volume must be omitted, rather than concealing a blocked pub door.
  const rowGeometry=EXTERIOR_COLLISION_GEOMETRY.district_civic_frontage;
  for(const z of[-30.75,-22.75])for(const wall of rowGeometry.walls){
    const [x0,z0,x1,z1,y0,y1]=wall;
    if(y1<=.45||y0>=1.7)continue;
    const withinDoorZ=Math.max(Math.min(z0,z1),z-.975)<Math.min(Math.max(z0,z1),z+.975)-1e-6;
    const spansDepth=Math.min(x0,x1)<.25&&Math.max(x0,x1)>-1.2;
    assert.equal(withinDoorZ&&spansDepth,false,'ordinary closed-shop masonry cannot overlap either public doorway');
  }
});

test('ordinary movement reaches both closed doors from the real opening spawn, crosses the street, enters and returns',()=>{
  for(const d of PUB.doors){
    for(const publicDoor of PUB.doors)FP.setDoorOpen(publicDoor.id,false);
    const doorstep=runtime(pubExteriorLogicalAt(d.id)),route=districtPubWalk(FP,PROPS,start,doorstep);
    assert.ok(route,`${d.id}: real spawn-to-shop route through production collision; no jump or diagnostic warp`);
    assert.ok(route.some(p=>{const w=pubBodyWorld(FP,p);return w.z>=93&&w.z<107;}),'the route physically crosses the perpendicular south street');
    assert.equal(FP.zoneAt(...doorstep),ZONE.civicCourt,'the external apron remains outdoor pavement');
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
    const back=districtPubWalk(FP,PROPS,walk.at(-1),start);assert.ok(back,`${d.id}: normal exit and whole return to arrival`);
  }
});

test('pub logical save addresses, people, lights and service remain one stable room without courtyard seams',()=>{
  const d=PUB.doors[0];assert.deepEqual(pubLogicalAt(d.x,d.z),{x:35.25,y:445.25});
  const rendered=PROPS.renderInstances({inscriptions:false});
  for(const actor of PUB_ACTORS){const actual=rendered.find(p=>p.id===actor.id),w=pubWorldFromLocal(actor.local);assert.ok(actual,actor.id);assert.ok(Math.abs(actual.x-w.x)<1e-9&&Math.abs(actual.z-w.z)<1e-9,actor.id);}
  for(const lamp of PUB_LIGHT_ANCHORS){const actual=CONSERVATORY_LIGHTS.find(l=>l.id===lamp.id),w=pubWorldFromLocal(lamp);assert.ok(actual,lamp.id);assert.equal(actual.x,w.x);assert.equal(actual.z,w.z);}
  assert.deepEqual(PUB_YARD_CONNECTORS,[],'the street row connects directly through its existing district floor');
  for(const[x,z]of[[26,86],[33,88],[40,89]])assert.equal(pubYardCellClaimed(x,z),false,'the retired tower-side footprint cannot retain hidden pub collision');
});
