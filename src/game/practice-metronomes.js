// SIX METRONOMES, AND THE ONE THEY END UP ON.
//
// The wing's clock is the practice fight's metronome at BATTLE_BPM, 168 (see
// audio/practice-click.js). Out on the floor six more are running, one on the
// upright in each of five teaching rooms and one on the ensemble room's marimba,
// each set to a plain ratio of that clock:
//
//   2/3 = 112   3/4 = 126   4/5 = 134.4   1 = 168   4/3 = 224   3/2 = 252
//
// They were all started together, so for a while they are a clatter with a
// shape in it: all six land on the same instant once every sixty beats of 168,
// a little over twenty-one seconds, and nowhere in between.
//
// Then they settle. Metronomes standing on one shared floor really do pull each
// other into step, through the floor, and these do the same: the longer you
// spend in the wing, the closer every tempo draws to 168, and once the tempos
// are close the phases lock, until there is one tick in six places. The service
// room has none, so the fork's beat is never under a tick, and the exam room's
// stays stopped one click before the bar line, as its upright already says.
//
// AND THEY RUIN TAKES. A room-tone recording of a room with a clock ticking in
// it is not a room tone. Each tick reaches the recorder through distance, rooms
// and doors, and ticks that land together add up, so a wing full of running
// metronomes spoils any take in it, and a settled one spoils it on every beat.
// The job is to quiet them: stop a pendulum by hand, or shut its room in.
//
// Pure: no audio nodes, no save, no clocks. main.js steps it and supplies where
// the recorder is; metronome-field.js voices the ticks.

import { BATTLE_BPM } from '../audio/battle-music.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const PRACTICE_METRONOMES = Object.freeze([
  Object.freeze({ id: 'practice-metronome-lesson', roomId: 'cello-lesson', label: 'the lesson room', ratio: 2 / 3, doors: Object.freeze(['practice-east-1']) }),
  // The claimed room is the one with two ways in: the corridor, and the string
  // room's door to the side passage. Shutting it in means both.
  Object.freeze({ id: 'practice-metronome-claimed', roomId: 'coat-and-bag-drop', label: 'the claimed room', ratio: 3 / 4, doors: Object.freeze(['practice-east-2', 'practice-side']) }),
  Object.freeze({ id: 'practice-metronome-rehearsal', roomId: 'chamber-spillover', label: 'the rehearsal room', ratio: 4 / 5, doors: Object.freeze(['practice-west-3']) }),
  // The reference, in the paper room with the arrows over every A.
  Object.freeze({ id: 'practice-metronome-paper', roomId: 'copied-parts', label: 'the paper room', ratio: 1, doors: Object.freeze(['practice-east-3']) }),
  Object.freeze({ id: 'practice-metronome-emptied', roomId: 'hurried-departure', label: 'the emptied room', ratio: 4 / 3, doors: Object.freeze(['practice-west-4']) }),
  Object.freeze({ id: 'practice-metronome-ensemble', roomId: 'ensemble-rehearsal', label: 'the ensemble room', ratio: 3 / 2, doors: Object.freeze(['practice-east-4']) }),
]);

export const METRONOME_REFERENCE_INDEX = PRACTICE_METRONOMES.findIndex((voice) => voice.ratio === 1);

export function practiceMetronomeById(id) {
  return PRACTICE_METRONOMES.find((voice) => voice.id === String(id || '')) || null;
}

export const METRONOME_SETTLE = Object.freeze({
  // Seconds spent in the wing, in total across the night, before they are one.
  seconds: 180,
  // How hard the floor pulls a phase toward the reference once they have
  // settled, in cycles per second at full strength.
  coupling: 1.2,
});

// The extended instrument scale accommodates all six authored starting rates.
// An adjustment starts a fresh drift; time already spent in the wing cannot
// instantly erase a deliberate setting.
export const METRONOME_TEMPO = Object.freeze({ min: 40, max: 300, driftSeconds: 45 });
export const PRACTICE_METRONOME_MIN_TEMPO = METRONOME_TEMPO.min;
export const PRACTICE_METRONOME_MAX_TEMPO = METRONOME_TEMPO.max;
const HISTORY_SECONDS = .5;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const tempoWithinScale = value => Math.max(METRONOME_TEMPO.min, Math.min(METRONOME_TEMPO.max, finite(value, BATTLE_BPM)));
const voiceIndex = value => Number.isInteger(value) && value >= 0 && value < PRACTICE_METRONOMES.length
  ? value : PRACTICE_METRONOMES.findIndex(voice => voice.id === value);

function controlAt(value, index, ease = 0) {
  const requested = Number.isFinite(value?.requestedBpm) ? tempoWithinScale(value.requestedBpm) : null;
  const manual = value?.manual === true || requested != null;
  return {
    requestedBpm: requested, manual,
    bpm: tempoWithinScale(value?.bpm ?? metronomeTempo(PRACTICE_METRONOMES[index].ratio, ease)),
    driftFromBpm: tempoWithinScale(value?.driftFromBpm ?? requested ?? metronomeTempo(PRACTICE_METRONOMES[index].ratio, 0)),
    driftElapsed: Math.max(0, Math.min(METRONOME_TEMPO.driftSeconds, finite(value?.driftElapsed))),
    stopped: value?.stopped === true, held: value?.held === true,
  };
}

function normalizeMetronomeState(value, ease = 0) {
  return {
    schema: 2, time: Math.max(0, finite(value?.time)),
    phases: PRACTICE_METRONOMES.map((_, index) => ((finite(value?.phases?.[index]) % 1) + 1) % 1),
    parity: PRACTICE_METRONOMES.map((_, index) => Math.abs(Math.trunc(finite(value?.parity?.[index]))) % 2),
    controls: PRACTICE_METRONOMES.map((_, index) => controlAt(value?.controls?.[index], index, ease)),
    history: Array.isArray(value?.history) ? value.history.slice() : [],
  };
}

function rememberMetronomeState(state, cut = []) {
  const row = { at: state.time, phases: state.phases.slice(), parity: state.parity.slice(), cut };
  const history = state.history.filter(item => Number.isFinite(item?.at) && item.at >= state.time - HISTORY_SECONDS);
  if (history.at(-1)?.at === state.time) history[history.length - 1] = row;
  else history.push(row);
  return { ...state, history };
}

function presentationPosition(state, index, delay = .12) {
  const at = state.time - Math.max(0, finite(delay)), history = state.history;
  if (!history.length) return state.parity[index] + state.phases[index];
  let before = history[0], after = before;
  for (const row of history) { if (row.at <= at) before = row; if (row.at >= at) { after = row; break; } after = row; }
  const a = finite(before.parity?.[index]) + finite(before.phases?.[index]);
  const b = finite(after.parity?.[index]) + finite(after.phases?.[index]);
  if (after.at <= before.at || after.cut?.includes(index)) return at >= after.at ? b : a;
  const fraction = clamp01((at - before.at) / (after.at - before.at));
  return a + ((b - a + 2) % 2) * fraction;
}

function freezePresentationHistory(state, index) {
  // A brief catch/release must not reveal the old, already cancelled future
  // trajectory when the delayed visual clock reaches it after release.
  state.history = state.history.map(row => {
    const phases = row.phases.slice(), parity = row.parity.slice();
    phases[index] = state.phases[index]; parity[index] = state.parity[index];
    return { ...row, phases, parity };
  });
}

/** Serializable control/pendulum state; transient grip and audio history never survive a reload. */
export function serializeMetronomeState(value) {
  const state = normalizeMetronomeState(value);
  return { schema: 2, time: state.time, phases: state.phases, parity: state.parity,
    controls: state.controls.map(control => ({ ...control, held: false })) };
}
export function restoreMetronomeState(value) {
  return rememberMetronomeState(normalizeMetronomeState(serializeMetronomeState(value)));
}

/**
 * A lifecycle hold cancels the scheduled future, so resume from what was
 * actually visible/audible rather than that cancelled lookahead trajectory.
 * This is transport bookkeeping, not a player's touch or a tempo adjustment.
 */
export function rebaseMetronomePresentation(value, { presentationDelay = .12 } = {}) {
  const state = normalizeMetronomeState(value), caught = [];
  for (let index = 0; index < PRACTICE_METRONOMES.length; index++) {
    const control = state.controls[index];
    if (control.stopped || control.held) continue;
    const position = presentationPosition(state, index, presentationDelay);
    state.phases[index] = ((position % 1) + 1) % 1;
    state.parity[index] = Math.floor(position) % 2;
    freezePresentationHistory(state, index); caught.push(index);
  }
  return rememberMetronomeState(state, caught);
}

/** Catching the moving weight temporarily catches the pendulum; it is not the persistent stop. */
export function holdMetronomeWeight(value, indexOrId, held) {
  const index = voiceIndex(indexOrId); if (index < 0) return value;
  const state = normalizeMetronomeState(value), control = state.controls[index], next = !!held;
  if (next && !control.held && !control.stopped) {
    const position = presentationPosition(state, index);
    state.phases[index] = ((position % 1) + 1) % 1;
    state.parity[index] = Math.floor(position) % 2;
    freezePresentationHistory(state, index);
  }
  if (next && !control.held) {
    control.manual = true; control.requestedBpm = control.bpm;
    control.driftFromBpm = control.bpm; control.driftElapsed = 0;
  }
  control.held = next;
  return rememberMetronomeState(state, [index]);
}
export function setMetronomeTempo(value, indexOrId, bpm, options = {}) {
  const index = voiceIndex(indexOrId); if (index < 0 || !Number.isFinite(Number(bpm))) return value;
  let state = options.held === true ? holdMetronomeWeight(value, index, true) : normalizeMetronomeState(value);
  const control = state.controls[index], tempo = tempoWithinScale(bpm);
  control.manual = true; control.requestedBpm = tempo; control.bpm = tempo;
  control.driftFromBpm = tempo; control.driftElapsed = 0;
  if (options.held === false) control.held = false;
  return rememberMetronomeState(state);
}
export function setMetronomeRunning(value, indexOrId, running) {
  const index = voiceIndex(indexOrId); if (index < 0) return value;
  const state = normalizeMetronomeState(value), control = state.controls[index];
  if (!running && !control.stopped) {
    if (!control.held) {
      const position = presentationPosition(state, index);
      state.phases[index] = ((position % 1) + 1) % 1;
      state.parity[index] = Math.floor(position) % 2;
      freezePresentationHistory(state, index);
    }
    // A stopped clock cannot age into the floor's global settling deadline.
    // Touching it preserves its rate and gives a later restart its own drift.
    control.manual = true; control.requestedBpm = control.bpm;
    control.driftFromBpm = control.bpm; control.driftElapsed = 0;
  }
  control.stopped = !running;
  return rememberMetronomeState(state, [index]);
}
export function metronomeVoiceState(value, indexOrId, { presentationDelay = .12 } = {}) {
  const index = voiceIndex(indexOrId); if (index < 0) return null;
  const state = normalizeMetronomeState(value), control = state.controls[index];
  const position = control.stopped || control.held ? state.parity[index] + state.phases[index]
    : presentationPosition(state, index, presentationDelay);
  return { tempo: control.bpm, running: !control.stopped, stopped: control.stopped, held: control.held,
    // The escapement ticks at alternating travel limits, not at the centre.
    swing: Math.cos(Math.PI * position), phase: state.phases[index], parity: state.parity[index],
    requestedBpm: control.requestedBpm, min: METRONOME_TEMPO.min, max: METRONOME_TEMPO.max };
}

export const METRONOME_VOICE = Object.freeze({
  // What the player hears. A mechanical metronome carries across a room and a
  // doorway, not a floor.
  radius: 14,
  gain: 0.05,
});

// WHAT A TICK DOES TO A TAKE, in the recorder's noise scale (a take spoils above
// ROOM_TONE.spoilNoise, 0.18; a footstep is 0.22).
//
// Tuned against the wing as it stands. In the same room, a tick spoils outright.
// From the corridor mark, one running metronome in another room lands just
// under the line, so it marks the take without killing it; two that land
// together are over it, and six running unsettled ones collide constantly. A
// settled wing is one tick six times over, and spoils on every beat. A room shut
// in behind its door drops to a tenth, and all six shut in together are under.
export const METRONOME_TAKE = Object.freeze({
  level: 0.45,
  falloff: 0.06,
  otherRoom: 0.6,
  shutIn: 0.1,
  coincidentSeconds: 0.025,
});

// Compatibility data for old audit tools. A stopped mechanism now stays
// stopped until the player releases it; injury never restarts it.
export const METRONOME_RESTART = Object.freeze({
  enabled: false,
  injuries: 4,
  firstChance: 0,
  laterChance: 0,
  // Where in the take it starts, as take progress.
  from: 0.25,
  to: 0.6,
});

/** 0..1, eased, from seconds spent in the wing. */
export function metronomeSettleEase(seconds) {
  const t = clamp01((Number(seconds) || 0) / METRONOME_SETTLE.seconds);
  return t * t * (3 - 2 * t);
}

/**
 * The tempo of a metronome set to `ratio` of the clock, `ease` of the way to
 * settled. Geometric, so a ratio above 1 and one below close at matching rates.
 */
export function metronomeTempo(ratio, ease = 0) {
  return BATTLE_BPM * (Number(ratio) || 1) ** (1 - clamp01(ease));
}

export function freshMetronomeState() {
  // All started together, by the same hand.
  return rememberMetronomeState(normalizeMetronomeState(null));
}

/**
 * Advance every phase by `dt` seconds at settle `ease`. Returns the new state
 * and the ticks that crossed during the step, each as `{ index, ago, at }` —
 * seconds before the end of the step and absolute model time, earliest first.
 */
export function stepMetronomes(value, dt, ease = 0, { drift = true } = {}) {
  const step = Math.max(0, finite(dt));
  const settle = clamp01(ease);
  const state = normalizeMetronomeState(value, settle), before = state.phases;
  const reference = before[METRONOME_REFERENCE_INDEX];
  const pull = METRONOME_SETTLE.coupling * settle * settle;
  const referenceMoving = !state.controls[METRONOME_REFERENCE_INDEX].stopped && !state.controls[METRONOME_REFERENCE_INDEX].held;
  const ticks = [];
  const phases = before.map((phase, index) => {
    const voice = PRACTICE_METRONOMES[index], control = state.controls[index];
    if (control.stopped || control.held) return phase;
    let bpm = metronomeTempo(voice.ratio, settle), integrationBpm = bpm;
    if (control.manual) {
      const at = seconds => control.driftFromBpm * (BATTLE_BPM / control.driftFromBpm)
        ** metronomeSettleEase(seconds / METRONOME_TEMPO.driftSeconds * METRONOME_SETTLE.seconds);
      const oldBpm = at(control.driftElapsed);
      if (drift) control.driftElapsed = Math.min(METRONOME_TEMPO.driftSeconds, control.driftElapsed + step);
      bpm = at(control.driftElapsed); integrationBpm = (oldBpm + bpm) / 2;
    }
    const lean = control.manual || !referenceMoving || index === METRONOME_REFERENCE_INDEX
      ? 0
      : pull * Math.sin(2 * Math.PI * (reference - phase)) / (2 * Math.PI);
    const rate = Math.max(0, integrationBpm / 60 + lean);
    control.bpm = tempoWithinScale(bpm + lean * 60);
    const next = phase + rate * step;
    for (let crossing = 1; crossing <= Math.floor(next); crossing += 1) {
      const fraction = rate > 0 ? (crossing - phase) / (rate * step) : 1;
      const ago = step * (1 - clamp01(fraction));
      ticks.push({ index, ago, at: state.time + step - ago });
    }
    state.parity[index] = (state.parity[index] + Math.floor(next)) % 2;
    return next - Math.floor(next);
  });
  ticks.sort((a, b) => b.ago - a.ago);
  return { state: rememberMetronomeState({ ...state, time: state.time + step, phases }), ticks };
}

/**
 * A long gap (a paused game, a hidden tab) advanced in small silent steps, so
 * the coupling still integrates and nothing is sounded for time nobody heard.
 */
export function advanceMetronomesSilently(state, dt, ease = 0, { chunk = 0.05, limit = 120, drift = true } = {}) {
  let next = state;
  let left = Math.min(Math.max(0, Number(dt) || 0), chunk * limit);
  while (left > 0) {
    const piece = Math.min(left, chunk);
    next = stepMetronomes(next, piece, ease, { drift }).state;
    left -= piece;
  }
  return next;
}

/**
 * Level and pan for a listener at `{x, z}` and a metronome at `{x, z}`, both in
 * physical metres. What the player hears. Same shape as forkToneAt.
 */
export function metronomeVoiceAt(listener, source) {
  if (!source) return { gain: 0, pan: 0, distance: Infinity };
  const dx = (Number(source.x) || 0) - (Number(listener?.x) || 0);
  const dz = (Number(source.z ?? source.y) || 0) - (Number(listener?.z ?? listener?.y) || 0);
  const distance = Math.hypot(dx, dz);
  if (distance >= METRONOME_VOICE.radius) return { gain: 0, pan: 0, distance };
  const gain = METRONOME_VOICE.gain * (1 - distance / METRONOME_VOICE.radius) ** 1.6;
  const spread = clamp01(distance / 4);
  const pan = Math.max(-1, Math.min(1, (dx / Math.max(1, distance)) * spread));
  return { gain, pan, distance };
}

/**
 * How loud one tick lands at the recorder, in the take's noise scale.
 * `distance` in metres; `sameRoom` when the recorder stands in the metronome's
 * room; `shutIn` when every door of that room is shut.
 */
export function metronomeTickLevel({ distance = 0, sameRoom = false, shutIn = false } = {}) {
  let level = METRONOME_TAKE.level / (1 + METRONOME_TAKE.falloff * Math.max(0, Number(distance) || 0));
  if (!sameRoom) level *= METRONOME_TAKE.otherRoom;
  if (shutIn) level *= METRONOME_TAKE.shutIn;
  return level;
}

/**
 * Ticks that land within `coincidentSeconds` of each other are one louder
 * event: `[{ ago, level, indices }]`, earliest first. Each tick needs `ago` and
 * `level`; ticks with no level are left out.
 */
export function coincidentTicks(ticks = [], windowSeconds = METRONOME_TAKE.coincidentSeconds) {
  const sorted = ticks.filter((tick) => Number(tick?.level) > 0).sort((a, b) => b.ago - a.ago);
  const groups = [];
  for (const tick of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.ago - tick.ago <= windowSeconds) {
      last.level += tick.level;
      last.indices.push(tick.index);
    } else {
      groups.push({ ago: tick.ago, level: tick.level, indices: [tick.index] });
    }
  }
  return groups;
}

/**
 * Timestamped room events must survive frame boundaries. `at` is an absolute
 * clock chosen by the host (the audible clock in production), never a frame
 * number. Complete a cluster only once its entire coincidence window passed.
 */
export function createMetronomeCoincidenceAccumulator({ windowSeconds = METRONOME_TAKE.coincidentSeconds } = {}) {
  const window = Math.max(0, finite(windowSeconds, METRONOME_TAKE.coincidentSeconds));
  let pending = [];
  function flush(now, { force = false } = {}) {
    const at = finite(now), groups = [];
    pending.sort((a, b) => a.at - b.at);
    while (pending.length && pending[0].at <= at && (force || pending[0].at + window <= at)) {
      const first = pending.shift(), members = [first];
      while (pending.length && pending[0].at - first.at <= window && (!force || pending[0].at <= at)) members.push(pending.shift());
      groups.push({ at: first.at, ago: Math.max(0, at - first.at),
        level: members.reduce((sum, tick) => sum + tick.level, 0),
        indices: members.map(tick => tick.index), ticks: members });
    }
    return groups;
  }
  return {
    push(ticks = [], now = 0) {
      for (const tick of ticks) {
        const at = Number.isFinite(tick?.at) ? tick.at : finite(now) - Math.max(0, finite(tick?.ago));
        if (Number(tick?.level) > 0) pending.push({ ...tick, at, level: Number(tick.level) });
      }
      return flush(now);
    },
    flush,
    clearVoice(index, { after = -Infinity } = {}) { pending = pending.filter(tick => tick.index !== index || tick.at <= after); },
    clear() { pending = []; },
    get pending() { return pending.length; },
  };
}

/** The chance a take in the wing restarts a stopped metronome, or 0. */
export function metronomeRestartChance({ injuries = 0, rolledBefore = false, anyStopped = false } = {}) {
  return 0;
}
