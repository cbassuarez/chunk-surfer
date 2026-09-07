// THE POOL IS DANGEROUS, NOT THE VERB.
//
// The natatorium fight used to be a RECORDING battle — `maybeBattle` fired it
// only when the tub happened to be your SECOND take, on the `recording-2`
// occasion, past 18% of the minute. Record the rooms in any other order and the
// fight did not exist; and when it did, it existed because you had pressed a
// key rather than because of where you were standing.
//
// It is the place now. You cannot get a take from the coping — the room is six
// metres of tile handing every sound back four times, and the only honest
// position is out in the middle of the basin. So the take needs you exactly
// where it is worst, and that one fact is the whole encounter:
//
//   deck      no take, nothing comes
//   rim       a take, badly placed, and it notices
//   middle    the take you came for, and it is already moving
//
// ONE NUMBER. Centrality, from the basin's own normalised uv (waterUvForPoint),
// drives the refusal, the take's recorded place, and the pressure. There is no
// second dial to keep in step with it.
//
// TWO STATES, TWO FEARS. The pool is DRAINED on a first run and only fills once
// the player has seen an ending, so both have to carry the beat:
//
//   DRAINED  cornered. The west stair is the only way out and it is in the
//            north-west corner, so every step toward the middle is a step away
//            from the only exit. The geometry already does this for free.
//   MURKY    held under. Standing on the basin floor the eye sits at -0.38
//            against a water level of -0.12 — you are ALREADY twenty-six
//            centimetres below the surface out there. It is not trying to pull
//            you down. It is trying not to let you back up.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const NATATORIUM_DREAD = Object.freeze({
  // Below this the basin is not giving you a usable image and the recorder says
  // so. Measured in centrality, so it is a ring inset from the rim rather than a
  // radius in metres — the basin is 12x16m and a circle would refuse one axis
  // long before the other.
  takeCentrality: 0.34,
  // The centre proper. A take rolled here is the one he came for.
  centreCentrality: 0.66,
  // Approach, in runtime cells outside the basin rectangle, at which the room
  // starts to attend to you. Matches the ripple `proximity` source, which
  // already keys off 3.0 cells — the water noticing and the room noticing
  // should not be two different distances.
  noticeCells: 3.0,
  // Seconds of dwell at full centrality before it comes. Scaled by centrality,
  // so loitering at the rim takes far longer than standing in the middle.
  dwellSeconds: 7.5,
  // The rim is not safe, it is just slow. Without a floor here, standing exactly
  // on the refusal line would never accumulate anything at all.
  rimShare: 0.22,
  // THE DECK CAN NEVER FINISH IT. Approach builds a little attention — the room
  // knows you are looking at it — but it stops here, so a player who stands on
  // the coping forever is never ambushed for it. Only being IN the basin can
  // carry the last of it.
  approachCeiling: 0.55,
  // It cools off if you get out, but not instantly — leaving and stepping back
  // in must not be a way to farm a clean approach.
  recoverPerSecond: 0.14,
});

// WHERE IN THE BASIN. 0 at the rim, 1 at the middle.
//
// Chebyshev rather than Euclidean, because the basin is a rectangle and the
// player should reach "the middle" at the same centrality from the long side as
// from the short one. A circular measure would call the north edge central.
export function basinCentrality(uv) {
  if (!uv) return 0;
  const u = clamp01(uv.u), v = clamp01(uv.v);
  return clamp01(1 - 2 * Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)));
}

// Is this a position a take may be rolled from?
export function centralityAllowsTake(centrality) {
  return clamp01(centrality) >= NATATORIUM_DREAD.takeCentrality;
}

// What the tape records about where it was rolled. `null` means the take is not
// permitted from here at all — see centralityAllowsTake.
export function centralityPlace(centrality) {
  const c = clamp01(centrality);
  if (c < NATATORIUM_DREAD.takeCentrality) return null;
  return c >= NATATORIUM_DREAD.centreCentrality ? 'centre' : 'shallow';
}

// How fast the room is filling up with attention, at this position. Returns 0
// on the deck and beyond, so nothing accumulates until you are at least near
// the rim.
export function dreadRate({ centrality = 0, inBasin = false, approachCells = Infinity } = {}) {
  if (inBasin) {
    const c = clamp01(centrality);
    // The rim is slow, not safe.
    return NATATORIUM_DREAD.rimShare + (1 - NATATORIUM_DREAD.rimShare) * c;
  }
  const cells = Number(approachCells);
  if (!Number.isFinite(cells) || cells > NATATORIUM_DREAD.noticeCells) return 0;
  // Standing on the coping is the shallowest attention there is. It is not
  // nothing — the room knows you are looking at it — but it will not finish.
  return NATATORIUM_DREAD.rimShare * 0.5 * (1 - cells / NATATORIUM_DREAD.noticeCells);
}

export function freshNatatoriumDread() {
  return { pressure: 0, seconds: 0, fired: false };
}

// Pure step. `state` in, `state` out, plus whether this is the tick it comes on.
//
// Deliberately knows nothing about recording. The old trigger asked
// `REC.isRecording()` and that is the thing being undone: a take may be running
// or not, and it changes nothing here.
export function stepNatatoriumDread(state, dt = 0, input = {}) {
  const previous = state || freshNatatoriumDread();
  const seconds = Math.max(0, Math.min(0.25, Number(dt) || 0));
  const rate = dreadRate(input);
  const next = { ...previous, seconds: previous.seconds + seconds };

  if (rate <= 0) {
    next.pressure = Math.max(0, previous.pressure - seconds * NATATORIUM_DREAD.recoverPerSecond);
    return { state: next, fires: false, rate };
  }

  const raised = clamp01(previous.pressure + (seconds * rate) / NATATORIUM_DREAD.dwellSeconds);
  next.pressure = input.inBasin ? raised
    : Math.min(raised, Math.max(previous.pressure, NATATORIUM_DREAD.approachCeiling));
  // Once per run, and only from inside. `fired` is the module's own latch; the
  // encounter ledger is still the authority, and main.js checks both.
  const fires = !previous.fired && !!input.inBasin && next.pressure >= 1 && !!input.armed;
  if (fires) next.fired = true;
  return { state: next, fires, rate };
}

// The two characters, so the caller does not restate them. `water` is a
// NATATORIUM_WATER_STATES value.
export function natatoriumDreadCharacter(water) {
  return water === 'murky'
    ? Object.freeze({
      id: 'murky',
      // It is between you and the surface, and the surface is already above
      // your head out here.
      staging: 'surface',
      line: 'held under',
    })
    : Object.freeze({
      id: 'drained',
      // It is between you and the west stair, which is the only way out of a
      // two-metre concrete box.
      staging: 'stair',
      line: 'cornered',
    });
}
