import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {nightDeadlinePending} from '../src/game/night-deadline.js';
import {sourceContinuationRecordingDestination} from '../src/game/source-continuation-contact.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=main.indexOf('function sourceHushContactFacts(){'),
 end=main.indexOf('\n// The HUSH arrives once',start);
assert.ok(start>=0&&end>start);
const source=main.slice(start,end),plain=value=>JSON.parse(JSON.stringify(value));
function fixture({continuation=true}={}){
 const calls={begin:[],resolve:[],cancel:0,released:0,checkpoints:[],sequence:[],saves:[],speeches:[],armed:0,pushed:[]},takes=[{id:'real-take',ordinal:1,roomId:'b3'}],
  data={run:{id:'main-contact-run',ledger:{}},nightDeadline:{phase:'warning'}},busy={recording:false,listening:false,playback:false};
 const actor={hasTarget:true,velocityX:1,velocityY:2,speed:3},owner={releaseContact:()=>calls.released++},runtime={
  setContinuationCheckpoint:checkpoint=>{calls.checkpoints.push(checkpoint);calls.sequence.push('checkpoint');return true;},
  beginHushContact:(facts,options)=>{calls.begin.push({facts,options});calls.sequence.push('begin');return{id:'actual-warning',chapter:options.chapter};},
  resolveHushContactChoice:(choice,options)=>{calls.resolve.push({choice,options});return runtime.result;},
  cancelHushContact:()=>calls.cancel++,state:()=>({version:1}),result:{handled:true,terminal:false,combat:false},
 };
 const scope=vm.createContext({sourceContinuationScene:continuation?owner:null,chunkSurfRuntime:runtime,usingSourceSpace:()=>!continuation,
  REC:{isRecording:()=>busy.recording,isListening:()=>busy.listening,composure:()=>73,composureCeiling:()=>90,recState:()=>({takes:['b3','b4']})},
  PB:{isPlaying:()=>busy.playback,serializeTakes:()=>takes},getSave:()=>data,nightDeadlinePending,sourceContinuationRecordingDestination,
  combatBuild:()=>({techniques:['patch-a','patch-b','patch-c']}),TECHNIQUE_DEFS:[{id:'patch-a',branch:'listen'},{id:'patch-b',branch:'listen'},{id:'patch-c',branch:'cut'}],
  flagTest:id=>id==='has.interface'||id==='dock.clue.case.sound',deriveStoryEvidence:()=>({tags:['actual-night-trace']}),
  windowChoreography:{beginSourceContact:()=>{}},PRES:{presenceState:()=>actor},STORY:{},actx:null,dialogGain:null,master:null,fireCue(){},CR:{fx(){}},
  createReplayService:()=>({}),makeSourceContactScene:options=>{scope.dialog=options;return{id:'source-contact-dialog'};},scenes:{push:scene=>calls.pushed.push(scene)},
  R3:{r3dHushPose(){}},SPEECH:{say:line=>calls.speeches.push(line)},roomLabel:id=>id,
  saveCommit:patch=>calls.saves.push(patch),px:10,py:-950,armHeldMovement:()=>calls.armed++,performance:{now:()=>1000},
 });
 vm.runInContext(source,scope);return{scope,calls,runtime,owner,busy,data,takes,actor};
}

test('actual Contact host forwards night facts, current chapter and run, checkpointing the local body before the warning',()=>{
 for(const chapter of['I','II','III']){
  const f=fixture({continuation:chapter!=='I'}),checkpoint=chapter==='I'?null:{phase:chapter==='II'?'wrong-return':'catch',x:16,z:-22,feet:0};
  assert.equal(f.scope.openSourceHushContact({chapter,locallyAvailable:chapter!=='I',checkpoint}),true);
  assert.deepEqual(plain(f.calls.begin[0].options),{chapter,locallyAvailable:chapter!=='I',captured:false,runId:'main-contact-run'});
  assert.deepEqual(plain(f.calls.begin[0].facts),{leads:{listen:2,cut:1},composure:73,ceiling:90,takes:2,rig:true,evidence:['actual-night-trace'],clues:{tallies:false,voice:true,chandelier:false}});
  if(checkpoint){assert.equal(f.calls.checkpoints[0],checkpoint);assert.deepEqual(f.calls.sequence,['checkpoint','begin']);}
  assert.equal(f.calls.resolve.length,0,'opening or approaching never confirms a cost');assert.equal(f.actor.hasTarget,false);assert.equal(f.actor.speed,0);
 }
});

test('actual captured Contact host forwards the physical offer without choosing or confirming combat',()=>{
 const f=fixture(),checkpoint={phase:'wrong-return',recovery:{reason:'hush-pressure',contact:'pending'}};
 assert.equal(f.scope.openSourceHushContact({chapter:'II',locallyAvailable:true,captured:true,checkpoint}),true);
 assert.equal(f.calls.checkpoints[0],checkpoint);assert.equal(f.calls.begin[0].options.captured,true);
 assert.equal(f.calls.resolve.length,0);f.scope.dialog.onResolve();assert.equal(f.calls.cancel,1);assert.equal(f.calls.released,1);
});

test('recording, listening, playback and an expired night refuse new Contact before any modal, checkpoint or cost',()=>{
 for(const mode of['recording','listening','playback','pending','presenting','terminal']){
  const f=fixture();if(mode in f.busy)f.busy[mode]=true;else f.data.nightDeadline.phase=mode;
  assert.equal(f.scope.openSourceHushContact({chapter:'II',locallyAvailable:true,checkpoint:{x:16,z:-22,feet:0}}),false,mode);
  assert.equal(f.calls.begin.length+f.calls.pushed.length+f.calls.checkpoints.length+f.calls.resolve.length,0);
 }
});

test('a warned repeat passes exact real tape rows and the supported this-or-next Source destination without committing another battle',()=>{
 for(const chapter of['I','II','III']){
  const f=fixture({continuation:chapter!=='I'});f.scope.openSourceHushContact({chapter,locallyAvailable:chapter!=='I'});
  const destination=sourceContinuationRecordingDestination(chapter==='I'?'II':'III');
  f.runtime.result={handled:true,terminal:true,combat:false,repeatContact:true,recordingContact:{handled:true,recording:{roomId:'b3',place:'Studio B3',destination}}};
  f.scope.dialog.onChoice('confirm-repeat');assert.equal(f.calls.resolve[0].options.takes,f.takes);
  assert.deepEqual(plain(f.calls.resolve[0].options.destination),destination);assert.equal(f.calls.saves.length,1);
  f.scope.dialog.onResolve();assert.equal(f.calls.cancel,0);assert.equal(f.calls.released,chapter==='I'?0:1);assert.equal(f.calls.armed,1);
  assert.equal(f.calls.speeches.length,1);assert.match(f.calls.speeches[0].text,new RegExp('Source '+destination.chapter));
 }
});

test('asking questions or closing before consent has no recording cost and releases the local body',()=>{
 const f=fixture();f.scope.openSourceHushContact({chapter:'II',locallyAvailable:true});
 f.scope.dialog.onChoice('ask-question');assert.equal(f.calls.resolve.length,1);assert.equal(f.calls.speeches.length,0);
 f.scope.dialog.onResolve();assert.equal(f.calls.cancel,1);assert.equal(f.calls.released,1);assert.equal(f.calls.armed,1);
});

test('deliberate combat keeps the local body held until the separately tested battle owner resolves it',()=>{
 const f=fixture();f.scope.openSourceHushContact({chapter:'III',locallyAvailable:true});
 f.runtime.result={handled:true,terminal:true,combat:true};f.scope.dialog.onChoice('confirm-combat');f.scope.dialog.onResolve();
 assert.equal(f.calls.cancel,0);assert.equal(f.calls.released,0);assert.equal(f.calls.speeches.length,0);assert.equal(f.calls.saves.length,1);
});

test('stale Contact presenters cannot resolve/cancel a replacement runtime or release another continuation owner',()=>{
 for(const replacement of['runtime','owner']){
  const f=fixture();f.scope.openSourceHushContact({chapter:'II',locallyAvailable:true});
  if(replacement==='runtime')f.scope.chunkSurfRuntime={resolveHushContactChoice:()=>assert.fail('stale cost'),cancelHushContact:()=>assert.fail('stale cancel')};
  else f.scope.sourceContinuationScene={releaseContact:()=>assert.fail('stale release')};
  f.scope.dialog.onChoice('confirm-repeat');f.scope.dialog.onResolve();
  assert.equal(f.calls.resolve.length+f.calls.saves.length+f.calls.speeches.length+f.calls.cancel+f.calls.released+f.calls.armed,0);
 }
});
