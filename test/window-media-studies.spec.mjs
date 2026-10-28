import test from 'node:test';
import assert from 'node:assert/strict';
import {compilePaneScore,paneScoreStateAt,createWindowVideoClock,validateWindowCompositionPlan} from '../src/platform/window-composition.js';
import {quorumCompositionPlan,retainedTakeCompositionPlan,roomBetweenCompositionPlan,weightPassesCompositionPlan,
  STUDY_EVENTS,QUORUM_TIMES,ROOM_BETWEEN_TIMES,WEIGHT_PASSES_TIMES} from '../src/platform/window-media-studies.js';

// A shipped existing clip keeps these tests independent of ingestion of the
// newly cleared performance. We test the relationship, not that new filename.
const assetId='bellringers-datamosh',epochMs=1000;
const state=(plan,pane,atMs=0,events=[])=>paneScoreStateAt(compilePaneScore(plan,pane),{nowMs:epochMs+atMs,events});
const phase=(plan,pane,atMs)=>state(plan,pane,atMs).assignment.phaseOffsetMs;
const token=(plan,pane,atMs)=>state(plan,pane,atMs).assignment.content.token;
const roomOptions={snapshotTokens:['snapshot-left','snapshot-middle','snapshot-right'],contradictionToken:'snapshot-wrong-middle',epochMs};
const weightPhases=[
  ['snapshot-top-held','snapshot-support-empty','snapshot-receiver-empty'],
  ['snapshot-top-leaving','snapshot-support-empty','snapshot-receiver-empty'],
  ['snapshot-top-empty','snapshot-support-crossing','snapshot-receiver-empty'],
  ['snapshot-top-empty','snapshot-support-empty','snapshot-receiver-empty'],
  ['snapshot-top-empty','snapshot-support-empty','snapshot-receiver-empty'],
];

test('Quorum develops three shared phases without erasing the independent fourth',()=>{
  const plan=quorumCompositionPlan({assetId,epochMs});
  const ids=plan.surfaces.map(p=>p.id);
  assert.equal(new Set(ids.map(id=>phase(plan,id,0))).size,4);
  assert.notEqual(phase(plan,'quorum:b',QUORUM_TIMES.second-1),phase(plan,'quorum:a',QUORUM_TIMES.second-1));
  assert.equal(phase(plan,'quorum:b',QUORUM_TIMES.second),phase(plan,'quorum:a',QUORUM_TIMES.second));
  assert.notEqual(phase(plan,'quorum:c',QUORUM_TIMES.third-1),phase(plan,'quorum:a',QUORUM_TIMES.third-1));
  const leader=phase(plan,'quorum:a',QUORUM_TIMES.third);
  assert.deepEqual(ids.slice(0,3).map(id=>phase(plan,id,QUORUM_TIMES.third)),[leader,leader,leader]);
  assert.notEqual(phase(plan,'quorum:d',QUORUM_TIMES.third),leader);
  assert.equal(phase(plan,'quorum:d',QUORUM_TIMES.duration),phase(plan,'quorum:d',0));
  assert.ok(plan.surfaces.every(p=>p.content.assetId===assetId),'all parts use the same documented performance');
});

test('Quorum uses durable assignment phases rather than transient native seeks or initial-pane relays',()=>{
  const plan=quorumCompositionPlan({assetId,epochMs});
  assert.deepEqual(plan.score.cues.flatMap(c=>c.operations.map(o=>o.type)),['assign','assign']);
  for(const atMs of [8100,12000,17999])assert.equal(phase(plan,'quorum:b',atMs),phase(plan,'quorum:c',atMs));
});

test('Quorum keeps an independently filmed response outside the majority source and phase',()=>{
  const independentAssetId='pollination';
  const plan=quorumCompositionPlan({assetId,independentAssetId,epochMs});
  for(const atMs of [0,4999,5000,7999,8000,17000]){
    const independent=state(plan,'quorum:d',atMs).assignment;
    assert.equal(independent.content.assetId,independentAssetId);
    assert.equal(independent.phaseOffsetMs,phase(plan,'quorum:d',0));
    assert.notEqual(independent.phaseOffsetMs,phase(plan,'quorum:a',atMs));
    assert.equal(independent.clockMode,'source');
  }
  for(const pane of ['quorum:a','quorum:b','quorum:c'])assert.equal(state(plan,pane,9000).assignment.content.assetId,assetId);
});

test('all study videos retain source-time playback across initial and convergence assignments',()=>{
  for(const plan of [quorumCompositionPlan({assetId,epochMs}),retainedTakeCompositionPlan({assetId,epochMs})]){
    for(const pane of plan.surfaces){
      const score=compilePaneScore(plan,pane.id);
      for(const value of [score.initial,...score.cues.map(c=>c.action.assignment).filter(Boolean)]){
        if(value.content.kind==='video')assert.equal(value.clockMode,'source','a finite presentation score must not slow a filmed gesture');
      }
    }
  }
});

test('Retained Take remains in agreement until a real release, then only the reference continues',()=>{
  const plan=retainedTakeCompositionPlan({assetId,epochMs});
  assert.equal(plan.score.cues.filter(c=>Object.hasOwn(c,'atMs')).length,0,'waiting alone cannot fake a release');
  for(const id of ['retained:source','retained:reference','retained:apparatus'])assert.equal(state(plan,id,60000).frozen,false);
  const events=[STUDY_EVENTS.RETAINED_RELEASE];
  assert.equal(state(plan,'retained:source',10000,events).frozen,true);
  assert.equal(state(plan,'retained:apparatus',10000,events).frozen,true);
  assert.equal(state(plan,'retained:reference',10000,events).frozen,false);
  assert.equal(state(plan,'retained:reference',10000,events).assignment.content.assetId,assetId);
  for(const event of ['pause','hidden','live-stop'])assert.equal(state(plan,'retained:source',10000,[event]).frozen,false,'application holds are not authored release');
});

test('Retained Take yields an apparatus seat without replacing the reference or main-input authority',()=>{
  const plan=retainedTakeCompositionPlan({assetId,epochMs,apparatusToken:'snapshot-apparatus'});
  const events=[STUDY_EVENTS.RETAINED_RELEASE,STUDY_EVENTS.RETAINED_OCCUPY];
  const reference=state(plan,'retained:reference',10000,events);
  assert.equal(state(plan,'retained:apparatus',10000,events).visible,false);
  assert.equal(reference.visible,true);assert.equal(reference.frozen,false);
  assert.equal(reference.geometry.anchorX,plan.surfaces.find(p=>p.id==='retained:apparatus').initial.x);
  assert.equal(reference.assignment.content.assetId,assetId);
});

test('reduced Retained reveals a later fixed reference pose while its source remains stopped',()=>{
  const plan=retainedTakeCompositionPlan({assetId,epochMs,reducedMotion:true});
  const release=[STUDY_EVENTS.RETAINED_RELEASE],occupy=[...release,STUDY_EVENTS.RETAINED_OCCUPY];
  const before=state(plan,'retained:reference',5000,release),after=state(plan,'retained:reference',8500,occupy);
  assert.equal(before.assignment.phaseOffsetMs,0);assert.equal(after.assignment.phaseOffsetMs,3500);
  assert.equal(after.assignment.content.assetId,before.assignment.content.assetId);
  assert.deepEqual(after.assignment.crop,before.assignment.crop);assert.equal(after.assignment.clockMode,'source');
  assert.equal(after.geometry,null,'a changed still does not require window motion');
  assert.equal(state(plan,'retained:apparatus',8500,occupy).visible,false);
  const source=state(plan,'retained:source',8500,occupy);
  assert.equal(source.frozen,true);assert.equal(source.assignment.phaseOffsetMs,0);
  const score=compilePaneScore(plan,'retained:reference');
  const clock=createWindowVideoClock({score,assignment:before.assignment,nowMs:epochMs,reducedMotion:true});
  assert.equal(clock.time(5000,{durationSeconds:12}),0);
  clock.assign(after.assignment,8500);
  for(const now of [8500,12000,60000])assert.equal(clock.time(now,{durationSeconds:12}),3.5,'the later reference pose remains paused');
  clock.hold(true,9000);clock.hold(false,20000);assert.equal(clock.time(25000,{durationSeconds:12}),3.5);
  const cue=plan.score.cues.find(c=>c.event===STUDY_EVENTS.RETAINED_OCCUPY);
  assert.ok(cue.operations.every(op=>op.type!=='resume'&&op.type!=='geometry'));
  assert.equal(cue.operations.find(op=>op.type==='assign').transition,'cut');
  assert.equal(cue.operations.find(op=>op.type==='assign').durationMs,0);
  const full=retainedTakeCompositionPlan({assetId,epochMs});
  assert.equal(state(full,'retained:reference',8500,occupy).assignment.phaseOffsetMs,0,'ordinary continuing footage keeps its real source clock');
});

test('Room Between preserves its outer evidence while only the middle contradicts the adjacency',()=>{
  const plan=roomBetweenCompositionPlan(roomOptions),t=ROOM_BETWEEN_TIMES.contradiction;
  assert.equal(token(plan,'room:middle',t-1),'snapshot-middle');
  assert.equal(token(plan,'room:middle',t),'snapshot-wrong-middle');
  for(const atMs of [t,11000,16000]){
    assert.equal(token(plan,'room:left',atMs),'snapshot-left');assert.equal(token(plan,'room:right',atMs),'snapshot-right');
  }
  assert.equal(state(plan,'room:left',ROOM_BETWEEN_TIMES.retireSides-1).visible,true);
  assert.equal(state(plan,'room:left',ROOM_BETWEEN_TIMES.retireSides).visible,false);
  assert.equal(state(plan,'room:right',ROOM_BETWEEN_TIMES.retireSides).visible,false);
  assert.equal(state(plan,'room:middle',ROOM_BETWEEN_TIMES.retireSides).visible,true);
});

test('Weight Passes transfers one owned object through support while the empty receiver persists',()=>{
  const plan=weightPassesCompositionPlan({phaseTokens:weightPhases,epochMs});
  assert.equal(token(plan,'weight:above',3999),'snapshot-top-held');
  assert.equal(token(plan,'weight:above',4000),'snapshot-top-leaving');
  assert.equal(token(plan,'weight:support',5499),'snapshot-support-empty');
  assert.equal(token(plan,'weight:support',5500),'snapshot-support-crossing');
  assert.equal(token(plan,'weight:support',7300),'snapshot-support-empty');
  for(const atMs of [0,...WEIGHT_PASSES_TIMES,15999,16000,30000])assert.equal(token(plan,'weight:below',atMs),'snapshot-receiver-empty');
  assert.ok(plan.surfaces.every(p=>p.shader==='terminal'),'owned final render is not dithered a second time');
});

test('all four reduced plans preserve causal decisions without compulsory spatial movement or a puzzle gate',()=>{
  const factories=[
   ()=>quorumCompositionPlan({assetId,epochMs,reducedMotion:true}),
   ()=>retainedTakeCompositionPlan({assetId,epochMs,reducedMotion:true}),
   ()=>roomBetweenCompositionPlan({...roomOptions,reducedMotion:true}),
   ()=>weightPassesCompositionPlan({phaseTokens:weightPhases,epochMs,reducedMotion:true}),
  ];
  for(const create of factories){
    const plan=create();assert.equal(validateWindowCompositionPlan(plan).ok,true);
    assert.equal(plan.completion.mode,'nonblocking');assert.equal(plan.constraints.length,0);
    assert.ok(plan.surfaces.every(p=>p.draggable===false));
    assert.equal(plan.score.loop,false);assert.equal(plan.formation.durationMs,0);
    for(const cue of plan.score.cues)for(const op of cue.operations){assert.notEqual(op.type,'geometry');assert.equal(op.durationMs,0);assert.equal(op.transition,'cut');}
  }
  const quorum=factories[0]();assert.equal(phase(quorum,'quorum:b',9000),phase(quorum,'quorum:a',9000));assert.notEqual(phase(quorum,'quorum:d',9000),phase(quorum,'quorum:a',9000));
  const retained=factories[1]();assert.equal(state(retained,'retained:reference',10000,[STUDY_EVENTS.RETAINED_RELEASE]).frozen,false);
  assert.equal(token(factories[2](),'room:middle',6000),'snapshot-wrong-middle');
  assert.equal(token(factories[3](),'weight:below',12000),'snapshot-receiver-empty');
});

test('missing or contradictory capture packages fail closed instead of presenting an unrelated collage',()=>{
  assert.throws(()=>roomBetweenCompositionPlan({...roomOptions,contradictionToken:'snapshot-middle'}),/must differ/);
  assert.throws(()=>roomBetweenCompositionPlan({...roomOptions,snapshotTokens:roomOptions.snapshotTokens.slice(0,2)}),/requires 3/);
  assert.throws(()=>weightPassesCompositionPlan({phaseTokens:weightPhases.slice(0,4)}),/five/);
  const wrongReceiver=weightPhases.map(row=>[...row]);wrongReceiver[2][2]='snapshot-arrival';
  assert.throws(()=>weightPassesCompositionPlan({phaseTokens:wrongReceiver}),/empty receiving/);
  assert.throws(()=>quorumCompositionPlan({assetId,phaseOffsetsMs:[0,0,1000,2000]}),/distinct/);
});
