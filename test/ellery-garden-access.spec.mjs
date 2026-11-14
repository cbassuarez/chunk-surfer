import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as FP from '../src/world/floorplan.js';
import * as P from '../src/game/props.js';
import {conservatory as C} from '../src/data/floorplan/conservatory.js';
import {CELL,F,ZONE,isOutdoorZone} from '../src/data/floorplan/legend.js';
import {GLASS_COURT_COLLIDERS} from '../src/data/glass-court.js';
import {ELLERY_GARDEN_APPROACHES} from '../src/data/ellery-garden-approaches.js';
import {BOX_OFFICE_HATCH as H} from '../src/data/box-office.js';
import {buildChunkSurfGodPreset} from '../src/game/chunk-surf-god.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {actualBodyRoute,bodyAtWorld,worldBody} from './helpers/ellery-garden-body-route.mjs';

const compile=()=>{FP.compile(C.levels,C);P.propsInit(FP);FP.setAllDoorsOpen(false);P.setColliderGroupEnabled('glass-court',false);};
const body=(x,z)=>bodyAtWorld(FP,x,z);
const route=(from,to,options)=>actualBodyRoute(FP,P,from,to,options);
const requireRoute=result=>assert.ok(result.path,JSON.stringify(result));
function replay(path,keys=new Set()){
 for(const edge of path){const step=FP.canStep(edge.from.x,edge.from.y,edge.requested.x,edge.requested.y,{keys});assert.equal(step.ok,true,JSON.stringify(edge));const to=step.redirect||edge.requested;assert.deepEqual({x:to.x,y:to.y},edge.to);assert.equal(P.propCanOccupy(to.x,to.y,{from:edge.from}),true,JSON.stringify(worldBody(FP,to)));}
}

// These run against the production floorplan, fixed envelope and actual prop
// collision. No optional pack activation, no setSolid shortcuts or open-all.
test('both public gardens admit ordinary walking from the real north footway and back, with all interior doors shut',()=>{
 compile();
 for(const side of ['west','east']){
  const x=side==='west'?72.25:99.25,start=body(x,-.25),goal=body(side==='west'?80.25:93.25,21.25);
  const result=route(start,goal,{accept:p=>isOutdoorZone(FP.zoneAt(p.x,p.y))});requireRoute(result);replay(result.path);
  assert.ok(result.path.some(e=>e.portal===`north-footway-to-${side}-garden`),'actual '+side+' edge redirect is crossed');
  assert.ok(result.path.every(e=>isOutdoorZone(FP.zoneAt(e.to.x,e.to.y))),'no indoor room is used to fake public access');
  const back=route(goal,start,{accept:p=>isOutdoorZone(FP.zoneAt(p.x,p.y))});requireRoute(back);replay(back.path);
  assert.ok(back.path.some(e=>e.portal===`north-footway-to-${side}-garden`));
 }
});

test('fixed greenhouse sides and closed thresholds refuse public entry even with optional dressing disabled',()=>{
 compile();
 const inside=body(84.25,21.25);
 for(const[x,z]of[[80.25,21.25],[93.25,21.25],[72.25,-.25],[99.25,-.25]]){
  const result=route(body(x,z),inside);assert.equal(result.path,null,'unearned greenhouse access: '+JSON.stringify(result));
 }
 const fixed=GLASS_COURT_COLLIDERS.filter(c=>c.colliderGroup==='glass-court-envelope');assert.ok(fixed.length>=2);
 // Each pane's actual expanded physical body band stays blocked independently
 // of the optional interior/planting collider group.
 for(const x of[81.75,82.25,85.75,86.25])for(const z of[18.25,21.25,24.25]){
  const p=body(x,z);assert.ok(p);assert.equal(P.propCanOccupy(p.x,p.y),false,'fixed greenhouse band '+x+','+z);
 }
});

test('earned master-key access from the public garden reaches the retained pool through all three ordinary thresholds',()=>{
 compile();
 const start=body(73.25,13.75),atrium=body(84.25,12.25),pool=body(94.25,34.25),keys=new Set(['master']);
 const refused=FP.interactDoor(start.x,start.y,[1,0],new Set());assert.equal(refused.id,'dock-foyer-service');assert.equal(refused.why,'locked');
 const earned=FP.interactDoor(start.x,start.y,[1,0],keys);assert.equal(earned.id,'dock-foyer-service');assert.equal(earned.opened,true);
 FP.tickDoors(3,{playerX:start.x,playerY:start.y,onlyIds:['dock-foyer-service']});
 const entry=route(start,atrium,{keys});requireRoute(entry);replay(entry.path,keys);
 for(const[id,x,z,facing]of[['pool-lobby',84.25,13.25,[0,1]],['glasshouse-changing',84.25,25.25,[0,1]],['changing-pool',84.25,29.25,[0,1]]]){
  const p=body(x,z),result=FP.interactDoor(p.x,p.y,facing,keys);assert.equal(result.id,id);assert.equal(result.opened,true);
  FP.tickDoors(3,{playerX:p.x,playerY:p.y,onlyIds:[id]});
 }
 // Loaded optional interior obstacles must also leave the earned route usable.
 P.setColliderGroupEnabled('glass-court',true);
 const onward=route(atrium,pool,{keys});requireRoute(onward);replay(onward.path,keys);
 const doors=onward.path.map(e=>FP.doorAt(e.to.x,e.to.y)?.id).filter((v,i,a)=>v&&v!==a[i-1]);
 assert.deepEqual(doors,['pool-lobby','glasshouse-changing','changing-pool']);
 const back=route(pool,atrium,{keys});requireRoute(back);replay(back.path,keys);
});

test('the fitted box-office hatch is a view, never an entrance or a hand through the fixed pane',()=>{
 compile();
 for(const z of[8.75,9.25,10.25,10.75,11.25]){
  const from=body(H.aperture.x0-.25,z),target=body(H.aperture.x0+.25,z);
  assert.ok(from&&target);assert.equal(FP.isCollisionOnly(target.x,target.y),true);
  assert.equal(FP.canStep(from.x,from.y,target.x,target.y,{keys:new Set()}).ok,false,'fixed hatch collision at '+z);
 }
 const ledger=P.propById('box-office-ledger');assert.ok(ledger);
 // Isolate the actual authored ledger so a foreground prop cannot accidentally
 // hide an interaction-through-glass regression by winning the reticle tie.
 P.propsInit(FP,[{...ledger,inspectAt:{x:ledger.interactionX,y:ledger.interactionY}}]);
 for(const[x,z]of[[90.25,9.25],[90.25,10.25],[90.25,11.25]]){
  const at=body(x,z),w=worldBody(FP,at),yaw=Math.atan2(ledger.interactionX-w.x,-(ledger.interactionY-w.z));
  assert.equal(P.pickProp(at.x,at.y,1,6,{yaw})?.id,undefined,'private ledger can be inspected across hatch from '+x+','+z);
 }
});

test('all physical overlaps are zero and the D1 frame/detector share the actual two-metre aperture',()=>{
 compile();assert.deepEqual(FP.physicalSpanData().overlaps,[]);
 const door=FP.doorState().find(d=>d.id==='glasshouse-changing'),q=FP.logicalToPhysical(door.cx,door.cy);
 assert.deepEqual([q.x*CELL,q.y,q.z*CELL],[84,0,27]);assert.equal(door.cells.length,15);
 assert.equal(door.aperture.width,2);assert.equal(door.widthAxis,'x');
});

test('broken pool roof bays see sky only in actual uncovered columns; supported gallery overhang stays covered',()=>{
 compile();
 for(const[x,z]of[[84.25,40.25],[84.25,42.25]]){
  const p=body(x,z);assert.equal(FP.flagsAt(p.x,p.y)&F.SKY,F.SKY);assert.ok(FP.ceilAt(p.x,p.y)>=24);
  const column=FP.physicalSpanData().cells.get(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`)||[];
  assert.equal(column.some(s=>s.floor>=5&&s.floor<24),false,'an actual overhead span contradicts sky at '+x+','+z);
 }
 const retained=body(72.25,36.25);assert.equal(FP.flagsAt(retained.x,retained.y)&F.SKY,0);
});

test('the real-world private variants leave original Source construction and source packs unchanged',()=>{
 const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/ellery-garden-approaches.stats.json',import.meta.url)));
 for(const[file,record]of Object.entries(stats.sourcePacks)){
  const bytes=fs.readFileSync(new URL('../'+file,import.meta.url));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),record.sha256,'original Source asset changed '+file);
 }
 const built=buildChunkSurfGodPreset('landing'),runtime=createSourceSpaceRuntime({initialState:built.state});
 const actual=runtime.propInstances(built.position.x,built.position.y),variants=new Set(Object.values(ELLERY_GARDEN_APPROACHES.variants));
 assert.equal(actual.some(p=>variants.has(p.mesh)),false,'real-world shoulder variants must not rewrite the remembered Source room');
 assert.ok(actual.some(p=>p.mesh==='scene_dock_roof_structure'));
 const pool=C.levels.find(l=>l.id==='natatorium');assert.ok(pool,'the original natatorium construction remains retained');
});
