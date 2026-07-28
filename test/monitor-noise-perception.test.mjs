import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONITOR_BAND,
  monitorBandForDb,
  monitorObserveAcousticEvent,
  monitorReset,
  monitorSetAuxInput,
  monitorSnapshot,
  monitorSnapshotForRms,
} from '../src/audio/monitor.js';
import {
  HUSH_NOISE_PERCEPTION,
  freshHushNoisePerception,
  hushNoiseForcesDirectContact,
  hushNoiseMapConfirmation,
  updateHushNoisePerception,
} from '../src/game/hush-noise-perception.js';

const event = ({ player = true, monitor = true, hush = true, db = -25, durationMs = 500 } = {}) => ({
  id: `event:${db}:${player}`,
  kind: 'test-noise',
  spatial: { position: { x: 8, y: 9 } },
  acoustic: { levelDb: db, durationMs },
  semantics: { playerGenerated: player, audibleToMonitor: monitor, audibleToHush: hush },
});

test('monitor bands describe exposure rather than clipping', () => {
  assert.equal(monitorBandForDb(-31), MONITOR_BAND.NORMAL);
  assert.equal(monitorBandForDb(-30), MONITOR_BAND.MID_HOT);
  assert.equal(monitorBandForDb(-18), MONITOR_BAND.HOT);
  assert.equal(monitorSnapshotForRms(.05).band, MONITOR_BAND.MID_HOT, 'ordinary speech is a location clue');
  assert.equal(monitorSnapshotForRms(.15).band, MONITOR_BAND.HOT, 'loud speech is a pinpoint, not a clip indicator');
});

test('monitor ignores system audio and accepts only player sound plus an active mic feed', () => {
  monitorReset();
  assert.equal(monitorObserveAcousticEvent(event({ player: false, db: -6 }), 1000), false);
  assert.equal(monitorSnapshot(1010).band, MONITOR_BAND.NORMAL);
  assert.equal(monitorObserveAcousticEvent(event({ player: true, db: -25 }), 1020), true);
  const player = monitorSnapshot(1100);
  assert.equal(player.hushBand, MONITOR_BAND.MID_HOT);
  assert.deepEqual(player.inputPosition, { x: 8, y: 9 });

  monitorReset();
  monitorSetAuxInput(() => .15);
  const mic = monitorSnapshot(2000);
  assert.equal(mic.hushBand, MONITOR_BAND.HOT);
  assert.equal(mic.inputKind, 'room-mic');
  assert.equal(mic.inputPosition, null);
  monitorReset();
});

test('mid-hot clues, hot pinpoints, and sustained hot forbids a brush contact', () => {
  let state = freshHushNoisePerception();
  let result = updateHushNoisePerception(state, { now: 1000, dt: .1, db: -34, active: true });
  assert.equal(result.action, null);
  assert.deepEqual(result.confirmation, { mode: 'none', label: 'ACTIVE', detail: 'NO FIX', cls: 'ui-secondary' });

  result = updateHushNoisePerception(result.state, { now: 1100, dt: .1, db: -25, active: true });
  assert.equal(result.action.kind, 'clue');
  assert.equal(hushNoiseMapConfirmation(result.state, 1200).mode, 'clue');

  state = result.state;
  let now = 2000;
  for (let elapsed = 0; elapsed < HUSH_NOISE_PERCEPTION.sustainedHotMs + 100; elapsed += 100) {
    result = updateHushNoisePerception(state, { now, dt: .1, db: -10, active: true });
    state = result.state;
    now += 100;
  }
  assert.equal(hushNoiseForcesDirectContact(state, now), true);
  assert.equal(hushNoiseMapConfirmation(state, now).mode, 'locked');
});
