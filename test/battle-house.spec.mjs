// THE HALL APPARITIONS — entity, initiative, targeting, parry, and window-owner
// contracts for the one four-combatant encounter.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COMBAT_ACTION,
  TECHNIQUE,
  advanceEnemy,
  combatApparitionTargetIds,
  combatApparitionsSnapshot,
  createCombatState,
  hallSpecialTargetCap,
  reduceCombat,
} from '../src/game/combat-state.js';
import {
  HALL_APPARITION_COUNT,
  HALL_APPARITION_DEFS,
  HALL_REDIRECT_PERCENT,
  advanceHallEnemyTurn,
  applyHallApparitionAction,
  armNextHallParry,
  beginHallEnemyTurns,
  commitHallApparitionRound,
  createHallApparitions,
  hallApparitionSnapshot,
  hallApparitionsDefeated,
  hallTargetIds,
  moveHallTarget,
  selectHallTarget,
} from '../src/game/hall-apparitions.js';
import { attachCombatDefinition } from '../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';
import { compileFireballCastPlan } from '../src/game/window-channel.js';
import { createFireballExchange } from '../src/game/fireball-exchange.js';

const FULL_BAG = { torch: true, recorder: true, rig: true, fork: true, radio: true };
const definition = (id) => attachCombatDefinition({ id, enemy: 'X', rounds: [] }).combat;
const hall = (over = {}) => createCombatState(definition('hall'), {
  difficulty: COMBAT_RULES.standard,
  tools: FULL_BAG,
  battery: 1,
  seed: 7,
  ...over,
});

test('the Hall owns exactly three distinct former audience members', () => {
  const roster = createHallApparitions({ seed: 'three' });
  assert.equal(roster.members.length, HALL_APPARITION_COUNT);
  assert.equal(new Set(roster.members.map((member) => member.id)).size, 3);
  assert.equal(new Set(roster.members.map((member) => member.pose)).size, 3);
  assert.deepEqual(roster.members.map((member) => member.seat), ['ROW F', 'STALLS', 'SIDE BOX']);
  assert.ok(roster.members.every((member) => member.health === member.maxHealth && member.health > 0));
  assert.equal(HALL_APPARITION_DEFS.length, 3);
});

test('the auditorium is not represented as a combat target', () => {
  const profile = definition('hall');
  assert.deepEqual(profile.apparitions, { health: 30 });
  assert.equal(profile.house, undefined);
  const state = hall();
  assert.equal(state.house, undefined);
  assert.equal(combatApparitionsSnapshot(state).members.length, 3);
  for (const member of combatApparitionsSnapshot(state).members) {
    assert.match(member.id, /^apparition-/);
    assert.doesNotMatch(member.id, /balcony|tier|section|house/);
  }
});

test('pointer selection and directional targeting name one living body', () => {
  const roster = createHallApparitions({ seed: 'target' });
  selectHallTarget(roster, 'apparition-stalls');
  assert.equal(hallApparitionSnapshot(roster).targetId, 'apparition-stalls');
  moveHallTarget(roster, 1);
  assert.equal(hallApparitionSnapshot(roster).targetId, 'apparition-box');
  roster.members[2].health = 0;
  moveHallTarget(roster, 1);
  assert.equal(hallApparitionSnapshot(roster).targetId, 'apparition-row-f', 'defeated bodies are skipped');
});

test('initiative is player then each living apparition, one visible slot at a time', () => {
  const intents = definition('hall').movements[0].intents;
  const roster = createHallApparitions({ seed: 'initiative' });
  commitHallApparitionRound(roster, 0, intents);
  assert.equal(roster.activeActorId, 'player');
  const actors = [];
  let actor = beginHallEnemyTurns(roster);
  while (actor) {
    actors.push(actor.id);
    assert.equal(roster.members.filter((member) => member.acting).length, 1);
    actor = advanceHallEnemyTurn(roster);
  }
  assert.deepEqual(actors, roster.members.map((member) => member.id));
  assert.equal(roster.activeActorId, 'player');
});

test('the reducer resolves all four combatants as one round, not one aggregate enemy', () => {
  let state = reduceCombat(hall(), { type: COMBAT_ACTION.WAIT });
  assert.equal(state.phase, 'enemy');
  assert.equal(state.apparitions.activeActorId, 'apparition-row-f');

  const actors = [];
  for (let slot = 0; slot < 3; slot += 1) {
    state = advanceEnemy(state);
    actors.push(state.actionLog.at(-1).actorId);
    if (slot < 2) assert.equal(state.phase, 'enemy');
  }
  assert.deepEqual(actors, ['apparition-row-f', 'apparition-stalls', 'apparition-box']);
  assert.equal(state.phase, 'select');
  assert.equal(state.apparitions.activeActorId, 'player');
});

test('a perfect read blunts but does not erase any of the three enemy turns', () => {
  let state = reduceCombat(hall(), { type: COMBAT_ACTION.MONITOR });
  assert.equal(state.last.perfect, true);
  const before = state.composure;
  const received = [];
  for (let slot = 0; slot < 3; slot += 1) {
    state = advanceEnemy(state);
    received.push(state.actionLog.at(-1).received);
  }
  assert.deepEqual(received, [1, 1, 1]);
  assert.equal(state.composure, before - 3, 'three bodies still make the harder fight intentional');
});

test('ordinary attacks damage only the selected apparition', () => {
  let state = hall();
  state = reduceCombat(state, { type: COMBAT_ACTION.TARGET, targetId: 'apparition-stalls' });
  const before = state.apparitions.members.map((member) => member.health);
  state = reduceCombat(state, { type: COMBAT_ACTION.EXPOSE });
  const after = state.apparitions.members.map((member) => member.health);
  assert.equal(after[0], before[0]);
  assert.ok(after[1] < before[1]);
  assert.equal(after[2], before[2]);
});

test('existing specials expand from two to three targets through their existing branch', () => {
  const whiteout = hall({ techniques: [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT] });
  assert.equal(hallSpecialTargetCap(whiteout, COMBAT_ACTION.WHITEOUT), 2);
  assert.equal(combatApparitionTargetIds(whiteout, COMBAT_ACTION.WHITEOUT).length, 2);
  whiteout.techniques.push(TECHNIQUE.OVEREXPOSE);
  assert.equal(hallSpecialTargetCap(whiteout, COMBAT_ACTION.WHITEOUT), 3);

  const master = hall({ techniques: [TECHNIQUE.PUNCH_IN, TECHNIQUE.MASTER_TAKE] });
  assert.equal(hallSpecialTargetCap(master, COMBAT_ACTION.MASTER_TAKE), 2);
  master.techniques.push(TECHNIQUE.MULTITRACK);
  assert.equal(hallSpecialTargetCap(master, COMBAT_ACTION.MASTER_TAKE), 3);

  const runaway = hall({ techniques: [TECHNIQUE.OVERDUB, TECHNIQUE.RUNAWAY_FEEDBACK] });
  assert.equal(hallSpecialTargetCap(runaway, COMBAT_ACTION.RUNAWAY_FEEDBACK), 2);
  runaway.techniques.push(TECHNIQUE.FEEDBACK_LOOP);
  assert.equal(hallSpecialTargetCap(runaway, COMBAT_ACTION.RUNAWAY_FEEDBACK), 3);

  const radio = hall({ techniques: [TECHNIQUE.MISDIRECTION] });
  assert.equal(hallSpecialTargetCap(radio, COMBAT_ACTION.RADIO_DECOY), 2);
  radio.techniques.push(TECHNIQUE.DEAD_AIR);
  assert.equal(hallSpecialTargetCap(radio, COMBAT_ACTION.RADIO_DECOY), 3);
});

test('a selected primary determines a stable selectable pair or trio', () => {
  const roster = createHallApparitions({ seed: 'scope' });
  selectHallTarget(roster, 'apparition-stalls');
  assert.deepEqual(hallTargetIds(roster, 2), ['apparition-stalls', 'apparition-box']);
  assert.deepEqual(new Set(hallTargetIds(roster, 3)), new Set(roster.members.map((member) => member.id)));
});

test('an armed apparition parry is telegraphed and consumes only its own hit', () => {
  const roster = createHallApparitions({ seed: 'ordinary-parry' });
  roster.round = 2;
  roster.members[0].guard = { mode: 'parry', armedRound: 2 };
  const before = roster.members.map((member) => member.health);
  const out = applyHallApparitionAction(roster, {
    actionId: COMBAT_ACTION.EXPOSE,
    targetIds: [roster.members[0].id],
    damage: 10,
  });
  assert.equal(roster.members[0].guard, null);
  if (!out.redirects.length) {
    assert.deepEqual(out.parried, [roster.members[0].id]);
    assert.deepEqual(roster.members.map((member) => member.health), before);
  }
});

test('the rare parry branch redirects the attack into another apparition', () => {
  let found = null;
  for (let seed = 0; seed < 1000 && !found; seed += 1) {
    const roster = createHallApparitions({ seed: `redirect:${seed}` });
    roster.round = 2;
    roster.members[0].guard = { mode: 'parry', armedRound: 2 };
    const out = applyHallApparitionAction(roster, {
      actionId: COMBAT_ACTION.EXPOSE,
      targetIds: [roster.members[0].id],
      damage: 10,
    });
    if (out.redirects.length) found = { roster, out };
  }
  assert.ok(found, `no redirect found despite a ${HALL_REDIRECT_PERCENT}% authored branch`);
  const redirect = found.out.redirects[0];
  assert.notEqual(redirect.from, redirect.to);
  assert.equal(found.roster.members.find((member) => member.id === redirect.from).health, 30);
  assert.equal(found.roster.members.find((member) => member.id === redirect.to).health, 20);
});

test('parry readiness is deterministic, visible, and can belong to any member', () => {
  const owners = new Set();
  for (let seed = 0; seed < 60; seed += 1) {
    const roster = createHallApparitions({ seed: `guard:${seed}` });
    roster.round = 2;
    const owner = armNextHallParry(roster);
    if (owner) {
      owners.add(owner.id);
      assert.equal(hallApparitionSnapshot(roster).members.find((member) => member.id === owner.id).status, 'PARRY READY');
    }
  }
  assert.deepEqual(owners, new Set(HALL_APPARITION_DEFS.map((member) => member.id)));
});

test('the fight ends when the three entities are defeated', () => {
  const roster = createHallApparitions({ seed: 'defeat' });
  for (const member of roster.members) member.health = 0;
  assert.equal(hallApparitionsDefeated(roster), true);
});

test('Hall fireball plans identify the caster and coordinating bodies', () => {
  const plan = compileFireballCastPlan({
    battleId: 'hall', movementId: 'attention', movementIndex: 1,
    casterId: 'apparition-stalls', casterLabel: 'APPARITION 02', casterIndex: 1,
    coordinateIds: ['apparition-row-f', 'apparition-stalls', 'apparition-box'],
  });
  assert.equal(plan.rayCount, 2);
  assert.equal(plan.casterId, 'apparition-stalls');
  assert.equal(plan.casterLabel, 'APPARITION 02');
  assert.deepEqual(plan.coordinateIds, ['apparition-row-f', 'apparition-stalls', 'apparition-box']);
});

test('the three casters own distinct window launch lanes and the final movement is a coordinated volley', () => {
  const origins = HALL_APPARITION_DEFS.map((member, casterIndex) => compileFireballCastPlan({
    battleId: 'hall', movementId: 'applause', movementIndex: 2, castSequence: 4,
    casterId: member.id, casterLabel: member.label, casterIndex,
    coordinateIds: HALL_APPARITION_DEFS.map((entry) => entry.id),
  })).map((plan) => ({ x: plan.rays[0].origin.x, rays: plan.rayCount, volley: plan.volley }));
  assert.ok(origins[0].x < origins[1].x && origins[1].x < origins[2].x);
  assert.deepEqual(origins.map((entry) => entry.rays), [3, 3, 3]);
  assert.ok(origins.every((entry) => entry.volley));
});

test('manual Hall windows spawn only when an apparition turn explicitly casts', () => {
  const exchange = createFireballExchange({ battleId: 'hall', manual: true });
  exchange.setMovement({ id: 'seated', index: 0, title: 'THREE REMAIN SEATED' });
  exchange.update(10, { enabled: true });
  assert.equal(exchange.snapshot().active, null);
  exchange.castNow({ casterId: 'apparition-row-f', casterLabel: 'APPARITION 01', casterIndex: 0 });
  assert.equal(exchange.snapshot().active.plan.casterId, 'apparition-row-f');
});

test('the rendered Hall path uses entities rather than the removed House renderer', () => {
  const combat = readFileSync('src/game/combat.js', 'utf8');
  const view = readFileSync('src/render/combat-view.js', 'utf8');
  assert.match(combat, /drawHallApparitions/);
  assert.doesNotMatch(combat, /drawHouse|combatHouse/);
  assert.match(view, /Three bodies, three fused chairs, three targetable health pools/);
});

test('no other combat profile grows an apparition roster', () => {
  for (const id of ['natatorium', 'practice', 'chapel']) {
    const state = createCombatState(definition(id), { difficulty: COMBAT_RULES.standard, tools: FULL_BAG });
    assert.equal(state.apparitions, null, id);
    assert.equal(combatApparitionsSnapshot(state), null, id);
  }
});
