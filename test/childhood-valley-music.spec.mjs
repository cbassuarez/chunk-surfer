import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createHomeValleyMusic, homeValleyScorePhrase, HOME_VALLEY_MUSIC_CUES } from '../src/audio/childhood-valley-music.js';
import { HOME_VALLEY_MUSIC_CELLS } from '../src/game/childhood-valley-music-space.js';
import { quantizeStandingTearPCM } from '../src/audio/standing-tear-dsp.js';

const assetDir = new URL('../public/audio/childhood-valley/', import.meta.url);
const credits = JSON.parse(readFileSync(new URL('credits.json', assetDir), 'utf8'));
const cues = JSON.parse(readFileSync(new URL('phrase-cues.json', assetDir), 'utf8'));

function graph(duration) {
  const parameter = () => ({
    value: 0, setValueAtTime(value) { this.value = value; },
    setTargetAtTime(value) { this.value = value; },
    ramps: [],
    linearRampToValueAtTime(value, time) { this.value = value; this.ramps.push({ value, time }); },
    cancelScheduledValues() {},
    cancelAndHoldAtTime(time) { this.ramps = this.ramps.filter(ramp => ramp.time < time); },
  });
  const node = () => ({ connect(to) { return to; }, disconnect() { this.disconnected = true; } });
  const sources = [];
  const context = {
    state: 'running', currentTime: 0, sampleRate: 20000,
    createGain: () => ({ ...node(), gain: parameter() }),
    createPanner: () => ({ ...node(), panningModel: '', positionX: parameter(), positionY: parameter(), positionZ: parameter() }),
    createBiquadFilter: () => ({ ...node(), frequency: parameter(), Q: parameter() }),
    createConvolver: node,
    createBufferSource() {
      const source = {
        ...node(),
        connect(to) { this.envelope = to.gain; return to; },
        start(at, offset) { this.at = at; this.offset = offset; },
        stop(at) { this.stopped = at ?? true; },
      };
      sources.push(source);
      return source;
    },
    createBuffer(numberOfChannels, length, sampleRate) {
      const data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      return { numberOfChannels, length, sampleRate, duration: length / sampleRate, getChannelData: index => data[index] };
    },
    async decodeAudioData() { return this.createBuffer(1, Math.round(duration * this.sampleRate), this.sampleRate); },
  };
  return { context, destination: node(), sources };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const realm = (x, z, split = false) => ({
  stage: 'inside', home: { eligible: true }, eyeHeight: 1.62, pose: { x, z, yaw: 0, pitch: 0 },
  homeState: { activities: { split } },
});

test('the shipped master and its runtime cues use the same faster pitch-preserving edits', () => {
  const bytes = readFileSync(new URL(credits.asset.split('/').at(-1), assetDir));
  assert.equal(bytes.length, credits.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), credits.sha256);
  assert.equal(credits.tempoMultiplier, 1.055);
  assert.equal(cues.length, Object.keys(HOME_VALLEY_MUSIC_CUES).length);
  const sample = 1 / credits.sampleRate;
  let previousEnd = null;
  for (const cue of cues) {
    const { id, startSeconds, endSeconds, exitSeconds, sourceStartSeconds, sourceEndSeconds, sourceExitSeconds } = cue;
    assert.deepEqual(HOME_VALLEY_MUSIC_CUES[id], [startSeconds, endSeconds, exitSeconds]);
    if (previousEnd !== null) assert.ok(Math.abs(startSeconds - previousEnd - .12) <= sample);
    assert.ok(Math.abs((endSeconds - startSeconds) * credits.tempoMultiplier - (sourceEndSeconds - sourceStartSeconds)) <= sample);
    assert.equal(sourceExitSeconds.length, exitSeconds.length);
    for (let i = 0; i < exitSeconds.length; i++) {
      assert.ok(startSeconds < exitSeconds[i] && exitSeconds[i] < endSeconds);
      assert.ok(Math.abs((exitSeconds[i] - startSeconds) * credits.tempoMultiplier - (sourceExitSeconds[i] - sourceStartSeconds)) <= sample);
    }
    previousEnd = endSeconds;
  }
  assert.ok(Math.abs(previousEnd - credits.durationSeconds) <= sample);
});

test('dither stays in the 10-bit alphabet and is seed repeatable', () => {
  const quiet = new Float32Array(4096);
  const profile = { bitDepth: 10, sampleRate: 48000, effectiveSampleRate: 26000, ditherSeed: 98 };
  const first = quantizeStandingTearPCM(quiet, profile);
  const second = quantizeStandingTearPCM(quiet, profile);
  assert.deepEqual(first.samples, second.samples);
  assert.equal(first.diagnostics.dither, 'TPDF');
  assert.equal(first.diagnostics.observedAmplitudeLevels, 3);
  assert.ok(first.samples.some(sample => sample < 0));
  assert.ok(first.samples.some(sample => sample > 0));
  assert.ok(quantizeStandingTearPCM(quiet).samples.every(sample => sample === 0));
});

test('every score cell has a phrase and split changes only the timber answer', () => {
  for (const cell of HOME_VALLEY_MUSIC_CELLS) {
    assert.ok(homeValleyScorePhrase(cell), cell);
    assert.equal(homeValleyScorePhrase(cell) !== homeValleyScorePhrase(cell, true), cell === 'timber', cell);
  }
  assert.notEqual(homeValleyScorePhrase('threshold'), homeValleyScorePhrase('lane'));
  assert.equal(homeValleyScorePhrase('lane'), homeValleyScorePhrase('stop'));
});

test('a crossing can be abandoned and protected audio parks the actual loop position', async () => {
  const audio = graph(credits.durationSeconds);
  const score = createHomeValleyMusic({
    getAudio: () => audio,
    fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) }),
  });
  const entry = realm(0, 2), lane = realm(-8, 14);
  function update(time, world, options = {}) {
    audio.context.currentTime = time;
    score.update({ realm: world, ...options });
  }
  update(0, entry); await settle();
  update(.1, entry); update(.2, entry);
  const first = audio.sources[0];
  assert.ok(first.loop && first.loopStart > 0 && first.loopEnd > 2);
  update(1.1, lane);
  assert.equal(score.snapshot().wanted, homeValleyScorePhrase('lane'));
  assert.ok(score.snapshot().pending);
  update(1.21, entry);
  assert.ok(audio.sources[1].stopped && audio.sources[1].disconnected);
  assert.equal(score.snapshot().phrase, homeValleyScorePhrase('threshold'));
  update(2, entry, { protectedAudio: true });
  const held = score.snapshot();
  assert.equal(held.live, 0);
  assert.equal(held.playing, false);
  update(14, entry, { protectedAudio: true });
  assert.equal(score.snapshot().offset, held.offset);
  update(20, entry);
  assert.equal(audio.sources.at(-1).offset, held.offset);
  update(20.2, entry);
  assert.equal(score.snapshot().playing, true);
  update(21, null);
  assert.equal(score.snapshot().ready, false);
  assert.ok(audio.sources.every(source => source.disconnected));
});

test('leaving during a decode cannot install a score into the next realm', async () => {
  const audio = graph(credits.durationSeconds);
  let complete;
  audio.context.decodeAudioData = () => new Promise(resolve => { complete = resolve; });
  const score = createHomeValleyMusic({
    getAudio: () => audio,
    fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) }),
  });
  score.update({ realm: realm(0, 2) });
  await settle();
  score.update();
  complete(audio.context.createBuffer(1, Math.round(credits.durationSeconds * audio.context.sampleRate), audio.context.sampleRate));
  await settle();
  assert.equal(score.snapshot().ready, false);
  assert.equal(score.snapshot().live, 0);
});

test('a quick walk replaces an unheard destination and schedules the release at a cadence on the audio clock', async () => {
  const audio = graph(credits.durationSeconds);
  const score = createHomeValleyMusic({
    getAudio: () => audio,
    fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) }),
  });
  const commons = realm(-15, 45);
  const update = (time, world) => {
    audio.context.currentTime = time;
    score.update({ realm: world });
  };
  update(0, commons); await settle();
  update(.1, commons); update(.2, commons);
  const outgoing = audio.sources[0];
  const [from, , [exit]] = HOME_VALLEY_MUSIC_CUES['allemande-open'];
  const cadence = outgoing.at + exit - from;
  update(.8, realm(0, 65));
  assert.equal(score.snapshot().pending, 'allemande-turn');
  const skipped = audio.sources.at(-1);
  assert.ok(cadence - .8 > 3.7, 'the old timeout would have cut the phrase');
  assert.deepEqual(outgoing.envelope.ramps.at(-1), { value: 0, time: skipped.at });
  assert.ok(Math.abs(skipped.at - cadence) < .001);
  update(1, realm(19, 91));
  assert.equal(score.snapshot().pending, 'allemande-answer');
  assert.equal(skipped.stopped, true);
  assert.ok(Math.abs(audio.sources.at(-1).at - cadence) < .001);
  update(cadence - .1, realm(19, 91));
  assert.equal(score.snapshot().phrase, 'allemande-open');
  update(cadence + .45, realm(19, 91));
  assert.equal(score.snapshot().phrase, 'allemande-answer');
  assert.equal(score.snapshot().placement.object, 'north yard');
});

test('changing emitters on the same phrase keeps its playback offset', async () => {
  const audio = graph(credits.durationSeconds);
  const score = createHomeValleyMusic({
    getAudio: () => audio,
    fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) }),
  });
  const lane = realm(-8, 14), shelter = realm(-27.12, 21.48);
  score.update({ realm: lane }); await settle();
  audio.context.currentTime = .1;
  score.update({ realm: lane });
  audio.context.currentTime = .2;
  score.update({ realm: lane });
  const first = audio.sources[0];
  audio.context.currentTime = 2;
  score.update({ realm: shelter });
  const second = audio.sources[1];
  assert.ok(Math.abs(second.offset - (second.at - first.at)) < .001);
  audio.context.currentTime = 2.1;
  score.update({ realm: shelter });
  assert.equal(score.snapshot().placement.object, 'PostAuto shelter');
  audio.context.currentTime = 2.2;
  score.update({ realm: shelter, pause: true });
  const offset = score.snapshot().offset;
  audio.context.currentTime = 5;
  score.update({ realm: lane });
  assert.equal(audio.sources.at(-1).offset, offset);
});

test('the outgoing loop hands off before its baked pickup seam', async () => {
  const audio = graph(credits.durationSeconds);
  const score = createHomeValleyMusic({
    getAudio: () => audio,
    fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) }),
  });
  const lookout = realm(-78.1, 131.63);
  score.update({ realm: lookout }); await settle();
  audio.context.currentTime = .1;
  score.update({ realm: lookout });
  audio.context.currentTime = .2;
  score.update({ realm: lookout });
  const source = audio.sources[0];
  audio.context.currentTime = source.at + 8;
  score.update({ realm: realm(-43, 90) });
  const handoff = audio.sources.at(-1).at;
  assert.ok(handoff - source.at < source.loopEnd - source.loopStart);
  assert.ok(handoff - source.at > source.loopEnd - 3 * source.loopStart);
});

test('Montfermeil answers the descent from the lookout once per visit', async () => {
  const audio = graph(credits.durationSeconds);
  const score = createHomeValleyMusic({
    getAudio: () => audio,
    fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) }),
  });
  const fork = realm(-43, 90), lookout = realm(-78.1, 131.63), timber = realm(-65.41, 107.33);
  const update = (time, world, options = {}) => {
    audio.context.currentTime = time;
    score.update({ realm: world, ...options });
  };
  update(0, fork); await settle();
  update(.1, fork); update(.2, fork);
  assert.equal(score.snapshot().phrase, 'courante-open');
  update(1, lookout);
  update(audio.sources.at(-1).at + .1, lookout);
  const nearLookout = audio.context.currentTime;
  update(nearLookout + 1, fork);
  assert.equal(score.snapshot().wanted, 'montfermeil-refrain');
  const returnVoice = audio.sources.at(-1);
  assert.equal(returnVoice.loop, false);
  update(returnVoice.at + .5, fork);
  assert.equal(score.snapshot().placement.object, 'hay store uphill apron');
  update(returnVoice.at + 2, fork, { pause: true });
  const offset = score.snapshot().offset;
  update(returnVoice.at + 3, fork);
  const resumed = audio.sources.at(-1);
  assert.equal(resumed.offset, offset);
  update(resumed.at + 3, timber);
  assert.equal(score.snapshot().phrase, 'montfermeil-refrain');
  assert.equal(score.snapshot().placement.object, 'hay store uphill apron');
  update(resumed.at + 20, fork);
  assert.equal(score.snapshot().live, 0);
  const count = audio.sources.length;
  update(resumed.at + 21, fork);
  assert.equal(audio.sources.length, count);
  update(resumed.at + 22, timber);
  assert.equal(score.snapshot().wanted, 'courante-open');
  update(resumed.at + 23, fork);
  assert.equal(audio.sources.filter(source => !source.loop).length, 2, 'the one-shot starts once and resumes once');
});

test('the saved split advances the shelter and the fatal cadence plays once', async () => {
  const audio = graph(credits.durationSeconds);
  const score = createHomeValleyMusic({
    getAudio: () => audio,
    fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) }),
  });
  const original = realm(-65.41, 107.33);
  const split = realm(-65.41, 107.33, true);
  function update(time, world, options = {}) {
    audio.context.currentTime = time;
    score.update({ realm: world, ...options });
  }
  update(0, original); await settle();
  update(.1, original); update(.2, original);
  assert.equal(score.snapshot().phrase, 'courante-open');
  update(.3, split);
  assert.equal(score.snapshot().wanted, 'courante-answer');
  const scheduled = audio.sources.at(-1).at;
  update(scheduled + .1, split);
  assert.equal(score.snapshot().phrase, 'courante-answer');
  assert.equal(score.snapshot().placement.object, 'woodcutters shelter');
  update(scheduled + .2, split, { finale: true }); update(scheduled + .4, split, { finale: true });
  assert.equal(score.snapshot().phrase, 'montfermeil-release');
  assert.equal(audio.sources.at(-1).loop, false);
  const count = audio.sources.length;
  update(scheduled + 15, split, { finale: true });
  update(scheduled + 18, split, { finale: true });
  assert.equal(score.snapshot().live, 0);
  assert.equal(audio.sources.length, count);
});
