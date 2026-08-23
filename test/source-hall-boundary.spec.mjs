import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CELL } from '../src/data/floorplan/legend.js';
import {
  CHUNK_SURF_PHASE,
  freshChunkSurfState,
  reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';
import {
  SOURCE_HALL_END_Y,
  createSourceSpaceRuntime,
} from '../src/game/source-space-runtime.js';
import {
  SOURCE_BRACKET,
  SOURCE_HALL_END_METRES,
  applySourceFearFloor,
  sourceBracketFrame,
  sourceStandingPressure,
} from '../src/game/source-haystack.js';

const apply = (state, type, details = {}) => reduceChunkSurf(state, { type, ...details });

function hallState(distance = SOURCE_HALL_END_METRES - 1) {
  let state = freshChunkSurfState({ seed: 4417, returnPoint: { x: 0, y: 0, facing: 0 } });
  state = apply(state, 'SOURCE_ENTERED', { returnPoint: state.returnPoint });
  state = apply(state, 'HALL_ADVANCED', { distance });
  return state;
}

function haystackState(slot = 0) {
  let state = hallState(SOURCE_HALL_END_METRES);
  state = apply(state, 'HAYSTACK_REACHED', { origin: { x: 0, y: SOURCE_HALL_END_Y }, slot });
  return state;
}

// BODY / EYE SEPARATION: 112m is physically final while the render plan keeps
// sampling a valid hall past it.
{
  const runtime = createSourceSpaceRuntime({ initialState: haystackState(0) });
  assert.ok(runtime.geometry.cellAt(0, SOURCE_HALL_END_Y), 'the physical endpoint itself disappeared');
  assert.equal(runtime.geometry.cellAt(0, SOURCE_HALL_END_Y - 1), null, 'playable hall extends past 112m');
  assert.ok(runtime.geometry.renderCellAt(0, SOURCE_HALL_END_Y - 80), 'visual hall does not continue beyond the physical line');

  const blocked = runtime.geometry.canStep(0, SOURCE_HALL_END_Y, 0, SOURCE_HALL_END_Y - 1);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.why, 'source-hall-boundary');
}

// Every possible real page and every actionable fake page remains on the player
// side. Decorative/wind pages are deliberately not constrained by this test.
{
  for (let slot = 0; slot < 12; slot += 1) {
    const runtime = createSourceSpaceRuntime({ initialState: haystackState(slot) });
    const target = runtime.sourceObjective().target;
    assert.ok(target.y >= SOURCE_HALL_END_Y, `still page slot ${slot} is beyond the physical boundary`);
    assert.ok(runtime.geometry.cellAt(target.x, target.y), `still page slot ${slot} is not on traversable ground`);
    for (const page of runtime.readablePagesProbe()) {
      assert.ok(page.y >= SOURCE_HALL_END_Y, `${page.id} is interactable in the visual-only continuation`);
    }
  }
}

// The rear manifestation follows the current player position; the front one is
// remembered by maximum progress and approaches the line monotonically.
{
  const distances = [84, 90, 96, 102, 108, 112];
  let previousFrontGap = Infinity;
  for (const hallMaxDistance of distances) {
    const player = { x: 1.25, y: -(hallMaxDistance / CELL) };
    const frame = sourceBracketFrame({ hallMaxDistance, player, cellMetres: CELL });
    assert.equal(frame.active, true);
    assert.ok(frame.rear.gapMetres >= SOURCE_BRACKET.rearGapEndMetres - 1e-9);
    assert.ok(frame.rear.gapMetres <= SOURCE_BRACKET.rearGapStartMetres + 1e-9);
    assert.ok(frame.rear.y > player.y, 'rear HUSH is not behind the player');

    if (frame.front.visible) {
      assert.ok(frame.front.y < frame.boundary.y, 'front HUSH crossed onto the playable side');
      assert.ok(frame.front.gapBeyondBoundaryMetres >= SOURCE_BRACKET.frontGapEndMetres - 1e-9);
      assert.ok(frame.front.gapBeyondBoundaryMetres <= previousFrontGap + 1e-9, 'front HUSH receded while progress increased');
      previousFrontGap = frame.front.gapBeyondBoundaryMetres;
    }
  }

  const reached = sourceBracketFrame({
    hallMaxDistance: SOURCE_HALL_END_METRES,
    player: { x: 0, y: SOURCE_HALL_END_Y },
    cellMetres: CELL,
  });
  assert.ok(Math.abs(reached.front.gapBeyondBoundaryMetres - 4.5) < 1e-9);

  const retreated = sourceBracketFrame({
    hallMaxDistance: SOURCE_HALL_END_METRES,
    player: { x: 0, y: SOURCE_HALL_END_Y + 16 },
    cellMetres: CELL,
  });
  assert.equal(retreated.front.y, reached.front.y, 'front HUSH retreats when the player retreats');
  assert.equal(retreated.rear.y - (SOURCE_HALL_END_Y + 16), reached.rear.y - SOURCE_HALL_END_Y,
    'rear HUSH does not keep its authored following gap');
}

// Runtime HUSH authority: SEARCH/HAYSTACK is atmospheric bracketing, never
// contact pursuit. Calling the contact handler defensively cannot spend an
// attempt or teleport the player.
{
  const runtime = createSourceSpaceRuntime({ initialState: haystackState(2) });
  runtime.setPlayerPosition({ x: 0, y: SOURCE_HALL_END_Y, facing: 0 });
  const mode = runtime.hushMode();
  assert.equal(mode.bracketActive, true);
  assert.equal(mode.mode, 'atmospheric');
  assert.equal(mode.colliding, false);
  const before = runtime.state().attempts;
  const checkpoint = runtime.handleHushContact();
  assert.equal(runtime.state().attempts, before);
  assert.deepEqual(checkpoint, runtime.checkpointPosition());
}

// Pressure is one monotonic floor. Distance, the HALL->HAYSTACK transition,
// retreat, and decaying transient attacks are not allowed to reduce it.
{
  let last = 0;
  for (let distance = 0; distance <= SOURCE_HALL_END_METRES; distance += 1) {
    const elapsed = Math.max(0, distance - 84) * 0.45;
    const value = sourceStandingPressure({ hallMaxDistance: distance, searchElapsed: elapsed });
    assert.ok(value >= last - 1e-12, `standing pressure fell at ${distance}m`);
    last = value;
  }

  const runtime = createSourceSpaceRuntime({ initialState: hallState(111) });
  runtime.setPlayerPosition({ x: 0, y: -222, facing: 0 });
  runtime.tick(4, { px: 0, py: -222, facing: 0 });
  const before = runtime.pressureFrame();
  runtime.onStep({ x: 0, y: -222 }, { x: 0, y: SOURCE_HALL_END_Y });
  runtime.tick(0.05, { px: 0, py: SOURCE_HALL_END_Y, facing: 0 });
  const after = runtime.pressureFrame();
  assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.HAYSTACK);
  assert.ok(after.standingPressure >= before.standingPressure, 'standing pressure released at HALL -> HAYSTACK');

  runtime.tick(6, { px: 0, py: SOURCE_HALL_END_Y + 20, facing: 2 });
  const retreated = runtime.pressureFrame();
  assert.ok(retreated.standingPressure >= after.standingPressure, 'retreat reduced standing pressure');
}

// Generic fear decay cannot push presentation below Source's authored floor.
{
  assert.equal(applySourceFearFloor(0.31, 0.62), 0.62);
  let fear = 0.9;
  for (let i = 0; i < 600; i += 1) {
    fear = applySourceFearFloor(Math.max(0, fear - 0.003), 0.62);
    assert.ok(fear >= 0.62);
  }
}

// Rendering contract: one SDF texture, two independently placed body cards.
// The secondary never creates a second gameplay HUSH field.
{
  const renderer = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(renderer, /uniform vec4\s+uHushBodySecondary/);
  assert.match(renderer, /uniform vec4\s+uHushBodyLookSecondary/);
  assert.match(renderer, /compositeHushBody\(uHushBody,uHushBodyLook/);
  assert.match(renderer, /compositeHushBody\(uHushBodySecondary,uHushBodyLookSecondary/);
  assert.equal((renderer.match(/let hushBodyTex=null/g) || []).length, 1, 'the physical and Text Space shaders must share one decoded SDF texture');
  assert.equal((renderer.match(/uniform sampler2D uHushBodyTex/g) || []).length, 2, 'both compositor programs declare the shared SDF sampler');
  assert.doesNotMatch(renderer, /uHush2\b/, 'secondary manifestation accidentally gained a second gameplay field');
  assert.match(main, /hushSecondary:renderedHushSecondary/);
  assert.match(main, /sourceBracketTableauActive/);
}

console.log('source hall boundary / HUSH bracket specs passed');
