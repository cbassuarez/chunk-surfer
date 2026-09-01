// The recordist: light, noise, and the recorder.
//
// The whole game is the tension between three facts:
//   · The flashlight lets you see. Light attracts.
//   · Moving lets you leave. Movement is noise. Noise is what hunts you.
//   · The job has two halves, and only the second one is dangerous:
//       LISTEN — headphones on, the room comes up in the cans. You can move,
//                you can turn, you are only auditioning the space. This is
//                "getting room audio", and it is where you actually hear it.
//       RECORD — the room drops out and the tape hiss comes up, and now you
//                must not move, must not breathe wrong, for forty-five seconds.
//                What is on the tape is silence. What plays it back is not.
//
// This module owns state and rules. It plays no audio and draws nothing;
// main.js wires it to the engine, and roomtone.js answers its questions.

import { ROOM_TONE, NOISE } from '../config.js';
import { inferAcousticKind } from '../audio/acoustic-catalogue.js';

let acousticEmitter = null;

export function setAcousticEmitter(emitter = null) {
  acousticEmitter = typeof emitter === 'function' ? emitter : null;
}

function reportAcoustic({
  kind,
  level,
  x,
  y,
  reason,
  sourceKind = 'player',
  sourceId = 'player',
  playerGenerated = sourceKind === 'player',
  spoils = true,
  deliberate = false,
  sampleId = null,
  audibleToHush = true,
  audibleToMonitor = true,
} = {}) {
  if (!acousticEmitter) return null;
  try {
    return acousticEmitter({
      kind: kind || inferAcousticKind(reason, level),
      level, x, y, reason, spoils, deliberate, sampleId,
      playerGenerated, audibleToHush, audibleToMonitor,
      source: { kind: sourceKind, id: sourceId },
    });
  } catch (error) {
    console.error('[recordist] acoustic emitter failed', error);
    return null;
  }
}

let difficultyRules = {
  spoilNoiseScale: 1,
  minorNoise: 'spoil',
  pauseSeconds: 0,
  torchDrainScale: 1,
};

export function configureDifficulty(next = {}) {
  difficultyRules = { ...difficultyRules, ...next };
}

export function recordistDifficulty() { return { ...difficultyRules }; }

function spoilThreshold() {
  return ROOM_TONE.spoilNoise * Math.max(0.25, Number(difficultyRules.spoilNoiseScale) || 1);
}

// ── WHAT THE METER IS ALLOWED TO DRAW ────────────────────────────────────────
//
// The levels a recordist is actually working against, in the same 0..1 noise
// scale `currentNoise()` reports, so the meter can put them on its own scale
// without a second copy of these rules drifting away from these ones.
//
// SPOIL is difficulty-scaled and CATCH is not, which is exactly why they are
// worth printing: on a forgiving difficulty the gap between "ruined" and
// "found" is wider, and until now there was no way for a player to see that.
export function noiseMarks() {
  const spoil = spoilThreshold();
  return [
    // FLOOR appears only once there IS one — an uninjured recordist has no
    // floor above the room's own, and a mark at zero would be furniture.
    { level: noiseFloor(), kind: 'floor', label: 'FLOOR' },
    { level: spoil, kind: 'spoil', label: 'SPOIL' },
    { level: ROOM_TONE.catchNoise, kind: 'catch', label: 'CATCH' },
  ].filter((mark) => mark.level > 0 && mark.label);
}

export { spoilThreshold };

// ── WHEN IT WENT WRONG ───────────────────────────────────────────────────────
//
// The take clock knew the second a noise landed and threw it away, so a spoiled
// take could only ever say THAT it failed. These are the marks the location
// strip draws: a near miss you got away with, and the one that ended it.
//
// Live only, and cleared at the top of every take. A spoiled take is never
// sealed, so there is nothing to persist and nothing to migrate.
const TAKE_EVENT_LIMIT = 24;

export function takeEvents() {
  return state.takeEvents.map((event) => ({ ...event }));
}

function noteTakeEvent(kind, level) {
  if (state.takeEvents.length >= TAKE_EVENT_LIMIT) return;
  state.takeEvents.push({ atSec: Math.max(0, state.takeElapsed), kind, level: Number(level) || 0 });
}

function handleRecordingNoise(level, reason, meta = {}) {
  if (state.phase !== 'recording' || state.stalled) return;
  const threshold = spoilThreshold();
  // A quarter of the way to spoiling is already worth marking: it is the
  // difference between "the room was silent" and "you kept getting away with
  // it", and only one of those is a lesson.
  if (level > threshold * .25) noteTakeEvent(level > threshold ? 'spoil' : 'near', level);
  if (level <= threshold) return;
  if (difficultyRules.minorNoise === 'pause' && level <= threshold * 1.35) {
    state.assistPause = Math.max(state.assistPause, Number(difficultyRules.pauseSeconds) || 0.7);
    return;
  }
  spoil(reason, meta);
}

const state = {
  light: false,         // you arrive in the dark. Turning it on costs your safety
                        // and, now, your battery. Light attracts, and light runs out.
  battery: 1,           // 0..1. Drains only while it is actually burning.
  phase: 'idle',        // 'idle' | 'listening' | 'recording'
  takeElapsed: 0,       // seconds of unbroken quiet
  takeEvents: [],       // when noise landed in this take — see noteTakeEvent
  stalled: false,       // an instrument woke: the take is paused, not running,
                        // and you may move to go and silence it.
  spoiled: false,
  spoilReason: '',
  spoilMeta: null,
  injuries: 0,          // permanent within a run; each one makes you louder
  // COMPOSURE IS THE BODY, AND IT LASTS THE NIGHT.
  //
  // It used to be created fresh inside every fight and thrown away with the
  // scene, which made a lost fight the one thing in the building with no
  // consequence — you walked back in whole. It lives here now, beside the
  // injuries that cap it and the battery that runs down the same way. Null
  // until the first read, so a save written before this loads at its ceiling
  // rather than at zero.
  composure: null,
  // WHICH PAGES HE HAS, NOT HOW MANY.
  //
  // Five different pieces by five different composers, each with its own sound
  // and its own line — a count would throw all of that away the moment he
  // picked up the second one. `sheets` is what is in the case now; taken is
  // what has ever been lifted, so a read sheet never respawns on the floor.
  sheets: [],
  sheetsTaken: [],      // which of the five have ever been lifted off the floor
  noise: 0,             // current, decaying
  worldNoise: 0,        // remote sources the presence hears but this mic does not
  lastNoiseAt: { x: 0, y: 0, t: 0 },   // where the presence goes looking
  slow: false,          // Shift held
  hidden: false,        // pressed into cover: see game/cover.js
  takes: [],            // completed room ids
  places: {},           // roomId -> where in that room it was rolled
  contaminated: [],     // accepted rooms whose most recent take carried mains hum
  assistPause: 0,       // Story mode can hold the clock for small handling noise
};

export function recState() { return state; }
export function isRecording() { return state.phase === 'recording'; }
export function isListening() { return state.phase === 'listening'; }
export function isMonitoring() { return state.phase !== 'idle'; }
export function lightOn() { return state.light; }

// Noise floor rises with injury and never falls back. You get worse.
//
// Except in cover, and this is the one mercy the hide verb grants. A limp is
// loud BECAUSE YOU WALK ON IT — the floor exists to make a wounded man's
// footfalls carry, and a wounded man stood still against a wall is not putting
// weight on anything. Without this the injured player is the one player cover
// cannot help, which is exactly backwards: he is the one who needs it.
export function noiseFloor() { return state.hidden ? 0 : state.injuries * NOISE.perInjury; }
export function currentNoise() { return state.noise; }
export function currentWorldNoise() { return Math.max(state.noise, state.worldNoise); }

// ── composure ───────────────────────────────────────────────────────────────
// The pool every fight draws down. The CEILING is what injuries own: each one
// costs a grid square and never comes back, floored at half so a bad night is
// smaller but never hopeless (the same floor combat-state.js has always used
// for maxComposure — this is that number, moved out where the world can see
// it). The FLOOR is where a defeat leaves you: you are never stranded at zero.
export const COMPOSURE_GRID = 5;
export const COMPOSURE_BASE = 8 * COMPOSURE_GRID;
export const COMPOSURE_FLOOR = 4 * COMPOSURE_GRID;

export function composureCeiling() {
  return Math.max(COMPOSURE_FLOOR, COMPOSURE_BASE - Math.max(0, state.injuries) * COMPOSURE_GRID);
}
export function composure() {
  const ceiling = composureCeiling();
  if (state.composure == null) state.composure = ceiling;
  return Math.max(0, Math.min(ceiling, state.composure));
}
// Set from a finished fight. Clamped into [FLOOR, ceiling]: a fight can leave
// you at the floor and no lower, because the next one has to be enterable.
export function setComposure(value) {
  state.composure = Math.max(COMPOSURE_FLOOR, Math.min(composureCeiling(), Math.round(Number(value) || 0)));
  return state.composure;
}
// Recovery. Deliberately the only way up, and deliberately small: see the
// sealed take (nominal) and sheet music (rare) in main.js.
export function restoreComposure(amount = 0) {
  const gain = Math.max(0, Math.round(Number(amount) || 0));
  if (!gain) return composure();
  state.composure = Math.min(composureCeiling(), composure() + gain);
  return state.composure;
}
export function sheetsCarried() { return state.sheets.length; }
export function carriedSheets() { return [...state.sheets]; }
// The one he would read next, which is the one the case shows him and the one
// he hears when he looks. Oldest first: he works through them in the order he
// found them.
export function nextSheet() { return state.sheets[0] || null; }
export function sheetTaken(id) { return state.sheetsTaken.includes(String(id)); }
// Lifting one off the floor. Idempotent by id, so a prop that somehow survives
// a resync cannot be picked up twice.
export function takeSheet(id) {
  const key = String(id || '');
  if (!key || state.sheetsTaken.includes(key)) return false;
  state.sheetsTaken.push(key);
  state.sheets.push(key);
  return true;
}
// Debug only (the god menu). Real acquisition goes through takeSheet.
export function addSheet(id = 'sheet-goldberg-aria') {
  state.sheets.push(String(id));
  return state.sheets.length;
}
// Spending one is the whole transaction: it fails if there is none, and it
// fails if it would do nothing, so a full recordist cannot burn a sheet.
export function readSheet(amount = 3 * COMPOSURE_GRID) {
  const id = nextSheet();
  if (!id) return { spent: false, id: null, composure: composure(), sheets: 0, reason: 'NO SHEET' };
  if (composure() >= composureCeiling()) return { spent: false, id, composure: composure(), sheets: state.sheets.length, reason: 'ALREADY COMPOSED' };
  state.sheets.shift();
  return { spent: true, id, composure: restoreComposure(amount), sheets: state.sheets.length, reason: '' };
}

// Reaching for the light mid-take is allowed, and it ruins the take. Every
// rule in this game is a price, never a locked door — except a flat battery,
// which is not a rule and does not care what you have decided.
export function toggleLight() {
  if (!state.light && state.battery <= 0) return false;      // nothing to turn on
  state.light = !state.light;
  if (state.phase === 'recording' && state.light) spoil('you reached for the light', {
    sourceKind:'player',sourceId:'player',playerGenerated:true,deliberate:true,
  });
  return state.light;
}

// Light attracts, and light runs out. The torch burns only while it is burning:
// a man who works in the dark keeps his battery, and keeps nothing else.
// Twelve minutes of burning, across a night that takes an hour and a half. It is
// not a resource that runs out early — you will never be groping around the first
// room in the dark because a bar emptied. It is a resource you have to SPEND: a
// man who leaves it on to cross a corridor he already knows arrives at the chapel
// with nothing, and a man who works dark, the way he told the guard he does,
// arrives with light in hand for the one place he will actually want it.
const TORCH_SECONDS = 720;
export function drainLight(dt) {
  if (!state.light || state.battery <= 0) return false;
  state.battery = Math.max(0, state.battery - (dt * Math.max(0.05, Number(difficultyRules.torchDrainScale) || 1)) / TORCH_SECONDS);
  if (state.battery <= 0) { state.light = false; return true; }   // it just died
  return false;
}
// Where the light starts telling you it is going. A torch does not simply stop;
// it browns out, and you get to watch it decide.
export function torchLow() { return state.light && state.battery > 0 && state.battery <= 0.22; }
export function batteryLevel() { return state.battery; }
// Measured in torch-fulls, and you can carry more than one. This matters: the
// torch leaves the flat FULL, so if the ceiling were 1 then the two good cells in
// the dead man's tray would be worth precisely nothing, and the whole trade would
// be a lie. A second, smaller reserve can be found on the pool-maintenance cart;
// both caches are physical, finite, and require going somewhere to earn them.
const BATTERY_MAX = 2;
export function addBattery(v) { state.battery = Math.max(0, Math.min(BATTERY_MAX, state.battery + v)); }
export function killTorch() { state.light = false; state.battery = 0; }

// A step emits noise at the cell you stepped from. That cell is what the
// presence investigates — not you. You are only ever where you were.
// `surface` is a multiplier on the footfall itself, not on the noise floor: a
// resonant floor makes the STEP loud, it does not make an injury worse. The
// caller owns it, because the recordist knows what a footfall costs and only the
// world knows what it is standing on.
export function emitStepNoise(x, y, surface = 1) {
  const scale = Number.isFinite(surface) && surface > 0 ? surface : 1;
  const level = (state.slow ? NOISE.slow : NOISE.walk) * scale + noiseFloor();
  state.noise = Math.max(state.noise, level);
  state.lastNoiseAt = { x, y, t: performance.now() };
  handleRecordingNoise(level, 'you moved', {
    sourceKind:'player',sourceId:'player',playerGenerated:true,deliberate:true,
  });
  reportAcoustic({
    kind: inferAcousticKind('you moved', level, { step: true, slow: state.slow, injured: state.injuries > 0 }),
    level, x, y, reason: 'you moved', sourceKind: 'player', sourceId: 'player', spoils: true, deliberate: true,
  });
  return level;
}

// Anything else that makes a sound in the world: a dropped page, a door, the
// presence itself. Spoils a take the same way your own footfall would.
export function emitNoise(level, x, y, reason = 'something moved', options = {}) {
  const {
    spoils = true,
    kind = null,
    sourceKind = spoils ? 'player' : 'environment',
    sourceId = spoils ? 'player' : 'world',
    playerGenerated = sourceKind === 'player',
    deliberate = false,
    sampleId = null,
    audibleToHush = true,
    audibleToMonitor = true,
  } = options || {};
  // Preserve the pre-acoustic-system gameplay envelope exactly. Noise-floor
  // injury is a property of the operator/take, not of semantic source labels.
  const heard = level + noiseFloor();
  if (spoils) state.noise = Math.max(state.noise, heard);
  else state.worldNoise = Math.max(state.worldNoise, heard);
  if (x != null) state.lastNoiseAt = { x, y, t: performance.now() };
  if (spoils) handleRecordingNoise(state.noise, reason, {
    sourceKind,sourceId,playerGenerated,deliberate,kind:kind || inferAcousticKind(reason, heard),
  });
  reportAcoustic({
    kind: kind || inferAcousticKind(reason, heard),
    level: heard, x, y, reason, sourceKind, sourceId, playerGenerated,
    spoils, deliberate, sampleId, audibleToHush, audibleToMonitor,
  });
}

// A discrete burst that STACKS on whatever noise is already in the air, rather
// than taking the louder of the two. This is what lets the radio's squelch add
// to a footstep you are already making — one alone spoils the take, the two
// together are loud enough to be caught. Continuous sources (your own body, the
// live mic) keep using emitNoise so they don't runaway-accumulate each frame.
export function addNoise(level, x, y, reason = 'something moved', options = {}) {
  state.noise = Math.min(1, state.noise + level + noiseFloor());
  if (x != null) state.lastNoiseAt = { x, y, t: performance.now() };
  handleRecordingNoise(state.noise, reason, {
    sourceKind:options.sourceKind || 'equipment',sourceId:options.sourceId || 'equipment',
    playerGenerated:options.playerGenerated ?? false,deliberate:!!options.deliberate,
    kind:options.kind || inferAcousticKind(reason, state.noise),
  });
  reportAcoustic({
    kind: options.kind || inferAcousticKind(reason, state.noise),
    level: state.noise, x, y, reason,
    sourceKind: options.sourceKind || 'equipment',
    sourceId: options.sourceId || 'equipment',
    playerGenerated: options.playerGenerated ?? false,
    spoils: true, deliberate: !!options.deliberate, sampleId: options.sampleId || null,
    audibleToHush: options.audibleToHush !== false,
    audibleToMonitor: options.audibleToMonitor !== false,
  });
}

export function decayNoise(dt) {
  state.noise = Math.max(0, state.noise - NOISE.decayPerSec * dt);
  state.worldNoise = Math.max(0, state.worldNoise - NOISE.decayPerSec * dt);
}

// ── The recorder ─────────────────────────────────────────────────────────────

// LISTEN. Headphones on, the room comes up. Safe: you can move, you can turn,
// nothing is at stake yet. This is where you actually hear the place.
export function startListening() {
  if (state.phase !== 'idle') return false;
  state.phase = 'listening';
  state.light = false;          // the light goes away. you agreed to this.
  return true;
}

// Give up on a room without rolling. No harm; you simply heard it and left.
export function stopListening() {
  if (state.phase !== 'listening') return false;
  state.phase = 'idle';
  return true;
}

// ROLL. The room drops out, the hiss comes up, and the forty-five seconds
// begin. Only reachable from LISTEN.
export function startRecording() {
  if (state.phase !== 'listening') return false;
  state.phase = 'recording';
  state.light = false;
  state.takeElapsed = 0;
  state.takeEvents = [];
  state.stalled = false;
  state.assistPause = 0;
  state.spoiled = false;
  state.spoilReason = '';
  state.spoilMeta = null;
  return true;
}

// An instrument in the room has woken. The take does not advance and cannot be
// spoiled by movement while it sounds — you are free to go and silence it.
export function stallTake() { if (state.phase === 'recording') state.stalled = true; }
export function resumeTake() {
  state.stalled = false;
  // The HUSH source and the player's permitted return footsteps have been
  // reporting into this envelope while the clock was held. They must not kill
  // the take on the first released frame; new movement/noise still spoils.
  state.noise = noiseFloor();
}
export function isStalled() { return state.stalled; }
export function isAssistPaused() { return state.phase === 'recording' && state.assistPause > 0; }

export function stopRecording() {
  if (state.phase !== 'recording') return null;
  const completed = state.takeElapsed >= ROOM_TONE.takeSeconds && !state.spoiled;
  state.phase = 'idle';
  // The light does NOT come back by itself. Reaching for it is a decision you
  // make in the dark, every time, knowing what it costs.
  const result = { completed, elapsed: state.takeElapsed, spoiled: state.spoiled, reason: state.spoilReason, spoilMeta:state.spoilMeta?{...state.spoilMeta}:null };
  state.takeElapsed = 0;
  state.stalled = false;
  state.assistPause = 0;
  return result;
}

function spoil(reason, meta = {}) {
  if (state.spoiled) return;
  state.spoiled = true;
  state.spoilReason = reason;
  state.spoilMeta = meta && typeof meta === 'object' ? {...meta} : null;
}
export { spoil as spoilTake };

// Returns 'running' | 'complete' | 'spoiled'
export function tickRecording(dt) {
  if (state.phase !== 'recording') return 'idle';
  if (state.spoiled) return 'spoiled';
  if (state.assistPause > 0) {
    state.assistPause = Math.max(0, state.assistPause - dt);
    return 'paused';
  }
  // While an instrument sounds the take is held: the clock stops and noise does
  // not spoil it. Silence the instrument (resumeTake) to let it run again.
  if (state.stalled) return 'stalled';
  if (state.noise > spoilThreshold()) {
    handleRecordingNoise(state.noise, 'the room was not empty', {
      sourceKind:'environment',sourceId:'room',playerGenerated:false,deliberate:false,
    });
    if (state.spoiled) return 'spoiled';
    if (state.assistPause > 0) return 'paused';
  }
  state.takeElapsed += dt;
  return state.takeElapsed >= ROOM_TONE.takeSeconds ? 'complete' : 'running';
}

export function takeProgress() {
  return Math.min(1, state.takeElapsed / ROOM_TONE.takeSeconds);
}

export function injure() {
  state.injuries++;
  // The ceiling just dropped. A recordist sitting at the old ceiling must come
  // down with it, or the mark costs him nothing until the next fight reads it.
  if (state.composure != null) state.composure = Math.min(state.composure, composureCeiling());
  return state.injuries;
}

export function setSlow(on) { state.slow = !!on; }

// Pressed into cover. The recordist only records the fact — main.js owns the
// geometry (game/cover.js) and the HUSH owns what it makes of it. Nothing in
// here knows there is anything to hide FROM.
export function setHidden(on) { state.hidden = !!on; }
export function isHidden() { return state.hidden; }
// WHERE IN THE ROOM IT WAS ROLLED.
//
// Only the concert hall has anywhere else to stand — the orchestra floor, the
// stage, and two balconies, all one zone and all `amplifications`. Everywhere
// else the room IS the position, so the place is simply null and nothing
// downstream has to special-case a room with one floor in it.
// ONE TAKE IS ONE RECORD, AND IT LIVES ON THE TAPE.
//
// `takes`, `contaminated` and `places` were three arrays keyed by room, next to
// a fourth store in game/playback.js holding the recording itself — four places
// to describe one thing, and only three of them ever reached the disk. The tape
// store is the truth now (playback.js) and these three are a projection of it,
// kept because a dozen callers read them every frame and a Map lookup per read
// is not worth the churn.
//
// `takeSink` is how the projection is filled without this module importing the
// tape store: main.js owns the wiring, the way it owns the acoustic emitter.
let takeSink = null;
export function setTakeSink(sink = null) { takeSink = sink; }

function projectTakes() {
  if (!takeSink) return;
  state.takes = takeSink.roomIds();
  state.contaminated = takeSink.contaminated();
  state.places = takeSink.places();
}

export function addTake(roomId, { contaminated = false, place = null } = {}) {
  takeSink?.mark?.(roomId, { contaminated, place });
  if (takeSink) { projectTakes(); return; }
  // No sink wired (headless tests, the bag lab): keep the old behaviour so the
  // module still stands up on its own.
  if (!state.takes.includes(roomId)) state.takes.push(roomId);
  const dirty = new Set(state.contaminated);
  if (contaminated) dirty.add(roomId); else dirty.delete(roomId);
  state.contaminated = [...dirty];
  if (place && !state.places[roomId]) state.places[roomId] = place;
}

// Called by main.js after anything writes to the tape store behind our back —
// a load, a migration, a debug setter.
export function syncTakes() { projectTakes(); }
export function takePlace(roomId) { return state.places[roomId] || null; }
export function takePlaces() { return { ...state.places }; }
export function hasTake(roomId) { return state.takes.includes(roomId); }
export function takeIsContaminated(roomId) { return state.contaminated.includes(roomId); }
export function contaminatedTakes() { return [...state.contaminated]; }
export function setTake(roomId, present = true) {
  if (!roomId) return false;
  if (present) addTake(roomId);
  else {
    takeSink?.forget?.(roomId);
    state.takes = state.takes.filter((id) => id !== roomId);
    state.contaminated = state.contaminated.filter((id) => id !== roomId);
    delete state.places[roomId];
    projectTakes();
  }
  return hasTake(roomId) === !!present;
}

// THE SAVE CARRIES TAPES, NOT THREE LISTS.
//
// `takes` / `contaminated` / `places` are still ACCEPTED, because every save
// written before this change has them and nothing else. They are read once, on
// load, handed to the tape store to adopt, and never written again — so an old
// save migrates on its first open and a new save has one place a take lives.
export function loadRecState(saved = {}) {
  const tapes = Array.isArray(saved.tapes) ? saved.tapes : null;
  // A save written since the stores were merged carries tapes and nothing else;
  // anything older carries the three lists. Read whichever is there.
  const rooms = tapes ? tapes.map((t) => t?.roomId).filter(Boolean) : (saved.takes || []);
  const dirty = tapes
    ? tapes.filter((t) => t?.contaminated).map((t) => t.roomId)
    : (saved.contaminated || []).filter((id) => rooms.includes(id));
  const places = tapes
    ? Object.fromEntries(tapes.filter((t) => t?.place).map((t) => [t.roomId, t.place]))
    // Same hygiene as contaminated: a place for a take that is not in the list
    // is a stale save, not a fact about tonight.
    : Object.fromEntries(Object.entries(saved.places || {}).filter(([id]) => rooms.includes(id)));
  Object.assign(state, {
    injuries: saved.injuries || 0,
    // A save written before composure carried has no field. Null means "start
    // at the ceiling", which is what every one of those nights actually did.
    composure: saved.composure == null ? null : Number(saved.composure),
    // A save from before the pieces were distinct carried a count. Nothing
    // shipped in that state, so it is read as "none" rather than migrated into
    // five arbitrary pieces he never found.
    sheets: Array.isArray(saved.sheets) ? saved.sheets.map(String) : [],
    sheetsTaken: Array.isArray(saved.sheetsTaken) ? saved.sheetsTaken.map(String) : [],
    takes: [...rooms],
    contaminated: [...new Set(dirty)],
    places,
    assistPause: 0,
    battery: saved.battery == null ? 1 : saved.battery,
    worldNoise: 0,
  });
  return { tapes, legacy: { roomIds: state.takes, contaminated: state.contaminated, places: state.places } };
}

// Tapes, always. With the store wired they are the real recordings; without it
// (a headless test, the bag lab) they are the bare facts this module knows, in
// the same shape — so the module still round-trips on its own and there is
// still only one list of takes in the file.
export function saveRecState(tapes = null) {
  const fromStore = Array.isArray(tapes) ? tapes : takeSink?.serialize?.();
  return {
    injuries: state.injuries,
    composure: composure(),
    sheets: [...state.sheets],
    sheetsTaken: [...state.sheetsTaken],
    battery: state.battery,
    tapes: fromStore || state.takes.map((roomId) => ({
      roomId,
      contaminated: state.contaminated.includes(roomId),
      place: state.places[roomId] || null,
      audible: [], guest: null, discrete: [], presence: { peak: 0, atSec: 0 },
      cell: null, at: 0, migrated: true,
    })),
  };
}
