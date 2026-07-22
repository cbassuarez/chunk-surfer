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
  STAIR_ANOMALY_STAGE,
  STAIR_ANOMALY_STATUS,
  decideStairAnomalyEnvironment,
  freshStairAnomalyLedger,
  normalizeStairAnomalyLedger,
  reduceStairAnomaly,
} from '../src/game/stair-anomaly.js';
import {
  STAIR_ANOMALY_STEP_INTERVAL_MS,
  STAIR_ANOMALY_TOTAL_CELLS,
  createStairAnomalyRuntime,
} from '../src/game/stair-anomaly-runtime.js';
import { MATERIAL } from '../src/data/floorplan/legend.js';

const route = (routeTrunk, runId = 'run-stair') => decideStairAnomalyEnvironment({ routeTrunk, runId, now: 100 });
assert.deepEqual({ ...route('baseline'), seed: 0 }, { stairId: 'upper', travel: 'up', visualSlope: 'up', variant: 'baseline', seed: 0 });
assert.deepEqual({ ...route('flooded-seal'), seed: 0 }, { stairId: 'basement', travel: 'down', visualSlope: 'down', variant: 'flooded-seal', seed: 0 });
assert.deepEqual({ ...route('flooded-surface'), seed: 0 }, { stairId: 'basement', travel: 'up', visualSlope: 'up', variant: 'flooded-surface', seed: 0 });
assert.deepEqual({ ...route('dry-inversion'), seed: 0 }, { stairId: 'upper', travel: 'up', visualSlope: 'down', variant: 'dry-inversion', seed: 0 });
assert.deepEqual(route('uncertain'), route('uncertain'));
assert.notEqual(route('uncertain').variant, 'baseline');

assert.equal(SAVE_VERSION, 3, 'the outer save version stays stable');
assert.equal(RUN_SCHEMA_VERSION, 2, 'only the nested run schema increments');
const fresh = freshRunRecord({ id: 'run-stair', now: 100 });
assert.equal(fresh.ledger.stairAnomaly.status, STAIR_ANOMALY_STATUS.ARMED);
assert.equal(Object.isFrozen(fresh.environment.stairAnomaly), true, 'the run-scoped selection is immutable');
const legacy = normalizeRun({ ...fresh, schema: 1, ledger: { ...fresh.ledger, stairAnomaly: undefined } });
assert.deepEqual(legacy.ledger.stairAnomaly, LEGACY_STAIR_ANOMALY_LEDGER, 'old saves cannot surprise-trigger the event');
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
assert.ok(clock / 1000 >= 40 && clock / 1000 <= 55, `normal traversal is ${clock / 1000}s`);
runtime.onStep({ x: 0, y }, { x: 0, y: y - 1, facing: 0 });
assert.equal(completed, 1, 'completion callback is exactly once');

clock = 1000;
const cadence = createStairAnomalyRuntime({ environment: route('baseline'), initialLedger: freshStairAnomalyLedger(), now: () => clock });
assert.equal(cadence.geometry.canStep(0, 0, 0, -1).ok, true);
assert.equal(cadence.geometry.canStep(0, -1, 0, -2).why, 'stair-cadence');
clock += STAIR_ANOMALY_STEP_INTERVAL_MS;
assert.equal(cadence.geometry.canStep(0, -1, 0, -2).ok, true);

clock = 0;
const wrapping = createStairAnomalyRuntime({ environment: route('baseline'), initialLedger: freshStairAnomalyLedger(), now: () => clock });
y = 0;
for (let depth = 1; depth <= 32; depth += 1) {
  clock += STAIR_ANOMALY_STEP_INTERVAL_MS;
  const move = wrapping.geometry.canStep(0, y, 0, y - 1);
  y = move.redirect?.y ?? y - 1;
  wrapping.onStep({ x: 0, y: y + 1 }, { x: 0, y, facing: 0 });
}
assert.equal(wrapping.state().checkpoint, 1);
clock += STAIR_ANOMALY_STEP_INTERVAL_MS;
const rear = wrapping.geometry.canStep(0, -32, 0, -31);
assert.equal(rear.wrapped, true);
assert.equal(rear.redirect.y, -62, 'a rear seam returns the player to the same repeating module');

const resumed = createStairAnomalyRuntime({ environment: route('baseline'), initialLedger: wrapping.state() });
assert.deepEqual(resumed.checkpointPosition(), { x: 0, y: -32, facing: 0 });
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
fading.setPlayerPosition({ x: 0, y: -63, facing: 0 });
fading.onStep({ x: 0, y: -63 }, { x: 0, y: -64, facing: 0 });
const fadingStart = fading.lightRig(0, { reducedFlash: true }).find((entry) => entry.id === 'stair-practical-26');
clock = 650;
const fadingEnd = fading.lightRig(.65, { reducedFlash: true }).find((entry) => entry.id === 'stair-practical-26');
assert.ok(fadingStart.intensity > fadingEnd.intensity && fadingEnd.intensity >= .18, 'reduced flash fades the light behind instead of snapping it off');

const propRenderer = readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
const architectureRenderer = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(propRenderer, /if\(!shadow&&i\.shadowOnly\)continue/, 'shadow-only bodies are omitted from the color pass');
assert.match(propRenderer, /visibleGroups\(lightEye,35,\{shadow:true\}\)/, 'shadow-only bodies remain in the practical shadow pass');
assert.match(architectureRenderer, /li==uLocalShadowIndex\?propFlashShadow/, 'the selected practical shadows architecture');
assert.match(architectureRenderer, /architecturalLightVisibility\(posM,uLocalLightPos\[li\]\.xyz\)/, 'bounded floorplan occlusion gates practical light');
const stageAudio = mainSource.slice(mainSource.indexOf('function onStairAnomalyStage'), mainSource.indexOf('function syncStairAnomalyRender'));
assert.doesNotMatch(stageAudio, /REC\.emitNoise|PRES\./, 'environmental echoes never create player-generated HUSH events');
assert.match(mainSource, /blocksInput:true,blocksWorld:false,tracksMotion:true/, 'attention holds preserve buffered movement intent');

console.log('stair anomaly state/runtime tests passed');
