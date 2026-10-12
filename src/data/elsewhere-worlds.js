// SOMEWHERE ELSE: the worlds behind the door-field doors.
//
// Out past the tape both roads end in a corridor of door frames. The ones that
// open show one of these — a whole place with its own weather, drawn with real
// depth behind the frame (src/render/elsewhere-glsl.js) — and they leak its light
// and its sound while they stand there (src/audio/elsewhere-beds.js). Walking
// through one is a few seconds spent inside it; then it folds shut behind you and
// the door is gone.
//
// Pure data and timing, so the runtime, the renderer, the audio and the specs
// all agree on the same six places.
export const ELSEWHERE_WORLDS = Object.freeze([
  // A basalt plain split by glowing fissures, toppled pylons, a red sun.
  Object.freeze({ id: 'burning', leak: Object.freeze([1.0, 0.38, 0.08]), bed: 'burning' }),
  // A still black sea to every horizon, drowned spires, a half-sunk wheel.
  Object.freeze({ id: 'flood', leak: Object.freeze([0.55, 0.70, 0.52]), bed: 'flood' }),
  // The ground overhead with the city hanging off it; the sky underfoot.
  Object.freeze({ id: 'inverted', leak: Object.freeze([0.78, 0.84, 0.95]), bed: 'wind-high' }),
  // Ash dunes burying a road of leaning lamps, under a banded planet.
  Object.freeze({ id: 'two-moons', leak: Object.freeze([0.80, 0.62, 0.42]), bed: 'sand' }),
  // Obsidian under lightning, and a tornado that has stopped turning.
  Object.freeze({ id: 'glass-storm', leak: Object.freeze([0.52, 0.58, 1.0]), bed: 'storm' }),
  // Snow to the edge of sight, power lines, one lit window.
  Object.freeze({ id: 'whiteout', leak: Object.freeze([0.92, 0.95, 1.0]), bed: 'wind-low' }),
  // ── THE TOWER ROAD'S OWN (docs/plans/door-field-station.md). The chapel road
  // keeps the six above; the tower road's field opens onto the flood and these
  // four, which are further gone and carry the last recordist's story.
  //
  // A primary school hall with the roof gone: snow on the chairs set out for a
  // concert, the stage lights still on.
  Object.freeze({ id: 'school-hall', leak: Object.freeze([1.0, 0.88, 0.66]), bed: 'hall' }),
  // Magnetic tape unspooled over a whole landscape like dead grass, reels as big
  // as hills, the wind playing it.
  Object.freeze({ id: 'tape-field', leak: Object.freeze([0.72, 0.62, 0.45]), bed: 'tape' }),
  // Ellery far in the future, half buried, its towers the only thing above the ash.
  Object.freeze({ id: 'ash-building', leak: Object.freeze([0.78, 0.72, 0.62]), bed: 'ash' }),
  // A plain of television snow, flickering, and a transmitter mast whose light
  // still blinks.
  Object.freeze({ id: 'dead-broadcast', leak: Object.freeze([0.62, 0.70, 0.78]), bed: 'broadcast' }),
]);

// Which worlds each road's door field opens onto: the chapel road the first six,
// the tower road the flood and its own four.
export const CHAPEL_WORLD_SET = Object.freeze([0, 1, 2, 3, 4, 5]);
export const TOWER_WORLD_SET = Object.freeze([1, 6, 7, 8, 9]);

// The road's own door leaks the building, not a world.
export const ROUTE_DOOR_LEAK = Object.freeze([1.0, 0.86, 0.62]);

// Seconds. Open is the world growing out of the doorway to fill the view; hold
// is standing in it; fold is it closing back down to a doorway and shutting.
export const ELSEWHERE_CROSSING = Object.freeze({ open: 0.35, hold: 2.2, fold: 0.6 });
export const ELSEWHERE_CROSSING_SECONDS = ELSEWHERE_CROSSING.open + ELSEWHERE_CROSSING.hold + ELSEWHERE_CROSSING.fold;

const ease = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
const unit = (value) => value - Math.floor(value);

// Where a crossing is at `now` (seconds, same clock it started on), or null once
// it is over. `reveal` is how much of the view the world covers.
export function elsewhereCrossingFrame(crossing, now) {
  if (!crossing || !Number.isFinite(crossing.startedAt) || !Number.isFinite(now)) return null;
  const elapsed = now - crossing.startedAt;
  const { open, hold, fold } = ELSEWHERE_CROSSING;
  if (elapsed < 0 || elapsed >= ELSEWHERE_CROSSING_SECONDS) return null;
  if (elapsed < open) {
    const progress = elapsed / open;
    return { phase: 'open', progress, reveal: ease(progress), elapsed };
  }
  if (elapsed < open + hold) return { phase: 'hold', progress: (elapsed - open) / hold, reveal: 1, elapsed };
  const progress = (elapsed - open - hold) / fold;
  return { phase: 'fold', progress, reveal: 1 - ease(progress), elapsed };
}

// A LOCKED DOOR ANSWERS. About half of them have something behind them. It lets
// the first try go; from the second, it tries the handle back or knocks. It never
// opens the door.
export const LOCKED_DOOR_ANSWER_LINES = Object.freeze({
  rattle: Object.freeze([
    'Something on the other side tries it back.',
    'The handle turns from the other side. Then stops.',
  ]),
  knock: Object.freeze([
    'Three knocks. Not mine.',
    'It knocks back. Slower than I did.',
  ]),
});

export function lockedDoorAnswer(seed, attempts) {
  const s = Number(seed);
  if (!Number.isFinite(s) || !(Number(attempts) >= 2)) return null;
  if (unit(Math.sin(s * 97.31 + 1.7) * 43758.5453) >= 0.5) return null;
  const kind = unit(Math.sin(s * 57.7 + 3.1) * 24634.6345) < 0.5 ? 'rattle' : 'knock';
  const lines = LOCKED_DOOR_ANSWER_LINES[kind];
  return {
    kind,
    delayMs: Math.round(700 + unit(Math.sin(s * 13.1 + attempts * 1.93) * 9631.3) * 900),
    line: lines[(Math.floor(attempts) - 2) % lines.length],
  };
}
