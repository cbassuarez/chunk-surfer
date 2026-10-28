import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as REC from '../src/game/recordist.js';
import * as PB from '../src/game/playback.js';
import { createRecordingPressurePerformance } from '../src/game/recording-pressure.js';
import { armTakeHunter, freshTakeHunter, stepTakeHunter, takeHunterTransport,
  tryCancelTake } from '../src/game/take-hunter.js';
import { playRecordingPressure, renderRecordingPressurePCM } from '../src/audio/recording-pressure.js';

class Param {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class AudioNode {
  constructor() {
    this.gain = new Param(1); this.pan = new Param(); this.frequency = new Param();
    this.Q = new Param(); this.playbackRate = new Param(1);
    this.connections = []; this.stops = []; this.disconnected = false;
  }
  connect(destination) { this.connections.push(destination); return destination; }
  disconnect() { this.disconnected = true; }
  start(when) { this.startedAt = when; }
  stop(when) { this.stops.push(when); }
}
class AudioContext {
  constructor() { this.sampleRate = 8000; this.currentTime = 10; this.state = 'running'; this.sources = []; this.oscillators = []; }
  createBuffer(channels, length, rate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate: rate, numberOfChannels: channels, duration: length / rate,
      getChannelData: channel => data[channel] };
  }
  createBufferSource() { const source = new AudioNode(); this.sources.push(source); return source; }
  createGain() { return new AudioNode(); }
  createBiquadFilter() { return new AudioNode(); }
  createStereoPanner() { return new AudioNode(); }
  createOscillator() { const oscillator = new AudioNode(); this.oscillators.push(oscillator); return oscillator; }
}

const copy = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ~= ${expected}`);
function reset() {
  REC.stopRecording(); REC.stopListening(); REC.setTakeSink(null);
  REC.configureDifficulty({ takeSecondsScale: 1 }); REC.loadRecState({});
  PB.stopPlayback(); PB.loadTakes([]);
  const context = new AudioContext(), fallback = [];
  PB.playbackInit({ ctx: context, bus: context.createGain(), pickGuest: () => null,
    chunkById: () => null, chunkByKey: () => null,
    scheduleDiscrete: (cueId, when, options) => fallback.push({ cueId, when, options }) });
  return { context, fallback };
}

// Execute the production helper against the real recorder and tape store. This
// catches choosing a previous sealed take from history instead of the open one.
function productionFrame(hunter = freshTakeHunter()) {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const helper = source.match(/function recordingPressureFrame\(\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper, 'the production frame boundary remains inspectable');
  return vm.runInNewContext(`(${helper})`, { REC, PB, takeRoom: 'main_b3',
    currentWorld: () => 'main_b3', getSave: () => ({ run: { id: 'run:pressure-test' } }),
    TUT: { tutorialActive: () => false }, takeHunter: hunter })();
}

function openTake({ slate = true } = {}) {
  assert.equal(REC.startListening(), true);
  assert.equal(REC.startRecording({ slate }), true);
  PB.beginTake('main_b3', { x: 15, y: 12 });
  const take = PB.startTapeTake('main_b3', slate ? { text: 'Studio B3. Take.', atSeconds: 0 } : null);
  return { take, advance(seconds) {
    REC.tickRecording(seconds);
    PB.advanceTape('main_b3', REC.recState().takeTapeElapsed);
  } };
}

test('production pressure frames use the open take, run identity and physical slate/held time', () => {
  reset();
  const first = openTake();
  assert.equal(PB.tapeTakes().length, 0, 'an open attempt is not sealed history');
  first.advance(3.25); REC.finishSlate(); first.advance(4.125);
  REC.stallTake(); first.advance(6.75); REC.resumeTake(); first.advance(2.0625);
  const current = productionFrame();
  assert.equal(current.takeId, `run:pressure-test:${first.take.id}`);
  assert.equal(current.atSec, 16.1875);
  assert.equal(REC.recState().takeElapsed, 6.1875);
  assert.equal(current.recording, true);
  PB.finishTapeTake('main_b3', REC.stopRecording());
  const second = openTake({ slate: false });
  assert.equal(PB.tapeTakes().at(-1).id, first.take.id);
  assert.equal(productionFrame().takeId, `run:pressure-test:${second.take.id}`,
    'a second attempt cannot borrow the previous tape identity');
  PB.finishTapeTake('main_b3', REC.stopRecording());
});

test('accepted, abandoned and spoiled attempts retain actual pressure PCM events and original physical timing after reload', () => {
  const { context } = reset();
  const live = [];
  for (const status of ['abandoned', 'spoiled', 'accepted']) {
    const attempt = openTake();
    const performance = createRecordingPressurePerformance({ emit(event) {
      const voice = playRecordingPressure({ context, destination: context.createGain(), cueId: event.kind,
        gain: .7, pan: -.3 });
      if (!voice) return false;
      live.push({ event, pcm: voice.source.buffer.getChannelData(0) });
      PB.noteDiscrete(event.roomId, { cueId: event.kind, atSec: event.atSec, gain: .7, pan: -.3,
        provenance: { system: 'recording-pressure', eventId: event.eventId, takeId: event.takeId,
          cause: event.cause, tries: event.tries, needs: event.needs } });
      return true;
    } });
    attempt.advance(3.25); REC.finishSlate(); attempt.advance(4.125);
    REC.stallTake(); attempt.advance(6.75); REC.resumeTake(); attempt.advance(2.0625);
    let hunter = armTakeHunter(freshTakeHunter(), { cause: 'case', roll: 0 });
    performance.update(productionFrame(hunter));
    for (let tick = 0; tick < 120 && takeHunterTransport(hunter).phase !== 'seized'; tick += 1) {
      attempt.advance(.25);
      hunter = stepTakeHunter(hunter, .25, { recording: true, heard: .3 }).state;
      performance.update(productionFrame(hunter));
    }
    assert.equal(takeHunterTransport(hunter).phase, 'seized');
    hunter = tryCancelTake(hunter).state;
    performance.stopPress(productionFrame(hunter));
    for (let tick = 0; tick < 18; tick += 1) {
      attempt.advance(.1);
      hunter = stepTakeHunter(hunter, .1, { recording: true, heard: 0 }).state;
      performance.update(productionFrame(hunter));
    }
    attempt.advance(.5);
    if (status === 'accepted') attempt.advance(REC.minimumTakeDuration() - REC.recState().takeElapsed);
    if (status === 'spoiled') REC.spoilTake('test interruption');
    const result = REC.stopRecording();
    const sealed = PB.finishTapeTake('main_b3', result);
    performance.update({ ...productionFrame(hunter), recording: false });
    assert.equal(sealed.status, status);
    assert.deepEqual(sealed.discrete.map(e => e.cueId),
      ['recording.answer', 'recording.drag', 'recording.brake', 'recording.release']);
    assert.equal(sealed.discrete[0].atSec, 16.1875, 'slate and held tape are present in the first event time');
    assert.ok(sealed.discrete.every(event => event.atSec <= result.tapeElapsed));
    assert.equal(sealed.durationSeconds, result.tapeElapsed);
    if (status === 'accepted') near(sealed.durationSeconds, 55);
  }
  const saved = copy(PB.serializeTakes());
  PB.loadTakes(saved);
  assert.deepEqual(PB.serializeTakes(), saved);
  assert.deepEqual(PB.tapeTakes().map(take => take.status), ['abandoned', 'spoiled', 'accepted']);
  assert.deepEqual(PB.takeRoomIds(), ['main_b3']);

  for (const take of PB.tapeTakes()) {
    const replay = new AudioContext(), fallback = [];
    PB.playbackInit({ ctx: replay, bus: replay.createGain(),
      scheduleDiscrete: cueId => fallback.push(cueId) });
    const playing = PB.playTake(take.id, { atHead: true });
    assert.ok(playing);
    const voices = playing.nodes.filter(node => node.cueId?.startsWith('recording.'));
    assert.equal(voices.length, 4, 'real production playback resolves every stored cue to its shared PCM');
    assert.deepEqual(fallback, [], 'pressure cues never fall through to unrelated discrete synthesis');
    for (let index = 0; index < voices.length; index += 1) {
      const voice = voices[index], event = take.discrete[index];
      near(voice.startedAt, playing.startedAt + event.atSec);
      assert.equal(voice.out.gain.value, .7); assert.equal(voice.panner.pan.value, -.3);
      assert.deepEqual(voice.source.buffer.getChannelData(0),
        renderRecordingPressurePCM(event.cueId, { sampleRate: replay.sampleRate }).channels[0]);
      const original = live.find(row => row.event.eventId === event.provenance.eventId);
      assert.ok(original);
      assert.deepEqual(voice.source.buffer.getChannelData(0), original.pcm, 'the live event and saved event use the same master');
      assert.equal(event.provenance.takeId, `run:pressure-test:${take.id}`);
    }
    PB.stopPlayback();
  }
});

test('an early quiet STOP leaves no invented pressure event on a replayable abandoned take', () => {
  const { context, fallback } = reset();
  const attempt = openTake({ slate: false });
  let unearnedEvents = 0;
  const performance = createRecordingPressurePerformance({ emit: () => { unearnedEvents += 1; return false; } });
  attempt.advance(4.25);
  performance.update(productionFrame());
  performance.stopPress(productionFrame());
  const sealed = PB.finishTapeTake('main_b3', REC.stopRecording());
  performance.update({ ...productionFrame(), recording: false });
  assert.equal(unearnedEvents, 0, 'the quiet take never requests a pressure sound');
  PB.loadTakes(copy(PB.serializeTakes()));
  assert.deepEqual(PB.tapeTake(sealed.id).discrete, []);
  const playing = PB.playTake(sealed.id, { atHead: true });
  assert.ok(playing);
  assert.deepEqual(playing.nodes.filter(node => node.cueId), []);
  assert.deepEqual(fallback, []);
  assert.equal(context.sources.filter(source => !source.loop).length, 0);
  PB.stopPlayback();
});

test('production playback STOP cuts a future pressure cue before its scheduled onset', () => {
  const { context } = reset();
  PB.beginTake('main_b3', {}); PB.startTapeTake('main_b3');
  PB.noteDiscrete('main_b3', { cueId: 'recording.drag', atSec: 20.125, gain: .8, pan: .1,
    provenance: { eventId: 'run:pressure-test:take:1:drag' } });
  PB.finishTapeTake('main_b3', { elapsed: 45, tapeElapsed: 55, completed: true });
  const playing = PB.playTake('take:1', { atHead: true });
  const voice = playing.nodes.find(node => node.cueId === 'recording.drag');
  assert.ok(voice);
  near(voice.startedAt, playing.startedAt + 20.125);
  context.currentTime = playing.startedAt + 1;
  PB.stopPlayback();
  assert.deepEqual(voice.source.stops, [context.currentTime]);
  assert.equal(voice.ended, true);
  assert.ok(voice.nodes.every(node => node.disconnected));
  context.currentTime += 40;
  assert.equal(PB.tickPlayback(), 'idle');
  assert.equal(PB.isPlaying(), false);
});

test('the original tenor-bell fallback still renders alongside a saved pressure cue', async () => {
  // A fresh production module has no injected generic scheduler, exercising
  // the actual legacy bell renderer rather than reimplementing it in a mock.
  const legacy = await import('../src/game/playback.js?recording-pressure-legacy-bell');
  const context = new AudioContext();
  legacy.playbackInit({ ctx: context, bus: context.createGain(), pickGuest: () => null });
  legacy.beginTake('main_b3', {}); legacy.startTapeTake('main_b3');
  legacy.noteDiscrete('main_b3', { cueId: 'recording.answer', atSec: 4.25, gain: .6, pan: -.2 });
  legacy.noteDiscrete('main_b3', { cueId: 'bell.tenor.clock', atSec: 7.5, gain: .9, pan: .4 });
  legacy.finishTapeTake('main_b3', { elapsed: 45, tapeElapsed: 45, completed: true });
  legacy.loadTakes(copy(legacy.serializeTakes()));
  const playing = legacy.playTake('take:1', { atHead: true });
  const pressure = playing.nodes.find(node => node.cueId === 'recording.answer');
  assert.ok(pressure);
  assert.equal(context.oscillators.length, 1);
  assert.equal(context.oscillators[0].frequency.value, 233.08);
  near(context.oscillators[0].startedAt, playing.startedAt + 7.5);
  near(pressure.startedAt, playing.startedAt + 4.25);
  legacy.stopPlayback();
  assert.ok(context.oscillators[0].disconnected);
  assert.equal(pressure.ended, true);
});
