import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FRONT_END_GRADE, NEUTRAL_GRADE, LOOK_PROFILE_IDS, getLookProfile, validateLookProfile } from '../src/render/look-profiles.js';
import { FRONT_END_PLATE_PRESETS, normalizeFrontEndPlate, interpolateFrontEndPlate } from '../src/render/front-end-plate.js';

// The plate, as the shader applies it: invert, curve, gain. One channel, because
// the reference keeps greys neutral all the way through.
const G = FRONT_END_GRADE;
// The shader, in order: normalise onto the plate's range, invert, curve, gain.
const graded = (v, black = G.plateBlack, white = G.plateWhite) => {
  const n = Math.min(Math.max((v / 255 - black) / Math.max(white - black, 1e-4), 0), 1);
  return Math.round(Math.pow(1 - n, G.gamma) * G.gain * 255);
};
// The reference stack was fitted to full-range bars, so that is the case that
// has to reproduce it: black point 0, white point 1.
const plate = (v) => graded(v, 0, 1);

test('the front-end plate reproduces the reference stack', () => {
  // Measured off smpte_cs_control.png -> smpte_cs_opening.png. The first three
  // are large flat bars and are the reliable ones; the rest come off the
  // greyscale ramp, where the reference's own dither costs a few levels.
  const reference = [[102, 125], [191, 43], [0, 249], [6, 235], [105, 116], [154, 66], [203, 34], [253, 1]];
  for (const [input, expected] of reference) {
    const got = plate(input);
    assert.ok(Math.abs(got - expected) <= 7,
      `${input} -> ${got}, reference ${expected} (off by ${got - expected})`);
  }
  // The two anchors that carry the look: a 75% bar goes dark, black goes white.
  assert.ok(plate(191) < 60, 'the bright bar becomes ink');
  assert.ok(plate(0) > 240, 'black becomes paper');
});

test('the plate is graded on its OWN range, not on a nominal full scale', () => {
  // THE BUG THIS EXISTS TO CATCH, and it is the whole difference between the
  // look reading as a print and reading as a flat grey field. Measured off the
  // title over fourteen frames, the composite's tone field is median 7 of 255,
  // p90 53, p95 63, and peaks at 146 -- it never uses more than the bottom 58%
  // of the scale, and half the frame is effectively black.
  const PLATE = { median: 7, p90: 53, p95: 63, p99: 95, peak: 146 };

  // Where the picture actually lives -- the middle 90% of it -- the reference
  // curve run over a nominal full scale has barely any range to give.
  const bulk = (f) => f(PLATE.median) - f(PLATE.p95);
  assert.ok(bulk(graded) > bulk(plate) * 1.6,
    `normalising nearly doubles the contrast over the bulk of the frame `
    + `(${bulk(plate)} levels -> ${bulk(graded)})`);

  // And ink is reachable at all. Ungraded-for-range, the very brightest thing
  // in the frame still stops well short of the dark ink, so nothing on screen
  // is ever a mark -- which is exactly how it looked.
  assert.ok(plate(PLATE.peak) > 60, 'nominal-scale: even the lightning is only a grey');
  assert.equal(graded(PLATE.peak), 0, 'normalised: the brightest lightning clips to solid ink');

  // The ends land where the look wants them.
  assert.ok(graded(PLATE.median) > 200, 'the night sky prints as paper');
  assert.ok(graded(PLATE.p90) > 90 && graded(PLATE.p90) < 180, 'the road and the building keep a mid grey');

  // plateWhite is the measured ceiling, not a chosen contrast. Well above it
  // and the frame washes out again; well below and most of it clips to ink.
  assert.ok(G.plateWhite > 0.45 && G.plateWhite < 0.65, `plateWhite is the plate's own ceiling (${G.plateWhite})`);
  assert.ok(G.plateWhite * 255 < PLATE.peak, 'and it sits under the peak, so the highlight clips rather than stops short');
  assert.equal(G.plateBlack, 0, 'the plate really does reach black');
});

test('the plate is a negative and nothing else', () => {
  assert.equal(FRONT_END_GRADE.invert, 1);
  assert.ok(FRONT_END_GRADE.gamma > 1, 'the curve darkens the midtones after the invert');
  assert.ok(FRONT_END_GRADE.gain > 0.9 && FRONT_END_GRADE.gain <= 1, 'and barely touches the white point');
  assert.ok(FRONT_END_GRADE.soften > 0, 'a small blur sits under the plate, as the reference lens blur did');
  // Neutral is genuinely neutral, or every other profile would be graded too --
  // and with invert at 0 the shader never reaches the normalisation at all, so
  // neutral needs no plate points of its own.
  assert.deepEqual({ ...NEUTRAL_GRADE }, { invert: 0, gamma: 1, gain: 1, soften: 0 });
});

test('the grade is an overlay, not a seventh look profile', () => {
  // A profile would need a diffusion bank of its own — validateLookProfile
  // requires bankId === id — and the front end runs the same instrument as the
  // room behind it. Only the plate differs.
  for (const id of LOOK_PROFILE_IDS) {
    assert.ok(validateLookProfile(getLookProfile(id)), `${id} is still a valid profile`);
    assert.equal(getLookProfile(id).grade, undefined, `${id} carries no grade of its own`);
  }
});

test('the dither screens the graded plate, not the other way round', () => {
  // The reference put a Color Halftone over the invert. That halftone is this
  // renderer's own dither, so the grade has to land BEFORE levels() — which the
  // shader documents as "TONE FIRST ... everything downstream is a modulation".
  const shader = readFileSync(new URL('../src/render/pixel-mesh/shader.js', import.meta.url), 'utf8');
  const gradeAt = shader.indexOf('if(uGrade.x > 0.0)');
  const toneAt = shader.indexOf('float tone = levels(y);');
  assert.ok(gradeAt > 0 && toneAt > 0, 'both stages are present');
  assert.ok(gradeAt < toneAt, 'the grade is applied before the tone/dither stage');
  // And the blur is under the plate, or it would soften the dots instead.
  assert.ok(shader.indexOf('if(uGrade.w > 0.0)') < gradeAt, 'the softening precedes the invert');
  // The normalisation has to be inside the invert branch, or every other
  // profile in the game gets its black and white points moved.
  const normAt = shader.indexOf('uGradePlate.y - uGradePlate.x');
  assert.ok(normAt > gradeAt && normAt < toneAt, 'the plate normalisation sits inside the grade branch');
});

test('the grade rides the plate the front end already switches', () => {
  // There was a front-end plate before this: a dimming pass in the POST shader,
  // switched at credits / title / gameplay and once per frame off the session
  // snapshot. Adding a second switch beside it would have been two things to
  // keep in step, so the negative is a field ON that plate instead -- which is
  // also why it needs no call sites of its own.
  assert.equal(normalizeFrontEndPlate('credits').negative, 1, 'the opening is printed');
  assert.equal(normalizeFrontEndPlate('title').negative, 1, 'and so is the menu');
  assert.equal(normalizeFrontEndPlate('gameplay').negative, 0, 'play is lit, not printed');
  assert.equal(normalizeFrontEndPlate('fallback').negative, 0);
  // An unknown plate must not grade the world by accident.
  assert.equal(normalizeFrontEndPlate('nope').negative, 0);
  assert.equal(normalizeFrontEndPlate(undefined).negative, 0);

  // It crossfades with the rest of the plate, so a scene transition grades
  // partway rather than snapping to a negative mid-dissolve.
  assert.equal(interpolateFrontEndPlate('title', 'gameplay', 0.5).negative, 0.5);
  assert.equal(interpolateFrontEndPlate('title', 'gameplay', 1).negative, 0);

  // Every preset declares it, so a new one cannot silently inherit a negative.
  for (const [id, preset] of Object.entries(FRONT_END_PLATE_PRESETS)) {
    assert.equal(typeof preset.negative, 'number', `${id} declares a negative`);
  }
});

test('the dimming plate and the negative are different passes, on purpose', () => {
  // The old plate could only push the background back, because it runs after
  // the pixel mesh -- grading there would invert the DOTS. The two coexist: the
  // title still dims to 0.72 while being printed.
  const title = normalizeFrontEndPlate('title');
  assert.ok(title.amount > 0 && title.amount < 1, 'the title is still dimmed as it was');
  assert.ok(title.exposureStops < 0, 'and still pulled down');
  assert.equal(title.negative, 1, 'as well as printed');
});
