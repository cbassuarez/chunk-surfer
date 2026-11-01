import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/game/night-deadline.js';
import {freshSave,withTransientGameState,getSave,getMeta,saveCommit,metaCommit,saveLoad} from '../src/game/save.js';
import {freshRunRecord,freshMeta,normalizeRun,normalizeMeta} from '../src/progression/schema.js';
import {commitNightFailure,commitReturn,reconcileNightFailureReturn,consumeReturnReport} from '../src/progression/runtime.js';
import {archiveNightRecordings,retainedNightMediaKeys} from '../src/game/night-failure-archive.js';
import {returnFileEntries} from '../src/game/second-shift.js';
import {makeReturnReportScene,returnAccountLines} from '../src/game/return-report.js';
import {returnExposureIdentity} from '../src/render/outcome-return-view.js';
import {pendingNightArchivePatch} from '../src/game/night-failure-archive.js';
import * as scenes from '../src/game/scenes.js';

const input={runId:'deadline-test',runActive:true,workOrderAccepted:true,active:true,elapsedSeconds:0,foregroundSeconds:0,
  region:'source',entryPose:{x:2,z:3,feet:8.4,yaw:.3},safeBoundary:true,assetsReady:true};
const step=(value,extra={})=>D.stepNightDeadline(value,{...input,...extra});
function terminal(runId='deadline-test'){
  let state=step(D.freshNightDeadline({runId}),{runId,elapsedSeconds:30120}).state;
  state=step(state,{runId,elapsedSeconds:30120,claimPresentation:true}).state;
  return D.completeNightDeadline(state,{outcome:'survived',sceneCheckpoint:{schema:1,phase:'complete',activeSeconds:45}});
}

test('a full fresh night has exactly502fictional minutes, three warnings, then a separately persisted pending boundary',()=>{
  let state=D.freshNightDeadline({runId:input.runId}),warnings=[];
  for(let elapsed=0;elapsed<=30120;elapsed++){
    const result=step(state,{elapsedSeconds:elapsed,foregroundSeconds:elapsed?1:0});state=result.state;
    warnings.push(...result.events.filter(e=>e.type==='warning'));
    if(elapsed<30120)assert.equal(D.nightDeadlinePending(state),false);
  }
  assert.deepEqual(warnings.map(w=>[w.clock,w.elapsedSeconds]),[['05:00',26520],['05:30',28320],['05:50',29520]]);
  assert.equal(state.phase,'pending');assert.equal(state.crossedAtElapsed,30120);assert.deepEqual(state.entryPose,input.entryPose);
  assert.equal(D.nightDeadlineAllowsTransport(state),false);assert.equal(state.consequenceReceipt,null);
});

test('eligibility is accepted work in an active run; no failure accrues from hidden or paused time',()=>{
  for(const hold of [{runActive:false},{workOrderAccepted:false},{active:false}]){
    const result=step(D.freshNightDeadline({runId:input.runId}),{elapsedSeconds:40000,foregroundSeconds:40000,...hold});
    assert.equal(result.state.enrolled,false);assert.equal(result.state.phase,'unarmed');assert.equal(result.events.length,0);
  }
});

test('crossing during a protected take saves pending immediately, preserves the take, then waits for safe rendered presentation',()=>{
  const protectedResult=step(D.freshNightDeadline({runId:input.runId}),{elapsedSeconds:30120,protectedTransport:true,claimPresentation:true});
  assert.equal(protectedResult.state.phase,'pending');assert.equal(protectedResult.presentationReady,false);assert.equal(protectedResult.deliverableEffects.length,0);
  const saved=JSON.parse(JSON.stringify(protectedResult.state));
  for(const hold of [{protectedTransport:true},{active:false},{assetsReady:false},{safeBoundary:false},{competingOwner:true}])
    assert.equal(step(saved,{elapsedSeconds:40000,claimPresentation:true,...hold}).state.phase,'pending');
  const claimed=step(saved,{elapsedSeconds:40000,claimPresentation:true,sceneCheckpoint:{phase:'recognize',activeSeconds:0}});
  assert.equal(claimed.state.phase,'presenting');assert.equal(claimed.state.crossedAtElapsed,30120);
  assert.equal(claimed.state.consequenceReceipt,null);assert.equal(claimed.denyNewTransports,true);
});

test('warning delivery receipts survive reload; undelivered cues retry without duplicating an acknowledged cue',()=>{
  let result=step(D.freshNightDeadline({runId:input.runId}),{elapsedSeconds:26520});
  assert.equal(result.deliverableEffects.length,1);const id=result.deliverableEffects[0].id;
  let state=JSON.parse(JSON.stringify(result.state));assert.equal(step(state,{elapsedSeconds:26521}).deliverableEffects[0].id,id);
  state=D.acknowledgeNightDeadlineEffects(state,[id,id]);result=step(state,{elapsedSeconds:26522});
  assert.equal(result.deliverableEffects.length,0);assert.equal(result.state.warnings.length,1);
});

test('pre-feature estimated saves enroll explicitly with10foreground minutes and a5minute followup without rewinding the clock',()=>{
  let state=D.normalizeNightDeadline(null,{runId:input.runId,legacy:true});
  let result=step(state,{elapsedSeconds:50000});state=result.state;
  assert.equal(state.graceRemainingSeconds,600);assert.equal(state.phase,'warning');assert.equal(result.events[0].key,'legacy-enrollment');
  assert.equal(result.events.length,1,'past05:00/05:30/05:50cues are not replayed on load');
  state=step(state,{elapsedSeconds:50000,foregroundSeconds:300,active:false}).state;assert.equal(state.graceRemainingSeconds,600);
  result=step(state,{elapsedSeconds:50900,foregroundSeconds:300});state=result.state;
  assert.equal(state.graceRemainingSeconds,300);assert.equal(result.events[0].key,'legacy-five-minutes');
  state=step(JSON.parse(JSON.stringify(state)),{elapsedSeconds:51797,foregroundSeconds:299}).state;assert.equal(state.phase,'warning');
  state=step(state,{elapsedSeconds:51800,foregroundSeconds:1}).state;assert.equal(state.phase,'pending');assert.equal(state.observedAtElapsed,51800);
});

test('legacy enrollment earlier in the night still delivers future normal05:00warnings',()=>{
  let state=step(D.freshNightDeadline({runId:input.runId,legacy:true}),{elapsedSeconds:100}).state;
  const result=step(state,{elapsedSeconds:26520,foregroundSeconds:600});
  assert.equal(result.state.phase,'warning');assert.equal(result.events.some(e=>e.clock==='05:00'),true);
});

test('a committed finale/SourceIV retains authority; a late competing action cannot reclaim an expired night',()=>{
  let state=step(D.freshNightDeadline({runId:input.runId}),{elapsedSeconds:30000,committedFinale:true}).state;
  assert.equal(step(state,{elapsedSeconds:40000}).state.phase,'superseded');
  state=step(D.freshNightDeadline({runId:input.runId}),{elapsedSeconds:30120}).state;
  assert.equal(step(state,{elapsedSeconds:30121,committedFinale:true}).state.phase,'pending');
});

test('physical scene checkpoints and terminal receipts are resumable, idempotent and add no injury or gear loss',()=>{
  let state=step(step(D.freshNightDeadline({runId:input.runId}),{elapsedSeconds:30120}).state,{elapsedSeconds:30120,claimPresentation:true}).state;
  state=D.checkpointNightDeadline(state,{phase:'clear',activeSeconds:17.3,body:{x:5,z:9},branch:'left'},{deliveredEffectIds:['joint:1']});
  const reloaded=D.normalizeNightDeadline(JSON.parse(JSON.stringify(state)),{runId:input.runId});
  assert.equal(reloaded.sceneCheckpoint.activeSeconds,17.3);assert.deepEqual(reloaded.deliveredEffectIds,['joint:1']);
  const done=D.completeNightDeadline(reloaded,{outcome:'entombed'});assert.equal(done.phase,'terminal');
  assert.equal(done.consequenceReceipt.addedInjury,0);assert.deepEqual(done.consequenceReceipt.equipmentLost,[]);
  assert.deepEqual(D.completeNightDeadline(done,{outcome:'survived'}),done);
  assert.equal(D.completeNightDeadline(D.freshNightDeadline(),{outcome:'survived'}),null);
});

test('fresh and legacy SAVE normalization preserve separate enrollment and persist the same pending body/scene',async()=>{
  const run=freshRunRecord({id:input.runId,now:1000}),fresh=freshSave({run});
  assert.equal(fresh.nightDeadline.legacy,false);
  await withTransientGameState({save:{...fresh,nightDeadline:undefined}},()=>{assert.equal(getSave().nightDeadline.legacy,true);});
  await withTransientGameState({save:{...fresh,nightDeadline:terminal()}},()=>{
    assert.equal(getSave().nightDeadline.phase,'terminal');assert.equal(getSave().nightDeadline.sceneCheckpoint.activeSeconds,45);
  });
});

test('the oldest V1 migration does not inherit freshSave enrollment and silently lose legacy notice grace',()=>{
  const previous=globalThis.localStorage,values=new Map([['chunk-surfer:save:v1',JSON.stringify({version:1,flags:{prologueDone:true},steps:20,px:3,py:4})]]);
  globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  try{assert.equal(saveLoad().save.nightDeadline.legacy,true);}finally{globalThis.localStorage=previous;}
});

test('failed-night filing survives a SAVE/META interruption, awards no completion, retains actual tapes, and is idempotent',async()=>{
  const run=freshRunRecord({id:input.runId,preset:'dead-air',now:1000}),save=freshSave({run});
  save.nightDeadline=terminal();save.playDuration.seconds=1234;save.rec={injuries:2,takes:['main_b3'],tapes:[
    {id:'take:1',roomId:'main_b3',status:'accepted',durationSeconds:45,nightStamp:{schema:1,elapsedSeconds:210,priorUnmeasured:false},audible:[['retained-source',.2]],discrete:[{cueId:'b3.speaker.click',atSec:4}]},
    {id:'take:2',roomId:'the_tub',status:'spoiled',durationSeconds:12,damage:{cause:'prior'},audible:[]}
  ],tapeTransport:{version:2,headSeconds:57,endSeconds:57}};
  await withTransientGameState({save,meta:freshMeta()},()=>{
    const summary=commitNightFailure({rec:getSave().rec},2000);
    assert.equal(summary.classification,'failed-night');assert.equal(summary.failure.outcome,'survived');assert.equal(summary.durationSeconds,1234);
    assert.equal(summary.recordings.tapes.length,2);assert.deepEqual(summary.recordings.tapes,save.rec.tapes);
    assert.equal(getSave().run.status,'failed-night');assert.equal(getMeta().stats.runsCompleted,0);assert.deepEqual(getMeta().endingsSeen,[]);
    assert.deepEqual(getMeta().achievements,{});assert.equal(getMeta().challengeCompletions.deadAir,false);assert.equal(getSave().rec.injuries,2);
    const original=JSON.stringify(summary);assert.equal(JSON.stringify(commitNightFailure({},3000)),original);
    metaCommit({returns:{records:{},history:[]},presentation:{...getMeta().presentation,pendingReports:[]}});
    assert.equal(reconcileNightFailureReturn().id,summary.id);assert.equal(getMeta().returns.history.length,1);assert.equal(getMeta().stats.runsCompleted,0);
    assert.equal(returnFileEntries(getMeta())[0].document.classification,'FAILED NIGHT');
    consumeReturnReport(summary.id);assert.equal(getSave().run.status,'failed-night');assert.equal(getSave().run.pendingReturn,null);
    assert.equal(normalizeRun(getSave().run).status,'failed-night');
    assert.equal(normalizeMeta({...getMeta(),stats:{}}).stats.runsCompleted,0);
  });
});

test('ordinary success cannot steal a pending failure, and terminal filing cannot run before the scene finishes',async()=>{
  const save=freshSave({run:freshRunRecord({id:input.runId})});save.nightDeadline=step(save.nightDeadline,{elapsedSeconds:30120}).state;
  await withTransientGameState({save},()=>{
    assert.throws(()=>commitReturn('helped'),e=>e.code==='NIGHT_EXPIRED');
    assert.throws(()=>commitNightFailure(),e=>e.code==='DEADLINE_SCENE_UNFINISHED');
  });
});

test('archive media pins preserve exact external reference hashes and fail safely on uncertain metadata',()=>{
  const ref={schema:1,kind:'continuous-cabin',key:'exact-key',runId:'r',takeId:'take:1',captureId:'c',durable:true,sha256:'a'.repeat(64),durationSeconds:3,frames:144000,sampleRate:48000,channels:2};
  const archived=archiveNightRecordings({rec:{tapes:[{roomId:'field',continuous:ref,durationSeconds:3},{roomId:'interrupted',continuous:{key:'pending-key',pending:true}}]}});
  assert.equal(archived.mediaRefs[0].sha256,ref.sha256);assert.equal(archived.tapes[1].mediaUnavailable,true);
  assert.deepEqual(retainedNightMediaKeys({returns:{records:{one:{recordings:archived}}}}),['exact-key','pending-key']);
  assert.equal(retainedNightMediaKeys({returns:{records:{one:{recordings:{schema:99}}}}}),null);
  assert.equal(retainedNightMediaKeys({returns:{records:{one:{classification:'failed-night'}}}}),null);
});

test('failed-night screen is GAME OVER and bypasses earned-run filing; recordings action targets this exact retained ledger',async()=>{
  const save=freshSave({run:freshRunRecord({id:input.runId,now:1000})});save.nightDeadline=terminal();save.rec={tapes:[],injuries:0};
  await withTransientGameState({save,meta:freshMeta()},()=>{
    const summary=commitNightFailure({},2000),identity=returnExposureIdentity(summary,'saved');
    assert.equal(identity.title,'GAME OVER');assert.equal(identity.subtitle,'DEMOLITION 06:00');assert.doesNotMatch(identity.residue,/First Strike/);
    assert.equal(identity.save,'RECORDINGS SAVED');assert.match(identity.residue,/cleared/);
    assert.doesNotMatch(returnAccountLines(summary).map(r=>r.text).join('\n'),/ENDING HINTS|ACHIEVEMENTS|SECOND TRACK/);
    let request=null;const scene=makeReturnReportScene({summary,getCausalStatus:()=>{throw Error('Failure must not wait for HUSH qualification');},onArchive:value=>{request=value;}});
    scenes.push(scene);scene.update(2.3);assert.equal(scene.view().stage,'residue');assert.equal(scene.view().action,'replay');
    scene.key({key:'ArrowDown'});scene.keyup({key:'ArrowDown'});assert.equal(scene.view().action,'archive');
    scene.key({key:'Enter'});scene.keyup({key:'Enter'});assert.deepEqual(request,{summaryId:summary.id,recordings:true});
    assert.equal(getSave().run.status,'failed-night');scenes.clear();
  });
});

test('replacement of a staged failed save repairs its archive ledger before the active night is discarded',()=>{
  const summary={id:'return:crashed',runId:'crashed',classification:'failed-night',recordings:{schema:1,tapes:[],mediaRefs:[]}};
  const save={run:{id:'crashed',pendingReturn:{kind:'failed-night',summary},finalizedReturn:{kind:'failed-night',summaryId:summary.id}}};
  const patch=pendingNightArchivePatch(save,freshMeta());assert.deepEqual(patch.returns.history,[summary.id]);assert.deepEqual(patch.returns.records[summary.id],summary);
  assert.equal(pendingNightArchivePatch(save,{returns:patch.returns}),null);
  assert.equal(pendingNightArchivePatch({...save,run:{...save.run,id:'another'}},freshMeta()),null);
});
