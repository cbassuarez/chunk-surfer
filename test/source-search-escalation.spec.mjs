import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CELL } from '../src/data/floorplan/legend.js';
import { freshChunkSurfState } from '../src/game/chunk-surf-state.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import {
  SOURCE_HAYSTACK,
  SOURCE_SEARCH_START_METRES,
  haystackPageGuidance,
} from '../src/game/source-haystack.js';

const state = { ...freshChunkSurfState({ seed: 4417 }), active: true };
const runtime = createSourceSpaceRuntime({ initialState: state });

let from = { x: 0, y: 0 };
const searchY = -Math.ceil(SOURCE_SEARCH_START_METRES / CELL);
for (let y = -1; y >= searchY; y -= 1) {
  const to = { x: 0, y };
  runtime.onStep(from, to);
  runtime.tick(0.05, { ...to, facing: 0 });
  runtime.pressureFrame();
  from = to;
}

const searchHush = runtime.hushMode();
assert.equal(searchHush.searchActive, true);
assert.equal(searchHush.mode, 'atmospheric');
assert.equal(searchHush.colliding, false);

const boundaryY = -Math.ceil(112 / CELL);
for (let y = searchY - 1; y > boundaryY; y -= 1) {
  const to = { x: 0, y };
  runtime.onStep(from, to);
  runtime.tick(0.05, { ...to, facing: 0 });
  runtime.pressureFrame();
  from = to;
}
const before = runtime.pressureFrame();

const boundary = { x: 0, y: boundaryY };
runtime.onStep(from, boundary);
runtime.tick(0.05, { ...boundary, facing: 0 });
const after = runtime.pressureFrame();

assert.equal(runtime.state().phase, 'haystack');
assert.equal(runtime.hushMode().mode, 'atmospheric');
assert.equal(runtime.hushMode().bracketActive, true);
assert.equal(runtime.hushMode().colliding, false);
assert.ok(after.searchElapsed > before.searchElapsed, 'search clock must carry through HALL -> HAYSTACK');
assert.ok(after.pressure >= before.pressure, 'pressure may not release at the tunnel/haystack boundary');
assert.ok(after.movementMultiplier >= before.movementMultiplier, 'movement pressure may not release at the boundary');
assert.ok(after.fear.amount >= before.fear.amount, 'fear hit may not release at the boundary');
assert.ok(after.fear.intervalMs <= before.fear.intervalMs, 'fear cadence may not slow at the boundary');

// Once the first visible rain front arrives, it stays nonzero until the real page.
let rainStarted = false;
for (let frame = 0; frame < 900; frame += 1) {
  runtime.tick(0.1, { ...boundary, facing: 0 });
  const rain = runtime.pressureFrame().rain;
  if (rain > 0.001) rainStarted = true;
  if (rainStarted) assert.ok(rain > 0.001, `rain stopped after latching at frame ${frame}`);
}
assert.equal(rainStarted, true);

const props = runtime.propInstances(boundary.x, boundary.y, {
  time: 23,
  reducedMotion: false,
  objectiveHints: 'full',
  flashMode: 'full',
});
const wind = props.filter((entry) => entry.semantic === 'source-wind-paper');
const real = props.find((entry) => entry.id === 'source-sheet-interactive');
assert.ok(runtime.probe().pageCount >= 900, 'haystack needs a materially denser paper field');
assert.ok(wind.length >= 80, 'haystack needs a substantial wind-driven paper swarm');
assert.ok(real?.emissive, 'real page must carry waypoint material guidance');
assert.deepEqual(real.emissive.slice(0, 3), [1, 0.52, 0.12], 'real page must use the van waypoint orange');
assert.ok(real.emissive[3] >= 0.24, 'real page must remain materially distinct even at minimum guidance');

const guidance = haystackPageGuidance({ hints: 'off', flash: 'off', time: 0 });
assert.deepEqual(guidance.color, [1, 0.52, 0.12]);
assert.ok(guidance.visible && guidance.strength >= 0.24);

assert.ok(SOURCE_HAYSTACK.entryPressure > 0.62, 'haystack must enter above the terminal hall pressure');

// Static rendering contract: Source is special, but must no longer suppress the
// visible HUSH body card.
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(main, /hushBodySpaceAllowed\s*=\s*!usingSpecialSpace\(\)\|\|usingSourceSpace\(\)/);
assert.match(main, /hushBodyAllowed:!worldView\?\.suppressActors&&hushBodySpaceAllowed/);

console.log('source search escalation tests ok');
