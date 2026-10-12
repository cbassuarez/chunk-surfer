import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TOWER_PERSONAL_JOURNEY as PLAN, towerPersonalWorld } from '../src/data/tower-personal-journey.js';
import { cathedralBellCombatDefinition, cathedralBellCombatBattle } from '../src/data/combat-definitions.js';
import { createCombatState } from '../src/game/combat-state.js';
import { ordinaryTakeCount } from '../src/game/chapel-tower-state.js';
import {
  CHUNK_SURF_PHASE, SOURCE_FINALE_ROUTE, SOURCE_FINALE_STAGE,
  normalizeChunkSurfState, reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';
import {
  beginTowerPersonalJourney, tickTowerPersonalJourney, leaveTowerPersonalJourney, crossTowerPersonalJourney,
} from '../src/game/tower-personal-journey.js';
import {
  TOWER_PERSONAL_TAKE, TOWER_PERSONAL_CUE, TOWER_PERSONAL_SECONDS,
} from '../src/audio/tower-personal-recording.js';
import * as PB from '../src/game/playback.js';

const dispatch = (state, type, details = {}) => reduceChunkSurf(state, { type, ...details });
const reload = (state) => normalizeChunkSurfState(JSON.parse(JSON.stringify(state)));
const roadPose = { x: 12, y: -4200, facing: 0, yaw: 0, pitch: 0 };

function completeJourney() {
  let journey = beginTowerPersonalJourney(null, { entryDoorId: 'service-door', returnPose: roadPose });
  const onward = () => {
    const door = towerPersonalWorld(journey.stage).doors.find((entry) => entry.id === 'onward');
    const from = { ...journey.pose, x: door.center.x, z: door.center.z - door.normal.z * .4 };
    const to = { ...from, z: door.center.z + door.normal.z * .4 };
    journey = crossTowerPersonalJourney(journey, from, to).journey;
  };
  for (let n = 0; n < 3; n++) onward();
  assert.equal(journey.stage, 'ash-room');
  journey.pose = { ...journey.pose, x: PLAN.recordist.x, z: PLAN.recordist.z };
  for (let seconds = 0; seconds < PLAN.listenSeconds + .5; seconds += .25) {
    journey = tickTowerPersonalJourney(journey, .25, { recorderHeld: true, audibleSeconds: .25 }).journey;
  }
  assert.equal(journey.recordingHeard, true);
  onward();
  assert.equal(journey.stage, 'return-hall');
  journey.pose = { ...journey.pose, x: PLAN.boy.x, z: PLAN.boy.z };
  for (let seconds = 0; seconds < PLAN.handoverSeconds + .5; seconds += .25) {
    journey = tickTowerPersonalJourney(journey, .25).journey;
  }
  const result = leaveTowerPersonalJourney(journey);
  assert.equal(result.completed, true);
  assert.deepEqual(result.pose, roadPose);
  return result.journey;
}

function cathedralState(personal, { alarm = 5, stage = SOURCE_FINALE_STAGE.CATHEDRAL } = {}) {
  return normalizeChunkSurfState({
    phase: CHUNK_SURF_PHASE.BELLS,
    station: { personal },
    finale: { route: SOURCE_FINALE_ROUTE.TOWER, stage, cathedral: { alarm, damage: [] } },
  });
}

test('only confirming the first fight spends the completed journey and quiets the alarm atomically', () => {
  const earned = completeJourney();
  let state = cathedralState(earned, { stage: SOURCE_FINALE_STAGE.TOWER_COMMITTED });
  assert.equal(state.station.personal.rewardConsumed, false);
  const untouched = reload(state);
  for (const type of ['CATHEDRAL_FIGHT_STARTED', 'CATHEDRAL_FIGHT_WON', 'CATHEDRAL_FIGHT_LOST']) {
    state = dispatch(state, type);
    assert.equal(state.station.personal.rewardConsumed, false, type);
  }
  state = dispatch(state, 'CATHEDRAL_ENTERED');
  state = dispatch(state, 'CATHEDRAL_BELL_RUNG');
  assert.equal(state.finale.cathedral.alarm, 6);
  assert.equal(state.station.personal.rewardConsumed, false, 'arrival and bell contact do not spend the recording');
  const offered = cathedralBellCombatBattle({ ...state.finale.cathedral, personalOpening: true });
  assert.equal(offered.combat.openingCharge, 2);
  assert.equal(state.station.personal.rewardConsumed, false, 'building an intro does not consume progression');
  state = dispatch(reload(state), 'CATHEDRAL_FIGHT_STARTED');
  assert.equal(state.finale.stage, SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT);
  assert.equal(state.station.personal.rewardConsumed, true);
  assert.equal(state.finale.cathedral.alarm, 0);
  assert.equal(state.finale.cathedral.personalOpening, true);
  assert.equal(untouched.station.personal.rewardConsumed, false, 'the earlier save is not mutated');
  assert.deepEqual(dispatch(state, 'CATHEDRAL_FIGHT_STARTED'), state, 'repeated confirmation cannot grant a second opening');
  const resumed = reload(state);
  assert.equal(resumed.finale.cathedral.personalOpening, true, 'the current fight retains its earned intro across a reload');
  assert.equal(resumed.station.personal.rewardConsumed, true);
  assert.equal(createCombatState(cathedralBellCombatDefinition(resumed.finale.cathedral)).charge, 2);
});

test('the earned opening adds no charge to the quiet baseline and cannot be granted again on retry or phase two', () => {
  let state = dispatch(cathedralState(completeJourney()), 'CATHEDRAL_FIGHT_STARTED');
  const quiet = createCombatState(cathedralBellCombatDefinition({ alarm: 0 }));
  const earned = createCombatState(cathedralBellCombatDefinition(state.finale.cathedral));
  assert.equal(quiet.charge, 2);
  assert.equal(earned.charge, quiet.charge, 'the reward supplies the quiet opening rather than stacking another charge');
  const second = cathedralBellCombatBattle({ phase: 2, carriedDamage: 5, ...state.finale.cathedral });
  assert.equal(second.combat.personalOpening, false);
  assert.equal(createCombatState(second.combat).charge, 1);
  assert.doesNotMatch(second.intro.map((line) => line.text).join(' '), /old recording|holds its breath/i);
  assert.equal(state.station.personal.rewardConsumed, true);
  state = reload(dispatch(state, 'CATHEDRAL_FIGHT_LOST'));
  assert.equal(state.finale.stage, SOURCE_FINALE_STAGE.CATHEDRAL);
  assert.equal(state.finale.cathedral.personalOpening, undefined);
  assert.equal(state.station.personal.rewardConsumed, true);
  // Make the retry observably noisy: a replayed reward would erase these rings.
  for (let index = 0; index < 3; index += 1) state = dispatch(state, 'CATHEDRAL_BELL_RUNG');
  state = dispatch(reload(state), 'CATHEDRAL_FIGHT_STARTED');
  assert.equal(state.finale.cathedral.alarm, 3);
  assert.equal(state.finale.cathedral.personalOpening, undefined);
  assert.equal(createCombatState(cathedralBellCombatDefinition(state.finale.cathedral)).charge, 1);
  const won = dispatch(state, 'CATHEDRAL_FIGHT_WON');
  assert.equal(won.station.personal.rewardConsumed, true);
  assert.equal(won.finale.cathedral.personalOpening, undefined);
});

test('an attempted early retreat or recording without completing the circuit earns no opening', () => {
  const entered = beginTowerPersonalJourney(null, { entryDoorId: 'service-door', returnPose: roadPose });
  assert.equal(leaveTowerPersonalJourney(entered), null);
  assert.equal(entered.completed, false);
  assert.equal(entered.rewardEarned, false);
  for (const personal of [entered, { ...entered, recordingHeard: true },
    { ...entered, rewardEarned: true }, { ...entered, handoverSeconds: PLAN.handoverSeconds }]) {
    const state = dispatch(cathedralState(personal), 'CATHEDRAL_FIGHT_STARTED');
    assert.equal(state.finale.cathedral.alarm, 5);
    assert.equal(state.finale.cathedral.personalOpening, undefined);
    assert.equal(state.station.personal.rewardConsumed, false);
    assert.equal(createCombatState(cathedralBellCombatDefinition(state.finale.cathedral)).charge, 1);
  }
});

function audioContext() {
  const sources = [], gains = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
  return {
    sampleRate: 256, currentTime: 10, sources, gains,
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { duration: length / sampleRate, numberOfChannels: channels, getChannelData: (index) => data[index] };
    },
    createGain() { const gain = node({ gain: param() }); gains.push(gain); return gain; },
    createBufferSource() {
      const source = node({ buffer: null, loop: false,
        start(when, offset = 0) { this.started = { when, offset }; }, stop() {} });
      sources.push(source); return source;
    },
    createBiquadFilter() { return node({ frequency: param(), Q: param() }); },
  };
}

const pcmHash = (buffer) => {
  const hash = createHash('sha256');
  for (let index = 0; index < buffer.numberOfChannels; index += 1) hash.update(Buffer.from(buffer.getChannelData(index).buffer));
  return hash.digest('hex');
};

test('the received authored tape is idempotent, replayable after reload, and never counts as ordinary work', () => {
  PB.loadTakes([]);
  let guestSelections = 0;
  PB.playbackInit({ pickGuest: () => { guestSelections += 1; return null; } });
  for (const roomId of ['main_b3', 'lux_nova']) {
    PB.beginTake(roomId, { x: 1, y: 2 }); PB.startTapeTake(roomId);
    PB.finishTapeTake(roomId, { elapsed: 45, tapeElapsed: 45, completed: true });
  }
  const ordinaryBefore = ordinaryTakeCount(PB.takeRoomIds()), guestBefore = guestSelections;
  const descriptor = { roomId: TOWER_PERSONAL_TAKE, durationSeconds: TOWER_PERSONAL_SECONDS,
    place: { label: 'The prior contractor’s recording' }, discrete: [
      { cueId: TOWER_PERSONAL_CUE, atSec: 0, gain: .8, provenance: { recording: 'prior-contractor' } },
      { cueId: 'recorded-chair', atSec: 11.7, gain: .25 },
    ] };
  const received = PB.archiveAuthoredTake(descriptor), end = PB.tapeTransport().endSeconds;
  assert.equal(received.status, 'archived');
  assert.equal(received.authored, true);
  assert.equal(received.counted, false);
  assert.equal(received.guest, null);
  assert.equal(guestSelections, guestBefore, 'receipt never rolls a catalogue guest');
  assert.equal(PB.hasTake(TOWER_PERSONAL_TAKE), true);
  assert.equal(PB.archiveAuthoredTake(descriptor), received);
  assert.equal(PB.tapeTakes().length, 3);
  assert.equal(PB.tapeTransport().endSeconds, end, 'repeated receipt cannot append more tape');
  assert.equal(ordinaryTakeCount(PB.takeRoomIds()), ordinaryBefore);
  assert.deepEqual(PB.takeRoomIds(), ['main_b3', 'lux_nova']);
  const saved = JSON.parse(JSON.stringify(PB.serializeTakes()));
  const replay = (context) => {
    const cues = [];
    PB.playbackInit({ ctx: context, bus: {}, scheduleDiscrete: (cueId, when, options) => cues.push({ cueId, when, gain: options.gain, pan: options.pan }) });
    assert.ok(PB.playTake(TOWER_PERSONAL_TAKE, { atHead: true }));
    const material = context.sources.find((source) => source.buffer?.duration === TOWER_PERSONAL_SECONDS);
    assert.ok(material, 'the archived cue resolves to actual recorded PCM');
    assert.equal(material.loop, false);
    assert.equal(material.started.offset, 0);
    const result = { hash: pcmHash(material.buffer), start: material.started, cues };
    PB.stopPlayback(); return result;
  };
  const before = replay(audioContext());
  PB.loadTakes(saved);
  assert.equal(PB.takeFor(TOWER_PERSONAL_TAKE).authored, true);
  assert.equal(PB.takeFor(TOWER_PERSONAL_TAKE).counted, false);
  assert.deepEqual(PB.takeFor(TOWER_PERSONAL_TAKE).discrete, received.discrete);
  assert.equal(PB.archiveAuthoredTake(descriptor), PB.takeFor(TOWER_PERSONAL_TAKE));
  assert.equal(PB.tapeTakes().length, 3);
  assert.equal(PB.tapeTransport().endSeconds, end);
  assert.equal(ordinaryTakeCount(PB.takeRoomIds()), ordinaryBefore);
  assert.deepEqual(replay(audioContext()), before, 'reload replays the same PCM and discrete cue timing/gains');
  assert.equal(guestSelections, guestBefore);
  PB.loadTakes([]);
});

test('receiving the recording cannot interrupt an open player take', () => {
  PB.loadTakes([]);
  PB.beginTake('main_b3', { x: 1, y: 2 }); PB.startTapeTake('main_b3'); PB.advanceTape('main_b3', 9);
  const before = PB.tapeTransport();
  assert.equal(PB.archiveAuthoredTake({ roomId: TOWER_PERSONAL_TAKE, durationSeconds: TOWER_PERSONAL_SECONDS }), null);
  assert.deepEqual(PB.tapeTransport(), before);
  assert.equal(PB.hasOpenTake(), true);
  assert.equal(PB.hasTake(TOWER_PERSONAL_TAKE), false);
  PB.abortTake('main_b3'); PB.loadTakes([]);
});
