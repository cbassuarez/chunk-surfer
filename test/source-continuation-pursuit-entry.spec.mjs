import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C, CONTINUATION_DROP_LIPS, continuationCatchFloor, continuationRefugeAt} from '../src/data/source-continuation.js';
import {freshSourceContinuation, stepSourceContinuation, sourceContinuationThreatTelemetry} from '../src/game/source-continuation.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
const seed = () => ({...freshSourceContinuation({runId:'pursuit-entry'}),status:'active',chartId:4,x:C.wrongReturn.threshold.x+.19,z:C.wrongReturn.threshold.z,feet:8.4,yaw:-Math.PI/2,doorOpen:{[C.wrongReturn.threshold.doorId]:true}});
const next=(state,input={})=>stepSourceContinuation(state,{dt:1/60,...input});
function entry(){let state=seed();for(let n=0;n<16&&state.phase!=='catch';n++)state=next(state,{forward:1}).state;assert.equal(state.phase,'catch');assert.equal(state.chartId,0);return state;}
function atLip(level=0){return{...entry(),level,...CONTINUATION_DROP_LIPS[level],feet:continuationCatchFloor(level),recoveryAnchor:{...continuationRefugeAt({phase:'catch',level}),phase:'catch',yaw:0,pitch:0,kind:'refuge',supportId:`catch-${level}-return-pad`,earnedAt:0}};}

test('the threshold restores no camera hold and exploration cannot awaken the drum before a chosen descent',()=>{
 let state=entry();assert.equal(state.reveal,null);assert.equal(state.counterweight.active,false);
 for(const gate of [{paused:true},{renderReady:false}])assert.deepEqual(next(state,{...gate,dt:.25,forward:1,interact:true}).state,state);
 for(let i=0;i<60*120;i++)state=next(state).state;
 assert.equal(state.counterweight.active,false);assert.equal(state.recovery,null);
 const turned=next(state,{look:{yaw:.6,pitch:-.5}}).state;assert.equal(turned.pitch,-.5);assert.ok(Math.abs(turned.yaw-.6)<1e-8);
});

test('a first voluntary descent wakes one visible physical source with a full warning and no reset on reload',()=>{
 let r=next(atLip(),{dt:0,interact:true}),state=r.state;
 assert.equal(r.events.filter(e=>e.type==='counterweight-warning').length,1);assert.equal(r.events[0].reason,'first-voluntary-descent');
 assert.deepEqual(r.events[0].position,{x:C.catch.hoist.start.x,y:C.catch.top,z:C.catch.hoist.start.z});
 assert.equal(state.counterweight.mode,'warning');assert.equal(state.counterweight.elapsed,0);
 for(let i=0;i<Math.floor(C.catch.counterweightWarningSeconds*60)-1;i++){r=next(state);state=r.state;assert.equal(r.events.some(e=>e.type==='counterweight-warning'),false);assert.equal(state.counterweight.mode,'warning');}
 const saved=JSON.parse(JSON.stringify(state));r=next(saved);assert.deepEqual(r.state.counterweight,next(state).state.counterweight);assert.equal(r.events.some(e=>e.type==='counterweight-warning'),false);
 // Entry can leave half a fixed tick in the accumulator. It must not shorten
 // the warning, and replay must cross its boundary on the same accepted tick.
 for(let n=0;n<2&&r.state.counterweight.mode==='warning';n++)r=next(r.state);
 assert.equal(r.state.counterweight.mode,'walking');
});

test('waiting after commitment observes physical return circuits while the entry bridge and refuges remain safe',()=>{
 let state=next(atLip(),{interact:true}).state;
 Object.assign(state,{...continuationRefugeAt({phase:'catch',level:0}),fall:null});const start={x:state.x,z:state.z,feet:state.feet},modes=new Set();
 for(let i=0;i<300*30;i++){const old=state.counterweight;state=next(state,{dt:1/30}).state;modes.add(state.counterweight.mode);assert.equal(state.recovery,null);assert.deepEqual({x:state.x,z:state.z,feet:state.feet},start);assert.ok(Math.hypot(state.counterweight.x-old.x,state.counterweight.y-old.y,state.counterweight.z-old.z)<.41);}
 assert.ok(state.counterweight.cycle>=2);for(const mode of ['warning','walking','falling','returning','rewinding','hoisting','traversing','lowering-warning','lowering'])assert.ok(modes.has(mode),mode);
 for(let level=0;level<C.catch.levels;level++){const refuge={...state,level,...continuationRefugeAt({phase:'catch',level})},p=sourceContinuationThreatTelemetry(refuge,{horizonSeconds:180});assert.equal(p.refuge,true);assert.equal(p.timeToContact,null);}
});

test('contact prediction uses the actual continuing route and contact remains finite physical recovery',()=>{
 let state=atLip();state.counterweight.active=true;const before=JSON.stringify(state),p=sourceContinuationThreatTelemetry(state,{horizonSeconds:90});assert.equal(JSON.stringify(state),before);assert.ok(p.timeToContact>6&&p.timeToContact<90);
 const start=state.elapsed;while(!state.recovery&&state.elapsed-start<90)state=next(state).state;
 assert.ok(state.recovery);assert.equal(state.recovery.reason,'counterweight');assert.equal(state.recovery.repaired,false);assert.ok(Math.abs(state.elapsed-start-p.timeToContact)<.05);
 for(let frame=0;frame<2400&&state.recovery;frame++)state=next(state).state;
 assert.equal(state.recovery,null,'the physical recovery completes in the bounded fixture');
 assert.ok(state.grace>2.9);const at=continuationRefugeAt(state);assert.equal(state.x,at.x);assert.equal(state.z,at.z);assert.equal(sourceContinuationThreatTelemetry(state).timeToContact,null);
});

test('entering Catch retains first-person look while clearing held motion, and deliberate drops clear old motion',async()=>{
 const trace=[],scene=createSourceContinuationScene({checkpoint:seed(),renderer:{initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}},onTrace:t=>trace.push(t)});
 await scene.initialize();scene.key({key:'w'});scene.update(.2);const crossed=scene.serialize();assert.equal(crossed.phase,'catch');assert.equal(crossed.reveal,null);scene.update(.1);assert.equal(scene.serialize().x,crossed.x);assert.equal(scene.serialize().z,crossed.z);assert.equal(scene.lookBy(.2,-.1),true);const turned=scene.serialize();scene.keyup({key:'w'});scene.key({key:'a'});scene.update(.1);const walked=scene.serialize();assert.ok((walked.x-turned.x)*Math.cos(turned.yaw)+(walked.z-turned.z)*Math.sin(turned.yaw)<-.2,'a fresh left input strafes relative to the physical view');scene.exit();
 const dropping=createSourceContinuationScene({checkpoint:atLip(),renderer:{initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}},onTrace:t=>trace.push(t)});
 await dropping.initialize();dropping.key({key:'w'});dropping.key({key:'e'});dropping.key({key:'d'});
 for(let i=0;i<600&&dropping.serialize().fall;i++)dropping.update(1/60);
 const landed=dropping.serialize();assert.equal(landed.level,1);dropping.key({key:'w',repeat:true});dropping.update(.1);assert.equal(dropping.serialize().x,landed.x);assert.equal(dropping.serialize().z,landed.z);
 dropping.keyup({key:'w'});dropping.key({key:'w'});dropping.update(.1);assert.ok(Math.hypot(dropping.serialize().x-landed.x,dropping.serialize().z-landed.z)>.1);dropping.exit();
});

test('a frame spanning a supported landing discards remaining old movement time',()=>{
 let state=next(atLip(),{dt:0,interact:true}).state;
 for(let i=0;i<600;i++){const neutral=next(state,{dt:.25});if(neutral.events.some(e=>e.type==='land')){const held=next(state,{dt:.25,side:1,forward:1});assert.deepEqual(held.state,neutral.state);assert.equal(held.state.accumulator,0);return;}state=next(state).state;}
 assert.fail('the authored lower sector must receive the physical body');
});
