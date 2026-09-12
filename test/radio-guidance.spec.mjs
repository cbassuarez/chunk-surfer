import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ||= { title:'Chunk Surfer', baseURI:'http://localhost/' };
globalThis.window ||= globalThis;
globalThis.performance ||= { now:() => Date.now() };

const guidance = await import('../src/game/radio-guidance.js');
const radio = await import('../src/game/radio.js');
const context = {isTraversal:true,sceneId:'explore',floorId:'ground',completedJobTakes:2,target:{roomId:'the_tub',floorId:'ground',reachable:true,unfinished:true,distanceMeters:6}};
function walk(seconds, active=context) { for(let i=0;i<seconds*4;i++)radio.updateRadioProgression(.25,active); }
function warning() {
  for(const id of [radio.RADIO_CUES.INITIAL,radio.RADIO_CUES.POST_SECOND]) {
    radio.queueRadioCue(id); radio.consumeRadioCue(context); radio.resolveRadioCue(id); walk(20);
  }
}

test('marked work wins and an unmarked seeded assignment remains stable', () => {
  const first = guidance.resolveRadioCall({
    runSeed:'run-4417', unfinishedRoomIds:['the_tub','amplifications'], availableRoomIds:['the_tub','amplifications'],
  });
  const repeat = guidance.resolveRadioCall({
    state:first.state, runSeed:'a-different-seed', unfinishedRoomIds:['the_tub','amplifications'], availableRoomIds:['the_tub','amplifications'],
  });
  assert.equal(repeat.targetId, first.targetId);
  assert.equal(repeat.entry, 'route-repeat');

  const marked = guidance.resolveRadioCall({
    state:repeat.state, markedRoomId:'amplifications', unfinishedRoomIds:['the_tub','amplifications'], availableRoomIds:['the_tub','amplifications'],
  });
  assert.equal(marked.targetId, 'amplifications');
  assert.equal(marked.state.assignedRoomId, null);
});

test('opening targets remain mandatory and progressive', () => {
  const first = guidance.resolveRadioCall({ openingTarget:{id:'story:main-b3'} });
  const repeat = guidance.resolveRadioCall({ state:first.state, openingTarget:{id:'story:main-b3'} });
  assert.equal(first.kind, 'opening-guidance');
  assert.equal(first.entry, 'opening');
  assert.equal(repeat.entry, 'route-repeat');
});

test('danger help ruptures on the second run-wide call before an armed hijack begins', () => {
  const first = guidance.resolveRadioCall({ intent:'help', dangerContext:true, dangerKind:'near' });
  const armed = {
    ...first.state,
    originalBreakdown:{armed:true,roomId:'the_tub',armedAt:10,fallbackAt:22},
  };
  const second = guidance.resolveRadioCall({ state:armed, intent:'help', dangerContext:true, originalBreakdownStarted:false });
  assert.equal(first.kind, 'danger-help');
  assert.equal(second.kind, 'hush-help-rupture');
  assert.equal(second.state.dangerCallCount, 2);

  const begun = guidance.resolveRadioCall({ state:armed, intent:'help', dangerContext:true, originalBreakdownStarted:true });
  assert.equal(begun.kind, 'original-breakdown');
});

test('schema 5 restores guidance history and active-time pacing without spending saved wall time', () => {
  radio.resetRadioState();
  radio.resolveManualRadioCall({ intent:'help', dangerContext:true });
  warning();
  radio.noteRadioDangerIncident({ now:1000 });
  radio.armOriginalBreakdown({...context,now:1000});
  walk(1);
  const saved = radio.saveRadioState(2000);
  assert.equal(saved.schema, 5);
  assert.equal(saved.guidance.dangerCallCount, 1);
  assert.equal(saved.guidance.recentIncidentRemainingMs, 29000);
  assert.equal(saved.guidance.originalBreakdown.fallbackRemainingMs, 11000);

  radio.resetRadioState();
  radio.loadRadioState(saved, 5000);
  assert.equal(radio.radioDangerContext({ now:33999 }), true);
  assert.equal(radio.originalBreakdownFallbackReady({...context,now:900000}), false);
  assert.equal(radio.radioGuidanceState().traversal.sinceWarningMs,21000);
  walk(11);
  assert.equal(radio.originalBreakdownFallbackReady(context), true);

  radio.queueRadioCue(radio.RADIO_CUES.HUSH_RUPTURE);
  radio.consumeRadioCue(context);
  radio.resolveRadioCue(radio.RADIO_CUES.HUSH_RUPTURE, { now:17000 });
  assert.equal(radio.isDead(), true);
  assert.equal(radio.radioDeathCause(), 'second-danger-call');
});

test('directions are safe even beside HUSH, after an incident, or while the original hijack is armed',()=>{
  let state=guidance.freshRadioGuidanceState();
  for(let i=0;i<20;i++){
    const call=guidance.resolveRadioCall({state,dangerContext:true,openingTarget:{id:'story:main-b3'}});
    assert.equal(call.kind,'opening-guidance');
    assert.equal(call.state.dangerCallCount,0);
    state=call.state;
  }
  state=guidance.resolveRadioCall({state,intent:'help',dangerContext:true}).state;
  assert.equal(state.dangerCallCount,1);
  state.originalBreakdown={armed:true,roomId:'the_tub'};
  const directions=guidance.resolveRadioCall({state,intent:'directions',dangerContext:true,unfinishedRoomIds:['the_tub']});
  assert.equal(directions.kind,'route-guidance');
  assert.equal(directions.state.dangerCallCount,1);
  const help=guidance.resolveRadioCall({state:directions.state,intent:'help',dangerContext:true});
  assert.equal(help.kind,'hush-help-rupture');
  assert.equal(help.state.dangerCallCount,2);
});

test('help without physical danger is ordinary guidance and unavailable marked rooms cannot override routing',()=>{
  const call=guidance.resolveRadioCall({intent:'help',dangerContext:false,markedRoomId:'the_tub',unfinishedRoomIds:['the_tub','amplifications'],availableRoomIds:['amplifications']});
  assert.equal(call.kind,'route-guidance');
  assert.equal(call.targetId,'amplifications');
  assert.equal(call.state.dangerCallCount,0);
});

test('pure runtime policy forbids every non-traversal transport and scene owner',()=>{
  assert.equal(guidance.radioRuntimeReadiness().ready,false);
  assert.equal(guidance.radioRuntimeReadiness(context).ready,true);
  for(const field of ['isRecording','isListening','isCombat','isTutorial','isSetup','isEnding','isSource','dialogueOpen','paused']) {
    assert.equal(guidance.radioRuntimeReadiness({...context,[field]:true}).ready,false,field);
  }
  for(const sceneId of ['source-space','source:lift','ending:helped','credits','tutorial','setup:runtime','combat:training']) {
    assert.equal(guidance.radioRuntimeReadiness({...context,sceneId}).ready,false,sceneId);
  }
});

test('physical target policy is explicit and fail-closed',()=>{
  assert.equal(guidance.radioTargetReadiness(context.target,context).ready,true);
  for(const target of [null,{roomId:'the_tub'},{...context.target,floorId:'basement'},{...context.target,reachable:false},{...context.target,unfinished:false},{...context.target,distanceMeters:NaN}]) {
    assert.equal(guidance.radioTargetReadiness(target,context).ready,false);
  }
  assert.equal(guidance.radioTargetReadiness(context.target,{}).ready,false);
});

test('schema 3 wall-clock fallback migration earns no active-time credit',()=>{
  radio.resetRadioState();
  radio.loadRadioState({schema:3,phase:'failing',milestones:{[radio.RADIO_CUES.POST_SECOND]:true},guidance:{originalBreakdown:{armed:true,roomId:'the_tub',armedAt:1,fallbackRemainingMs:0}}},90000);
  assert.equal(radio.originalBreakdownFallbackReady({...context,now:999999}),false);
  assert.equal(radio.radioGuidanceState().originalBreakdown.activeMs,0);
  assert.equal(radio.radioGuidanceState().traversal.sinceWarningMs,0);
  radio.updateRadioProgression(.25,context);
  assert.equal(radio.originalBreakdownArmed(),false,'a legacy arm has no verified monitor/floor identity');
});

test('schema 2 migrates with empty guidance while retaining radio phase and pending call', () => {
  radio.resetRadioState();
  radio.loadRadioState({
    schema:2,
    phase:'failing',
    milestones:{[radio.RADIO_CUES.POST_SECOND]:true},
    pendingCue:{id:radio.RADIO_CUES.PRE_THIRD,roomId:'the_tub',reason:'old-save'},
  }, 1000);
  assert.equal(radio.isFailing(), true);
  assert.equal(radio.pendingRadioCue().roomId, 'the_tub');
  assert.deepEqual(radio.radioGuidanceState().repeatCounts, {});
  assert.equal(radio.radioGuidanceState().dangerCallCount, 0);
});
