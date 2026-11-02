import test from 'node:test';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {Matrix4,Triangle,Vector3} from 'three';
import {OPENING_VEHICLE,openingVehicleExitFrame,openingVehiclePoint,openingVehicleInstances} from '../src/data/opening-vehicle.js';
import {makeOpeningVehicleScene} from '../src/game/opening-vehicle-scene.js';
import {createOpeningArrivalDrive,openingArrivalSnapshot} from '../src/game/opening-arrival-drive.js';
import * as scenes from '../src/game/scenes.js';
import {aimOpeningCabDoor} from './helpers/opening-cab-aim.mjs';

const anchor={x:16,y:0,z:8,yaw:1.494,zone:1,group:'ground'},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const ready=(options={})=>{const scene=makeOpeningVehicleScene({driveEnabled:false,getAnchor:()=>anchor,getAssetStatus:()=>({loaded:true}),...options});scene.update(0);return scene;};
test('choosing to leave preserves the actual seated eye and look, then gives the street a visible settled beat',()=>{
 const scene=ready({getLook:()=>({yaw:-2,pitch:.4})});scene.lookBy(.45,-.2);aimOpeningCabDoor(scene);const seated=scene.view();scene.key({key:'e'});const first=scene.view();
 assert.deepEqual(first.eye,seated.eye);near(first.yaw,seated.yaw);near(first.pitch,seated.pitch);
 const outside=openingVehicleExitFrame(anchor,2.45);assert.deepEqual(outside.eye,openingVehiclePoint(anchor,OPENING_VEHICLE.exitEye));assert.equal(outside.fade,0);assert.equal(outside.doorOpen,0);assert.equal(outside.done,false);
 for(const t of[.4,.85,1.55,2.15,2.65]){const a=openingVehicleExitFrame(anchor,t-1e-6),b=openingVehicleExitFrame(anchor,t+1e-6);assert.ok(Math.hypot(a.eye.x-b.eye.x,a.eye.y-b.eye.y,a.eye.z-b.eye.z)<1e-5,'no positional jump at a body beat');}
 scene.exit();
});
test('exit keeps free look, freezes on pause/focus loss, and hands the chosen bearing onward exactly once',()=>{
 scenes.clear();let landed=0,result;const scene=ready({onDone:value=>{landed++;result=value;}});scenes.push(scene);aimOpeningCabDoor(scene);scene.key({key:'e'});scene.update(1);
 assert.equal(scenes.lookOwner(),scene);const before=scene.view();assert.equal(scene.lookBy(.3,-.15),true);near(scene.view().yaw-before.yaw,.3);near(scene.view().pitch-before.pitch,-.15);
 scene.blur();const held=scene.serialize();scene.update(20);assert.deepEqual(scene.serialize(),held);assert.equal(scene.lookBy(.3,0),false);scene.resume();
 scenes.push({id:'pause',blocksInput:true,blocksWorld:true});scenes.update(20);assert.deepEqual(scene.serialize(),held);scenes.pop();
 scene.update(OPENING_VEHICLE.exitSeconds);scene.update(20);assert.equal(landed,1);near(result.yaw,anchor.yaw+Math.PI*.8+.3);assert.equal(result.fade,1);scenes.clear();
});
test('resuming an exit preserves chosen look and old exit checkpoints keep their completion fraction',()=>{
 const drive=createOpeningArrivalDrive(anchor,{spawn:anchor});drive.parked=true;
 const base={schema:1,phase:'exiting',elapsed:1.8,reveal:1,startYaw:anchor.yaw+.2,startPitch:-.1,exitRevision:OPENING_VEHICLE.exitRevision,exitLookYaw:.4,exitLookPitch:-.2,drive:openingArrivalSnapshot(drive)};
 const scene=makeOpeningVehicleScene({getAnchor:()=>anchor,getAssetStatus:()=>({loaded:true}),checkpoint:base});scene.update(0);const f=openingVehicleExitFrame(scene.view().anchor,base.elapsed,{startYaw:base.startYaw,startPitch:base.startPitch,lookYaw:.4,lookPitch:-.2});near(scene.view().yaw,f.yaw);near(scene.view().pitch,f.pitch);assert.deepEqual(scene.view().eye,f.eye);
 const old=makeOpeningVehicleScene({getAnchor:()=>anchor,getAssetStatus:()=>({loaded:true}),checkpoint:{...base,exitRevision:undefined,elapsed:2.65/2}});old.update(0);near(old.view().elapsed,OPENING_VEHICLE.exitSeconds/2);scene.exit();old.exit();
});
test('the actual shipped right door stays clear of the eye throughout its open and close sweep',async t=>{
 const doc=await new NodeIO().read(new URL('../public/assets/source-vehicle-interior.glb',import.meta.url).pathname),mesh=doc.getRoot().listMeshes().find(m=>m.getName()==='opening_drive_cabin_door_r');
 const a={x:0,y:0,z:0,yaw:0},tri=new Triangle(),point=new Vector3(),closest=new Vector3();let minimum=Infinity;
 for(let n=0;n<=32;n++){
  const frame=openingVehicleExitFrame(a,n/10),door=openingVehicleInstances(a,{doorOpen:frame.doorOpen}).find(p=>p.id==='opening:driver-door'),matrix=new Matrix4().fromArray(door.matrix);point.set(frame.eye.x,frame.eye.y,frame.eye.z);
  for(const primitive of mesh.listPrimitives()){
   const positions=primitive.getAttribute('POSITION').getArray(),indices=primitive.getIndices().getArray();
   for(let i=0;i<indices.length;i+=3){for(const[k,p]of[tri.a,tri.b,tri.c].entries()){const j=indices[i+k]*3;p.set(positions[j],positions[j+1],positions[j+2]).applyMatrix4(matrix);}tri.closestPointToPoint(point,closest);minimum=Math.min(minimum,point.distanceTo(closest));}
  }
 }
 assert.ok(minimum>.12,`eye clears exact door geometry: ${minimum}m`);t.diagnostic(`Minimum sampled eye-to-leaf clearance ${(minimum*100).toFixed(1)}cm; CPU geometry, not native visual acceptance.`);
});
