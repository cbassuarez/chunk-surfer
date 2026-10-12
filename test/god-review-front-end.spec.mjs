import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { FrontEndSession, FRONT_END_STATE } from '../src/game/front-end-session.js';
import { affinityMatches, destinationAffinityForContinue, makeResumeLaunchPlan } from '../src/game/run-launch-plan.js';
import { makeBlackHoldScene, makeIrisScene } from '../src/game/iris-transition.js';
import * as scenes from '../src/game/scenes.js';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const start = main.indexOf('function godEnsureTestRun(){');
const body = main.slice(start, main.indexOf('\nfunction godStoryWayfindingCapture', start));

function run(session) {
  const save = { run: { id: 'existing-review-run' }, flags: {} }, events = [];
  const noop = () => {};
  const context = {
    frontEndSession: session, frontEndPromotionPending: true, frontEndMismatchPending: true,
    frontEndPlateOverride: 'title', R3: { r3dSetFrontEndPlate: value => events.push(['plate', value]) },
    endBootWeather: () => events.push(['boot-ended']), scenes: { depth: () => 0, clear: noop },
    godRestoreBuildingWorld: noop, activeBattleId: 'old', godBattleOpen: true,
    STORY: { stopTapeHiss: noop }, resetMotionInput: noop, setGameplayPaused: noop,
    getSave: () => save, flagApply: noop, saveCommit: noop, storyMode: true,
    inRogue: true, buildingLoadPromise: Promise.resolve(true),
    sampleFieldEnabled: true, silenceSampleField: noop, setGameChrome: noop,
    FP: { isLoaded: () => false }, godSyncBuildingRender: noop,
  };
  vm.createContext(context);
  vm.runInContext(`${body}\ngodEnsureTestRun();`, context);
  return { context, events };
}

test('actual review entry finishes front-end session so its per-frame snapshot cannot restore title inversion', () => {
  const session = new FrontEndSession();
  session.markCameraReady({exact:true});
  session.enterTitle();
  assert.equal(session.snapshot().plate.negative, 1);
  const { context, events } = run(session);
  session.update(.1);
  assert.equal(session.state, FRONT_END_STATE.LIVE);
  assert.equal(session.snapshot().plate.negative, 0);
  assert.equal(session.snapshot().plate.amount, 0);
  assert.equal(context.frontEndPlateOverride, null);
  assert.equal(context.frontEndPromotionPending, false);
  assert.equal(context.frontEndMismatchPending, false);
  assert.deepEqual(events, [['plate', 'gameplay'], ['boot-ended']]);
});

test('review entry also resets an explicitly pinned title plate when no front-end session exists', () => {
  const { context, events } = run(null);
  assert.equal(context.frontEndPlateOverride, null);
  assert.deepEqual(events, [['plate', 'gameplay'], ['boot-ended']]);
});

function mainBlock(from, to) {
  const start = main.indexOf(from), end = main.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `missing production block ${from}`);
  return main.slice(start, end);
}

function nativeContinue({ exact = true, inGame = false, hasRun = true } = {}) {
  const save = { run: hasRun ? { id: 'saved-tower', status: 'active' } : null,
    area: exact ? 'conservatory' : 'source-space', px: 257, py: 397,
    view: { yaw: 0, pitch: -.08 }, cameraRevision: 4, checkpointRevision: 9 };
  const session = new FrontEndSession({ plan: makeResumeLaunchPlan(save) });
  session.markCameraReady({ exact }); session.enterTitle();
  if (inGame) session.markLive();
  const events = [];
  const context = {
    frontEndSession: session, frontEndPromotionPending: false, frontEndMismatchPending: false,
    frontEndPlateOverride: null, FRONT_END_STATE, dt: 0, storyMode: inGame, inRogue: true, paused: inGame,
    getSave: () => save, scenes, affinityMatches, destinationAffinityForContinue,
    makeIrisScene, makeBlackHoldScene, shakeMode: () => 'full',
    windowChoreography: { finishTitle: options => events.push(['finish-title', options.windowPolicy]) },
    R3: { r3dSetFrontEndPlate: plate => events.push(['plate', plate]), r3dFrontEndPlate: () => session.snapshot().plate },
    personalWindowEffects: { setFrontEndPlate() {} },
    endBootWeather: () => events.push(['weather-ended']), syncPointerMode: () => {},
    setGameplayPaused: next => { context.paused = next; events.push(['paused', next]); },
    enterStory: options => { context.storyMode = true; events.push(['story', structuredClone(options)]); },
    loadBuilding: async () => { events.push(['load']); }, beginNewGameFlow: () => events.push(['new-run']),
  };
  vm.createContext(context);
  vm.runInContext([
    mainBlock('function isDesktopMenuInGame(){', '\nfunction openAboutPanel(){'),
    mainBlock('function startMatchedFrontEndPromotion(){', '\nfunction requestFrontEndNewRun(){'),
    mainBlock('function closePauseMenu(){', '\nfunction openPauseMenu(){'),
  ].join('\n'), context);
  const frame = mainBlock('    if(frontEndSession){\n      frontEndSession.update(dt);', '\n    uiClear();');
  return { save, session, context, events,
    continue: () => vm.runInContext('continueRunFromDesktopMenu();', context),
    frame: seconds => { context.dt = seconds; vm.runInContext(frame, context); },
  };
}

test('native Continue restores through the actual title lift and retires its persistent negative plate', () => {
  scenes.clear(); scenes.push({ id: 'title' });
  try {
    const h = nativeContinue();
    h.continue();
    assert.equal(h.session.state, FRONT_END_STATE.LIFTING);
    assert.equal(scenes.top().id, 'title', 'the title remains until its authored handoff finishes');
    assert.deepEqual(h.events.filter(([event]) => ['story', 'load', 'finish-title'].includes(event)),
      [['finish-title', 'none'], ['story', { reusePreparedWorld: true, frontEndPromotion: true }]]);
    h.frame(1);
    assert.equal(h.session.state, FRONT_END_STATE.LIVE);
    assert.equal(h.session.snapshot().plate.negative, 0);
    assert.equal(h.session.snapshot().plate.amount, 0);
    assert.equal(scenes.has('title'), false);
    assert.equal(h.context.frontEndPromotionPending, false);
    assert.deepEqual(h.save.view, { yaw: 0, pitch: -.08 }, 'the handoff preserves the saved church view');
  } finally { scenes.clear(); }
});

test('native Continue also finishes the real iris transition when the prepared view is not exact', async () => {
  scenes.clear(); scenes.push({ id: 'title' });
  try {
    const h = nativeContinue({ exact: false });
    h.continue();
    assert.equal(h.session.state, FRONT_END_STATE.IRIS_CLOSING);
    scenes.top({ includeOverlay: true }).update(1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.session.state, FRONT_END_STATE.IRIS_OPENING);
    assert.equal(scenes.has('title'), false);
    assert.equal(scenes.has('front-end-black'), false);
    assert.deepEqual(h.events.filter(([event]) => ['story', 'load'].includes(event)),
      [['load'], ['story', { reusePreparedWorld: true }]]);
    scenes.top({ includeOverlay: true }).update(1);
    h.frame(.1);
    assert.equal(h.session.state, FRONT_END_STATE.LIVE);
    assert.equal(h.session.snapshot().plate.negative, 0);
    assert.equal(h.session.snapshot().plate.amount, 0);
    assert.equal(h.context.frontEndMismatchPending, false);
  } finally { scenes.clear(); }
});

test('native Continue resumes an active run without rebuilding its live encounter or tapes', () => {
  for (const paused of [false, true]) {
    scenes.clear();
    const checkpoint = { phase: 2, composure: 27 }, battle = { id: 'battle:cathedral-surfer-final', checkpoint };
    scenes.push(battle);
    if (paused) scenes.push({ id: 'pause' });
    try {
      const h = nativeContinue({ inGame: true });
      h.context.paused = paused;
      h.continue(); h.frame(.1);
      assert.equal(scenes.top(), battle);
      assert.equal(scenes.top().checkpoint, checkpoint);
      assert.equal(h.context.paused, false);
      assert.equal(h.session.state, FRONT_END_STATE.LIVE);
      assert.deepEqual(h.events.filter(([event]) => ['story', 'load', 'finish-title'].includes(event)), []);
    } finally { scenes.clear(); }
  }
});

test('native Continue with no saved run opens the existing new-run flow', () => {
  scenes.clear();
  const h = nativeContinue({ hasRun: false });
  h.continue();
  assert.deepEqual(h.events, [['new-run']]);
});
