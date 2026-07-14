import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ||= { title: 'Chunk Surfer', baseURI: 'http://localhost/' };
globalThis.window ||= globalThis;
globalThis.performance ||= { now: () => Date.now() };

const radio = await import('../src/game/radio.js');
const {
  RADIO_CUES,
  activeRadioCue,
  consumeRadioCue,
  isDead,
  loadRadioState,
  pendingRadioCue,
  queueRadioCue,
  radioMilestones,
  resetRadioState,
  resolveRadioCue,
  saveRadioState,
  shouldQueuePostSecondTake,
  shouldQueuePreThirdBreakdown,
  transmit,
} = radio;
const { radioDialogue } = await import('../src/data/radio-script.js');
const { STORY_ART } = await import('../src/game/story-art.js');

test('radio no longer dies after two transmissions', () => {
  resetRadioState();
  assert.equal(transmit([]), true);
  assert.equal(transmit([]), true);
  assert.equal(isDead(), false);
});

test('radio dies only when the pre-third-room breakdown resolves', () => {
  resetRadioState();
  queueRadioCue(RADIO_CUES.PRE_THIRD, { roomId: 'the_tub' });
  const cue = consumeRadioCue();
  assert.equal(cue.id, RADIO_CUES.PRE_THIRD);
  assert.equal(activeRadioCue().id, RADIO_CUES.PRE_THIRD);
  assert.equal(isDead(), false);
  resolveRadioCue(RADIO_CUES.PRE_THIRD);
  assert.equal(isDead(), true);
  assert.equal(radioMilestones()[RADIO_CUES.PRE_THIRD], true);
});

test('post-second warning becomes eligible after any second completed recording', () => {
  resetRadioState();
  assert.equal(shouldQueuePostSecondTake({ completedTakes: 1 }), false);
  assert.equal(shouldQueuePostSecondTake({ completedTakes: 2 }), true);
  queueRadioCue(RADIO_CUES.POST_SECOND);
  consumeRadioCue();
  resolveRadioCue(RADIO_CUES.POST_SECOND);
  assert.equal(shouldQueuePostSecondTake({ completedTakes: 2 }), false);
});

test('pre-third breakdown requires post-second warning and room proximity', () => {
  resetRadioState();
  assert.equal(shouldQueuePreThirdBreakdown({
    completedTakes: 2,
    nearestRoom: 'amplifications',
    distanceMeters: 1,
  }), false);

  queueRadioCue(RADIO_CUES.POST_SECOND);
  consumeRadioCue();
  resolveRadioCue(RADIO_CUES.POST_SECOND);

  assert.equal(shouldQueuePreThirdBreakdown({
    completedTakes: 2,
    nearestRoom: 'amplifications',
    distanceMeters: 9,
    thresholdMeters: 8,
  }), false);
  assert.equal(shouldQueuePreThirdBreakdown({
    completedTakes: 2,
    nearestRoom: 'amplifications',
    distanceMeters: 8,
    thresholdMeters: 8,
  }), true);
});

test('radio save/load preserves milestones and pending cue', () => {
  resetRadioState();
  queueRadioCue(RADIO_CUES.POST_SECOND, { roomId: 'the_tub', reason: 'test' });
  const saved = saveRadioState();
  resetRadioState();
  loadRadioState(saved);
  assert.deepEqual(pendingRadioCue(), {
    id: RADIO_CUES.POST_SECOND,
    roomId: 'the_tub',
    reason: 'test',
    queuedAt: saved.pendingCue.queuedAt,
  });
});

test('radio keeps one pending cue instead of overwriting it', () => {
  resetRadioState();
  assert.equal(queueRadioCue(RADIO_CUES.POST_SECOND, { reason: 'first' }), true);
  assert.equal(queueRadioCue(RADIO_CUES.PRE_THIRD, { roomId: 'the_tub', reason: 'second' }), false);
  assert.equal(pendingRadioCue().id, RADIO_CUES.POST_SECOND);
  assert.equal(pendingRadioCue().reason, 'first');
});

test('radio dialogue trees have choices, terminals, and walkie art', () => {
  assert.ok(STORY_ART.walkie);
  for (const cue of Object.values(RADIO_CUES)) {
    const nodes = radioDialogue(cue, { roomLabel: 'The Natatorium' });
    assert.ok(nodes.start?.choices?.length >= 2, cue);
    assert.equal(nodes.start.art.id, 'walkie', cue);
    for (const choice of nodes.start.choices) {
      assert.ok(nodes[choice.goto], `${cue}:${choice.goto}`);
      assert.ok(Array.isArray(nodes[choice.goto].lines), `${cue}:${choice.goto}`);
      assert.equal(nodes[choice.goto].choices, undefined, `${cue}:${choice.goto} should terminate`);
    }
  }
});
