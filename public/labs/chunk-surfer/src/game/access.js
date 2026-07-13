// Player-facing accessibility/options helpers.
// Keep option interpretation here so menus, text systems, and render effects
// agree on old saves, defaults, and invalid values.

import { getSave } from './save.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const FX_MODE = Object.freeze(['off', 'reduced', 'full']);
export const HINT_MODE = Object.freeze(['off', 'reduced', 'full']);

export function gameSettings() {
  return getSave().settings || {};
}

export function textCps(fallback = 42) {
  const st = gameSettings();
  if (st.instantText) return 1_000_000;

  const n = Number(st.textCps ?? fallback);
  return clamp(Number.isFinite(n) ? n : fallback, 12, 120);
}

export function visualEffectsEnabled() {
  return gameSettings().fx !== false;
}

export function modeValue(value, allowed, fallback) {
  const v = String(value ?? fallback).toLowerCase();
  return allowed.includes(v) ? v : fallback;
}

export function flashMode() {
  if (!visualEffectsEnabled()) return 'off';
  return modeValue(gameSettings().flash, FX_MODE, 'full');
}

export function shakeMode() {
  if (!visualEffectsEnabled()) return 'off';
  return modeValue(gameSettings().shake, FX_MODE, 'full');
}

export function objectiveHintsMode() {
  return modeValue(gameSettings().objectiveHints, HINT_MODE, 'full');
}

export function tutorialPromptsEnabled() {
  return gameSettings().tutorialPrompts !== false;
}

export function pauseWhenBlurEnabled() {
  return gameSettings().pauseOnBlur !== false;
}
