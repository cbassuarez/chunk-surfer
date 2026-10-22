import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceDriveSession} from '../src/game/source-drive-session.js';
import {SOURCE_DRIVE_OPENING,seedMovingDriveEntry} from '../src/game/source-drive/entry-cut.js';
import {createDrive} from '../src/game/source-drive/drive-state.js';
import {createDriveWeather} from '../src/game/source-drive/weather.js';
import {roadSurfaceAt} from '../src/game/source-drive/road.js';
import {programmeFrame} from '../src/game/source-drive/radio-programmes.js';
import {SourceDriveAcoustics} from '../src/game/source-drive/acoustics.js';
const metrics=JSON.parse(readFileSync(new URL('../artifacts/source-drive-study/geometry/metrics.json',import.meta.url)));
const pose={x:0,y:-924.01,yaw:.2,pitch:.02,facing:0};
function fixture(extra={}){
 const calls=[];let ready=true;
 const audio={initialize:async()=>{},cabin:{},openingReadiness:()=>({ready,reason:'Opening voice missing'}),primeMovingOpening:s=>calls.push(['prime',s.programTime]),
  setPaused:v=>calls.push(['pause',v]),sync:s=>calls.push(['sync',s.programTime,s.speed,s.paused]),dispose(){}};
 const recording={setPaused:async()=>{},status:()=>({recording:false,playing:false}),checkpoint:()=>null,dispose:async()=>{}};
 const session=createSourceDriveSession({metrics,returnPose:pose,runId:'entry-test',entry:'moving-cut',acoustics:audio,recording,
  renderer:{initialize:async()=>true,render:()=>true,dispose(){}},...extra});
 return{session,calls,setReady:v=>{ready=v;}};
}
async function begin(f){await f.session.initialize();f.session.render();assert.equal(await f.session.start(),true);}
function step(session,seconds){for(let i=0;i<Math.ceil(seconds*120);i++)session.update(1/120);}

test('the fresh moving moment has a wet moving cabin, a real mid-bulletin position and an uncommitted deck',()=>{
 const s=createDrive(),w=createDriveWeather();seedMovingDriveEntry(s,w);
 assert.equal(s.speed,SOURCE_DRIVE_OPENING.speedMps);assert.equal(s.brakeHold,false);assert.equal(s.throttle,0);
 assert.equal(s.programTime,3.2);assert.equal(s.furthest,24);assert.equal(s.station,'service');assert.equal(s.radioOn,true);
 assert.equal(programmeFrame({...s,paused:false}).cue.id,'service-water');
 assert.ok(w.wiperMoving&&w.revision>300&&Math.abs(w.timeSec-3.2)<1e-8);
 assert.ok(Math.abs(roadSurfaceAt(s.x,s.z).offset+1.35)<1e-8);assert.equal(s.activeTake,null);assert.equal(s.events.length,0);
});

test('asset loading cannot advance the entry or unpause it before a covered renderer frame is primed',async()=>{
 const f=fixture();await f.session.initialize();const before=f.session.serialize();
 assert.equal(await f.session.start(),false);step(f.session,5);
 assert.deepEqual(f.session.serialize(),before);assert.equal(f.session.status().opening.covered,true);
 assert.ok(!f.calls.some(c=>c[0]==='prime'||c[0]==='sync'));
 await f.session.dispose();
});

test('the prepared opening primes the already-tuned receiver and moving mix before the picture',async()=>{
 const f=fixture();await begin(f);
 const prime=f.calls.findIndex(c=>c[0]==='prime'),unmute=f.calls.findIndex(c=>c[0]==='pause'&&c[1]===false),sync=f.calls.findIndex(c=>c[0]==='sync');
 assert.ok(prime>=0&&unmute>prime&&sync>unmute);
 assert.deepEqual(f.calls[sync],['sync',3.2,13.2,false]);
 assert.equal(f.session.status().opening.covered,true);step(f.session,.3);
 assert.equal(f.session.status().opening.covered,true);assert.ok(f.session.status().state.programTime>3.49);
 step(f.session,.37);const live=f.session.status();
 assert.equal(live.opening.covered,false);assert.ok(live.state.speed>12.5&&!live.paused&&!live.parked);
 assert.equal(live.state.events.filter(e=>e.type==='journey-picture').length,1);assert.equal(live.tape.recording,false);
 await f.session.dispose();
});

test('the first picture accepts real steering and braking; inherited walking repeats cannot accelerate it',async()=>{
 const f=fixture();await begin(f);f.session.key({key:'w'});step(f.session,.7);
 f.session.key({key:'w',repeat:true});step(f.session,.1);assert.equal(f.session.status().state.throttle,0);
 f.session.keyup({key:'w'});f.session.key({key:'w'});step(f.session,.1);assert.ok(f.session.status().state.throttle>0);
 f.session.keyup({key:'w'});f.session.key({key:'a'});step(f.session,.1);assert.ok(f.session.status().state.wheelAngle<0);
 f.session.keyup({key:'a'});f.session.key({key:' '});step(f.session,3.5);
 assert.equal(f.session.status().state.speed,0);assert.equal(f.session.status().state.brakeHold,true);
 await f.session.dispose();
});

test('coasting provides orientation time without a steering assist or hidden cruise input',async()=>{
 const f=fixture();await begin(f);let minimum=Infinity;
 for(let i=0;i<6*120;i++){f.session.update(1/120);const s=f.session.status().state,r=roadSurfaceAt(s.x,s.z);minimum=Math.min(minimum,Math.min(r.leftWidth+r.offset,r.rightWidth-r.offset)-1.05);assert.equal(s.throttle,0);assert.equal(s.wheelAngle,0);}
 assert.ok(minimum>.6,`six-second body clearance ${minimum}`);assert.ok(f.session.status().state.speed<13.2&&f.session.status().state.speed>8);
 await f.session.dispose();
});

test('an interrupted black lead freezes and resumes its remaining duration without replaying the cut',async()=>{
 const f=fixture();await begin(f);step(f.session,.3);await f.session.pause();const held=f.session.serialize();
 step(f.session,4);assert.deepEqual(f.session.serialize(),held);assert.equal(f.session.status().opening.interrupted,true);
 await f.session.start();step(f.session,.37);assert.equal(f.session.status().opening.covered,false);
 assert.equal(f.calls.filter(c=>c[0]==='prime').length,1);assert.equal(f.session.status().state.events.filter(e=>e.type==='journey-picture').length,1);
 await f.session.dispose();
});

test('a saved journey keeps its exact clocks, weather, OFF state and look, with the existing stationary restore',async()=>{
 const f=fixture();await begin(f);step(f.session,.8);await f.session.pause();const cp=f.session.serialize();
 cp.drive.station='music';cp.drive.radioOn=false;cp.look={yaw:.7,pitch:.1};
 const restored=fixture({checkpoint:cp});await restored.session.initialize();const s=restored.session.status();
 assert.equal(s.opening,null);assert.equal(s.state.programTime,cp.drive.programTime);assert.equal(s.state.x,cp.drive.x);assert.equal(s.state.z,cp.drive.z);
 assert.equal(s.state.station,'music');assert.equal(s.state.radioOn,false);assert.equal(s.state.speed,0);assert.deepEqual(s.look,cp.look);
 assert.deepEqual(restored.session.serialize().weather,cp.weather);assert.deepEqual(restored.session.serialize().returnPose,pose);
 await restored.session.start();assert.equal(restored.calls.filter(c=>c[0]==='prime').length,0);
 await f.session.dispose();await restored.session.dispose();
});

test('a missing opening voice holds safely, exposes the error and permits a deliberate retry',async()=>{
 const f=fixture();await f.session.initialize();f.session.render();f.setReady(false);
 await assert.rejects(f.session.start(),/Opening voice missing/);assert.equal(f.session.status().paused,true);assert.equal(f.session.status().opening.covered,true);
 assert.ok(!f.calls.some(c=>c[0]==='pause'&&c[1]===false));
 f.setReady(true);await f.session.start();assert.equal(f.session.status().error,null);step(f.session,.7);assert.equal(f.session.status().opening.covered,false);
 await f.session.dispose();
});

test('actual opening readiness requires the running context and the decoded current voice, or a supplied master',()=>{
 const state={...createDrive(),programTime:3.2},owner={context:{state:'suspended'},cabin:{},programmes:new Map([['service-ordinary',{}]]),programmeOptions:new Map([['service-ordinary',{temporary:true}]]),voices:new Map()};
 const ready=()=>SourceDriveAcoustics.prototype.openingReadiness.call(owner,state);
 assert.equal(ready().ready,false);owner.context.state='running';assert.equal(ready().ready,false);
 owner.voices.set('service-water',{});assert.equal(ready().ready,true);
 owner.voices.clear();owner.programmeOptions.set('service-ordinary',{temporary:false});assert.equal(ready().ready,true);
});

test('a rejected renderer frame cannot make the hidden moving scene ready to start',async()=>{
 let ready=false;const f=fixture({renderer:{initialize:async()=>true,render:()=>ready,dispose(){}}});
 await f.session.initialize();assert.equal(f.session.render(),false);assert.equal(await f.session.start(),false);
 assert.equal(f.session.status().opening.renderPrimed,false);ready=true;assert.equal(f.session.render(),true);
 assert.equal(await f.session.start(),true);await f.session.dispose();
});

test('losing audio during the lead-in holds its clock and remaining cut instead of revealing a silent van',async()=>{
 const context={state:'running'},f=fixture({context});await begin(f);step(f.session,.25);const before=f.session.status().state.programTime;
 context.state='suspended';f.session.update(.1);assert.equal(f.session.status().paused,true);assert.equal(f.session.status().state.programTime,before);
 step(f.session,2);assert.equal(f.session.status().opening.covered,true);context.state='running';await f.session.start();step(f.session,.42);
 assert.equal(f.session.status().opening.covered,false);assert.equal(f.calls.filter(c=>c[0]==='prime').length,1);await f.session.dispose();
});

test('retry fetches the failed voice and replaces the actual silent cached programme PCM',async()=>{
 const make=(channels,length,sampleRate)=>{const data=new Float32Array(length);return{numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,getChannelData:()=>data};};
 const voice=make(1,Math.ceil(4.58*16000),16000);for(let i=0;i<voice.length;i++)voice.getChannelData(0)[i]=.1*Math.sin(i*.13);
 const requests=[],owner=Object.create(SourceDriveAcoustics.prototype);
 Object.assign(owner,{context:{state:'running',createBuffer:make,decodeAudioData:async()=>voice},cabin:{},programmes:new Map(),programmeOptions:new Map(),scratchKeys:new Set(),voices:new Map(),assetErrors:['service-water: HTTP 503','company-host: HTTP 500'],closed:false,
  fetcher:async url=>{requests.push(url);return{ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};}});
 const old=owner.getProgramme('service-ordinary'),other=owner.getProgramme('music-ordinary');
 const at=(buffer)=>Math.max(...buffer.getChannelData(0).slice(3.2*16000,3.25*16000).map(Math.abs));
 assert.ok(at(old)<.003);const result=await owner.retryMovingOpening({...createDrive(),programTime:3.2});
 assert.equal(result.ready,true);assert.equal(requests.length,1);assert.ok(requests[0].endsWith('/service-water.wav'));
 const current=owner.getProgramme('service-ordinary');assert.notEqual(current,old);assert.ok(at(current)>.15);
 assert.equal(owner.getProgramme('music-ordinary'),other);assert.deepEqual(owner.assetErrors,['company-host: HTTP 500']);
});
