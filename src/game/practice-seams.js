// THE WING IS THE BUILDING'S REFERENCE, AND IT HAS TWO.
//
// Every room on this floor was tuned from here. The fork on the service-room
// stand gives A=440, which is what the steel says. The engraving on the same
// fork says A=444, which is what the institution says: pitch pushed sharp, a
// little more every year, for brilliance. Two references that nearly agree do
// not sit quietly side by side. They beat, at the difference between them, which
// here is four times a second.
//
// That beat is the seam. The slower it runs, the thinner the wall between this
// floor and everything filed underneath it; at unison it stops, and something
// shows through. Nothing in the game says any of that. It is only heard.
//
// Pure, like practice-rooms.js: no audio nodes, no save state, no clocks. This
// says how much of the institution's A is present where the listener stands.
// fork-tone.js voices it and main.js supplies the position.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const SEAM = Object.freeze({
  // What the fork sounds. The same pitch as FORK_TONE.hz.
  referenceHz: 440,
  // What the fork is engraved with (conservatory.talisman, read.line.1).
  pressureHz: 444,
});

export function seamBeatHz(pressureHz = SEAM.pressureHz, referenceHz = SEAM.referenceHz) {
  return Math.abs((Number(pressureHz) || 0) - (Number(referenceHz) || 0));
}

// WHERE THE INSTITUTION'S A IS IN THE AIR.
//
// In PHYSICAL metres on the upper render group, not authored cells. The landing
// is its own logical island (authored x146, y70) that stands physically on top
// of the ground-floor stair hall, so logical coordinates jump by ninety metres
// between the top step and the wing, while physical ones run straight on. They
// were measured from the compiled plan:
//
//   landing   space main_stair_hall, z 33.5 .. 42.5, arriving at the north end
//   wing      space practice,        z 43   .. 77,   the corridor runs south
//
// It is already in the air on the landing, faintly, and it is at full strength
// by the time the room bands begin. It is the same everywhere in the wing after
// that: the institution is not louder at any one door. The fork is the local
// thing, so the beat is strongest where the fork's A rises to meet this one,
// which is round the service room, and nowhere is it explained.
export const SEAM_REGIONS = Object.freeze([
  Object.freeze({ id: 'landing', spaceId: 'main_stair_hall', z0: 33.5, z1: 42.5, from: 0.3, to: 0.6 }),
  Object.freeze({ id: 'wing', spaceId: 'practice', z0: 43, z1: 49, from: 0.6, to: 1 }),
]);

/**
 * 0..1 presence of the institution's A for a listener at `{x, z, renderGroup,
 * spaceId}` in physical metres — the shape FP.logicalToPhysical gives, scaled
 * by CELL. Anywhere that is not the upper landing or the wing is 0.
 */
export function seamAt(listener = {}) {
  if (String(listener?.renderGroup || '') !== 'upper') return 0;
  const z = Number(listener?.z ?? listener?.y);
  if (!Number.isFinite(z)) return 0;
  const region = SEAM_REGIONS.find((r) => r.spaceId === String(listener?.spaceId || ''));
  if (!region) return 0;
  const t = clamp01((z - region.z0) / (region.z1 - region.z0));
  return region.from + (region.to - region.from) * t;
}

// ── THE TRACES ──────────────────────────────────────────────────────────────
//
// The institution's side of the seam, written down. Three traces, each inside
// one of the wing's uprights, because the uprights are the one thing in these
// rooms you already put a hand on (the paper and clutter are mute on purpose;
// see test/conservatory-space-layout.test.mjs). A tuner really does write the
// date and the pitch inside the case.
//
// Each trace has bands, and a band is shown exactly once. The first look is
// always there. The second waits until another trace has been read, the third
// until all three have: the floor changes as more of it is seen, and nobody
// says that it is changing. When a trace has nothing new, the upright is only
// an upright again. Text lives in content/narrative/practice-wing.traces.
export const PRACTICE_TRACES = Object.freeze([
  Object.freeze({ key: 'tuning-log', host: 'practice-piano-3', roomId: 'piano-maintenance' }),
  Object.freeze({ key: 'marks', host: 'practice-piano-1', roomId: 'exam-preparation' }),
  Object.freeze({ key: 'parts', host: 'practice-piano-6', roomId: 'copied-parts' }),
]);

export const PRACTICE_TRACE_BANDS = 3;

const readCount = (value) => Math.max(0, Math.floor(Number(value) || 0));

export function practiceTraceByHost(propId) {
  return PRACTICE_TRACES.find((trace) => trace.host === String(propId || '')) || null;
}

/**
 * The node to open for trace `key`, given how many bands of each trace have
 * been read (`{ 'tuning-log': 1, marks: 0, ... }`), or null when this trace has
 * nothing new yet.
 */
export function practiceTraceNode(key, read = {}) {
  if (!PRACTICE_TRACES.some((trace) => trace.key === key)) return null;
  const own = readCount(read?.[key]);
  if (own >= PRACTICE_TRACE_BANDS) return null;
  const seen = PRACTICE_TRACES.filter((trace) => readCount(read?.[trace.key]) > 0).length;
  if (own > 0 && seen < own + 1) return null;
  return `${key}.b${own}`;
}
