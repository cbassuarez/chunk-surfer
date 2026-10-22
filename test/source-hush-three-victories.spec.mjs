import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { normalizeChunkSurfState, reduceChunkSurf, SOURCE_HUSH_VICTORIES_REQUIRED } from '../src/game/chunk-surf-state.js';
import { sourceCombatBattle } from '../src/data/combat-definitions.js';
import { createCombatState, resolveCombatResult, combatResult } from '../src/game/combat-state.js';

function meeting({ state = null, onComplete = () => {} } = {}) {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT, { seed: 4417, hasRig: true });
  const initialState = state || { ...built.state,
    sourceHushFollow: { active: true, x: -12, z: -463.5, floor: 4.2, heading: 0 } };
  const runtime = createSourceSpaceRuntime({ initialState, onComplete });
  const o = initialState.landscapeOrigin;
  runtime.setPlayerPosition({ x: o.x - 24, y: o.y - 922, facing: 0 });
  return runtime;
}

function commit(runtime) {
  const contact = runtime.beginHushContact();
  assert.ok(contact, 'each fight must begin with another available, local conversation');
  assert.equal(runtime.resolveHushContactChoice('contact.confirm').handled, false, 'old consent cannot start this fight');
  assert.equal(runtime.resolveHushContactChoice('contact.warning').combat, false);
  assert.equal(runtime.resolveHushContactChoice('contact.confirm').combat, true);
  const request = runtime.finalEncounterRequest();
  assert.equal(request.adapter, 'combat-v1');
  assert.ok(request.battleAttemptId);
  return { request, contact };
}

// The fixture terminates a fresh combat instance through the combat engine's
// result API. This verifies three separate result lifecycles, not player skill.
function fixtureWin(request) {
  const battle = sourceCombatBattle({ bodyReturn: request.bodyReturnAssist, tells: request.tells });
  const state = createCombatState(battle.combat, { source: { rescueEligible: request.rescueEligible } });
  assert.equal(state.movementIndex, 0, 'a new Contact starts a complete battle');
  assert.equal(battle.combat.movements.length, 3, 'do not replace three fights with three sliced movements');
  const metrics = combatResult(resolveCombatResult(state, 'win'));
  return { battleAttemptId: request.battleAttemptId, outcome: metrics.source.outcome,
    channels: metrics.source.channels, turns: metrics.turns, won: metrics.won };
}

test('three separately warned contacts and complete battle results are required; one three-movement win cannot finish Source', () => {
  const completions = [];
  let runtime = meeting({ onComplete: completion => completions.push(completion) });
  const ids = [];
  assert.equal(SOURCE_HUSH_VICTORIES_REQUIRED, 3);
  for (let cycle = 1; cycle <= 3; cycle++) {
    const { request, contact } = commit(runtime);
    assert.equal(contact.contactCycle, cycle);
    assert.equal(request.contactCycle, cycle);
    assert.equal(request.victories, cycle - 1);
    assert.equal(request.victoriesRequired, 3);
    assert.equal(JSON.parse(JSON.stringify(request)).battleAttemptId, request.battleAttemptId,
      'the native handoff can retain the same opaque attempt identity');
    ids.push(request.battleAttemptId);
    const result = fixtureWin(request);
    const resolved = runtime.resolveFinalEncounter(result);
    assert.equal(resolved.handled, true);
    assert.equal(runtime.state().finalEncounter.victories, cycle);
    assert.equal(resolved.completed, cycle === 3);
    assert.equal(completions.length, cycle === 3 ? 1 : 0);
    assert.equal(runtime.resolveFinalEncounter(result).handled, false, 'duplicate native callbacks cannot add wins');
    if (cycle < 3) {
      assert.equal(runtime.state().completed, false);
      assert.equal(runtime.state().phase, 'landscape');
      assert.equal(runtime.state().redaction, null);
      assert.equal(runtime.state().bestEligible, false);
      assert.equal(runtime.state().finalEncounter.outcome, null);
      assert.equal(runtime.state().sourceContacts.combatCommitted, false);
      assert.equal(runtime.finalEncounterRequest(), null, 'no automatic next battle');
      assert.equal(runtime.hushMode().contactAvailable, true);
      const saved = JSON.parse(JSON.stringify(runtime.state()));
      runtime = meeting({ state: saved, onComplete: completion => completions.push(completion) });
      assert.equal(runtime.state().finalEncounter.victories, cycle, 'reload must not replay or erase a victory');
    }
  }
  assert.equal(new Set(ids).size, 3);
  assert.equal(completions[0].endingId, 'contact-won');
  assert.equal(runtime.beginHushContact(), null);
});

test('partial wins permit leaving, returning, or declining the next warning without awarding a battle', () => {
  const runtime = meeting();
  const { request } = commit(runtime);
  runtime.resolveFinalEncounter(fixtureWin(request));
  const encounter = runtime.beginHushContact();
  const lines = encounter.lines.filter(line => !line.if || line.if());
  assert.match(lines.map(line => line.text).join(' '), /beat it|broke free/i);
  runtime.resolveHushContactChoice('contact.warning');
  runtime.resolveHushContactChoice('contact.leave-warning');
  assert.equal(runtime.state().finalEncounter.victories, 1);
  assert.equal(runtime.state().finale.route, null);
  assert.equal(runtime.finalEncounterRequest(), null);
  const walked = reduceChunkSurf(runtime.state(), { type: 'SOURCE_NORMAL_EXIT' });
  assert.equal(walked.phase, 'horizon');
  assert.equal(walked.finalEncounter.victories, 1);
  const returned = reduceChunkSurf(walked, { type: 'SOURCE_FIELD_RETURNED' });
  assert.equal(returned.finalEncounter.victories, 1);
});

test('cancelled windows, missing IDs, stale wins and stale losses cannot grant or steal the current attempt', () => {
  const runtime = meeting();
  const { request: first } = commit(runtime);
  const firstWin = fixtureWin(first);
  assert.equal(runtime.resolveFinalEncounter({ ...firstWin, battleAttemptId: null }).handled, false);
  assert.equal(runtime.resolveFinalEncounter({ ...firstWin, won: undefined }).handled, false);
  assert.equal(runtime.finalEncounterRequest().adapter, 'combat-v1', 'a rejected callback cannot disarm the live battle');
  assert.equal(runtime.cancelFinalEncounter({ battleAttemptId: 'other' }).handled, false);
  assert.equal(runtime.cancelFinalEncounter({ battleAttemptId: first.battleAttemptId }).handled, true);
  assert.equal(runtime.state().finalEncounter.victories, 0);
  assert.equal(runtime.finalEncounterRequest(), null);
  const { request: second } = commit(runtime);
  assert.notEqual(first.battleAttemptId, second.battleAttemptId);
  assert.equal(runtime.resolveFinalEncounter(firstWin).handled, false);
  assert.equal(runtime.failFinalEncounter({ battleAttemptId: first.battleAttemptId }).handled, false);
  assert.equal(runtime.resolveFinalEncounter(fixtureWin(second)).handled, true);
  assert.equal(runtime.state().finalEncounter.victories, 1);
});

test('a loss after a partial victory remains a loss and never counts as the second win', () => {
  const completions = [];
  const runtime = meeting({ onComplete: completion => completions.push(completion) });
  const first = commit(runtime).request;
  runtime.resolveFinalEncounter(fixtureWin(first));
  const second = commit(runtime).request;
  const lost = runtime.failFinalEncounter({ battleAttemptId: second.battleAttemptId });
  assert.equal(lost.handled, true);
  assert.equal(runtime.state().finalEncounter.victories, 1);
  assert.equal(runtime.state().finalEncounter.won, false);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].endingId, 'contact-lost');
  assert.equal(runtime.resolveFinalEncounter(fixtureWin(second)).handled, false);
});

test('an active fight reload retains its identity while legacy completed saves stay completed', () => {
  const runtime = meeting();
  const first = commit(runtime).request;
  const resumed = meeting({ state: JSON.parse(JSON.stringify(runtime.state())) });
  assert.equal(resumed.finalEncounterRequest().battleAttemptId, first.battleAttemptId);
  assert.equal(resumed.finalEncounterRequest().contactCycle, 1);
  assert.equal(resumed.beginHushContact(), null, 'reload resumes this consent, not a second conversation');
  const oldActive = JSON.parse(JSON.stringify(runtime.state()));
  for (const field of ['victories', 'attempt', 'activeBattleId', 'lastBattleId']) delete oldActive.finalEncounter[field];
  const migrated = meeting({ state: oldActive });
  assert.equal(migrated.finalEncounterRequest().battleAttemptId, first.battleAttemptId);
  assert.equal(migrated.state().finalEncounter.victories, 0, 'old conversations do not invent wins');
  const oldCompleted = normalizeChunkSurfState({ ...oldActive, active: false, completed: true, phase: 'completed',
    finalEncounter: { status: 'resolved', outcome: 'contain', won: true },
    finale: { ...oldActive.finale, stage: 'resolved', result: 'won' } });
  assert.equal(oldCompleted.finalEncounter.victories, 3);
  assert.equal(oldCompleted.completed, true);
  assert.equal(oldCompleted.finalEncounter.activeBattleId, null);
  assert.deepEqual(normalizeChunkSurfState(JSON.parse(JSON.stringify(oldCompleted))), oldCompleted);
});
