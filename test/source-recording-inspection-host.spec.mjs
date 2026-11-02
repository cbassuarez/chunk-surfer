import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSourceRecordingInspectionHost} from '../src/game/source-recording-inspection-host.js';
import {createSourceRecordingAudition} from '../src/game/source-recording-audition.js';
import {claimSourceRecording,recoverSourceRecording} from '../src/game/source-recording-custody.js';
import {sourceContinuationRecordingDestination} from '../src/game/source-continuation-contact.js';
import {freshSourceContinuation,normalizeSourceContinuation} from '../src/game/source-continuation.js';

function audio(){
 let active=null,position=0,stops=0,serial=0;
 const p={isPlaying:()=>!!active,isArchivedPlaybackOwner:h=>!!h&&h===active,
  playArchivedTake(take,{offsetSeconds=0}={}){position=offsetSeconds;return active={id:++serial,take};},
  seekArchivedPlayback(at){position=at;return active={...active,id:++serial};},
  pauseArchivedPlayback(paused){active={...active,id:++serial,paused};return active;},
  playbackSnapshot:()=>active?{elapsedSec:position}:null,tickPlayback(){},stopPlayback(){active=null;stops++;},
  advance:seconds=>{position+=seconds;},owner:()=>active,stops:()=>stops};return p;
}
function fixture(){
 const take={id:'take:2',ordinal:2,roomId:'main_b3',place:'Studio B3',status:'accepted',counted:true,
  startSeconds:60,endSeconds:120,durationSeconds:60,slate:{text:'Studio B3. Room tone. Take two.'},audible:[['source',.2]]};
 const destination=sourceContinuationRecordingDestination('II');
 let custody=claimSourceRecording(null,{runId:'night',chapter:'I',contactId:'repeat:1',takes:[take],destination}).state;
 let state=normalizeSourceContinuation({...freshSourceContinuation({runId:'night'}),phase:'wrong-return',x:16,z:-21.4,feet:0,yaw:0,status:'active'});
 state.counterweight.active=false;
 let releases=0,commits=0,runId='night',pending=false,options;
 const runtime={sourceRecordingCustody:()=>custody,recoverSourceRecording(value){const result=recoverSourceRecording(custody,value);custody=result.state;return result;}};
 const owner={serialize:()=>state,releaseContact(){releases++;}};
 let currentOwner=owner,currentRuntime=runtime;const playback=audio();
 const scene=makeSourceRecordingInspectionHost({request:{receiptId:custody.recordings[0].id,chapter:'II',locationId:destination.locationId},runtime,owner,
  getRuntime:()=>currentRuntime,getOwner:()=>currentOwner,getRunId:()=>runId,getTakes:()=>[take],playback,renderer:{},
  presentation:()=>({deadlinePending:pending}),onCommit:()=>commits++,makeScene:value=>(options=value,{id:'inspection'})});
 return{scene,options,playback,take,custody:()=>custody,commits:()=>commits,releases:()=>releases,
  move:()=>{state={...state,x:state.x+20};},replace:()=>{currentOwner={};},run:()=>{runId='different';},deadline:()=>{pending=true;}};
}
test('physical inspection and audition preserve custody; only explicit keep commits the exact interval',async()=>{
 const f=fixture(),before=structuredClone(f.take);assert.ok(f.scene);
 assert.equal(f.custody().recordings[0].status,'held');
 const transport=await f.options.onAudition({positionSeconds:17});assert.ok(transport);
 assert.equal(transport.snapshot().positionSeconds,17);transport.seek(33);assert.equal(transport.snapshot().positionSeconds,33);
 transport.pause();assert.equal(transport.snapshot().paused,true);await transport.resume();assert.equal(transport.snapshot().playing,true);
 assert.equal(f.custody().recordings[0].status,'held');assert.deepEqual(f.take,before);
 transport.stop();assert.equal(f.options.onRecover(),true);assert.equal(f.commits(),1);assert.equal(f.custody().recordings[0].status,'recovered');
 f.options.onExit({recovered:true});assert.equal(f.releases(),1);
});
test('put back restores the same owner and leaves the missing recording held',()=>{
 const f=fixture();f.options.onExit({reason:'put-back'});assert.equal(f.releases(),1);assert.equal(f.commits(),0);assert.equal(f.custody().recordings[0].status,'held');
});
test('moving away, replacing the owner or changing the run cannot keep or audition a stale cassette',async()=>{
 for(const mutation of['move','replace','run']){const f=fixture();f[mutation]();assert.equal(f.options.onRecover(),false);assert.equal(await f.options.onAudition({positionSeconds:0}),null);assert.equal(f.commits(),0);}
});
test('the deadline denies new playback, reel seeks, resume and custody without interrupting admitted playback',async()=>{
 const f=fixture(),transport=await f.options.onAudition({positionSeconds:9});f.deadline();
 assert.equal(transport.snapshot().playing,true);assert.equal(await transport.seek(20),false);transport.pause();assert.equal(await transport.resume(),false);
 assert.equal(f.options.onRecover(),false);assert.equal(await f.options.onAudition({positionSeconds:0}),null);transport.stop();
});
test('closing an obsolete audition never stops a replacement playback owner',async()=>{
 const playback=audio();const take={durationSeconds:10};const audition=await createSourceRecordingAudition({playback,take});
 playback.stopPlayback();const other=playback.playArchivedTake({durationSeconds:3});audition.stop();assert.equal(playback.owner(),other);
});
test('a late media decode after owner revocation is stopped and cannot return a live inspection transport',async()=>{
 const playback=audio();let resolve,valid=true;const original=playback.playArchivedTake;
 playback.playArchivedTake=(...args)=>{const handle=original(...args);handle.readyPromise=new Promise(done=>{resolve=done;});return handle;};
 const pending=createSourceRecordingAudition({playback,take:{durationSeconds:10},valid:()=>valid});valid=false;resolve(true);
 assert.equal(await pending,null);assert.equal(playback.isPlaying(),false);
});

test('aborting a never-resolving media preparation releases its exact low-level playback owner immediately',async()=>{
 const playback=audio(),controller=new AbortController(),original=playback.playArchivedTake;
 playback.playArchivedTake=(...args)=>{const handle=original(...args);handle.readyPromise=new Promise(()=>{});return handle;};
 const pending=createSourceRecordingAudition({playback,take:{durationSeconds:10},signal:controller.signal});
 assert.equal(playback.isPlaying(),true);controller.abort();assert.equal(playback.isPlaying(),false);assert.equal(await pending,null);assert.equal(playback.stops(),1);
});
test('a canceled decode can never revive playback or stop a replacement owner, regardless of replacement timing',async()=>{
 for(const replaceFirst of[false,true]){
  const playback=audio(),controller=new AbortController(),original=playback.playArchivedTake;let resolve,first=true;
  playback.playArchivedTake=(...args)=>{const handle=original(...args);if(first){first=false;handle.readyPromise=new Promise(done=>resolve=done);}return handle;};
  const pending=createSourceRecordingAudition({playback,take:{durationSeconds:10},signal:controller.signal});
  let replacement;if(replaceFirst){playback.stopPlayback();replacement=playback.playArchivedTake({durationSeconds:3});}
  controller.abort();if(!replacement)replacement=playback.playArchivedTake({durationSeconds:3});
  assert.equal(await pending,null);assert.equal(playback.owner(),replacement);resolve(true);await Promise.resolve();await Promise.resolve();assert.equal(playback.owner(),replacement);
 }
});
test('actual host and inspection cancel a pending owner on STOP, put-back, KEEP, pause and equipment loss without waiting for media',async()=>{
 const {createSourceRecordingInspectionScene}=await import('../src/game/source-recording-inspection.js');
 for(const action of['stop','put-back','keep','pause','loss']){
  const f=fixture(),original=f.playback.playArchivedTake,before=structuredClone(f.take),presentation={};
  f.playback.playArchivedTake=(...args)=>{const handle=original(...args);handle.readyPromise=new Promise(()=>{});return handle;};
  const s=createSourceRecordingInspectionScene({...f.options,renderer:{initialize:()=>true,ready:()=>true,render:()=>true},presentation:()=>presentation});
  await s.initialize();s.activate('play');assert.equal(f.playback.isPlaying(),true);
  if(action==='stop')s.activate('stop');else if(action==='put-back')s.key({key:'Escape'});else if(action==='keep')s.key({key:'e'});else if(action==='pause')s.pause();else{presentation.recorderAvailable=false;s.update(.01);}
  assert.equal(f.playback.isPlaying(),false,action);await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(f.custody().recordings[0].status,action==='keep'?'recovered':'held',action);assert.deepEqual(f.take,before);s.exit();
 }
});
