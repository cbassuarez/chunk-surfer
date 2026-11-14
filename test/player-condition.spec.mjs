import test from 'node:test';
import assert from 'node:assert/strict';
import * as REC from '../src/game/recordist.js';
import {createCombatState, TECHNIQUE} from '../src/game/combat-state.js';
import {authoredCombatProfile} from '../src/data/combat-definitions.js';
import {playerCondition, comparePlayerCondition} from '../src/game/player-condition.js';

const condition = (composure, ceiling = 40, extra = {}) => playerCondition({composure, ceiling, ...extra});

test('existing injury ceilings are distinct from recoverable depletion', () => {
  for (const injuries of [0, 1, 2, 3, 4, 8]) {
    REC.loadRecState({tapes:[], injuries});
    const view = playerCondition({composure:REC.composure(), ceiling:REC.composureCeiling(), injuries});
    assert.equal(view.value, Math.max(20, 40 - injuries * 5));
    assert.equal(view.strain, 0);
    assert.equal(view.strainStatus, 'steady');
    assert.equal(view.woundStatus, injuries ? 'injured' : 'uninjured');
    assert.equal(view.capacityLoss, 40 - view.ceiling);
  }
  assert.equal(condition(20).strain, 20);
  assert.equal(condition(20).strainStatus, 'shaken');
});

test('the actual battle maximum includes its existing reserve bonus', () => {
  const definition = {id:'natatorium', enemy:'NATATORIUM', baseComposure:40, ...authoredCombatProfile('natatorium')};
  const state = createCombatState(definition, {composure:36, injuries:1, techniques:[TECHNIQUE.DEEP_RESERVE]});
  assert.ok(state.maxComposure > REC.COMPOSURE_BASE - 5);
  const view = playerCondition({composure:state.composure, ceiling:state.maxComposure,
    baseline:state.maxComposure + 5, injuries:state.injuries, combat:true, owner:'fight:natatorium'});
  assert.equal(view.ceiling, state.maxComposure);
  assert.equal(view.value, 36);
  assert.equal(view.strain, state.maxComposure - 36);
  assert.equal(view.capacityLoss, 5);
  assert.equal(condition(0, 45, {combat:true}).strainStatus, 'depleted');
});

test('missing or invalid authority produces an unavailable readout', () => {
  for (const input of [{}, {composure:null,ceiling:40}, {composure:NaN,ceiling:40},
    {composure:20,ceiling:0}, {composure:'20',ceiling:40}, {composure:20,ceiling:Infinity},
    {composure:20,ceiling:40,injuries:-1}, {composure:20,ceiling:40,baseline:NaN}]) {
    const view = playerCondition(input);
    assert.equal(view.available, false);
    assert.equal(view.value, null);
    assert.equal(view.strainStatus, 'unavailable');
    assert.equal(comparePlayerCondition(condition(40), view), null);
    assert.equal(comparePlayerCondition(view, condition(20)), null);
  }
});

test('a blow, recovery, and an unchanged sample are distinct', () => {
  const full = condition(40), struck = condition(28), recovered = condition(38);
  assert.deepEqual(comparePlayerCondition(full, struck), {kind:'damage', damage:12, recovery:0,
    injuriesAdded:0, capacityLost:0, before:40, after:28});
  assert.equal(comparePlayerCondition(struck, recovered).recovery, 10);
  assert.equal(comparePlayerCondition(recovered, condition(38)), null);
  assert.equal(comparePlayerCondition(condition(20), condition(20)), null);
});

test('an injury capacity clamp is one durable mark, not a second hit', () => {
  const first = comparePlayerCondition(condition(40), condition(35, 35, {injuries:1}));
  assert.equal(first.kind, 'injury');
  assert.equal(first.injuriesAdded, 1);
  assert.equal(first.capacityLost, 5);
  assert.equal(first.damage, 0);
  const compound = comparePlayerCondition(condition(40), condition(30, 35, {injuries:1}));
  assert.equal(compound.damage, 5);
  assert.equal(compound.injuriesAdded, 1);
  const atFloor = comparePlayerCondition(condition(20, 20, {injuries:4}), condition(20, 20, {injuries:5}));
  assert.equal(atFloor.kind, 'injury');
  assert.equal(atFloor.capacityLost, 0);
});

test('loading, changing ownership, and capacity changes never manufacture an impact', () => {
  const full = condition(40), depleted = condition(20);
  assert.equal(comparePlayerCondition(null, depleted), null);
  assert.equal(comparePlayerCondition(full, depleted, {hydrating:true}), null);
  assert.equal(comparePlayerCondition(full, depleted, {ownerChanged:true}), null);
  assert.equal(comparePlayerCondition(full, condition(20, 40, {combat:true})), null);
  assert.equal(comparePlayerCondition(condition(35, 35, {injuries:1}), condition(20, 40)), null);
  assert.equal(comparePlayerCondition(full, condition(20, 30)), null);
  assert.equal(comparePlayerCondition(full, condition(20, 40, {baseline:50})), null);
  assert.equal(comparePlayerCondition(condition(30, 40, {owner:'fight:one'}),
    condition(20, 40, {owner:'fight:two',injuries:1})), null);
});

test('projection and comparison leave the authoritative values untouched', () => {
  const input = {composure:24.5,ceiling:35,baseline:40,injuries:1}, before = JSON.stringify(input);
  const view = playerCondition(input), prior = condition(30, 35, {injuries:1});
  assert.equal(view.value, 24.5);
  comparePlayerCondition(prior, view);
  assert.equal(JSON.stringify(input), before);
  assert.equal(prior.value, 30);
  assert.equal(view.value, 24.5);
});
