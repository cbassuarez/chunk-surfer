// The recordist: light, noise, and the recorder.
//
// The whole game is the tension between three facts:
//   · The flashlight lets you see. Light attracts.
//   · Moving lets you leave. Movement is noise. Noise is what hunts you.
//   · Recording is the job. Recording means light off, feet still, blind —
//     and it is the only time you can hear the room at all.
//
// This module owns state and rules. It plays no audio and draws nothing;
// main.js wires it to the engine, and roomtone.js answers its questions.

import { ROOM_TONE, NOISE } from '../config.js';

const state = {
  light: false,         // you arrive in the dark. Turning it on costs nothing
                        // but your safety.
  recording: false,
  takeElapsed: 0,       // seconds of unbroken quiet
  spoiled: false,
  spoilReason: '',
  injuries: 0,          // permanent within a run; each one makes you louder
  noise: 0,             // current, decaying
  lastNoiseAt: { x: 0, y: 0, t: 0 },   // where the presence goes looking
  slow: false,          // Shift held
  takes: [],            // completed room ids
};

export function recState() { return state; }
export function isRecording() { return state.recording; }
export function lightOn() { return state.light; }

// Noise floor rises with injury and never falls back. You get worse.
export function noiseFloor() { return state.injuries * NOISE.perInjury; }
export function currentNoise() { return state.noise; }

// Reaching for the light mid-take is allowed, and it ruins the take. Every
// rule in this game is a price, never a locked door.
export function toggleLight() {
  state.light = !state.light;
  if (state.recording && state.light) spoil('you reached for the light');
  return state.light;
}

// A step emits noise at the cell you stepped from. That cell is what the
// presence investigates — not you. You are only ever where you were.
export function emitStepNoise(x, y) {
  const level = (state.slow ? NOISE.slow : NOISE.walk) + noiseFloor();
  state.noise = Math.max(state.noise, level);
  state.lastNoiseAt = { x, y, t: performance.now() };
  if (state.recording && level > ROOM_TONE.spoilNoise) spoil('you moved');
  return level;
}

// Anything else that makes a sound in the world: a dropped page, a door, the
// presence itself. Spoils a take the same way your own footfall would.
export function emitNoise(level, x, y, reason = 'something moved') {
  state.noise = Math.max(state.noise, level + noiseFloor());
  if (x != null) state.lastNoiseAt = { x, y, t: performance.now() };
  if (state.recording && state.noise > ROOM_TONE.spoilNoise) spoil(reason);
}

export function decayNoise(dt) {
  state.noise = Math.max(0, state.noise - NOISE.decayPerSec * dt);
}

// ── The recorder ─────────────────────────────────────────────────────────────

export function startRecording() {
  if (state.recording) return false;
  state.recording = true;
  state.light = false;          // the light goes away. you agreed to this.
  state.takeElapsed = 0;
  state.spoiled = false;
  state.spoilReason = '';
  return true;
}

export function stopRecording() {
  if (!state.recording) return null;
  const completed = state.takeElapsed >= ROOM_TONE.takeSeconds && !state.spoiled;
  state.recording = false;
  // The light does NOT come back by itself. Reaching for it is a decision you
  // make in the dark, every time, knowing what it costs.
  const result = { completed, elapsed: state.takeElapsed, spoiled: state.spoiled, reason: state.spoilReason };
  state.takeElapsed = 0;
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
  if (!state.recording) return 'idle';
  if (state.spoiled) return 'spoiled';
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
