import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ||= { title:'Chunk Surfer', baseURI:'http://localhost/' };
globalThis.window ||= globalThis;
globalThis.performance ||= { now:() => Date.now() };

const guidance = await import('../src/game/radio-guidance.js');
const radio = await import('../src/game/radio.js');

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
  const first = guidance.resolveRadioCall({ dangerContext:true, dangerKind:'near' });
  const armed = {
    ...first.state,
    originalBreakdown:{armed:true,roomId:'the_tub',armedAt:10,fallbackAt:22},
  };
  const second = guidance.resolveRadioCall({ state:armed, dangerContext:true, originalBreakdownStarted:false });
  assert.equal(first.kind, 'danger-help');
  assert.equal(second.kind, 'hush-help-rupture');
  assert.equal(second.state.dangerCallCount, 2);

  const begun = guidance.resolveRadioCall({ state:armed, dangerContext:true, originalBreakdownStarted:true });
  assert.equal(begun.kind, 'original-breakdown');
});

test('schema 3 restores guidance history, incident window, fallback and death cause', () => {
  radio.resetRadioState();
  radio.resolveManualRadioCall({ dangerContext:true });
  radio.noteRadioDangerIncident({ now:1000 });
  radio.armOriginalBreakdown({ roomId:'the_tub', now:1000 });
  const saved = radio.saveRadioState(2000);
  assert.equal(saved.schema, 3);
  assert.equal(saved.guidance.dangerCallCount, 1);
  assert.equal(saved.guidance.recentIncidentRemainingMs, 29000);
  assert.equal(saved.guidance.originalBreakdown.fallbackRemainingMs, 11000);

  radio.resetRadioState();
  radio.loadRadioState(saved, 5000);
  assert.equal(radio.radioDangerContext({ now:33999 }), true);
  assert.equal(radio.originalBreakdownFallbackReady({ now:15999 }), false);
  assert.equal(radio.originalBreakdownFallbackReady({ now:16000 }), true);

  radio.resolveRadioCue(radio.RADIO_CUES.HUSH_RUPTURE, { now:17000 });
  assert.equal(radio.isDead(), true);
  assert.equal(radio.radioDeathCause(), 'second-danger-call');
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
