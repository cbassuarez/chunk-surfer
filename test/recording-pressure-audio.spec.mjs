import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordingPressureCue, renderRecordingPressurePCM, playRecordingPressure } from '../src/audio/recording-pressure.js';
import { createSelfAudioMask, effectiveMicMeasurement } from '../src/audio/self-audio-mask.js';

const ids = ['recording.answer', 'recording.drag', 'recording.brake', 'recording.release'];
class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  setValueAtTime(value, time) { this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.events.push(['ramp', value, time]); }
}
class Node {
  constructor() { this.gain = new Param(); this.pan = new Param(); this.stops = []; this.disconnected = false; }
  connect(value) { this.destination = value; }
  disconnect() { this.disconnected = true; }
  start(time) { this.startedAt = time; }
  stop(time) { this.stops.push(time); }
}
class Context {
  constructor(sampleRate = 48000) { this.sampleRate = sampleRate; this.currentTime = 2; this.created = []; this.bufferCount = 0; }
  createBuffer(channels, length, sampleRate) { this.bufferCount++; const data = Array.from({ length: channels }, () => new Float32Array(length)); return { length, sampleRate, duration: length / sampleRate, getChannelData: channel => data[channel] }; }
  createBufferSource() { const node = new Node(); this.created.push(node); return node; }
  createGain() { return new Node(); }
  createStereoPanner() { return new Node(); }
}

test('every shared master is deterministic, finite, padded and below the headroom cap at supported rates', () => {
  for (const sampleRate of [44100, 48000, 96000]) for (const cueId of ids) {
    const cue = recordingPressureCue(cueId), pcm = renderRecordingPressurePCM(cueId, { sampleRate });
    const samples = pcm.channels[0];
    assert.equal(samples.length, Math.ceil(sampleRate * cue.durationSeconds));
    assert.ok(Math.abs(pcm.durationSeconds - cue.durationSeconds) <= 1 / sampleRate + 1e-12);
    assert.equal(samples[0], 0); assert.equal(samples.at(-1), 0);
    let square = 0, peak = 0, maxStep = 0;
    for (let i = 0; i < samples.length; i++) {
      assert.ok(Number.isFinite(samples[i])); square += samples[i] ** 2;
      peak = Math.max(peak, Math.abs(samples[i]));
      if (i) maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]));
    }
    assert.ok(peak < .22 && peak > .01, `${cueId}: peak ${peak}`);
    assert.ok(Math.sqrt(square / samples.length) > .005);
    assert.ok(maxStep < .045, `${cueId}: no isolated digital impulse (${maxStep})`);
    assert.deepEqual(samples, renderRecordingPressurePCM(cueId, { sampleRate }).channels[0]);
  }
});

test('live and playback resolve the same PCM, with bounded gain and pan, and reuse the context buffer', () => {
  const context = new Context(44100), destination = {};
  const live = playRecordingPressure({ context, destination, cueId: 'recording.drag', gain: 400, pan: -9 });
  const playback = playRecordingPressure({ context, destination, cueId: 'recording.drag', when: 9, reducedDread: true });
  assert.equal(live.source.buffer, playback.source.buffer); assert.equal(context.bufferCount, 1);
  assert.deepEqual(live.source.buffer.getChannelData(0), renderRecordingPressurePCM('recording.drag', { sampleRate: 44100 }).channels[0]);
  assert.equal(live.out.gain.value, 1); assert.equal(live.panner.pan.value, -1);
  assert.equal(playback.out.gain.value, .65); assert.equal(playback.startedAt, 9);
  assert.equal(live.startedAt, 2); assert.equal(live.source.loop, false);
  live.source.onended(); assert.equal(live.ended, true);
  assert.ok(live.nodes.every(node => node.disconnected));
});

test('STOP before a future cue disconnects it immediately and cannot be scheduled twice', () => {
  const context = new Context(), cue = playRecordingPressure({ context, destination: {}, cueId: 'recording.answer', when: 10 });
  cue.stop(); cue.stop(); assert.equal(cue.ended, true);
  assert.deepEqual(cue.source.stops, [2]); assert.ok(cue.nodes.every(node => node.disconnected));
});

test('STOP during a live cue has a short release and every node disconnects at source end', () => {
  const context = new Context(), cue = playRecordingPressure({ context, destination: {}, cueId: 'recording.brake' });
  context.currentTime = 2.1; cue.stop(); cue.stop();
  assert.deepEqual(cue.source.stops, [2.114]);
  assert.deepEqual(cue.out.gain.events.at(-1), ['ramp', 0, 2.112]);
  cue.source.onended(); assert.equal(cue.ended, true); assert.ok(cue.nodes.every(node => node.disconnected));
});

test('invalid cues and unavailable audio create no partial sound graph', () => {
  const context = new Context();
  assert.equal(recordingPressureCue('not-a-cue'), null);
  assert.equal(recordingPressureCue('toString'), null);
  assert.equal(renderRecordingPressurePCM('not-a-cue'), null);
  assert.equal(playRecordingPressure({ context, destination: {}, cueId: 'not-a-cue' }), null);
  assert.equal(context.created.length, 0);
  assert.equal(playRecordingPressure({ cueId: 'recording.answer' }), null);
});

test('an uncorrelated microphone does not become quiet when the pressure cue plays; matched speaker echo remains protected', () => {
  const mask = createSelfAudioMask({ latencyMs: 0 });
  const programSpectrum = [.9, .72, .46, .24, .12, .06, .03, .01];
  const program = mask.sample(1000, { program: {
    active: true, rms: .12, peak: .2, spectrum: programSpectrum,
  } });
  const unrelated = effectiveMicMeasurement({ rms: .08, peak: .1,
    spectrum: [.01, .03, .08, .28, .75, .92, .42, .12] }, program);
  assert.equal(unrelated.mask.programCorrelated, false);
  assert.equal(unrelated.effective.rms, .08);
  assert.ok(unrelated.effective.rms > .06, 'an unchanged player input must not cross the spoil or hunter hearing floor');
  const speakerReturn = effectiveMicMeasurement({ rms: .08, peak: .1,
    spectrum: programSpectrum.map(value => value * .24) }, program);
  assert.equal(speakerReturn.mask.programCorrelated, true);
  assert.ok(speakerReturn.effective.rms < .01, 'actual output correlation still protects the room microphone');
});

test('the production pressure callback uses the measured output reference without a guessed cancellation envelope', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('const recordingPressurePerformance=createRecordingPressurePerformance');
  const end = main.indexOf('// Any noise past the spoil threshold', start);
  assert.ok(start >= 0 && end > start);
  const callback = main.slice(start, end);
  assert.match(callback, /playRecordingPressure\(/);
  assert.match(callback, /PB\.noteDiscrete\(/);
  assert.doesNotMatch(callback, /maskGameOutput\(|selfAudioMask\.observe\(/,
    'a pressure cue must not manufacture silence by subtracting an unmeasured RMS envelope');
  assert.match(main, /program:MONITOR\.monitorProgramMeasurement\(\)/,
    'the actual final speaker mix remains the echo reference');
});
