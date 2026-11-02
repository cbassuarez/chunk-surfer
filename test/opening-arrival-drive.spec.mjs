import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpeningArrivalDrive,stepOpeningArrivalDrive,openingArrivalSnapshot,openingArrivalAnchor,openingArrivalCanExit,openingArrivalInBay,OPENING_ARRIVAL_FOOTPRINT} from '../src/game/opening-arrival-drive.js';
import {driveBodyCorners,vehiclePoseIntersects} from '../src/game/source-drive/vehicle-contacts.js';
import {makeOpeningVehicleScene} from '../src/game/opening-vehicle-scene.js';
import {openingVehicleInstances,openingVehiclePoint,OPENING_VEHICLE} from '../src/data/opening-vehicle.js';
import * as scenes from '../src/game/scenes.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {openingDriveColliders} from '../src/game/opening-arrival-world.js';
import {aimOpeningCabDoor} from './helpers/opening-cab-aim.mjs';
const target={x:16,y:0,z:8,yaw:Math.PI/2,zone:1,group:'ground'};
const run=(s,seconds,input={},environment={})=>{const events=[];for(let n=0;n<Math.round(seconds*120);n++)events.push(...stepOpeningArrivalDrive(s,1/120,input,environment));return events;};
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const inStreet=p=>p.x>=-14&&p.x<=-1&&p.z>=-14&&p.z<=106||p.x>=-14&&p.x<=23&&p.z>=3&&p.z<=13;
const environment={isPoseClear:p=>driveBodyCorners(p).every(inStreet)};
const ordinaryRoute=[[-8,18],[-7.7,15.6],[-6.5,12.9],[-4,10.8],[-1,10],[7,10],[16,8]];
function readyScene(options={}){const scene=makeOpeningVehicleScene({getAnchor:()=>target,getAssetStatus:()=>({loaded:true}),automaticParking:false,...options});scene.update(0);for(let n=0;n<52;n++)scene.update(1/60);return scene;}

test('ordinary pedals steer the real short approach and deliberately park in ten to fifteen seconds without pose writes',t=>{
 const s=createOpeningArrivalDrive(target),points=ordinaryRoute,events=[];let k=0,stopping=false,max=0;
 for(let n=0;n<2400&&!s.parked;n++){
  const point=points[Math.min(k,points.length-1)],dx=point[0]-s.x,dz=point[1]-s.z;if(k<points.length-1&&Math.hypot(dx,dz)<1.8)k++;
  const heading=Math.atan2(dx,-dz),error=Math.atan2(Math.sin(heading-s.heading),Math.cos(heading-s.heading));if(k===points.length-1&&s.x>13.8)stopping=true;
  const slowCorner=Math.abs(error)>.32&&s.speed>3;
  events.push(...stepOpeningArrivalDrive(s,1/120,{forward:!stopping&&!slowCorner,left:error<-.035,right:error>.035,brake:stopping||slowCorner},environment));
  assert.ok(driveBodyCorners(s).every(inStreet),'full body remains on the connected street/apron');max=Math.max(max,s.speed);
 }
 assert.ok(s.parked);assert.ok(s.elapsed>=10&&s.elapsed<=15);assert.ok(s.odometer>40&&s.odometer<48);assert.ok(max<5.3);assert.ok(openingArrivalCanExit(s));assert.equal(events.filter(e=>e.type==='opening-vehicle-contact').length,0);assert.equal(events.filter(e=>e.type==='opening-vehicle-parked').length,1);
 t.diagnostic(`${s.elapsed.toFixed(3)}s, ${s.odometer.toFixed(3)}m, actual parked anchor ${s.x.toFixed(3)},${s.z.toFixed(3)}.`);
});

test('the same ordinary route clears the actual compiled building and parked traffic without contact or pose bypass',t=>{
 FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
 const colliders=openingDriveColliders(FP,PROPS,target),s=createOpeningArrivalDrive(target),events=[];let waypoint=0,stopping=false;
 for(let n=0;n<2400&&!s.parked;n++){
  while(waypoint<ordinaryRoute.length-1&&Math.hypot(s.x-ordinaryRoute[waypoint][0],s.z-ordinaryRoute[waypoint][1])<1.8)waypoint++;
  const point=ordinaryRoute[waypoint],dx=point[0]-s.x,dz=point[1]-s.z,heading=Math.atan2(dx,-dz),error=Math.atan2(Math.sin(heading-s.heading),Math.cos(heading-s.heading));
  if(waypoint===ordinaryRoute.length-1&&s.x>13.8)stopping=true;
  const brake=stopping||Math.abs(error)>.32&&s.speed>3;
  events.push(...stepOpeningArrivalDrive(s,1/120,{forward:!brake,left:error<-.035,right:error>.035,brake},{colliders}));
 }
 assert.ok(colliders.length>100);assert.equal(events.filter(e=>e.type==='opening-vehicle-contact').length,0);assert.equal(events.filter(e=>e.type==='opening-vehicle-parked').length,1);assert.ok(openingArrivalCanExit(s));assert.ok(s.elapsed>=10&&s.elapsed<=15);assert.ok(s.odometer>40&&s.odometer<48);
 t.diagnostic('ACTUAL_OPENING_DRIVE '+JSON.stringify({elapsed:s.elapsed,odometer:s.odometer,colliders:colliders.length,parked:openingArrivalAnchor(s),poseWritesAfterEntry:0}));
});

test('parking requires a real bay, heading and deliberate braked stop; waiting cannot park or end a drive',()=>{
 const s=createOpeningArrivalDrive(target,{spawn:target});run(s,20);assert.equal(s.parked,false);run(s,1,{forward:true,brake:true});assert.equal(s.parked,false);
 run(s,.4,{brake:true});assert.ok(s.parked);assert.ok(openingArrivalCanExit(s));assert.equal(openingArrivalCanExit(s,{forward:true}),false);
 const events=run(s,2,{forward:true});assert.ok(s.x>target.x+1);assert.equal(s.parked,false);assert.equal(events.filter(e=>e.type==='opening-vehicle-unparked').length,1);
 const wrong=createOpeningArrivalDrive(target,{spawn:{...target,x:target.x+4}});run(wrong,1,{brake:true});assert.equal(wrong.parked,false);wrong.parked=true;assert.equal(openingArrivalCanExit(wrong),false);
 const cross=createOpeningArrivalDrive(target,{spawn:{...target,yaw:target.yaw+Math.PI/2}});run(cross,1,{brake:true});assert.equal(cross.parked,false);assert.equal(openingArrivalInBay(cross),false);
});

test('reverse gear moves physically and the low gear governor bounds both directions',()=>{
 const s=createOpeningArrivalDrive(target,{spawn:target});run(s,5,{reverse:true});assert.ok(s.x<target.x-4);assert.ok(s.speed<0&&s.speed>-2.3);assert.ok(s.wheelRotation<0);
 run(s,3,{brake:true});assert.equal(s.speed,0);const before=s.x;run(s,3,{forward:true});assert.ok(s.x>before+2);assert.ok(s.speed>0&&s.speed<5.3);
});

test('swept thin-solid contacts use the real whole van footprint rather than its centre',()=>{
 const wall={id:'thin-real-wall',minX:-4,maxX:4,minZ:3.9,maxZ:4.02},s=createOpeningArrivalDrive({...target,x:0,z:8,yaw:0},{spawn:{x:0,y:0,z:8,yaw:0}}),events=[];
 for(let n=0;n<120;n++)events.push(...stepOpeningArrivalDrive(s,1/120,{forward:true},{colliders:[wall]}));
 s.speed=12;events.push(...stepOpeningArrivalDrive(s,.25,{forward:true},{colliders:[wall]}));
 assert.equal(vehiclePoseIntersects(s,wall),false);assert.ok(Math.min(...driveBodyCorners(s).map(p=>p.z))>=wall.maxZ-.003);assert.ok(events.some(e=>e.type==='opening-vehicle-contact'&&e.id===wall.id&&e.impactSpeed>0));assert.equal(OPENING_ARRIVAL_FOOTPRINT.halfWidth,.985);
});

test('host floor and clearance callbacks are swept; a thin unsupported strip cannot be tunneled through',()=>{
 const s=createOpeningArrivalDrive({...target,x:0,z:8,yaw:0},{spawn:{x:0,y:0,z:8,yaw:0}});s.speed=12;
 const events=stepOpeningArrivalDrive(s,.25,{forward:true},{isPoseClear:p=>driveBodyCorners(p).every(q=>q.z>=4.1)});
 assert.ok(Math.min(...driveBodyCorners(s).map(p=>p.z))>=4.1-1e-6);assert.ok(events.some(e=>e.id==='opening-host-clearance'));assert.equal(s.speed,0);
});

test('reload preserves actual parked or travelling pose and clocks, with no retained pedal or moving resume',()=>{
 const s=createOpeningArrivalDrive(target);run(s,2,{forward:true,right:true});const saved=openingArrivalSnapshot(s),again=createOpeningArrivalDrive(target,{checkpoint:JSON.parse(JSON.stringify(saved))});
 near(again.x,s.x);near(again.z,s.z);near(again.heading,s.heading);near(again.elapsed,s.elapsed);near(again.odometer,s.odometer);assert.equal(again.speed,0);assert.equal(again.throttle,0);assert.equal('input' in saved,false);assert.equal('keys' in saved,false);
 const invalid=createOpeningArrivalDrive(target,{checkpoint:{...saved,x:1000,z:1000}});assert.notEqual(invalid.x,1000);
});

test('scene owns body-relative free look and uses actual keyup, controller actions, pause and blur to clear intent',()=>{
 const seen=[],scene=readyScene({toWorldView:(eye,frame)=>{seen.push(frame);return{x:eye.x,y:eye.z};}});scene.key({code:'KeyW'});for(let n=0;n<60;n++)scene.update(1/60);const before=scene.view();scene.lookBy(.6,-.2);near(scene.view().yaw,before.anchor.yaw+.6);near(scene.view().pitch,-.24);
 scene.key({controllerAction:'right'});for(let n=0;n<30;n++)scene.update(1/60);assert.ok(scene.view().anchor.yaw>before.anchor.yaw);scene.keyup({controllerAction:'right'});scene.keyup({code:'KeyW'});scene.blur();scene.key({code:'KeyW',repeat:true});for(let n=0;n<40;n++)scene.update(1/60);assert.equal(scene.view().drive.throttle,0);
 scene.worldView();assert.deepEqual(seen.at(-1).anchor,scene.view().anchor);assert.deepEqual(seen.at(-1).eye,openingVehiclePoint(scene.view().anchor,OPENING_VEHICLE.eye));
 scenes.clear();scenes.push(scene);scene.key({code:'KeyW'});scenes.push({id:'pause'});scene.worldView();const frozen=scene.serialize();scenes.update(3);assert.deepEqual(scene.serialize(),frozen);scenes.pop();scenes.update(.25);assert.equal(scene.view().drive.throttle,0);scenes.clear();
});

test('exit is refused before parking, then steps out, physically closes, covers black and completes once after reload',()=>{
 // This is a stopped, unparked car at the bay. Fresh arrivals now begin under
 // power before the fade; parking/exit authority is isolated from that launch.
 const stopped=createOpeningArrivalDrive(target,{spawn:target}),checkpoint={schema:1,phase:'driving',reveal:1,drive:openingArrivalSnapshot(stopped)};
 let done=0;const events=[],scene=readyScene({checkpoint,getDriveEnvironment:()=>({spawn:target}),onEvent:e=>events.push(e),onDone:()=>done++});scene.key({code:'KeyE'});assert.equal(scene.view().phase,'driving');
 scene.key({code:'Space'});for(let n=0;n<30;n++)scene.update(1/60);scene.keyup({code:'Space'});assert.equal(scene.view().phase,'parked');aimOpeningCabDoor(scene);scene.key({code:'KeyW'});scene.key({code:'KeyE'});assert.equal(scene.view().phase,'parked');scene.keyup({code:'KeyW'});scene.key({code:'KeyE'});assert.equal(scene.view().phase,'exiting');
 for(let n=0;n<108;n++)scene.update(1/60);assert.equal(done,0);assert.ok(scene.view().doorOpen>.7);const saved=scene.serialize();
 const resumed=makeOpeningVehicleScene({getAnchor:()=>target,getAssetStatus:()=>({loaded:true}),checkpoint:JSON.parse(JSON.stringify(saved)),onEvent:e=>events.push(e),onDone:f=>{done++;assert.equal(f.doorOpen,0);assert.equal(f.fade,1);assert.deepEqual(f.anchor,openingArrivalAnchor(createOpeningArrivalDrive(target,{checkpoint:saved.drive})));}});resumed.update(0);
 for(let n=0;n<100;n++)resumed.update(1/60);assert.equal(done,1);assert.equal(events.filter(e=>e.type==='opening-vehicle-exit-step').length,1);assert.equal(events.filter(e=>e.type==='opening-vehicle-door-close').length,1);assert.equal(events.find(e=>e.type==='opening-vehicle-door-close').seconds-saved.drive.elapsed,2.3);
});

test('dashboard, actual front tyres and wipers respond to driving state while the hinged cabin remains fixed',()=>{
 const base=openingVehicleInstances(target),moving=openingVehicleInstances(target,{drive:{speed:5,steeringWheelAngle:1,wheelAngle:.25,wheelRotation:2,elapsed:.25}}),get=(rows,name)=>rows.find(p=>p.mesh===name).matrix;
 for(const mesh of ['opening_drive_wheel','opening_drive_speed_needle','opening_drive_tyre','opening_drive_wiper'])assert.notDeepEqual(get(base,mesh),get(moving,mesh),mesh);
 assert.deepEqual(get(base,'opening_drive_cabin'),get(moving,'opening_drive_cabin'));
});
