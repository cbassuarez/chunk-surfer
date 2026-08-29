// THE HOUSE — the one encounter with more than one thing in it.
//
// Every other fight is a single opponent, and the whole combat layer is built
// around that. These hold two promises at once: that the hall is genuinely a
// group fight, and that adding one changed nothing for the five fights that
// are not.

import test from 'node:test';
import assert from 'node:assert/strict';

import { combatHudLayout } from '../src/render/combat-hud-layout.js';

import {
  COMBAT_ACTION,
  TECHNIQUE,
  availableCombatActions,
  combatHouseSnapshot,
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

// ── the formation rebuild ───────────────────────────────────────────────────
//
// The house used to be one opponent wearing five labels: sections differed only
// in population, the cursor was a formality, and the three authored movements
// were mechanically identical. These hold the promises that make it a formation
// fight instead — that the announced attack is the attack that arrives, that
// every section is worth pointing at for its own reason, and that clearing one
// takes a capability away rather than a number.

import {
  HOUSE_MAX_MAIN_BONUS,
  HOUSE_MAX_SUPPORTS,
  HOUSE_ROLE,
  applyHouseAction,
  commitHouseFormation,
  houseActionPreview,
  houseCombatSnapshot,
  houseFollowUpAllowance,
  houseRow,
  occupiedRows,
  houseShapeFor,
  liveSections,
  recommitHouseLead,
  rememberHouseTool,
  suppressSection,
} from '../src/game/battle-house.js';

const fullHouse = (seed = 'formation', figures = 12) => createHouse({ seed, figures });
const packetOf = (house) => houseCombatSnapshot(house).packet;

test('every section owns a distinct role, and the roles are stable', () => {
  const house = fullHouse();
  const roles = house.rows.map((row) => row.role);
  assert.equal(new Set(roles).size, 5, 'no two sections do the same job');
  assert.deepEqual(roles, [
    HOUSE_ROLE.NEAR_FIELD, HOUSE_ROLE.WITNESS, HOUSE_ROLE.HOUSE_RETURN,
    HOUSE_ROLE.CHORUS, HOUSE_ROLE.CUE,
  ]);
  // ROW F stays the narrative anchor: it is where the named thread seats her.
  assert.equal(houseRow(house, 'row-f').role, HOUSE_ROLE.WITNESS);
});

test('the formation grows across the authored three-movement arc', () => {
  const house = fullHouse('arc');
  commitHouseFormation(house, 0, { supports: 0 });
  assert.equal(packetOf(house).supports.length, 0, 'THE HOUSE IS SEATED acts alone');
  commitHouseFormation(house, 1, { supports: 1 });
  assert.equal(packetOf(house).supports.length, 1, 'EVERY HEAD AT ONCE adds one connected section');
  commitHouseFormation(house, 2, { supports: 2, ovation: true });
  assert.equal(packetOf(house).supports.length, 2, 'APPLAUSE WITH HANDS fields two');
});

test('the committed packet is a fact, and every consumer reads the same one', () => {
  const house = fullHouse('commit');
  commitHouseFormation(house, 3, { supports: 2 });
  const first = packetOf(house);
  const second = packetOf(house);
  assert.deepEqual(first, second, 'reading the snapshot twice cannot change the attack');
  // Nothing recomputes the lead between commitment and resolution.
  const lead = first.leadId;
  applyHouseAction(house, { actionId: 'monitor', targetId: 'stalls' });
  assert.equal(packetOf(house).leadId, lead, 'answering the beat never swaps who is throwing it');
});

test('modifier ceilings keep a committed packet readable', () => {
  for (let seed = 0; seed < 40; seed += 1) {
    const house = fullHouse(`cap:${seed}`, 12);
    commitHouseFormation(house, seed, { supports: 4, ovation: true, difficulty: 'dead-air' });
    const packet = packetOf(house);
    if (!packet) continue;
    assert.ok(packet.supports.length <= HOUSE_MAX_SUPPORTS, 'never more than two supporters');
    assert.ok(packet.mainBonus <= HOUSE_MAX_MAIN_BONUS, `main pressure ${packet.mainBonus} exceeds the ceiling`);
    assert.ok(packet.followUps.length <= houseFollowUpAllowance('dead-air'), 'follow-ups stay inside the allowance');
  }
  const guided = fullHouse('guided', 12);
  commitHouseFormation(guided, 1, { supports: 2, difficulty: 'guided' });
  assert.ok((packetOf(guided).followUps.length) <= 1, 'Guided never takes a second contact');
});

test('clearing a supporter visibly removes its committed modifier', () => {
  // Drive to a packet that actually carries a CHORUS, then take the balcony out
  // from under it and watch the number fall on the card.
  for (let seed = 0; seed < 60; seed += 1) {
    const house = fullHouse(`chorus:${seed}`, 10);
    commitHouseFormation(house, seed, { supports: 2 });
    const before = packetOf(house);
    const chorus = before?.supports.find((row) => row.role === HOUSE_ROLE.CHORUS);
    if (!chorus || before.mainBonus <= 0) continue;
    suppressSection(house, chorus.id);
    const after = packetOf(house);
    assert.ok(after.mainBonus < before.mainBonus, 'the chorus stops paying the moment it is suppressed');
    assert.ok(after.supports.find((row) => row.id === chorus.id).suppressed, 'and the card says so');
    return;
  }
  assert.fail('no seed produced a chorus-supported packet');
});

test('an ordinary blow unsettles, and the second one empties a seat', () => {
  const house = fullHouse('settle');
  const target = houseRow(house, 'stalls');
  const before = target.figures;
  assert.equal(target.settled, true, 'a section starts seated');
  const first = applyHouseAction(house, { actionId: 'monitor', targetId: 'stalls' });
  assert.deepEqual(first.unsettled, ['stalls']);
  assert.equal(houseRow(house, 'stalls').figures, before, 'nobody goes down to a single ordinary blow');
  const second = applyHouseAction(house, { actionId: 'monitor', targetId: 'stalls' });
  assert.deepEqual(second.broken, ['stalls']);
  assert.equal(houseRow(house, 'stalls').figures, before - 1);
  assert.equal(houseRow(house, 'stalls').settled, true, 'the crowd re-forms around the gap');
});

test('a clean read still does it in one', () => {
  const house = fullHouse('perfect');
  const before = houseRow(house, 'stalls').figures;
  const result = applyHouseAction(house, { actionId: 'monitor', perfect: true, targetId: 'stalls' });
  assert.deepEqual(result.broken, ['stalls']);
  assert.equal(houseRow(house, 'stalls').figures, before - 1);
});

test('action shape decides where the force goes', () => {
  assert.equal(houseShapeFor('monitor'), 'focus');
  assert.equal(houseShapeFor('shout'), 'spill');
  assert.equal(houseShapeFor('hold'), 'damp');
  assert.equal(houseShapeFor('whiteout'), 'room');
  assert.equal(houseShapeFor('parry'), 'return');

  // SPILL reaches the nearest occupied neighbour as well.
  const spill = fullHouse('spill');
  const out = applyHouseAction(spill, { actionId: 'shout', targetId: 'stalls' });
  assert.deepEqual(out.unsettled, ['stalls', 'row-f'], 'noise takes the seat next to it too');

  // DAMP takes a section out of the formation rather than out of the house.
  const damp = fullHouse('damp');
  const figures = houseRow(damp, 'lower').figures;
  const damped = applyHouseAction(damp, { actionId: 'hold', targetId: 'lower' });
  assert.deepEqual(damped.suppressed, ['lower']);
  assert.equal(houseRow(damp, 'lower').figures, figures, 'suppression costs nobody their seat');
  assert.ok(!liveSections(damp).some((row) => row.id === 'lower'), 'and it cannot lead or support');

  // RETURN goes back at whoever actually threw the blow, not at the cursor.
  const parry = fullHouse('parry');
  commitHouseFormation(parry, 5, { supports: 1 });
  const lead = packetOf(parry).leadId;
  const returned = applyHouseAction(parry, { actionId: 'parry', perfect: true, targetId: 'stalls' });
  assert.deepEqual(returned.broken, [lead], 'the parry finds the lead, wherever the cursor was');
});

test('the loud specials keep their promises', () => {
  // WHITEOUT unsettles everyone and breaks anyone already unsettled.
  const white = fullHouse('white');
  applyHouseAction(white, { actionId: 'monitor', targetId: 'stalls' });
  const before = houseRow(white, 'stalls').figures;
  const burst = applyHouseAction(white, { actionId: 'whiteout' });
  assert.deepEqual(burst.broken, ['stalls'], 'the one already sitting up loses somebody');
  assert.equal(houseRow(white, 'stalls').figures, before - 1);
  assert.ok(burst.unsettled.length >= 3, 'and the rest sit up');

  // RUNAWAY FEEDBACK breaks one in every occupied section.
  const runaway = fullHouse('runaway');
  const occupied = occupiedRows(runaway).length;
  const loop = applyHouseAction(runaway, { actionId: 'runaway-feedback' });
  assert.equal(loop.broken.length, occupied, 'the room turns on itself everywhere at once');

  // MASTER TAKE is aimed and immediate.
  const master = fullHouse('master');
  const aimed = houseRow(master, 'upper').figures;
  assert.deepEqual(applyHouseAction(master, { actionId: 'master-take', targetId: 'upper' }).broken, ['upper']);
  assert.equal(houseRow(master, 'upper').figures, aimed - 1);
});

test('THROW VOICE recommits the lead in the open, then shows the rebuilt packet', () => {
  const house = fullHouse('throw');
  commitHouseFormation(house, 7, { supports: 1 });
  const original = packetOf(house).leadId;
  const wanted = house.rows.find((row) => row.figures > 0 && row.id !== original).id;
  const rebuilt = recommitHouseLead(house, wanted, { supports: 1 });
  assert.equal(rebuilt.leadId, wanted, 'the section the player chose inherits the lead');
  assert.equal(rebuilt.recommitted, true, 'and the card says it was recommitted');
  assert.ok(!rebuilt.supports.some((row) => row.id === wanted), 'the new lead is no longer its own supporter');
  assert.equal(packetOf(house).leadId, wanted, 'the snapshot everyone reads agrees');
});

test('ROW F reads a repeated tool, and changing hands takes the read away', () => {
  const house = fullHouse('witness');
  for (let press = 0; press < 3; press += 1) rememberHouseTool(house, 'monitor');
  assert.equal(houseCombatSnapshot(house).readTool, 'monitor');
  assert.ok(houseCombatSnapshot(house).readPressure > 0, 'a habit is what a witness is for');
  for (let press = 0; press < 4; press += 1) rememberHouseTool(house, 'expose');
  assert.notEqual(houseCombatSnapshot(house).readTool, 'monitor', 'changing hands breaks the read');
});

test('the action detail states exactly what will happen', () => {
  const house = fullHouse('preview');
  commitHouseFormation(house, 2, { supports: 2 });
  const preview = houseActionPreview(house, { actionId: 'monitor', targetId: 'stalls' });
  assert.match(preview.text, /^FOCUS → STALLS · /, 'it names the shape and the section, not a damage band');
  assert.ok(preview.effects.length, 'and what it does to them');

  // A DAMP aimed at a committed supporter says which modifier it cancels.
  const packet = packetOf(house);
  const supporter = packet.supports[0];
  const damp = houseActionPreview(house, { actionId: 'hold', targetId: supporter.id });
  assert.ok(damp.cancels.length, `damping ${supporter.label} should name the modifier it removes`);
  assert.match(damp.text, /CANCEL /);
});

test('the preview is exactly what resolution does', () => {
  for (let seed = 0; seed < 40; seed += 1) {
    for (const actionId of ['monitor', 'shout', 'master-take', 'whiteout', 'runaway-feedback']) {
      const house = fullHouse(`agree:${seed}`, 10);
      commitHouseFormation(house, seed, { supports: 2 });
      const targetId = house.rows.find((row) => row.figures > 0).id;
      const preview = houseActionPreview(house, { actionId, targetId });
      const before = house.rows.map((row) => row.figures);
      const result = applyHouseAction(house, { actionId, targetId });
      const after = house.rows.map((row) => row.figures);
      const actuallyBroke = before.reduce((sum, n, i) => sum + (n - after[i]), 0);
      const forecastBreak = /BREAK/.test(preview.text);
      assert.equal(actuallyBroke > 0, forecastBreak,
        `${actionId} on seed ${seed}: preview said "${preview.text}" and ${actuallyBroke} went down`);
      assert.equal(actuallyBroke, result.broken.length, 'the result agrees with the figures');
    }
  }
});

test('the target rail is legible and never lands on a cleared section', () => {
  const house = fullHouse('rail');
  commitHouseFormation(house, 1, { supports: 2 });
  const snapshot = houseCombatSnapshot(house);
  assert.equal(snapshot.sections.length, 5, 'five cards, always');
  for (const card of snapshot.sections) {
    assert.ok(card.label && card.roleLabel && card.status, `${card.id} prints all three lines`);
  }
  assert.ok(snapshot.sections.some((card) => card.lead), 'the lead is marked');
  assert.ok(snapshot.sections.some((card) => card.supporting), 'and so are the supporters');

  // Clear the section under the cursor and the cursor settles on a live one.
  const targeted = snapshot.targetId;
  while (houseRow(house, targeted).figures > 0) strikeHouse(house, targeted, 1);
  const settled = houseCombatSnapshot(house);
  assert.notEqual(settled.targetId, targeted, 'the cursor leaves the cleared section');
  assert.ok(houseRow(house, settled.targetId).figures > 0, 'and lands somewhere with people in it');
});

test('no section can hold the lead, and no seed strands the fight on one', () => {
  const leads = new Map();
  let repeats = 0, beats = 0, longest = 0;
  for (let seed = 0; seed < 50; seed += 1) {
    const house = fullHouse(`spread:${seed}`, 6 + (seed % 7));
    let previous = null, streak = 0;
    for (let beat = 0; beat < 12; beat += 1) {
      commitHouseFormation(house, beat, { supports: beat < 4 ? 0 : beat < 8 ? 1 : 2 });
      const packet = packetOf(house);
      if (!packet) break;
      leads.set(packet.leadId, (leads.get(packet.leadId) || 0) + 1);
      streak = previous === packet.leadId ? streak + 1 : 1;
      longest = Math.max(longest, streak);
      if (previous === packet.leadId) repeats += 1;
      previous = packet.leadId;
      beats += 1;
    }
  }
  assert.equal(leads.size, 5, 'every section takes the lead somewhere across the seeds');
  assert.ok(longest <= 2, `a section led ${longest} beats running — the house is one opponent again`);
  assert.ok(repeats / beats < .2, `${(100 * repeats / beats).toFixed(1)}% of beats repeat the lead`);
  for (const [id, count] of leads) {
    assert.ok(count / beats > .08, `${id} leads only ${(100 * count / beats).toFixed(1)}% of the time`);
  }
});

test('adding a formation changed nothing for the fights that are not the hall', () => {
  for (const profile of ['natatorium', 'practice', 'chapel']) {
    const combat = definition(profile);
    assert.equal(combat.house, undefined, `${profile} has no house`);
    for (const movement of combat.movements) {
      assert.equal(movement.formation, undefined, `${profile}/${movement.id} carries no formation rule`);
    }
  }
  assert.deepEqual(definition('hall').movements.map((movement) => movement.formation?.supports), [0, 1, 2],
    'and the hall alone grows across its arc');
});

test('the House rail claims the same slot the Source channels would have', () => {
  const panel = { x: 2, y: 2, w: 96, h: 30 };
  const none = combatHudLayout({ panel, mode: 'command' });
  const house = combatHudLayout({ panel, mode: 'command', houseActive: true });
  const source = combatHudLayout({ panel, mode: 'command', sourceActive: true });
  assert.equal(none.channels.h, 0, 'an ordinary encounter has no rail');
  assert.ok(house.channels.h > 0, 'the hall gets one');
  assert.equal(house.channels.h, source.channels.h, 'and it is the same slot, so no layout forks');
  // The rail must not eat the gauges or the reaction control.
  assert.ok(house.detail.y >= house.channels.y + house.channels.h, 'the detail line still clears the rail');
  assert.ok(house.reaction.h > 0, 'and the reaction control survives');
});

test('every section is selectable by name, and a cleared one is not', () => {
  const state = hall({ seed: 11 });
  const first = combatHouseSnapshot(state).targetId;
  const other = combatHouseSnapshot(state).sections.find((card) => !card.cleared && card.id !== first).id;
  const moved = reduceCombat(state, { type: COMBAT_ACTION.TARGET, rowId: other });
  assert.equal(combatHouseSnapshot(moved).targetId, other, 'a pointer names a section outright');

  // Clearing it makes it an illegal destination rather than a silent one.
  while (houseRow(moved.house, other).figures > 0) strikeHouse(moved.house, other, 1);
  const refused = reduceCombat(moved, { type: COMBAT_ACTION.TARGET, rowId: other });
  assert.notEqual(combatHouseSnapshot(refused).targetId, other, 'a cleared section cannot be selected');
  assert.ok(houseRow(refused.house, combatHouseSnapshot(refused).targetId).figures > 0);
});

test('targeting never spends a turn', () => {
  const state = hall({ seed: 12 });
  const before = { beat: state.cycleIndex, composure: state.composure, coherence: state.movementCoherence };
  let moved = reduceCombat(state, { type: COMBAT_ACTION.TARGET, delta: 1 });
  moved = reduceCombat(moved, { type: COMBAT_ACTION.TARGET, delta: 1 });
  moved = reduceCombat(moved, { type: COMBAT_ACTION.TARGET, rowId: 'upper' });
  assert.equal(moved.cycleIndex, before.beat, 'the beat does not advance');
  assert.equal(moved.composure, before.composure, 'and nothing hits you for looking');
  assert.equal(moved.movementCoherence, before.coherence);
});
