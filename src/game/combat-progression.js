import { TECHNIQUE } from './combat-state.js';

export const CALIBRATION_ENCOUNTERS = Object.freeze(['recording-2', 'pre-recording-4']);

export const TECHNIQUE_DEFS = Object.freeze([
  Object.freeze({ id: TECHNIQUE.AFTERIMAGE, branch: 'torch', tier: 1, label: 'AFTERIMAGE', detail: 'EXPOSED adds +2 damage instead of +1.' }),
  Object.freeze({ id: TECHNIQUE.WHITEOUT, branch: 'torch', tier: 2, requires: TECHNIQUE.AFTERIMAGE, label: 'WHITEOUT', detail: 'Once per encounter: double battery, 4 damage, break Conceal or Silence.' }),
  Object.freeze({ id: TECHNIQUE.ROOM_TONE, branch: 'recorder', tier: 1, label: 'ROOM TONE', detail: 'Begin every encounter with a 2-damage ambient Take.' }),
  Object.freeze({ id: TECHNIQUE.PUNCH_IN, branch: 'recorder', tier: 2, requires: TECHNIQUE.ROOM_TONE, label: 'PUNCH IN', detail: 'First perfect Monitor in each movement also deals 1 damage.' }),
  Object.freeze({ id: TECHNIQUE.OVERDUB, branch: 'rig', tier: 1, requiresRig: true, label: 'OVERDUB', detail: 'Once per movement, Playback leaves a 1-damage residual Take.' }),
  Object.freeze({ id: TECHNIQUE.FEEDBACK_LOOP, branch: 'rig', tier: 2, requires: TECHNIQUE.OVERDUB, requiresRig: true, label: 'FEEDBACK LOOP', detail: 'Once per encounter, Invert retains the Take and returns +1 damage.' }),
]);

const IDS = new Set(TECHNIQUE_DEFS.map((entry) => entry.id));
const unique = (values) => [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value))];

export function freshCombatBuild() {
  return { schema: 1, rewardedEncounters: [], techniques: [], pinsEarned: 0, pinsSpent: 0, unspent: 0 };
}

export function normalizeCombatBuild(value = null, clearedEncounters = []) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rewarded = unique(source.rewardedEncounters).filter((id) => CALIBRATION_ENCOUNTERS.includes(id));
  for (const id of unique(clearedEncounters)) {
    if (CALIBRATION_ENCOUNTERS.includes(id) && !rewarded.includes(id)) rewarded.push(id);
  }
  const selected = unique(source.techniques).filter((id) => IDS.has(id)).slice(0, 2);
  const techniques = selected.filter((id) => {
    const definition = TECHNIQUE_DEFS.find((entry) => entry.id === id);
    return !definition?.requires || selected.includes(definition.requires);
  });
  const pinsEarned = Math.min(2, rewarded.length);
  const pinsSpent = Math.min(pinsEarned, techniques.length);
  return {
    schema: 1,
    rewardedEncounters: rewarded.slice(0, 2),
    techniques,
    pinsEarned,
    pinsSpent,
    unspent: Math.max(0, pinsEarned - pinsSpent),
  };
}

export function techniqueAvailability(value, id, { hasRig = false } = {}) {
  const build = normalizeCombatBuild(value);
  const definition = TECHNIQUE_DEFS.find((entry) => entry.id === id);
  if (!definition) return { enabled: false, reason: 'UNKNOWN TECHNIQUE' };
  if (build.techniques.includes(id)) return { enabled: false, learned: true, reason: 'CALIBRATED' };
  if (build.unspent <= 0) return { enabled: false, reason: 'NO CALIBRATION PINS' };
  if (definition.requires && !build.techniques.includes(definition.requires)) return { enabled: false, reason: 'TIER I REQUIRED' };
  if (definition.requiresRig && !hasRig) return { enabled: false, reason: 'BENT RIG REQUIRED' };
  return { enabled: true, learned: false, reason: '' };
}

export function learnCombatTechnique(value, id, options = {}) {
  const build = normalizeCombatBuild(value);
  const availability = techniqueAvailability(build, id, options);
  if (!availability.enabled) return { changed: false, build, reason: availability.reason };
  const next = normalizeCombatBuild({
    ...build,
    techniques: [...build.techniques, id],
  }, build.rewardedEncounters);
  return { changed: true, build: next, reason: '' };
}
