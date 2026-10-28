import test from 'node:test';
import assert from 'node:assert/strict';
import { quorumCompositionPlan, retainedTakeCompositionPlan, roomBetweenCompositionPlan, STUDY_EVENTS } from '../src/platform/window-media-studies.js';
import { compilePaneScore, paneScoreStateAt } from '../src/platform/window-composition.js';

// Select the native decision path at import, while substituting every actual
// desktop operation. These tests never create a window or touch a GPU.
const previousWindow = globalThis.window;
globalThis.window = { __TAURI_INTERNALS__: {} };
const { createWindowChoreographyDirector } = await import('../src/platform/window-choreography.js');
if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function until(predicate) {
  for (let index = 0; index < 60 && !predicate(); index++) await Promise.resolve();
  assert.ok(predicate(), 'the expected asynchronous boundary was reached');
}
const quorum = () => quorumCompositionPlan({ epochMs: 1000 });
const retained = () => retainedTakeCompositionPlan({ epochMs: 1000 });
function harness({ prepare, show, fullscreen = false, releaseFullscreen } = {}) {
  const prepares = [], shows = [], installed = [], hides = [], holds = [], triggers = [], commands = [], states = [], puzzleStates = [], completions = [];
  const owned = new Set(['snapshot-unrelated', 'snapshot-left', 'snapshot-middle', 'snapshot-right', 'snapshot-wrong']);
  let token = 0;
  const effects = {
    ensure: () => true, sessionToken: () => 'effects-test-session',
    prepareMedia: async options => { prepares.push(options); return prepare ? prepare(options, prepares.length) : true; },
    showComposition: async (plan, options) => {
      shows.push({ plan, options });
      const result = show ? await show(plan, options, shows.length) : true;
      if (result && options.isCurrent()) installed.push(plan);
      return result;
    },
    hideComposition: async options => { hides.push(options); if (options?.releaseSnapshots !== false) owned.clear(); return true; },
    hidePanes: async () => true, suspendSurfaces: () => true,
    holdComposition: async (value, options) => { holds.push({ value, options }); return true; },
    triggerComposition: async (plan, event, options) => { triggers.push({ plan, event, options }); return true; },
    releaseSnapshots: tokens => tokens.forEach(value => owned.delete(value)),
  };
  const director = createWindowChoreographyDirector({ effects, documentApi: null,
    runtimeApi: { invoke: async (name, options) => { commands.push({ name, options }); return name === 'chunk_window_metrics' ? { native_fullscreen: fullscreen } : true; } },
    tokenFactory: () => `study-transaction-${++token}`, waitFn: async () => {},
    getCompositionContext: () => ({ introduced: true, flashMode: 'full' }), onState: value => states.push(value),
    onPuzzleState: value => puzzleStates.push(value), onApertureComplete: () => completions.push(true),
    releaseFullscreen,
  });
  return { director, prepares, shows, installed, hides, holds, triggers, commands, states, owned, puzzleStates, completions };
}

test('study keys prevent stale retirement from hiding the current presentation', async () => {
  const h = harness();
  const first = await h.director.beginStudy(quorum(), { key: 11 });
  assert.equal(first.native, true); assert.equal(h.installed.length, 1);
  const second = await h.director.beginStudy(retained(), { key: 12 });
  assert.equal(second.native, true); assert.equal(h.director.debug().composition.cueId, 'study:retained');
  assert.equal(await h.director.endStudy(11), false);
  assert.equal(h.hides.length, 0, 'a retired key never reaches native hide/restore');
  assert.equal(h.director.debug().composition.cueId, 'study:retained');
  assert.equal(await h.director.endStudy(12), true);
  assert.equal(h.director.debug().composition, null);
  assert.deepEqual(h.hides, [{ releaseSnapshots: false }]);
  assert.equal(h.commands.filter(value => value.name === 'chunk_window_choreography_restore').length, 1);
});

test('valid passive media movement reports cannot enter the Aperture puzzle path or throw', async () => {
  const h = harness(), result = await h.director.beginStudy(quorum(), { key: 22 });
  assert.equal(result.native, true);
  const before = h.director.debug().composition;
  for (const surface of result.plan.surfaces) {
    // Match the real browser/native report structure, including a valid center.
    // An empty placement would return early and miss the original exception.
    const report = { cueId: result.plan.cueId, paneId: surface.id, label: `window-media-${surface.index + 1}`,
      placement: { shown: true, center: { x: surface.initial.x * 1200, y: surface.initial.y * 800 },
        width: surface.width, height: surface.height, monitor: 'main' } };
    assert.doesNotThrow(() => assert.equal(h.director.noteCompositionMove(report), false));
  }
  assert.deepEqual(h.director.debug().composition, before, 'passive placement never mutates puzzle ownership');
  assert.deepEqual(h.puzzleStates, []); assert.deepEqual(h.completions, []);
  assert.ok(!h.states.some(value => String(value.type).startsWith('puzzle-')));
  assert.equal(h.triggers.length, 0, 'a passive pane cannot trigger completion or puzzle hints');
  await h.director.endStudy(22);
});

test('a rejected owner predicate never starts preparation or acquires a transaction', async () => {
  const h = harness();
  assert.equal(await h.director.beginStudy(quorum(), { key: 1, isCurrent: () => false }), null);
  assert.equal(h.prepares.length, 0); assert.equal(h.shows.length, 0); assert.equal(h.commands.length, 0);
  assert.equal(h.director.debug().composition, null);
});

test('late media preparation cannot overwrite a newer study owner', async () => {
  const gate = deferred(), h = harness({ prepare: (_options, index) => index === 1 ? gate.promise : true });
  const old = h.director.beginStudy(quorum(), { key: 1 });
  await until(() => h.prepares.length === 1);
  assert.equal(await h.director.endStudy(1), true);
  const next = await h.director.beginStudy(retained(), { key: 2 });
  assert.equal(next.native, true);
  gate.resolve(true); assert.equal(await old, null);
  assert.deepEqual(h.installed.map(value => value.cueId), ['study:retained']);
  assert.equal(await h.director.endStudy(1), false);
  assert.equal(h.director.debug().composition.cueId, 'study:retained');
  await h.director.endStudy(2);
});

test('cancellation during native dispatch invalidates fallback as well as the old desktop request', async () => {
  const gate = deferred(), h = harness({ show: (_plan, _options, index) => index === 1 ? gate.promise : true });
  const old = h.director.beginStudy(quorum(), { key: 1 });
  await until(() => h.shows.length === 1);
  const pending = h.shows[0]; assert.equal(pending.options.isCurrent(), true);
  await h.director.endStudy(1); assert.equal(pending.options.isCurrent(), false);
  const next = h.director.beginStudy(retained(), { key: 2 });
  gate.resolve(false); assert.equal(await old, null); assert.equal((await next).native, true);
  assert.ok(!h.states.some(value => value.type === 'composition' && value.plan.cueId === 'study:quorum'),
    'a late failed native request cannot resurrect a simulated copy');
  assert.deepEqual(h.installed.map(value => value.cueId), ['study:retained']);
  await h.director.endStudy(2);
});

test('application hold persists through preparation and resume forwards once without an authored release', async () => {
  const gate = deferred(), h = harness({ prepare: () => gate.promise });
  assert.equal(h.director.holdComposition(true), false, 'a pre-presentation hold is retained without a phantom native command');
  const opening = h.director.beginStudy(retained(), { key: 3 });
  await until(() => h.prepares.length === 1);
  assert.equal(h.holds.length, 0);
  gate.resolve(true); const result = await opening;
  assert.ok(result.plan.epochMs > 1000, 'preparation rebases the score to actual presentation time');
  assert.deepEqual(h.holds.map(value => value.value), [true]);
  assert.equal(h.director.holdComposition(true), false, 'repeated held state is idempotent');
  assert.equal(h.director.holdComposition(false), true);
  await until(() => h.holds.length === 2);
  assert.deepEqual(h.holds.map(value => value.value), [true, false]);
  assert.ok(Number.isFinite(h.holds[1].options.effectiveAtMs));
  assert.equal(h.triggers.length, 0, 'application hold and release never become performed-action release');
  await h.director.endStudy(3);
});

test('a real release queues before presentation and reaches the same current study afterward', async () => {
  const gate = deferred(), h = harness({ prepare: () => gate.promise });
  const opening = h.director.beginStudy(retained(), { key: 4 });
  await until(() => h.prepares.length === 1);
  assert.equal(h.director.compositionEvent(STUDY_EVENTS.RETAINED_RELEASE), true);
  assert.equal(h.triggers.length, 0);
  gate.resolve(true); await opening;
  await until(() => h.triggers.length === 1);
  assert.equal(h.triggers[0].event, STUDY_EVENTS.RETAINED_RELEASE);
  assert.equal(h.triggers[0].plan.cueId, 'study:retained');
  await h.director.endStudy(4);
});

test('study restore preserves adapter-owned snapshots while a general restore retains its existing cleanup policy', async () => {
  const h = harness(), before = new Set(h.owned);
  const plan = roomBetweenCompositionPlan({ snapshotTokens: ['snapshot-left', 'snapshot-middle', 'snapshot-right'], contradictionToken: 'snapshot-wrong' });
  await h.director.beginStudy(plan, { key: 5 }); await h.director.endStudy(5);
  assert.deepEqual(h.owned, before, 'only the adapter may release its owned package after native retirement');
  assert.deepEqual(h.hides.at(-1), { releaseSnapshots: false });
  await h.director.restore('source-runtime-exit');
  assert.equal(h.hides.at(-1).releaseSnapshots, true);
  assert.equal(h.owned.size, 0);
});

test('study controls cannot retire or hold Last Exposure, whose existing suspend still removes its optional echoes', async () => {
  const h = harness();
  const result = await h.director.beginReturn([], { lastExposure: true, snapshotToken: 'snapshot-left' });
  assert.ok(result.plan.cueId.includes(':last-exposure'));
  assert.equal(result.plan.surfaces.length, 2);
  const hiddenBefore = h.hides.length;
  assert.equal(await h.director.endStudy(5), false); assert.equal(h.hides.length, hiddenBefore);
  assert.equal(h.director.holdComposition(true), false); assert.equal(h.holds.length, 0);
  assert.equal(h.director.debug().composition.purpose, 'return');
  assert.equal(h.director.suspend(), true);
  await until(() => h.director.debug().composition === null);
  await until(() => h.hides.length > hiddenBefore);
  assert.equal(h.hides.at(-1).releaseSnapshots, true, 'Last Exposure retains its previous retirement policy');
});

test('an arbitrarily long fullscreen notice cannot consume the five/eight-second Quorum changes before assignment', async () => {
  const originalNow = Date.now, gate = deferred(); let now = 1000, noticeEntered = false;
  Date.now = () => now;
  const h = harness({ fullscreen: true, releaseFullscreen: async transition => {
    noticeEntered = true; await gate.promise; return transition();
  } });
  try {
    const opening = h.director.beginStudy(quorum(), { key: 20 });
    await until(() => noticeEntered);
    assert.equal(h.shows.length, 0, 'the fullscreen notice still owns presentation');
    now = 27000; gate.resolve(true);
    const result = await opening;
    assert.equal(h.shows[0].plan.epochMs, 27000, 'native assignment starts after the notice, not when the request was made');
    assert.equal(result.plan.epochMs, 27000);
    const second = compilePaneScore(result.plan, 'quorum:b'), third = compilePaneScore(result.plan, 'quorum:c');
    const phase = (program, stamp) => paneScoreStateAt(program, { nowMs: stamp }).assignment.phaseOffsetMs;
    assert.equal(phase(second, now), 650); assert.equal(phase(third, now), 1350);
    assert.equal(phase(second, now + 4999), 650); assert.equal(phase(second, now + 5000), 0);
    assert.equal(phase(third, now + 7999), 1350); assert.equal(phase(third, now + 8000), 0);
    await h.director.endStudy(20);
  } finally { Date.now = originalNow; gate.resolve(true); }
});

test('a delayed failed native assignment rebases the simulated fallback instead of revealing its ending state', async () => {
  const originalNow = Date.now; let now = 1000;
  Date.now = () => now;
  const h = harness({ show: async () => { now = 31000; return false; } });
  try {
    const result = await h.director.beginStudy(quorum(), { key: 21 });
    assert.equal(h.shows[0].plan.epochMs, 1000, 'the native attempt had its own start');
    assert.equal(result.simulated, true); assert.equal(result.native, false);
    assert.equal(result.plan.epochMs, 31000, 'fallback receives a fresh presentation start after native failure');
    const second = compilePaneScore(result.plan, 'quorum:b'), third = compilePaneScore(result.plan, 'quorum:c');
    assert.equal(paneScoreStateAt(second, { nowMs: now }).assignment.phaseOffsetMs, 650);
    assert.equal(paneScoreStateAt(third, { nowMs: now }).assignment.phaseOffsetMs, 1350);
    assert.equal(paneScoreStateAt(second, { nowMs: now + 5000 }).assignment.phaseOffsetMs, 0);
    assert.equal(paneScoreStateAt(third, { nowMs: now + 8000 }).assignment.phaseOffsetMs, 0);
    await h.director.endStudy(21);
  } finally { Date.now = originalNow; }
});
