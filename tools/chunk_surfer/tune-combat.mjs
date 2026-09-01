// THE BALANCE TABLE, ON DEMAND.
//
// Tuning a fight by playing it is slow and lies to you: a designer who wrote
// the enemy knows what it is about to throw. This plays every battle headlessly
// with three named bags and three lines of play, and prints what each of them
// actually costs. Every number in the balance conversation should come from
// here rather than from a feeling.
//
//   node tools/chunk_surfer/tune-combat.mjs
//   node tools/chunk_surfer/tune-combat.mjs --preset standard --verbose
//
// The policies are deliberately not optimal play. `reading` is a competent
// player who counters what the card says; `stock` is the same player with only
// the two tools the bag starts with; `swinging` is somebody who never reads.
import {
  COMBAT_ACTION,
  advanceEnemy,
  availableCombatActions,
  combatResult,
  createCombatState,
  predictedCombatIntent,
  reduceCombat,
} from '../../src/game/combat-state.js';
import { attachCombatDefinition, sourceCombatBattle } from '../../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../../src/progression/difficulty-defs.js';
import { TECHNIQUE_DEFS } from '../../src/game/combat-progression.js';

const BATTLES = {
  natatorium: attachCombatDefinition({ id: 'natatorium', enemy: 'N', rounds: [] }).combat,
  hall: attachCombatDefinition({ id: 'hall', enemy: 'H', rounds: [] }).combat,
  practice: attachCombatDefinition({ id: 'practice', enemy: 'P', rounds: [] }).combat,
  chapel: attachCombatDefinition({ id: 'chapel', enemy: 'C', rounds: [] }).combat,
  'source-final': sourceCombatBattle({ bodyReturn: false }).combat,
};

// What the player brought. STOCK is the bag the game hands you and never asks
// you to improve; INVESTED is a plausible six-pin run.
const STOCK_TOOLS = { torch: true, recorder: true, rig: false, fork: false, radio: false, coffee: false };
const FULL_TOOLS = { torch: true, recorder: true, rig: true, fork: true, radio: true, coffee: true };
const INVESTED = ['deep-reserve', 'brace', 'punch-in', 'master-take', 'perfect-pitch', 'headroom']
  .filter((id) => TECHNIQUE_DEFS.some((def) => def.id === id));

const BAGS = {
  stock: { tools: STOCK_TOOLS, techniques: [] },
  full: { tools: FULL_TOOLS, techniques: [] },
  invested: { tools: FULL_TOOLS, techniques: INVESTED },
};

const COUNTER_FOR = {
  broadcast: COMBAT_ACTION.MONITOR,
  overload: COMBAT_ACTION.HOLD,
  conceal: COMBAT_ACTION.EXPOSE,
  loop: COMBAT_ACTION.INVERT,
  silence: COMBAT_ACTION.EXPOSE,
};

const open = (state) => availableCombatActions(state).filter((move) => move.enabled);
const pick = (state, wanted) => {
  const moves = open(state);
  for (const id of wanted) {
    const found = moves.find((move) => move.id === id);
    if (found) return id;
  }
  return moves[0]?.id || COMBAT_ACTION.WAIT;
};

// Reads the card, not the engine — a player only ever sees the prediction.
const reading = (state) => pick(state, [
  COMBAT_ACTION.PUT_IT_DOWN, COMBAT_ACTION.LISTEN,
  COUNTER_FOR[predictedCombatIntent(state)?.kind],
  COMBAT_ACTION.PLAYBACK, COMBAT_ACTION.EXPOSE, COMBAT_ACTION.MONITOR, COMBAT_ACTION.HOLD,
]);
// Reads, and spends what reading earned. This is the line the tree is for: the
// specials are priced in charge and charge is paid out for correct reads, so a
// player who reads AND has somewhere to spend it should be measurably ahead of
// one who only reads. If these two columns match, the tree is decoration.
const investing = (state) => {
  const moves = open(state);
  const special = moves.find((move) => ['whiteout', 'master-take', 'runaway-feedback'].includes(move.id));
  if (special) return special.id;
  const tune = moves.find((move) => move.id === COMBAT_ACTION.TUNE);
  if (tune) return tune.id;
  return reading(state);
};

// Never reads. Hits the biggest thing available.
const swinging = (state) => {
  const moves = open(state).filter((move) => (move.damage || 0) > 0);
  return moves.sort((a, b) => (b.damage || 0) - (a.damage || 0))[0]?.id || COMBAT_ACTION.WAIT;
};

const POLICIES = { reading, investing, swinging };

function play(definition, { difficulty, tools, techniques, policy, composure = null, injuries = 0 }) {
  let state = createCombatState(definition, { difficulty, tools, techniques, battery: 1, composure, injuries });
  const opened = state.maxComposure;
  const startedAt = state.composure;
  let guard = 0;
  while (!state.result && guard++ < 400) {
    state = reduceCombat(state, { type: policy(state), replaceTake: true });
    if (state.phase === 'enemy') state = advanceEnemy(state);
  }
  const result = combatResult(state);
  return {
    result: result?.result || (state.result || 'unresolved'),
    turns: state.turns,
    taken: result?.damageTaken ?? state.damageTaken,
    max: opened,
    // What he actually walked in with, which since composure carries is no
    // longer the same question as what the ceiling was.
    startedAt: startedAt,
    left: state.composure,
    perfect: state.perfectCounters ?? 0,
    missed: state.missedCounters ?? 0,
  };
}

const args = process.argv.slice(2);
const only = args.includes('--preset') ? args[args.indexOf('--preset') + 1] : null;
const presets = Object.keys(COMBAT_RULES).filter((id) => !only || id === only);
const pct = (taken, max) => `${Math.round((taken / Math.max(1, max)) * 100)}%`;

for (const presetId of presets) {
  const difficulty = COMBAT_RULES[presetId];
  console.log(`\n══ ${presetId.toUpperCase()} ${'═'.repeat(Math.max(0, 58 - presetId.length))}`);
  console.log('  battle          bag        line       result  turns  composure lost');
  for (const [battleId, definition] of Object.entries(BATTLES)) {
    for (const [bagId, bag] of Object.entries(BAGS)) {
      for (const [lineId, policy] of Object.entries(POLICIES)) {
        // A stock bag that never reads is the floor; a full bag that reads is
        // the ceiling. Both are worth seeing, but the pair that decides whether
        // the night is tuned is stock+reading and invested+reading.
        // Only the pairings that mean something: a stock bag cannot invest, and
        // an invested one that never reads has wasted its pins.
        if (bagId === 'stock' && lineId === 'investing') continue;
        if (bagId === 'full' && lineId !== 'reading') continue;
        if (bagId === 'invested' && lineId === 'swinging') continue;
        const out = play(definition, { difficulty, ...bag, policy });
        const flag = out.result === 'lose' ? '  ← LOSS' : out.result === 'unresolved' ? '  ← STALL' : '';
        console.log(
          `  ${battleId.padEnd(15)} ${bagId.padEnd(10)} ${lineId.padEnd(10)} `
          + `${String(out.result).padEnd(7)} ${String(out.turns).padStart(5)}  `
          + `${String(out.taken).padStart(3)}/${String(out.max).padEnd(3)} ${pct(out.taken, out.max).padStart(5)}${flag}`,
        );
      }
    }
  }
}

// ══ THE NIGHT ═══════════════════════════════════════════════════════════════
//
// The table above plays every fight at full composure, which is what the game
// used to do. Composure carries now, so the question that decides whether the
// game is tuned is no longer "can he win this fight" but "can he still be
// standing at the chapel". This runs the five in order on one pool, spending
// the recovery he could plausibly have earned by then.
//
// The recovery model is deliberately pessimistic: one clean take (+5) between
// fights and nothing else. Sheets are the player's answer to a bad run and are
// left out on purpose — if the night is survivable WITHOUT them, the five in
// the building are headroom rather than a requirement.
const COMPOSURE_GRID = 5;
const COMPOSURE_BASE = 8 * COMPOSURE_GRID;
const COMPOSURE_FLOOR = 4 * COMPOSURE_GRID;
const ceiling = (injuries) => Math.max(COMPOSURE_FLOOR, COMPOSURE_BASE - injuries * COMPOSURE_GRID);
const ORDER = ['natatorium', 'hall', 'practice', 'chapel', 'source-final'];
const SHEETS_IN_THE_BUILDING = 5;

console.log(`\n══ THE NIGHT ${'═'.repeat(58)}`);
console.log('  one carried pool, +1 clean take between fights; with and without the five sheets\n');
console.log('  preset      bag        line       before nosheet w/sheet  spent  verdict');
for (const presetId of presets) {
  const difficulty = COMBAT_RULES[presetId];
  for (const [bagId, bag] of Object.entries(BAGS)) {
    for (const [lineId, policy] of Object.entries(POLICIES)) {
      if (bagId === 'stock' && lineId === 'investing') continue;
      if (bagId === 'full' && lineId !== 'reading') continue;
      if (bagId === 'invested' && lineId === 'swinging') continue;
      const night = (sheets) => {
        let pool = COMPOSURE_BASE;
        let injuries = 0;
        let lost = 0;
        let spent = 0;
        const legs = [];
        for (const battleId of ORDER) {
          // SPEND THEM LATE, WHICH IS HOW A PERSON PLAYS.
          //
          // A greedy top-up at every door burns the whole stack on the first
          // two fights and arrives at the chapel with nothing, which is the one
          // way to play this badly. A player reads the room: he walks in on a
          // healthy pool, and reaches into the case only when he is under half.
          while (sheets > 0 && pool < ceiling(injuries) * .6) {
            sheets -= 1; spent += 1;
            pool = Math.min(ceiling(injuries), pool + 3 * COMPOSURE_GRID);
          }
          const out = play(BATTLES[battleId], { difficulty, ...bag, policy, composure: pool, injuries });
          legs.push(`${battleId.slice(0, 4)}:${out.left}`);
          if (out.result === 'lose') {
            lost += 1; injuries += 1;
            pool = Math.min(ceiling(injuries), COMPOSURE_FLOOR);
          } else {
            pool = Math.min(ceiling(injuries), out.left + COMPOSURE_GRID);
          }
        }
        return { lost, pool, spent, legs };
      };
      // The old behaviour, for comparison: every fight opens at the ceiling and
      // nothing carries. Any loss in this column was already in the game before
      // composure carried, and is not something the pool did.
      let wasLosing = 0;
      let wasInjuries = 0;
      for (const battleId of ORDER) {
        const out = play(BATTLES[battleId], { difficulty, ...bag, policy, composure: null, injuries: wasInjuries });
        if (out.result === 'lose') { wasLosing += 1; wasInjuries += 1; }
      }
      const bare = night(0);
      const armed = night(SHEETS_IN_THE_BUILDING);
      const verdict = armed.lost === 0 ? 'clean' : armed.lost >= 3 ? 'SPIRAL' : `${armed.lost} lost`;
      console.log(
        `  ${presetId.padEnd(11)} ${bagId.padEnd(10)} ${lineId.padEnd(10)} `
        + `${String(wasLosing).padStart(6)} ${String(bare.lost).padStart(6)} ${String(armed.lost).padStart(7)}  `
        + `${String(armed.spent).padStart(6)}  ${verdict.padEnd(8)} ${armed.legs.join(' ')}`,
      );
    }
  }
}
console.log('');
