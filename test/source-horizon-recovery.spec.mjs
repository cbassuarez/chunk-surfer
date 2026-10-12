// Continuous unravelling removes the former image-edge reset. These checks use
// accepted body movement and real route transitions, not a synthetic fall flag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL } from '../src/data/floorplan/legend.js';
import { SOURCE_HORIZON, SOURCE_CHAPEL_OUTSKIRTS } from '../src/data/source-level.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { normalizeChunkSurfState, reduceChunkSurf } from '../src/game/chunk-surf-state.js';
import { advanceSourceUnravelling, normalizeSourceUnravelling, sourceUnravellingFrame } from '../src/game/source-unravelling.js';

function onTape(depth = 120, { eyes = 'returned', onState = () => {} } = {}) {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT, {
    seed: 4417, injuries: 0, hasRig: false, marbleEyes: eyes,
  });
  let completed = 0;
  const runtime = createSourceSpaceRuntime({ initialState: built.state, onState, onComplete: () => { completed++; } });
  const origin = built.state.landscapeOrigin;
  runtime.setPlayerPosition(built.position);
  assert.equal(runtime.completeNormalExit().handled, true);
  const position = { x: origin.x, y: origin.y + SOURCE_HORIZON.from - depth, facing: 0 };
  runtime.setPlayerPosition(position);
  return { runtime, origin, position, completed: () => completed };
}
function walk(runtime, from, target, step = .75) {
  const count = Math.ceil(Math.hypot(target.x - from.x, target.y - from.y) / step);
  let position = from;
  for (let i = 1; i <= count; i++) {
    const to = { x: from.x + (target.x - from.x) * i / count, y: from.y + (target.y - from.y) * i / count, facing: 0 };
    assert.equal(runtime.geometry.canStep(position.x, position.y, to.x, to.y).ok, true,
      `continuous supported movement at ${to.x},${to.y}`);
    runtime.onStep(position, to);
    position = to;
  }
  return position;
}

test('side exploration has a broad fixed floor and waiting at its outer edge never resets the body', () => {
  const { runtime, origin, position, completed } = onTape();
  const before = runtime.state();
  const band = runtime.horizonFrame().band;
  assert.ok(band.reach * CELL >= 100, 'the floor supports broad exploration');
  const side = walk(runtime, position, { ...position, x: origin.x + band.reach - 1 });
  const frame = runtime.horizonFrame();
  for (let i = 0; i < 600; i++) assert.equal(runtime.tickHorizon(.1), null);
  assert.equal(runtime.horizonFrame().lateral, side.x - origin.x);
  assert.equal(runtime.horizonFrame().depth, frame.depth);
  assert.equal(runtime.horizonFrame().falling, 0);
  assert.equal(runtime.state().phase, 'horizon');
  assert.equal(completed(), 0);
  assert.equal(runtime.state().attempts, before.attempts);
  assert.deepEqual(runtime.state().sourceContacts, before.sourceContacts);
  assert.equal(runtime.state().finale.route, null);
  assert.ok(runtime.geometry.cellAt(side.x, side.y));
  walk(runtime, side, position);
  assert.equal(runtime.horizonFrame().lateral, 0, 'a normal walk returns from the edge');
  for (const depth of [0, 50, 250, 500]) {
    const here = runtime.horizonBand(SOURCE_HORIZON.from - depth);
    assert.equal(here.centre, 0, 'tape mass drift never steers the floor');
    assert.equal(here.reach, band.reach);
  }
});

test('decay starts on the last 50 physical metres and live speech time advances it while pause freezes it', () => {
  let commits = 0;
  const { runtime, origin } = onTape(-110, { onState: () => { commits++; } });
  for (let i = 0; i < 600; i++) runtime.tickHorizon(.1);
  assert.equal(runtime.horizonFrame().unravelling.active, false, 'the earlier familiar street is intact');
  assert.equal(runtime.horizonFrame().unravelling.elapsedSeconds, 0);
  runtime.setPlayerPosition({ x: origin.x, y: origin.y + SOURCE_HORIZON.from + 80, facing: 0 });
  runtime.tickHorizon(.1);
  const initial = runtime.horizonFrame().unravelling;
  assert.equal(initial.active, true);
  const writesBeforeListening = commits;
  // A dialogue may block movement, but its live dt still ages this world.
  for (let i = 0; i < 600; i++) runtime.tickHorizon(.1);
  const listening = runtime.horizonFrame().unravelling;
  assert.ok(listening.amount > initial.amount);
  assert.ok(listening.elapsedSeconds > 60);
  assert.ok(commits - writesBeforeListening < 50, 'clock checkpoints are not frame-by-frame saves');
  for (let i = 0; i < 600; i++) runtime.tickHorizon(0);
  assert.deepEqual(runtime.horizonFrame().unravelling, listening, 'paused world has no live clock');
  const beforeLongFrame = listening.elapsedSeconds;
  runtime.tickHorizon(600);
  assert.ok(runtime.horizonFrame().unravelling.elapsedSeconds - beforeLongFrame <= .100001, 'suspension cannot spend ten minutes');
});

test('distance and time persist monotonically through retreat, normal save, and last committed save', () => {
  let committed;
  const { runtime, origin, position } = onTape(80, { onState: state => { committed = structuredClone(state); } });
  runtime.tickHorizon(.1);
  const near = runtime.horizonFrame().unravelling;
  const far = walk(runtime, position, { ...position, y: origin.y + SOURCE_HORIZON.from - 380 });
  for (let i = 0; i < 387; i++) runtime.tickHorizon(.1);
  const worn = runtime.horizonFrame().unravelling;
  assert.ok(worn.amount > near.amount);
  assert.ok(worn.street < near.street);
  const saved = runtime.state();
  assert.equal(saved.horizon.unravelling.elapsedSeconds, worn.elapsedSeconds, 'state snapshot retains the fractional local clock');
  for (const snapshot of [saved, committed]) {
    const loaded = createSourceSpaceRuntime({ initialState: snapshot });
    loaded.setPlayerPosition({ x: origin.x, y: origin.y + SOURCE_HORIZON.from + 60, facing: 0 });
    const restored = loaded.horizonFrame().unravelling;
    assert.equal(restored.amount, worn.amount, 'even the last checkpoint cannot resurrect a visibly erased sector');
    loaded.tickHorizon(.1);
    assert.ok(loaded.horizonFrame().unravelling.amount >= worn.amount);
    assert.equal(loaded.horizonFrame().unravelling.furthestMetres, worn.furthestMetres);
  }
  walk(runtime, far, position);
  assert.equal(runtime.horizonFrame().unravelling.amount, worn.amount);
  const lowered = reduceChunkSurf(saved, { type: 'HORIZON_UNRAVELLING_ADVANCED', unravelling: normalizeSourceUnravelling() });
  assert.equal(lowered.horizon.unravelling.amount, worn.amount, 'reducer cannot unwind durable deterioration');
  assert.ok(normalizeChunkSurfState({ ...saved, horizon: { ...saved.horizon, unravelling: undefined } }).horizon.unravelling.amount > 0,
    'old saves migrate their already-walked distance');
});

test('the same remembered street props and quiet anchors survive the seam, then stay erased after reload and retreat', () => {
  const { runtime, origin, position } = onTape(-110);
  const approaching = runtime.propInstances(position.x, position.y).filter(p => p.sourceStructure === 'street-remnant');
  const before = { x: origin.x, y: origin.y + SOURCE_HORIZON.from + 2 };
  runtime.setPlayerPosition(before);
  runtime.tickHorizon(.1);
  const street = runtime.propInstances(before.x, before.y).filter(p => p.sourceStructure === 'street-remnant');
  assert.deepEqual(street.map(p => p.id), approaching.map(p => p.id), 'onset wears existing scenery rather than popping new fragments into view');
  assert.ok(street.some(p => /lamp/.test(p.id)) && street.some(p => /road/.test(p.id)));
  assert.ok(runtime.outskirtsStreetFrame().beds.every(b => b.kind === 'lodge' && b.gain > 0 && b.gain <= .1));
  const after = walk(runtime, before, { ...before, y: origin.y + SOURCE_HORIZON.from - 2 });
  const crossed = runtime.propInstances(after.x, after.y).filter(p => p.sourceStructure === 'street-remnant');
  assert.deepEqual(crossed.map(p => p.id), street.map(p => p.id), 'crossing four cells causes no new-zone scenery replacement');
  assert.deepEqual(crossed.map(p => Array.from(p.matrix)), street.map(p => Array.from(p.matrix)), 'street objects stay in their physical world positions');
  assert.ok(runtime.outskirtsStreetFrame().beds.length > 0, 'last street hum carries into the recording');
  const floorBefore = runtime.geometry.cellAt(before.x, before.y).floor;
  assert.equal(runtime.geometry.cellAt(after.x, after.y).floor, floorBefore);
  assert.ok(!runtime.propInstances(after.x, after.y).some(p => /end-last-(guide|rail|service-stop)/.test(p.id)), 'the old funnel no longer blocks the seam');
  const partial = walk(runtime, after, { ...after, y: origin.y + SOURCE_HORIZON.from - 110 });
  const remaining = runtime.propInstances(partial.x, partial.y).filter(p => p.sourceStructure === 'street-remnant');
  assert.ok(remaining.length > 0 && remaining.length < street.length, 'familiar pieces disappear at distinct retained thresholds');
  const reached = walk(runtime, partial, { ...after, y: origin.y + SOURCE_HORIZON.from - 440 });
  assert.ok(runtime.horizonFrame().unravelling.amount >= .7);
  assert.equal(runtime.takeHorizonMarker(), 'street-unravels');
  assert.equal(runtime.takeHorizonMarker(), 'street-erased');
  const loaded = createSourceSpaceRuntime({ initialState: runtime.state() });
  loaded.setPlayerPosition(after);
  loaded.tickHorizon(.1);
  assert.equal(loaded.propInstances(after.x, after.y).filter(p => p.sourceStructure === 'street-remnant').length, 0);
  assert.equal(loaded.outskirtsStreetFrame().beds.length, 0);
  assert.equal(loaded.takeHorizonMarker(), null, 'durable marker receipts prevent repeated lines');
  assert.ok(runtime.geometry.cellAt(reached.x, reached.y), 'loss removes the picture rather than the dependable floor');
});

test('road mesh footprints overlap throughout the final approach and first 50 metres of the recording', () => {
  const { runtime, origin, position } = onTape(-110);
  const seamZ = (origin.y + SOURCE_HORIZON.from + .5) * CELL;
  const roads = runtime.propInstances(position.x, position.y).filter(p => /source-street-remnant:road:/.test(p.id));
  const intervals = roads.map(piece => {
    const { min, max } = PROP_BOUNDS[piece.mesh];
    const depths = [];
    for (const x of [min[0], max[0]]) for (const z of [min[2], max[2]]) {
      depths.push(seamZ - (piece.matrix[2] * x + piece.matrix[10] * z + piece.matrix[14]));
    }
    return [Math.min(...depths), Math.max(...depths)];
  }).sort((a, b) => a[0] - b[0]);
  assert.ok(intervals[0][0] <= -110);
  assert.ok(intervals.at(-1)[1] >= 50);
  for (let i = 1; i < intervals.length; i++) assert.ok(intervals[i][0] <= intervals[i - 1][1], 'adjacent asphalt fragments overlap along the physical walking axis');
});

test('depletion and camera gait carry across onset and the old seam, then settle gradually and durably', () => {
  const { runtime, origin, position } = onTape(-100.2);
  const sample = () => ({ losing: runtime.outskirtsLosing(),
    pace: runtime.pressureFrame({ time: 1.3 }).movementMultiplier,
    body: runtime.outskirtsBodyFrame({ time: 1.3 }),
  });
  const road = sample();
  const onset = walk(runtime, position, { ...position, y: origin.y + SOURCE_HORIZON.from + 99.8 });
  const started = sample();
  assert.equal(started.losing, road.losing, 'first decay onset preserves the actual road depletion');
  assert.equal(started.pace, road.pace);
  assert.equal(started.body.sway, road.body.sway);
  const before = walk(runtime, onset, { ...onset, y: origin.y + SOURCE_HORIZON.from + .2 });
  const near = sample();
  const crossed = walk(runtime, before, { ...before, y: origin.y + SOURCE_HORIZON.from - .2 });
  const through = sample();
  assert.ok(through.losing > .9, 'torch, breath, steps and recorder do not become clean at the former boundary');
  assert.ok(Math.abs(through.pace - near.pace) < .02, 'walking cadence does not switch gears at the seam');
  assert.ok(Math.abs(through.body.sway - near.body.sway) < .001);
  const early = walk(runtime, crossed, { ...crossed, y: origin.y + SOURCE_HORIZON.from - 110 });
  const settling = sample();
  assert.ok(settling.losing > 0 && settling.losing < through.losing, 'accrued depletion tapers over the early recording');
  assert.ok(Math.abs(settling.body.sway) > 0 && Math.abs(settling.body.sway) < Math.abs(through.body.sway));
  const calm = runtime.outskirtsBodyFrame({ time: 1.3, reducedMotion: true });
  for (const key of ['sway', 'eyeDropM', 'lurch', 'stumble']) assert.equal(calm[key], 0, 'reduced motion keeps every camera motion at zero');
  const settledPosition = walk(runtime, early, { ...early, y: origin.y + SOURCE_HORIZON.from - 260 });
  assert.equal(runtime.outskirtsLosing(), 0);
  assert.equal(runtime.outskirtsBodyFrame({ time: 1.3 }), null);
  assert.equal(runtime.pressureFrame({ time: 1.3 }).movementMultiplier, 3, 'the settled recording retains its authored pace');
  const loaded = createSourceSpaceRuntime({ initialState: runtime.state() });
  loaded.setPlayerPosition(before);
  assert.equal(loaded.outskirtsLosing(), 0, 'a reload and retreat cannot restart the settled depletion');
  assert.equal(loaded.outskirtsBodyFrame({ time: 1.3 }), null);
  for (let i = 0; i < 600; i++) runtime.tickHorizon(.1);
  assert.equal(runtime.horizonFrame().lateral, settledPosition.x - origin.x);
  assert.equal(runtime.horizonFrame().depth, SOURCE_HORIZON.from - (settledPosition.y - origin.y), 'sensory settling never moves the body');
});

test('straight walking defaults to chapel without the bust, including a wide lateral approach', () => {
  const { runtime, origin, position, completed } = onTape(450, { eyes: null });
  const side = walk(runtime, position, { ...position, x: origin.x + 100 });
  const end = walk(runtime, side, { ...side, y: origin.y + SOURCE_HORIZON.to - 4 });
  assert.equal(runtime.state().phase, 'chapel-outskirts');
  assert.equal(runtime.state().finale.route, 'chapel');
  assert.equal(runtime.state().finale.bust.decision, null);
  assert.ok(runtime.geometry.cellAt(end.x, end.y), 'phase change preserves support for the side explorer');
  assert.equal(completed(), 0, 'chapter continues on foot to the chapel door');
  walk(runtime, end, { x: origin.x, y: origin.y + SOURCE_CHAPEL_OUTSKIRTS.from - 8 });
});

test('the optional tower road still requires eyes and the explicit bust decision, then opens only by walking its path', () => {
  const denied = onTape(170, { eyes: null });
  denied.runtime.talkToHorizonBust();
  assert.equal(denied.runtime.takeHorizonBustDetour().handled, false);
  assert.equal(denied.runtime.decideHorizonBust(true).handled, false);
  const { runtime, origin, position } = onTape(168);
  for (let beat = 0; beat < 3; beat++) runtime.talkToHorizonBust();
  assert.equal(runtime.decideHorizonBust(true).decision, 'accepted');
  const opened = runtime.takeHorizonBustDetour();
  assert.equal(opened.pathOpened, true);
  assert.equal(runtime.horizonFrame().depth, 168, 'opening the route never moves the body');
  let from = position;
  for (const point of opened.path) from = walk(runtime, from, { x: origin.x + point.x, y: origin.y + point.y });
  assert.equal(runtime.state().phase, 'bells');
  assert.equal(runtime.state().finale.route, 'tower');
  assert.equal(runtime.state().profile.marbleEyes, 'returned');
});

test('very long listening is bounded visual loss with no death or failure threshold', () => {
  let clock = normalizeSourceUnravelling();
  for (let i = 0; i < 50000; i++) clock = advanceSourceUnravelling(clock, { metres: 256, dt: .1 });
  const frame = sourceUnravellingFrame(clock);
  assert.ok(frame.amount <= .96 && frame.amount > .9);
  assert.ok(frame.loss >= 0 && frame.loss <= 1);
  assert.ok(frame.splats > 0, 'some recorded residue can remain without a forced blackout');
  assert.equal(clock.elapsedSeconds > 4900, true);
  assert.equal('failure' in clock, false);
});
