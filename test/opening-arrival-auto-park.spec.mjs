import test from 'node:test';
import assert from 'node:assert/strict';
import {makeOpeningVehicleScene} from '../src/game/opening-vehicle-scene.js';
import {createOpeningArrivalDrive,openingArrivalAutoParkStart,openingArrivalSnapshot} from '../src/game/opening-arrival-drive.js';
import {openingCabTargets} from '../src/game/opening-cab-inspection.js';
import {OPENING_VEHICLE} from '../src/data/opening-vehicle.js';
import {openingDriveColliders} from '../src/game/opening-arrival-world.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {aimOpeningCabDoor} from './helpers/opening-cab-aim.mjs';

const target={x:16,y:0,z:8,yaw:Math.PI/2,zone:1,group:'ground'};
const ready=(options={})=>{const scene=makeOpeningVehicleScene({getAnchor:()=>target,getAssetStatus:()=>({loaded:true}),...options});scene.update(0);return scene;};
function park(scene){let count=0;for(;count<1200&&scene.view().phase!=='parked';count++)scene.update(1/120);assert.equal(scene.view().phase,'parked','automatic arrival must reach its real parked/exit state');return count/120;}
function aim(scene,id){const f=scene.view(),p=openingCabTargets(f.anchor).find(row=>row.id===id).position,dx=p.x-f.eye.x,dz=p.z-f.eye.z;scene.lookBy(Math.atan2(dx,-dz)-f.yaw,Math.atan2(p.y-f.eye.y,Math.hypot(dx,dz))-f.pitch);assert.equal(scene.view().focus?.id,id);}
test('the production default parks without any pedal through the actual compiled yard, then E completes the physical exit once',t=>{
 FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);const colliders=openingDriveColliders(FP,PROPS,target),events=[];let done=0,exit;
 const scene=ready({getDriveEnvironment:()=>({colliders}),onEvent:e=>events.push(e),onDone:frame=>{done++;exit=frame;}}),initial=scene.view();assert.ok(initial.drive.speed>0);assert.ok(initial.drive.autoPark);
 scene.lookBy(.3,-.1);const seconds=park(scene);assert.ok(seconds>=3&&seconds<=6);assert.equal(scene.view().canExit,true);assert.ok(Math.abs(scene.view().yaw-scene.view().anchor.yaw-.3)<1e-9);assert.equal(events.filter(e=>e.type==='opening-vehicle-contact').length,0);assert.equal(events.filter(e=>e.type==='opening-vehicle-parked').length,1);
 aimOpeningCabDoor(scene);scene.key({code:'KeyE'});assert.equal(scene.view().phase,'exiting');for(let n=0;n<400;n++)scene.update(1/120);assert.equal(done,1);assert.equal(exit.fade,1);assert.equal(exit.progress,1);scene.exit();
 t.diagnostic(`Actual compiled approach parked in ${seconds.toFixed(3)}s across ${colliders.length} real wall/prop colliders; no pose assignments after scene initialization.`);
});
test('held driving keys cannot divert or unpark the automatic arrival or revoke its exit',()=>{
 const scene=ready();for(const code of['KeyW','KeyS','KeyA','KeyD','Space'])scene.key({code});park(scene);const parked=scene.view().anchor;
 for(let n=0;n<240;n++)scene.update(1/120);assert.deepEqual(scene.view().anchor,parked);assert.equal(scene.view().canExit,true);aimOpeningCabDoor(scene);scene.key({key:'e'});assert.equal(scene.view().phase,'exiting');scene.exit();
});
test('E and confirmation inspect each actual cab object; only the physical door handle exits',()=>{
 for(const id of['job-papers','notebook','self-check']){
  const inspected=[],scene=ready({onInspect:item=>{inspected.push(item.id);return true;}});park(scene);aim(scene,id);scene.key({key:'e'});assert.deepEqual(inspected,[id]);assert.equal(scene.view().phase,'parked');
  scene.key({key:'Enter'});assert.equal(scene.view().phase,'parked');assert.deepEqual(inspected,[id,id],'confirmation uses the same focused object');aimOpeningCabDoor(scene);scene.key({key:'Enter'});assert.equal(scene.view().phase,'exiting');assert.deepEqual(inspected,[id,id]);scene.exit();
 }
 const scene=ready({onInspect:()=>false});park(scene);aim(scene,'job-papers');scene.key({key:'e'});assert.equal(scene.view().phase,'parked','an unavailable inspector cannot accidentally exit');aimOpeningCabDoor(scene);scene.key({key:'e'});assert.equal(scene.view().phase,'exiting');scene.exit();
});
test('pause and reload stop hidden movement; automatic arrival resumes without a key and old free-driving saves cannot retain the trap',()=>{
 const scene=ready();scene.update(.25);scene.blur();const saved=scene.serialize();scene.update(10);assert.deepEqual(scene.serialize(),saved);scene.exit();
 const resumed=ready({checkpoint:saved});assert.deepEqual(resumed.view().anchor,scene.view().anchor);assert.equal(resumed.view().drive.speed,0);assert.equal(resumed.view().drive.throttle,0);park(resumed);aimOpeningCabDoor(resumed);resumed.key({controllerAction:'confirm'});assert.equal(resumed.view().phase,'exiting');resumed.exit();
 const stranded=createOpeningArrivalDrive(target,{alreadyDriving:true}),legacy={schema:1,phase:'driving',reveal:1,drive:openingArrivalSnapshot(stranded)},again=ready({checkpoint:legacy}),start=openingArrivalAutoParkStart(target);
 assert.equal(again.view().anchor.x,start.x);assert.equal(again.view().anchor.z,start.z);assert.equal(again.view().reveal,0,'legacy reposition is covered before its first view');park(again);assert.equal(again.view().canExit,true);again.exit();
});
test('empty cab views and driving controls cannot become a hidden exit shortcut',()=>{
 const scene=ready();park(scene);assert.equal(scene.view().focus,null);
 for(const event of[{key:'e'},{key:'Enter'},{code:'NumpadEnter'},{code:'Space'},{controllerAction:'interact'},{controllerAction:'confirm'}]){scene.key(event);assert.equal(scene.view().phase,'parked');}
 scene.exit();
});
