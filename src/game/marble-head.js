// The eyes from the fountain, and what they are owed.
//
// Two of the six busts in the academic gallery are a plinth and the bottom third
// of a face — jaw, part of a mouth, no eyes. The break is old and clean and
// somebody swept up after it. What they swept up is not the piece: the eyes have
// been lying in a municipal fountain in the park across the yard, among the
// pennies, which is not where a thing ends up by being dropped. Somebody carried
// them out there and put them in the water, and you do that to a face you do not
// want looking at you.
//
// So this is not a fetch quest with a step missing. It is a small decision:
// notice them, work out what they are, and then either undo what was done or
// leave it done. This module is the whole of that state — in the water, carried,
// returned, or DECLINED — and it is deliberately small. The interesting part is
// not the bookkeeping, it is that the bust with its eyes back has been standing
// in that gallery the entire time and has been watching.
//
// Pure. No rendering, no audio, no save access.

export const MARBLE_HEAD_PHASE = Object.freeze({
  // In the water, where it has been since before tonight.
  IN_THE_WATER: 'in-the-water',
  // In the bag. Heavier than anything else in there.
  CARRIED: 'carried',
  // Back on its plinth. The bust talks once this is true.
  RETURNED: 'returned',
  // Found, understood, and left in the water on purpose.
  //
  // Terminal for the run, and that is the point: a decision you can walk back to
  // and reverse ten minutes later is not a decision, it is a menu. The eyes are
  // gone from the basin either way — what differs is whether they are in the bag
  // or still at the bottom of a fountain with the pennies. Nothing after this
  // ever satisfies marbleHeadFits(), so the bust stays blind for the night and
  // the plant key under its felt stays where it is.
  DECLINED: 'declined',
});

// The station it belongs to. Two gallery busts are fragments; this is the one
// whose break matches. See BUST_TREES in main.js.
export const MARBLE_HEAD_BUST = 'academic-bust-fragment-3';

const fresh = () => ({ schema: 1, phase: MARBLE_HEAD_PHASE.IN_THE_WATER, toldWhereTheKeyIs: false });

let state = fresh();

export function normalizeMarbleHead(saved = {}) {
  const source = saved && typeof saved === 'object' ? saved : {};
  const phase = Object.values(MARBLE_HEAD_PHASE).includes(source.phase)
    ? source.phase
    : MARBLE_HEAD_PHASE.IN_THE_WATER;
  return {
    schema: 1,
    phase,
    // Whether the bust has already said where the key went. It says it once, and
    // then it will repeat it, because it is the only useful thing it knows and
    // it would be cruel to make somebody find the park twice.
    toldWhereTheKeyIs: !!source.toldWhereTheKeyIs || phase === MARBLE_HEAD_PHASE.RETURNED,
  };
}

export function loadMarbleHead(saved = {}) { state = normalizeMarbleHead(saved); return marbleHeadState(); }
export function resetMarbleHead() { state = fresh(); return marbleHeadState(); }
export function marbleHeadState() { return { ...state }; }
export function saveMarbleHead() { return marbleHeadState(); }

export function marbleHeadInWater() { return state.phase === MARBLE_HEAD_PHASE.IN_THE_WATER; }
// Settled either way — taken or refused. The prop leaves the water on both.
export function marbleHeadSettled() { return state.phase !== MARBLE_HEAD_PHASE.IN_THE_WATER; }
export function marbleHeadDeclined() { return state.phase === MARBLE_HEAD_PHASE.DECLINED; }
export function carryingMarbleHead() { return state.phase === MARBLE_HEAD_PHASE.CARRIED; }
export function marbleHeadReturned() { return state.phase === MARBLE_HEAD_PHASE.RETURNED; }

export function collectMarbleHead() {
  if (state.phase !== MARBLE_HEAD_PHASE.IN_THE_WATER) return false;
  state.phase = MARBLE_HEAD_PHASE.CARRIED;
  return true;
}

// Left in the water, knowingly. One way only: nothing promotes DECLINED back.
export function declineMarbleHead() {
  if (state.phase !== MARBLE_HEAD_PHASE.IN_THE_WATER) return false;
  state.phase = MARBLE_HEAD_PHASE.DECLINED;
  return true;
}

// Whether this bust is the one the head fits. The other fragment is a different
// break and a different face, and offering it the wrong piece should say so.
export function marbleHeadFits(propId) {
  return propId === MARBLE_HEAD_BUST;
}

export function returnMarbleHead(propId) {
  if (state.phase !== MARBLE_HEAD_PHASE.CARRIED) return false;
  if (!marbleHeadFits(propId)) return false;
  state.phase = MARBLE_HEAD_PHASE.RETURNED;
  state.toldWhereTheKeyIs = true;
  return true;
}
