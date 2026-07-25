// What silence buys you.
//
// The claim this file exists to defend is that staying quiet cannot make the
// encounter go away. It is NOT that the HUSH walks straight at you: prowling
// picks a loosely player-anchored point in the WORLD, commits to it, and then
// DWELLS for up to three and a half seconds on arrival (see updatePresence) —
// so the distance it closes in any particular ten seconds is noise.
//
// The old assertion was `after < before - 8` over a single unseeded ten-second
// window, which was false about eight times in a hundred and made `npm test`
// intermittently red. Measured over 3200 runs at four horizons, the distance
// does not converge to zero at all — it plateaus and hovers. What IS invariant,
// every single run, is the pair of claims the design actually makes:
//
//   · it never gains ground on you. Not once, at any horizon.
//   · it always closes some. Silence buys time, never escape.
//
// Both are asserted here across a seeded sweep, so this is a statement about the
// behaviour rather than about one lucky roll.

import assert from 'node:assert/strict';

globalThis.document ||= { title: 'Chunk Surfer', baseURI: 'http://localhost/' };
globalThis.window ||= globalThis;

const PRES = await import('../src/game/presence.js');

// A fixed stream, so a red run is a real regression and can be re-run to the
// same numbers. mulberry32.
function seedRandom(seed) {
  const original = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => { Math.random = original; };
}

const restore = seedRandom(0x5EB1);

// One quiet pursuit: spawn behind, never make a sound, and watch.
function pursue(seconds, step = 0.25) {
  PRES.spawnBehind(0, 0, 0, 1);
  const before = PRES.distanceTo(0, 0);
  let worst = before;
  for (let i = 0; i < Math.round(seconds / step); i += 1) {
    PRES.updatePresence(step, 0, 0, null);
    worst = Math.max(worst, PRES.distanceTo(0, 0));
  }
  const after = PRES.distanceTo(0, 0);
  const mode = PRES.presenceState().motionMode;
  PRES.despawn();
  return { before, after, worst, closed: before - after, mode };
}

// ── it arrives inside the encounter band ────────────────────────────────────
const first = pursue(0);
assert.ok(first.before <= 23 * 2, 'HUSH spawns within the revised encounter distance');

// ── silence buys time, never escape ─────────────────────────────────────────
const horizons = [8, 12, 30, 60];
const runsPer = 60;
let closedTotal = 0;
let worstClosed = Infinity;
for (const seconds of horizons) {
  for (let run = 0; run < runsPer; run += 1) {
    const r = pursue(seconds);
    assert.ok(
      r.worst <= r.before + 1e-9,
      `HUSH must never gain ground on a silent player (${seconds}s: spawned ${r.before.toFixed(2)}, drifted to ${r.worst.toFixed(2)})`,
    );
    assert.ok(
      r.closed > 0.5,
      `HUSH must always close some ground (${seconds}s: closed only ${r.closed.toFixed(3)})`,
    );
    assert.equal(r.mode, 'stalk', 'a HUSH with nothing to chase is stalking, not idle');
    closedTotal += r.closed;
    worstClosed = Math.min(worstClosed, r.closed);
  }
}
const meanClosed = closedTotal / (horizons.length * runsPer);
// It is hunting, not merely failing to leave. Measured mean is ~18 cells; the
// floor here is deliberately loose so a feel retune does not fail the build,
// while a HUSH that stopped hunting still would.
assert.ok(meanClosed > 8, `a silent player is still being hunted (mean closed ${meanClosed.toFixed(2)})`);

// ── and it does not lose interest over a long quiet ─────────────────────────
// The plateau is the design: it settles into the near band and waits there. What
// must not happen is that a long silence walks it back out of the encounter.
const long = pursue(180);
assert.ok(long.worst <= long.before + 1e-9, 'three minutes of silence does not let it drift away');
assert.ok(long.after < long.before, 'nor leaves it exactly where it started');

restore();
console.log(`presence pursuit specs passed (${horizons.length * runsPer} pursuits, min closed ${worstClosed.toFixed(2)}, mean ${meanClosed.toFixed(2)})`);
