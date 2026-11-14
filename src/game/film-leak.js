// THE LIGHT IN THE CAMERA, AS FILM. game/neural-transition.js says when and how much; this
// says which piece of film is in the gate. The fog is the developer's own Super 8, two reels
// (scripts/build-film-leak-atlas.py): one a reversal roll whose head fogged red and burned
// through, one a blank negative that fogged rose and went to a cloudy white. Real fog is
// crimson at its reach and goes to a cool cyan-white where it is worst; it is not the
// orange-to-yellow ramp a filter paints.
//
// Every crossing is its own roll. Its seed picks the reel, which edge the fog comes off,
// and how much of the old camera is left:
//   film only    the fog carries the whole transition, its own burn to white included, and
//                the picture's exposure goes up the way a camera's first frames do.
//   with the lens  the fog sits inside the lens going soft, the flare and the after-image.
// The two are interchangeable, so neither is the true one.
//
// PHOTOSENSITIVITY. The fog run is in an order where every quarter of the frame only gains
// light as the leak grows, so a cut between frames moves the fog's edge and never flashes a
// region back. The burn frames are scaled to one exposure, so a cut between them never moves
// the screen's level: that follows the white, which neural-transition.js already limits.
// Reduce Flash crossfades between neighbouring frames instead of cutting.

import { FILM_LEAK_ATLAS } from '../data/film-leak-atlas.js';

export const FILM_LEAK = Object.freeze({
  framesPerSecond: 12,   // a camera with a hand on it
  burnExposure: 6,       // mean exposure of the burn at full white: past the shoulder
  neighbourRatio: 1.6,   // frames this close in exposure may stand in for each other
});
const fract = v => v - Math.floor(v);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const NONE = Object.freeze({ a: 0, b: 0, mix: 0, scale: 0 });

/** Pure. The roll a crossing gets, from its seed. */
export function filmLeakRoll(seed = 0) {
  const s = Number(seed) || 0;
  return Object.freeze({
    filmOnly: fract(s * 7.31 + .17) >= .5,
    reel: fract(s * 13.7 + .41) < .5 ? '5072' : '5068',
    mirrored: fract(s * 3.7) >= .5,   // the side the old curtain came from, kept
  });
}

// Which frame of a run is in the gate when the run is `s` of the way through.
function runFrame(run, s, { clock, seed, reduced, scale = 1, normalise = 0 }) {
  const cells = FILM_LEAK_ATLAS.cells, N = run.length;
  if (!(s > 0) || !N) return NONE;
  const u = Math.min(N - 1, s * (N - 1)), arrive = Math.min(1, s * (N - 1) + .15);
  const E = k => cells[run[k]].exposure, gain = k => normalise ? normalise / Math.max(.05, E(k)) : 1;
  if (reduced) {
    const i = Math.floor(u), j = Math.min(N - 1, i + 1), t = u - i;
    return Object.freeze({ a: run[i], b: run[j], mix: t, scale: arrive * scale * (gain(i) * (1 - t) + gain(j) * t) });
  }
  let i = Math.round(u);
  const near = [];
  for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < N && Math.max(E(k), E(i)) / Math.max(1e-3, Math.min(E(k), E(i))) < FILM_LEAK.neighbourRatio) near.push(k);
  i = near[Math.floor(hash(Math.floor(clock * FILM_LEAK.framesPerSecond), seed * 91) * near.length)];
  return Object.freeze({ a: run[i], b: run[i], mix: 0, scale: arrive * scale * gain(i) });
}

/** Pure. `leak`, `white`, `time` and `seed` are the neural frame's; nothing stored. */
export function filmLeakFrame({ leak = 0, white = 0, time = 0, seed = 0, reducedFlash = false } = {}) {
  const roll = filmLeakRoll(seed), reel = FILM_LEAK_ATLAS.reels[roll.reel];
  const options = { clock: Math.max(0, Number(time) || 0), seed: Number(seed) || 0, reduced: !!reducedFlash };
  const w = Math.max(0, Math.min(1, Number(white) || 0));
  return Object.freeze({
    ...roll,
    fog: runFrame(reel.fog, Math.max(0, Math.min(1, Number(leak) || 0)), options),
    burn: roll.filmOnly ? runFrame(reel.burn, w, { ...options, normalise: 1, scale: FILM_LEAK.burnExposure * Math.pow(w, 1.5) }) : NONE,
    grain: reducedFlash ? 0 : Math.floor(options.clock * FILM_LEAK.framesPerSecond),
  });
}
