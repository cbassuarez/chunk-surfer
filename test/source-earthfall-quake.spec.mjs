// Earthfall's earthquake: the ground motion is a real strong-motion record,
// it starts only when he steps out, the P jolt comes before the rolling S
// waves, the view moves in the band an earthquake is felt in, reduced motion
// is still, and the shaking is a presentation layer over the exact physical
// frame. See docs/plans/earthfall-quake.md.
//
// Run: node --test test/source-earthfall-quake.spec.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_EARTHFALL_RECORD as RECORD } from '../src/data/generated/source-earthfall-record.js';
import { SOURCE_EARTHFALL_QUAKE as Q, earthfallGroundMotion, earthfallBuildingSway, earthfallQuakeIntensity, earthfallMotionMatrix, earthfallRecordTime } from '../src/data/source-earthfall-quake.js';
import { SOURCE_EARTHFALL as C } from '../src/data/source-earthfall.js';
import { freshSourceEarthfall, sourceEarthfallFrame } from '../src/game/source-earthfall.js';
import { sourceEarthfallRenderFrame, sourceEarthfallShakenFrame } from '../src/render/source-earthfall-renderer.js';
import { earthfallRumbleSamples } from '../src/audio/source-earthfall-rumble.js';

const committed = elapsed => ({ ...freshSourceEarthfall({ runId: 'quake' }), committed: true, committedAt: 0, clock: elapsed, elapsed, phase: 'fracturing' });
function bandShare(signal, rate, lo = .5, hi = 3) {
  const n = signal.length; let total = 0, band = 0;
  for (let k = 1; k < n / 2; k++) {
    const f = k * rate / n; if (f < .3 || f > 5) continue;
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * k * i / n; re += signal[i] * Math.cos(a); im -= signal[i] * Math.sin(a); }
    const p = re * re + im * im; total += p; if (f >= lo && f <= hi) band += p;
  }
  return band / total;
}

test('the ground motion is the processed Ridgecrest CI.CLC record, with its P and S picks', () => {
  assert.match(RECORD.event, /Ridgecrest/); assert.match(RECORD.station, /CI\.CLC/);
  assert.equal(RECORD.rate, 60); assert.equal(RECORD.acceleration.east.length, RECORD.samples);
  assert.ok(RECORD.sAt - RECORD.pAt > 1.2 && RECORD.sAt - RECORD.pAt < 1.6, 'S-P interval of a near-field record');
  assert.ok(RECORD.peakAccelerationMs2.HNN > 2 && RECORD.peakAccelerationMs2.HNN < 4);
});

test('nothing moves before the step out; afterwards the jolt comes before the sustained shaking', () => {
  assert.equal(earthfallRecordTime(3, false), null);
  const before = earthfallGroundMotion(3, { committed: false });
  assert.ok(before.still && before.x === 0 && before.roll === 0);
  const t = Array.from({ length: 60 * 12 }, (_, i) => i / 60), m = t.map(e => earthfallGroundMotion(e));
  const peakY = Math.max(...m.map(g => Math.abs(g.y))), peakH = Math.max(...m.map(g => Math.hypot(g.x, g.z)));
  const jolt = t[m.findIndex(g => Math.abs(g.y) > .25 * peakY)], rolling = t[m.findIndex(g => Math.hypot(g.x, g.z) > .5 * peakH)];
  assert.ok(jolt < rolling, `jolt ${jolt}s must precede sustained shaking ${rolling}s`);
  assert.ok(jolt > RECORD.pAt - Q.recordLead - .1 && jolt < RECORD.sAt - Q.recordLead + .5, 'the jolt is the P arrival');
  assert.ok(peakH > .05 && peakH < .2, 'a readable but bounded view sway');
  assert.ok(Math.max(...m.map(g => Math.hypot(g.roll, g.pitch))) < 2 * Math.PI / 180, 'horizon tilt stays under two degrees');
});

test('the view moves mostly in the 0.5-3 Hz band on every axis', () => {
  const rate = 60, m = Array.from({ length: rate * 31 }, (_, i) => earthfallGroundMotion(i / rate));
  for (const key of ['x', 'y', 'z', 'roll', 'pitch']) {
    const share = bandShare(m.map(g => g[key]), rate);
    assert.ok(share > .5, `${key}: ${share.toFixed(3)} of its energy in 0.5-3 Hz`);
  }
});

test('reduced motion keeps sound and intensity but moves nothing', () => {
  const g = earthfallGroundMotion(8, { reducedMotion: true });
  assert.ok(g.still && g.x === 0 && g.roll === 0 && g.intensity > 0);
  assert.deepEqual(earthfallBuildingSway('ellery', 8, { reducedMotion: true }), { dx: 0, dz: 0, leanX: 0, leanZ: 0 });
  const physical = sourceEarthfallRenderFrame(committed(4), { reducedMotion: true });
  const shaken = sourceEarthfallShakenFrame(physical);
  assert.deepEqual(shaken.props.map(p => [...p.matrix]), physical.props.map(p => [...p.matrix]));
});

test('the shaking is a presentation layer: the physical frame stays exact and only grounded props move', () => {
  const physical = sourceEarthfallRenderFrame(committed(4)), before = physical.props.map(p => [...p.matrix]);
  const shaken = sourceEarthfallShakenFrame(physical);
  assert.deepEqual(physical.props.map(p => [...p.matrix]), before, 'the collision-true frame is not mutated');
  const moved = id => { const a = physical.props.find(p => p.id === id), b = shaken.props.find(p => p.id === id); return a.matrix.some((v, i) => Math.abs(v - b.matrix[i]) > 1e-6); };
  assert.ok(moved('source-earthfall-ellery-retained'), 'the false Ellery moves with the ground');
  assert.ok(moved('source-earthfall-earth-60'), 'the plaza moves');
  assert.ok(!moved('source-earthfall-folio-catch'), 'the landing below is not on the shaking ground');
  assert.ok(!moved('source-earthfall-door-exit'), 'the lower door is not on the shaking ground');
  assert.deepEqual(shaken.eye, physical.eye, 'the camera is never moved');
});

test('the motion matrix pivots about the player footing', () => {
  const pivot = [3, 100, -7], m = earthfallMotionMatrix({ roll: .02, pitch: -.015 }, pivot);
  const p = [0, 1, 2].map(k => m[k] * pivot[0] + m[k + 4] * pivot[1] + m[k + 8] * pivot[2] + m[k + 12]);
  p.forEach((v, k) => assert.ok(Math.abs(v - pivot[k]) < 1e-4));
});

test('the rumble follows the same record: its level tracks the shaking and it is deterministic', () => {
  const rate = 8000, [left] = earthfallRumbleSamples(rate), [again] = earthfallRumbleSamples(rate);
  assert.deepEqual(left.slice(0, 2000), again.slice(0, 2000));
  const rms = [], intensity = [];
  for (let s = 0; s < 30; s++) { let e = 0; for (let i = s * rate; i < (s + 1) * rate; i++) e += left[i] ** 2; rms.push(Math.sqrt(e / rate)); intensity.push(earthfallQuakeIntensity(s + .5)); }
  const mean = a => a.reduce((x, y) => x + y) / a.length, mx = mean(rms), my = mean(intensity);
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < rms.length; i++) { sxy += (rms[i] - mx) * (intensity[i] - my); sxx += (rms[i] - mx) ** 2; syy += (intensity[i] - my) ** 2; }
  assert.ok(sxy / Math.sqrt(sxx * syy) > .9, 'loudness follows the record envelope');
  let peak = 0; for (const v of left) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= .9 + 1e-6 && peak > .5, 'peak-normalised');
});

test('the game frame carries the motion for traces, and the ground fails in the strong motion', () => {
  const f = sourceEarthfallFrame(committed(2));
  assert.equal(f.quake.seconds, 2 + Q.recordLead);
  assert.ok(C.fractureAt + Q.recordLead >= RECORD.sAt - .2, 'the tear opens with the S waves');
  assert.ok(earthfallQuakeIntensity(C.footingLossAt + Q.recordLead) > .3, 'the footing goes in strong motion, not after it');
});
