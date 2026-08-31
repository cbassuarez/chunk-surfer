// The whisper bed has one requirement that is not a matter of taste: it rises
// across the night and the player must never be able to catch it rising. That is
// a claim about numbers, so it is tested as one.
//
// The other load-bearing claim is structural — the bed is the Other, so it is
// not a sound in the room and must never be wired into the world graph the HUSH
// absorbs. That is tested by watching what it connects to.

import assert from 'node:assert/strict';
import {
  WHISPER_INFRASOUND,
  WHISPER_TIDE,
  slewProgress,
  whisperInfrasoundAt,
  whisperLevelAt,
  whisperProgressFor,
  whisperSettingScale,
  whisperGrainsAt,
  whisperTideAt,
  whisperWave,
} from '../src/game/whisper-tide.js';
import { createWhisperBed, WHISPER_FILES } from '../src/audio/whisper-bed.js';

const T = WHISPER_TIDE;
assert.ok(T.ceiling<=.045&&T.floor<=.012,'each whisper voice stays beneath foreground dialogue before overlap');
const HOUR_STEPS = 360_000;          // one hour at 10 ms
const at = (i) => i * 10;

// ── the wave ────────────────────────────────────────────────────────────────
{
  let lo = Infinity; let hi = -Infinity; let zeros = 0;
  for (let i = 0; i < HOUR_STEPS; i++) {
    const w = whisperWave(at(i));
    assert.ok(w >= 0 && w <= 1, 'the wave stays in unit range');
    lo = Math.min(lo, w); hi = Math.max(hi, w); if (w === 0) zeros += 1;
  }
  assert.equal(lo, 0, 'the wave reaches real zero — the bed genuinely stops');
  assert.ok(hi > 0.9, `the wave reaches its top (${hi.toFixed(3)})`);

  // Those zeros have to be silences a person could notice as absence, not a
  // stutter. Measure the runs rather than the total.
  const runs = [];
  let run = 0;
  for (let i = 0; i < HOUR_STEPS; i++) {
    if (whisperWave(at(i)) === 0) run += 1;
    else { if (run) runs.push(run * 10); run = 0; }
  }
  if (run) runs.push(run * 10);
  assert.ok(runs.length >= 4 && runs.length <= 20, `an hour holds a handful of silences, got ${runs.length}`);
  assert.ok(Math.min(...runs) >= 1000, 'the shortest silence is at least a second, not a dropout');

  // Mostly absent. A bed that is mostly present stops being heard at all.
  let quiet = 0;
  for (let i = 0; i < HOUR_STEPS; i++) if (whisperWave(at(i)) < 0.25) quiet += 1;
  assert.ok(quiet / HOUR_STEPS > 0.3, 'the bed spends most of the night near the floor');

  // No fast moves — anything abrupt is an event, and events are audible.
  let worst = 0;
  for (let i = 0; i < HOUR_STEPS; i++) worst = Math.max(worst, Math.abs(whisperWave(at(i)) - whisperWave(at(i) + 5000)));
  assert.ok(worst < 0.45, `the wave never lurches (max ${worst.toFixed(3)} over five seconds)`);

  // The three periods must not resynchronise inside anything anybody plays.
  const [a, b, c] = T.wavePeriodsSec;
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  const lcm = (x, y) => (x * y) / gcd(x, y);
  assert.ok(lcm(lcm(a, b), c) > 86_400, 'the swell does not repeat within a day of play');
}

// ── the invariant ───────────────────────────────────────────────────────────
// For every take, the QUIETEST the bed ever gets afterwards must still be below
// the LOUDEST it got before. If that holds, no two moments a player can hold in
// their head are evidence that anything changed.
{
  const envelopes = [];
  for (let n = 0; n <= T.takeCount; n++) {
    const p = whisperProgressFor(n);
    let min = Infinity; let max = -Infinity;
    for (let i = 0; i < HOUR_STEPS; i += 3) {
      const v = whisperLevelAt(p, whisperWave(at(i)));
      min = Math.min(min, v); max = Math.max(max, v);
    }
    envelopes.push({ n, min, max });
  }
  for (let n = 0; n < T.takeCount; n++) {
    assert.ok(
      envelopes[n + 1].min < envelopes[n].max,
      `take ${n + 1} floor (${envelopes[n + 1].min.toFixed(4)}) must sit under take ${n} ceiling (${envelopes[n].max.toFixed(4)})`,
    );
  }
  // It does still rise, or there is nothing to conceal.
  for (let n = 1; n <= T.takeCount; n++) {
    const before = (envelopes[n - 1].min + envelopes[n - 1].max) / 2;
    const after = (envelopes[n].min + envelopes[n].max) / 2;
    assert.ok(after > before, `take ${n} is genuinely louder on average`);
  }
  assert.ok(envelopes.at(-1).max > envelopes[0].max * 1.5, 'the night ends materially louder than it began');
  assert.ok(T.waveOverStep >= 2, 'the swell is at least twice one take of rise');
}

// ── the slew ────────────────────────────────────────────────────────────────
{
  const step = whisperProgressFor(1);
  let applied = 0; let ms = 0;
  while (applied < step - 1e-9 && ms < 600_000) { applied = slewProgress(applied, step, 16.7); ms += 16.7; }
  assert.ok(ms / 1000 > 150, `one take takes minutes to arrive, got ${(ms / 1000).toFixed(0)}s`);
  assert.ok(ms / 1000 > T.wavePeriodsSec[0] * 3, 'the step is buried under several full swells');

  // Never a jump, however long the frame.
  const oneFrame = slewProgress(0, 1, 16.7);
  assert.ok(oneFrame < 0.001, 'a single frame moves the tide barely at all');
  assert.equal(slewProgress(0.5, 0.5, 10_000), 0.5, 'a settled tide stays put');
  assert.equal(slewProgress(0, 1, 1e9), 1, 'it does arrive eventually');
  assert.equal(slewProgress(1, 0, 1e9), 0, 'and it can come back down');
  assert.equal(whisperProgressFor(99), 1, 'progress is clamped');
  assert.equal(whisperProgressFor(-3), 0);
}

// ── what else the tide moves ────────────────────────────────────────────────
{
  const open = whisperTideAt({ progress: 0, elapsedMs: 0 });
  const shut = whisperTideAt({ progress: 1, elapsedMs: 0 });
  assert.ok(shut.bandHighHz > open.bandHighHz, 'the passband opens toward the consonants');
  assert.ok(shut.bandLowHz < open.bandLowHz, 'and down toward the room tone');
  assert.ok(shut.panSpread < open.panSpread * 0.25, 'the voices converge on a direction');
  assert.ok(shut.detuneCents < open.detuneCents, 'and toward unison');
  assert.equal(open.bandLowHz, T.bandLowHz[0]);
  assert.equal(shut.bandHighHz, T.bandHighHz[1]);

  // The band must never invert, at any point in the night.
  for (let i = 0; i <= 100; i++) {
    const shape = whisperTideAt({ progress: i / 100, elapsedMs: 12_345 });
    assert.ok(shape.bandHighHz > shape.bandLowHz * 2, 'the passband stays a passband');
    assert.ok(shape.panSpread >= 0 && shape.panSpread <= 1);
    assert.ok(shape.voices >= 1 && shape.voices <= 8);
    assert.ok(shape.gapMs > 0 && Number.isFinite(shape.gapMs));
  }

  // Once the night is underway nothing is ever alone long enough to be parsed.
  for (let p = T.minOverlapProgress; p <= 1; p += 0.05) {
    for (const t of [0, 30_000, 91_000, 240_000]) {
      const shape = whisperTideAt({ progress: p, elapsedMs: t });
      if (!shape.silent) assert.ok(shape.voices >= 2, `two voices overlap at progress ${p.toFixed(2)}`);
    }
  }
}

// ── the infrasound ──────────────────────────────────────────────────────────
{
  assert.equal(whisperInfrasoundAt({ progress: 1, wave: 1, allowed: false }).gain, 0,
    'reduce-dread silences the infrasonic layer entirely');
  assert.equal(whisperInfrasoundAt({ progress: 0.05, wave: 1 }).gain, 0, 'it starts late');
  const late = whisperInfrasoundAt({ progress: 1, wave: 1 });
  assert.ok(late.gain > 0 && late.gain <= WHISPER_INFRASOUND.gainAt[1], 'and arrives by the end');
  assert.ok(late.hz >= 17 && late.hz <= 19, 'inside the band the unease research actually used');
}

// ── the accessibility scale ─────────────────────────────────────────────────
{
  assert.equal(whisperSettingScale('off'), 0);
  assert.equal(whisperSettingScale('full'), 1);
  assert.ok(whisperSettingScale('reduced') > 0 && whisperSettingScale('reduced') < 1);
  assert.equal(whisperSettingScale(undefined), 1, 'an absent setting is full');
  assert.equal(whisperSettingScale('nonsense'), 1);
}

// ── the graph is not in the world ───────────────────────────────────────────
{
  assert.equal(WHISPER_FILES.length, 13, 'all thirteen takes are addressed');
  for (const url of WHISPER_FILES) assert.match(String(url), /audio\/game\/whispers\/whisper-\d\d\.mp3$/);

  const connections = [];
  const created = [];
  const param = (value = 0) => ({
    value,
    setValueAtTime(next) { this.value = next; },
    linearRampToValueAtTime(next) { this.value = next; },
    setValueCurveAtTime() {},
    cancelScheduledValues() {},
  });
  const node = (kind, extra = {}) => {
    const self = {
      kind,
      connect(target) { connections.push({ from: kind, to: target?.kind || 'destination' }); },
      disconnect() {},
      ...extra,
    };
    created.push(self);
    return self;
  };
  const buffer = { duration: 2, sampleRate: 48000 };
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    createGain: () => node('gain', { gain: param(1) }),
    createBufferSource: () => node('source', {
      buffer: null, detune: param(0), playbackRate: param(1),
      start() { this.started = true; }, stop() {},
    }),
    createStereoPanner: () => node('panner', { pan: param(0) }),
    createBiquadFilter: () => node('filter', { type: '', frequency: param(0), Q: param(0) }),
    createOscillator: () => node('oscillator', { type: '', frequency: param(0), start() {}, stop() {} }),
    decodeAudioData: () => Promise.resolve(buffer),
  };
  const world = node('WORLD-BUS');   // stands in for hushAudioMix.worldInput
  const master = node('master');
  const limiter = node('limiter');

  const bed = createWhisperBed(ctx, {
    destination: master,
    infrasoundDestination: limiter,
    random: () => 0.5,
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
  });
  assert.ok(bed, 'the bed builds');
  await bed.start();

  // Run it long enough to schedule several utterances across the night.
  for (let i = 0; i < 400; i++) { ctx.currentTime += 0.25; bed.tick(250, { progress: i / 400 }); }
  const frame = bed.snapshot();
  assert.ok(frame.ready === 13, 'every take decoded');
  assert.ok(created.some((n) => n.kind === 'source' && n.started), 'it actually speaks');

  // The structural claim. Nothing the bed builds may reach the world bus, and it
  // must never construct a positional node — it is not at a distance.
  assert.equal(connections.filter((c) => c.to === 'WORLD-BUS').length, 0,
    'the bed never touches the world graph the HUSH absorbs');
  assert.ok(connections.some((c) => c.to === 'master'), 'its output lands on master beside dialogue');
  assert.ok(connections.some((c) => c.from === 'oscillator'), 'the infrasonic layer exists');
  assert.ok(connections.filter((c) => c.from === 'gain' && c.to === 'limiter').length >= 1,
    'and goes to the limiter, not through the glue compressor');
  assert.equal(created.filter((n) => n.kind === 'spatial').length, 0, 'no positional audio anywhere');
  assert.ok(!('createPanner' in ctx) || created.every((n) => n.kind !== 'worldPanner'));

  // Every utterance is band-limited by the tide, not by the file.
  const filters = created.filter((n) => n.kind === 'filter');
  assert.ok(filters.length >= 2, 'each utterance carries its own pair of filters');
  assert.ok(filters.some((f) => f.type === 'highpass') && filters.some((f) => f.type === 'lowpass'));

  bed.stop();
  assert.equal(bed.isRunning(), false);
  bed.dispose();
}

// ── the granular peak ───────────────────────────────────────────────────────
//
// The claim is that the end of the night is a different LAYER and not a louder
// one, and that onset and mid are untouched by it. Both halves are numbers.
{
  const gate = WHISPER_TIDE.grains.startsAtProgress;
  // Nothing at all below the gate, at any point in the swell. If this ever
  // starts leaking the escalation becomes findable long before it should.
  for (const progress of [0, 0.1, 0.25, 0.4, 0.55, gate - 0.001]) {
    for (const wave of [0, 0.25, 0.5, 0.75, 1]) {
      const grains = whisperGrainsAt({ progress, wave });
      assert.equal(grains.active, false, `grains engaged at progress ${progress}`);
      assert.equal(grains.level, 0);
    }
  }

  // And it opens out across the last third rather than arriving at full size.
  const early = whisperGrainsAt({ progress: gate, wave: 1 });
  const late = whisperGrainsAt({ progress: 1, wave: 1 });
  assert.equal(early.active, true);
  assert.ok(late.level > early.level, 'the layer grows');
  assert.ok(late.density > early.density, 'and thickens');
  assert.ok(late.intervalMs < early.intervalMs, 'and its grains come faster');
  assert.ok(late.lengthMs < early.lengthMs, 'and get shorter');

  // GRAIN SIZE IS THE WHOLE IDEA. Below a syllable and above a click: at 40ms
  // no grain is a sound anybody can name, and past ~150ms they are words again
  // and this is just the bed with more voices.
  assert.ok(late.lengthMs >= 20 && late.lengthMs <= 60, `peak grain ${late.lengthMs}ms`);
  assert.ok(early.lengthMs <= 150, `first grain ${early.lengthMs}ms is a word`);

  // The swell reaches this layer too, so a trough is thinner here as well —
  // the two layers breathe together instead of crossfading against each other.
  const trough = whisperGrainsAt({ progress: 1, wave: 0 });
  assert.ok(trough.level < late.level, 'a trough is quieter');
  assert.ok(trough.density < late.density, 'and thinner');

  // Held under the bed. The takes stay the thing you are hearing.
  assert.ok(late.level < 1, 'grains never exceed the bed level they multiply');
}

console.log('# whisper bed tests ok');
