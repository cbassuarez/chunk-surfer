import test from 'node:test';
import assert from 'node:assert/strict';
import * as PB from '../src/game/playback.js';
import { claimSourceRecording, recoverSourceRecording, sourceRecordingHeld, sourceRecordingTakeKey } from '../src/game/source-recording-custody.js';

class Param { constructor(value = 0) { this.value = value; } setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; } exponentialRampToValueAtTime(value) { this.value = value; } cancelScheduledValues() {} }
class AudioNode { constructor() { this.gain = new Param(1); this.frequency = new Param(); this.pan = new Param(); this.playbackRate = new Param(1); }
  connect(node) { return node; } disconnect() {} start() { this.started = true; } stop() { this.stopped = true; } }
class AudioContext { constructor() { this.sampleRate = 8000; this.currentTime = 10; this.sources = []; }
  createBuffer(channels, length, rate) { const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / rate, getChannelData: channel => data[channel] }; }
  createBufferSource() { const source = new AudioNode(); this.sources.push(source); return source; }
  createGain() { return new AudioNode(); } createBiquadFilter() { return new AudioNode(); } createStereoPanner() { return new AudioNode(); } }

const target = { chapter: 'II', locationId: 'source-ii-recording-return', chartId: 0, x: 3, z: -20, feet: 4.2 };
const rows = () => [{ roomId: 'attempt', durationSeconds: 6.317, status: 'abandoned', counted: false },
  { roomId: 'main_b3', durationSeconds: 60.173, status: 'accepted', counted: true,
    audible: [], guest: null, slate: { text: 'Actual slate', key: 'slate:original' }, discrete: [] }];
function reset() {
  PB.setTakeAccessGate(null); PB.setTransportGate(null); PB.stopPlayback(); PB.loadTakes(rows());
  const context = new AudioContext();
  PB.playbackInit({ ctx: context, bus: context.createGain(), pickGuest: () => null, chunkById: () => null,
    chunkByKey: () => null, onTransport: () => ({ stop() {} }), scheduleDiscrete: () => {}, onPlaybackError: () => {} });
  return context;
}
const withhold = () => claimSourceRecording(null, { runId: 'night:actual-tape', chapter: 'I', contactId: 'contact:one',
  takes: PB.serializeTakes(), destination: target });
test.afterEach(() => { PB.stopPlayback(); PB.setTakeAccessGate(null); PB.setTransportGate(null); PB.loadTakes([]); });

test('custody survives the actual physical tape serializer/reloader without changing its head, job projection, slate or source rows', () => {
  reset();
  const before = PB.serializeTakes(), transport = PB.tapeTransport(), job = PB.takeRoomIds();
  const held = withhold(), originalKey = sourceRecordingTakeKey(PB.tapeTake('take:2'));
  assert.equal(held.reason, 'taken');
  assert.deepEqual(PB.serializeTakes(), before);
  assert.deepEqual(PB.tapeTransport(), transport);
  assert.deepEqual(PB.takeRoomIds(), job);
  PB.loadTakes(JSON.parse(JSON.stringify(PB.serializeTakes())));
  assert.equal(sourceRecordingTakeKey(PB.tapeTake('take:2')), originalKey);
  assert.equal(sourceRecordingHeld(held.state, PB.tapeTake('take:2'), { runId: 'night:actual-tape' }), true);
  assert.deepEqual(PB.serializeTakes(), before);
});

test('actual direct playback refuses a held interval without seeking, emitting audio or erasing accepted work; recovery restores access', () => {
  const context = reset(), held = withhold(); let custody = held.state;
  PB.setTakeAccessGate(take => sourceRecordingHeld(custody, take) ? { allowed: false, message: 'Find the recording in Source II.' } : true);
  const transport = PB.tapeTransport(), before = PB.serializeTakes();
  assert.equal(PB.playTake('take:2'), null);
  assert.equal(PB.playbackError().code, 'SOURCE_TAKE_MISSING');
  assert.equal(PB.isPlaying(), false);
  assert.equal(context.sources.length, 0);
  assert.deepEqual(PB.tapeTransport(), transport);
  assert.deepEqual(PB.serializeTakes(), before);
  assert.deepEqual(PB.takeRoomIds(), ['main_b3']);
  custody = recoverSourceRecording(custody, { receiptId: held.recording.id, chapter: 'II', locationId: target.locationId }).state;
  assert.ok(PB.playTake('take:2', { atHead: true }));
  assert.ok(context.sources.some(node => node.started));
});

test('queued seek rechecks current custody before playing, so a previously permitted seek cannot expose a now-held recording', () => {
  const context = reset(); let custody = null;
  PB.setTakeAccessGate(take => !sourceRecordingHeld(custody, take));
  const seek = PB.playTake('take:2');
  assert.ok(seek?.then);
  custody = withhold().state;
  context.currentTime += seek.seconds + .01;
  PB.tickPlayback();
  assert.equal(PB.isPlaying(), false);
  assert.equal(PB.playbackError().code, 'SOURCE_TAKE_MISSING');
  assert.equal(context.sources.length, 0);
  assert.deepEqual(PB.takeRoomIds(), ['main_b3']);
});

test('the explicitly readonly archive can replay the preserved original while custody and the active tape remain unchanged', () => {
  const context = reset(), held = withhold(), original = PB.serializeTakes().at(-1);
  PB.setTakeAccessGate(take => !sourceRecordingHeld(held.state, take));
  const transport = PB.tapeTransport(), before = PB.serializeTakes();
  assert.equal(PB.playTake(original.id, { atHead: true }), null);
  const archived = PB.playArchivedTake(original);
  assert.ok(archived);
  assert.equal(PB.archivedPlaybackActive(), true);
  assert.ok(context.sources.some(node => node.started));
  context.currentTime += 3; PB.tickPlayback(); PB.stopPlayback();
  assert.deepEqual(PB.tapeTransport(), transport);
  assert.deepEqual(PB.serializeTakes(), before);
  assert.equal(sourceRecordingHeld(held.state, PB.tapeTake(original.id)), true, 'archive preview is not in-world recovery');
});
