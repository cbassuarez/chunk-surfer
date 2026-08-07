// THE LONG STARE.
//
// The yard is the only place in this game with a sky over it, and the sky moves
// now: a deck lit from underneath by a city, running west, with a moon behind it
// (see nightSky in render/r3d.js). A player who stops walking and watches it is
// doing the one thing the arrival was rebuilt to make possible.
//
// So something notices.
//
// Stand still out there for three quarters of a minute — looking around is
// allowed and is rather the point; only your feet have to stop — and when you
// next turn round there is a chair in the middle of the yard, in the rain,
// facing the way you were facing. Nothing happens. It is not interactive, it
// makes no sound, there is no prompt and no notice. It is simply there, and it
// was not there before.
//
// THE REWARD IS THE NOTICING, NOT THE WAITING. The pin is granted when the chair
// is actually in front of the player's eyes and close enough to be read as a
// chair — not when it is placed. A player who stands still with their back to it
// and then walks off has genuinely not seen anything, and the building has not
// told them anything either.
//
// It is the fourth pin in the game and the first that is not hidden inside a
// piece of furniture (see PIN_SOURCES in game/combat-progression.js). It arrives
// with no announcement at all: the next time the bag is opened there is an extra
// unspent pin in the skills tree, and working out where it came from is the
// player's problem.

export const VIGIL = Object.freeze({
  // Long enough that it cannot be reached by pausing to read a prompt, short
  // enough that somebody who is genuinely watching the weather will reach it.
  HOLD_SECONDS: 45,
  // A step, in cells, that counts as having moved. The player's position is
  // integral, so anything above zero is "a step was taken".
  MOVE_EPSILON: 0.01,
  // How close, and how far off-axis, the chair has to be before looking at it
  // counts as having seen it. Twelve metres in this weather is about as far as a
  // wooden chair reads as a wooden chair.
  SEE_RANGE_M: 12,
  SEE_COS: 0.72,                 // ~44 degrees off the view axis
  // Behind, and far enough back that it cannot appear inside the frame. The
  // yard is fifty metres wide; this is a walk, not a jump scare.
  PLACE_MIN_M: 5.5,
  PLACE_MAX_M: 9.0,
  PROP_ID: 'yard-vigil-chair',
  MESH: 'wooden_chair_01',
  FLAG: 'pin.yard',
});

export function freshVigilState() {
  return { held: 0, placed: false, seen: false, at: null };
}

// Reduce one frame of standing about. Pure: everything it needs is passed in,
// which is what makes it testable without a browser.
//
//   dt        seconds since the last frame
//   eligible  is the player outdoors, in story, with nothing over the world
//   moved     did the player's cell change this frame
//   see       { dist, cos } from the player to the chair, or null
//
// Returns the next state plus, at most, one of two events: `place` on the frame
// the hold completes, and `earn` on the frame the chair is first seen.
export function reduceVigil(state, { dt = 0, eligible = false, moved = false, see = null } = {}) {
  const next = { ...state };
  if (!next.placed) {
    if (!eligible || moved) {
      next.held = 0;
      return { state: next, place: false, earn: false };
    }
    next.held += Math.max(0, dt);
    if (next.held < VIGIL.HOLD_SECONDS) return { state: next, place: false, earn: false };
    next.placed = true;
    next.held = VIGIL.HOLD_SECONDS;
    return { state: next, place: true, earn: false };
  }
  if (next.seen || !see) return { state: next, place: false, earn: false };
  const inSight = see.dist <= VIGIL.SEE_RANGE_M && see.cos >= VIGIL.SEE_COS;
  if (!inSight) return { state: next, place: false, earn: false };
  next.seen = true;
  return { state: next, place: false, earn: true };
}

// Where the chair goes: behind the player, on the far side of the shoulder they
// are least likely to be facing, turned to look back the way they were looking.
// Returned in the same authored-metre space the caller passes in.
// `cellsPerMetre` is not optional decoration: the player's position is in
// RUNTIME CELLS and PLACE_MIN_M/PLACE_MAX_M are in metres, and a cell is half a
// metre. Passing 1 puts the chair at half the distance it says on the tin.
export function vigilSeat({ x, y, forwardX, forwardY, cellsPerMetre = 1 }) {
  const len = Math.hypot(forwardX, forwardY) || 1;
  const fx = forwardX / len, fy = forwardY / len;
  const back = ((VIGIL.PLACE_MIN_M + VIGIL.PLACE_MAX_M) / 2) * cellsPerMetre;
  // A little off the axis, so it is not sitting in the player's own footprints.
  const side = 1.6 * cellsPerMetre;
  return {
    x: x - fx * back - fy * side,
    y: y - fy * back + fx * side,
    // Facing the way he was: the chair is watching what he was watching.
    yaw: Math.atan2(fx, -fy),
  };
}

export function normalizeVigilState(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    held: Math.max(0, Math.min(VIGIL.HOLD_SECONDS, Number(v.held) || 0)),
    placed: !!v.placed,
    seen: !!v.seen,
    at: v.at && Number.isFinite(Number(v.at.x)) && Number.isFinite(Number(v.at.y))
      ? { x: Number(v.at.x), y: Number(v.at.y), yaw: Number(v.at.yaw) || 0 }
      : null,
  };
}
