import test from 'node:test';
import assert from 'node:assert/strict';
import { coastalMemoryRecordingBuffer, loadCoastalMemoryRecording, playCoastalMemoryRecording, createCoastalMemoryAudio,
  COASTAL_MEMORY_CUE, COASTAL_MEMORY_TAKE, COASTAL_MEMORY_SECONDS, COASTAL_MEMORY_AUDIO_PROVENANCE } from '../src/audio/coastal-memory.js';
import { MUSIC_BOX_REFERENCE } from '../src/data/music-box-reference.js';
import { createCoastalWindingAudio } from '../src/audio/coastal-memory-winding.js';
import { beginCoastalMemory, stepCoastalMemory } from '../src/game/coastal-memory.js';
import { musicBoxContext, musicBoxFetcher, musicBoxUrl, flushAudio } from './helpers/music-box-audio-context.mjs';

const layout = { spawn: { feet: 28 }, musicBox: { x: 27, y: 28.8, z: 43 }, listenRadius: 5.4 };
const pose = { x: 25.9, z: 43, feet: 28, yaw: Math.PI / 2, pitch: -.3 };
const state = { active: true, status: 'active', recordingOffset: 0, pose };
const make = (extra = {}) => { const context = musicBoxContext(); return { context,
  audio: createCoastalMemoryAudio({ context, destination: context.destination, layout, fetcher: musicBoxFetcher, urlFor: musicBoxUrl, ...extra }) }; };
const near = (audio, extra = {}) => audio.update({ state, pose, recorderHeld: true, ...extra });
const equal = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ~= ${expected}`);

test('coastal authored recording decodes the real shared performance without a procedural substitute', async () => {
  const context = musicBoxContext(); assert.equal(coastalMemoryRecordingBuffer(context), null);
  const buffer = await loadCoastalMemoryRecording(context, { fetcher: musicBoxFetcher, urlFor: musicBoxUrl });
  assert.strictEqual(coastalMemoryRecordingBuffer(context), buffer);
  assert.equal(buffer.duration, MUSIC_BOX_REFERENCE.durationSeconds); equal(COASTAL_MEMORY_SECONDS, 46.3);
  assert.equal(COASTAL_MEMORY_AUDIO_PROVENANCE.kind, 'user-recorded-pcm');
  assert.equal(COASTAL_MEMORY_TAKE, 'coastal-memory-musicbox'); assert.equal(COASTAL_MEMORY_CUE, 'coastal.memory.musicbox');
});

test('direct authored-tape playback shares the exact decoded buffer, wraps offsets and cancels idempotently', async () => {
  const context = musicBoxContext(); context.currentTime = 4;
  const buffer = await loadCoastalMemoryRecording(context, { fetcher: musicBoxFetcher, urlFor: musicBoxUrl });
  const recording = playCoastalMemoryRecording({ context, destination: context.destination, when: 3, gain: 9, loop: true,
    offset: COASTAL_MEMORY_SECONDS + 3.25, fetcher: musicBoxFetcher, urlFor: musicBoxUrl });
  await recording.ready; assert.strictEqual(recording.source.buffer, buffer);
  assert.deepEqual(recording.source.starts, [{ at: 4, offset: 3.25 }]); assert.equal(recording.out.gain.value, 2);
  const source = recording.source; recording.stop(); recording.stop(); assert.equal(source.stops, 1);
  assert.equal(recording.out.disconnected, true);
});

test('the untouched coastal box stays silent: wind and sea cannot manufacture listening evidence', async () => {
  const { audio, context } = make(); await audio.initialize({ state, pose, recorderHeld: true });
  assert.equal(context.sources.length, 1); assert.equal(context.sources[0].buffer.duration, 4);
  assert.equal(context.decodes, 0, 'ambient ownership never loads or autoplays the box');
  context.currentTime = 30;
  const value = audio.sample(); assert.equal(value.audibleSeconds, 0);
  assert.equal(value.sourceReady, false); assert.equal(value.audioRunning, false);
  near(audio); assert.equal(context.sources.length, 1); audio.dispose();
});

test('coastal ambience pauses and resumes cleanly while preserving the handled recording offset', async () => {
  const { audio, context } = make(); await audio.initialize({ state: { ...state, recordingOffset: 5 }, pose });
  context.currentTime = 1; audio.setPaused(true); context.currentTime = 8;
  equal(audio.sample().recordingOffset, 5); assert.equal(audio.sample().audibleSeconds, 0);
  audio.setPaused(false); assert.deepEqual(context.sources[1].starts, [{ at: 8, offset: 1 }]);
  assert.equal(audio.sample().sourceReady, false); audio.dispose(); audio.dispose();
  assert.ok(context.sources.every(source => source.stops === 1));
});

test('hidden, interrupted and unavailable rendering start neither ambience nor an instrument', async () => {
  for (const extra of [{ hidden: true }, { interrupted: true }, { renderReady: false }, { paused: true }]) {
    const { audio, context } = make(); await audio.initialize({ state, pose, recorderHeld: true, ...extra });
    context.currentTime = 20; assert.equal(audio.sample().audibleSeconds, 0);
    assert.equal(audio.sample().sourceReady, false); assert.equal(context.sources.length, 0); audio.dispose();
  }
});

test('nine actually played handled seconds earn the existing coastal receipt; untouched ambience earns none', async () => {
  const plan = { ...layout, spawn: pose, pierReturnPlane: { point: { x: 10, z: 79 }, normal: { x: 0, z: 1 } } };
  const { audio, context } = make({ layout: plan });
  let coast = beginCoastalMemory(null, { layout: plan, runId: 'recorded-box', returnPose: { x: 1, y: -4000 } });
  await audio.initialize({ state: coast, pose: coast.pose, recorderHeld: true });
  context.currentTime = 10;
  coast = stepCoastalMemory(coast, { dt: .1, recorderHeld: true, ...audio.sample() }, { layout: plan }).state;
  assert.equal(coast.listenedSeconds, 0);
  const hands = createCoastalWindingAudio({ context, destination: context.destination, fetcher: musicBoxFetcher, urlFor: musicBoxUrl });
  await hands.initialize(); hands.setPaused(false);
  hands.update({ state: { phase: 'cranking', playbackSeconds: 0, playbackRate: 1 }, events: [] });
  for (let tick = 1; tick <= 91; tick++) {
    context.currentTime = 10 + tick / 10;
    hands.update({ state: { phase: 'cranking', playbackSeconds: tick / 10, playbackRate: 1 }, events: [] });
    coast = stepCoastalMemory(coast, { dt: .1, recorderHeld: true, ...hands.sample() }, { layout: plan }).state;
    if (tick === 89) assert.equal(coast.recordingHeard, false);
  }
  assert.equal(coast.recordingHeard, true); assert.equal(coast.recordingReceipt.cueId, COASTAL_MEMORY_CUE);
  assert.equal(coast.recordingReceipt.takeId, COASTAL_MEMORY_TAKE); assert.equal(coast.rewardEarned, false);
  hands.dispose(); audio.dispose();
});
