import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {freshSourceDriveCheckpoint,normalizeSourceDriveCheckpoint,createSourceDriveSession} from '../src/game/source-drive-session.js';
import {worldAt,roadSurfaceAt} from '../src/game/source-drive/road.js';
import {containsDrivePose} from '../src/game/source-drive/route-boundaries.js';
const metrics=JSON.parse(await readFile(new URL('../artifacts/source-drive-study/geometry/metrics.json',import.meta.url)));

function checkpoint(distance=850,lateral=-1.35,headingOffset=0){
 const cp=freshSourceDriveCheckpoint({returnPose:{x:1,y:-924,yaw:.3,pitch:-.1,facing:0},runId:'old-drive'}),a=worldAt(distance,lateral);
 cp.status='active';cp.started=true;
 Object.assign(cp.drive,{x:a.x,z:a.z,heading:a.heading+headingOffset,roadHeight:a.height,roadOffset:lateral,furthest:960,programTime:82.5,phase:3,brakeHold:true});
 cp.tape={schema:1,runId:'old-drive',takeRefs:[{id:'original',key:'same-blob',sha256:'unchanged'}],pending:{takeId:'pending',durable:false}};
 return cp;
}
test('every legal lane, shoulder, bay and opposite-heading stop retains its exact chosen pose',()=>{
 for(const [d,l,yaw]of[[358,0,0],[358,0,.08],[510,1.1,Math.PI],[850,-4.6,0],[870,-4.6,Math.PI],[980,-1.35,Math.PI/2],[1000,-22,Math.PI/2],[1060,22,Math.PI],[1200,0,Math.PI]]){
  const cp=checkpoint(d,l,yaw);assert.equal(containsDrivePose(cp.drive),true,`fixture${d}/${l}/${yaw} is inside the physical perimeter`);
  const restored=normalizeSourceDriveCheckpoint(cp);
  assert.deepEqual([restored.drive.x,restored.drive.z,restored.drive.heading],[cp.drive.x,cp.drive.z,cp.drive.heading]);
  assert.equal(restored.drive.boundaryRecovery,undefined);
  assert.deepEqual(restored.tape,cp.tape);
 }
});
test('old dual-lane cliff saves recover once to a clear centre without consuming time or evidence',()=>{
 for(const d of[250,315,358,380])for(const lateral of[-1.35,1.35])for(const yaw of[0,Math.PI]){
  const cp=checkpoint(d,lateral,yaw);assert.equal(containsDrivePose(cp.drive),false,`old lane fixture ${d}/${lateral}/${yaw}`);
  const restored=normalizeSourceDriveCheckpoint(cp),surface=roadSurfaceAt(restored.drive.x,restored.drive.z);
  assert.equal(containsDrivePose(restored.drive),true,'recovery must validate the actual full body, not only the centre point');
  assert.ok(Math.abs(surface.offset)<1e-6,`recover to centre, not the invalid former left lane: ${surface.offset}`);
  assert.ok(Math.abs(surface.distance-d)<1e-5,'recovery does not skip the cliff or advance the journey');
  assert.equal(restored.drive.heading,cp.drive.heading,'a forward or reversed heading that clears at centre stays exactly chosen');
  assert.equal(restored.drive.paused,true);assert.equal(restored.drive.speed,0);assert.equal(restored.drive.brakeHold,true);
  assert.equal(restored.drive.programTime,cp.drive.programTime);assert.equal(restored.drive.furthest,cp.drive.furthest);
  assert.deepEqual(restored.tape,cp.tape);assert.deepEqual(restored.returnPose,cp.returnPose);assert.deepEqual(restored.weather,cp.weather);
  assert.equal(restored.drive.events.filter(e=>e.type==='vehicle-position-recovered').length,1);
  assert.deepEqual(normalizeSourceDriveCheckpoint(restored),restored,'an unchanged second load is exactly idempotent');
 }
});
test('old beyond-end and off-road saves recover once, paused, without losing programme, progression, weather or tape',()=>{
 for(const [d,l]of[[-80,-1.35],[1400,-1.35],[850,-30],[850,30]]){
  const cp=checkpoint(d,l),original=structuredClone(cp),restored=normalizeSourceDriveCheckpoint(cp);
  assert.equal(restored.status,'active');assert.equal(restored.drive.paused,true);
  assert.equal(containsDrivePose(restored.drive),true);
  assert.equal(restored.drive.brakeHold,true);
  assert.equal(restored.drive.programTime,cp.drive.programTime);assert.equal(restored.drive.furthest,cp.drive.furthest);
  assert.equal(restored.drive.phase,cp.drive.phase);assert.deepEqual(restored.weather,cp.weather);
  assert.deepEqual(restored.tape,cp.tape);assert.deepEqual(restored.returnPose,cp.returnPose);
  assert.deepEqual(restored.drive.boundaryRecovery.from,{x:original.drive.x,z:original.drive.z,heading:original.drive.heading});
  assert.equal(restored.drive.boundaryRecovery.acknowledged,false);
  assert.deepEqual(normalizeSourceDriveCheckpoint(restored),restored,'a second load does not re-recover, reset or lose the original reason');
 }
});
test('acknowledging a recovered position requires the explicit drive action',async()=>{
 const cp=checkpoint(1400),statuses=[];
 const session=createSourceDriveSession({checkpoint:cp,metrics,renderer:{initialize(){},render(){}},
  acoustics:{initialize(){},setPaused(){},sync(){},dispose(){}},onStatus:s=>statuses.push(s)});
 await session.initialize();
 assert.equal(session.serialize().drive.boundaryRecovery.acknowledged,false);
 assert.equal(session.status().paused,true);
 assert.equal(statuses.at(-1).positionRecovered,true);
 await session.start();
 assert.equal(session.serialize().drive.boundaryRecovery.acknowledged,true);
 assert.equal(statuses.at(-1).positionRecovered,false);
 await session.dispose();
});
