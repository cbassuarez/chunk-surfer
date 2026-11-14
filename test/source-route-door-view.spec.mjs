import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildChapelOutskirtsGodPreset,buildBellsGodPreset} from '../src/game/chunk-surf-god.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {CELL,EYE,ZONE} from '../src/data/floorplan/legend.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
function fixture(route,{unlocked=false}={}){
 const built=route==='chapel'?buildChapelOutskirtsGodPreset(4,{seed:4417}):buildBellsGodPreset(440,{seed:4417});
 if(unlocked)built.state.station={...built.state.station,fieldReturns:{fieldIds:['first','second'],connectionIds:['field-return-a','field-return-b'],doorIds:[]}};
 const runtime=createSourceSpaceRuntime({initialState:built.state}),door=runtime.doorFieldDoors().find(d=>d.route===route);
 assert.ok(door);const origin={x:(door.threshold[0].x+door.threshold[1].x)/2,y:(door.threshold[0].y+door.threshold[1].y)/2};
 runtime.setPlayerPosition({...origin,y:origin.y+4});return{runtime,door,origin};
}
test('the chapel route exposes its actual final opening without manufacturing a tower gate or mutating the run',()=>{
 const {runtime,door}=fixture('chapel'),before=structuredClone(runtime.state()),view=runtime.routeDoorView();
 assert.ok(view);assert.equal(view.route,'chapel');assert.equal(view.id,door.id);assert.equal(runtime.towerDoorView(),null);
 assert.deepEqual(view.normal,door.normal);assert.deepEqual(view.forward,[-door.normal[0]||0,-door.normal[2]||0]);
 const [a,b,c,d]=view.corners;close(Math.hypot(...a.map((v,k)=>v-b[k])),view.width);close(Math.hypot(...b.map((v,k)=>v-c[k])),view.height);
 for(let axis=0;axis<3;axis++)close(view.origin[axis],(a[axis]+b[axis])/2);
 assert.deepEqual(a.map((v,k)=>v-d[k]),b.map((v,k)=>v-c[k]));
 assert.deepEqual(runtime.state(),before,'asking for a destination picture cannot commit its route or advance progression');
 view.corners[0][0]=999;view.normal[2]=999;view.origin[0]=999;assert.notEqual(runtime.routeDoorView().corners[0][0],999);assert.deepEqual(runtime.routeDoorView().normal,door.normal);
});
test('the tower generic view retains the existing named-return gate and tower-only wrapper',()=>{
 const locked=fixture('tower');assert.equal(locked.runtime.routeDoorView(),null);assert.equal(locked.runtime.towerDoorView(),null);
 // The fixture explicitly supplies earned durable authority; it does not claim
 // that these unit checks constitute an ordinary played return connection.
 const {runtime,door}=fixture('tower',{unlocked:true}),view=runtime.routeDoorView();assert.ok(view);assert.equal(view.route,'tower');assert.equal(view.id,door.id);
 assert.deepEqual(runtime.towerDoorView(),view);assert.equal(runtime.doorFieldDoors().find(d=>d.route==='tower').unlocked,true);
});
test('both route pictures retain the ninety-metre eye-distance bound and exact half-cell camera convention',()=>{
 for(const route of['chapel','tower']){
  const {runtime}=fixture(route,{unlocked:route==='tower'}),view=runtime.routeDoorView(),px=view.origin[0]/CELL-.5,py=view.origin[2]/CELL-.5;
  close(runtime.routeDoorView(px,py).distanceM,0);close(runtime.routeDoorView(px+90/CELL,py).distanceM,90);assert.equal(runtime.routeDoorView(px+90.001/CELL,py),null);
 }
 assert.equal(createSourceSpaceRuntime().routeDoorView(),null,'an ordinary Source phase has no station destination picture');
});
test('a retained tower capture cannot be submitted in the chapel opening or vice versa',()=>{
 const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8'),body=source.match(/export function r3dSetSourceTowerView\(frame=null\)\{[\s\S]*?\n\}/)?.[0];assert.ok(body,'production destination-capture submission exists');
 for(const route of['chapel','tower']){
  const {runtime}=fixture(route,{unlocked:route==='tower'}),view=runtime.routeDoorView(),foreign=fixture(route==='chapel'?'tower':'chapel',{unlocked:true}).runtime.routeDoorView();
  const run=new Function('capture',`let towerViewCapture=capture,sourceTowerView=null;${body.replace('export function','function')};return{submit:r3dSetSourceTowerView,current:()=>sourceTowerView};`)({key:foreign.id,color:{},depth:{}});
  assert.equal(run.submit(view),false,'a stale different-route capture cannot produce the wrong destination');assert.equal(run.current(),null);
  const same=new Function('capture',`let towerViewCapture=capture,sourceTowerView=null;${body.replace('export function','function')};return{submit:r3dSetSourceTowerView,current:()=>sourceTowerView};`)({key:view.id,color:{},depth:{}});
  assert.equal(same.submit(view),true);assert.equal(same.current().capture.key,view.id);assert.deepEqual(same.current().corners,view.corners);
  const unkeyed={...view};delete unkeyed.id;
  assert.equal(same.submit(unkeyed),true,'existing unkeyed Standing Tear previews keep their explicit capture ownership');
 }
});
test('chapel preview resolves the actual built narthex pose before carry exists and uses that exact pose at the handoff',()=>{
 // Compile the original authored chapel construction and C17 schedule, not a
 // synthetic zone callback. Other buildings are irrelevant to this local pose.
 FP.compile([conservatory.levels.find(level=>level.id==='chapel_nave')],{width:100,height:100,doors:conservatory.doors.filter(door=>door.id==='chapel-c17')});
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),production=name=>{const from=main.indexOf(`function ${name}(`),to=main.indexOf('\n}',from);assert.ok(from>=0&&to>from);return main.slice(from,to+2);};
 const sandbox={FP,CELL,BODY_EYE_M:EYE,ZONE,sourceDoorCarry:null,BRENDAN_TOWER_DOOR_BEHIND_M:.245,FACING_STEPS:[[0,-1],[1,0],[0,1],[-1,0]]};vm.createContext(sandbox);
 vm.runInContext(production('chapelDoorArrival')+'\n'+production('sourceArrivalDoorFrame')+'\nglobalThis.api={arrival:chapelDoorArrival,frame:sourceArrivalDoorFrame};',sandbox);
 assert.equal(sandbox.api.arrival(),null,'ordinary carry-gated behavior remains intact before crossing');
 const preview=sandbox.api.arrival({preview:true});assert.ok(preview);assert.equal(FP.zoneAt(preview.x,preview.y),ZONE.chapelOuter);assert.equal(FP.isSolid(preview.x,preview.y),false);
 const door=FP.doorState().find(entry=>entry.id==='chapel-c17'),[dx,dy]=sandbox.FACING_STEPS[preview.facing];
 assert.equal(FP.zoneAt(Math.round(door.cx+dx*2),Math.round(door.cy+dy*2)),ZONE.chapelOuter);
 assert.notEqual(FP.zoneAt(Math.round(door.cx-dx*2),Math.round(door.cy-dy*2)),ZONE.chapelOuter,'the pose faces from C17 into the narthex, not into its backing wall');
 sandbox.sourceDoorCarry={yaw:.41,pitch:-.12};const arrival=sandbox.api.arrival();assert.deepEqual(arrival,preview);
 const frame=sandbox.api.frame(preview),physical=FP.logicalToPhysical(preview.x,preview.y);close(frame.eye[0],(physical.x+.5)*CELL);close(frame.eye[2],(physical.z+.5)*CELL);close(frame.floor,FP.floorAt(preview.x,preview.y));close(frame.eye[1]-frame.floor,EYE);
 close(Math.hypot(frame.eye[0]-frame.origin[0],frame.eye[2]-frame.origin[2]),.245);
 assert.deepEqual(sandbox.sourceDoorCarry,{yaw:.41,pitch:-.12},'resolving the picture does not consume or rewrite the actual carried look');
});
