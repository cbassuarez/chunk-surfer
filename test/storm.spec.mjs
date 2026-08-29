// Thunder and lightning are one event with a delay between them, and the delay
// is the distance. Everything else in the storm follows from that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FAR_METRES, NEAR_METRES, forceStrike, freshStorm, stepStorm, stormBearing, stormFlash } from '../src/game/storm.js';
import { thunderShape } from '../src/audio/thunder.js';

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
  const near = thunderShape(200, 1);
  const far = thunderShape(6500, 1);
  // Air eats the top first: the crack goes, the roll stays.
  assert.ok(near.cutoff > far.cutoff * 6, `top absorbed with distance (${near.cutoff} vs ${far.cutoff})`);
  assert.ok(near.crack > 0.5 && far.crack === 0, 'only a near strike cracks');
  // One event up close, a roll at distance.
  assert.ok(far.length > near.length * 3);
  // Instant, then increasingly smeared.
  assert.ok(far.attack > near.attack * 10);
  // Quieter, but never absent — a distant storm is still there.
  assert.ok(far.gain < near.gain && far.gain > 0.015);
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
  assert.match(main, /sky\?1:INDOOR_FLASH/);
  // Thunder plays wherever you are: it is the one part of a storm a building
  // cannot keep out.
  assert.match(main, /thunderVoice\?\.strike\?\.\(event\)/);
});
