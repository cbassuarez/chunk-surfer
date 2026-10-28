import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import { slideBlockedPropStep } from '../src/world/prop-body-contact.js';
import {
  STAIR_ANOMALY_STATUS, freshStairAnomalyLedger, normalizeStairAnomalyEnvironment,
  normalizeStairAnomalyLedger, reduceStairAnomaly, stairAnomalyEntryCrossed, stairAnomalyTriggerMatches,
} from '../src/game/stair-anomaly.js';
import { STAIR_ANOMALY_ENTRY, createStairAnomalyRuntime } from '../src/game/stair-anomaly-runtime.js';

// Compile only the actual authored basement flight and landings. This tests its
// real direction without compiling unrelated floors, exterior or scene assets.
const authored = conservatory.levels.find(level => level.stairs?.some(stair => stair.id === 'main-basement-stair'));
const stair = authored.stairs.find(entry => entry.id === 'main-basement-stair');
FP.compile([{ ...authored, origin: { x: 0, y: 0 }, physicalOrigin: { x: 0, y: 0 }, rows: [''], stairs: [stair] }],
  { width: 64, height: 30 });
const environment = normalizeStairAnomalyEnvironment();
const flight = FP.floorplan().stairRuns.find(run => run.owner === 'main-basement-stair');
const main = readFileSync(process.env.CS_STAIR_DIRECTION_MAIN_SOURCE || new URL('../src/main.js', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
function production(name) {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `production helper exists: ${name}`);
  const end = main.indexOf('\n}\n', start);
  assert.ok(end > start, `production helper is complete: ${name}`);
  return main.slice(start, end + 3);
}

function entryHarness() {
  const h = {
    px: 95, py: 46, planName: 'conservatory', storyMode: true, RENDERER: '3d', depth: 1,
    ledger: freshStairAnomalyLedger(), environment, source: false, special: false, blocked: false,
    setupBlocked: false, propBlocked: false, waterBlocked: false, bouncerBlocked: false,
    beginCount: 0, playerKeys: new Set(), escape: null, facing: 1, renderMove: null,
    performance: { now: () => 10_000 }, STAIR_ANOMALY_STATUS, stairAnomalyEntryCrossed, stairAnomalyTriggerMatches,
    slideBlockedPropStep,
    mainStairMoveTouches: () => false, renderedPlayerPoint: () => ({ complete: true }),
    REC: { isRecording: () => false }, TUT: { tutorialActive: () => false },
    ZONE: { stair: 9, church: 21, chapelOuter: 22, chapel: 23 },
    CHAPEL_TOWER_PHASE: { TOWER_CLEARED: 'cleared', CHAPEL_FINAL: 'final' },
    currentStairAnomalyEnvironment: () => h.environment,
    currentStairAnomalyLedger: () => h.ledger,
    setupHandoffBlocksMovement: () => h.setupBlocked,
    hasEnteredGetIn: () => true, // The movement scenario starts after arrival.

    usingSourceSpace: () => h.source, usingSpecialSpace: () => h.special,
    usingPlan: () => h.planName != null, setupComplete: () => true,
    scenes: { blocksInput: () => h.blocked },
    chapelTowerState: () => ({ phase: 'cleared' }),
    academicBouncers: { view: () => ({ admitted: true }) },
    academicBouncerAccessForMove: () => ({ allowed: !h.bouncerBlocked }), academicBouncerRefusalAt: 0,
    natatoriumWaterBlocksAt: () => h.waterBlocked,
    // This climb has no active chapel demand; preserve its ordinary movement.
    chapelTapeDemandBeforeStep:()=>false,
    tryStandingTearCrossing:()=>false,
    PROPS: { propCanOccupy: () => !h.propBlocked },
    flagTest: () => true, pushEvent: () => {},
    beginStairAnomaly: () => { h.beginCount++; h.ledger = reduceStairAnomaly(h.ledger, { type: 'ENTER' }); },
    chunkSurfRuntime: {
      lastReceptionFrame: () => null, traversalFrame: () => null, stationRealmFrame: () => null,
      doorCrossingFrame: () => null,
    },
    sourceDoorArrival: null, stationWay: { walk: null },
  };
  h.FP = { ...FP, zoneAt: () => 9, doorAt: () => null };
  h.activeGeometry = () => h.FP;
  vm.createContext(h);
  vm.runInContext(production('stairTriggerCrossed'), h, { filename: 'src/main.js:stairTriggerCrossed' });
  const start = main.indexOf('function step(dx,dy){');
  const end = main.indexOf('  // Your feet are the loudest thing in this building.', start);
  assert.ok(end > start);
  // Execute the real production path through all acceptance checks and entry.
  // The ordinary footstep/audio tail is irrelevant to whether entry happened.
  vm.runInContext(`${main.slice(start, end)}\nreturn 'ordinary-move';\n}`, h,
    { filename: 'src/main.js:step-through-stair-entry' });
  return h;
}

test('all six actual west-stair lanes enter on their first upward rise, regardless of player facing', () => {
  for (let y = 44; y <= 49; y++) for (const facing of [1, 3]) {
    const crossing = FP.stairCrossing(95, y, 96, y);
    assert.equal(crossing.travel, 'up');
    assert.ok(crossing.toH > crossing.fromH);
    const h = entryHarness(); h.py = y; h.facing = facing;
    h.step(1, 0);
    assert.equal(h.beginCount, 1, `lane ${y}, facing ${facing}: forward or backwards ascent enters`);
  }
});

test('descending, backing down and moving sideways do not consume the armed encounter', () => {
  for (const facing of [1, 3]) {
    const h = entryHarness(); h.px = 96; h.facing = facing;
    assert.equal(FP.stairCrossing(96, 46, 95, 46).travel, 'down');
    h.step(-1, 0);
    assert.equal(h.beginCount, 0);
    assert.equal(h.ledger.status, 'armed');
  }
  const h = entryHarness(); h.step(0, 1);
  assert.equal(h.beginCount, 0, 'the lower landing is not itself a climb');
  assert.equal(h.ledger.status, 'armed');
});

test('entry uses actual floor/flight ownership rather than stale coordinates or compass direction', () => {
  const h = entryHarness();
  // A later edit could put a descending tread at exactly the old trigger seam.
  h.FP.stairCrossing = () => ({ stairId: flight.owner, flightId: flight.flight, travel: 'down', fromH: -3.6, toH: -4 });
  h.step(1, 0);
  assert.equal(h.beginCount, 0, 'east at the old seam must not imply up');
  h.FP.stairCrossing = () => ({ stairId: flight.owner, flightId: flight.flight, travel: 'up', fromH: -4, toH: -3.6 });
  h.px = 42; h.py = 12;
  h.FP.canStep = () => ({ ok: true });
  h.step(-1, 0);
  assert.equal(h.beginCount, 1, 'a relocated westward ascent is still the first real rise');
  assert.equal(stairAnomalyEntryCrossed(environment, {
    stairId: 'main-open-well', flightId: flight.flight, travel: 'up', fromH: -4, toH: -3.6,
  }, flight), false, 'the bourgeois open-well stair cannot accidentally take ownership');
  assert.equal(stairAnomalyEntryCrossed(environment, {
    stairId: flight.owner, flightId: flight.flight, travel: 'up', fromH: -3.6, toH: -3.2,
  }, flight), false, 'later risers are not new entry thresholds');
  assert.equal(stairAnomalyEntryCrossed(environment, {
    stairId: flight.owner, flightId: flight.flight, travel: 'up', fromH: -4, toH: -3.6,
  }, { ...flight, fromH: -4, toH: 0 }), true, 'authoring the same flight from bottom to top does not invert the trigger');
  assert.equal(stairAnomalyEntryCrossed(environment, {
    stairId: flight.owner, flightId: flight.flight, travel: 'up', fromH: null, toH: -3.6,
  }, flight), false, 'missing height evidence cannot be coerced into a valid crossing');
});

test('accepted movement and existing scene, lifecycle, access and prop guards precede entry', () => {
  for (const [label, mutate] of [
    ['dialogue or pause scene', h => { h.blocked = true; }],
    ['setup handoff', h => { h.setupBlocked = true; }],
    ['unfinished planted stair step', h => { h.renderMove = { mainStair: true }; h.renderedPlayerPoint = () => ({ complete: false }); }],
    ['blocking furniture', h => { h.propBlocked = true; }],
    ['water barrier', h => { h.waterBlocked = true; }],
    ['existing access gate', h => { h.bouncerBlocked = true; }],
    ['refused collision', h => { h.FP.canStep = () => ({ ok: false, why: 'wall' }); }],
    ['special space', h => { h.special = true; }],
    ['other floorplan', h => { h.planName = 'other'; }],
  ]) {
    const h = entryHarness(); mutate(h); h.step(1, 0);
    assert.equal(h.beginCount, 0, label);
    assert.equal(h.ledger.status, 'armed', `${label} does not consume the encounter`);
  }
  const h = entryHarness();
  h.FP.canStep = (x, y, nx, ny) => ny !== y ? { ok: false, why: 'wall' } : FP.canStep(x, y, nx, ny);
  h.step(1, 1);
  assert.equal(h.beginCount, 1, 'the real movement adapter slides onto the accepted uphill component before entry');
});

test('the real prop shoulder slide enters only when its accepted component climbs the owned flight', () => {
  const uphill = entryHarness();
  uphill.PROPS.propCanOccupy = (x, y) => !(x === 96 && y === 47);
  uphill.step(1, 1);
  assert.equal(uphill.beginCount, 1, 'blocked diagonal stock permits the clear uphill component');

  const sideways = entryHarness();
  sideways.PROPS.propCanOccupy = x => x !== 96;
  sideways.step(1, 1);
  assert.equal(sideways.beginCount, 0, 'a clear lateral slide is not an accepted ascent');
  assert.equal(sideways.ledger.status, 'armed');

  const wetUphill = entryHarness();
  wetUphill.PROPS.propCanOccupy = (x, y) => !(x === 96 && y === 47);
  wetUphill.natatoriumWaterBlocksAt = x => x === 96;
  wetUphill.step(1, 1);
  assert.equal(wetUphill.beginCount, 0, 'the prop slide preserves water ownership of an otherwise clear uphill half');
  assert.equal(wetUphill.ledger.status, 'armed');
});

test('active, completed and refused attempts never re-arm themselves', () => {
  const h = entryHarness(); h.step(1, 0); h.step(1, 0);
  assert.equal(h.beginCount, 1);
  h.ledger = reduceStairAnomaly(h.ledger, { type: 'COMPLETE' }); h.step(1, 0);
  assert.equal(h.beginCount, 1);
  const refused = entryHarness(); refused.propBlocked = true; refused.step(1, 0);
  refused.propBlocked = false; refused.step(1, 0);
  assert.equal(refused.beginCount, 1, 'a refusal leaves the valid later climb available');
});

test('legacy downward or inverted environments migrate to ascent and retain atmosphere and saved progress', () => {
  for (const stairId of ['upper', 'basement']) {
    const stored = { stairId, travel: 'down', visualSlope: 'down', variant: 'dry-inversion', seed: 73 };
    const normalized = normalizeStairAnomalyEnvironment(stored);
    assert.deepEqual(normalized, { stairId: 'basement', travel: 'up', visualSlope: 'up', variant: 'dry-inversion', seed: 73 });
    const ledger = { status: 'active', stage: 2, progress: .57, checkpoint: 2 };
    const runtime = createStairAnomalyRuntime({ environment: stored, initialLedger: ledger });
    assert.deepEqual(runtime.state(), ledger);
    assert.equal(runtime.checkpointPosition().y, -200);
    assert.ok(runtime.geometry.floorAt(0, -201) > runtime.geometry.floorAt(0, -200), 'resume continues climbing');
    assert.equal(normalizeStairAnomalyLedger({ status: 'completed' }).status, 'completed');
  }
});

function lifecycleHarness(ledger = freshStairAnomalyLedger(), area = 'conservatory') {
  const h = {
    save: { area, px: 95, py: 46, run: { id: 'direction-regression', environment: { stairAnomaly: environment }, ledger: { stairAnomaly: ledger } } },
    px: 95, py: 46, stairAnomalyRuntime: null, stairAttentionScene: null, stairPresenceSnapshot: null,
    stairDarkSince: 0, stairEscapeHinted: false, stairAnomalyEnteredAt: 0, renderMove: null, motionRig: null, trail: [],
    activations: [], commits: [], STAIR_ANOMALY_STATUS, STAIR_ANOMALY_ENTRY,
    normalizeStairAnomalyEnvironment, normalizeStairAnomalyLedger, reduceStairAnomaly,
    clock: 10_000, timers: [], speeches: [],
    performance: { now: () => h.clock }, getSave: () => h.save,
    usingSpecialSpace: () => !!h.stairAnomalyRuntime,
    usingStairAnomaly: () => !!h.stairAnomalyRuntime,
    saveCommit: patch => { h.commits.push(copy(patch)); Object.assign(h.save, copy(patch)); },
    clearStairEnvironmentalTimers: () => {}, beginStairAttention: () => {}, stairCueCaption: () => {},
    CUES: { CUE: { door: 'door', light: 'light' }, playCue: () => {} }, CR: { fx: { flash: () => {} } },
    STAIR_ESCAPE: { dark: 20_000 }, SPEECH: { say: line => h.speeches.push(line), sayAll: lines => h.speeches.push(...lines) },
    fireCue: () => {}, setTimeout: (callback, delay) => { h.timers.push({ callback, delay }); },
    scenes: { remove: () => {} }, PRES: { loadPresenceState: () => {}, savePresenceState: () => ({ active: false }) },
    R3: { r3dSetFacing: () => {}, r3dSetLocalLights: () => {}, r3dSetPlan: () => {}, r3dSetProps: () => {} },
    FP: { toRuntimePoint: FP.toRuntimePoint, physicalRenderPlanFor: () => ({ rgba: [], w: 1, h: 1, material: [], key: 'restored', group: 'ground' }) },
    r3dCache: {}, worldRenderInstances: () => [], syncDoorDynamicProps: () => {}, revealAround: () => {}, updateAudio: () => {},
  };
  h.activateStairAnomaly = (next, options) => {
    h.activations.push({ ledger: copy(next), options: copy(options), environment: copy(h.currentStairAnomalyEnvironment()) });
    h.stairAnomalyRuntime = { environment: h.currentStairAnomalyEnvironment(), state: () => next };
  };
  vm.createContext(h);
  for (const name of ['currentStairAnomalyEnvironment', 'currentStairAnomalyLedger', 'runWithStairAnomalyLedger',
    'stairAnomalyReturnPoint', 'beginStairAnomaly', 'resumeStairAnomalyFromSave', 'finishStairAnomaly', 'noteStairTorchFlick']) {
    vm.runInContext(production(name), h, { filename: `src/main.js:${name}` });
  }
  return h;
}

test('actual entry/save/resume adapter commits once and preserves checkpoint position without a new threshold', () => {
  const h = lifecycleHarness();
  assert.equal(h.beginStairAnomaly(), true);
  assert.equal(h.save.area, 'stair-anomaly');
  assert.equal(h.save.run.ledger.stairAnomaly.status, 'active');
  assert.equal(h.beginStairAnomaly(), false, 'an already-owned special world cannot start twice');
  assert.equal(h.activations.length, 1);
  const checkpoint = { status: 'active', stage: 2, progress: .57, checkpoint: 2 };
  const resumed = lifecycleHarness(checkpoint, 'stair-anomaly'); resumed.save.px = 1; resumed.save.py = -228;
  resumed.save.run.environment.stairAnomaly = { ...environment, travel: 'down', visualSlope: 'down' };
  assert.equal(resumed.resumeStairAnomalyFromSave(), true);
  assert.equal(resumed.activations[0].environment.travel, 'up');
  assert.equal(resumed.activations[0].options.position.y, -228);
  assert.deepEqual(resumed.activations[0].ledger, checkpoint);
  for (const [state, area] of [[freshStairAnomalyLedger(), 'stair-anomaly'], [{ status: 'completed' }, 'stair-anomaly'], [checkpoint, 'conservatory']]) {
    const inert = lifecycleHarness(state, area);
    assert.equal(inert.resumeStairAnomalyFromSave(), false);
    assert.equal(inert.activations.length, 0);
  }
});

test('ordinary completion and the darkness escape both save a spent upward encounter on the real landing', () => {
  for (const ledger of [{ status: 'active', stage: 1, progress: .28, checkpoint: 1 }, { status: 'completed' }]) {
    const h = lifecycleHarness(ledger, 'stair-anomaly');
    h.activateStairAnomaly(ledger, { position: { x: 0, y: -112 } });
    assert.equal(h.finishStairAnomaly(), true);
    assert.equal(h.save.area, 'conservatory');
    assert.equal(h.save.run.ledger.stairAnomaly.status, 'completed', 'the alternate escape must retire its active ledger too');
    assert.deepEqual({ x: h.save.px, y: h.save.py }, FP.toRuntimePoint({ x: 60, y: 23 }));
    assert.equal(h.stairAnomalyRuntime, null);
    assert.equal(h.resumeStairAnomalyFromSave(), false);
    assert.equal(h.finishStairAnomaly(), false, 'second completion has no side effects');
  }
});

test('the actual alternate torch-exit path waits for the full hold and cannot replay after cancellation or reload', () => {
  const h = lifecycleHarness({ status: 'active', stage: 1, progress: .28, checkpoint: 1 }, 'stair-anomaly');
  h.activateStairAnomaly(h.save.run.ledger.stairAnomaly, { position: { x: 0, y: -112 } });
  h.noteStairTorchFlick(false); h.clock += 19_999; h.noteStairTorchFlick(true);
  assert.equal(h.timers.length, 0, 'a prematurely cancelled darkness hold remains on the stair');
  assert.equal(h.stairAnomalyRuntime.state().status, 'active');
  h.clock += 1; h.noteStairTorchFlick(false); h.clock += 20_000; h.noteStairTorchFlick(true);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].delay, 420, 'the existing covered scene transition is retained');
  h.timers[0].callback();
  assert.equal(h.save.run.ledger.stairAnomaly.status, 'completed');
  assert.equal(h.save.area, 'conservatory');
  const count = h.commits.length;
  h.noteStairTorchFlick(false); h.clock += 20_000; h.noteStairTorchFlick(true);
  assert.equal(h.commits.length, count, 'torch use after release cannot repeat the escape');
  assert.equal(h.resumeStairAnomalyFromSave(), false);
});
