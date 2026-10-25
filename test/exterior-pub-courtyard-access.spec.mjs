import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {EXTERIOR_PUB as PUB,pubLogicalAt,pubWorldFromLocal,pubExteriorLogicalAt,pubYardLogicalAt,PUB_YARD_CONNECTORS} from '../src/data/exterior-pub.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {PUB_ACTORS} from '../src/data/pub-population.js';
import {PUB_LIGHT_ANCHORS} from '../src/data/exterior-pub-furnishings.js';
import {CONSERVATORY_LIGHTS} from '../src/data/conservatory-lights.js';
import {EXTERIOR_COLLISION_GEOMETRY} from '../src/data/generated/exterior-collision.js';
import {courtyardWalk,pubBodyWorld} from './helpers/exterior-pub-route.mjs';
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const start=[conservatory.spawn.x*2,conservatory.spawn.y*2];
const runtime=p=>[Math.floor(p.x*2),Math.floor(p.y*2)];
const packed=fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url));
const gltf=JSON.parse(packed.subarray(20,20+packed.readUInt32LE(12)));

test('the real pub is on the accessible side of the street and is no longer baked into the far row',()=>{
  assert.ok(PUB.bounds.x0>=0&&PUB.bounds.x1<=49&&PUB.bounds.z0>=0&&PUB.bounds.z1<92,
    'the previous x−14..2,z107.05..112.45 pub failed this actual courtyard boundary');
  const mesh=gltf.meshes.find(m=>m.name==='exterior_pub_frontage');assert.ok(mesh,'an actual movable shell, not only a new map marker');
  const facade=PROPS.renderInstances({inscriptions:false}).find(p=>p.id==='pub-complete-frontage');
  assert.deepEqual([facade.x,facade.z],[PUB.facadeAnchor.x,PUB.facadeAnchor.z]);
  const signs=m=>(m.extras?.lettering||[]).filter(s=>s.id?.startsWith('pub-lyric-fascia-'));
  assert.equal(signs(mesh).length,2);assert.equal(signs(gltf.meshes.find(m=>m.name==='district_civic_frontage')).length,0,'no duplicate false pub remains opposite the street');
  assert.ok(EXTERIOR_COLLISION_GEOMETRY.exterior_pub_frontage,'physical source surfaces follow the relocated shell');
});

test('ordinary movement reaches both closed doors from the real opening spawn, opens them, enters and returns',()=>{
  for(const d of PUB.doors){
    FP.setDoorOpen(d.id,false);
    const doorstep=runtime(pubExteriorLogicalAt(d.id)),route=courtyardWalk(FP,PROPS,start,doorstep);
    assert.ok(route,`${d.id}: courtyard route with real collision; no jump, warp or street crossing`);
    for(const p of route){const w=pubBodyWorld(FP,p);assert.ok(w.x>=0&&w.x<=49&&w.z>=0&&w.z<92);}
    assert.equal(FP.zoneAt(...doorstep),ZONE.dock,'the external apron remains outside in rain');
    assert.equal(FP.canStep(...doorstep,doorstep[0],doorstep[1]+1,{keys:new Set()}).ok,false,'the normal closed door blocks actual entry');
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

test('pub logical save addresses, people, lights and service fixture move as one room',()=>{
  const d=PUB.doors[0];assert.deepEqual(pubLogicalAt(d.x,d.z),{x:35.25,y:445.25});
  const rendered=PROPS.renderInstances({inscriptions:false});
  for(const actor of PUB_ACTORS){const actual=rendered.find(p=>p.id===actor.id),w=pubWorldFromLocal(actor.local);assert.ok(actual,actor.id);assert.ok(Math.abs(actual.x-w.x)<1e-9&&Math.abs(actual.z-w.z)<1e-9,actor.id);}
  for(const lamp of PUB_LIGHT_ANCHORS){const actual=CONSERVATORY_LIGHTS.find(l=>l.id===lamp.id),w=pubWorldFromLocal(lamp);assert.ok(actual,lamp.id);assert.equal(actual.x,w.x);assert.equal(actual.z,w.z);}
  for(const c of PUB_YARD_CONNECTORS){assert.ok(c.from.x>=75&&c.from.y<284);}
  // The hidden yard copy below the room must not provide a no-clip bypass.
  for(const[x,z]of[[26,86],[33,88],[40,89]]){const p=pubYardLogicalAt(x,z);assert.equal(FP.isSolid(p.x*2,p.y*2),true);}
});
