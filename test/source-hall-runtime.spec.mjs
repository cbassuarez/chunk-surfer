import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CELL } from '../src/data/floorplan/legend.js';
import { SOURCE_HALL } from '../src/data/source-hall.js';
import { SOURCE_LANDING_PORTAL_LOCAL } from '../src/data/source-landing.js';
import { SOURCE_TIER_BY_ID } from '../src/data/source-level.js';
import { buildChunkSurfGodPreset } from '../src/game/chunk-surf-god.js';
import { CHUNK_SURF_PHASE, freshChunkSurfState, reduceChunkSurf } from '../src/game/chunk-surf-state.js';
import { createSourceSpaceRuntime, SOURCE_TRANSFORM_SECONDS } from '../src/game/source-space-runtime.js';

function hallState(distance = 0, seed = 4417) {
  let state = freshChunkSurfState({ seed, returnPoint: { x: 8, y: 8, facing: 1 } });
  state = reduceChunkSurf(state, { type: 'SOURCE_ENTERED', returnPoint: state.returnPoint });
  return reduceChunkSurf(state, { type: 'HALL_ADVANCED', distance });
}

function advanceTo(runtime, metres) {
  let from = { x: 0, y: -runtime.state().hallMaxDistance / CELL };
  for (let y = from.y - 1; y >= -metres / CELL; y -= 1) {
    const to = { x: 0, y };
    assert.equal(runtime.geometry.canStep(from.x, from.y, to.x, to.y).ok, true);
    runtime.onStep(from, to);
    runtime.tick(0, { px: to.x, py: to.y, facing: 0 });
    from = to;
  }
  return from;
}

function sheets(runtime) {
  return runtime.propInstances(0, 0, { time: 10, reducedMotion: true })
    .filter(prop => /^source-sheet-\d+$/.test(prop.id));
}

function readableDecoy(runtime) {
  for (const sheet of runtime.readablePagesProbe()) {
    const body = { x: sheet.x, y: sheet.y + 2, facing: 0 };
    const focus = runtime.focusAt(body.x, body.y, body.facing);
    if (focus?.kind === 'source-sheet' && focus.id === sheet.id) return { sheet, body };
  }
  throw new Error('No readable decoy acquired normal interaction focus');
}

test('hall progress preserves existing paper addresses and printed stages', () => {
  const runtime = createSourceSpaceRuntime({ initialState: hallState() });
  const initial = new Map(sheets(runtime).map(prop => [prop.id, {
    matrix: [...prop.matrix], paperIndex: prop.paperIndex,
  }]));
  assert.ok(initial.size > 100, 'the comparison must cover the physical paper field');
  for (const depth of [40, 70, 96, 112]) {
    advanceTo(runtime, depth);
    const current = new Map(sheets(runtime).map(prop => [prop.id, prop]));
    for (const [id, original] of initial) {
      assert.ok(current.has(id), `${id} vanished after advancing to ${depth}m`);
      assert.deepEqual([...current.get(id).matrix], original.matrix, `${id} moved with maximum hall progress`);
      assert.equal(current.get(id).paperIndex, original.paperIndex, `${id} changed printed document stage`);
    }
    for (const page of runtime.readablePagesProbe()) {
      const prop = current.get(page.id);
      assert.ok(prop, `${page.id} has interaction without physical paper`);
      assert.ok(Math.abs(prop.matrix[12] / CELL - page.x) < 1e-5);
      assert.ok(Math.abs(prop.matrix[14] / CELL - page.y) < 1e-5);
      assert.ok(page.y >= -SOURCE_HALL.lengthMetres / CELL, 'an actionable sheet is past the body boundary');
    }
  }
});

test('the first form can be read and retains its early stage after a late return', () => {
  const runtime = createSourceSpaceRuntime({ initialState: hallState() });
  const first = runtime.readablePagesProbe().find(page => page.id === 'source-sheet-0');
  assert.ok(first, 'the isolated first form is scenery without a reading interaction');
  assert.equal(-first.y * CELL, 12);
  const body = { x: first.x, y: first.y + 3, facing: 0 };
  advanceTo(runtime, 96);
  runtime.setPlayerPosition(body);
  assert.equal(runtime.focusAt(body.x, body.y, body.facing)?.id, first.id);
  const result = runtime.inspectFocused(body.x, body.y, body.facing);
  assert.equal(result.event, 'page-read');
  assert.equal(result.page.stage, 0, 'returning after 96m rewrites the first form as deep-hall content');
  assert.ok(result.page.lines.length > 1, 'the readable form has no authored document body');
  const resumed = createSourceSpaceRuntime({ initialState: structuredClone(runtime.state()) });
  resumed.setPlayerPosition(body);
  const reread = resumed.inspectFocused(body.x, body.y, body.facing);
  assert.equal(reread.event, 'page-read');
  assert.equal(reread.page.id, result.page.id, 'a persisted physical form changes document on revisit');
});

test('every seeded still page is rendered, focused and taken from HALL before 112m', () => {
  for (let slot = 0; slot < 12; slot += 1) {
    const runtime = createSourceSpaceRuntime({ initialState: hallState(96, 4416 + slot) });
    const target = runtime.probe().realPage;
    assert.ok(target, `slot ${slot} is hidden until HAYSTACK`);
    const depth = -target.y * CELL;
    assert.ok(depth < SOURCE_HALL.lengthMetres);
    advanceTo(runtime, depth - 1.5);
    const body = { x: target.x, y: target.y + 3, facing: 0 };
    runtime.setPlayerPosition(body);
    assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.HALL);
    assert.ok(runtime.state().hallMaxDistance < SOURCE_HALL.lengthMetres);
    assert.ok(runtime.propInstances(body.x, body.y).some(prop => prop.id === 'source-sheet-interactive'));
    assert.equal(runtime.focusAt(body.x, body.y, body.facing)?.kind, 'haystack-page');
    assert.equal(runtime.inspectFocused(body.x, body.y, body.facing).event, 'page-found');
    runtime.commitStillPageReveal();
    assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.TRANSFORMING);
    assert.ok(runtime.geometry.cellAt(body.x, body.y), 'the early hinge leaves the body outside the new physical room');
    assert.equal(runtime.hushMode().colliding, false);
    runtime.tick(SOURCE_TRANSFORM_SECONDS, { px: body.x, py: body.y, facing: body.facing });
    assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.LANDSCAPE);
    assert.ok(runtime.geometry.cellAt(body.x, body.y), 'completing the early transition deletes ground under the body');
  }
});

test('low wind paper leaves the still-page patch clear in both motion modes', () => {
  let upperWeatherOverPatch = 0;
  for (let slot = 0; slot < 12; slot += 1) {
    for (const preset of ['hall-storm', 'haystack']) {
      const built = buildChunkSurfGodPreset(preset, { seed: 4416 + slot });
      const runtime = createSourceSpaceRuntime({ initialState: built.state });
      const target = runtime.probe().realPage;
      const body = { x: target.x, y: target.y + 3, facing: 0 };
      runtime.setPlayerPosition(body);
      for (const reducedMotion of [false, true]) {
        for (const time of [0, 5, 13]) {
          const wind = runtime.propInstances(body.x, body.y, { time, reducedMotion })
            .filter(prop => prop.semantic === 'source-wind-paper');
          assert.ok(wind.length > 0, `${preset} slot ${slot} lost all weather in motion mode ${reducedMotion}`);
          for (const paper of wind) {
            const distance = Math.hypot(paper.matrix[12] - target.x * CELL, paper.matrix[14] - target.y * CELL);
            if (paper.matrix[13] < 1) {
              // Protect a physical loose-note footprint as well as its centre.
              assert.ok(distance > SOURCE_HALL.stillPatchRadius + .28,
                `${paper.id} covers the low still-page patch (${preset}, slot ${slot}, time ${time}, reduced ${reducedMotion})`);
            } else if (distance <= SOURCE_HALL.stillPatchRadius) {
              upperWeatherOverPatch += 1;
            }
          }
        }
      }
    }
  }
  assert.ok(upperWeatherOverPatch > 0, 'clearing the low patch mistakenly removes the weather column above it too');
});

test('the retained rear hall stays behind the body when the early page builds Scene Dock', () => {
  for (const seed of [4416, 4421, 4427]) {
    const runtime = createSourceSpaceRuntime({ initialState: hallState(96, seed) });
    const target = runtime.probe().realPage;
    const body = { x: target.x, y: target.y + 3, facing: 0 };
    runtime.setPlayerPosition(body);
    const before = new Map(runtime.propInstances(body.x, body.y, { time: 10, reducedMotion: true })
      .filter(prop => /^source-hall|^source-sheet-\d+$/.test(prop.id))
      .map(prop => [prop.id, [...prop.matrix]]));
    assert.equal(runtime.inspectFocused(body.x, body.y, body.facing).event, 'page-found');
    runtime.commitStillPageReveal();
    for (const phase of [CHUNK_SURF_PHASE.TRANSFORMING, CHUNK_SURF_PHASE.LANDSCAPE]) {
      assert.equal(runtime.state().phase, phase);
      assert.equal(runtime.state().firstLiftCompleted, false);
      const props = runtime.propInstances(body.x, body.y, { time: 10, reducedMotion: true });
      const rear = props.filter(prop => /^source-hall|^source-sheet-\d+$/.test(prop.id));
      assert.ok(rear.length > 0, 'the room transition deletes all evidence of the hall behind the body');
      for (const prop of rear) {
        assert.ok(prop.matrix[14] > body.y * CELL, `${prop.id} leaks into Scene Dock ahead of its rear threshold`);
        assert.deepEqual([...prop.matrix], before.get(prop.id), `${prop.id} is relocated to fabricate the rear hall`);
      }
      assert.ok(!props.some(prop => prop.id === 'source-sheet-interactive'), 'taking the real page leaves another real page in the room');
      assert.ok(!props.some(prop => prop.semantic === 'source-wind-paper'), 'the hall paper swarm follows the body into Scene Dock');
      if (phase === CHUNK_SURF_PHASE.TRANSFORMING) runtime.tick(SOURCE_TRANSFORM_SECONDS, { px: body.x, py: body.y, facing: body.facing });
    }
  }
});

test('a stationary hall autosave restores search pressure and latched rain', () => {
  const persisted = [];
  const runtime = createSourceSpaceRuntime({ initialState: hallState(96), onState: state => persisted.push(structuredClone(state)) });
  const body = { x: 0, y: -96 / CELL, facing: 0 };
  runtime.setPlayerPosition(body);
  let frame;
  for (let second = 0; second < 65; second += 1) {
    runtime.tick(1, { px: body.x, py: body.y, facing: body.facing });
    frame = runtime.pressureFrame();
  }
  assert.equal(frame.rainLatched, true);
  assert.ok(frame.searchElapsed >= 60 && frame.standingPressure > .9);
  // Persist after the pressure frame has latched a weather front.
  runtime.tick(1, { px: body.x, py: body.y, facing: body.facing });
  assert.ok(persisted.length > 0, 'standing still never stores the continuous hall experience');
  const saved = persisted.at(-1);
  assert.equal(saved.hallExperience.rainLatched, true);
  assert.ok(saved.hallExperience.searchElapsed >= 60);
  assert.ok(saved.hallExperience.pressure > .9);
  const resumed = createSourceSpaceRuntime({ initialState: saved });
  resumed.setPlayerPosition(body);
  const restored = resumed.pressureFrame();
  assert.equal(restored.searchElapsed, saved.hallExperience.searchElapsed);
  assert.ok(restored.standingPressure >= frame.standingPressure);
  assert.equal(restored.rainLatched, true);
  assert.ok(restored.rain > 0, 'reload buys a dry phase before the first new rain pulse');
  resumed.tick(2, { px: 0, py: -20 / CELL, facing: 2 });
  assert.ok(resumed.pressureFrame().standingPressure >= restored.standingPressure, 'retreat after reload resets the floor');
});

test('rereading one assigned decoy cannot farm wrong-read pressure, even after reload', () => {
  const runtime = createSourceSpaceRuntime({ initialState: hallState(96) });
  const { body } = readableDecoy(runtime);
  runtime.setPlayerPosition(body);
  const first = runtime.inspectFocused(body.x, body.y, body.facing);
  assert.equal(first.event, 'page-read');
  const firstPressure = runtime.pressureFrame();
  assert.equal(firstPressure.wrongReads, 1);
  assert.ok(firstPressure.wrongReadImpulse > 0);
  const second = runtime.inspectFocused(body.x, body.y, body.facing);
  assert.equal(second.page.id, first.page.id);
  assert.equal(runtime.pressureFrame().wrongReads, firstPressure.wrongReads);
  assert.equal(runtime.pressureFrame().wrongReadImpulse, firstPressure.wrongReadImpulse);
  assert.equal(runtime.pressureFrame().pressure, firstPressure.pressure);
  runtime.tick(.5, { px: body.x, py: body.y, facing: body.facing });
  const decayed = runtime.pressureFrame().wrongReadImpulse;
  runtime.inspectFocused(body.x, body.y, body.facing);
  assert.equal(runtime.pressureFrame().wrongReadImpulse, decayed, 'rereading renews an impulse that had already decayed');
  const resumed = createSourceSpaceRuntime({ initialState: structuredClone(runtime.state()) });
  resumed.setPlayerPosition(body);
  assert.equal(resumed.inspectFocused(body.x, body.y, body.facing).page.id, first.page.id);
  assert.equal(resumed.pressureFrame().wrongReads, 0, 'a persisted assignment is counted as a new wrong read');
  assert.equal(resumed.pressureFrame().wrongReadImpulse, 0);
});

test('runtime cell cadence describes a fifty-second walk rather than the generic speed cap', () => {
  const runtime = createSourceSpaceRuntime({ initialState: hallState() });
  let elapsedMs = 0, previousInterval = 0;
  let from = { x: 0, y: 0 };
  for (let y = -1; y >= -SOURCE_HALL.lengthMetres / CELL; y -= 1) {
    const frame = runtime.pressureFrame();
    assert.ok(Number.isFinite(frame.cellIntervalMs) && frame.cellIntervalMs > 120,
      'the authored runtime does not supply a duration above the ordinary movement cap');
    assert.ok(frame.cellIntervalMs >= previousInterval, 'progress unexpectedly accelerates the legs');
    elapsedMs += frame.cellIntervalMs;
    previousInterval = frame.cellIntervalMs;
    const to = { x: 0, y };
    runtime.onStep(from, to);
    runtime.tick(0, { px: to.x, py: to.y, facing: 0 });
    from = to;
  }
  assert.ok(elapsedMs > 49000 && elapsedMs < 51000, `authored crossing is ${elapsedMs / 1000}s`);
  assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.HAYSTACK);
  assert.ok(runtime.pressureFrame().cellIntervalMs >= previousInterval, 'missing the page releases the walking pressure');
});

test('physical torch profiles follow the hall, shore and Source models without leaking into later outskirts', () => {
  for (const preset of ['hall-entry', 'hall-storm', 'haystack']) {
    const built = buildChunkSurfGodPreset(preset);
    const runtime = createSourceSpaceRuntime({ initialState: built.state });
    runtime.setPlayerPosition(built.position);
    const torch = runtime.sourceFlashlightFrame();
    assert.equal(torch.mode, 'normal', `${preset} retained the inverse Source cone`);
    assert.equal(torch.profile, 'hall');
    assert.equal(torch.xray, false);
    assert.equal(runtime.sourceEmergencyLightingFrame().active, false);
  }
  const built = buildChunkSurfGodPreset('landing');
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  const origin = runtime.state().landscapeOrigin;
  const portal = { x: origin.x + SOURCE_LANDING_PORTAL_LOCAL.x, y: origin.y + SOURCE_LANDING_PORTAL_LOCAL.y };
  runtime.setPlayerPosition({ x: portal.x, y: portal.y + 4, facing: 0 });
  assert.equal(runtime.sourceFlashlightFrame().mode, 'normal', 'Scene Dock inherited the hall exception incorrectly');
  assert.notEqual(runtime.sourceFlashlightFrame().profile, 'hall', 'the physical hall optical profile leaks into Scene Dock');
  runtime.setPlayerPosition({ x: portal.x, y: portal.y - 2, facing: 0 });
  assert.equal(runtime.sourceFlashlightFrame().mode, 'normal', 'the first nothingness retains a physical flashlight');
  assert.equal(runtime.sourceFlashlightFrame().profile, 'shore');
  const proper = createSourceSpaceRuntime({ initialState: { ...built.state, firstLiftCompleted: true } });
  const fork = SOURCE_TIER_BY_ID.fork;
  proper.setPlayerPosition({ x: origin.x + 30, y: origin.y + (fork.from + fork.to) / 2, facing: 0 });
  assert.equal(proper.sourceVoidFrame().proper, true,'the model-material fixture must be inside Source proper');
  assert.equal(proper.probe().divide.active, true, 'the fixture must stand on the actual Divide');
  assert.equal(proper.sourceFlashlightFrame().mode, 'normal', 'Source models must receive ordinary physical light');
  assert.notEqual(proper.sourceFlashlightFrame().profile, 'hall', 'the hall optical profile must end at its boundary');
  assert.equal(proper.sourceFlashlightFrame().profile, 'proper', 'Source models keep their own soft material beam');
  assert.equal(proper.sourceFlashlightFrame().xray, false, 'the torch cannot invert or reveal through Source model surfaces');
  const bells = createSourceSpaceRuntime({ initialState: { ...built.state, phase: CHUNK_SURF_PHASE.BELLS } });
  assert.equal(bells.sourceFlashlightFrame({ time: 50, reducedMotion: true, flashMode: 'off' }).mode, 'normal');
  assert.equal(bells.sourceFlashlightFrame({ time: 50, reducedMotion: true, flashMode: 'off' }).flicker, 1);
});
