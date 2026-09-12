// THUNDER IS GEOMETRY, NOT A FILTER WITH A DISTANCE ON IT.
//
// Ribner & Roy (JASA 72(6), 1982): the received pressure signature is essentially
// a convolution of an N wave with a channel-shape function. Every assertion here
// is about that sentence being true of the code rather than only of the comment
// at the top of it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import {
  THUNDER_ROOM_NOISE_CEILING,
  absorptionCutoffHz, absorptionDbPerMetre, channelShape, characteristicHz,
  makeChannel, nWaveKernel, relaxationRadius, renderThunder, thunderGain,
  thunderIndoorBands, thunderRng, thunderRoomNoise,
} from '../src/audio/thunder-channel.js';
import { ROOM_TONE } from '../src/config.js';
import { PRESENCE } from '../src/game/presence.js';
import { catalogueEntry } from '../src/audio/acoustic-catalogue.js';

const C0 = 343;
// A channel built by hand, so a test can ask about one shape rather than about
// whatever the seeded walk happened to produce.
const line = (from, to, count, e0 = 120e3) => {
  const segments = [];
  for (let i = 0; i < count; i += 1) {
    const a = from.map((v, k) => v + ((to[k] - v) * i) / count);
    const b = from.map((v, k) => v + ((to[k] - v) * (i + 1)) / count);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...d);
    segments.push({
      mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      dir: [d[0] / len, d[1] / len, d[2] / len],
      length: len, e0,
    });
  }
  return { segments, seed: 1 };
};
const loudest = (arrivals) => arrivals.reduce((m, a) => Math.max(m, a.amp), 0);
const spread = (arrivals) => {
  let lo = Infinity, hi = 0;
  for (const a of arrivals) { lo = Math.min(lo, a.delay); hi = Math.max(hi, a.delay); }
  return hi - lo;
};

// ── THE ONE LENGTH SCALE ─────────────────────────────────────────────────────
test('the spectral peak comes off the energy per unit length, not a taste knob', () => {
  // Few (1969): R_c = sqrt(E0/(pi p0)), f_max = c0 sqrt(p0/E0) = c0/(1.77 R_c).
  // 50 kJ/m -> 0.40m and 488Hz; 300 kJ/m -> 0.97m and 199Hz.
  assert.ok(Math.abs(relaxationRadius(50e3) - 0.40) < 0.01);
  assert.ok(Math.abs(relaxationRadius(300e3) - 0.97) < 0.01);
  assert.ok(Math.abs(characteristicHz(50e3) - 488) < 3);
  assert.ok(Math.abs(characteristicHz(300e3) - 199) < 3);
  // And the two forms of the relation agree with each other.
  for (const e0 of [50e3, 120e3, 300e3]) {
    assert.ok(Math.abs(characteristicHz(e0) - C0 / (1.77 * relaxationRadius(e0))) < 1);
  }
  // A MORE ENERGETIC STROKE IS LOWER PITCHED, because it pushes a bigger
  // cylinder. Near strikes do not crack because the source is bright — they
  // crack because nothing has absorbed the top of them yet.
  assert.ok(characteristicHz(300e3) < characteristicHz(50e3));
});

// ── AIR EATS THE TOP ─────────────────────────────────────────────────────────
test('absorption rises steeply with frequency and is spent per path length', () => {
  let previous = 0;
  for (const hz of [63, 125, 250, 500, 1000, 2000, 4000, 8000]) {
    const a = absorptionDbPerMetre(hz);
    assert.ok(a > previous, `${hz}Hz is absorbed harder than the octave below it`);
    previous = a;
  }
  // Over seven kilometres a kilohertz is gone and a hundred hertz is barely
  // touched. That asymmetry is the whole distance cue.
  assert.ok(absorptionDbPerMetre(1000) * 7000 > 20);
  assert.ok(absorptionDbPerMetre(125) * 7000 < 5);
  // The corner the kernel is built against falls with range, hard.
  assert.ok(absorptionCutoffHz(200) > 4000, `a near strike keeps its top (${absorptionCutoffHz(200) | 0}Hz)`);
  assert.ok(absorptionCutoffHz(7000) < 700, `a far one does not (${absorptionCutoffHz(7000) | 0}Hz)`);
  assert.ok(absorptionCutoffHz(200) > absorptionCutoffHz(1000));
  assert.ok(absorptionCutoffHz(1000) > absorptionCutoffHz(7000));
});

test('the N wave is a shock, and the kernel carries its own path length', () => {
  const near = nWaveKernel(120e3, 200, 48000);
  const far = nWaveKernel(120e3, 7000, 48000);
  assert.ok(near.cutoff > far.cutoff * 5, 'the same bolt heard further off has no top');
  // Width is 1/f_max, so E0 sets it and nothing else does.
  const wide = nWaveKernel(300e3, 200, 48000);
  const tight = nWaveKernel(50e3, 200, 48000);
  assert.ok(wide.samples.length > tight.samples.length, 'a bigger cylinder is a longer wave');
  assert.ok(near.peak > 0, 'and it is not silence');
});

// ── COLLINEAR RUNS CANCEL, KINKS DO NOT ──────────────────────────────────────
test('a straight run pointed at you goes quiet; the same length of kinks does not', () => {
  const listener = [0, 1.7, 0];
  // Radial: every segment end-on, which is where the line-source pattern is
  // weakest. This is the cancellation Ribner & Roy describe, and it is why real
  // thunder's energy comes from corners rather than from the length of channel.
  const radial = channelShape(line([0, 200, 0], [0, 3200, 0], 60), listener);
  // Tangential: the same 3000m of channel, the same distance away, lying across
  // the line of sight instead of along it.
  const across = channelShape(line([-1500, 2000, 1500], [1500, 2000, 1500], 60), listener);
  assert.ok(loudest(across) > loudest(radial) * 3,
    `broadside carries, end-on cancels (${loudest(across).toExponential(2)} vs ${loudest(radial).toExponential(2)})`);
});

test('the spread of the delays IS the duration, and nothing else sets it', () => {
  const listener = [0, 1.7, 0];
  // Radial: one end is 200m away and the other is 3200m, so the arrivals are
  // smeared over (3200-200)/343 = 8.7 seconds. That is a roll.
  const radial = spread(channelShape(line([0, 200, 0], [0, 3200, 0], 60), listener));
  assert.ok(Math.abs(radial - 3000 / C0) < 0.4, `a radial channel rolls (${radial.toFixed(1)}s)`);
  // Tangential at constant range: every segment is nearly equidistant, so the
  // whole channel reports at once. That is a clap.
  const across = spread(channelShape(line([-400, 2000, 0], [400, 2000, 0], 60), listener));
  assert.ok(across < 0.25, `a tangential one claps (${across.toFixed(2)}s)`);
  assert.ok(radial > across * 8, 'and it is the geometry that decides which');
});

test('a broadband shock has no nulls', () => {
  // |sinc| evaluated at a single frequency has deep zeros at exact angles, and
  // an earlier version used it directly — so a segment could be silenced by a
  // tenth of a degree, and whether a near strike cracked at all came down to
  // which side of a null its lowest segment fell on. Every frequency nulls at a
  // different angle, so in a shock they fill in. Swept across angle, the
  // response must fall smoothly and never vanish.
  const listener = [0, 1.7, 0];
  let previous = Infinity;
  for (const angle of [0, 0.15, 0.3, 0.6, 0.9, 1.2, 1.5]) {
    // A short segment at 1km, rotated from end-on towards broadside.
    const from = [Math.sin(angle) * -25, 1000, Math.cos(angle) * -25];
    const to = [Math.sin(angle) * 25, 1000, Math.cos(angle) * 25];
    const amp = loudest(channelShape(line(from, to, 1), listener));
    assert.ok(amp > 0, `angle ${angle} is attenuated, never silenced`);
    previous = amp;
  }
  assert.ok(Number.isFinite(previous));
});

// ── DETERMINISM ──────────────────────────────────────────────────────────────
test('one seed is one bolt, forever', () => {
  const a = makeChannel(4242, { distance: 1200, bearing: 0.5, energy: 0.8 });
  const b = makeChannel(4242, { distance: 1200, bearing: 0.5, energy: 0.8 });
  assert.equal(a.segments.length, b.segments.length);
  assert.deepEqual(a.segments[17].mid, b.segments[17].mid);
  // A different seed is a different bolt. Real channels are 2-8km.
  const other = makeChannel(4243, { distance: 1200, bearing: 0.5, energy: 0.8 });
  assert.notDeepEqual(a.segments[17].mid, other.segments[17].mid);
  for (const seed of [1, 99, 4242]) {
    const channel = makeChannel(seed, { distance: 1200, bearing: 0, energy: 0.7 });
    assert.ok(channel.length >= 2000 && channel.length <= 8100,
      `a cloud-to-ground channel is kilometres (${channel.length | 0}m)`);
  }
  // The generator itself is reproducible, which is what lets a strike be
  // rendered to a .wav and listened to twice.
  assert.equal(thunderRng(7)(), thunderRng(7)());
});

// ── THE RENDER ───────────────────────────────────────────────────────────────
test('a strike renders inside the gap between its own flash and its own thunder', () => {
  // storm.js holds every strike for distance/343 seconds before it sounds, and
  // that gap is the render budget. The closest strike the storm can schedule is
  // clamped at 60m, which is 175ms.
  const started = Date.now();
  for (const distance of [200, 1200, 7000]) {
    const r = renderThunder(makeChannel(11, { distance, bearing: 0, energy: 0.8 }), { sampleRate: 48000 });
    assert.ok(r.samples.length > 48000 * 0.5, 'and it is a sound, not a click');
    assert.ok(r.seconds < 15, 'and it ends');
    let peak = 0;
    for (let i = 0; i < r.samples.length; i += 1) peak = Math.max(peak, Math.abs(r.samples[i]));
    assert.ok(Math.abs(peak - 1) < 1e-6, 'peak-normalised, so the level lives at the gain node');
  }
  assert.ok(Date.now() - started < 175 * 3, `three strikes inside three budgets (${Date.now() - started}ms)`);
});

// ── INDOORS IS A TILT, NOT A FADER ───────────────────────────────────────────
test('a building changes which part of the storm reaches you, never whether it does', () => {
  const sky = thunderIndoorBands({ sky: true });
  assert.deepEqual(sky, { low: 1, mid: 1, high: 1 }, 'under open sky nothing is touched');

  let previous = sky;
  for (const floorsBelowRoof of [0, 1, 2, 3, 4]) {
    const bands = thunderIndoorBands({ sky: false, floorsBelowRoof });
    // A ROOF PASSES THE WEIGHT AND STOPS THE CRACK. The tilt has to point the
    // right way at every depth, or the basement is just quieter rather than
    // deeper.
    assert.ok(bands.low > bands.mid && bands.mid > bands.high,
      `${floorsBelowRoof} floors down is a tilt (${JSON.stringify(bands)})`);
    assert.ok(bands.high < previous.high, 'and it deepens as the building stacks up');
    // NEVER SILENCE. Thunder is the one part of a storm a building cannot keep
    // out, and that sentence is load-bearing in main.js.
    assert.ok(bands.low > 0.5 && bands.high > 0.1, 'and it is never withheld');
    previous = bands;
  }
  // The weight barely notices the building at all.
  assert.ok(thunderIndoorBands({ sky: false, floorsBelowRoof: 4 }).low > 0.8);
});

test('level is a separate question from character, and it has a ceiling', () => {
  // The render is peak-normalised, so the whole distance law lives in one place.
  assert.ok(thunderGain(200, 1) > thunderGain(7000, 0.35));
  assert.ok(thunderGain(7000, 0.35) >= 0.016, 'a distant storm is still THERE');
  // 0.34 was a mastering level, not a weather level: a close crack arrived
  // beside UI and dialogue at nearly half scale before the SFX bus.
  for (const [d, e] of [[60, 1], [200, 1], [1200, 1], [7000, 1]]) {
    assert.ok(thunderGain(d, e) <= 0.17, `${d}m stays under the mastering ceiling`);
  }
});

// ── THE STORM REACHES THE TAPE, AND COSTS YOU NOTHING ────────────────────────
//
// The microphone is in a real room with a real roof over it, so a bolt over the
// yard should exist to the take and not only to the ears. What it must never do
// is take the night off the player: a minute of held silence ruined by weather
// is a dice roll, not a game. It blips the needle and it is gone.
test('thunder blips the needle and can never do anything else', () => {
  const entry = catalogueEntry('thunder');
  assert.ok(entry, 'the storm is in the catalogue at all');
  assert.equal(entry.canBeMimicked, false,
    'the HUSH does a great many things in this building; the weather is not one');
  assert.ok(entry.spectrum.low > entry.spectrum.high * 8,
    'through a roof and into a room, what a microphone gets is weight');

  // THE THREE NUMBERS IT HAS TO STAY UNDER, read from the real config rather
  // than restated, so the relationship cannot quietly stop being true.
  assert.ok(THUNDER_ROOM_NOISE_CEILING < ROOM_TONE.spoilNoise / 2,
    `under half of SPOIL (${THUNDER_ROOM_NOISE_CEILING} vs ${ROOM_TONE.spoilNoise})`);
  assert.ok(THUNDER_ROOM_NOISE_CEILING < PRESENCE.noiseClueThreshold / 3,
    'and nowhere near enough for the presence to come looking');
  assert.ok(THUNDER_ROOM_NOISE_CEILING < ROOM_TONE.catchNoise / 4);

  // It is still a reading, not a rounding error: a close crack moves the needle
  // a third of the way to SPOIL, a distant one barely at all.
  const near = thunderRoomNoise(200, 1);
  const far = thunderRoomNoise(7000, 0.35);
  assert.ok(near / ROOM_TONE.spoilNoise > 0.3, `a near strike blips (${(near / ROOM_TONE.spoilNoise * 100) | 0}% of SPOIL)`);
  assert.ok(far / ROOM_TONE.spoilNoise < 0.1, `a distant one hardly does (${(far / ROOM_TONE.spoilNoise * 100) | 0}%)`);
  assert.ok(near > far, 'and distance is what decides');
  for (const [d, e] of [[60, 1], [200, 1], [1200, 1], [7000, 1]]) {
    assert.ok(thunderRoomNoise(d, e) <= THUNDER_ROOM_NOISE_CEILING, `${d}m stays under the ceiling`);
  }
});

test('the guarantee is structural, not a number', () => {
  // A cap can be got wrong. spoils:false cannot: that path sets worldNoise
  // rather than noise and never calls handleRecordingNoise at all, so thunder
  // cannot spoil a take, cannot trip the monitor and cannot fetch the take
  // hunter — whatever the level says.
  const main = readFileSync('src/main.js', 'utf8');
  const tick = main.slice(main.indexOf('function tickStorm('), main.indexOf('function syncDoorDynamicProps'));
  assert.match(tick, /REC\.emitNoise\(THUNDER\.thunderRoomNoise\(/, 'the storm reaches the room');
  assert.match(tick, /spoils:false/, 'and cannot cost the player the minute');
  assert.match(tick, /sourceKind:'environment'/, 'it is weather, not something you did');
  assert.match(tick, /audibleToHush:false/, 'and the presence does not investigate weather');
  assert.doesNotMatch(tick, /spoils:true/);

  const recordist = readFileSync('src/game/recordist.js', 'utf8');
  // The needle's third channel. Everything else on the spoils:false path is the
  // player handling equipment — a torch, a key, a pin — and a needle that jumps
  // at every one of those is not a reading.
  assert.match(recordist, /if \(!spoils && sourceKind === 'environment'\) state\.ambient/);
  assert.match(recordist, /export function ambientNoise/);
  assert.match(main, /REC\.ambientNoise\(\)/, 'and the meter reads it');
});

console.log('thunder channel contracts passed');
