import assert from 'node:assert/strict';

import { CELL } from '../src/data/floorplan/legend.js';
import {
  SOURCE_HAYSTACK,
  hallRainFrame,
  haystackFearFrame,
  haystackMovementMultiplier,
  haystackMoshFrame,
  haystackPageGuidance,
  haystackPressure,
  haystackPressureFloor,
  haystackRainFrame,
  sourceFocusActionLabel,
} from '../src/game/source-haystack.js';
import { freshChunkSurfState, normalizeChunkSurfState, reduceChunkSurf } from '../src/game/chunk-surf-state.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

const apply = (state, type, details = {}) => reduceChunkSurf(state, { type, ...details });
function haystackState(slot = 0) {
  let state = freshChunkSurfState({ seed: 4417, returnPoint: { x: 8, y: 8, facing: 1 } });
  state = apply(state, 'SOURCE_ENTERED', { returnPoint: state.returnPoint });
  state = apply(state, 'HALL_ADVANCED', { distance: 112 });
  return apply(state, 'HAYSTACK_REACHED', { origin: { x: 0, y: -224 }, slot });
}

// The floor only rises. Temporary wrong-read impulses may decay, but the
// underlying authored pressure cannot ever reset during the search.
{
  const values = Array.from({ length: 121 }, (_, second) => haystackPressureFloor({
    elapsed: second,
    noProgressSeconds: second,
  }));
  assert.equal(values[0], SOURCE_HAYSTACK.entryPressure);
  for (let i = 1; i < values.length; i += 1) assert.ok(values[i] >= values[i - 1] - 1e-12);
  assert.ok(values.at(-1) > values[10]);

  for (const pressure of values) {
    const movement = haystackMovementMultiplier(pressure);
    assert.ok(movement >= 2.15 && movement <= 2.49);
  }
  assert.ok(haystackMovementMultiplier(values.at(-1)) > haystackMovementMultiplier(values[0]));
  assert.ok(haystackFearFrame(values.at(-1)).intervalMs < haystackFearFrame(values[0]).intervalMs);
}

// Rain is layered: there are real dry intervals and real hard fronts, including
// late in the haystack. Dry is not relief because pressure is tested separately.
{
  for (const seed of [1, 4417, 99173]) {
    const rain = [];
    for (let i = 0; i <= 120 * 30; i += 1) {
      rain.push(haystackRainFrame({ elapsed: i / 30, pressure: 0.97, seed }));
    }
    assert.ok(rain.some((value) => value <= 0.001), `seed ${seed} never produces a dry haystack interval`);
    assert.ok(rain.some((value) => value >= 0.70), `seed ${seed} never produces a hard haystack front`);
  }
  assert.equal(hallRainFrame({ elapsed: 8, distanceMetres: 0, seed: 4417 }), 0, 'rain reaches the mouth of the hall immediately');
}

// Micro-datamosh is an attack language, not a permanent filter, and Reduced
// Motion removes it completely rather than merely reducing its displacement.
{
  const early = haystackMoshFrame({ elapsed: 4, pressure: 0.8, seed: 4417 });
  assert.equal(early.active, false);
  const full = [];
  const reduced = [];
  for (let i = 0; i <= 90 * 60; i += 1) {
    const elapsed = i / 60;
    const pressure = haystackPressure({ elapsed, noProgressSeconds: elapsed });
    full.push(haystackMoshFrame({ elapsed, pressure, seed: 4417 }));
    reduced.push(haystackMoshFrame({ elapsed, pressure, seed: 4417, reducedMotion: true }));
  }
  assert.ok(full.some((frame) => frame.active && frame.amount > 0.1), 'haystack never develops a datamosh attack');
  const earlyPeak = Math.max(...full.slice(6 * 60, 30 * 60).map((frame) => frame.amount));
  const latePeak = Math.max(...full.slice(45 * 60).map((frame) => frame.amount));
  assert.ok(latePeak > earlyPeak, 'late haystack mosh attacks are not stronger than early attacks');
  assert.ok(full.some((frame) => !frame.active), 'datamosh became a permanent filter');
  assert.ok(reduced.every((frame) => !frame.active && frame.amount === 0), 'Reduced Motion still receives micro-datamosh');

  const base = haystackMoshFrame({ elapsed: 20, pressure: 0.78, seed: 4417, wrongReadImpulse: 0 });
  const wrong = haystackMoshFrame({ elapsed: 20, pressure: 0.78, seed: 4417, wrongReadImpulse: 0.8 });
  assert.ok(wrong.amount > base.amount, 'reading a wrong note does not intensify perceptual pressure');
}

// Guidance is local to the page and respects hint/flash policy.
{
  assert.equal(haystackPageGuidance({ hints: 'off' }).visible, true);
  const reduced = haystackPageGuidance({ hints: 'reduced', flash: 'off', noProgressSeconds: 30, time: 1 });
  assert.equal(reduced.visible, true);
  assert.ok(reduced.strength > 0);
  assert.equal(sourceFocusActionLabel({ kind: 'haystack-page' }), 'TAKE THE STILL PAGE');
}

// Runtime integration: the still page is waypointed and strongly selectable.
// The haystack is bracketed by HUSH manifestations, not a contact chase.
{
  const runtime = createSourceSpaceRuntime({ initialState: haystackState(0) });
  const objective = runtime.sourceObjective();
  assert.equal(objective.id, 'still-page');
  assert.ok(objective.bearing, 'the still page has no Source waypoint bearing');
  assert.ok(Number.isFinite(objective.distanceMeters));

  const target = objective.target;
  const focus = runtime.focusAt(target.x, target.y + 4, 0);
  assert.equal(focus?.kind, 'haystack-page', 'the real page loses a legitimate focus tie');
  const offAxis = runtime.focusAt(target.x, target.y + 4, 1);
  assert.notEqual(offAxis?.kind, 'haystack-page', 'the real page steals focus while off-axis');

  let hush = runtime.hushMode();
  assert.equal(hush.haystackHunt, true);
  assert.equal(hush.bracketActive, true);
  assert.equal(hush.mode, 'atmospheric');
  assert.equal(hush.colliding, false, 'HAYSTACK bracket can still resolve physical contact');

  const attempts = runtime.state().attempts;
  const checkpoint = runtime.handleHushContact();
  assert.equal(checkpoint.x, 0);
  assert.equal(checkpoint.y, -219);
  assert.equal(runtime.state().attempts, attempts, 'non-contact bracket increments catch attempts');
}


// State persistence uses the phase itself as truth: old haystack saves that still
// point at hall-entry repair to the new local checkpoint without a schema bump.
{
  const old = haystackState(1);
  const legacy = { ...old, checkpointId: 'hall-entry', checkpoint: { id: 'hall-entry', facing: 0 } };
  const normalized = normalizeChunkSurfState(legacy);
  assert.equal(normalized.checkpointId, 'haystack-entry');
  assert.equal(normalized.checkpoint.id, 'haystack-entry');
}

// Real page motion and presentation are independently legible from the decoys.
{
  const runtime = createSourceSpaceRuntime({ initialState: haystackState(3) });
  const a = runtime.propInstances(0, -224, { time: 10, objectiveHints: 'full', flashMode: 'full' });
  const b = runtime.propInstances(0, -224, { time: 11, objectiveHints: 'full', flashMode: 'full' });
  const realA = a.find((entry) => entry.interactiveId === 'source-page');
  const realB = b.find((entry) => entry.interactiveId === 'source-page');
  assert.ok(realA && realB);
  assert.deepEqual([...realA.matrix], [...realB.matrix], 'the still page is moving');
  assert.ok(Array.isArray(realA.emissive) && realA.emissive[3] > 0, 'the real page has no object-local guidance');

  const fakeA = a.find((entry) => entry.id === 'source-sheet-1');
  const fakeB = b.find((entry) => entry.id === 'source-sheet-1');
  assert.ok(fakeA && fakeB);
  assert.notDeepEqual([...fakeA.matrix], [...fakeB.matrix], 'full-motion decoy pages no longer flutter');

  const off = runtime.propInstances(0, -224, { time: 10, objectiveHints: 'off', flashMode: 'off' })
    .find((entry) => entry.interactiveId === 'source-page');
  assert.ok(Array.isArray(off.emissive) && off.emissive[3] >= 0.24, 'the real page loses its intrinsic waypoint identity when hints are off');
}

// Opening a decoy does not stop the authored runtime. The wrong read adds an
// impulse immediately; five seconds later, elapsed/stall pressure has continued.
{
  const runtime = createSourceSpaceRuntime({ initialState: haystackState(2) });
  const sheets = runtime.propInstances(0, -224, { time: 10 });
  let picked = null;
  for (const sheet of sheets) {
    const match = /^source-sheet-(\d+)$/.exec(sheet.id || '');
    if (!match || Number(match[1]) % 5 < 3) continue;
    const x = sheet.matrix[12] / CELL;
    const y = sheet.matrix[14] / CELL;
    const focus = runtime.focusAt(x, y + 1.25, 0);
    if (focus?.kind === 'source-sheet') { picked = { x, y }; break; }
  }
  assert.ok(picked, 'could not establish a readable decoy focus for the pressure test');
  const before = runtime.pressureFrame();
  const result = runtime.inspectFocused(picked.x, picked.y + 1.25, 0);
  assert.equal(result.event, 'page-read');
  const afterRead = runtime.pressureFrame();
  assert.equal(afterRead.wrongReads, 1);
  assert.ok(afterRead.pressure > before.pressure, 'wrong-page read adds no pressure impulse');
  runtime.tick(5, { px: picked.x, py: picked.y + 1.25, facing: 0 });
  const afterWait = runtime.pressureFrame();
  assert.ok(afterWait.elapsed >= 5, 'runtime time stops while the player is reading');
  assert.ok(afterWait.pressure > before.pressure, 'haystack pressure did not keep rising while reading');
  assert.equal(runtime.hushMode().haystackHunt, true);
}

// Committing the real page synchronously moves to protected TRANSFORMING before
// another HUSH contact can resolve.
{
  const runtime = createSourceSpaceRuntime({ initialState: haystackState(0) });
  const target = runtime.sourceObjective().target;
  assert.equal(runtime.hushMode().colliding, false);
  assert.equal(runtime.hushMode().bracketActive, true);
  const result = runtime.inspectFocused(target.x, target.y + 3, 0);
  assert.equal(result.event, 'page-found');
  assert.equal(runtime.state().phase, 'transforming');
  assert.equal(runtime.hushMode().colliding, false);
  assert.equal(runtime.hushMode().protected, true);
  assert.equal(runtime.pressureFrame().rain, 1, 'landing rain begins beneath the physical-to-Source transition');
  assert.equal(runtime.pressureFrame().mosh.active, false);
}

console.log('source haystack specs passed');
