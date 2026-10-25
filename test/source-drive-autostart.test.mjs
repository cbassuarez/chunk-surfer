import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceDriveSession,freshSourceDriveCheckpoint} from '../src/game/source-drive-session.js';
import {worldAt} from '../src/game/source-drive/road.js';
import {SOURCE_DRIVE_OPENING} from '../src/game/source-drive/entry-cut.js';

const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const journey=main.slice(main.indexOf('async function beginSourceDriveJourney('),main.indexOf('// Explicit review setup;',main.indexOf('async function beginSourceDriveJourney(')));
const updateBody=journey.match(/update:dt=>\{([\s\S]*?)\n    \},/)?.[1];
assert.ok(updateBody,'the actual host update is exercised rather than a second controller');
const hostUpdate=new Function('owner','paused','gameplayInputLifecycleActive','sourceDriveStatus','dt',updateBody);
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
const pose={x:3,y:-924,yaw:.2,pitch:-.04,facing:0};
function parkedCheckpoint(){
 const cp=freshSourceDriveCheckpoint({returnPose:pose,runId:'automatic-test'}),p=worldAt(815,-1.35);
 cp.status='active';cp.started=true;
 Object.assign(cp.drive,{x:p.x,z:p.z,heading:p.heading,roadHeight:p.height,roadOffset:-1.35,furthest:930,programTime:71.25,phase:3,brakeHold:true,radioOn:false,station:'music'});
 cp.tape={schema:1,takeRefs:[{id:'original-take',key:'original-blob',durable:true}],pending:null};
 cp.look={yaw:.4,pitch:.1};return cp;
}
function fixture(options={}){
 const state={focused:true,menu:false,renderOK:true,audioReady:true,startError:null,starts:0,primes:0,recordings:0,paused:true,hydrated:null};
 const acoustics={cabin:{},initialize:async()=>{},setPaused:p=>{state.paused=p;},sync(){},dispose(){},
  openingReadiness:()=>({ready:state.audioReady,reason:'Opening voice unavailable'}),primeMovingOpening:()=>{state.primes++;}};
 const recording={setPaused:async p=>{state.tapePaused=p;},hydrate:async cp=>{state.hydrated=structuredClone(cp);},checkpoint:()=>state.hydrated,
  status:()=>({recording:false,playing:false}),record:async()=>{state.recordings++;},tick(){},dispose:async()=>{}};
 const renderer={initialize:async()=>true,render:()=>state.renderOK,ready:()=>state.renderOK,dispose(){}};
 const session=createSourceDriveSession({metrics,returnPose:pose,runId:'automatic-test',renderer,recording,acoustics,
  onStart:async()=>{state.starts++;if(state.startError)throw state.startError;},...options});
 async function tick(dt=1/60){hostUpdate(session,state.menu,()=>state.focused,session.status(),dt);session.render();await flush();}
 return{session,state,tick};
}

test('a default fresh flashback begins in motion only after the real host has presented a final frame, without Enter',async()=>{
 const h=fixture();await h.session.initialize();const before=h.session.serialize();
 assert.equal(before.drive.speed,SOURCE_DRIVE_OPENING.speedMps);
 await h.tick();assert.equal(h.session.status().paused,true,'the first update cannot run ahead of the first presentation');
 assert.deepEqual(h.session.serialize(),before,'no vehicle, weather, programme or tape advancement while preparing');
 await h.tick();assert.equal(h.session.status().paused,false);assert.equal(h.state.starts,1);assert.equal(h.state.primes,1);
 for(let i=0;i<50;i++)await h.tick();
 assert.ok(h.session.status().state.z<before.drive.z-8);assert.equal(h.session.openingFrame().covered,false);
 assert.equal(h.state.recordings,0,'automatic driving cannot start a physical tape take');
 assert.equal(h.session.status().state.events.filter(e=>e.type==='journey-start').length,1);
 await h.session.dispose();
});

test('a reloaded stopped journey resumes its clock automatically while preserving pose, brake, OFF receiver, look and tape',async()=>{
 const cp=parkedCheckpoint(),h=fixture({checkpoint:cp});await h.session.initialize();
 assert.deepEqual(h.state.hydrated,cp.tape);
 await h.tick();await h.tick();assert.equal(h.session.status().paused,false);
 for(let i=0;i<30;i++)await h.tick();const after=h.session.serialize();
 assert.deepEqual([after.drive.x,after.drive.z,after.drive.heading],[cp.drive.x,cp.drive.z,cp.drive.heading]);
 assert.equal(after.drive.brakeHold,true);assert.ok(after.drive.programTime>cp.drive.programTime+.45);
 assert.equal(after.drive.radioOn,false);assert.equal(after.drive.station,'music');assert.deepEqual(after.look,cp.look);assert.deepEqual(after.tape,cp.tape);
 assert.equal(h.state.primes,0,'a resume must not replay the remembered opening');assert.equal(h.state.recordings,0);
 await h.session.dispose();
});

test('menu and lost native focus hold all clocks and tape, then resume without Enter or inherited pedals',async()=>{
 const h=fixture({checkpoint:parkedCheckpoint()});await h.session.initialize();await h.tick();await h.tick();
 h.session.key({key:'w'});await h.tick();
 for(const hold of['menu','focus']){
  if(hold==='menu')h.state.menu=true;else h.state.focused=false;
  await h.tick();const before=h.session.serialize();
  for(let i=0;i<20;i++)await h.tick();
  assert.deepEqual(h.session.serialize(),before);assert.equal(h.session.status().paused,true);assert.equal(h.state.tapePaused,true);
  h.state.menu=false;h.state.focused=true;await h.tick();await h.tick();
  assert.equal(h.session.status().paused,false);assert.equal(h.state.tapePaused,false);
  h.session.key({key:'w',repeat:true});await h.tick();assert.equal(h.session.status().state.throttle,0);
 }
 await h.session.dispose();
});

test('a failed final draw cannot run an invisible journey and automatically recovers on a successful picture',async()=>{
 const h=fixture({checkpoint:parkedCheckpoint()});h.state.renderOK=false;await h.session.initialize();
 const before=h.session.serialize();for(let i=0;i<12;i++)await h.tick();assert.deepEqual(h.session.serialize(),before);assert.equal(h.state.starts,0);
 h.state.renderOK=true;await h.tick();await h.tick();assert.equal(h.session.status().paused,false);assert.equal(h.state.starts,1);
 await h.session.dispose();
});

test('an unavailable opening stays covered and retries with bounded backoff rather than waiting for Enter or retrying every frame',async()=>{
 const h=fixture();h.state.audioReady=false;await h.session.initialize();await h.tick();await h.tick();
 const before=h.session.serialize(),starts=h.state.starts;assert.match(h.session.status().error,/Opening voice/);assert.equal(h.session.openingFrame().covered,true);
 for(let i=0;i<12;i++)await h.tick();assert.equal(h.state.starts,starts);assert.deepEqual(h.session.serialize(),before);
 h.state.audioReady=true;for(let i=0;i<60;i++)await h.tick();
 assert.equal(h.session.status().paused,false);assert.equal(h.session.openingFrame().covered,false);assert.equal(h.state.primes,1);
 assert.equal(h.session.status().error,null);await h.session.dispose();
});

test('a focus loss while asynchronous automatic start awaits cannot unpause a hidden game',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),h=fixture({checkpoint:parkedCheckpoint(),onStart:()=>gate});
 await h.session.initialize();await h.tick();await h.tick();h.state.focused=false;await h.tick();release();await flush();
 assert.equal(h.session.status().paused,true);assert.equal(h.state.tapePaused,true);
 h.state.focused=true;await h.tick();await h.tick();assert.equal(h.session.status().paused,false);
 await h.session.dispose();
});

test('a rejected picture while automatic start awaits cancels that start before its audio or clocks can run',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),h=fixture({checkpoint:parkedCheckpoint(),onStart:()=>gate});
 await h.session.initialize();await h.tick();await h.tick();h.state.renderOK=false;await h.tick();release();await flush();
 assert.equal(h.session.status().paused,true);assert.equal(h.state.tapePaused,true);
 const before=h.session.serialize();for(let i=0;i<12;i++)await h.tick();assert.deepEqual(h.session.serialize(),before);
 h.state.renderOK=true;await h.tick();await h.tick();assert.equal(h.session.status().paused,false);
 await h.session.dispose();
});

test('failed initialization retries automatically without creating late or duplicate recording owners',async()=>{
 let loads=0,factories=0,ready=false;
 const h=fixture({recording:null,renderer:{initialize:async()=>{loads++;if(!ready)throw Error('Pack unavailable');return true;},render:()=>true,dispose(){}},
  createRecording:async()=>{factories++;return{setPaused:async()=>{},status:()=>({}),dispose:async()=>{}};}});
 await h.tick();assert.equal(loads,1);assert.equal(factories,0);assert.equal(h.session.status().paused,true);
 for(let i=0;i<12;i++)await h.tick();assert.equal(loads,1,'one unavailable asset cannot be fetched every update');
 ready=true;for(let i=0;i<65;i++)await h.tick();
 assert.equal(loads,2);assert.equal(factories,1);assert.equal(h.session.status().paused,false);assert.equal(h.session.openingFrame().covered,false);
 await h.session.dispose();
});

test('an explicit review placement may stay physically parked, while Enter has no start/resume behavior',async()=>{
 const h=fixture({entry:'review'});await h.session.initialize();
 assert.equal(h.session.status().state.speed,0);assert.equal(h.session.openingFrame(),null);
 h.session.key({key:'Enter'});await flush();assert.equal(h.session.status().paused,true);assert.equal(h.state.starts,0);
 await h.tick();await h.tick();assert.equal(h.session.status().paused,false);
 await h.session.pause();h.session.key({key:'Enter'});await flush();assert.equal(h.session.status().paused,true);
 assert.doesNotMatch(journey,/ENTER(?:\s*·| TO)\s*(?:DRIVE|START|RESUME|RETRY)/);
 assert.match(journey,/ENTER · LEAVE VAN/,'parked dismount remains a deliberate interaction');
 await h.session.dispose();
});
