// THE HOUSE — the one encounter with more than one thing in it.
//
// Every other fight is a single opponent, and the whole combat layer is built
// around that. These hold two promises at once: that the hall is genuinely a
// group fight, and that adding one changed nothing for the five fights that
// are not.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_ACTION,
  TECHNIQUE,
  availableCombatActions,
  combatHouse,
  combatResult,
  createCombatState,
  reduceCombat,
  advanceEnemy,
  runCombatTurn,
  currentCombatIntent,
} from '../src/game/combat-state.js';
import { thoughtTrace } from '../src/game/thought-trace.js';
import {
  HOUSE_MAX_FIGURES,
  HOUSE_ROWS,
  HOUSE_MIN_FIGURES,
  createHouse,
  houseStrikeFor,
  houseTotal,
  moveHouseTarget,
  strikeHouse,
  strikeHouseAll,
  targetRow,
} from '../src/game/battle-house.js';
import { attachCombatDefinition } from '../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';

const FULL_BAG = { torch: true, recorder: true, rig: true, fork: true, radio: true };
const definition = (id) => attachCombatDefinition({ id, enemy: 'X', rounds: [] }).combat;
const hall = (over = {}) => createCombatState(definition('hall'), {
  difficulty: COMBAT_RULES.standard, tools: FULL_BAG, battery: 1, seed: 7, ...over,
});

// ── the house itself ────────────────────────────────────────────────────────

test('a house is seeded, sparse, and never seats an unreachable row', () => {
  for (let seed = 0; seed < 40; seed += 1) {
    const house = createHouse({ seed: `s${seed}` });
    const total = houseTotal(house);
    assert.ok(total >= HOUSE_MIN_FIGURES && total <= HOUSE_MAX_FIGURES, `seed ${seed} seated ${total}`);
    for (const row of house.rows) {
      // A row that starts empty can never act and can never be cleared, which
      // reads as a bug rather than as an empty section.
      assert.ok(row.figures >= 1, `seed ${seed} left ${row.label} empty at the start`);
    }
  }
});

test('the deal is capped, so the house is never one crowd and four mistakes', () => {
  // Uncapped, eight figures across five rows dealt 4/1/1/1/1 on the first seed
  // tried — which makes the target cursor pointless, because there is only ever
  // one row worth pointing at.
  for (let seed = 0; seed < 40; seed += 1) {
    const house = createHouse({ seed: `s${seed}` });
    const counts = house.rows.map((row) => row.figures);
    const cap = Math.ceil(houseTotal(house) / house.rows.length) + 1;
    assert.ok(Math.max(...counts) <= cap, `seed ${seed} dealt ${counts.join('/')}`);
  }
});

test('the same seed is the same house, twice', () => {
  const a = createHouse({ seed: 'hall:3' });
  const b = createHouse({ seed: 'hall:3' });
  assert.deepEqual(a.rows.map((row) => row.figures), b.rows.map((row) => row.figures));
  assert.notDeepEqual(
    createHouse({ seed: 'hall:3' }).rows.map((row) => row.figures),
    createHouse({ seed: 'hall:9' }).rows.map((row) => row.figures),
  );
});

test('the cursor skips cleared rows and stays near the one it lost', () => {
  const house = createHouse({ seed: 'cursor', figures: 10 });
  house.target = 3;
  strikeHouse(house, house.rows[3].id, 99);
  // Falling back to the first occupied row throws the player across the house
  // every time they clear a section, in a fight whose only decision is where
  // they were pointing.
  assert.ok(Math.abs(house.target - 3) <= 1, `cursor jumped to ${house.target}`);
  assert.ok(targetRow(house).figures > 0);

  for (const row of house.rows) if (row.id !== house.rows[0].id) strikeHouse(house, row.id, 99);
  moveHouseTarget(house, 1);
  assert.equal(targetRow(house).id, house.rows[0].id, 'the cursor must land on the only row left');
});

test('a group special reaches every occupied row, and only occupied rows', () => {
  const house = createHouse({ seed: 'group', figures: 10 });
  strikeHouse(house, house.rows[2].id, 99);
  const before = house.rows.map((row) => row.figures);
  const { removed, rows } = strikeHouseAll(house, 1);
  assert.equal(rows, 4, 'the cleared row is not struck again');
  assert.equal(removed, 4);
  house.rows.forEach((row, index) => {
    assert.equal(row.figures, Math.max(0, before[index] - (before[index] > 0 ? 1 : 0)), row.label);
  });
});

// ── what actually puts somebody down ────────────────────────────────────────

test('a figure goes down on a read or on a loud special, never on a chip', () => {
  // Coherence damage and figures were the same currency at first, and the fight
  // collapsed: MONITOR chips for one, a figure costs one, and a house of eight
  // emptied in six decisions against an encounter written for nine to fifteen.
  assert.equal(houseStrikeFor(COMBAT_ACTION.MONITOR, false), null, 'an ordinary chip touches nobody');
  assert.equal(houseStrikeFor(COMBAT_ACTION.EXPOSE, false), null);
  assert.equal(houseStrikeFor(COMBAT_ACTION.MONITOR, true), 'single', 'reading one right puts one down');
  assert.equal(houseStrikeFor(COMBAT_ACTION.PARRY, false), 'single');
  assert.equal(houseStrikeFor(COMBAT_ACTION.MASTER_TAKE, false), 'single');
  assert.equal(houseStrikeFor(COMBAT_ACTION.WHITEOUT, false), 'group');
  assert.equal(houseStrikeFor(COMBAT_ACTION.RUNAWAY_FEEDBACK, false), 'group');
});

test('an aborted action does not quietly remove a person', () => {
  // MONITOR applied its damage and THEN returned to ask about the take slot, so
  // the beat never happened but the blow had already landed. Free coherence
  // against every other opponent; against the house, a seat emptied per press
  // while the prompt just came back.
  let state = hall();
  state.take = { id: 'held', label: 'HELD', damage: 2, tag: null };
  state.house.rows[0].figures = 3;
  state.house.target = 0;
  const before = houseTotal(state.house);
  const coherenceBefore = state.movementCoherence;
  const after = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  assert.match(after.last.notice, /TAKE SLOT OCCUPIED/);
  assert.equal(houseTotal(after.house), before, 'the aborted press emptied a seat');
  assert.equal(after.movementCoherence, coherenceBefore, 'and chipped the opponent for free');
});

// ── the fight ───────────────────────────────────────────────────────────────

test('the cursor is not a turn', () => {
  const state = hall();
  const moved = reduceCombat(state, { type: COMBAT_ACTION.TARGET, delta: 1 });
  assert.notEqual(combatHouse(moved).targetId, combatHouse(state).targetId, 'the cursor moved');
  assert.equal(moved.turnsInMovement, state.turnsInMovement, 'and it cost a beat');
  assert.equal(moved.composure, state.composure);
  assert.equal(moved.cycleIndex, state.cycleIndex);
});

test('a perfect counter lands where the cursor is pointing, not where the blow came from', () => {
  let state = hall();
  // Aim somewhere that is not acting, and confirm the read still pays out there.
  const view = combatHouse(state);
  const elsewhere = view.rows.find((row) => !row.acting && !row.cleared);
  let guard = 0;
  while (combatHouse(state).targetId !== elsewhere.id && guard++ < 8) {
    state = reduceCombat(state, { type: COMBAT_ACTION.TARGET, delta: 1 });
  }
  const before = combatHouse(state).rows.find((row) => row.id === elsewhere.id).figures;
  const kind = currentCombatIntent(state).kind;
  const answer = availableCombatActions(state).find((move) => move.enabled && move.countersKinds.includes(kind));
  const after = reduceCombat(state, { type: answer.id, replaceTake: true });
  assert.equal(after.last.perfect, true, 'the counter was the right one');
  assert.equal(combatHouse(after).rows.find((row) => row.id === elsewhere.id).figures, before - 1);
});

test('one row acts at a time, and it is not usually the same one twice', () => {
  let state = hall();
  const acted = [];
  for (let beat = 0; beat < 14 && !combatResult(state); beat += 1) {
    const view = combatHouse(state);
    const acting = view.rows.filter((row) => row.acting);
    assert.ok(acting.length <= 1, 'two rows acted on one beat');
    if (acting.length) acted.push(acting[0].id);
    state = state.phase === 'select'
      ? reduceCombat(state, { type: COMBAT_ACTION.HOLD })
      : advanceEnemy(state);
  }
  assert.ok(acted.length > 4, 'the house never moved');
  assert.ok(new Set(acted).size > 1, 'the same section acted every single beat, which is one opponent again');
});

test('emptying the house wins the fight, whatever movement it happens in', () => {
  let state = hall();
  assert.ok(state.movementIndex < state.definition.movements.length - 1);
  for (const row of state.house.rows) strikeHouse(state.house, row.id, 99);
  state.house.rows[0].figures = 1;
  state.house.target = 0;
  const kind = currentCombatIntent(state).kind;
  const answer = availableCombatActions(state).find((move) => move.enabled && move.countersKinds.includes(kind));
  const after = reduceCombat(state, { type: answer.id, replaceTake: true });
  assert.match(after.last.notice, /THE HOUSE IS EMPTY/);
  assert.equal(combatResult(after)?.result, 'win');
});

test('the hall is still a deliberate arc, not a race to clear seats', () => {
  // Clearing has to be an achievable alternate win, not the fast path. A player
  // who reads well should sometimes empty the house and sometimes run out of
  // audience to matter before they run out of movements.
  const outcomes = [];
  for (let seed = 1; seed <= 8; seed += 1) {
    let state = hall({ seed, techniques: Object.values(TECHNIQUE) });
    let decisions = 0;
    while (!combatResult(state) && decisions < 40) {
      const intent = currentCombatIntent(state);
      const action = state.tempo
        ? (state.take ? COMBAT_ACTION.PLAYBACK : COMBAT_ACTION.EXPOSE)
        : intent.kind === 'broadcast' ? COMBAT_ACTION.MONITOR
          : intent.kind === 'conceal' ? COMBAT_ACTION.EXPOSE : COMBAT_ACTION.HOLD;
      state = runCombatTurn(state, { type: action, replaceTake: true });
      decisions += 1;
    }
    assert.equal(combatResult(state)?.result, 'win', `seed ${seed}`);
    assert.ok(decisions >= 8, `seed ${seed} won in ${decisions} decisions`);
    outcomes.push(houseTotal(state.house));
  }
  assert.ok(outcomes.some((left) => left > 0), 'the house is always emptied — clearing is too cheap');
});

// ── and nothing else grew a crowd ───────────────────────────────────────────

test('the hall is the only fight with a house, and the rest are untouched', () => {
  for (const id of ['natatorium', 'practice', 'chapel']) {
    const state = createCombatState(definition(id), { difficulty: COMBAT_RULES.standard, tools: FULL_BAG });
    assert.equal(state.house, null, `${id} grew an audience`);
    assert.equal(combatHouse(state), null);
    // And the cursor action is inert rather than throwing where there is no house.
    assert.doesNotThrow(() => reduceCombat(state, { type: COMBAT_ACTION.TARGET, delta: 1 }));
  }
  assert.ok(createCombatState(definition('hall'), { difficulty: COMBAT_RULES.standard, tools: FULL_BAG }).house);
});

test('the row thoughts fit the card they are drawn on', () => {
  // The intent card is capped at 34 columns (combat.js), and the first draft of
  // the mismatch line ran to 45 — losing the half that named the section he was
  // actually pointing at, which was the entire content of the line.
  const CARD = 34;
  const rows = HOUSE_ROWS.map((row, index) => ({
    ...row, figures: index === 0 ? 1 : 4, seats: 4, cleared: false,
    acting: index === 0, targeted: index === HOUSE_ROWS.length - 1,
  }));
  for (const targeted of HOUSE_ROWS.keys()) {
    const view = { actingId: HOUSE_ROWS[0].id, rows: rows.map((row, i) => ({ ...row, targeted: i === targeted })) };
    const state = hall();
    const lines = thoughtTrace(state, {
      intent: currentCombatIntent(state), counters: [], fidelity: 1, house: view,
    }).lines;
    for (const line of lines) {
      assert.ok(line.text.length <= CARD, `"${line.text}" is ${line.text.length} of ${CARD} columns`);
    }
  }
});
