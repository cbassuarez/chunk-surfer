// THE BALANCE TABLE, ON DEMAND.
//
// The reducer can price a repeatable policy and compare identical starting
// states. It cannot tell us which cues a player will actually understand.
//
//   node tools/chunk_surfer/tune-combat.mjs
//   node tools/chunk_surfer/tune-combat.mjs --preset standard --verbose
//   node tools/chunk_surfer/tune-combat.mjs --pilot
//
// The policies are deliberately not optimal play. `reading` is a competent
// player who counters what the card says; `stock` is the same player with only
// the two tools the bag starts with; `swinging` is somebody who never reads.
import {
  COMBAT_ACTION,
  TECHNIQUE,
  advanceEnemy,
  availableCombatActions,
  combatApparitionsSnapshot,
  combatResult,
  createCombatState,
  predictedCombatIntent,
  reduceCombat,
} from '../../src/game/combat-state.js';
import { attachCombatDefinition, sourceCombatBattle } from '../../src/data/combat-definitions.js';
import { COMBAT_RULES, DIFFICULTY_PRESETS, TORCH_RULES } from '../../src/progression/difficulty-defs.js';
import { learnCombatTechnique, normalizeCombatBuild } from '../../src/game/combat-progression.js';
import { assignCombatGearSlot, availableBattleTools, freshCombatLoadout } from '../../src/game/combat-loadout.js';

const BATTLES = {
  natatorium: attachCombatDefinition({ id: 'natatorium', enemy: 'N', rounds: [] }).combat,
  hall: attachCombatDefinition({ id: 'hall', enemy: 'H', rounds: [] }).combat,
  practice: attachCombatDefinition({ id: 'practice', enemy: 'P', rounds: [] }).combat,
  chapel: attachCombatDefinition({ id: 'chapel', enemy: 'C', rounds: [] }).combat,
  'source-final': sourceCombatBattle({ bodyReturn: false }).combat,
};

function packedTools(extraItem) {
  let loadout = freshCombatLoadout();
  if (extraItem) {
    const packed = assignCombatGearSlot(loadout, extraItem, 3);
    if (!packed.changed) throw new Error(`Cannot pack ${extraItem}: ${packed.reason}`);
    loadout = packed.loadout;
  }
  const order = availableBattleTools(loadout, loadout.top);
  return Object.fromEntries([
    ...['torch', 'recorder', 'radio', 'rig', 'fork', 'coffee', 'spanner'].map(tool => [tool, order.includes(tool)]),
    ['order', order],
  ]);
}

function patchTechniques(receipts, ids, tools) {
  let build = normalizeCombatBuild(receipts);
  for (const id of ids) {
    const patch = learnCombatTechnique(build, id, { hasRig: tools.rig });
    if (!patch.changed) throw new Error(`Cannot fit ${id}: ${patch.reason}`);
    build = patch.build;
  }
  return build.techniques;
}

const STOCK_TOOLS = packedTools();
const SPANNER_TOOLS = packedTools('plant-spanner');
const RIG_TOOLS = packedTools('interface');
const INVESTED = patchTechniques({
  tutorialGrant: { schema: 1, combatAssistance: 'standard' },
  b3LeadEarned: true,
  rewardedEncounters: ['recording-2', 'pre-recording-4'],
  rewardedFlags: ['pin.academic', 'pin.gallery'],
}, [TECHNIQUE.DEEP_RESERVE, TECHNIQUE.BRACE, TECHNIQUE.PUNCH_IN, TECHNIQUE.MASTER_TAKE,
  TECHNIQUE.OVERDUB, TECHNIQUE.RUNAWAY_FEEDBACK], RIG_TOOLS);

const BAGS = {
  stock: { tools: STOCK_TOOLS, techniques: [] },
  spanner: { tools: SPANNER_TOOLS, techniques: [] },
  invested: { tools: RIG_TOOLS, techniques: INVESTED },
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
  const special = moves.find((move) => [
    COMBAT_ACTION.WHITEOUT, COMBAT_ACTION.MASTER_TAKE, COMBAT_ACTION.RUNAWAY_FEEDBACK,
  ].includes(move.id));
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

function pilotReading(state) {
  const intent = predictedCombatIntent(state);
  const moves = open(state);
  const can = id => moves.some(move => move.id === id);
  const counter = COUNTER_FOR[intent?.kind];
  if (!state.tempo && can(counter)
    && (counter !== COMBAT_ACTION.INVERT || intent?.kind === 'loop')) return counter;
  if (state.composure <= state.maxComposure * .55 && can(COMBAT_ACTION.COMPOSE)) return COMBAT_ACTION.COMPOSE;
  if (state.take?.tag === 'body' && can(COMBAT_ACTION.PLAYBACK)) return COMBAT_ACTION.PLAYBACK;
  // Prepare the take on TEMPO, then spend the residue at the first real
  // opening. Every rack gets the same setup opportunity.
  if (state.tempo && state.take && !state.exposedBonus && can(COMBAT_ACTION.EXPOSE)) return COMBAT_ACTION.EXPOSE;
  if (state.exposedBonus && can(COMBAT_ACTION.PLAYBACK)) return COMBAT_ACTION.PLAYBACK;
  return investing(state);
}

function residueReading(state) {
  const moves = open(state);
  const can = id => moves.some(move => move.id === id);
  if (state.take && state.exposedBonus && can(COMBAT_ACTION.PLAYBACK)) return COMBAT_ACTION.PLAYBACK;
  if (state.take && !state.exposedBonus && can(COMBAT_ACTION.EXPOSE)) return COMBAT_ACTION.EXPOSE;
  return pilotReading(state);
}

function inversionReading(state) {
  const movement = state.definition.movements[state.movementIndex].id;
  const needed = `invert.${movement}`;
  const intent = predictedCombatIntent(state);
  if (state.proofs.includes(needed)) return pilotReading(state);
  if (!state.tempo && state.take && intent?.kind === 'loop') return COMBAT_ACTION.INVERT;
  if (!state.take && intent?.recordable) return COMBAT_ACTION.MONITOR;
  if (state.tempo) return COMBAT_ACTION.END_TEMPO;
  if (state.composure < state.maxComposure * .55 && open(state).some(move => move.id === COMBAT_ACTION.COMPOSE)) {
    return COMBAT_ACTION.COMPOSE;
  }
  return COMBAT_ACTION.HOLD;
}

function play(definition, {
  difficulty, tools, techniques, policy, composure = null, injuries = 0, battery = 1,
  torchDrainScale = 1, seed = 0, startingMovementIndex = 0, prioritizeBox = false,
}) {
  let state = createCombatState(definition, {
    difficulty, tools, techniques, battery, composure, injuries, torchDrainScale, seed, startingMovementIndex,
  });
  const opened = state.maxComposure;
  const startedAt = state.composure;
  let guard = 0;
  const uses = {};
  let turnedOverloads = 0;
  let boxClearedTurn = null;
  while (!state.result && guard++ < 400) {
    const box = combatApparitionsSnapshot(state)?.members.find(member => member.role === 'cue');
    if (box && box.health <= 0) boxClearedTurn ??= state.turns;
    if (prioritizeBox && box?.health > 0) {
      state = reduceCombat(state, { type: COMBAT_ACTION.TARGET, targetId: box.id });
    }
    const move = policy(state);
    state = reduceCombat(state, { type: move, replaceTake: true });
    uses[move] = (uses[move] || 0) + 1;
    if (state.last.turnedOverload) turnedOverloads += 1;
    while (state.phase === 'enemy') state = advanceEnemy(state);
  }
  if (combatApparitionsSnapshot(state)?.members.some(member => member.role === 'cue' && member.defeated)) {
    boxClearedTurn ??= state.turns;
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
    torchSpent: state.torchSpent,
    perfect: state.perfectCounters ?? 0,
    missed: state.missedCounters ?? 0,
    proofs: state.proofs,
    uses,
    turnedOverloads,
    boxClearedTurn,
  };
}

const args = process.argv.slice(2);
const only = args.includes('--preset') ? args[args.indexOf('--preset') + 1] : null;
const presets = Object.keys(COMBAT_RULES).filter((id) => !only || id === only);
if (!presets.length || (args.includes('--preset') && !only)) throw new Error('Unknown combat-assistance preset');
const pct = (taken, max) => `${Math.round((taken / Math.max(1, max)) * 100)}%`;

function printPilot() {
  const stages = [
    {
      id:'Hall / take two', battle:BATTLES.hall, tools:STOCK_TOOLS,
      receipts:{ b3LeadEarned:true }, composure:40, injuries:0, battery:.75, startingMovementIndex:0,
      builds:{
        empty:[], torch:[TECHNIQUE.AFTERIMAGE], recorder:[TECHNIQUE.PUNCH_IN], nerve:[TECHNIQUE.BRACE],
      },
    },
    {
      id:'Chapel / Contract → Source', battle:BATTLES.chapel, tools:RIG_TOOLS,
      receipts:{ b3LeadEarned:true, rewardedEncounters:['recording-2', 'pre-recording-4'] },
      composure:26, injuries:1, battery:.32, startingMovementIndex:3,
      builds:{
        empty:[], torch:[TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT, TECHNIQUE.OVEREXPOSE],
        recorder:[TECHNIQUE.PUNCH_IN, TECHNIQUE.MASTER_TAKE, TECHNIQUE.MULTITRACK],
        nerve:[TECHNIQUE.BRACE, TECHNIQUE.DEEP_RESERVE, TECHNIQUE.STEADY_NERVE],
      },
    },
  ];
  const seeds = [11, 17, 43, 65, 78, 103];
  const specialMoves = [
    COMBAT_ACTION.WHITEOUT, COMBAT_ACTION.MASTER_TAKE, COMBAT_ACTION.RUNAWAY_FEEDBACK,
  ];
  const mean = (runs, key) => (runs.reduce((sum, run) => sum + (run[key] || 0), 0) / runs.length).toFixed(1);
  for (const stage of stages) {
    const leads = normalizeCombatBuild(stage.receipts).pinsEarned;
    console.log(`\n${stage.id.toUpperCase()} · ${leads} LEAD${leads === 1 ? '' : 'S'} AVAILABLE · ${stage.tools.order.join(' / ')}`);
    console.log(`  ${seeds.length} fixed seeds; opening composure ${stage.composure}, injury ${stage.injuries}, battery ${pct(stage.battery, 1)}`);
    console.log('  shift      rack / policy       won  turns   lost   left  special   brace   box*  proof†');
    for (const [preset, profile] of Object.entries(DIFFICULTY_PRESETS)) {
      const rule = profile.values.combatAssistance;
      if (!presets.includes(rule)) continue;
      const difficulty = COMBAT_RULES[rule];
      const torchDrainScale = TORCH_RULES[profile.values.torchDrain].drainScale;
      const scenarios = Object.entries(stage.builds).map(([rack, ids]) => ({
        rack, ids, policy:pilotReading, prioritizeBox:stage.battle.apparitions != null,
      }));
      if (stage.battle.apparitions) {
        scenarios.push({ rack:'empty / row order', ids:[], policy:pilotReading, prioritizeBox:false });
        for (const rack of ['empty', 'torch']) {
          scenarios.push({ rack:`${rack} / residue`, ids:stage.builds[rack], policy:residueReading, prioritizeBox:true });
        }
      } else {
        scenarios.push({ rack:'empty / proof first', ids:[], policy:inversionReading, prioritizeBox:false });
      }
      scenarios.push({
        rack:'nerve / HOLD only', ids:stage.builds.nerve, policy:() => COMBAT_ACTION.HOLD,
        prioritizeBox:stage.battle.apparitions != null,
      });
      for (const scenario of scenarios) {
        const techniques = patchTechniques(stage.receipts, scenario.ids, stage.tools);
        const runs = seeds.map(seed => play(stage.battle, { ...stage, ...scenario, seed, techniques, difficulty, torchDrainScale }));
        const wins = runs.filter(run => run.result === 'win').length;
        const specials = runs.reduce((sum, run) =>
          sum + specialMoves.reduce((count, move) => count + (run.uses[move] || 0), 0), 0);
        const box = runs.filter(run => run.boxClearedTurn != null);
        const proofs = runs.filter(run => run.proofs.includes('invert.contract') && run.proofs.includes('invert.source')).length;
        console.log(
          `  ${preset.padEnd(10)} ${scenario.rack.padEnd(18)} ${String(`${wins}/${runs.length}`).padStart(4)}`
          + `  ${mean(runs, 'turns').padStart(5)}  ${mean(runs, 'taken').padStart(5)}  ${mean(runs, 'left').padStart(5)}`
          + `  ${(specials / runs.length).toFixed(1).padStart(7)}  ${mean(runs, 'turnedOverloads').padStart(6)}`
          + `  ${(box.length ? mean(box, 'boxClearedTurn') : '—').padStart(5)}  ${(stage.battle.kind === 'chapel' ? `${proofs}/${runs.length}` : '—').padStart(6)}`,
        );
      }
    }
  }
  console.log('\n* Mean Side Box release turn among runs that release it.');
  console.log('† Runs that earned both late inversion proofs. No prior proof, carried opponent memory or native parry is staged.');
  console.log('  Focused reducer comparisons with fixed pools and seeds; the policy reads the predicted card on all shifts.');
}

function printFullBalance() {
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
          // full+swinging is kept BECAUSE of the spanner. It is the only pairing
          // in the matrix where a blunt tool is both carried and chosen — the
          // swinging policy takes the biggest damage on the board, which is SWING
          // — so without it the two spanner moves ship unmeasured.
          if (bagId === 'spanner' && !['reading', 'swinging'].includes(lineId)) continue;
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
        // Same reason as the per-battle matrix above: full+swinging is the only
        // row where a blunt tool is carried AND chosen, so it is the only one that
        // can price the spanner across a whole night.
        if (bagId === 'spanner' && !['reading', 'swinging'].includes(lineId)) continue;
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
}

if (args.includes('--pilot')) printPilot();
else printFullBalance();
