// Thunder and lightning are one event with a delay between them, and the delay
// is the distance. Everything else in the storm follows from that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FAR_METRES, NEAR_METRES, forceStrike, freshStorm, stepStorm, stormBearing, stormFlash } from '../src/game/storm.js';
import { makeChannel, renderThunder, thunderGain } from '../src/audio/thunder-channel.js';

// The measures the rewritten physics test is written against. A CLAP is peaky
// and bright; a RUMBLE is neither. Both come off the rendered buffer, because
// there is no longer a shape function standing in front of it to ask instead.
const crest = (s) => {
  let peak = 0, sum = 0;
  for (let i = 0; i < s.length; i += 1) { peak = Math.max(peak, Math.abs(s[i])); sum += s[i] * s[i]; }
  return peak / Math.sqrt(sum / s.length);
};
// How much TOP a strike has: 2kHz against 250Hz, over the whole buffer.
//
// Three things this is careful about, each learned by getting it wrong first.
// It uses a Goertzel rather than a one-pole split, because the difference of a
// two-pole lowpass is not a highpass — low-frequency PHASE LAG leaks into it and
// swamps the real answer. It measures the whole buffer rather than the loudest
// window, because 200Hz has only thirty cycles in 150ms and the estimate is
// noise. And it compares two narrow bands, because the absorption is a tilt and
// a tilt is a ratio.
const topDb = (s, sr) => {
  const band = (hz) => {
    const c = 2 * Math.cos((2 * Math.PI * hz) / sr);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < s.length; i += 1) { const v = s[i] + c * s1 - s2; s2 = s1; s1 = v; }
    return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / s.length;
  };
  return 20 * Math.log10(band(2000) / Math.max(1e-12, band(250)));
};
const strikeAt = (seed, distance, energy) =>
  renderThunder(makeChannel(seed, { distance, bearing: 0, energy }), { sampleRate: 48000 });

const run = (state, seconds, step = 0.05, options) => {
  const events = [];
  for (let i = 0; i < Math.round(seconds / step); i += 1) {
    for (const e of stepStorm(state, step, options).thunder) events.push({ at: state.time, ...e });
  }
  return events;
};

test('the thunder arrives one flash-to-sound travel time after the strike', () => {
  for (const distance of [200, 900, 3400]) {
    const state = freshStorm({ seed: 5 });
    const strike = forceStrike(state, { distance });
    const expected = distance / 343;
    assert.ok(Math.abs(strike.thunderAt - strike.startedAt - expected) < 1e-6,
      `${distance}m schedules its own travel time`);
    // And it actually fires then, not before.
    const events = run(state, expected + 0.4, 0.02);
    assert.equal(events.length, 1, `${distance}m thunders once`);
    assert.ok(Math.abs(events[0].at - expected) < 0.05, `${distance}m thunders on time`);
    assert.ok(Math.abs(events[0].delay - expected) < 1e-6, 'and reports the count it was worth');
  }
  // The whole point: a near strike arrives almost at once, a far one takes a
  // count you could say out loud.
  const near = freshStorm({ seed: 1 }); const far = freshStorm({ seed: 1 });
  assert.ok(forceStrike(near, { distance: 250 }).thunderAt < forceStrike(far, { distance: 6000 }).thunderAt);
});

test('a forced strike gets the energy its distance implies', () => {
  const close = forceStrike(freshStorm({ seed: 2 }), { distance: 200 });
  const distant = forceStrike(freshStorm({ seed: 2 }), { distance: FAR_METRES });
  assert.ok(close.energy > distant.energy + 0.4, 'two hundred metres is not a distant sheet');
  assert.ok(close.energy > 0.9 && distant.energy <= 0.45);
  assert.ok(close.strokes[0].gain > distant.strokes[0].gain);
});

test('a flash stutters rather than fading, and always ends', () => {
  const state = freshStorm({ seed: 4 });
  forceStrike(state, { distance: 300 });
  const samples = [];
  for (let i = 0; i < 60; i += 1) { samples.push(stormFlash(state)); stepStorm(state, 0.01); }
  assert.ok(samples[0] > 0.9, 'instant on — nothing in a storm ramps up');
  // Return strokes down the same channel: it must go back UP at least once, or
  // it is a lamp being turned down.
  let rises = 0;
  for (let i = 1; i < samples.length; i += 1) if (samples[i] > samples[i - 1] + 0.02) rises += 1;
  assert.ok(rises >= 1, 'a near strike has return strokes');
  run(state, 3);
  assert.equal(stormFlash(state), 0, 'and it is over');
  assert.equal(state.strikes.length, 0);
});

test('a distant strike is one slow bloom, not a stutter', () => {
  const state = freshStorm({ seed: 9 });
  const strike = forceStrike(state, { distance: 6500 });
  assert.equal(strike.strokes.length, 1, 'cloud lit from inside, not a bolt');
  assert.ok(strike.strokes[0].length > 0.25, 'and it lingers');
});

test('nothing strikes while inactive, and the storm never runs away', () => {
  const state = freshStorm({ seed: 7, intensity: 1 });
  run(state, 200, 0.05, { active: false });
  assert.equal(state.strikes.length, 0);
  assert.equal(state.pending.length, 0);
  const live = freshStorm({ seed: 7, intensity: 1 });
  const events = run(live, 400);
  assert.ok(events.length > 3, `a busy storm strikes (${events.length})`);
  assert.ok(live.strikes.length < 6, 'and never accumulates flashes');
  for (const event of events) {
    assert.ok(event.distance >= NEAR_METRES * 0.9 && event.distance <= FAR_METRES * 1.1);
    assert.ok(Number.isFinite(event.bearing));
  }
  assert.ok(Number.isFinite(stormBearing(live)));
});

test('distance is the whole character of thunder, not a volume knob', () => {
  // REWRITTEN AGAINST THE RENDER. This used to ask thunderShape() for four
  // numbers — cutoff, length, attack, crack — which were a good description of
  // thunder but were still a description: someone chose them. There is no such
  // function now. The channel geometry and a tabulated ISO 9613-1 absorption
  // produce those four things instead, so the doctrine is unchanged and the
  // assertions moved onto the buffer that has to actually carry it.
  // SWEPT ACROSS SEEDS, not asserted on one. Every strike is a different bolt
  // with its own geometry, so a single channel proves nothing about the model —
  // and the first version of this test happened to pick the flattest one of
  // eight and failed on a claim that is true.
  const seeds = [1, 7, 42, 99, 2024, 1337, 555, 808];
  const tops = [], crests = [];
  for (const seed of seeds) {
    const near = strikeAt(seed, 200, 1);
    const far = strikeAt(seed, 6500, 0.35);

    // AIR EATS THE TOP FIRST: the crack goes, the roll stays. The single most
    // convincing distance cue there is, and the one that has to hold every time.
    const gap = topDb(near.samples, near.sampleRate) - topDb(far.samples, far.sampleRate);
    assert.ok(gap > 12, `seed ${seed}: the top is absorbed with distance (${gap.toFixed(1)}dB at 2kHz)`);
    tops.push(gap);

    // ONLY A NEAR STRIKE CRACKS. A clap is a peak against its own average; a
    // rumble has no peak to speak of.
    const ratio = crest(near.samples) / crest(far.samples);
    assert.ok(ratio > 1.2, `seed ${seed}: near cracks, far rumbles (${ratio.toFixed(2)}x)`);
    crests.push(ratio);

    // AND IT ROLLS EITHER WAY. The old model said a near strike was one event at
    // 1.1s; it is not, and that number was the shape function's guess showing. A
    // bolt two hundred metres away still has kilometres of channel above it, and
    // every one of those kilometres reports in afterwards.
    assert.ok(near.seconds > 1.5 && far.seconds > 1.5,
      `seed ${seed}: thunder rolls at any distance (${near.seconds.toFixed(1)}s / ${far.seconds.toFixed(1)}s)`);
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean(tops) > 20, `and typically by a lot (${mean(tops).toFixed(1)}dB)`);
  assert.ok(mean(crests) > 2, `typically (${mean(crests).toFixed(2)}x)`);

  // Quieter, but never absent — a distant storm is still THERE.
  assert.ok(thunderGain(6500, 0.35) < thunderGain(200, 1));
  assert.ok(thunderGain(6500, 0.35) >= 0.015, 'a distant storm is still there');
  assert.ok(thunderGain(200, 1) <= 0.17,
    'a close strike stays under the dialogue/SFX mastering ceiling');
});

test('the same flash is a clap or a rumble depending on where you stand', () => {
  // Ribner & Roy (JASA 72(6), 1982): emission from collinear segments cancels
  // except near perpendicularity, so an observer near the perpendicular plane
  // hears a loud clap where an observer outside that zone hears the same source
  // as low-amplitude rumbling. ONE channel, two listeners. No signal model can
  // do this at all, and it is the assertion that proves this one is geometric
  // rather than a filter with a distance on it.
  const channel = makeChannel(1337, { distance: 0, bearing: 0, energy: 0.8 });
  let ax = 0, az = 0;
  for (const seg of channel.segments) {
    if (seg.mid[1] < 1300) continue;          // the in-cloud run is what has an axis
    ax += seg.dir[0] * seg.length; az += seg.dir[2] * seg.length;
  }
  const azimuth = Math.atan2(ax, az);
  const at = (angle) => renderThunder(channel, {
    sampleRate: 48000,
    listener: [Math.sin(angle) * 1200, 1.7, Math.cos(angle) * 1200],
  });
  const endOn = at(azimuth);
  const broadside = at(azimuth + Math.PI / 2);

  assert.notEqual(endOn.samples.length, broadside.samples.length,
    'the same lightning does not last the same time from two places');
  const spread = Math.abs(crest(endOn.samples) - crest(broadside.samples));
  assert.ok(spread > 5,
    `and it does not have the same shape either (${crest(endOn.samples).toFixed(1)} vs ${crest(broadside.samples).toFixed(1)})`);
});

test('the flash is one term driving both renderer dials, and accessibility scales it', () => {
  const renderer = readFileSync('src/render/r3d.js', 'utf8');
  // Ambient alone is a brighter dither; the white point alone is a flat
  // white-out with no shape. Both together is a photograph.
  assert.match(renderer, /baseAmbientIntensity\*\(1\+stormFlash\*\d+\)/);
  assert.match(renderer, /lightingWhitePointScale\) \/ \(1 \+ stormFlash \* [\d.]+\)/);
  assert.match(renderer, /export function r3dSetStormFlash/);

  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /if\(mode==='off'\)return 0;/, 'flash off means no flash');
  assert.match(main, /mode==='reduced'\?0\.20:1/, 'reduced keeps the beat and loses the assault');
  assert.match(main, /CELL_FLAGS\.SKY/, 'full under open sky, a fraction of it indoors');
  assert.match(main, /skyOverhead\(\)\?1:INDOOR_FLASH/);
  // ONE PREDICATE. The flash and the thunder must never disagree about whether
  // there is sky over this cell.
  assert.match(main, /function skyOverhead\(\)/);
  // Thunder plays wherever you are: it is the one part of a storm a building
  // cannot keep out. What being indoors changes is which PART of it reaches
  // you — a tilt, never a fader, and never silence.
  assert.match(main, /thunderVoice\?\.strike\?\.\(\{\.\.\.event,bands:thunderIndoorBands\(/);
  assert.doesNotMatch(main, /thunderVoice[^\n]*bands:null/, 'indoors is never nothing');
});
