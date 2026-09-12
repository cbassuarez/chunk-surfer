import test from 'node:test';
import assert from 'node:assert/strict';
import * as REC from '../src/game/recordist.js';
import * as PB from '../src/game/playback.js';
import { ROOM_TONE } from '../src/config.js';
import { fieldKitEffects } from '../src/game/field-kit.js';

const close = (a, b, message = '') => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}: ${message}`);
const configure = (kit = {}, difficulty = {}) => {
  const effects = fieldKitEffects(kit);
  REC.configureDifficulty({ spoilNoiseScale: 1, minorNoise: 'spoil', pauseSeconds: 0,
    spoilToleranceScale: effects.spoilToleranceScale, recordingNoiseScale: effects.recordingNoiseScale,
    takeSecondsScale: effects.takeDurationScale, torchDrainScale: effects.torchDrainScale * effects.flashlightDrainScale, ...difficulty });
};
const reset = (kit = {}, difficulty = {}) => {
  if (REC.isRecording()) REC.stopRecording();
  if (REC.isListening()) REC.stopListening();
  if (REC.lightOn()) REC.toggleLight();
  REC.loadRecState({ injuries: 0, battery: 1, takes: [] });
  REC.decayNoise(100);
  REC.setLoudNoiseSink(null);
  REC.setAcousticEmitter(null);
  configure(kit, difficulty);
};
const roll = () => { assert.equal(REC.startListening(), true); assert.equal(REC.startRecording(), true); };

test('reference hardware preserves actual spoil, duration, and progress behavior', () => {
  reset(); roll();
  close(REC.takeDuration(), ROOM_TONE.takeSeconds);
  assert.equal(REC.tickRecording(ROOM_TONE.takeSeconds / 2), 'running');
  close(REC.takeProgress(), .5);
  assert.equal(REC.tickRecording(ROOM_TONE.takeSeconds / 2), 'complete');
  assert.equal(REC.stopRecording().completed, true);
  reset(); roll(); REC.emitNoise(.2, 1, 2, 'test');
  assert.equal(REC.tickRecording(.1), 'spoiled');
  assert.equal(REC.stopRecording().completed, false);
});

test('directional and wide microphones change actual spoil decisions, not raw acoustics or HUSH hearing', () => {
  for (const [level, expected] of [[.17, { reference: false, directional: false, wide: true }],
    [.2, { reference: true, directional: false, wide: true }]]) {
    const heard = [];
    for (const microphone of ['reference', 'directional', 'wide']) {
      reset({ microphone });
      const events = [], hunters = [];
      REC.setAcousticEmitter((event) => events.push(event));
      REC.setLoudNoiseSink((rawLevel, reason, meta) => hunters.push({ level: rawLevel, reason, ...meta }));
      roll(); REC.emitNoise(level, 1, 2, 'test', { kind: 'paper_rustle', sourceKind: 'player', sourceId: 'test' });
      close(REC.currentNoise(), level, 'world envelope must not be multiplied');
      assert.equal(REC.tickRecording(.1) === 'spoiled', expected[microphone]);
      close(REC.takeEvents()[0].level, level * fieldKitEffects({ microphone }).recordingNoiseScale);
      heard.push({ acoustic: events[0], hunter: hunters[0] });
    }
    assert.deepEqual(heard[0], heard[1]);
    assert.deepEqual(heard[0], heard[2]);
  }
});

test('hardware does not lower the world threshold that arms a hunter', () => {
  for (const kit of [{}, { microphone: 'wide', recorder: 'low-draw' }, { microphone: 'directional', recorder: 'headroom' }]) {
    reset(kit);
    const hunters = [];
    REC.setLoudNoiseSink((level) => hunters.push(level));
    roll(); REC.emitNoise(.044, 1, 2, 'below world threshold');
    assert.deepEqual(hunters, []);
    REC.emitNoise(.046, 1, 2, 'above world threshold');
    assert.deepEqual(hunters, [.046]);
  }
});

test('scaled recording input, overload mark, and raw-world catch mark agree on meter coordinates', () => {
  reset({ microphone: 'directional', recorder: 'headroom' });
  const marks = REC.noiseMarks();
  close(marks.find((m) => m.kind === 'spoil').level, ROOM_TONE.spoilNoise * 1.1);
  close(marks.find((m) => m.kind === 'catch').level, REC.recordingInputLevel(ROOM_TONE.catchNoise));
  roll(); REC.emitNoise(.22, 1, 2, 'test');
  assert.equal(REC.tickRecording(.1), 'running');
  assert.equal(REC.takeEvents()[0].kind, 'near');
  reset({ microphone: 'wide', recorder: 'low-draw' }); roll();
  REC.emitNoise(.15, 1, 2, 'test');
  assert.equal(REC.tickRecording(.1), 'spoiled');
});

test('microphone length changes actual completion and remains latched for each rolling take', () => {
  for (const microphone of ['reference', 'directional', 'wide']) {
    reset({ microphone }); roll();
    const duration = ROOM_TONE.takeSeconds * fieldKitEffects({ microphone }).takeDurationScale;
    close(REC.takeDuration(), duration);
    assert.equal(REC.tickRecording(duration / 2), 'running'); close(REC.takeProgress(), .5);
    REC.configureDifficulty({ takeSecondsScale: .8 });
    close(REC.takeDuration(), duration, 'changing config cannot rewrite a rolling take');
    assert.equal(REC.tickRecording(duration / 2), 'complete'); close(REC.takeProgress(), 1);
    const result = REC.stopRecording();
    assert.equal(result.completed, true); close(result.durationSeconds, duration);
    close(REC.takeDuration(), ROOM_TONE.takeSeconds * .8, 'new config applies to the next roll');
  }
});

test('held takes and explicit actions retain their authored rules under every hardware variant', () => {
  reset({ microphone: 'directional', recorder: 'headroom' }); roll();
  REC.stallTake(); REC.emitNoise(.9, 1, 2, 'permitted return');
  assert.equal(REC.tickRecording(20), 'stalled'); close(REC.takeProgress(), 0);
  REC.resumeTake(); assert.equal(REC.tickRecording(1), 'running');
  REC.toggleLight(); assert.equal(REC.tickRecording(1), 'spoiled', 'reaching for the light remains an unconditional break');
  reset({ microphone: 'wide' }); roll();
  REC.emitNoise(.9, 1, 2, 'weather', { spoils: false, sourceKind: 'environment' });
  assert.equal(REC.tickRecording(1), 'running', 'weather does not become take contamination');
  reset({ microphone: 'wide' }, { minorNoise: 'pause', pauseSeconds: .7 }); roll();
  REC.emitNoise(.18, 1, 2, 'small noise');
  assert.equal(REC.isAssistPaused(), true, 'Story pause assistance remains effective');
  assert.equal(REC.recState().spoiled, false);
});

test('recorder shared-cell sidegrades affect real battery drain', () => {
  for (const recorder of ['reference', 'low-draw', 'headroom']) {
    reset({ recorder }); REC.toggleLight(); REC.drainLight(72);
    close(REC.batteryLevel(), 1 - .1 * fieldKitEffects({ recorder }).torchDrainScale);
  }
});

test('all amp and flashlight combinations compose in actual battery drain',()=>{
  for(const recorder of ['reference','low-draw','headroom'])for(const flashlight of ['reference','throw','flood']){
    const kit={recorder,flashlight},effects=fieldKitEffects(kit);
    reset(kit);REC.toggleLight();REC.drainLight(72);
    close(REC.batteryLevel(),1-.1*effects.torchDrainScale*effects.flashlightDrainScale,`${recorder}/${flashlight}`);
  }
  reset();
});

test('invalid hardware scalars remain finite and cannot create an impossible take', () => {
  for (const value of [NaN, Infinity, -Infinity, -4, 0, 999, .00001]) {
    reset({}, { takeSecondsScale: value, recordingNoiseScale: value, spoilToleranceScale: value });
    assert.ok(REC.takeDuration() >= ROOM_TONE.takeSeconds * .8 && REC.takeDuration() <= ROOM_TONE.takeSeconds * 1.2);
    assert.ok(REC.recordingInputLevel(.2) >= .16 && REC.recordingInputLevel(.2) <= .24);
    assert.ok(Number.isFinite(REC.spoilThreshold()));
  }
});

test('saved tapes keep source duration and normalize their location marks against that duration', () => {
  PB.loadTakes([]);
  for (const seconds of [40.5, 45, 49.5]) {
    const id = `duration-${seconds}`;
    PB.beginTake(id, { x: 1, y: 2 }, { durationSeconds: seconds });
    PB.noteDiscrete(id, { cueId: 'test', atSec: seconds / 2 });
    PB.notePresence(id, .6, seconds / 4);
    PB.sealTake(id);
    close(PB.takeMarks(id).find((m) => m.kind === 'event').at, .5);
    close(PB.takeMarks(id).find((m) => m.kind === 'presence').at, .25);
    close(PB.takeMarks(id, { seconds: seconds * 2 }).find((m) => m.kind === 'event').at, .25);
  }
  const saved = JSON.parse(JSON.stringify(PB.serializeTakes()));
  PB.loadTakes(saved);
  assert.deepEqual(PB.serializeTakes(), saved);
  for (const take of saved) close(PB.takeFor(take.roomId).durationSeconds, take.durationSeconds);
  PB.loadTakes([{ roomId: 'legacy', discrete: [{ cueId: 'old', atSec: 22.5 }] }]);
  close(PB.takeFor('legacy').durationSeconds, 45);
  close(PB.takeMarks('legacy')[0].at, .5);
  PB.adoptLegacyTakes({ roomIds: ['bare-legacy'] });
  close(PB.takeFor('bare-legacy').durationSeconds, 45);
});

test('guest timing and playback telemetry use each take’s recorded length, not the current kit', () => {
  const reference = PB.guestShape({ peak: .7, atSec: 22.5 });
  for (const durationSeconds of [40.5, 45, 49.5]) {
    assert.deepEqual(PB.guestShape({ peak: .7, atSec: durationSeconds / 2 }, { durationSeconds }), reference);
    const snapshot = PB.buildPlaybackSnapshot({
      take: { roomId: 'r', durationSeconds, discrete: [{ cueId: 'test', atSec: durationSeconds / 2 }] },
      playing: { startedAt: 1 }, now: 2,
    });
    close(snapshot.durationSec, PB.PLAYBACK.seconds);
    close(snapshot.sourceDurationSec, durationSeconds);
    close(snapshot.markers[0].position, .5);
  }
});

test('actual audio scheduling matches telemetry after a variable-length tape round trip', () => {
  const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ gain: parameter(), frequency: parameter(), Q: parameter(), playbackRate: parameter(), connect() {}, start() {}, stop() {}, disconnect() {} });
  const scheduled = [];
  const ctx = { currentTime: 10, sampleRate: 10, createGain: node, createBufferSource: node, createBiquadFilter: node,
    createBuffer: (_, length) => ({ getChannelData: () => new Float32Array(length) }) };
  PB.playbackInit({ ctx, bus: {}, pickGuest: () => null, scheduleDiscrete: (id, time) => scheduled.push({ id, time }) });
  for (const durationSeconds of [40.5, 49.5]) {
    PB.stopPlayback(); PB.loadTakes([]);
    PB.beginTake('r', {}, { durationSeconds }); PB.noteDiscrete('r', { cueId: 'test', atSec: durationSeconds / 2 }); PB.sealTake('r');
    PB.loadTakes(PB.serializeTakes());
    const seek = PB.playTake('r');
    assert.ok(seek.seconds > 0, 'the transport rewinds to this take');
    ctx.currentTime += seek.seconds+.01;PB.tickPlayback();
    const playing = {startedAt:ctx.currentTime+.05,endsAt:ctx.currentTime+.05+durationSeconds};
    close(scheduled.at(-1).time - playing.startedAt, durationSeconds / 2);
    close(PB.playbackSnapshot().markers[0].position, (scheduled.at(-1).time - playing.startedAt) / durationSeconds);
    close(playing.endsAt - playing.startedAt, durationSeconds);
    PB.stopPlayback(); assert.equal(PB.isPlaying(), false);
  }
  reset(); PB.loadTakes([]);
});
