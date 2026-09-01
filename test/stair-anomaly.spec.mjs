import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  RUN_SCHEMA_VERSION,
  SAVE_VERSION,
  freshRunRecord,
  normalizeRun,
} from '../src/progression/schema.js';
import {
  LEGACY_STAIR_ANOMALY_LEDGER,
  STAIR_ANOMALY_DARK_ESCAPE_MS,
  STAIR_ANOMALY_STAGE,
  STAIR_ANOMALY_STATUS,
  decideStairAnomalyEnvironment,
  freshStairAnomalyLedger,
  normalizeStairAnomalyEnvironment,
  normalizeStairAnomalyLedger,
  reduceStairAnomaly,
} from '../src/game/stair-anomaly.js';
import {
  STAIR_ANOMALY_MODULE_CELLS,
  STAIR_ANOMALY_STEP_INTERVAL_MS,
  STAIR_ANOMALY_TOTAL_CELLS,
  createStairAnomalyRuntime,
  stairAnomalyFloorAt,
} from '../src/game/stair-anomaly-runtime.js';
import { MATERIAL } from '../src/data/floorplan/legend.js';
import { MOVE_MS } from '../src/config.js';
import { decodeH } from '../src/world/floorplan.js';

const route = (routeTrunk, runId = 'run-stair') => decideStairAnomalyEnvironment({ routeTrunk, runId, now: 100 });
// ── ALWAYS THE WEST STAIR, ALWAYS THE CLIMB ──────────────────────────────────
//
// NOT THE SPIRAL. The main open-well stair is a helix — every flight sweeps 180
// degrees around the well — and a helix that goes on too long reads as a camera
// stuck in a turn rather than a building that has grown: you lose your bearings
// on the second revolution and the length stops meaning anything. A straight
// flight can be impossibly long and still be legible as a straight flight.
//
// NOT THE DESCENT. The way down to studio B3 is the first walk of the night and
// an impossible stair there reads as a broken game, not a wrong building.
for (const trunk of ['baseline', 'flooded-seal', 'flooded-surface', 'dry-inversion', 'uncertain']) {
  for (const runId of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const selected = decideStairAnomalyEnvironment({ routeTrunk: trunk, runId, now: 1 });
    assert.equal(selected.travel, 'up', `${trunk} never puts the impossible stair on a descent`);
    assert.equal(selected.stairId, 'basement', `${trunk} never puts it on the spiral`);
    assert.equal(selected.visualSlope, selected.travel, `${trunk} looks like the direction the player chose`);
  }
}
assert.deepEqual({ ...route('baseline'), seed: 0 }, { stairId: 'basement', travel: 'up', visualSlope: 'up', variant: 'baseline', seed: 0 });
assert.deepEqual({ ...route('flooded-seal'), seed: 0 }, { stairId: 'basement', travel: 'up', visualSlope: 'up', variant: 'flooded-seal', seed: 0 });
assert.deepEqual({ ...route('flooded-surface'), seed: 0 }, { stairId: 'basement', travel: 'up', visualSlope: 'up', variant: 'flooded-surface', seed: 0 });
assert.deepEqual({ ...route('dry-inversion'), seed: 0 }, { stairId: 'basement', travel: 'up', visualSlope: 'up', variant: 'dry-inversion', seed: 0 });
assert.deepEqual(route('uncertain'), route('uncertain'));
assert.notEqual(route('uncertain').variant, 'baseline');

// A save written while the spiral was still a candidate is migrated, not
// honoured — otherwise an in-flight run keeps the stair this change removed.
assert.equal(normalizeStairAnomalyEnvironment({
  stairId: 'upper', travel: 'up', visualSlope: 'up', variant: 'dry-inversion', seed: 7,
}).stairId, 'basement', 'a stored spiral selection is migrated to the west stair');
assert.equal(normalizeStairAnomalyEnvironment({
  stairId: 'upper', travel: 'down', visualSlope: 'up', variant: 'dry-inversion', seed: 7,
}).visualSlope, 'down', 'legacy or future descents render downward rather than contradicting travel');

// ── LONG ENOUGH TO MEAN SOMETHING, NOT LONGER ────────────────────────────────
//
// This was 640 treads — about a minute of unbroken climbing, which is past the
// point where the stair stops making an argument and starts merely continuing.
// The effect lands when the player passes the rise a real flight would have
// taken; everything after that is the same sentence repeated.
assert.equal(STAIR_ANOMALY_TOTAL_CELLS, 400, 'the climb is well under what it was');
// The interval is DERIVED from MOVE_MS, not copied. It used to be the literal
// 90 while calling itself "matching config MOVE_MS" — but MOVE_MS is `ms(90)`
// and `ms` scales by 1/CELL_SCALE, so the real figure is 45. Every duration
// reasoned from the old constant was exactly double the truth.
assert.equal(STAIR_ANOMALY_STEP_INTERVAL_MS, MOVE_MS,
  'the pacing constant is the movement clock, not a copy of it that can drift');
assert.ok(STAIR_ANOMALY_TOTAL_CELLS >= 14 * 20,
  'while still being many times a real fourteen-rise flight');
assert.equal(STAIR_ANOMALY_TOTAL_CELLS % STAIR_ANOMALY_MODULE_CELLS, 0,
  'the four beats divide the climb evenly');
assert.equal(STAIR_ANOMALY_TOTAL_CELLS / STAIR_ANOMALY_MODULE_CELLS, 4,
  'and there are still four of them');

assert.equal(STAIR_ANOMALY_DARK_ESCAPE_MS, 20_000, 'twenty seconds in darkness resolves the stair');

assert.equal(SAVE_VERSION, 4, 'reference exposure migration bumps the outer save contract');
assert.equal(RUN_SCHEMA_VERSION, 3, 'the causal/reference run contract is versioned');
const fresh = freshRunRecord({ id: 'run-stair', now: 100 });
assert.equal(fresh.ledger.stairAnomaly.status, STAIR_ANOMALY_STATUS.ARMED);
assert.equal(Object.isFrozen(fresh.environment.stairAnomaly), true, 'the run-scoped selection is immutable');
const legacy = normalizeRun({ ...fresh, schema: 1, ledger: { ...fresh.ledger, stairAnomaly: undefined } });
assert.deepEqual(legacy.ledger.stairAnomaly, LEGACY_STAIR_ANOMALY_LEDGER, 'old saves cannot surprise-trigger the event');
// ...and a CURRENT run with no stair record has simply not met the stair yet.
// Reading that as "already done" is what disarmed the event for every save that
// had ever round-tripped without the field, permanently, with no way back except
// the god menu. The legacy guard belongs to the old schema, not to everyone.
const live = normalizeRun({ ...fresh, ledger: { ...fresh.ledger, stairAnomaly: undefined } });
assert.equal(live.ledger.stairAnomaly.status, STAIR_ANOMALY_STATUS.ARMED,
  'a run at the current schema stays armed when its ledger has no stair record');
assert.equal(normalizeRun({ ...fresh, ledger: undefined }).ledger.stairAnomaly.status, STAIR_ANOMALY_STATUS.ARMED,
  'and so does one with no ledger at all');
assert.deepEqual(normalizeStairAnomalyLedger({ status: 'corrupt', stage: 999 }), LEGACY_STAIR_ANOMALY_LEDGER);

let state = reduceStairAnomaly(freshStairAnomalyLedger(), { type: 'ENTER' });
assert.equal(state.status, STAIR_ANOMALY_STATUS.ACTIVE);
assert.deepEqual(reduceStairAnomaly(state, { type: 'ENTER' }), state, 'commitment is exactly once');
state = reduceStairAnomaly(state, { type: 'ADVANCE', stage: 2, progress: .55, checkpoint: true });
assert.deepEqual(reduceStairAnomaly(state, { type: 'RESUME' }), { ...state, progress: .55 });
state = reduceStairAnomaly(state, { type: 'COMPLETE' });
assert.deepEqual(state, LEGACY_STAIR_ANOMALY_LEDGER);
assert.deepEqual(reduceStairAnomaly(state, { type: 'ENTER' }), state, 'completion cannot re-arm itself');

let clock = 0;
const stages = [];
const saved = [];
let completed = 0;
const runtime = createStairAnomalyRuntime({
  environment: route('baseline'),
  initialLedger: freshStairAnomalyLedger(),
  now: () => clock,
  onState: (next, options) => { if (options.immediate) saved.push({ ...next }); },
  onStage: ({ stage }) => stages.push(stage),
  onComplete: () => { completed += 1; },
});
assert.equal(runtime.geometry.materialAt(0, 0), MATERIAL.serviceConcrete, 'the pocket keeps the real stair masonry material');
let y = 0;
for (let depth = 1; depth <= STAIR_ANOMALY_TOTAL_CELLS; depth += 1) {
  clock += STAIR_ANOMALY_STEP_INTERVAL_MS;
  const move = runtime.geometry.canStep(0, y, 0, y - 1);
  assert.equal(move.ok, true, `forward stair cell ${depth} is climbable`);
  const nextY = move.redirect?.y ?? y - 1;
  runtime.onStep({ x: 0, y }, { x: 0, y: nextY, facing: 0 });
  y = nextY;
}
assert.deepEqual(stages, [1, 2, 3]);
assert.equal(completed, 1);
assert.deepEqual(runtime.state(), LEGACY_STAIR_ANOMALY_LEDGER);
assert.deepEqual(saved.map((entry) => entry.checkpoint), [1, 2, 3, 4]);
// Walked end to end, at the ordinary cadence. This was 28.8s, which is past the
// point where the stair stops making an argument and merely continues.
assert.ok(clock / 1000 >= 15 && clock / 1000 <= 21,
  `normal traversal is ${clock / 1000}s — long enough to mean something, not long enough to outstay it`);
runtime.onStep({ x: 0, y }, { x: 0, y: y - 1, facing: 0 });
assert.equal(completed, 1, 'completion callback is exactly once');

// The impossible stair is walked at the ordinary pace — consecutive up-treads
// are never throttled, so it feels no different to climb than any real stair
// (it is long, not slow).
const paced = createStairAnomalyRuntime({ environment: route('baseline'), initialLedger: freshStairAnomalyLedger() });
assert.equal(paced.geometry.canStep(0, 0, 0, -1).ok, true);
assert.equal(paced.geometry.canStep(0, -1, 0, -2).ok, true, 'no cadence throttle — the next tread is immediately climbable');

// The texture window rebases after the first tread and every sixteen thereafter.
// Its byte heights may change, but adding the separately supplied world offset
// must reconstruct the same tread on both sides of that boundary. Otherwise the
// whole flight moves ~3.5m while the camera eases and the slice fills the screen.
const beforeRebase = paced.geometry.renderPlanFor(0, 0);
const afterRebase = paced.geometry.renderPlanFor(0, -1);
const decodedWorldFloor = (plan, worldX, worldY) => {
  const localX = Math.floor(worldX) - plan.originX;
  const localY = Math.floor(worldY) - plan.originY;
  const index = (localY * plan.w + localX) * 4;
  return decodeH(plan.rgba[index]) + plan.heightOffset;
};
const expectedSharedTread = stairAnomalyFloorAt(-1, route('baseline'));
const beforeFloor = decodedWorldFloor(beforeRebase, 0, -1);
const afterFloor = decodedWorldFloor(afterRebase, 0, -1);
assert.ok(Math.abs(beforeFloor - expectedSharedTread) < .07, 'pre-boundary plan reconstructs world height');
assert.ok(Math.abs(afterFloor - expectedSharedTread) < .07, 'post-boundary plan reconstructs world height');
assert.ok(Math.abs(beforeFloor - afterFloor) < .07, 'the visible tread does not move when the plan window rebases');
assert.ok(Math.abs(afterRebase.heightOffset - beforeRebase.heightOffset) > 3, 'the test crosses a material render-window rebase');
const eyeBefore = paced.geometry.renderedFloorAt(0, -1, 0, -.99);
const eyeAfter = paced.geometry.renderedFloorAt(0, -1, 0, -1.01);
assert.ok(Math.abs(eyeAfter - eyeBefore) < .01, 'eye height follows continuous stair pitch across a tread edge');

// One continuous flight, no loop: the floor rises monotonically the whole way,
// never resetting to a landing (which is what made it feel like the same stairs
// repeating).
let prevFloor = -Infinity;
for (let depth = 0; depth <= STAIR_ANOMALY_TOTAL_CELLS; depth += 1) {
  const floor = stairAnomalyFloorAt(-depth, route('baseline'));
  assert.ok(floor >= prevFloor, `the stair keeps climbing at depth ${depth} — no landing reset`);
  prevFloor = floor;
}

const oneWay = createStairAnomalyRuntime({ environment: route('baseline'), initialLedger: freshStairAnomalyLedger() });
y = 0;
for (let depth = 1; depth <= STAIR_ANOMALY_MODULE_CELLS; depth += 1) {
  assert.equal(oneWay.geometry.canStep(0, y, 0, y - 1).ok, true, `continuous stair cell ${depth} is climbable`);
  oneWay.onStep({ x: 0, y }, { x: 0, y: y - 1, facing: 0 });
  y -= 1;
}
assert.equal(oneWay.state().checkpoint, 1, 'a stage boundary sets a resume checkpoint');
// The only way is up: descending below the checkpoint is a wall, never a wrap —
// no forward-teleport loop, so you never re-tread the same steps.
const rear = oneWay.geometry.canStep(0, -STAIR_ANOMALY_MODULE_CELLS, 0, -STAIR_ANOMALY_MODULE_CELLS + 1);
assert.equal(rear.ok, false);
assert.equal(rear.why, 'no-return');
assert.equal(rear.redirect, undefined, 'it is one continuous flight, not a repeating module');

const resumed = createStairAnomalyRuntime({ environment: route('baseline'), initialLedger: oneWay.state() });
assert.deepEqual(resumed.checkpointPosition(), { x: 0, y: -STAIR_ANOMALY_MODULE_CELLS, facing: 0 });
assert.equal(resumed.state().stage, STAIR_ANOMALY_STAGE.REPETITION);

const shadowLedger = { status: 'active', stage: STAIR_ANOMALY_STAGE.SHADOW, progress: .5, checkpoint: STAIR_ANOMALY_STAGE.SHADOW };
const shadow = createStairAnomalyRuntime({ environment: route('uncertain'), initialLedger: shadowLedger });
shadow.setPlayerPosition({ x: 0, y: -70, facing: 0 });
assert.equal(shadow.propInstances().filter((entry) => entry.shadowOnly).length, 1);
assert.equal(shadow.propInstances({ reducedDread: true }).some((entry) => entry.shadowOnly), false);
assert.deepEqual(shadow.propInstances().filter((entry)=>!entry.shadowOnly),[],'the anomalous stair carries no rails, doors, or visible light fixtures');
const lights = shadow.lightRig(4);
assert.ok(lights.length <= 8);
assert.equal(lights.filter((entry) => entry.castsShadow).length, 1, 'only one practical is the hero shadow light');
assert.ok(shadow.lightRig(4, { reducedFlash: true }).every((entry) => entry.intensity >= .18));

clock = 0;
const fading = createStairAnomalyRuntime({
  environment: route('baseline'),
  initialLedger: { status: 'active', stage: 1, progress: .25, checkpoint: 1 },
  now: () => clock,
});
fading.setPlayerPosition({ x: 0, y: -319, facing: 0 });
fading.onStep({ x: 0, y: -319 }, { x: 0, y: -320, facing: 0 });   // crosses into the SHADOW stage
const fadingStart = fading.lightRig(0, { reducedFlash: true }).find((entry) => entry.id === 'stair-practical-306');
clock = 650;
const fadingEnd = fading.lightRig(.65, { reducedFlash: true }).find((entry) => entry.id === 'stair-practical-306');
assert.ok(fadingStart.intensity > fadingEnd.intensity && fadingEnd.intensity >= .18, 'reduced flash fades the light behind instead of snapping it off');

const propRenderer = readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
const architectureRenderer = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(propRenderer, /if\(!shadow&&i\.shadowOnly\)continue/, 'shadow-only bodies are omitted from the color pass');
// The option bag has grown a `lodEye` since this was written. What the contract
// is about is the first three arguments and the emergency-only flag — match those
// and let the bag carry whatever else the renderer needs.
assert.match(propRenderer, /visibleGroups\(lightEye,64,\{shadow:true,emergencyOnly:!!practical&&emergencyShadowInstances\.length>0\b/, 'the practical shadow pass reaches the full emergency-light field');
assert.match(propRenderer, /const instances=emergencyOnly\?emergencyShadowInstances:/, 'emergency practicals isolate their staged shadow-only figures');
// The selected practical shadows architecture. This used to pin the literal
// `li==uLocalShadowIndex?propFlashShadow`, which stopped being true the moment
// the one shadow map started being applied to the whole overlapping red field
// rather than to its own lamp's contribution alone.
assert.match(architectureRenderer, /heroShadow=mix\(\.015,1\.0,/, 'the selected practical shadows architecture');
assert.match(architectureRenderer, /max\(float\(li==uLocalShadowIndex\),emergency\)>\.5\?heroShadow:1\.0/,
  'and that one silhouette is applied to every emergency lamp, not just the one carrying the map');
assert.match(architectureRenderer, /architecturalLightVisibility\(posM,uLocalLightPos\[li\]\.xyz\)/, 'bounded floorplan occlusion gates practical light');
assert.match(architectureRenderer, /H_MIN \+ uPlanHeightOffset/, 'render-plan byte rebases are restored into continuous world height');
assert.match(mainSource, /heightOffset:plan\.heightOffset/, 'the stair plan hands its world-height offset to the renderer');
const escapeSource = mainSource.slice(mainSource.indexOf('const STAIR_ESCAPE'), mainSource.indexOf('function beginStairAnomaly'));
assert.match(escapeSource, /dark: STAIR_ANOMALY_DARK_ESCAPE_MS/, 'the live escape uses the shared twenty-second contract');
assert.match(mainSource, /Torch off, stand still, count to twenty, and put it back on/, 'the diegetic instruction matches the twenty-second contract');
assert.doesNotMatch(mainSource, /Torch off, stand still, count to thirty, and put it back on/, 'no stale thirty-second instruction remains');
const stageAudio = mainSource.slice(mainSource.indexOf('function onStairAnomalyStage'), mainSource.indexOf('function syncStairAnomalyRender'));
assert.doesNotMatch(stageAudio, /REC\.emitNoise|PRES\./, 'environmental echoes never create player-generated HUSH events');
const attention = mainSource.slice(mainSource.indexOf('function beginStairAttention'), mainSource.indexOf('function onStairAnomalyStage'));
assert.doesNotMatch(attention, /blocksInput:true/, 'the impossible stair never seizes input mid-climb — the continuous climb is uninterrupted (no stuck movement)');

console.log('stair anomaly state/runtime tests passed');
