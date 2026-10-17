// The eyes from the fountain, and what they are owed.
//
// One gallery head survives with damaged, empty sockets; another is a fragment.
// The damage is old and somebody swept up after it. What they swept up is not the piece: the eyes have
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
  // Both eyes seated in the gallery face. The bust talks once this is true.
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

// The legacy prop ID stays stable in saves and authored dialogue. Its complete,
// damaged head now survives around actual empty eye sockets.
export const MARBLE_HEAD_BUST = 'academic-bust-fragment-3';
export const GALLERY_TURN_BUST = 'academic-bust-2';
const GALLERY_BUST_IDS = new Set(['academic-bust-1', GALLERY_TURN_BUST,
  MARBLE_HEAD_BUST, 'academic-bust-4', 'academic-bust-5', 'academic-bust-fragment-6']);

const fresh = () => ({ schema: 2, phase: MARBLE_HEAD_PHASE.IN_THE_WATER,
  toldWhereTheKeyIs: false, gallery: { spoken: [], turned: false } });

let state = fresh();

export function normalizeMarbleHead(saved = {}) {
  const source = saved && typeof saved === 'object' ? saved : {};
  const phase = Object.values(MARBLE_HEAD_PHASE).includes(source.phase)
    ? source.phase
    : MARBLE_HEAD_PHASE.IN_THE_WATER;
  return {
    schema: 2,
    phase,
    // Whether the bust has already said where the key went. It says it once, and
    // then it will repeat it, because it is the only useful thing it knows and
    // it would be cruel to make somebody find the park twice.
    toldWhereTheKeyIs: !!source.toldWhereTheKeyIs || phase === MARBLE_HEAD_PHASE.RETURNED,
    gallery: {
      spoken: [...new Set((Array.isArray(source.gallery?.spoken) ? source.gallery.spoken : [])
        .filter((id) => GALLERY_BUST_IDS.has(id)))],
      turned: source.gallery?.turned === true,
    },
  };
}

export function loadMarbleHead(saved = {}) { state = normalizeMarbleHead(saved); return marbleHeadState(); }
export function resetMarbleHead() { state = fresh(); return marbleHeadState(); }
export function marbleHeadState() { return { ...state, gallery: { ...state.gallery, spoken: [...state.gallery.spoken] } }; }
export function saveMarbleHead() { return marbleHeadState(); }

export function marbleHeadInWater() { return state.phase === MARBLE_HEAD_PHASE.IN_THE_WATER; }
// Settled either way — taken or refused. The prop leaves the water on both.
export function marbleHeadSettled() { return state.phase !== MARBLE_HEAD_PHASE.IN_THE_WATER; }
export function marbleHeadDeclined() { return state.phase === MARBLE_HEAD_PHASE.DECLINED; }
export function carryingMarbleHead() { return state.phase === MARBLE_HEAD_PHASE.CARRIED; }
export function marbleHeadReturned() { return state.phase === MARBLE_HEAD_PHASE.RETURNED; }

// Geometry is reconstructed from the decision, including after reload. Returning
// two eyes fills two sockets; it never replaces a jaw fragment with a new head.
export function marbleGalleryAppearance() {
  return { mesh: marbleHeadReturned() ? 'academic_bust_socketed_returned' : 'academic_bust_socketed',
    yaw: -.12, elevation: 1.10, eyes: marbleHeadReturned() ? 'seated' : 'empty' };
}

export function noteGalleryBustSpoken(propId) {
  if (!GALLERY_BUST_IDS.has(propId) || state.gallery.spoken.includes(propId)) return false;
  state.gallery.spoken.push(propId);
  return true;
}

export function galleryBustTurnPending() {
  return !state.gallery.turned && state.gallery.spoken.includes(GALLERY_TURN_BUST);
}

// The caller applies this only while the head is outside the player's sight.
// Saving the receipt ensures its authored, once-only turn survives rebuilding.
export function completeGalleryBustTurn() {
  if (!galleryBustTurnPending()) return false;
  state.gallery.turned = true;
  return true;
}

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

// Only this face has the corresponding empty sockets. The other broken station
// has lost its upper face, so there is nowhere to seat the pair.
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
