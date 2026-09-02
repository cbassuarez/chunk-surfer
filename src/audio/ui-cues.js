// THE INTERFACE SOUNDS, WHICH ARE NOT THE BUILDING'S SOUNDS.
//
// Everything else this game plays is diegetic — it happens in a room, it is on
// the tape, something in the dark can hear it. These four are not. They are the
// machine acknowledging a hand on it, and they belong to a different layer.
//
// They come from `cuelume` (MIT, ESM, ~5KB, synthesised live with no audio
// files). Only its MECHANICAL cues are used. The library also ships `sparkle`,
// `bloom`, `chime` and `arrival`, which are lovely and are exactly what the
// doctrine in story-audio.js rules out — "the menus are a tape machine at idle
// … rather than arcade bleeps". Those four stay unused on purpose.
//
// WHY THIS IS A MIRROR AND NOT A BUS.
//
// Cuelume creates its own AudioContext lazily and does not expose it, so these
// sounds cannot be routed into the game's graph (master → outGain → the four
// buses). They therefore hear nothing about the game's volume, mute or
// transport unless we tell them, which is what this module is for. It is a
// deliberate second context: small, and the alternative was reimplementing
// seventeen cue designs to gain a routing we only need two knobs of.
//
// THE ONE TRAP: MENU SOUND MUST SURVIVE PAUSE.
//
// setSfxVolume writes menuGain WITHOUT the `paused ? 0 : v` guard that sfxGain
// and dialogGain both get (main.js) — deliberately, because you are looking at
// a menu when you are paused, and a menu that goes silent the moment it matters
// is a bug. So `setUiCueEnabled` is wired to MUTE, never to pause.

import { play, setEnabled, setVolume } from 'cuelume';

// The mechanical four. Named for what the player is doing, not for the sound,
// so the mapping can be retuned without touching a hundred call sites.
export const UI_CUE = Object.freeze({
  MOVE: 'tick',        // crisp instant tick — moving the selection
  CONFIRM: 'toggle',   // mechanical click-clack — committing to a row
  BACK: 'press',       // dull muted knock — leaving, closing, cancelling
  DENIED: 'error',     // knock and a descending refusal — the thing you cannot do
});

// Cuelume is mixed for web pages, where it is the only thing making noise. In
// here it sits under a tape hiss and over a building, so it comes down. Tuned
// against the old synthesised clicks it replaces rather than against silence.
export const UI_CUE_GAIN = 0.55;

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));

// The two sliders that actually reach a menu sound: GLOBAL, and SFX (which is
// what drives menuGain). Kept separately so either can move on its own.
let globalLevel = 1;
let sfxLevel = 1;
let enabled = true;

function push() {
  try { setVolume(clamp01(globalLevel * sfxLevel * UI_CUE_GAIN)); } catch (_) { /* no audio, no matter */ }
}

export function setUiCueGlobalLevel(value) {
  globalLevel = clamp01(value);
  push();
  return globalLevel;
}
export function setUiCueSfxLevel(value) {
  sfxLevel = clamp01(value);
  push();
  return sfxLevel;
}

// Mute only. Never pause — see the header.
export function setUiCueEnabled(value) {
  enabled = !!value;
  try { setEnabled(enabled); } catch (_) { /* ditto */ }
  return enabled;
}

export function uiCueLevels() {
  return { global: globalLevel, sfx: sfxLevel, enabled, effective: clamp01(globalLevel * sfxLevel * UI_CUE_GAIN) };
}

// Play one. Never throws and never awaits: a UI sound that can fail a keypress
// is worse than a silent one. Cuelume already no-ops on an unknown name or a
// blocked context, and this is the belt to that pair of braces.
export function uiCue(name, options = undefined) {
  if (!enabled || !name) return false;
  try { play(name, options); return true; } catch (_) { return false; }
}
