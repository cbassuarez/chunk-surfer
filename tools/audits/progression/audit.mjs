// Collects what the player earns, spends, buys and fights with.
//
// Four things that are always discussed together and are declared four places
// apart: achievements in progression/achievement-defs.js, pins in
// game/combat-progression.js, the skill tree in the same file, and the weapons
// nowhere at all — the moves are built live by availableCombatActions, so the
// only honest way to list them is to build a combat and ask.
//
// Nothing here writes to disk.

import { citationReader } from '../shared.mjs';

import { ENDING_IDS } from '../../../src/progression/schema.js';
import { EVENT_TYPES } from '../../../src/progression/events.js';
import { ACHIEVEMENT_DEFS } from '../../../src/progression/achievement-defs.js';
import { ENDING_MANIFEST } from '../../../src/data/endings.js';
import {
  CALIBRATION_ENCOUNTERS,
  MAX_PINS,
  MAX_TECHNIQUES,
  PIN_SOURCES,
  TECHNIQUE_DEFS,
} from '../../../src/game/combat-progression.js';
import {
  BASE_MAX_CHARGE,
  CHARGE_COST,
  COMBAT_ACTION,
  COMBAT_TOOL,
  actionCounterKinds,
  availableCombatActions,
  availableCombatTools,
  createCombatState,
} from '../../../src/game/combat-state.js';
import { trainingCombatDefinition } from '../../../src/data/combat-definitions.js';

const at = (file, symbol) => ({ file, symbol });

// ── WHERE THE COLLECTIBLE PINS ARE ───────────────────────────────────────────
//
// PIN_SOURCES names four flags and nothing about where they come from, because
// the hosts live in a table inside main.js that nothing can import. This is that
// knowledge, written down, and checked against the code by the citations.
const PIN_PLACES = Object.freeze({
  'pin.academic': {
    where: 'In the soil of the west planter, in the ruined atrium garden.',
    why: 'Somebody knelt out here with a head off and lost it in the dirt.',
    cite: at('src/main.js', "'academic-garden-planter-west': {"),
  },
  'pin.gallery': {
    where: 'In the felt under the base of the gallery head that sits off-square on its plinth.',
    why: 'The same base the plant key is under, which is the point: most players tip the head, take the pin, and never go further into the felt.',
    cite: at('src/main.js', "'academic-bust-5': {"),
  },
  'pin.tower': {
    where: 'In the gap between the boards of the west ringing bench, in the bell tower.',
    why: 'It rings very faintly when the bell settles.',
    cite: at('src/main.js', "'tower-ringing-bench-west': {"),
  },
  'pin.yard': {
    where: 'Nowhere. It is not picked up.',
    why: 'Granted for standing still in the yard long enough to watch the weather, and then noticing what was put behind you while you did. Nothing announces it — the only pin a player can be handed without being told.',
    cite: at('src/game/yard-vigil.js', "FLAG: 'pin.yard'"),
  },
});

const ENCOUNTER_NAMES = Object.freeze({
  'recording-2': 'the second recording fight',
  'pre-recording-4': 'the fight before the fourth recording',
  chapel: 'the chapel boss',
});

// Plain names for the things the tree is organised by.
const BRANCH_NAMES = Object.freeze({
  torch: 'Torch',
  recorder: 'Recorder',
  rig: 'Bent rig',
  nerve: 'Nerve',
  fork: 'Tuning fork',
  radio: 'Radio',
});
const TRACK_NAMES = Object.freeze({
  flat: 'no prerequisite — useful the moment a pin is spent',
  tool: 'a branch you commit to, and it needs the tool',
});

const TOOL_NOTES = Object.freeze({
  self: 'No tool at all. Always in the kit, cannot run out, and deliberately the weakest thing you can do.',
  torch: 'The workhorse. Can be lost, and burns battery.',
  recorder: 'Builds takes and spends them. The other half of the floor: without it the whole fight rests on the torch.',
  rig: 'The bent recording rig. Optional, and the only branch of the tree that needs equipment the bag may not have.',
  fork: 'Reading the fight rather than hitting it.',
  radio: 'Misdirection.',
  coffee: "The guard's cup, if it was taken. One use.",
});

// The moves are assembled live, so ask a real fight rather than keeping a
// second list that would drift. A full bag and every technique bought is not a
// run anybody plays — it is the only way to see every move at once.
function everyMove() {
  const state = createCombatState(trainingCombatDefinition(), {
    tools: { torch: true, recorder: true, rig: true, fork: true, radio: true, coffee: true },
    techniques: TECHNIQUE_DEFS.map((technique) => technique.id),
  });
  state.charge = 99;
  return { tools: availableCombatTools(state), actions: availableCombatActions(state) };
}

// What buys a move, if anything does. A special that no rung of the tree grants
// is a move nobody can reach.
function unlockedBy(actionId) {
  return TECHNIQUE_DEFS.filter((technique) => technique.active?.actionId === actionId
    || technique.id === actionId
    || technique.label.replace(/\s+/g, '-').toLowerCase() === actionId);
}

// How deep a rung is: itself plus everything it requires, which is what it
// really costs in pins.
function techniqueDepth(technique, byId, seen = new Set()) {
  if (!technique || seen.has(technique.id)) return 0;
  seen.add(technique.id);
  return 1 + techniqueDepth(byId.get(technique.requires), byId, seen);
}

export async function buildAudit() {
  const citation = citationReader();
  const findings = [];
  const broken = [];

  // ── achievements ───────────────────────────────────────────────────────────
  const eventNames = new Set(Object.values(EVENT_TYPES));
  const categories = new Map();
  const achievements = [];
  for (const def of ACHIEVEMENT_DEFS) {
    const unknownEvents = (def.events || []).filter((event) => !eventNames.has(event));
    for (const event of unknownEvents) broken.push(`${def.id} listens for "${event}", which is not an event the game raises.`);
    if (!def.events?.length) broken.push(`${def.id} listens for nothing, so it can never be awarded.`);
    if (!String(def.description || '').trim()) findings.push({ id: def.id, text: 'No description, so the achievements screen has nothing to show.' });
    categories.set(def.category, (categories.get(def.category) || 0) + 1);
    achievements.push({
      id: def.id,
      name: def.name,
      description: def.description,
      category: def.category,
      hidden: !!def.hidden,
      events: def.events || [],
      // The exact condition, as written. It is the only complete answer to
      // "what actually awards this", and it is short enough to read.
      condition: String(def.test || '').replace(/\s+/g, ' ').trim(),
      // The ending achievements are BUILT, not typed: endingDef() makes the id
      // out of the ending's own, so `id: 'ACH_END_SACRIFICE'` appears nowhere in
      // the file. Point at the call that made it instead.
      where: await citation(at('src/progression/achievement-defs.js', def.id.startsWith('ACH_END_')
        ? `endingDef('${def.id.slice('ACH_END_'.length).toLowerCase().replaceAll('_', '-')}'`
        : `id: '${def.id}'`)),
    });
  }
  // Every ending should have an achievement, and every ending achievement should
  // name a real ending: endingDef() builds them from a list that is written
  // separately from ENDING_IDS.
  const endingAchievements = new Set(achievements
    .filter((entry) => entry.id.startsWith('ACH_END_'))
    .map((entry) => entry.id.slice('ACH_END_'.length).toLowerCase().replaceAll('_', '-')));
  for (const id of ENDING_IDS) {
    if (!endingAchievements.has(id)) findings.push({ id, text: `The ending "${ENDING_MANIFEST[id]?.title || id}" has no achievement.` });
  }
  for (const id of endingAchievements) {
    if (!ENDING_IDS.includes(id)) broken.push(`There is an achievement for the ending "${id}", which does not exist.`);
  }

  // ── pins ───────────────────────────────────────────────────────────────────
  const pins = [];
  for (const encounter of PIN_SOURCES.encounters) {
    pins.push({
      kind: 'a fight',
      id: encounter,
      title: `Clear ${ENCOUNTER_NAMES[encounter] || encounter}`,
      detail: CALIBRATION_ENCOUNTERS.includes(encounter)
        ? 'One of the two original calibration fights. The first clear grants a pin; losing and winning again does not grant a second.'
        : 'Granted on the first clear.',
      where: await citation(at('src/game/combat-progression.js', 'encounters: Object.freeze(')),
    });
  }
  for (const flag of PIN_SOURCES.flags) {
    const place = PIN_PLACES[flag];
    if (!place) broken.push(`The pin "${flag}" is granted and nothing here says where a player finds it.`);
    pins.push({
      kind: 'found',
      id: flag,
      title: place?.where || 'Not described.',
      detail: place?.why || '',
      where: await citation(place?.cite || at('src/game/combat-progression.js', 'flags: Object.freeze(')),
    });
  }
  const pinCeiling = PIN_SOURCES.encounters.length + PIN_SOURCES.flags.length;
  // Fewer pins than slots would leave a slot nobody can fill. More pins than
  // slots is the design: you cannot have everything, so you have to choose.
  if (pinCeiling < MAX_PINS) {
    findings.push({ id: 'pins', text: `A run can hold ${MAX_PINS} pins and the world only grants ${pinCeiling}, so the last slot is unreachable.` });
  }

  // ── skills ─────────────────────────────────────────────────────────────────
  const byId = new Map(TECHNIQUE_DEFS.map((technique) => [technique.id, technique]));
  const branches = new Map();
  for (const technique of TECHNIQUE_DEFS) {
    if (technique.requires && !byId.has(technique.requires)) {
      broken.push(`${technique.label} requires "${technique.requires}", which is not in the tree.`);
    }
    const depth = techniqueDepth(technique, byId);
    if (depth > MAX_PINS) findings.push({ id: technique.id, text: `${technique.label} is ${depth} pins deep and a run only has ${MAX_PINS}.` });
    if (!branches.has(technique.branch)) branches.set(technique.branch, []);
    branches.get(technique.branch).push({
      id: technique.id,
      label: technique.label,
      detail: technique.detail,
      tier: technique.tier,
      track: technique.track,
      special: !!technique.special,
      requiresRig: !!technique.requiresRig,
      requires: technique.requires || null,
      requiresLabel: technique.requires ? byId.get(technique.requires)?.label || technique.requires : null,
      grants: technique.active?.actionId || null,
      depth,
      where: await citation(at('src/game/combat-progression.js', `label: '${technique.label}'`)),
    });
  }
  const skills = [...branches.entries()].map(([branch, rungs]) => ({
    id: branch,
    title: BRANCH_NAMES[branch] || branch,
    rungs: rungs.sort((a, b) => a.tier - b.tier),
  }));
  if (TECHNIQUE_DEFS.length < MAX_TECHNIQUES) {
    broken.push(`A run may buy ${MAX_TECHNIQUES} techniques and only ${TECHNIQUE_DEFS.length} exist.`);
  }

  // ── weapons ────────────────────────────────────────────────────────────────
  const { tools: liveTools, actions } = everyMove();
  const toolLabels = new Map(liveTools.map((tool) => [tool.id, tool.label]));
  const weapons = [];
  for (const toolId of Object.values(COMBAT_TOOL)) {
    const moves = actions.filter((action) => action.tool === toolId);
    if (!moves.length) {
      broken.push(`The ${toolId} is a tool the fight knows about and nothing in the kit uses it.`);
      continue;
    }
    weapons.push({
      id: toolId,
      title: toolLabels.get(toolId) || toolId.toUpperCase(),
      note: TOOL_NOTES[toolId] || '',
      where: await citation(at('src/game/combat-state.js', `${toolId.toUpperCase()}: '${toolId}'`)),
      moves: await Promise.all(moves.map(async (move) => {
        const bought = unlockedBy(move.id);
        const charge = CHARGE_COST[move.id] || 0;
        if (charge > BASE_MAX_CHARGE) {
          findings.push({ id: move.id, text: `${move.label} costs ${charge} charge and a run starts with room for ${BASE_MAX_CHARGE}, so it needs HEADROOM before it can ever be fired.` });
        }
        return {
          id: move.id,
          label: move.label,
          // The game's own copy for this move, which is what the player reads on
          // the tile. Written verb-first, and it moves with stance and skills —
          // this is the line for a full bag with everything bought.
          detail: move.detail,
          regular: !!move.regular,
          charge,
          counters: actionCounterKinds(move.id),
          boughtWith: bought.map((technique) => technique.label),
          where: await citation(at('src/game/combat-state.js', `id: COMBAT_ACTION.${Object.entries(COMBAT_ACTION).find(([, value]) => value === move.id)?.[0] || ''},`)),
        };
      })),
    });
  }
  // A charge cost for a move nobody can pick is a table nobody maintains.
  for (const actionId of Object.keys(CHARGE_COST)) {
    if (!actions.some((action) => action.id === actionId)) {
      broken.push(`There is a charge cost for "${actionId}", which is not a move in the kit.`);
    }
  }
  // A special the tree never grants is a move nobody reaches.
  for (const move of actions) {
    if ((CHARGE_COST[move.id] || 0) > 0 && !unlockedBy(move.id).length && move.tool !== COMBAT_TOOL.RADIO) {
      findings.push({ id: move.id, text: `${move.label} costs charge and no rung of the skill tree grants it.` });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    limits: { maxPins: MAX_PINS, maxTechniques: MAX_TECHNIQUES, pinCeiling, baseCharge: BASE_MAX_CHARGE },
    sections: [
      { id: 'achievements', title: 'Achievements', count: achievements.length,
        blurb: `${achievements.length} of them, across ${categories.size} categories. ${achievements.filter((a) => a.hidden).length} are hidden until they are earned.` },
      { id: 'pins', title: 'Spare leads', count: pins.length,
        blurb: `${pinCeiling} exist in the world and a run can carry ${MAX_PINS}. They can be pulled back out and patched somewhere else at any time.` },
      { id: 'skills', title: 'The patchbay', count: TECHNIQUE_DEFS.length,
        blurb: `${TECHNIQUE_DEFS.length} sockets across ${skills.length} runs on the back of the recorder, and a run can carry ${MAX_TECHNIQUES} leads.` },
      { id: 'weapons', title: 'Weapons', count: weapons.length,
        blurb: `${weapons.length} tools and ${actions.length} moves. A tool can be lost, and the kit still has to work without it.` },
    ],
    achievements,
    categories: [...categories.entries()].map(([id, count]) => ({ id, count })),
    pins,
    skills,
    weapons,
    global: { broken, findings },
  };
}
