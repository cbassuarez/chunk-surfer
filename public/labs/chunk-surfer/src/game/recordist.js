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

const state = {
  light: false,         // you arrive in the dark. Turning it on costs nothing
                        // but your safety.
  phase: 'idle',        // 'idle' | 'listening' | 'recording'
  takeElapsed: 0,       // seconds of unbroken quiet
  stalled: false,       // an instrument woke: the take is paused, not running,
                        // and you may move to go and silence it.
  spoiled: false,
  spoilReason: '',
  injuries: 0,          // permanent within a run; each one makes you louder
  noise: 0,             // current, decaying
  lastNoiseAt: { x: 0, y: 0, t: 0 },   // where the presence goes looking
  slow: false,          // Shift held
  takes: [],            // completed room ids
};

export function recState() { return state; }
export function isRecording() { return state.phase === 'recording'; }
export function isListening() { return state.phase === 'listening'; }
export function isMonitoring() { return state.phase !== 'idle'; }
export function lightOn() { return state.light; }

// Noise floor rises with injury and never falls back. You get worse.
export function noiseFloor() { return state.injuries * NOISE.perInjury; }
export function currentNoise() { return state.noise; }

// Reaching for the light mid-take is allowed, and it ruins the take. Every
// rule in this game is a price, never a locked door.
export function toggleLight() {
  state.light = !state.light;
  if (state.phase === 'recording' && state.light) spoil('you reached for the light');
  return state.light;
}

// A step emits noise at the cell you stepped from. That cell is what the
// presence investigates — not you. You are only ever where you were.
export function emitStepNoise(x, y) {
  const level = (state.slow ? NOISE.slow : NOISE.walk) + noiseFloor();
  state.noise = Math.max(state.noise, level);
  state.lastNoiseAt = { x, y, t: performance.now() };
  if (state.phase === 'recording' && !state.stalled && level > ROOM_TONE.spoilNoise) spoil('you moved');
  return level;
}

// Anything else that makes a sound in the world: a dropped page, a door, the
// presence itself. Spoils a take the same way your own footfall would.
export function emitNoise(level, x, y, reason = 'something moved') {
  state.noise = Math.max(state.noise, level + noiseFloor());
  if (x != null) state.lastNoiseAt = { x, y, t: performance.now() };
  if (state.phase === 'recording' && !state.stalled && state.noise > ROOM_TONE.spoilNoise) spoil(reason);
}

// A discrete burst that STACKS on whatever noise is already in the air, rather
// than taking the louder of the two. This is what lets the radio's squelch add
// to a footstep you are already making — one alone spoils the take, the two
// together are loud enough to be caught. Continuous sources (your own body, the
// live mic) keep using emitNoise so they don't runaway-accumulate each frame.
export function addNoise(level, x, y, reason = 'something moved') {
  state.noise = Math.min(1, state.noise + level + noiseFloor());
  if (x != null) state.lastNoiseAt = { x, y, t: performance.now() };
  if (state.phase === 'recording' && !state.stalled && state.noise > ROOM_TONE.spoilNoise) spoil(reason);
}

export function decayNoise(dt) {
  state.noise = Math.max(0, state.noise - NOISE.decayPerSec * dt);
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

export function stopRecording() {
  if (state.phase !== 'recording') return null;
  const completed = state.takeElapsed >= ROOM_TONE.takeSeconds && !state.spoiled;
  state.phase = 'idle';
  // The light does NOT come back by itself. Reaching for it is a decision you
  // make in the dark, every time, knowing what it costs.
  const result = { completed, elapsed: state.takeElapsed, spoiled: state.spoiled, reason: state.spoilReason };
  state.takeElapsed = 0;
  state.stalled = false;
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
  // While an instrument sounds the take is held: the clock stops and noise does
  // not spoil it. Silence the instrument (resumeTake) to let it run again.
  if (state.stalled) return 'stalled';
  if (state.noise > ROOM_TONE.spoilNoise) { spoil('the room was not empty'); return 'spoiled'; }
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

export function loadRecState(saved = {}) {
  Object.assign(state, {
    injuries: saved.injuries || 0,
    takes: saved.takes || [],
  });
}
export function saveRecState() {
  return { injuries: state.injuries, takes: state.takes };
}
