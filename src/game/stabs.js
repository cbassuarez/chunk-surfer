// The dread director.
//
// A stab is a transient from the building's own catalogue — the composer's
// music, cut to its sharpest edge — fired into a silence the player has been
// trained to want, protect, and hold still inside.
//
// It is never random. Random is a haunted house. This models the player's
// *expectation* and fires at the trough: the moment they have decided they are
// safe. Expectation rises with time since the last threat, with a clean take,
// with walking a corridor already recorded, with turning the light on in a room
// they have cleared. Then the room speaks.
//
// Two classes, taught in order:
//   TRUE  — something really did move. Teach this first, so the player learns
//           that a stab MEANS something. Without that lesson a false stab is
//           just noise.
//   FALSE — nothing is there. A glimpse, a sound, an empty corridor. These only
//           work once the TRUE lesson is learned, and they are what make the
//           player afraid of a silence that has done nothing yet.
//
// Restraint is the whole design. The budget lives here, in data.

import * as REC from './recordist.js';
import { dreadAllowed } from './terror.js';

export const STABS = {
  quietMinutes: 2.0,       // no stab at all before this. trust must exist first
  cooldownSec: 42,         // hard floor between stabs
  trueBeforeFalse: 2,      // TRUE stabs required before a FALSE one may fire
  falseChance: 0.45,       // once unlocked
  fireThreshold: 0.82,     // expectation must peak this high
  maxPerRoom: 3,
};

const state = {
  startedAt: 0,
  lastStabAt: -1e9,
  trueCount: 0,
  falseCount: 0,
  roomCount: 0,
  expectation: 0,          // 0..1 — how SAFE the player currently feels
  lastThreatAt: 0,
  pool: [],                // transient samples, sharpest first
  onStab: null,
};

export function stabsInit({ onStab } = {}) {
  state.startedAt = performance.now();
  state.lastThreatAt = performance.now();
  state.onStab = onStab || null;
}

// Build the pool from the catalogue: short, hard-attack, noisy or percussive.
// These are the samples that hurt. `chunks` carry runtime analysis already
// (rms, zcr, attack) so no metadata file is required.
export function buildStabPool(chunks) {
  state.pool = chunks
    .filter((c) => c.analysis && c.buffer)
    .map((c) => {
      const a = c.analysis;
      // low attack = transient; high zcr/hf = teeth; short = a stab not a note
      const sharpness = (1 / (a.attack + 0.02)) * (0.35 + a.zcr * 6) * (a.rms + 0.05);
      const brevity = 1 / (0.4 + a.length);
      return { chunk: c, score: sharpness * brevity };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 40)
    .map((e) => e.chunk);
  return state.pool.length;
}

export function poolSize() { return state.pool.length; }

// The battle draws its attacks from the same pool, because the thing that
// attacks you in this game is always a sound the composer already made.
export function drawFromPool(rank = 12) {
  if (!state.pool.length) return null;
  return state.pool[Math.floor(Math.random() * Math.min(rank, state.pool.length))];
}

// The world reports threat: the presence being near, a capture, a spoiled take.
// Threat RESETS expectation — you cannot be startled while already afraid.
export function reportThreat() {
  state.lastThreatAt = performance.now();
  state.expectation = 0;
}

// The world reports relief: these are the moments a player exhales.
export function reportRelief(amount = 0.25) {
  state.expectation = Math.min(1, state.expectation + amount);
}

export function expectation() { return state.expectation; }
export function enteredRoom() { state.roomCount = 0; }

function eligible(now) {
  if (!dreadAllowed()) return false;                       // accessibility
  if (state.pool.length === 0) return false;
  if ((now - state.startedAt) / 60000 < STABS.quietMinutes) return false;
  if ((now - state.lastStabAt) / 1000 < STABS.cooldownSec) return false;
  if (state.roomCount >= STABS.maxPerRoom) return false;
  if (REC.isRecording() && REC.takeProgress() > 0.85) return false;  // not at the finish line. that is cruelty, not dread
  return true;
}

// dt seconds. `threatNear` is the presence's pressure, 0..1.
export function updateStabs(dt, threatNear = 0) {
  const now = performance.now();

  if (threatNear > 0.25) { reportThreat(); return null; }

  // Safety accumulates. This is the whole model: the longer nothing happens,
  // the more certain the player becomes that nothing will.
  const sinceThreat = (now - state.lastThreatAt) / 1000;
  state.expectation = Math.min(1, state.expectation + dt * (0.035 + sinceThreat * 0.0025));

  if (state.expectation < STABS.fireThreshold) return null;
  if (!eligible(now)) return null;

  const canLie = state.trueCount >= STABS.trueBeforeFalse;
  const isFalse = canLie && Math.random() < STABS.falseChance;
  return fire(isFalse ? 'false' : 'true', now);
}

function fire(kind, now) {
  state.lastStabAt = now;
  state.roomCount++;
  state.expectation = 0;
  if (kind === 'true') state.trueCount++; else state.falseCount++;

  const chunk = state.pool[Math.floor(Math.random() * Math.min(12, state.pool.length))];
  const event = { kind, chunk, at: now };
  state.onStab?.(event);
  return event;
}

// Fire deliberately: scripted beats (M4/M5), and the moment something real
// actually happens in the room.
export function stab(kind = 'true') { return fire(kind, performance.now()); }

export function stabStats() {
  return { trueCount: state.trueCount, falseCount: state.falseCount,
           expectation: state.expectation, pool: state.pool.length,
           sinceLastSec: (performance.now() - state.lastStabAt) / 1000 };
}

export function loadStabState(saved = {}) {
  state.trueCount = saved.trueCount || 0;
  state.falseCount = saved.falseCount || 0;
}
export function saveStabState() {
  return { trueCount: state.trueCount, falseCount: state.falseCount };
}
