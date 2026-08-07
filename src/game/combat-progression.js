import { TECHNIQUE } from './combat-state.js';

// A run can hold this many calibration pins and spend them on this many
// techniques. Raised from a flat 2 so the deepened tree is actually reachable
// across a run; the real ceiling is how many pin sources the world grants.
export const MAX_PINS = 6;
export const MAX_TECHNIQUES = 6;

// Where pins come from. Beyond the two original calibration encounters, the
// first clear of each regular battle and a collectible pin pickup (a set save
// flag) each grant one — so acquisition is no longer two fixed fights.
export const CALIBRATION_ENCOUNTERS = Object.freeze(['recording-2', 'pre-recording-4']);
export const PIN_SOURCES = Object.freeze({
  // Real encounter clear-ids (see openEncounterBattle): the two calibration
  // fights plus the chapel boss now each grant a pin.
  encounters: Object.freeze([...CALIBRATION_ENCOUNTERS, 'chapel']),
  // Collectible calibration pins, found in optional corners of the building — the
  // planter in the ruined atrium garden, the bell tower, and the gallery head that
  // sits off-square on its plinth. Picking one up sets its flag, which grants a pin
  // here; all three sit off the recording route, so exploration is its own reward.
  //
  // `pin.foyer` was retired when the gallery head got one: the foyer bust and the
  // gallery bust were the same discovery twice — a marble head with a loose pin in
  // the felt under its base. The foyer bust keeps its documented repair pin THROUGH
  // the base, which was never collectible and still reads correctly. One pin per
  // act now: atrium, gallery, tower.
  //
  // `pin.yard` is the fourth and the odd one out: it is not inside a piece of
  // furniture and it is not picked up. It is granted for standing still in the
  // yard long enough to watch the weather, and then noticing what was put behind
  // you while you did (see game/yard-vigil.js). Nothing announces it. It is the
  // only pin in the game a player can be handed without being told they have
  // been handed anything.
  flags: Object.freeze(['pin.academic', 'pin.tower', 'pin.gallery', 'pin.yard']),
});

export const TECHNIQUE_DEFS = Object.freeze([
  Object.freeze({ id: TECHNIQUE.AFTERIMAGE, branch: 'torch', tier: 1, label: 'AFTERIMAGE', detail: 'EXPOSED adds +2 damage instead of +1.' }),
  Object.freeze({ id: TECHNIQUE.WHITEOUT, branch: 'torch', tier: 2, requires: TECHNIQUE.AFTERIMAGE, label: 'WHITEOUT', detail: 'Once per encounter: double battery, 4 damage, break Conceal or Silence.', active: Object.freeze({ actionId: 'whiteout', tool: 'torch', timing: 'select', once: true }) }),
  Object.freeze({ id: TECHNIQUE.OVEREXPOSE, branch: 'torch', tier: 3, requires: TECHNIQUE.WHITEOUT, label: 'OVEREXPOSE', detail: 'EXPOSED leaves a stronger residue: the next Playback gains a further +1.' }),
  Object.freeze({ id: TECHNIQUE.ROOM_TONE, branch: 'recorder', tier: 1, label: 'ROOM TONE', detail: 'Begin every encounter with a 2-damage ambient Take.' }),
  Object.freeze({ id: TECHNIQUE.PUNCH_IN, branch: 'recorder', tier: 2, requires: TECHNIQUE.ROOM_TONE, label: 'PUNCH IN', detail: 'First perfect Monitor in each movement also deals 1 damage.' }),
  Object.freeze({ id: TECHNIQUE.MULTITRACK, branch: 'recorder', tier: 3, requires: TECHNIQUE.PUNCH_IN, label: 'MULTITRACK', detail: 'Playback keeps a 1-damage residual Take once per movement — no rig needed.' }),
  Object.freeze({ id: TECHNIQUE.OVERDUB, branch: 'rig', tier: 1, requiresRig: true, label: 'OVERDUB', detail: 'Once per movement, Playback leaves a 1-damage residual Take.' }),
  Object.freeze({ id: TECHNIQUE.FEEDBACK_LOOP, branch: 'rig', tier: 2, requires: TECHNIQUE.OVERDUB, requiresRig: true, label: 'FEEDBACK LOOP', detail: 'Once per encounter, Invert retains the Take and returns +1 damage.' }),
  Object.freeze({ id: TECHNIQUE.TAPE_ECHO, branch: 'rig', tier: 3, requires: TECHNIQUE.FEEDBACK_LOOP, requiresRig: true, label: 'TAPE ECHO', detail: 'A retained Invert returns a further +1 damage.' }),
  // Nerve (self): the composure line — a heal that scales and a parry that bites.
  Object.freeze({ id: TECHNIQUE.STEADY_NERVE, branch: 'nerve', tier: 1, label: 'STEADY NERVE', detail: 'COMPOSE restores +1 more composure.' }),
  Object.freeze({ id: TECHNIQUE.RIPOSTE, branch: 'nerve', tier: 2, requires: TECHNIQUE.STEADY_NERVE, label: 'RIPOSTE', detail: 'PARRY reflects +2 more coherence on a read blow.' }),
  Object.freeze({ id: TECHNIQUE.SECOND_WIND, branch: 'nerve', tier: 3, requires: TECHNIQUE.RIPOSTE, label: 'SECOND WIND', detail: 'Every perfect counter also restores 1 composure.' }),
  // Fork (attunement): reading the fight and turning a clean read into damage.
  Object.freeze({ id: TECHNIQUE.PERFECT_PITCH, branch: 'fork', tier: 1, label: 'PERFECT PITCH', detail: 'TUNE reveals three intents instead of two.' }),
  Object.freeze({ id: TECHNIQUE.RESONANCE, branch: 'fork', tier: 2, requires: TECHNIQUE.PERFECT_PITCH, label: 'RESONANCE', detail: "TUNE's resonant bonus on the next perfect counter becomes +2." }),
  // Radio (misdirection): the decoy line, into a once-per-encounter special.
  Object.freeze({ id: TECHNIQUE.MISDIRECTION, branch: 'radio', tier: 1, label: 'MISDIRECTION', detail: 'THROW VOICE guards +1 more.' }),
  Object.freeze({ id: TECHNIQUE.DEAD_AIR, branch: 'radio', tier: 2, requires: TECHNIQUE.MISDIRECTION, label: 'DEAD AIR', detail: 'THROW VOICE also deals 2 coherence, whatever the intent — a decoy with teeth.' }),
  // Tool SPECIALS: loud once-per-encounter finishers, unlocked at the end of a
  // branch (model: WHITEOUT). Tier 4 so they sit beyond the tier-III capstones.
  Object.freeze({ id: TECHNIQUE.MASTER_TAKE, branch: 'recorder', tier: 4, requires: TECHNIQUE.MULTITRACK, label: 'MASTER TAKE', detail: 'SPECIAL — once per encounter: the definitive capture, 6 coherence, no take needed.', active: Object.freeze({ actionId: 'master-take', tool: 'recorder', timing: 'select', once: true }), special: true }),
  Object.freeze({ id: TECHNIQUE.RUNAWAY_FEEDBACK, branch: 'rig', tier: 4, requires: TECHNIQUE.TAPE_ECHO, requiresRig: true, label: 'RUNAWAY FEEDBACK', detail: 'SPECIAL — once per encounter: the loop eats itself, 7 coherence.', active: Object.freeze({ actionId: 'runaway-feedback', tool: 'rig', timing: 'select', once: true }), special: true }),
]);

const IDS = new Set(TECHNIQUE_DEFS.map((entry) => entry.id));
const unique = (values) => [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value))];

export function freshCombatBuild() {
  return { schema: 1, rewardedEncounters: [], rewardedFlags: [], techniques: [], pinsEarned: 0, pinsSpent: 0, unspent: 0 };
}

export function normalizeCombatBuild(value = null, clearedEncounters = [], flags = null) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rewarded = unique(source.rewardedEncounters).filter((id) => PIN_SOURCES.encounters.includes(id));
  for (const id of unique(clearedEncounters)) {
    if (PIN_SOURCES.encounters.includes(id) && !rewarded.includes(id)) rewarded.push(id);
  }
  // Pin-granting flags are folded into the build once seen, so the pin they
  // earned survives every later re-normalization that has no flags context
  // (learning a technique re-normalizes the stored build alone).
  const rewardedFlags = unique(source.rewardedFlags).filter((id) => PIN_SOURCES.flags.includes(id));
  if (flags && typeof flags === 'object') {
    for (const id of PIN_SOURCES.flags) {
      if (flags[id] && !rewardedFlags.includes(id)) rewardedFlags.push(id);
    }
  }
  const selected = unique(source.techniques).filter((id) => IDS.has(id)).slice(0, MAX_TECHNIQUES);
  // A technique holds only if its whole prerequisite chain is also selected.
  const techniques = selected.filter((id) => {
    let cursor = TECHNIQUE_DEFS.find((entry) => entry.id === id);
    while (cursor?.requires) {
      if (!selected.includes(cursor.requires)) return false;
      cursor = TECHNIQUE_DEFS.find((entry) => entry.id === cursor.requires);
    }
    return true;
  });
  const pinsEarned = Math.min(MAX_PINS, rewarded.length + rewardedFlags.length);
  const pinsSpent = Math.min(pinsEarned, techniques.length);
  return {
    schema: 1,
    rewardedEncounters: rewarded.slice(0, PIN_SOURCES.encounters.length),
    rewardedFlags,
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
  if (build.unspent <= 0) return { enabled: false, reason: 'NO PINS FREE' };
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
