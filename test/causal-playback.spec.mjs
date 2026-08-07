import assert from 'node:assert/strict';
import { CAUSAL_SPINE_IDS, sealCausalTape } from '../src/causal/tape.js';
import {
  borrowView,
  canCrossAcousticSeam,
  consoleAdvanceAllowance,
  consoleAdvanceStep,
  enactCausalAnchor,
  hushPlaybackReport,
  makeHushPlayback,
  nextCausalAnchor,
  nextTimelineAnchor,
  permittedSpoolRate,
  synchronizationResult,
  tickHushPlayback,
  useOptionalPower,
} from '../src/causal/playback.js';

const spineAnchors=(start)=>CAUSAL_SPINE_IDS.map((id,index)=>({
  id,at:start+index*100,order:100+index,verb:id.endsWith('contact')?'contact':'haunt',required:true,
  locus:{x:100+index,y:100+index,spaceId:id==='spine:source-threshold'?'source-space':'conservatory'},
}));

const tape=sealCausalTape({
  runId:'run_b',returnSummaryId:'return:run_b',endingId:'inversion',durationMs:40000,
  qualification:{injuries:0,difficulty:'dead-air',completedAt:1},
  shadowFrames:[{t:0,x:0,y:0,yaw:0,pitch:0},{t:40000,x:4,y:0,yaw:0,pitch:0}],
  events:[{id:'building',at:5000,order:0,type:'door.open',actor:'building',payload:{doorId:'d',state:'open'}}],
  anchors:[
    {id:'taunt',at:10000,verb:'taunt',locus:{x:2,y:2,radius:2},payload:{cueId:'x'}},
    {id:'contact',at:20000,verb:'contact',locus:{x:4,y:4,radius:2},payload:{contactType:'brush'},weight:2},
    ...spineAnchors(30000),
  ],
});
const state=makeHushPlayback(tape);
let tick=tickHushPlayback(state,5000);
assert.deepEqual(tick.events.map((event)=>event.id),['building'],'non-HUSH events advance independently');
assert.equal(enactCausalAnchor(state,'haunt',{x:2,y:2}).reason,'NO_ARMED_ANCHOR','wrong actions do not arm an anchor');
assert.equal(enactCausalAnchor(state,'taunt',{x:9,y:9}).reason,'WRONG_LOCUS','a matching verb outside its locus remains actionable feedback');
tickHushPlayback(state,1000);
assert.equal(enactCausalAnchor(state,'taunt',{x:2,y:2}).ok,true);
tick=tickHushPlayback(state,14000);
assert.deepEqual(tick.corrections.map((anchor)=>anchor.id),['contact'],'missed contact corrects at canonical time');
assert.equal(hushPlaybackReport(state).label,'CORRECTED');

const optionalState=makeHushPlayback(tape);
const eventSnapshot=JSON.stringify(optionalState.tape.events);
assert.equal(useOptionalPower(optionalState,'taunt',{perceived:false,mutatesRecordedState:false}).ok,true);
assert.equal(optionalState.density,90);
assert.equal(optionalState.ornaments,1);
assert.equal(JSON.stringify(optionalState.tape.events),eventSnapshot,'ornaments cannot mutate recorded state');
assert.equal(useOptionalPower(optionalState,'manifest',{perceived:true}).reason,'PERCEIVED');
optionalState.timeMs=12500;
assert.equal(canCrossAcousticSeam(optionalState).reason,'ANCHOR_PRE_ROLL');

assert.equal(permittedSpoolRate(30001),4);
assert.equal(permittedSpoolRate(30000),2);
assert.equal(permittedSpoolRate(12001),2);
assert.equal(permittedSpoolRate(12000),1);
assert.equal(consoleAdvanceAllowance(30000),22000,'a thirty-second-away anchor permits exactly twenty-two console seconds');
assert.deepEqual(consoleAdvanceStep(30000,21999),{elapsedMs:21999,eject:false});
assert.deepEqual(consoleAdvanceStep(30000,30000),{elapsedMs:22000,eject:true},'the terminal seeks only to the fixed eight-second pre-roll');
const spoolTape=sealCausalTape({runId:'spool',returnSummaryId:'return:spool',endingId:'inversion',durationMs:50000,qualification:{injuries:0,difficulty:'contract',completedAt:1},shadowFrames:[{t:0,x:0,y:0},{t:50000,x:0,y:0}],events:[],anchors:[{id:'far',at:40000,verb:'haunt',locus:{x:0,y:0}},...spineAnchors(49000)]});
const spoolState=makeHushPlayback(spoolTape);
tickHushPlayback(spoolState,12000,{requestedSpool:4});
assert.equal(spoolState.timeMs,28500,'spooling crosses the thirty-second threshold at two-times and the twelve-second pre-roll at one-times');

const borrowState=makeHushPlayback(tape,{now:13000});
assert.ok(borrowView(borrowState),'Borrow is available only inside the eight-second pre-roll');
tickHushPlayback(borrowState,3000,{borrowing:true,requestedSpool:4});
assert.equal(borrowState.timeMs,16000,'Borrow holds tape time at one-times speed');
assert.equal(borrowView(borrowState),null,'Borrow ends after three seconds');

const armedTimingState=makeHushPlayback(tape,{now:6000});
assert.equal(enactCausalAnchor(armedTimingState,'taunt',{x:2,y:2}).ok,true);
assert.equal(nextCausalAnchor(armedTimingState)?.id,'contact','the action queue advances after an anchor is armed');
assert.equal(nextTimelineAnchor(armedTimingState)?.id,'taunt','the recorded event remains the next transport boundary');
tickHushPlayback(armedTimingState,1000,{requestedSpool:4});
assert.equal(armedTimingState.timeMs,7000,'an armed anchor still holds the transport at one-times inside pre-roll');

assert.equal(synchronizationResult([{id:'a',weight:1},{id:'b',weight:1}],new Set(['a'])).label,'DRIFT');
assert.equal(synchronizationResult([{id:'a',weight:2}],new Set(['a'])).label,'UNISON');

console.log('causal playback contracts passed');
