import assert from 'node:assert/strict';
import {
  CHUNK_SURF_SOURCE_ATLAS,
  chunkSurfPortalModel,
  chunkSurfSector,
  chunkSurfVisualModel,
  validateChunkSurfAtlas,
} from '../src/game/chunk-surf-visual.js';
import {
  CHUNK_SURF_FLAGS,
  CHUNK_SURF_ROOMS,
} from '../src/data/chunk-surf-script.js';
import {
  createChunkSurfState,
  tuneChunkSurf,
} from '../src/game/chunk-surf-state.js';
import { makeChunkSurfScene } from '../src/game/chunk-surf-scene.js';

const finite = (value) => Number.isFinite(Number(value));

assert.equal(validateChunkSurfAtlas(CHUNK_SURF_SOURCE_ATLAS).ok, true, 'generated atlas validates');
assert.equal(CHUNK_SURF_SOURCE_ATLAS.stats.sectors, CHUNK_SURF_ROOMS.length, 'atlas maps every chunk-surf room');
for (const room of CHUNK_SURF_ROOMS) {
  const sector = chunkSurfSector(room.id);
  assert.ok(sector.sourceLines.length >= 8, `${room.id} has literal source lines`);
  assert.ok(sector.sourceLines.some((line) => line.file.startsWith('src/')), `${room.id} points at source files`);
  assert.doesNotMatch(JSON.stringify(sector.sourceLines), /\b(Floor|Wall)\b/, `${room.id} does not use fallback world labels`);
}
assert.doesNotMatch(JSON.stringify(CHUNK_SURF_SOURCE_ATLAS), /https?:\/\//i, 'atlas does not leak URLs');
assert.doesNotMatch(JSON.stringify(CHUNK_SURF_SOURCE_ATLAS), /\/Users\//, 'atlas does not leak local machine paths');
assert.doesNotMatch(JSON.stringify(CHUNK_SURF_SOURCE_ATLAS), /\b(process\.env|import\.meta\.env)\b/, 'atlas does not leak env reads');

for (const viewport of [{ width: 640, height: 360 }, { width: 1920, height: 1080 }]) {
  const state = { ...createChunkSurfState(), roomId: 'recordist-loop', visited: ['approach', 'fork-room', 'recordist-loop'], facing: 'east' };
  const model = chunkSurfVisualModel({ state, viewport, time: 4.25 });
  assert.equal(model.viewport.width, viewport.width);
  assert.equal(model.viewport.height, viewport.height);
  assert.ok(model.floor.length >= 20, 'floor is source-code geometry');
  assert.ok(model.leftWall.length > 0 && model.rightWall.length > 0, 'side walls exist');
  assert.ok(model.towers.length > 0, 'function towers exist');
  for (const item of [...model.floor, ...model.leftWall, ...model.rightWall, ...model.towers, ...model.portals]) {
    assert.ok(finite(item.x) && finite(item.y), 'projected geometry is finite');
    assert.ok(item.x > -viewport.width && item.x < viewport.width * 2, `x in broad viewport bounds: ${item.x}`);
    assert.ok(item.y > -viewport.height && item.y < viewport.height * 2, `y in broad viewport bounds: ${item.y}`);
  }
  assert.ok(model.forwardPortal, 'wayfinding exposes a forward/primary portal');
  assert.ok(model.portals.every((portal) => portal.label.includes('::')), 'portals use source anchors');
}

{
  const base = { ...createChunkSurfState(), roomId: 'fork-room', visited: ['approach', 'fork-room'] };
  const cold = chunkSurfVisualModel({ state: base, viewport: { width: 1280, height: 720 } });
  const tunedState = tuneChunkSurf(base);
  const tuned = chunkSurfVisualModel({ state: tunedState, viewport: { width: 1280, height: 720 } });
  assert.equal(cold.status.tuned, false);
  assert.equal(tuned.status.tuned, true);
  assert.equal(tuned.status.hasFork, true);
  assert.notEqual(cold.status.tone, tuned.status.tone);
}

{
  const state = { ...createChunkSurfState(), roomId: 'final-page', facing: 'east', hasFork: true, tuned: ['body-room'], visited: ['approach', 'fork-room', 'recordist-loop', 'body-room', 'final-page'] };
  const model = chunkSurfVisualModel({ state, viewport: { width: 1280, height: 720 }, redactionIndex: 1 });
  assert.deepEqual(model.finalChoices.map((choice) => choice.id), ['comfort', 'body', 'source']);
  assert.equal(model.finalChoices[1].selected, true);
  assert.ok(model.finalChoices[1].sourceText.length > 0, 'final redaction choices are backed by source text');
}

{
  const state = createChunkSurfState();
  const portals = chunkSurfPortalModel(state);
  assert.ok(portals.some((portal) => portal.kind === 'forward' && portal.target === 'fork-room'));
  assert.ok(portals.some((portal) => portal.kind === 'left' && portal.target === 'surfer-origin'));
  assert.ok(portals.some((portal) => portal.kind === 'right' && portal.target === 'work-order-loop'));
}

{
  const seen = [];
  const scene = makeChunkSurfScene({
    drankCoffee: true,
    hasRig: true,
    endingsSeen: ['sacrifice', 'inversion'],
    onScare: (scare) => seen.push(['scare', scare.reason]),
    onComplete: (completion) => seen.push(['complete', completion]),
  });
  scene.key({ key: 'ArrowDown' });
  assert.deepEqual(seen[0], ['scare', 'turned-back']);
  scene.update(1.2);
  assert.equal(scene.view().roomId, 'approach', 'scare returns to approach');
}

{
  const seen = [];
  const scene = makeChunkSurfScene({
    drankCoffee: true,
    hasRig: true,
    endingsSeen: ['sacrifice', 'inversion'],
    onComplete: (completion) => seen.push(completion),
  });
  for (const key of [
    'w', 'f', 'w', 'f', 'd', 'w', 'f', 'r',
    'd', 'w', 'f', 'a', 'w', 'w', 'f', 'a', 'w', 'd', 'w', 'f',
    'ArrowDown', 'Enter',
  ]) scene.key({ key });
  assert.equal(seen.length, 1, 'scene emits completion once');
  assert.equal(seen[0].completed, true);
  assert.equal(seen[0].bestEligible, true);
  assert.ok(seen[0].flags.includes(CHUNK_SURF_FLAGS.correctRedaction));
}

console.log('chunk-surf visual specs passed');
