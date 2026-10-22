import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as UI from '../src/render/ui.js';
import { sourceCombatBattle } from '../src/data/combat-definitions.js';
import { beginSourceContactBattle, freshSourceReplayManifest, normalizeSourceReplayManifest, sourceReplayFallback } from '../src/game/source-replay-manifest.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('native desktop publication uses metrics actually imported by main and restores the command viewport',()=>{
  const bindings=main.match(/import \{([^}]+)\} from '\.\/render\/ui\.js';/)[1].split(',').map(x=>x.trim());
  const calls=[];
  const scope=vm.createContext(Object.fromEntries([...bindings.map(name=>[name,UI[name]]),
    ['setSourceCommandViewport',value=>calls.push(value)]]));
  const start=main.indexOf('onState:(event)=>{',main.indexOf('windowChoreography=createWindowChoreographyDirector('));
  const end=main.indexOf("    if(event.type==='pane-action'",start);
  assert.ok(start>0&&end>start);
  const callback=main.slice(start+'onState:'.length,end)+'}';
  vm.runInContext(`(${callback})({type:'source-desktop',mode:'native'})`,scope);
  assert.ok(calls[0].width>=960);
  assert.equal(calls[0].height,UI.uiCellMetrics().cellH*24);
  vm.runInContext(`(${callback})({type:'source-desktop',mode:'fallback'})`,scope);
  assert.equal(calls.at(-1),null);
});
const start = main.indexOf("    if(request?.adapter==='combat-v1'){");
const end = main.indexOf('\n    }\n  }\n  syncSourceRender();', start);
assert.ok(start >= 0 && end > start, 'the actual Source combat orchestration must be present');
const opening = main.slice(start, end + '\n    }'.length);

function fixture() {
  const calls = { commits: [], saves: [], results: [], losses: [], aborts: [], despawns: 0, speeches: [] };
  let saved = normalizeSourceReplayManifest({ ...freshSourceReplayManifest({ runId: 'run:test' }),
    encounter: { battleAttemptId: 'source-contact:4417:3' } });
  const state = { finalEncounter: { activeBattleId: 'source-contact:4417:3', victories: 2 } };
  const runtime = { state: () => state,
    resolveFinalEncounter: result => { calls.results.push(result); return { handled: true, completed: false }; },
    failFinalEncounter: result => { calls.losses.push(result); return { handled: true }; },
    cancelFinalEncounter: result => { calls.aborts.push(result); return { handled: true }; } };
  const scope = vm.createContext({ request: { adapter: 'combat-v1', battleAttemptId: state.finalEncounter.activeBattleId,
    victories: 2, rescueEligible: true, rigAvailable: true, tells: [], bodyReturnAssist: false },
  chunkSurfRuntime: runtime, sourceFinalCombatOpen: false, sourceFinalCombatRetryAt: 0,
  pressurePresentationSnapshot: () => ({}), PRES: { despawn: () => calls.despawns++ },
  currentSourceReplayManifest: () => saved,
  commitSourceReplayManifest: value => { calls.commits.push(value); saved = normalizeSourceReplayManifest(value); },
  beginSourceContactBattle, sourceCombatBattle, applyRigAdvantage: battle => battle,
  godSendBackPreviewAt: null, SPEECH: { say: line => calls.speeches.push(line) },
  px: 12, py: -900, performance: { now: () => 9000 },
  saveCommit: value => calls.saves.push(value), renderMove: 'current-move', motionRig: 'current-rig', trail: ['current-trail'],
  openBattle: (_battle, options) => { scope.options = options; },
  pushCombat: (_battle, options) => { scope.options = options; },
  });
  vm.runInContext(opening, scope);
  calls.commits.length = 0; calls.despawns = 0;
  return { scope, runtime, state, calls };
}

test('main forwards the exact battle identity and preserves the live partial-win world', () => {
  const { scope, calls, state } = fixture();
  scope.options.onWin({ source: { outcome: 'rescue', channels: { rescue: 3 } }, turns: 15 });
  assert.equal(calls.results[0].battleAttemptId, state.finalEncounter.activeBattleId);
  assert.equal(calls.results[0].won, true);
  assert.equal(scope.sourceFinalCombatOpen, false);
  assert.equal(calls.commits.length, 1);
  assert.equal(calls.commits[0].encounter, null);
  assert.equal(calls.saves.length, 1);
  assert.equal(calls.saves[0].area, 'source-space');
});

test('third-win onComplete may remove the Source runtime before main returns without a null dereference', () => {
  const { scope, runtime, calls } = fixture();
  runtime.resolveFinalEncounter = result => {
    calls.results.push(result);
    scope.chunkSurfRuntime = null; // the actual completion callback may replace world authority
    return { handled: true, completed: true };
  };
  assert.doesNotThrow(() => scope.options.onWin({ source: { outcome: 'rescue' } }));
  assert.equal(calls.results.length, 1);
  assert.equal(calls.saves.length, 0, 'a terminal completion must not save through the removed runtime');
});

for (const name of ['onWin', 'onLose', 'onAbort', 'onCheckpoint']) test(`stale ${name} cannot disturb another open Contact`, () => {
  const { scope, calls } = fixture();
  scope.chunkSurfRuntime = { state: () => ({ finalEncounter: { activeBattleId: 'source-contact:4417:4' } }) };
  scope.sourceFinalCombatOpen = true;
  scope.options[name]({ source: { outcome: 'contain' }, movementIndex: 2, continuation: { sourceTerminal: { result: 'win' } } });
  assert.equal(scope.sourceFinalCombatOpen, true, 'stale callbacks must not unlock automatic duplicate launches');
  assert.equal(scope.sourceFinalCombatRetryAt, 0);
  assert.equal(scope.renderMove, 'current-move');
  assert.equal(scope.motionRig, 'current-rig');
  assert.equal(calls.results.length + calls.losses.length + calls.aborts.length, 0);
  assert.equal(calls.commits.length + calls.saves.length + calls.despawns + calls.speeches.length, 0);
});

test('an earlier callback in the same live Source runtime cannot affect a later contact cycle', () => {
  const { scope, state, calls } = fixture();
  state.finalEncounter.activeBattleId = 'source-contact:4417:4';
  scope.sourceFinalCombatOpen = true;
  for (const name of ['onWin', 'onLose', 'onAbort', 'onCheckpoint'])
    scope.options[name]({ source: { outcome: 'contain' }, movementIndex: 2, continuation: {} });
  assert.equal(scope.sourceFinalCombatOpen, true);
  assert.equal(calls.results.length + calls.losses.length + calls.aborts.length, 0);
  assert.equal(calls.commits.length + calls.saves.length + calls.despawns + calls.speeches.length, 0);
});

test('legacy take-provenance fallback retains the active combat checkpoint and terminal handoff', () => {
  const getterStart = main.indexOf('function currentSourceReplayManifest(');
  const getterEnd = main.indexOf('\nfunction sourceReplayPoseWindow(', getterStart);
  const encounter = { battleAttemptId: 'source-contact:4417:1', movementIndex: 2,
    continuation: { sourceTerminal: { version: 1, definitionId: 'source-final', metrics: { result: 'win' } } } };
  const saved = { run: { id: 'run:legacy' }, sourceReplay: { schema: 2, runId: 'run:legacy', takes: [], encounter } };
  const scope = vm.createContext({ getSave: () => saved, normalizeSourceReplayManifest, sourceReplayFallback,
    REC: { recState: () => ({ takes: ['main_b3'] }) }, PB: { serializeTakes: () => [], takePlace: () => '' },
    ROOM_CELLS: { main_b3: { x: 1, y: 1 } }, FP: { toRuntimePoint: value => value } });
  vm.runInContext(main.slice(getterStart, getterEnd), scope);
  const result = scope.currentSourceReplayManifest();
  assert.equal(result.takes.length, 1, 'the earlier visited room still gets its provenance fallback');
  assert.equal(result.encounter.battleAttemptId, encounter.battleAttemptId);
  assert.equal(result.encounter.movementIndex, 2);
  assert.deepEqual(result.encounter.continuation, encounter.continuation);
});
