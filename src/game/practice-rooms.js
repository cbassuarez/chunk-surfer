// The practice suite, as a thing that can happen to you.
//
// Eight teaching rooms off one corridor, all dressed, all inert. Dressing alone
// taught the player that this floor is scenery: you inspect a chair, you read a
// stamped asset tag, you leave. So a few of the rooms — never the same ones on
// two different nights — now answer when you touch something in them.
//
// The discipline is the same as the stab director's (see stabs.js): the budget
// lives in data, it is small, and the player must never be able to work out the
// RATE. Four of eight rooms do anything at all, each of them exactly once:
//
//   CHAIRS — the seating in the room rearranges itself while you are looking at
//            it. Visual only; the colliders never move (see props.setPropDrift),
//            so nothing this does can wall you in or move the thing you aimed at.
//   HUSH   — the room was practising, and it would like to finish. A fight.
//   TENANT — somebody is already in it. They are standing when you come through
//            the door, they do not move, they do not make a sound, and they are
//            gone the moment you have left. You are the one who has to go.
//
// None of these are triggered by the interact key. A room answers because you
// CROSSED ITS THRESHOLD and it is in your frame — see tickPracticeHaunts in
// main.js. Firing the chairs off [e] made the rearrangement read as a response
// to the player pressing a button at a chair, which is the opposite of the beat.
//
// The assignment is dealt once per run from a saved seed, so reloading cannot
// reroll the night and a second playthrough is a different building.

// The wing is authored at origin (51,52) in practiceWingRows()
// (data/floorplan/conservatory.js). Its dividing walls stand at authored x51/x59
// and x63/x76, and the room bands are split by the walls at y56/63/70/77/84.
// These rects are the interiors, in metres, and each is keyed by the same
// `roomHistory` string the dressing already carries.
const room = (id, label, x0, x1, y0, y1) => Object.freeze({ id, label, x0, x1, y0, y1 });

export const PRACTICE_ROOMS = Object.freeze([
  room('exam-preparation',    'the examination room', 52, 59, 57, 63),
  room('cello-lesson',        'the lesson room',      64, 76, 57, 63),
  room('piano-maintenance',   'the service room',     52, 59, 64, 70),
  room('coat-and-bag-drop',   'the claimed room',     64, 76, 64, 70),
  room('chamber-spillover',   'the rehearsal room',   52, 59, 71, 77),
  room('copied-parts',        'the paper room',       64, 76, 71, 77),
  room('hurried-departure',   'the emptied room',     52, 59, 78, 84),
  room('ensemble-rehearsal',  'the ensemble room',    64, 76, 78, 84),
]);

export const PRACTICE_ROOM_IDS = Object.freeze(PRACTICE_ROOMS.map((r) => r.id));
const ROOM_BY_ID = new Map(PRACTICE_ROOMS.map((r) => [r.id, r]));

export const PRACTICE_HAUNT = Object.freeze({
  CHAIRS: 'chairs',
  HUSH: 'hush',
  TENANT: 'tenant',
});

// The deal. Two chairs rooms because one rearrangement is a thing you saw and
// might have imagined, and the second is the building telling you that you did
// not. One fight, and one room with somebody in it.
export const PRACTICE_HAUNT_DEAL = Object.freeze([
  PRACTICE_HAUNT.CHAIRS,
  PRACTICE_HAUNT.CHAIRS,
  PRACTICE_HAUNT.HUSH,
  PRACTICE_HAUNT.TENANT,
]);

// The tuning fork lives on the stand in the service room (see TALISMAN_STAND).
// The talisman beat is the one place in the building where the Chunk Surfer is
// said out loud, and either of the loud haunts would bury it: a fight opens over
// the line, and a body standing in the room means nobody is reading the room for
// a reflection on a music stand. So that room draws neither.
export const HAUNT_FORBIDDEN_ROOMS = Object.freeze(['piano-maintenance']);

// The haunts that cannot go just anywhere, in the order they are placed.
const EXCLUSIVE_HAUNTS = Object.freeze([PRACTICE_HAUNT.HUSH, PRACTICE_HAUNT.TENANT]);

// Which of the room's dressing is furniture a room could plausibly have moved.
// The uprights are the institutional datum and stay exactly where they are —
// that is the whole reason the drift reads.
export const DRIFTABLE_MESHES = Object.freeze(['chair', 'green_chair_01', 'piano_bench', 'music_stand']);

export function practiceRoomById(id) { return ROOM_BY_ID.get(String(id)) || null; }

export function practiceRoomAt(x, y) {
  const mx = Number(x); const my = Number(y);
  if (!Number.isFinite(mx) || !Number.isFinite(my)) return null;
  for (const r of PRACTICE_ROOMS) {
    if (mx >= r.x0 && mx <= r.x1 && my >= r.y0 && my <= r.y1) return r.id;
  }
  return null;
}

export function inPracticeWing(x, y) { return practiceRoomAt(x, y) !== null; }

// xorshift32, the same generator props.js uses for the HUSH's choice of source.
// Deliberately not Math.random: the night must survive a reload unchanged, and
// this must not perturb the global stream combat and the scare director share.
function nextSeed(seed) {
  let x = (seed >>> 0) || 0x43535552;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x >>> 0;
}

// xorshift32 correlates badly on its first few draws from neighbouring small
// seeds — run ids 2 and 3 dealt an identical night — so the incoming seed gets
// an avalanche first. This is only ever applied at the door, never inside a
// stream, so a stream stays reproducible from its scrambled start.
function scramble(seed) {
  let x = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) || 0x43535552;
}

export function freshPracticeHauntState(seed = 0) {
  return {
    schema: 2,
    seed: (Number(seed) >>> 0) || 0,
    assignment: null,
    fired: [],
  };
}

// Deal the night. Rooms are shuffled by the seeded stream; the two haunts that
// cannot go just anywhere are placed FIRST, each into the earliest shuffled room
// still free that will take it, and the chairs fall over what is left. Doing it
// in that order means the forbidden room does not always end up trading with the
// same haunt. With eight rooms and one forbidden room this always fits.
export function assignPracticeHaunts(seed = 0) {
  const order = [...PRACTICE_ROOM_IDS];
  let s = scramble(Number(seed) >>> 0);
  for (let i = order.length - 1; i > 0; i--) {
    s = nextSeed(s);
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const assignment = {};
  const taken = new Set();
  for (const haunt of EXCLUSIVE_HAUNTS) {
    const room = order.find((id) => !taken.has(id) && !HAUNT_FORBIDDEN_ROOMS.includes(id));
    if (!room) continue;
    assignment[room] = haunt;
    taken.add(room);
  }
  const rest = PRACTICE_HAUNT_DEAL.filter((haunt) => !EXCLUSIVE_HAUNTS.includes(haunt));
  order.filter((id) => !taken.has(id)).slice(0, rest.length)
    .forEach((id, i) => { assignment[id] = rest[i]; });
  return assignment;
}

export function normalizePracticeHauntState(value) {
  const base = freshPracticeHauntState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  const haunts = new Set(Object.values(PRACTICE_HAUNT));
  const source = value.assignment;
  let assignment = null;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const entries = Object.entries(source);
    // ALL OR NOTHING. Filtering unknown haunts per-entry looks tidier and is
    // wrong: a save dealt before TENANT existed carries two `stab` rooms, and
    // dropping just those would leave the player a half night of one chairs room
    // and a fight. An assignment we do not fully recognise is discarded whole,
    // and ensurePracticeHaunts re-deals from the seed we keep below — which is
    // deterministic, so the night is stable again from here. Rooms already in
    // `fired` stay quiet through practiceHauntFor whatever they are re-dealt.
    const known = entries.every(([id, haunt]) => ROOM_BY_ID.has(id) && haunts.has(haunt));
    if (entries.length && known) assignment = Object.fromEntries(entries);
  }
  return {
    schema: 2,
    seed: (Number(value.seed) >>> 0) || 0,
    assignment,
    fired: [...new Set((Array.isArray(value.fired) ? value.fired : []).filter((id) => ROOM_BY_ID.has(id)))],
  };
}

export function practiceHauntFor(state, roomId) {
  if (!state?.assignment || !roomId) return null;
  if ((state.fired || []).includes(roomId)) return null;
  return state.assignment[roomId] || null;
}

export function markPracticeHauntFired(state, roomId) {
  return { ...state, fired: [...new Set([...(state.fired || []), roomId])] };
}

// The corridor is the middle of the wing: west rooms open east, east rooms west.
// One fact, two consumers — the drift slides furniture toward the door, and the
// tenant stands as far from it as the room allows.
const doorSideX = (rect) => (rect.x0 < 60 ? rect.x1 : rect.x0);

// Where somebody stands to be seen the instant you come through the door: the
// back of the room, on the centre line, a stride clear of the wall.
//
// Returned as an ORDERED list of candidates in authored metres, because the
// rooms are dressed and the middle of the back wall is quite likely to be inside
// a chair. The sweep goes sideways along the back wall first and only then gives
// ground toward the door — stepping straight back would walk into the wall the
// point was measured from and every candidate after the first would fail. The
// caller converts to runtime cells and is the one that knows what is solid.
export function tenantStandCandidates(roomId) {
  const rect = practiceRoomById(roomId);
  if (!rect) return [];
  const inward = rect.x0 < 60 ? 1 : -1;           // away from the door
  const back = (rect.x0 < 60 ? rect.x0 : rect.x1) + inward * 1.1;
  const midY = (rect.y0 + rect.y1) / 2;
  const out = [];
  for (const toward of [0, 0.5, 1]) {
    for (const sideways of [0, -0.6, 0.6, -1.2, 1.2, -1.8, 1.8]) {
      const y = midY + sideways;
      if (y < rect.y0 + 0.5 || y > rect.y1 - 0.5) continue;
      out.push({ x: back + inward * toward, y });
    }
  }
  return out;
}

// The door the tenant is standing away from. Exported for the geometry tests.
export function tenantDoorSideX(roomId) {
  const rect = practiceRoomById(roomId);
  return rect ? doorSideX(rect) : null;
}

// The room drifts as one arrangement, not as six independent jitters: every
// piece turns toward the corridor door and slides a little that way, which is
// what a room full of chairs looks like after somebody has been sitting in it.
// Poses are clamped inside the authored rect so nothing walks through a wall,
// and the offsets are absolute (props.setPropDrift measures from the authored
// pose), so applying this twice cannot compound.
export function chairDriftFor(roomId, props = [], seed = 0) {
  const rect = practiceRoomById(roomId);
  if (!rect) return {};
  const towardDoor = rect.x0 < 60 ? 1 : -1;
  let s = scramble((Number(seed) >>> 0) ^ 0x51ed270b);
  const poses = {};
  for (const prop of props) {
    if (!prop?.id || !DRIFTABLE_MESHES.includes(prop.mesh)) continue;
    s = nextSeed(s);
    const slide = 0.30 + (s % 31) / 100;             // 0.30 .. 0.60m
    s = nextSeed(s);
    const lateral = ((s % 61) - 30) / 100;           // -0.30 .. 0.30m
    s = nextSeed(s);
    const dyaw = (((s % 281) - 140) / 100);          // -1.40 .. 1.40 rad
    const dx = clampInto(prop.x, slide * towardDoor, rect.x0 + .55, rect.x1 - .55);
    const dz = clampInto(prop.y, lateral, rect.y0 + .55, rect.y1 - .55);
    poses[prop.id] = { dx, dz, dyaw };
  }
  return poses;
}

function clampInto(at, delta, lo, hi) {
  const target = Math.max(lo, Math.min(hi, Number(at) + delta));
  return Number((target - Number(at)).toFixed(4));
}
