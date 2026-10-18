// THE LONG STARE.
//
// The old arrival vigil now belongs to the city seat at the far end of the
// school roof. The view is allowed to last: forty-five seated seconds, with
// ordinary head control and no countdown or announcement.
//
// So something notices.
//
// Sit there for three quarters of a minute — looking around is allowed and is
// rather the point — and when you next turn round there is a chair on the roof,
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
// It is the fourth spare lead in the game and the only one that is not hidden
// inside a piece of furniture (see PIN_SOURCES in game/combat-progression.js —
// the flag id is still `pin.yard` because it is in saved games).
//
// SOMEBODY LEAVES IT. The person at the microphone has already said "mind the
// cable — the black one is mine; the orange one belongs to somebody who left
// before dinner" (data/exterior-vigil.js). The orange one is still there, and a
// man who has spent forty-five seconds looking at the city notices its absence.
//
// It arrives with no announcement at all: the next time the case is opened
// there is one more lead on the back of the recorder than there was, and
// working out where it came from is the player's problem.

export const VIGIL = Object.freeze({
  SCHEMA: 2,
  LOCATION: 'roof-city-seat',
  RENDER_GROUP: 'academicRoof',
  FLOOR: 17,
  // Long enough that it cannot be reached by pausing to read a prompt, short
  // enough that somebody watching the city will reach it.
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
  // chair stays behind a shoulder on supported roof, never over the drop.
  PLACE_MIN_M: 5.5,
  PLACE_MAX_M: 9.0,
  PROP_ID: 'yard-vigil-chair',
  MESH: 'wooden_chair_01',
  FLAG: 'pin.yard',
});

export function freshVigilState() {
  return { schema: VIGIL.SCHEMA, location: VIGIL.LOCATION, held: 0, placed: false, seen: false, at: null };
}

// Reduce one frame of standing about. Pure: everything it needs is passed in,
// which is what makes it testable without a browser.
//
//   dt        seconds since the last frame
//   eligible  is the city-seat scene settled, active and unobscured
//   moved     did the player's cell change this frame
//   see       { dist, cos } from the player to the chair, or null
//
// Returns the next state plus, at most, one of two events: `place` on the frame
// the hold completes, and `earn` on the frame the chair is first seen.
export function reduceVigil(state, { dt = 0, eligible = false, moved = false, see = null } = {}) {
  const next = { ...state };
  if (next.seen) return { state: next, place: false, earn: false };
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
  if (!see) return { state: next, place: false, earn: false };
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
  return vigilSeatCandidates({ x, y, forwardX, forwardY, cellsPerMetre })[0];
}

// THE SEAT, AND ITS SECOND CHOICES.
//
// Either shoulder may be occupied by the roof's planted architecture. Keep the
// original distances and both sides, testing the entire footprint against the
// compiled roof before choosing. A failed placement is another quiet visit,
// never a chair over the edge. Order: ideal shoulder, opposite, nearer, wider.
export function vigilSeatCandidates({ x, y, forwardX, forwardY, cellsPerMetre = 1 }) {
  const len = Math.hypot(forwardX, forwardY) || 1;
  const fx = forwardX / len, fy = forwardY / len;
  const mid = (VIGIL.PLACE_MIN_M + VIGIL.PLACE_MAX_M) / 2;
  // Facing the way he was: the chair is watching what he was watching.
  const yaw = Math.atan2(fx, -fy);
  const at = (backM, sideM) => ({
    x: x - fx * backM * cellsPerMetre - fy * sideM * cellsPerMetre,
    y: y - fy * backM * cellsPerMetre + fx * sideM * cellsPerMetre,
    yaw,
  });
  return [
    at(mid, 1.6),
    at(mid, -1.6),
    at(VIGIL.PLACE_MIN_M, 1.6),
    at(VIGIL.PLACE_MIN_M, -1.6),
    at(VIGIL.PLACE_MAX_M, 2.8),
    at(VIGIL.PLACE_MAX_M, -2.8),
  ];
}

// WHICH SHOULDER IT IS OVER, as a stereo pan in -1..1.
//
// Retained for callers measuring the authored shoulder. The roof event itself
// has no placement sound: the city hold is quiet, and noticing stays voluntary.
export function vigilPan({ seatX, seatY, x, y, forwardX, forwardY }) {
  const len = Math.hypot(forwardX, forwardY) || 1;
  const fx = forwardX / len, fy = forwardY / len;
  const dx = seatX - x, dy = seatY - y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return 0;
  // Positive cross product is the player's right in this handedness (forward is
  // +x with a screen-down +y), so the sign is the shoulder.
  const cross = (fx * dy - fy * dx) / d;
  return Math.max(-1, Math.min(1, cross));
}

export function normalizeVigilState(value, { rewarded = false } = {}) {
  const v = value && typeof value === 'object' ? value : {};
  // Old saves keep their earned lead, including the build's folded reward.
  // Their unearned yard coordinates and partial wait cannot seed a roof event.
  const seen = !!rewarded || !!v.seen;
  if (v.schema !== VIGIL.SCHEMA || v.location !== VIGIL.LOCATION) {
    return { ...freshVigilState(), seen };
  }
  const at = v.at && Number.isFinite(Number(v.at.x)) && Number.isFinite(Number(v.at.y))
    ? { x: Number(v.at.x), y: Number(v.at.y), yaw: Number(v.at.yaw) || 0 }
    : null;
  return {
    schema: VIGIL.SCHEMA,
    location: VIGIL.LOCATION,
    held: Math.max(0, Math.min(VIGIL.HOLD_SECONDS, Number(v.held) || 0)),
    placed: !!v.placed && !!at,
    seen,
    at: v.placed ? at : null,
  };
}
