// The weather the credits happen in: one per boot, present under the quote,
// gone by the time the menu arrives except for the last few still settling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOOT_WEATHER,
  bootWeatherSettled,
  freshBootWeatherState,
  isBootWeatherKind,
  pickBootWeather,
  stepBootWeather,
} from '../src/game/boot-weather.js';
import { WEATHER_CLEAR_AT, openingCreditFrame } from '../src/game/opening-credits.js';
import { bootWeatherVoice, createBootWeatherAudio } from '../src/audio/boot-weather-audio.js';

const run = (state, seconds, options) => {
  for (let i = 0; i < Math.round(seconds / 0.05); i += 1) stepBootWeather(state, 0.05, options);
  return state;
};

// Drive the real credits clock so the test cannot drift from the authored one.
function runCredits(state, from, to, step = 0.05) {
  for (let t = from; t < to; t += step) {
    const frame = openingCreditFrame(t + step);
    stepBootWeather(state, step, {
      presence: frame.weather.presence,
      settling: frame.weather.clearing,
    });
  }
  return state;
}

test('three weathers, and never the same one two boots running', () => {
  assert.deepEqual([...BOOT_WEATHER], ['rain', 'leaves', 'sheets']);
  for (const previous of BOOT_WEATHER) {
    for (const roll of [0, 0.34, 0.5, 0.99, 1]) {
      const picked = pickBootWeather(previous, () => roll);
      assert.ok(isBootWeatherKind(picked), `${picked} is a weather`);
      assert.notEqual(picked, previous, `${previous} cannot repeat`);
    }
  }
  // A first boot has no previous pick and may return any of the three.
  const first = new Set(BOOT_WEATHER.map((_, index) => pickBootWeather('', () => index / 3 + 0.01)));
  assert.equal(first.size, 3);
});

test('presence is sparse under the slates, full under the quote, and clearing before it goes', () => {
  assert.equal(openingCreditFrame(0.1).weather.presence, 0);
  // Sparse, not empty: established weather that the quote then thickens.
  assert.ok(openingCreditFrame(8).weather.presence > 0.55 && openingCreditFrame(8).weather.presence < 0.65,
    'established while the credit slates read');
  assert.equal(openingCreditFrame(18).weather.presence, 1, 'full under the quote');
  assert.equal(openingCreditFrame(8).weather.clearing, false);
  assert.equal(openingCreditFrame(WEATHER_CLEAR_AT + 0.1).weather.clearing, true);
  // Clearing starts before the quote begins to fade at 22.50, so the field is
  // emptying while the words are still legible rather than after them.
  assert.ok(WEATHER_CLEAR_AT < 22.5);
});

test('every weather fills under the quote and is all but gone at the cut', () => {
  for (const kind of BOOT_WEATHER) {
    const state = freshBootWeatherState(kind, { seed: 7 });
    runCredits(state, 0, 18);
    const full = state.particles.length;
    assert.ok(full > 3, `${kind} has a field under the quote (${full})`);

    runCredits(state, 18, 23.5);
    // The reserve is a floor, not a quota: one or two unreserved stragglers can
    // legitimately still be crossing when the cut comes. What must not happen is
    // a field.
    assert.ok(state.particles.length <= 6,
      `${kind} is down to a few at the cut (${state.particles.length})`);
    assert.equal(state.settling, true);
  }
});

test('clearing stops the emitter rather than fading the field out', () => {
  const state = freshBootWeatherState('leaves', { seed: 3 });
  runCredits(state, 0, 18);
  const before = state.particles.length;
  run(state, 1, { presence: 1, settling: true });
  assert.ok(state.particles.length < before, 'the field empties');
  assert.equal(state.fade, 1, 'and it empties by leaving, not by fading');
});

test('every weather carries a few across the cut, rain included', () => {
  // Rain falls fast enough to leave the frame entirely inside the clear-out, so
  // the survivors have to SLOW as soon as they are the last of it. A shower
  // peters out; it does not stop at full speed and leave nothing behind.
  for (const kind of BOOT_WEATHER) {
    const state = runCredits(freshBootWeatherState(kind, { seed: 4 }), 0, 23.5);
    assert.ok(state.particles.length > 0 && state.particles.length <= 6,
      `${kind} hands a few to the menu (${state.particles.length})`);
  }
});

test('the last of it settles behind the menu and then stops for the session', () => {
  const state = freshBootWeatherState('sheets', { seed: 11 });
  runCredits(state, 0, 23.5);
  const carried = state.particles.length;
  assert.ok(carried > 0 && carried <= 6, `a few cross the cut (${carried})`);

  // The title steps it calm: velocities decay and the fade runs out.
  run(state, 0.5, { presence: 0, settling: true, calm: true });
  assert.ok(state.fade < 1 && state.fade > 0, 'it is still going half a second in');
  assert.equal(bootWeatherSettled(state), false);

  run(state, 2, { presence: 0, settling: true, calm: true });
  assert.equal(bootWeatherSettled(state), true, 'and it is done by ~2s, so the menu is still');
});

test('reduced motion thins the field without emptying it', () => {
  const full = runCredits(freshBootWeatherState('rain', { seed: 5 }), 0, 18);
  const reduced = runCredits(freshBootWeatherState('rain', { seed: 5, reducedMotion: true }), 0, 18);
  assert.ok(reduced.particles.length > 0, 'an empty credits frame is not an accessibility setting');
  assert.ok(reduced.particles.length < full.particles.length * 0.6, 'but it is markedly thinner');
  assert.equal(reduced.pace, 0.5);
});

test('effects off draws nothing at all', () => {
  const state = freshBootWeatherState('rain', { enabled: false });
  runCredits(state, 0, 18);
  assert.equal(state.particles.length, 0);
  assert.equal(bootWeatherSettled(state), true);
});

test('the simulation stays inside the frame and never runs away', () => {
  for (const kind of BOOT_WEATHER) {
    const state = freshBootWeatherState(kind, { seed: 2 });
    runCredits(state, 0, 23.5);
    for (const particle of state.particles) {
      assert.ok(Number.isFinite(particle.x) && Number.isFinite(particle.y), `${kind} stays finite`);
      assert.ok(particle.x > -0.31 && particle.x < 1.23, `${kind} x in frame (${particle.x})`);
      assert.ok(particle.y > -0.43 && particle.y < 1.19, `${kind} y in frame (${particle.y})`);
    }
  }
});

test('the weather never moves the credit text, and the boot picks it once', () => {
  const credits = readFileSync('src/game/opening-credits.js', 'utf8');
  // The existing guard: particle motion lives in boot-weather.js so the text
  // layout stays exactly where it was authored.
  assert.doesNotMatch(credits, /xOffset|yOffset|\bdrift\s*\(/);
  assert.match(credits, /renderBootWeather\(bootWeather\(\), \{ alpha: frame\.atmosphere\.alpha \}\)/);

  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /beginBootWeather\(weather,/);
  assert.match(main, /lastBootWeather:weather/);
  assert.match(main, /reducedMotion:shakeMode\(\)!=='full'/);
  assert.match(main, /enabled:visualEffectsEnabled\(\)/);

  const title = readFileSync('src/game/title.js', 'utf8');
  assert.match(title, /stepBootWeather\(weather, dt, \{ presence: 0, settling: true, calm: true \}\)/);
  assert.match(title, /if \(bootWeatherSettled\(weather\)\) endBootWeather\(\)/,
    'backing out of a run to the menu must not start the weather again');
  assert.match(title, /bootWeatherAudio\(\)\?\.update\?\.\(\{ presence: weather\.fade/,
    'and the bed goes out with the picture, under the menu hiss');
  const credits2 = readFileSync('src/game/opening-credits.js', 'utf8');
  assert.doesNotMatch(credits2, /bed\?\.stop/, 'the credits must not stop a bed the title still needs');
});

test('the credits frame resolves to the menu ground instead of to nothing', () => {
  const source = readFileSync('src/game/credit-visual.js', 'utf8');
  // The vignette was the one term never scaled by the frame alpha, so it was
  // still at full strength when the credits cut to the title's flat ground.
  assert.match(source, /vignette: \(0\.76 \+ Math\.sin\(t \* 0\.11 \+ 2\.0\) \* 0\.018\) \* visible/);
  assert.match(source, /resolve: 1 - visible/);
  assert.match(source, /groundColor\(clamp01\(frame\.resolve/);
  assert.match(source, /UI_COLOR\.glass/);

  const late = openingCreditFrame(23.5).atmosphere;
  assert.ok(late.vignette < 0.01, 'no ring is left on screen at the cut');
  assert.ok(late.resolve > 0.99, 'and the ground has become the menu ground');
});

test('every weather carries a bed, and the bed is gone before the menu is', () => {
  for (const kind of BOOT_WEATHER) {
    const voice = bootWeatherVoice(kind);
    assert.ok(voice, `${kind} has a voice`);
    assert.ok(voice.gain > 0 && voice.gain < 0.12, `${kind} sits under an unvoiced quote`);
    assert.ok(voice.body.freq > 0 && voice.air.freq > voice.body.freq, `${kind} has body under air`);
  }
  // Rain is dense and constant; leaves are almost entirely gust. If those were
  // the same number the three would be one bed with a filter moved.
  assert.ok(bootWeatherVoice('leaves').gustDepth > bootWeatherVoice('rain').gustDepth * 4);
  assert.ok(bootWeatherVoice('sheets').body.freq < bootWeatherVoice('leaves').body.freq);

  // It thins across the clear-out but is still going at the cut, so the menu
  // hiss comes up THROUGH it rather than after a gap. The title takes it the
  // rest of the way out with the last particles.
  assert.ok(openingCreditFrame(18).weather.audio > 0.99, 'full under the quote');
  const atCut = openingCreditFrame(23.5).weather.audio;
  assert.ok(atCut > 0.25 && atCut < 0.65, `still audible at the handoff (${atCut.toFixed(2)})`);
  assert.ok(openingCreditFrame(22).weather.audio > atCut, 'and falling the whole way');
});

test('a context that will not run is silence, not a crash', () => {
  const silent = createBootWeatherAudio({ context: null, destination: null, kind: 'rain' });
  assert.equal(silent.active(), false);
  silent.update({ presence: 1 });
  silent.stop();
});

test('rain sits under the menu hiss, because constant is loud', () => {
  const hiss = 0.018;   // story-audio.js startMenuHiss
  const rain = bootWeatherVoice('rain');
  // Rain never stops; the other two spend most of their time between gusts. At
  // equal gain rain reads as several times their level, so it is the one that
  // belongs under the hiss rather than a little over it.
  assert.ok(rain.gain < hiss, `constant broadband belongs under the hiss (${rain.gain})`);
  assert.ok(rain.gustDepth < 0.2, 'and it barely surges');
  for (const kind of ['leaves', 'sheets']) {
    const voice = bootWeatherVoice(kind);
    assert.ok(voice.gain > rain.gain, `${kind} gusts, so it can sit higher`);
    assert.ok(voice.gain <= 0.022, `${kind} is still a bed under an unvoiced quote`);
    assert.ok(voice.gustDepth > 0.5, `${kind} is mostly gust`);
  }
  // A synthesised per-particle swish was tried and cut — it sounded like a
  // filter sweep, not like a leaf. Nothing should quietly reintroduce one
  // without real recordings behind it.
  const audio = readFileSync('src/audio/boot-weather-audio.js', 'utf8');
  assert.doesNotMatch(audio, /createStereoPanner|exponentialRampToValueAtTime/);
});
