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

// Two kinds of pin, because there are two kinds of thing worth buying.
//
// FLAT upgrades have no prerequisites and can be taken in any order. They make
// the things you always have better: the regulars — which cost nothing and
// never run out — and the body you bring to the fight. They are the answer to a
// player who does not want to commit to a tool, and they are what makes an
// early pin useful before any branch is deep enough to pay off.
//
// TOOL branches are where the SPECIALS live. A branch's first rung sharpens
// that tool's regular, its second unlocks the special the tool is for, and the
// third makes the special worth the charge. Committing to a tool is what buys
// you something loud.
export const TECHNIQUE_TRACK = Object.freeze({ FLAT: 'flat', TOOL: 'tool' });

export const TECHNIQUE_DEFS = Object.freeze([
  // The skills tab draws this as a grid: one column per branch, one node per
  // tier, top to bottom. So the layout below IS the screen, and it reads the
  // same way in every column — the tool's regular first, the special it pays
  // for second, then what makes the special worth its charge.
  //
  // ★ marks a SPECIAL. None of them is more than two pins deep: RUNAWAY
  // FEEDBACK used to sit four rungs down, which is most of a run's six pins for
  // one button, and nobody ever reached it.
  //
  // The copy below names WHAT A THING DOES and deliberately does not quote exact
  // damage. Damage is a band now (see combat-damage.js) and where a hit lands
  // inside it is earned per beat, so a flat number here would be a promise the
  // fight does not make. The live numbers are on the move tiles, which derive
  // them from the same tables the reducer runs on.

  // TORCH — the regular that carries the fight, and the way to burn it out.
  Object.freeze({ id: TECHNIQUE.AFTERIMAGE, track: 'flat', branch: 'torch', tier: 1, label: 'AFTERIMAGE', detail: 'EXPOSED leaves twice the residue for the next PLAYBACK.' }),
  Object.freeze({ id: TECHNIQUE.WHITEOUT, track: 'tool', branch: 'torch', tier: 2, requires: TECHNIQUE.AFTERIMAGE, label: 'WHITEOUT', detail: 'SPECIAL — 2 charge and a bite of battery: it lands whatever they do, clears a set guard, breaks Conceal or Silence.', active: Object.freeze({ actionId: 'whiteout', tool: 'torch', timing: 'select' }), special: true }),
  Object.freeze({ id: TECHNIQUE.OVEREXPOSE, track: 'tool', branch: 'torch', tier: 3, requires: TECHNIQUE.WHITEOUT, label: 'OVEREXPOSE', detail: 'EXPOSED leaves a stronger residue still: the next PLAYBACK gains another point on top.' }),

  // RECORDER — listening closely, and the one take that settles it.
  Object.freeze({ id: TECHNIQUE.PUNCH_IN, track: 'flat', branch: 'recorder', tier: 1, label: 'PUNCH IN', detail: 'MONITOR chips twice as hard — every capture, not once a movement.' }),
  Object.freeze({ id: TECHNIQUE.MASTER_TAKE, track: 'tool', branch: 'recorder', tier: 2, requires: TECHNIQUE.PUNCH_IN, label: 'MASTER TAKE', detail: 'SPECIAL — 2 charge: the definitive capture. Never a graze, and it leaves a strong take loaded.', active: Object.freeze({ actionId: 'master-take', tool: 'recorder', timing: 'select' }), special: true }),
  Object.freeze({ id: TECHNIQUE.MULTITRACK, track: 'tool', branch: 'recorder', tier: 3, requires: TECHNIQUE.MASTER_TAKE, label: 'MULTITRACK', detail: 'PLAYBACK keeps a light residual Take once per movement — no rig needed.' }),
  Object.freeze({ id: TECHNIQUE.ROOM_TONE, track: 'flat', branch: 'recorder', tier: 4, label: 'ROOM TONE', detail: 'Begin every encounter with an ambient Take already loaded.' }),

  // BENT RIG — the only branch that needs equipment the bag may not have.
  Object.freeze({ id: TECHNIQUE.OVERDUB, track: 'tool', branch: 'rig', tier: 1, requiresRig: true, label: 'OVERDUB', detail: 'Once per movement, PLAYBACK leaves a light residual Take.' }),
  Object.freeze({ id: TECHNIQUE.RUNAWAY_FEEDBACK, track: 'tool', branch: 'rig', tier: 2, requires: TECHNIQUE.OVERDUB, requiresRig: true, label: 'RUNAWAY FEEDBACK', detail: 'SPECIAL — 3 charge: the loop eats itself. It reaches the whole room, and the room loses its next beat.', active: Object.freeze({ actionId: 'runaway-feedback', tool: 'rig', timing: 'select' }), special: true }),
  Object.freeze({ id: TECHNIQUE.FEEDBACK_LOOP, track: 'tool', branch: 'rig', tier: 3, requires: TECHNIQUE.RUNAWAY_FEEDBACK, requiresRig: true, label: 'FEEDBACK LOOP', detail: 'Once per encounter, INVERT retains the Take and returns more.' }),
  Object.freeze({ id: TECHNIQUE.TAPE_ECHO, track: 'tool', branch: 'rig', tier: 4, requires: TECHNIQUE.FEEDBACK_LOOP, requiresRig: true, label: 'TAPE ECHO', detail: 'A retained INVERT returns more still.' }),

  // NERVE — the body you bring. Every rung is flat: no tool, no prerequisite
  // chain to commit to, useful the moment a pin is spent. This is the column a
  // player buys when they do not want to bet on a tool surviving the night.
  Object.freeze({ id: TECHNIQUE.DEEP_RESERVE, track: 'flat', branch: 'nerve', tier: 1, label: 'DEEP RESERVE', detail: 'More composure in every encounter.' }),
  Object.freeze({ id: TECHNIQUE.BRACE, track: 'flat', branch: 'nerve', tier: 2, label: 'BRACE', detail: 'HOLD prevents more, every time.' }),
  Object.freeze({ id: TECHNIQUE.STEADY_NERVE, track: 'flat', branch: 'nerve', tier: 3, label: 'STEADY NERVE', detail: 'COMPOSE restores more composure.' }),
  Object.freeze({ id: TECHNIQUE.RIPOSTE, track: 'flat', branch: 'nerve', tier: 4, requires: TECHNIQUE.STEADY_NERVE, label: 'RIPOSTE', detail: 'PARRY reflects more coherence on a blow you meet.' }),
  Object.freeze({ id: TECHNIQUE.SECOND_WIND, track: 'flat', branch: 'nerve', tier: 5, requires: TECHNIQUE.RIPOSTE, label: 'SECOND WIND', detail: 'Every perfect counter also restores a little composure.' }),

  // FORK — reading the fight, and what a good read is worth. HEADROOM sits here
  // because charge is not a battery: it is paid out for reading the opponent
  // correctly, so the room to hold more of it belongs on the attunement line.
  Object.freeze({ id: TECHNIQUE.PERFECT_PITCH, track: 'flat', branch: 'fork', tier: 1, label: 'PERFECT PITCH', detail: 'A tuned read is sharper still, and holds through the movement.' }),
  Object.freeze({ id: TECHNIQUE.RESONANCE, track: 'tool', branch: 'fork', tier: 2, requires: TECHNIQUE.PERFECT_PITCH, label: 'RESONANCE', detail: "TUNE's resonant bonus on the next perfect counter is doubled." }),
  Object.freeze({ id: TECHNIQUE.HEADROOM, track: 'flat', branch: 'fork', tier: 3, label: 'HEADROOM', detail: '+2 maximum charge: room to hold a louder special.' }),

  // RADIO — misdirection, and a decoy with teeth in it.
  Object.freeze({ id: TECHNIQUE.MISDIRECTION, track: 'flat', branch: 'radio', tier: 1, label: 'MISDIRECTION', detail: 'THROW VOICE guards more.' }),
  Object.freeze({ id: TECHNIQUE.DEAD_AIR, track: 'tool', branch: 'radio', tier: 2, requires: TECHNIQUE.MISDIRECTION, label: 'DEAD AIR', detail: 'SPECIAL — THROW VOICE bites whatever the intent, not only a broadcast or a loop.', special: true }),
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
