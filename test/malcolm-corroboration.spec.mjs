// A person can supply a remembered observation without becoming an access gate.
// Exercise the actual in-world dialogue dispatch and belfry-arrival function;
// the headless shell does not establish long-route reach or player perception.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as vigil from '../src/data/exterior-vigil.js';
import * as scenes from '../src/game/scenes.js';
import { makeThoughtScene } from '../src/game/thoughts.js';
import { freshSave, getSave, saveCommit, withTransientGameState } from '../src/game/save.js';
import { flagApply, flagTest } from '../src/game/flags.js';
import { freshMeta } from '../src/progression/schema.js';
import { choiceContentId, createReplayService } from '../src/progression/knowledge.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const id = 'vigil-malcolm-vey';
function productionFunction(name, endMarker, environment) {
  const start = main.indexOf(`function ${name}(`), end = main.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `production ${name} extraction boundary`);
  return new Function('environment', `with (environment) { return (${main.slice(start, end).trim()}); }`)(environment);
}
function talkHarness({ replay = false } = {}) {
  scenes.clear();
  const inspected = new Set(getSave().props.inspected), lines = [];
  const environment = {
    storyMode: true, NO_THINK: false, ensureCtx() {}, scenes,
    vigilConversation: vigil.vigilConversation,
    vigilRecognitionFlags: vigil.vigilRecognitionFlags,
    PROPS: { propState: () => ({ inspected }), savePropState: () => ({ ...getSave().props, inspected: [...inspected] }) },
    inspectPropTracked: propId => inspected.add(propId),
    flagTest, flagApply, saveCommit, getSave,
    vigilAmbient: { cancel() {} }, vigilConversationActorId: null,
    STORY: null, actx: null, dialogGain: null, master: null, CR: { fx: null }, fireCue() {},
    createReplayService: replay ? createReplayService : () => null,
    makeThoughtScene(options) {
      const onLine = options.onLine;
      return makeThoughtScene({ ...options, onLine(line) { lines.push(line); onLine?.(line); } });
    },
    applyStoryChoice: choice => flagApply(choice?.set || [], choice?.clear || []),
  };
  environment.converse = productionFunction('converse', '\n// The push bar', environment);
  const talk = productionFunction('talkToVigilPerson', '\nfunction talkToExteriorLocal(', environment);
  return { open: () => talk({ id, vigilId: id }), lines, environment,
    cancel() { scenes.top()?.key({ key: 'Escape' }); },
  };
}
function advanceUntil(predicate, limit = 100) {
  for (let step = 0; step < limit; step++) {
    const scene = scenes.top();
    assert.ok(scene, 'the real conversation remains available');
    const view = scene.view();
    if (predicate(view)) return view;
    if (view.pending?.kind === 'branch') throw new Error(`unexpected branch: ${view.pending.options.map(option => option.goto || option.text).join(', ')}`);
    scene.update(10);
    scene.key({ key: 'Enter' });
  }
  assert.fail('conversation did not reach the requested line/choice');
}
function chooseBranch(goto) {
  const view = advanceUntil(value => value.pending?.kind === 'branch');
  const index = view.pending.options.findIndex(option => option.goto === goto);
  assert.ok(index >= 0, `${goto} remains an ordinary optional question`);
  scenes.top().key({ key: String(index + 1) });
}
function hearMapClaim() {
  chooseBranch('line');
  advanceUntil(view => view.nodeId === 'line' && view.line?.who === 'Malcolm Vey'
    && /Centre to centre/.test(view.line.text));
  assert.equal(flagTest(vigil.VIGIL_LINKED_CHAPELS_FLAG), false,
    'the subject and first measurement do not stand in for the qualified answer');
  advanceUntil(view => view.nodeId === 'line' && view.line?.who === 'Malcolm Vey'
    && /It may be nothing\./.test(view.line.text));
}
function belfryArrival(linked) {
  const commits = [], speech = [];
  const environment = {
    GOD_LOCATION_HOOKS: { 'cathedral-belfry': { facing: 1 } }, godHookPoint: () => ({ x: 1, y: 2 }),
    ensureTowerBellDirector: () => ({ setTransitionProgress() {} }),
    commitChapelTower: value => value, reduceChunkSurf: (value, event) => ({ ...value, event }),
    normalizeChunkSurfState: value => value,
    R3: { r3dSetIndoorRain() {}, r3dClearTowerView() {}, r3dSetSourceScene() {}, r3dSetFacing() {} },
    stopSourceCorridorRain() {}, chuteRide: null, clearSourceRuntime() {}, PRES: { despawn() {} },
    px: 0, py: 0, renderMove: null, motionRig: null, trail: [], r3dCache: {},
    getSave: () => ({ chunkSurf: {} }), saveCommit: patch => commits.push(patch),
    applySourceDoorCarry() {}, godSyncBuildingRender() {}, syncDoorDynamicProps() {},
    SPEECH: { sayAll: (lines, options) => speech.push({ lines, options }) },
    BINDINGS: { inputPrompt: () => 'SHIFT' },
    VIGIL_LINKED_CHAPELS_FLAG: vigil.VIGIL_LINKED_CHAPELS_FLAG,
    vigilBelfryRecognition: vigil.vigilBelfryRecognition,
    flagTest: flag => flag === vigil.VIGIL_LINKED_CHAPELS_FLAG && linked,
  };
  assert.equal(productionFunction('beginSourceTowerTransition', '\n// THE TAPE LET HIM OFF', environment)(), true);
  return { commits, speech };
}

test('the actual Malcolm conversation earns recognition only after the map explanation is presented', async () => {
  await withTransientGameState({ save: freshSave() }, () => {
    const harness = talkHarness();
    try {
      assert.equal(harness.open(), true);
      assert.equal(flagTest(vigil.VIGIL_LINKED_CHAPELS_FLAG), false);
      hearMapClaim();
      assert.equal(flagTest(vigil.VIGIL_LINKED_CHAPELS_FLAG), true,
        'the actual repeatable conversation must apply the recognition effect, not strand it on an inert node.set');
      assert.equal(harness.lines.filter(line => /It may be nothing\./.test(line.text)).length, 1);
      assert.deepEqual(Object.keys(getSave().flags), [vigil.VIGIL_LINKED_CHAPELS_FLAG], 'recognition grants no key, item, quest or reward');
      harness.cancel();
      assert.equal(harness.environment.vigilConversationActorId, null, 'Escape releases the actor lock');
    } finally { scenes.clear(); }
  });
});

test('Escape before the explanation preserves the optional question without granting recognition', async () => {
  await withTransientGameState({ save: freshSave() }, () => {
    const harness = talkHarness();
    try {
      harness.open();
      harness.cancel();
      assert.equal(flagTest(vigil.VIGIL_LINKED_CHAPELS_FLAG), false);
      assert.equal(harness.open(), true);
      chooseBranch('line');
      assert.equal(scenes.top().view().pending?.kind, 'say', 'choosing the subject does not claim its answer was heard');
      harness.cancel();
      assert.equal(flagTest(vigil.VIGIL_LINKED_CHAPELS_FLAG), false);
      harness.open();
      hearMapClaim();
      assert.equal(flagTest(vigil.VIGIL_LINKED_CHAPELS_FLAG), true, 'the same existing question remains available after cancellation');
    } finally { scenes.clear(); }
  });
});

test('the actual save normalization retains the one recognition and does not add progression state', async () => {
  let saved;
  await withTransientGameState({ save: freshSave() }, () => {
    const harness = talkHarness();
    try { harness.open(); hearMapClaim(); harness.cancel(); saved = JSON.parse(JSON.stringify(getSave())); }
    finally { scenes.clear(); }
  });
  await withTransientGameState({ save: saved }, () => {
    assert.equal(flagTest(vigil.VIGIL_LINKED_CHAPELS_FLAG), true);
    assert.deepEqual(getSave().items, []);
    assert.equal(getSave().chapelTower.phase, freshSave().chapelTower.phase);
  });
});

test('the production belfry arrival remembers the actual pencil claim without explaining a mechanism', () => {
  const without = belfryArrival(false), withMap = belfryArrival(true);
  assert.deepEqual(withMap.commits, without.commits, 'knowing the map cannot change the handoff or route outcome');
  assert.equal(withMap.speech.length, 1);
  assert.deepEqual(withMap.speech[0].options, without.speech[0].options);
  const unearned = without.speech[0].lines, earned = withMap.speech[0].lines;
  assert.equal(earned.length, unearned.length + 1, 'keep the one existing acknowledgment');
  assert.deepEqual(earned.slice(0, unearned.length), unearned);
  const callback = earned.at(-1).text;
  assert.match(callback, /pencil line/i, 'recall the material actually examined');
  assert.doesNotMatch(callback, /one instrument|he said|proof|proved|right all along|months ago/i,
    'do not attribute an unspoken theory to Malcolm or turn his uncertainty into a solved mechanism');
});

test('an old post-entry save can ask about the same map without replay knowledge consuming the recovery', async () => {
  const save = freshSave(), meta = freshMeta(), sceneId = `exterior-vigil:${id}`;
  save.flags['title.shown'] = true;
  save.props.inspected = [id];
  for (const key of [`${sceneId}:start:choice:0`, `${sceneId}:revisit:choice:0`, `${sceneId}:return:choice:0`, `${sceneId}:return:choice:1`]) {
    meta.knowledge.choices[key] = { firstSeenAt: 1, firstSeenRunId: 'previous-night', lastSeenAt: 1, count: 1 };
  }
  await withTransientGameState({ save, meta }, () => {
    const harness = talkHarness({ replay: true });
    try {
      harness.open();
      const returned = advanceUntil(view => view.nodeId === 'return' && view.pending?.kind === 'branch');
      const map = returned.pending.options.find(option => option.goto === 'line');
      assert.ok(map, 'the returned speaker still has his existing map, even if an old inert setter lost the recognition');
      assert.equal(map.text, 'Look at the chapel alignment.');
      assert.equal(map.hideWhenAsked, false, 'only the real recognition flag may retire the recovery question');
      assert.equal(map.replayState, 'unseen', 'legacy asked-choice indices do not claim the recovery answer was received');
      chooseBranch('line');
      harness.cancel();
      assert.equal(flagTest(vigil.VIGIL_LINKED_CHAPELS_FLAG), false, 'do not fabricate old knowledge or infer it from metadata');
      harness.open();
      hearMapClaim();
      const hub = advanceUntil(view => view.nodeId === 'return' && view.pending?.kind === 'branch');
      assert.deepEqual(hub.pending.options.map(option => option.goto || null), ['six', null], 'the completed topic returns to the short returned hub');
      assert.equal(harness.lines.filter(line => /Hold the lamp there\./.test(line.text)).length, 0, 'a returned map question must not replay the first introduction');
    } finally { scenes.clear(); }
  });
});

test('returned Malcolm stays brief once known and preserves existing return-choice knowledge IDs', async () => {
  const save = freshSave(), sceneId = `exterior-vigil:${id}`;
  save.flags = { 'title.shown': true, [vigil.VIGIL_LINKED_CHAPELS_FLAG]: true };
  save.props.inspected = [id];
  await withTransientGameState({ save }, () => {
    const harness = talkHarness({ replay: true });
    try {
      harness.open();
      const view = advanceUntil(value => value.pending?.kind === 'branch');
      assert.equal(view.nodeId, 'return');
      assert.deepEqual(view.pending.options.map(option => option.goto || null), ['six', null]);
    } finally { scenes.clear(); }
  });
  const choices = vigil.vigilConversation(id, { phase: 'returned' }).tree.return.choices;
  const oldSix = choices.find(choice => choice.goto === 'six'), oldLeave = choices.find(choice => !choice.goto);
  assert.equal(choiceContentId({ sceneId, nodeId: 'return', choice: oldSix, index: choices.indexOf(oldSix) }), `${sceneId}:return:choice:0`);
  assert.equal(choiceContentId({ sceneId, nodeId: 'return', choice: oldLeave, index: choices.indexOf(oldLeave) }), `${sceneId}:return:choice:1`);
});
