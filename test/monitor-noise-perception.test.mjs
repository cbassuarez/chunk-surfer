import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONITOR_BAND,
  monitorBandForDb,
  monitorInit,
  monitorObserveAcousticEvent,
  monitorProgramMeasurement,
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
import {
  applyVfdSettings,
  setActiveSurface,
  themeRoleColor,
  uiRoleColor,
  vfdSettings,
} from '../src/render/palette.js';

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
  assert.equal(monitorBandForDb(-19, { previousBand: MONITOR_BAND.HOT, hysteresisDb: 2 }), MONITOR_BAND.HOT);
  assert.equal(monitorBandForDb(-21, { previousBand: MONITOR_BAND.HOT, hysteresisDb: 2 }), MONITOR_BAND.MID_HOT);
});

test('final output analyser is available as isolation reference without driving exposure', () => {
  monitorReset();
  const analyser = {
    fftSize: 0,
    frequencyBinCount: 8,
    smoothingTimeConstant: 1,
    channelCountMode: 'explicit',
    connect() {},
    getFloatTimeDomainData(values) { values.fill(.05); },
    getFloatFrequencyData(values) { values.fill(-24); },
  };
  monitorInit({ createAnalyser: () => analyser }, {});
  const program = monitorProgramMeasurement();
  assert.equal(program.active, true);
  assert.ok(Math.abs(program.rms - .05) < 1e-6);
  assert.equal(program.spectrum.length, 8);
  assert.equal(monitorSnapshot(1000).band, MONITOR_BAND.NORMAL,
    'the actual speaker bus is a cancellation reference, never exposure evidence');
  monitorReset();
});

test('monitor ignores system audio and accepts only player sound plus an active mic feed', () => {
  monitorReset();
  assert.equal(monitorObserveAcousticEvent(event({ player: false, db: -6 }), 1000), false);
  assert.equal(monitorSnapshot(1010).band, MONITOR_BAND.NORMAL);
  assert.equal(monitorObserveAcousticEvent(event({ player: true, db: -25 }), 1020), true);
  const player = monitorSnapshot(1100);
  assert.equal(player.band, player.hushBand, 'the visible band is the HUSH evidence band');
  assert.equal(player.hushBand, MONITOR_BAND.MID_HOT);
  assert.deepEqual(player.inputPosition, { x: 8, y: 9 });

  monitorReset();
  monitorSetAuxInput(() => .15);
  const mic = monitorSnapshot(2000);
  assert.equal(mic.hushBand, MONITOR_BAND.HOT);
  assert.equal(mic.inputKind, 'room-mic');
  assert.equal(mic.inputPosition, null);

  monitorSetAuxInput(() => ({ rms: .15, peak: 1, clipped: true }));
  const clipped = monitorSnapshot(2010);
  assert.equal(clipped.band, MONITOR_BAND.HOT, 'clip state does not redefine the HUSH RMS band');
  assert.equal(clipped.clipped, true);
  assert.equal(clipped.segments, 12, 'a clipped input cannot display false headroom');
  assert.equal(clipped.peakDb, 0);

  monitorReset();
  monitorObserveAcousticEvent(event({ player: true, hush: false, db: -6 }), 3000);
  assert.equal(monitorSnapshot(3010).band, MONITOR_BAND.NORMAL, 'safe authored player sounds cannot produce a false HUSH warning');
  monitorReset();
});

test('mid-hot clues, hot pinpoints, and sustained hot emits one guaranteed direct contact', () => {
  let state = freshHushNoisePerception();
  let result = updateHushNoisePerception(state, { now: 1000, dt: .1, db: -34, active: true });
  assert.equal(result.action, null);
  assert.deepEqual(result.confirmation, { mode: 'none', label: 'ACTIVE', detail: 'NO FIX', cls: 'ui-secondary' });

  result = updateHushNoisePerception(result.state, { now: 1100, dt: .1, db: -25, active: true });
  assert.equal(result.action.kind, 'clue');
  assert.equal(hushNoiseMapConfirmation(result.state, 1200).mode, 'clue');

  state = result.state;
  let now = 2000;
  const actions = [];
  for (let elapsed = 0; elapsed < HUSH_NOISE_PERCEPTION.sustainedHotMs + 100; elapsed += 100) {
    result = updateHushNoisePerception(state, { now, dt: .1, db: -10, active: true });
    if (result.action) actions.push(result.action.kind);
    state = result.state;
    now += 100;
  }
  assert.equal(actions.filter((kind) => kind === 'contact').length, 1);
  assert.equal(hushNoiseForcesDirectContact(state, now), true);
  assert.equal(hushNoiseMapConfirmation(state, now).mode, 'locked');

  result = updateHushNoisePerception(state, { now, dt: .1, db: -19, active: true });
  assert.equal(result.state.band, MONITOR_BAND.HOT, 'hot hysteresis absorbs a one-frame mic dip');
  assert.equal(result.state.contactEscalated, true);
});

test('warning colors remain semantic under green, amber, and forced phosphor themes', () => {
  const previous = { ...vfdSettings };
  try {
    applyVfdSettings({ phosphor: 'faithful' });
    setActiveSurface('green');
    assert.equal(themeRoleColor('warning'), '#F2A81E');
    assert.equal(uiRoleColor('ui-warning'), themeRoleColor('warning'));
    setActiveSurface('amber');
    assert.notEqual(themeRoleColor('warning'), themeRoleColor('phosphor'));
    applyVfdSettings({ phosphor: 'cyan' });
    assert.notEqual(themeRoleColor('warning'), themeRoleColor('phosphor'));
  } finally {
    applyVfdSettings(previous);
    setActiveSurface('amber');
  }
});
