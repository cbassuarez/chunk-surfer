// Physical interaction for the heating-header incident.
//
// The persisted incident owns whether the pipe is open or sealed. This module
// owns the hand movement between those facts: real clockwise travel on a stack
// of fittings, a separate subjective rear hiss, and the look-back.
//
// NOTHING HERE CAN CREATE PRESENCE, NOISE BELIEF, A CONTACT, OR A SAVED HUSH.
// The figure the player turns around and sees is an apparition — a rendering
// event, on the rule emergency-light-runtime.js states in its first line — and
// this module only says how near it has been allowed to come. It cannot reach
// the simulation and it cannot reach the save.
//
// THE TREE, AND WHY IT IS NOT A PROGRESS BAR.
//
// This was one handwheel turned continuously against a meter, which is a
// distance to cover: hold the key, watch the bar, done. A header is a stack of
// fittings, and the thing that makes closing one interesting is that it does not
// stay closed while you are attending to the next. So the fittings LOOSEN each
// other, and the repair is a state to hold rather than a distance to cover. You
// close the nut, hear the gland going, and come back.
//
// The bar is gone with it. The hiss is the readout — every fitting that seats
// drops the pipe a step — so the repair is something you hear finishing.

const TAU = Math.PI * 2;
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

// Total hand travel, by tool. Unchanged: the two wrenches differ in distance and
// — since the rewrite — in how loud they are, which is the part that costs.
export const PLANT_VALVE_TURNS = Object.freeze({
  spanner: 1.35,
  stillson: 2.6,
});

// THE STACK, TOP DOWN, AND THE ORDER IS THE ORDER YOU CLOSE THEM IN.
//
// `share` divides the tool's total travel, so changing PLANT_VALVE_TURNS still
// changes the whole repair and the three keep their proportions.
//
// `backslide` is radians per second lost while a fitting is NOT the one in hand.
// It is the whole mechanic: the gland is the problem child because it is both
// the longest and the loosest, and the nut is short and stiff so it forgives
// being left. `seatedBackslide` is the reduced rate once a fitting has reached
// closed — a seated fitting is not undoing itself as fast as a slack one, which
// is what makes three simultaneously-closed fittings reachable at all.
export const PLANT_FITTINGS = Object.freeze([
  Object.freeze({
    id: 'back-nut',
    label: 'BACK NUT',
    note: 'Short and stiff. Seats the joint and mostly stays where it is put.',
    share: 0.22,
    backslide: 0.24,
    seatedBackslide: 0.10,
    stroke: 0.46,
  }),
  Object.freeze({
    id: 'gland',
    label: 'GLAND',
    note: 'Long and smooth, and it gives itself back faster than anything else on the tree.',
    share: 0.45,
    backslide: 0.55,
    seatedBackslide: 0.22,
    stroke: 0.42,
  }),
  Object.freeze({
    id: 'handwheel',
    label: 'HANDWHEEL',
    note: 'Heavy, and hot. Shuts the flow, and backs the two above it off while you lean on it.',
    share: 0.33,
    backslide: 0.38,
    seatedBackslide: 0.16,
    stroke: 0.38,
  }),
]);

export const PLANT_FITTING_IDS = Object.freeze(PLANT_FITTINGS.map((entry) => entry.id));

// THE ONE YOU DO NOT TOUCH.
//
// It is on the same tree and it is not part of this header. A wrench on it vents
// the line: loud, everything thrown slack, and the thing behind you takes a step
// for the noise. Recoverable and expensive, which is the only kind of failure a
// scene the player cannot lose should have.
export const PLANT_TRAP = Object.freeze({
  id: 'bypass-cock',
  label: 'BYPASS COCK',
  note: 'Feeds the return, not this header. Nothing on the card asks for it.',
});

// A SEATED FITTING HOLDS FOR A WHILE, AND THAT WINDOW IS THE GAME.
//
// Without this the microgame is unwinnable and it took simulating it to see
// why: backslide is continuous, so a fitting that un-seats the instant it loses
// a radian means only the fitting IN HAND can ever be seated, and "all three at
// once" can never happen. Seating latches at full travel and releases at 82% —
// so closing one buys you about three seconds to close the others, which is the
// hold the repair is actually made of.
const SEAT_RELEASE = 0.82;

const fittingById = new Map(PLANT_FITTINGS.map((entry) => [entry.id, entry]));

export function plantFitting(id) {
  return fittingById.get(String(id)) || null;
}

export function createPlantTree(tool = 'spanner') {
  const id = tool === 'stillson' ? 'stillson' : 'spanner';
  const total = PLANT_VALVE_TURNS[id] * TAU;
  const fittings = {};
  for (const entry of PLANT_FITTINGS) {
    fittings[entry.id] = { radians: 0, required: total * entry.share, progress: 0, seated: false };
  }
  return { tool: id, fittings, inHand: PLANT_FITTING_IDS[0], vents: 0, complete: false, sealedAt: null };
}

const rebuild = (tree) => (tree?.fittings && tree.tool ? tree : createPlantTree(tree?.tool));

const withFitting = (tree, id, next) => {
  const fittings = { ...tree.fittings, [id]: next };
  const complete = PLANT_FITTING_IDS.every((key) => fittings[key].seated);
  return { ...tree, fittings, complete };
};

/** Put the wrench on a fitting. The fourth is not a fitting; it is a mistake. */
export function selectPlantFitting(value, id) {
  const tree = rebuild(value);
  if (String(id) === PLANT_TRAP.id) return ventPlantHeader(tree);
  if (!fittingById.has(String(id))) return { tree, vented: false };
  return { tree: { ...tree, inHand: String(id) }, vented: false };
}

/**
 * A wrench on the bypass. Everything goes slack — including anything already
 * seated, because the line has just been repressurised behind it.
 */
export function ventPlantHeader(value) {
  const tree = rebuild(value);
  const fittings = {};
  for (const entry of PLANT_FITTINGS) {
    fittings[entry.id] = { radians: 0, required: tree.fittings[entry.id].required, progress: 0, seated: false };
  }
  return { tree: { ...tree, fittings, vents: tree.vents + 1, complete: false }, vented: true };
}

/** Clockwise travel on whatever is in hand. */
export function applyPlantRotation(value, radians = 0) {
  const tree = rebuild(value);
  const id = tree.inHand;
  const current = tree.fittings[id];
  if (!current) return tree;
  // One pointer packet cannot close a fitting. Bounding the contribution also
  // rejects cursor warps at the atan2 seam while preserving deliberate arcs.
  //
  // The bound is under the SHORTEST fitting's travel on the shorter tool — at
  // 0.72pi one flung packet seated the back nut outright, which is the thing
  // this line exists to prevent. It is still a large deliberate arc.
  const clockwise = Math.max(0, Math.min(Math.PI * 0.42, Number(radians) || 0));
  if (clockwise <= 0) return tree;
  const total = Math.min(current.required, current.radians + clockwise);
  const progress = clamp01(total / current.required);
  return withFitting(tree, id, { ...current, radians: total, progress, seated: progress >= 1 });
}

/**
 * Keyboard and controller accessibility is still physical: one press is one
 * short wrench heave, never a held key and never an elapsed-time completion.
 * The heave is sized per fitting, so the three feel different on a keyboard for
 * the same reason they feel different under a pointer.
 */
export function applyPlantStroke(value) {
  const tree = rebuild(value);
  const entry = plantFitting(tree.inHand) || PLANT_FITTINGS[0];
  return applyPlantRotation(tree, Math.PI * entry.stroke);
}

/**
 * Time passing loosens everything that is not in hand. This is the only place
 * elapsed time touches the repair, and it never closes anything — it can only
 * take travel away, so waiting can lose the microgame and can never win it.
 */
export function settlePlantTree(value, dt = 0) {
  const tree = rebuild(value);
  const elapsed = Math.max(0, Math.min(0.25, finite(dt, 0)));
  if (elapsed <= 0) return tree;
  let changed = false;
  const fittings = {};
  for (const entry of PLANT_FITTINGS) {
    const current = tree.fittings[entry.id];
    if (entry.id === tree.inHand || current.radians <= 0) { fittings[entry.id] = current; continue; }
    const rate = current.seated ? entry.seatedBackslide : entry.backslide;
    const radians = Math.max(0, current.radians - rate * elapsed);
    if (radians === current.radians) { fittings[entry.id] = current; continue; }
    const progress = clamp01(radians / current.required);
    // Latching: it stays seated until it has given back enough to matter.
    fittings[entry.id] = { ...current, radians, progress, seated: current.seated ? progress >= SEAT_RELEASE : progress >= 1 };
    changed = true;
  }
  if (!changed) return tree;
  const complete = PLANT_FITTING_IDS.every((key) => fittings[key].seated);
  return { ...tree, fittings, complete };
}

/** All three closed at once, which is the only way this is ever done. */
export function plantTreeComplete(value) {
  const tree = rebuild(value);
  return PLANT_FITTING_IDS.every((id) => tree.fittings[id].seated);
}

export function plantSeatedCount(value) {
  const tree = rebuild(value);
  return PLANT_FITTING_IDS.filter((id) => tree.fittings[id].seated).length;
}

const smooth = (value) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

// WHAT THE PIPE IS DOING, PER SEATED FITTING.
//
// The readout is the hiss, so the steps have to be big enough to hear as events
// rather than as a fade. The in-hand fitting moves the level a little way toward
// the next step so there is feedback while you are working, without telling you
// exactly where you are.
const HISS_STEPS = Object.freeze([1, 0.6, 0.28, 0]);

export function plantValveAudioFrame(base = {}, tree = null, { rearActive = true } = {}) {
  const seated = tree ? plantSeatedCount(tree) : 0;
  const here = HISS_STEPS[Math.min(HISS_STEPS.length - 1, seated)];
  const next = HISS_STEPS[Math.min(HISS_STEPS.length - 1, seated + 1)];
  const inHand = tree?.fittings?.[tree?.inHand];
  const within = inHand && !inHand.seated ? clamp01(inHand.progress) * 0.45 : 0;
  const pipe = Math.max(0, here + (next - here) * within);
  const transfer = smooth(1 - pipe);
  // The actual valve source closes. A louder, spatially separate copy rises
  // behind the listener, so the perceived hiss grows even as the pipe is being
  // made mechanically quiet. The monitor follows the real pipe, not the lie.
  const rear = rearActive ? 0.355 * transfer : 0;
  return {
    ...base,
    audible: pipe > 0.01 || rear > 0.01,
    world: Math.max(0, Number(base.world) || 0) * pipe,
    monitor: Math.max(0, Number(base.monitor) || 0) * pipe,
    rear,
    valveProgress: seated / PLANT_FITTING_IDS.length,
    seated,
  };
}

export function plantLookBackProgress(originYaw = 0, currentYaw = 0) {
  const delta = Math.atan2(Math.sin(Number(currentYaw) - Number(originYaw)), Math.cos(Number(currentYaw) - Number(originYaw)));
  return clamp01(Math.abs(delta) / Math.PI);
}

// HOW NEAR IT HAS BEEN ALLOWED TO COME.
//
// Rungs, not metres, and it advances on what the player DID rather than on a
// clock: every look-back moves it one, a vented header moves it one, and a loud
// heave moves it one. The last rung is still short of arriving, because arriving
// is a contact and this scene is forbidden to start one.
export const PLANT_APPARITION_RUNGS = 4;
export const PLANT_APPARITION_METRES = Object.freeze([9.5, 6.4, 4.1, 2.6, 1.7]);

export function advancePlantApparition(rung = 0, steps = 1) {
  return Math.max(0, Math.min(PLANT_APPARITION_RUNGS, Math.round(finite(rung, 0)) + Math.max(0, Math.round(finite(steps, 1)))));
}

export function plantApparitionDistance(rung = 0) {
  const index = Math.max(0, Math.min(PLANT_APPARITION_RUNGS, Math.round(finite(rung, 0))));
  return PLANT_APPARITION_METRES[index];
}
