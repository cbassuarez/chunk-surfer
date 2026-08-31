import { TECHNIQUE } from './combat-state.js';

// THE BACK OF THE RECORDER.
//
// What the SKILLS tab draws is a patchbay: the recorder's rear panel, six runs
// of sockets on it. One end of every lead is captive in the machine; the player
// carries a handful of free ends and patches them in. A socket that carries is
// a technique the fight can use.
//
// So a tool column is a SERIES RUN — the signal leaves the recorder, passes
// through the first socket, and only reaches the second if the first is
// carrying. That is what `requires` has always meant, and it is why you cannot
// start at the bottom: there is nothing at the shallow socket for the signal to
// come back out of. Some sockets take a lead direct and chain to nothing (the
// first three rungs of NERVE, ROOM TONE, HEADROOM); the drawing follows the
// prerequisite, never the tier.
//
// AND A LEAD COMES BACK OUT. This is the whole reason it is a cable and not a
// token: `pullCombatTechnique` un-patches a socket at any time, and everything
// below it in the run comes back with it. The choice is not "did I guess right
// an hour ago" but "am I rigged for what is through this door" — and the case
// cannot be opened during a fight, so the rig is committed before the room.
//
// The identifiers below still say `pin`. They are in saved games and in the
// audit's citations; nothing the player reads says pin.

// A run can hold this many leads and patch them into this many sockets. Raised
// from a flat 2 so the deepened tree is actually reachable across a run; the
// real ceiling is how many the world hands out.
export const MAX_PINS = 6;
export const MAX_TECHNIQUES = 6;

// Where leads come from. Beyond the two original calibration encounters, the
// first clear of each regular battle and a collectible lead (a set save flag)
// each grant one — so acquisition is no longer two fixed fights.
export const CALIBRATION_ENCOUNTERS = Object.freeze(['recording-2', 'pre-recording-4']);
export const PIN_SOURCES = Object.freeze({
  // Real encounter clear-ids (see openEncounterBattle): the two calibration
  // fights plus the chapel boss now each grant a pin.
  encounters: Object.freeze([...CALIBRATION_ENCOUNTERS, 'chapel']),
  // Collectible leads, found in optional corners of the building — the planter in
  // the ruined atrium garden, the bell tower, and the gallery head that sits
  // off-square on its plinth. Every one of them is somebody else's, left where
  // they put it down. All three sit off the recording route, so exploration is
  // its own reward.
  //
  // `pin.foyer` was retired when the gallery head got one: the foyer bust and the
  // gallery bust were the same discovery twice. The foyer bust keeps its
  // documented repair pin THROUGH the base — which was never collectible, and
  // which now has the word "pin" to itself, since nothing the player reads about
  // the patchbay uses it. One lead per act: atrium, gallery, tower.
  //
  // `pin.yard` is the fourth and the odd one out: it is not inside a piece of
  // furniture and it is not picked up. It is granted for standing still in the
  // yard long enough to watch the weather, and then noticing what was put behind
  // you while you did (see game/yard-vigil.js). Somebody at the microphone has
  // already mentioned an orange cable belonging to a man who left before dinner.
  // Nothing announces it. It is the only lead in the game a player can be handed
  // without being told they have been handed anything.
  flags: Object.freeze(['pin.academic', 'pin.tower', 'pin.gallery', 'pin.yard']),
});

// Two kinds of socket, because there are two kinds of thing worth patching.
//
// FLAT upgrades have no prerequisites and can be taken in any order. They make
// the things you always have better: the regulars — which cost nothing and
// never run out — and the body you bring to the fight. They are the answer to a
// player who does not want to commit to a tool, and they are what makes an
// early lead useful before any branch is deep enough to pay off.
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
  // chain to commit to, useful the moment a lead is patched. This is the column a
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

// WHAT A SOCKET WILL ACCEPT.
//
// `enabled` keeps its old meaning exactly: a spare lead may be patched here NOW.
// It must never be true for a socket that already carries one, because
// learnCombatTechnique gates on it and a second patch would spend a second lead
// on something already owned.
//
// The structural checks come BEFORE the spare-lead check. They used to come
// after, so a player holding nothing was told NO SPARE LEAD on a socket whose
// real problem was that the bent rig is in the plant room — the wrong answer to
// "why can I not do this", and the one the player cannot act on.
export function techniqueAvailability(value, id, { hasRig = false } = {}) {
  const build = normalizeCombatBuild(value);
  const definition = TECHNIQUE_DEFS.find((entry) => entry.id === id);
  if (!definition) return { enabled: false, patched: false, pullable: false, pulls: [], reason: 'UNKNOWN TECHNIQUE' };
  // A patched socket can always be pulled. `learned` is the old name for
  // `patched`, kept because the API had it.
  if (build.techniques.includes(id)) {
    return {
      enabled: false, learned: true, patched: true,
      // NOT gated on hasRig. One end of every lead is captive in the recorder,
      // so a player can always pull their own end — otherwise losing the rig
      // would strand up to four leads with no way to get them back.
      pullable: true, pulls: techniquePullPreview(build, id).pulls,
      reason: 'PATCHED',
    };
  }
  const shut = { enabled: false, learned: false, patched: false, pullable: false, pulls: [] };
  if (definition.requires && !build.techniques.includes(definition.requires)) return { ...shut, reason: 'NO CONTINUITY' };
  if (definition.requiresRig && !hasRig) return { ...shut, reason: 'BENT RIG REQUIRED' };
  if (build.unspent <= 0) return { ...shut, reason: 'NO SPARE LEAD' };
  return { enabled: true, learned: false, patched: false, pullable: false, pulls: [], reason: '' };
}

// PULL ONE LEAD.
//
// Everything below it in the run comes out with it, which is what happens when
// you pull a lead out of a chain: the sockets past the break stop carrying.
//
// There is no cascade logic here and there must not be. normalizeCombatBuild
// already drops any technique whose whole prerequisite chain is not also
// selected, walking the chain — so removing ONE id and re-normalizing does the
// whole job, and diffing the result is how we find out what came out with it.
// An explicit transitive closure would be a second implementation of the same
// rule, free to disagree with the first.
export function pullCombatTechnique(value, id) {
  const build = normalizeCombatBuild(value);
  if (!build.techniques.includes(id)) {
    return { changed: false, build, pulled: [], returned: 0, reason: 'NOT PATCHED' };
  }
  const next = normalizeCombatBuild({
    ...build,
    techniques: build.techniques.filter((technique) => technique !== id),
  }, build.rewardedEncounters);
  const pulled = build.techniques.filter((technique) => !next.techniques.includes(technique));
  return { changed: true, build: next, pulled, returned: next.unspent - build.unspent, reason: '' };
}

// What a pull WOULD cost, without doing it — for the confirm dialogue and the
// detail strip. Deliberately the same code path as the pull itself, so what the
// player is warned about can never differ from what happens.
export function techniquePullPreview(value, id) {
  const result = pullCombatTechnique(value, id);
  return { patched: result.changed, pulls: result.pulled, returns: result.returned };
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
