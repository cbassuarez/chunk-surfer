import test from 'node:test';
import assert from 'node:assert/strict';
import { freshLedger, freshRunRecord, freshMeta, normalizeLedger } from '../src/progression/schema.js';
import { EVENT_TYPES } from '../src/progression/events.js';
import { reduceRunLedger } from '../src/progression/run-ledger.js';
import { buildRunSummary } from '../src/progression/report.js';
import { evaluateAchievements } from '../src/progression/achievements.js';
globalThis.document ||= {title:'Chunk Surfer',baseURI:'http://localhost/'};
globalThis.window ||= globalThis;
const radio=await import('../src/game/radio.js');
const ready={isTraversal:true,sceneId:'explore',floorId:'ground',completedJobTakes:0};
const walk=seconds=>{for(let i=0;i<seconds*4;i++)radio.updateRadioProgression(.25,ready);};
const ring=seconds=>{for(let i=0;i<seconds*4;i++)radio.tickRadio(.25,{now:1000+i*250,random:()=>.5});};
test.beforeEach(()=>{radio.resetRadioState();radio.radioInit();});

test('carried calls ring, expire unheard, and offer one worried follow-up after active traversal',()=>{
  const missed=[],pulses=[];
  radio.radioInit({missed:cue=>missed.push(cue),squelch:pulse=>pulses.push(pulse)});
  radio.queueRadioCue(radio.RADIO_CUES.INITIAL);
  radio.armRadioCall(1000);ring(24);
  assert.ok(pulses.length>1&&pulses.every(p=>p.kind==='call'&&!p.dropped));
  assert.equal(radio.radioState().transmissions,0);
  assert.equal(radio.activeRadioCue(),null);assert.equal(radio.pendingRadioCue(),null);
  assert.equal(missed.length,1);assert.equal(radio.queueRadioCue(radio.RADIO_CUES.INITIAL),false);
  for(let i=0;i<400;i++)radio.updateRadioProgression(.25,{...ready,paused:true});
  assert.equal(radio.shouldQueueConcernCall(ready),false);
  walk(89.75);assert.equal(radio.shouldQueueConcernCall(ready),false);
  walk(.25);assert.equal(radio.shouldQueueConcernCall(ready),true);
  radio.queueRadioCue(radio.RADIO_CUES.CONCERN);radio.armRadioCall();ring(24);
  assert.deepEqual(missed.map(c=>c.id),[radio.RADIO_CUES.INITIAL,radio.RADIO_CUES.CONCERN]);
  walk(120);assert.equal(radio.shouldQueueConcernCall(ready),false);
  assert.equal(radio.radioMilestones()[radio.RADIO_CUES.CONCERN],false);
});

test('pause, unavailable controls and saved wall time cannot spend the answer window',()=>{
  radio.queueRadioCue(radio.RADIO_CUES.INITIAL);radio.armRadioCall(1000);ring(23);
  const saved=radio.saveRadioState(800000);
  assert.equal(saved.call.deadlineRemainingMs,1000);
  radio.loadRadioState(saved,900000);
  for(let i=0;i<100;i++)radio.tickRadio(.25,{now:999999,canAnswer:false});
  assert.equal(radio.saveRadioState().call.deadlineRemainingMs,1000);
  assert.equal(radio.radioCalling(),true);
  ring(.75);assert.equal(radio.radioCalling(),true);
  ring(.25);assert.equal(radio.radioCalling(),false);
  assert.equal(radio.pendingRadioCue(),null);
});

test('the worried call survives reload, but another answered call cancels its unoffered reminder',()=>{
  radio.queueRadioCue(radio.RADIO_CUES.INITIAL);radio.missPendingRadioCue();walk(45);
  const saved=radio.saveRadioState();radio.resetRadioState();radio.loadRadioState(saved);
  assert.equal(radio.radioState().concernRemainingMs,45000);
  radio.queueRadioCue(radio.RADIO_CUES.HUSH_RUPTURE);
  assert.ok(radio.consumeRadioCue(ready));
  assert.equal(radio.radioState().concernRemainingMs,null);
});

test('legacy deferred misses are retired on load instead of replaying after pickup',()=>{
  radio.loadRadioState({schema:4,dropped:{x:3,y:4},pendingCue:{id:radio.RADIO_CUES.INITIAL,deferredUntilPickup:true},missed:[radio.RADIO_CUES.INITIAL]});
  radio.pickUpRadio(3,4);
  assert.equal(radio.pendingRadioCue(),null);assert.equal(radio.consumeRadioCue(ready),null);
  assert.equal(radio.radioState().concernRemainingMs,radio.RADIO.concernDelayMs);
});

test('missing the initial check-in does not block later independent calls or claim that it was heard',()=>{
  radio.queueRadioCue(radio.RADIO_CUES.INITIAL);radio.missPendingRadioCue();walk(20);
  assert.equal(radio.radioMilestones()[radio.RADIO_CUES.INITIAL],false);
  assert.equal(radio.shouldQueuePostSecondTake({...ready,completedJobTakes:2}),true);
});

test('once a call rings, walking away from its trigger does not withdraw the answer window',()=>{
  radio.loadRadioState({schema:5,phase:'failing',milestones:{initial_checkin:true,post_second_take_warning:true},
    guidance:{traversal:{sinceWarningMs:20000,sinceInitialMs:20000}}});
  radio.queueRadioCue(radio.RADIO_CUES.PRE_THIRD,{roomId:'the_tub'});radio.armRadioCall();
  radio.updateRadioProgression(.25,{...ready,target:null,completedJobTakes:2});
  assert.equal(radio.pendingRadioCue()?.id,radio.RADIO_CUES.PRE_THIRD);
  assert.ok(radio.consumeRadioCue({...ready,target:null,completedJobTakes:2}));
});

function earned(type,payload={},ledger=freshLedger(),saveRadio={}) {
  const event={type,payload,seq:1};
  const run=freshRunRecord();run.ledger=reduceRunLedger(ledger,event);
  const summary=buildRunSummary({endingId:'sacrifice',save:{run,radio:saveRadio},meta:freshMeta()});
  return {ledger:run.ledger,summary,ids:evaluateAchievements({event,run,profile:freshMeta(),summary})};
}
test('only leaving the concern call unanswered earns Do Not Disturb',()=>{
  assert.ok(earned(EVENT_TYPES.RADIO_CUE_MISSED,{id:radio.RADIO_CUES.CONCERN}).ids.includes('ACH_DO_NOT_DISTURB'));
  for(const [type,id] of [[EVENT_TYPES.RADIO_CUE_MISSED,radio.RADIO_CUES.INITIAL],
    [EVENT_TYPES.RADIO_CUE_STARTED,radio.RADIO_CUES.CONCERN],[EVENT_TYPES.RADIO_CUE_RESOLVED,radio.RADIO_CUES.CONCERN]])
    assert.equal(earned(type,{id}).ids.includes('ACH_DO_NOT_DISTURB'),false);
});
test('Radio Silence requires a completed, fully tracked run; ringing and inspecting do not count as use',()=>{
  let ledger=freshLedger();
  for(const [type,payload] of [[EVENT_TYPES.RADIO_CUE_QUEUED,{id:radio.RADIO_CUES.INITIAL}],
    [EVENT_TYPES.RADIO_CUE_MISSED,{id:radio.RADIO_CUES.INITIAL}], [EVENT_TYPES.PROP_INSPECTED,{id:'radio'}]]) {
    const result=earned(type,payload,ledger);ledger=result.ledger;
    assert.equal(result.ids.includes('ACH_RADIO_SILENCE'),false);
  }
  ledger=normalizeLedger(JSON.parse(JSON.stringify(ledger)));
  assert.ok(earned(EVENT_TYPES.RUN_FINISHED,{},ledger).ids.includes('ACH_RADIO_SILENCE'));
  assert.equal(earned(EVENT_TYPES.RUN_FINISHED,{},normalizeLedger({})).ids.includes('ACH_RADIO_SILENCE'),false);
});
test('answering, outgoing calls, deployment and combat invalidate Radio Silence across save/load',()=>{
  for(const [type,payload] of [[EVENT_TYPES.RADIO_CUE_STARTED,{id:radio.RADIO_CUES.INITIAL}],
    [EVENT_TYPES.RADIO_USED,{id:'radio',kind:'outgoing'}], [EVENT_TYPES.RADIO_USED,{id:'radio',kind:'combat'}],
    [EVENT_TYPES.EQUIPMENT_DROPPED,{id:'radio'}]]) {
    const ledger=normalizeLedger(JSON.parse(JSON.stringify(earned(type,payload).ledger)));
    assert.equal(earned(EVENT_TYPES.RUN_FINISHED,{},ledger).ids.includes('ACH_RADIO_SILENCE'),false);
  }
  assert.equal(earned(EVENT_TYPES.RUN_FINISHED,{},freshLedger(),{transmissions:1}).ids.includes('ACH_RADIO_SILENCE'),false);
  const ledger=freshLedger();ledger.battles.results.test={toolsUsed:{radio:1}};
  assert.equal(earned(EVENT_TYPES.RUN_FINISHED,{},ledger).ids.includes('ACH_RADIO_SILENCE'),false);
});
