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
  monitorSetPresenceInput,
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

test('the needle reads a sound that is not in the room, and it never reaches perception', () => {
  monitorReset();
  monitorInit?.(null);
  try {
    let level = 0;
    monitorSetPresenceInput(() => level);

    const quiet = monitorSnapshot(1000);
    assert.equal(quiet.presenceRms, 0);
    assert.equal(quiet.db, quiet.hushDb, 'with nothing close the two agree exactly');

    // Something is standing near. The room is silent — nothing is on the
    // operator's own input — and the meter is not.
    level = .8;
    const close = monitorSnapshot(2000);
    assert.ok(close.presenceRms > .5, 'the presence puts level on the input');
    assert.ok(close.db > close.hushDb + 12, 'the needle is well above what it hears of you');
    assert.equal(close.hushRms, 0, 'and it hears nothing of you, because you made no sound');
    assert.ok(close.segments > quiet.segments, 'the meter visibly moves');

    // THE PERCEPTION MUST NOT SEE IT. Otherwise the thing getting close reads as
    // the player making noise, and its own approach arrests them for it.
    let state = freshHushNoisePerception();
    let now = 0;
    const kinds = new Set();
    for (let i = 0; i < 60; i++) {
      const snap = monitorSnapshot(now);
      const out = updateHushNoisePerception(state, { now, dt: .1, db: snap.hushDb, active: true });
      if (out.action) kinds.add(out.action.kind);
      state = out.state;
      now += 100;
    }
    assert.equal(kinds.size, 0, 'six seconds of a body at the mic is not six seconds of you shouting');

    // REPEATABLE TO THE DECIBEL. A player who suspects a bug walks the approach
    // again; a fault reads differently each time and a lie reads the same, so
    // this is the property that makes it diegetic rather than broken.
    const a = monitorSnapshot(9000).db;
    const b = monitorSnapshot(9100).db;
    assert.equal(a, b, 'same distance, same reading');
  } finally {
    monitorSetPresenceInput(null);
    monitorReset();
  }
});

test('cover withholds the upgrade: a hot noise stays a room, never a point', () => {
  // Same racket, twice. In the open it sharpens to a pinpoint and then to a hand
  // on you. Behind something it is heard just as loudly and never localised.
  const run = (concealed) => {
    let state = freshHushNoisePerception();
    const kinds = new Set();
    let now = 0;
    for (let i = 0; i < 60; i++) {
      const result = updateHushNoisePerception(state, { now, dt: .1, db: -6, active: true, concealed });
      if (result.action) kinds.add(result.action.kind);
      state = result.state;
      now += 100;
    }
    return { kinds, state, now };
  };

  const open = run(false);
  assert.ok(open.kinds.has('pinpoint'), 'in the open it gets a point');
  assert.ok(open.kinds.has('contact'), 'and then it gets you');
  assert.equal(hushNoiseMapConfirmation(open.state, open.now).detail, 'YOU');

  const hidden = run(true);
  assert.deepEqual([...hidden.kinds], ['clue'], 'behind cover it only ever has a room');
  assert.equal(hidden.kinds.has('pinpoint'), false, 'concealment refuses the point');
  assert.equal(hidden.kinds.has('contact'), false, 'and refuses the hand');
  assert.equal(hushNoiseForcesDirectContact(hidden.state, hidden.now), false);
  assert.equal(hushNoiseMapConfirmation(hidden.state, hidden.now).detail, 'LAST POSITION',
    'and the readout the player already has says so, so nothing new is drawn');
});

test('the contact clock does not bank while concealed', () => {
  // Otherwise a loud minute behind cover would grab you the instant you stepped
  // out, for a reason nothing on screen could have told you.
  let state = freshHushNoisePerception();
  let now = 0;
  for (let i = 0; i < 60; i++) {
    state = updateHushNoisePerception(state, { now, dt: .1, db: -6, active: true, concealed: true }).state;
    now += 100;
  }
  assert.equal(state.hotHeldMs, 0, 'six seconds of hot noise behind cover banks nothing');

  // Breaking cover starts the sustained clock from scratch, not from six seconds:
  // it must still take the full sustainedHotMs in the open to earn a contact.
  const kinds = [];
  const brokeAt = now;
  let firstContactAt = null;
  for (let i = 0; i < 40; i++) {
    const out = updateHushNoisePerception(state, { now, dt: .1, db: -6, active: true });
    if (out.action) {
      kinds.push(out.action.kind);
      if (out.action.kind === 'contact' && firstContactAt === null) firstContactAt = now;
    }
    state = out.state;
    now += 100;
  }
  assert.ok(kinds.includes('pinpoint'), 'stepping out is heard, and sharply');
  assert.ok(firstContactAt !== null, 'and staying loud in the open still earns a contact');
  // One frame's slack: `now` is sampled before it advances, so the frame that
  // banks the 1750th millisecond is stamped one 100ms tick earlier.
  const waited = firstContactAt - brokeAt;
  assert.ok(waited >= HUSH_NOISE_PERCEPTION.sustainedHotMs - 100,
    `the sustained clock restarts on breaking cover (took ${waited}ms)`);
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
