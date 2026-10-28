import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {createSourceFalseReturnScene} from '../src/game/source-false-return-scene.js';
import {createSourceEarthfallScene} from '../src/game/source-earthfall-scene.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_CONTINUATION as C, CONTINUATION_DROP_LIPS} from '../src/data/source-continuation.js';
import {freshSourceFalseReturn} from '../src/game/source-false-return.js';
import {freshSourceEarthfall} from '../src/game/source-earthfall.js';

const renderer=()=>({initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const update=(scene,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)scene.update(Math.min(1/60,seconds-i/60));};
const continuation=()=>({...freshSourceContinuation({runId:'threshold',returnPose:{x:4,y:5}}),status:'active'});
const falseLayout={spawn:{x:0,z:1,feet:4.8,yaw:0,pitch:0},bounds:{minX:-3,maxX:3,minZ:-18,maxZ:4},
  doors:Array.from({length:5},(_,i)=>({id:'practice-'+i,x:0,z:-2-i*3,feet:4.8,normal:{x:0,z:-1},halfWidth:.8,counted:true,openSeconds:.45})),
  loops:[],supportAt:()=>({floor:4.8,ceil:8.4}),canOccupy:()=>true};

test('capture and recovery release old intent, including a new movement press made while the sling owns the body',async()=>{
  const seed={...continuation(),phase:'catch',...CONTINUATION_DROP_LIPS[0],feet:C.catch.top,level:0};
  Object.assign(seed.counterweight,{active:true,mode:'walking',pathIndex:0,x:CONTINUATION_DROP_LIPS[0].x+.95,z:CONTINUATION_DROP_LIPS[0].z,y:C.catch.top});
  const trace=[],scene=createSourceContinuationScene({checkpoint:seed,renderer:renderer(),onTrace:t=>trace.push(t)});
  await scene.initialize();scene.key({key:'w'});scene.update(1/60);
  assert.ok(scene.serialize().recovery,'a real approaching drum captures the exposed body');
  scene.key({key:'d'});scene.key({key:'w',repeat:true});
  for(let i=0;i<600&&scene.serialize().recovery;i++)scene.update(1/60);
  const restored=scene.serialize();assert.equal(restored.recovery,null);assert.ok(restored.grace>2.9);
  update(scene,.4);
  assert.equal(scene.serialize().x,restored.x);assert.equal(scene.serialize().z,restored.z,
    'old movement cannot carry a recovered body out of its usable refuge');
  scene.key({key:'d',repeat:true});update(scene,.1);assert.equal(scene.serialize().x,restored.x);
  scene.keyup({key:'d'});scene.key({key:'d'});update(scene,.1);
  assert.ok(scene.serialize().x>restored.x,'fresh input immediately restores ordinary control');
  assert.deepEqual(trace.filter(t=>t.type==='control-boundary').map(t=>t.reason),['capture','recovered']);
  scene.exit();
});

test('a committed drop releases held intent and returns control on the supported landing without queued movement',async()=>{
  const seed={...continuation(),phase:'catch',...CONTINUATION_DROP_LIPS[0],feet:C.catch.top,level:0},trace=[];
  const scene=createSourceContinuationScene({checkpoint:seed,renderer:renderer(),onTrace:t=>trace.push(t)});
  await scene.initialize();scene.key({key:'w'});scene.key({key:'e'});assert.ok(scene.serialize().fall);
  scene.key({key:'d'});scene.key({key:'w',repeat:true});
  for(let i=0;i<600&&scene.serialize().fall;i++)scene.update(.1);
  const landed=scene.serialize();assert.equal(landed.fall,null);assert.equal(landed.level,1);assert.equal(landed.accumulator,0);
  update(scene,.4);assert.equal(scene.serialize().x,landed.x);assert.equal(scene.serialize().z,landed.z);
  assert.deepEqual(trace.filter(t=>t.type==='control-boundary').map(t=>t.reason),['drop','land']);
  scene.key({key:'d',repeat:true});scene.update(.1);assert.equal(scene.serialize().x,landed.x);
  scene.keyup({key:'d'});scene.key({key:'d'});scene.update(.1);assert.ok(scene.serialize().x>landed.x);scene.exit();
});

test('an undelivered terminal continuation checkpoint resumes its bounded handoff once and pause freezes that handoff',async()=>{
  for(const status of ['completed','returned']){
    let complete=0,returned=0;
    const seed={...continuation(),status,completed:status==='completed',phase:'catch',...C.catch.finalApproach,level:C.catch.levels-1,
      exitReceipt:status==='completed'?{id:'threshold:source-continuation-exit',delivered:false}:null};
    const scene=createSourceContinuationScene({checkpoint:seed,renderer:renderer(),onComplete:()=>{complete++;return true;},onReturn:()=>{returned++;return true;}});
    await scene.initialize();assert.equal(scene.view().leaving,true);
    scene.key({key:'w'});const before=scene.serialize();scene.pause();scene.update(2);
    assert.deepEqual(scene.serialize(),before);assert.equal(complete+returned,0);
    scene.resume();update(scene,.4);await settle();update(scene,1);
    assert.equal(complete,status==='completed'?1:0);assert.equal(returned,status==='returned'?1:0);
    assert.deepEqual(scene.serialize(),before,'restored terminal ownership never resumes local movement');scene.exit();
  }
});

test('a false Ellery checkpoint saved after its fifth crossing continues into Source once instead of becoming an inert room',async()=>{
  let completions=0;
  const seed={...freshSourceFalseReturn({runId:'threshold',spawn:falseLayout.spawn}),status:'completed',
    opened:falseLayout.doors.map(d=>d.id),exitReceipt:{id:'threshold:source-false-return:source-II',doorId:'practice-4',delivered:false}};
  const scene=createSourceFalseReturnScene({checkpoint:seed,layout:falseLayout,renderer:renderer(),onComplete:()=>{completions++;return true;}});
  await scene.initialize();assert.equal(scene.view().leaving,true);assert.equal(completions,0);
  scene.pause();scene.update(2);assert.equal(completions,0);scene.resume();update(scene,.3);await settle();update(scene,1);
  assert.equal(completions,1);scene.exit();
});

test('Earthfall does not reacquire a key held through pause from OS repeat',async()=>{
  const scene=createSourceEarthfallScene({checkpoint:freshSourceEarthfall({runId:'threshold'}),renderer:renderer()});
  await scene.initialize();scene.key({key:'a'});scene.update(.1);scene.pause();scene.resume();
  const before=scene.serialize();scene.key({key:'a',repeat:true});scene.update(.1);
  assert.equal(scene.serialize().x,before.x);assert.equal(scene.serialize().z,before.z);
  scene.keyup({key:'a'});scene.key({key:'a'});scene.update(.1);assert.ok(scene.serialize().x<before.x);scene.exit();
});

test('a rejected Earthfall completion retries the same destination and retains the final rendered world',async()=>{
  for(const failure of [false,Error('next scene unavailable')]){
    let complete=0,returned=0;
    const seed={...freshSourceEarthfall({runId:'threshold'}),status:'completed',committed:true,phase:'landed',feet:0,z:-42.3,
      elapsed:15,clock:15,exitDoor:{open:true,progress:1},exitReceipt:{delivered:false}};
    const scene=createSourceEarthfallScene({checkpoint:seed,renderer:renderer(),onComplete:()=>{complete++;if(complete===1){if(failure===false)return false;throw failure;}return true;},onReturn:()=>{returned++;}});
    await scene.initialize();await settle();assert.equal(complete,1);assert.ok(scene.view().error);assert.equal(scene.view().ready,false);
    const before=scene.serialize();scene.key({key:'w'});scene.update(1);assert.deepEqual(scene.serialize(),before);
    scene.key({key:'e',repeat:true});assert.equal(complete,1);
    scene.key({key:'e'});await settle();assert.equal(complete,2);assert.equal(returned,0,
      'retrying the onward threshold cannot silently become a return to Source I');scene.exit();
  }
});

test('Earthfall preparation and a renderer fault retain the last production raster without a clear or gameplay HUD pass',async()=>{
  let resolveReady,clears=0,renders=0;
  const ready=new Promise(resolve=>resolveReady=resolve);
  const scene=createSourceEarthfallScene({checkpoint:freshSourceEarthfall({runId:'threshold'}),
    renderer:{initialize:()=>ready,ready:()=>true,render:()=>{renders++;return false;},clear(){clears++;},dispose(){}}});
  const initializing=scene.initialize();scene.render();assert.equal(clears,0);assert.equal(renders,0);
  resolveReady(true);await initializing;scene.render();assert.ok(scene.view().error);scene.render();
  assert.equal(renders,1);assert.equal(clears,0,'a recoverable fault cannot replace the held game image with black loading captions');
  assert.equal(scene.suppressesHud,true);scene.exit();
});

test('a detached view carries the real torch without interference from the parked host body',async()=>{
  const {readFile}=await import('node:fs/promises');
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const start=main.indexOf('function sourcePresentationTorch(){'),end=main.indexOf('\nasync function beginCoastalMemoryJourney',start);
  assert.ok(start>=0&&end>start);
  const field={active:false},calls=[];
  const make=new Function('REC','itemLost','resolveTorchLook','performance','flashMode','currentPerception','applyFieldKitTorchLook','activeKitEffects','applyHushTorchInterference','inactiveHushField','hushActiveForPlayer','hushFieldFrame',
    main.slice(start,end)+'\nreturn sourcePresentationTorch;');
  const sceneTorch=make({lightOn:()=>true,batteryLevel:()=>.37},()=>false,
    options=>{calls.push(options);return{gain:.37,color:[1,.8,.5]};},{now:()=>11000},()=> 'full',()=>({torch:{sensitivity:.8}}),
    (look,kit)=>({...look,gain:look.gain*kit.torchGain}),{torchGain:1.2},
    (look,actual)=>{assert.equal(actual,field);return{...look,hushInterference:actual.active?1:0};},()=>field,
    ()=>{throw Error('parked host HUSH must never be sampled');},{active:true});
  const torch=sceneTorch();assert.equal(torch.on,true);assert.equal(torch.look.hushInterference,0);
  assert.equal(torch.look.gain,.37*1.2);assert.equal(calls[0].battery,.37);assert.deepEqual(calls[0].perception,{sensitivity:.8});
});
