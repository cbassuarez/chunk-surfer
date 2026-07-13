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

function handleRecordingNoise(level, reason) {
  if (state.phase !== 'recording' || state.stalled) return;
  const threshold = spoilThreshold();
  if (level <= threshold) return;
  if (difficultyRules.minorNoise === 'pause' && level <= threshold * 1.35) {
    state.assistPause = Math.max(state.assistPause, Number(difficultyRules.pauseSeconds) || 0.7);
    return;
  }
  spoil(reason);
}

const state = {
  light: false,         // you arrive in the dark. Turning it on costs your safety
                        // and, now, your battery. Light attracts, and light runs out.
  battery: 1,           // 0..1. Drains only while it is actually burning.
  phase: 'idle',        // 'idle' | 'listening' | 'recording'
  takeElapsed: 0,       // seconds of unbroken quiet
  stalled: false,       // an instrument woke: the take is paused, not running,
                        // and you may move to go and silence it.
  spoiled: false,
  spoilReason: '',
  injuries: 0,          // permanent within a run; each one makes you louder
  noise: 0,             // current, decaying
  worldNoise: 0,        // remote sources the presence hears but this mic does not
  lastNoiseAt: { x: 0, y: 0, t: 0 },   // where the presence goes looking
  slow: false,          // Shift held
  takes: [],            // completed room ids
  assistPause: 0,       // Story mode can hold the clock for small handling noise
};

export function recState() { return state; }
export function isRecording() { return state.phase === 'recording'; }
export function isListening() { return state.phase === 'listening'; }
export function isMonitoring() { return state.phase !== 'idle'; }
export function lightOn() { return state.light; }

// Noise floor rises with injury and never falls back. You get worse.
export function noiseFloor() { return state.injuries * NOISE.perInjury; }
export function currentNoise() { return state.noise; }
export function currentWorldNoise() { return Math.max(state.noise, state.worldNoise); }

// Reaching for the light mid-take is allowed, and it ruins the take. Every
// rule in this game is a price, never a locked door — except a flat battery,
// which is not a rule and does not care what you have decided.
export function toggleLight() {
  if (!state.light && state.battery <= 0) return false;      // nothing to turn on
  state.light = !state.light;
  if (state.phase === 'recording' && state.light) spoil('you reached for the light');
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
// be a lie. There are no other cells in the building. These are the only spares
// that exist, and they cost you the way out.
const BATTERY_MAX = 2;
export function addBattery(v) { state.battery = Math.max(0, Math.min(BATTERY_MAX, state.battery + v)); }
export function killTorch() { state.light = false; state.battery = 0; }

// A step emits noise at the cell you stepped from. That cell is what the
// presence investigates — not you. You are only ever where you were.
export function emitStepNoise(x, y) {
  const level = (state.slow ? NOISE.slow : NOISE.walk) + noiseFloor();
  state.noise = Math.max(state.noise, level);
  state.lastNoiseAt = { x, y, t: performance.now() };
  handleRecordingNoise(level, 'you moved');
  return level;
}

// Anything else that makes a sound in the world: a dropped page, a door, the
// presence itself. Spoils a take the same way your own footfall would.
export function emitNoise(level, x, y, reason = 'something moved', { spoils = true } = {}) {
  const heard = level + noiseFloor();
  if (spoils) state.noise = Math.max(state.noise, heard);
  else state.worldNoise = Math.max(state.worldNoise, heard);
  if (x != null) state.lastNoiseAt = { x, y, t: performance.now() };
  if (spoils) handleRecordingNoise(state.noise, reason);
}

// A discrete burst that STACKS on whatever noise is already in the air, rather
// than taking the louder of the two. This is what lets the radio's squelch add
// to a footstep you are already making — one alone spoils the take, the two
// together are loud enough to be caught. Continuous sources (your own body, the
// live mic) keep using emitNoise so they don't runaway-accumulate each frame.
export function addNoise(level, x, y, reason = 'something moved') {
  state.noise = Math.min(1, state.noise + level + noiseFloor());
  if (x != null) state.lastNoiseAt = { x, y, t: performance.now() };
  handleRecordingNoise(state.noise, reason);
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
  state.stalled = false;
  state.assistPause = 0;
  state.spoiled = false;
  state.spoilReason = '';
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
  const result = { completed, elapsed: state.takeElapsed, spoiled: state.spoiled, reason: state.spoilReason };
  state.takeElapsed = 0;
  state.stalled = false;
  state.assistPause = 0;
  return result;
}

function spoil(reason) {
  if (state.spoiled) return;
  state.spoiled = true;
  state.spoilReason = reason;
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
    handleRecordingNoise(state.noise, 'the room was not empty');
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
  return state.injuries;
}

export function setSlow(on) { state.slow = !!on; }
export function addTake(roomId) { if (!state.takes.includes(roomId)) state.takes.push(roomId); }
export function hasTake(roomId) { return state.takes.includes(roomId); }
export function setTake(roomId, present = true) {
  if (!roomId) return false;
  if (present) addTake(roomId);
  else state.takes = state.takes.filter((id) => id !== roomId);
  return hasTake(roomId) === !!present;
}

export function loadRecState(saved = {}) {
  Object.assign(state, {
    injuries: saved.injuries || 0,
    takes: saved.takes || [],
    assistPause: 0,
    battery: saved.battery == null ? 1 : saved.battery,
    worldNoise: 0,
  });
}
export function saveRecState() {
  return { injuries: state.injuries, takes: state.takes, battery: state.battery };
}
