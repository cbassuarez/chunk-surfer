import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ENDING_CUTSCENES, ENDING_MANIFEST } from '../src/data/endings.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import { ENDING_IDS } from '../src/progression/schema.js';
import { normalizeEndingCutsceneCheckpoint } from '../src/game/save.js';
import {
  advanceEndingCutscene,
  claimEndingCutsceneCompletion,
  createEndingCutsceneState,
  endingCutsceneCompletionId,
  endingCutsceneErrors,
  restartEndingCutscene,
} from '../src/game/ending-cutscene.js';
import {
  createDraggedPayloadState,
  draggedPayloadFollower,
  draggedPayloadStep,
  dropDraggedPayload,
  gripDraggedPayload,
} from '../src/game/dragged-payload.js';

for (const id of ENDING_IDS) {
  const spec = ENDING_CUTSCENES[id];
  assert.ok(spec, `${id} has a cutscene`);
  assert.equal(spec, ENDING_MANIFEST[id].cutscene, `${id} manifest owns the canonical cutscene`);
  assert.deepEqual(endingCutsceneErrors(spec), [], `${id} cutscene validates`);
  assert.equal(spec.finalHold.image, ENDING_MANIFEST[id].image, `${id} final image is truthful`);
  for (const beat of spec.beats) {
    for (const source of beat.dialogue || []) {
      const [documentId, lineId] = source.split('#');
      const document = JSON.parse(readFileSync(`content/narrative/${documentId}.story.json`, 'utf8'));
      const lines = Object.values(document.nodes || {}).flatMap((node) => node.lines || []);
      assert.ok(lines.some((line) => line.id === lineId), `${id} beat ${beat.id} reaches ${source}`);
    }
  }
}

assert.equal(new Set(ENDING_IDS.map((id) => ENDING_MANIFEST[id].image)).size, ENDING_IDS.length,
  'all nine endings hold on a unique embodied image');

for (const mesh of [
  'ending_body_prone',
  'ending_body_seated',
  'ending_van_cabin',
  'ending_van_cup',
  'ending_collapse_debris',
]) assert.ok(PROP_BOUNDS[mesh], `${mesh} exists in the generated prop pack`);

{
  const renderer = readFileSync('src/render/r3d.js', 'utf8');
  assert.match(renderer, /uniform float uEndingWorldLook/,
    'ending world looks reach the renderer rather than existing only as metadata');
  assert.match(renderer, /export function r3dSetEndingWorldLook/,
    'ending world looks have a scoped runtime setter');
  assert.match(renderer, /export function r3dSetMunicipalLightPower/,
    'the 06:00 sodium shutdown reaches the authored local-light rig');
}

assert.deepEqual(
  normalizeEndingCutsceneCheckpoint({ endingId: 'contact-won', arrival: 'agreed', cursor: 7 }),
  { schema: 1, endingId: 'contact-won', arrival: 'agreed' },
  'reload retains the terminal ending identity but deliberately discards partial beat state',
);
assert.equal(normalizeEndingCutsceneCheckpoint({ endingId: 'unknown', arrival: 'agreed' }), null);
{
  const runtime = readFileSync('src/main.js', 'utf8');
  assert.match(runtime, /resumeEndingCutsceneFromSave\(\).*resumeStairAnomalyFromSave\(\)/,
    'a terminal ending checkpoint outranks ordinary special-space restoration');
  assert.match(runtime, /saveCommit\(\{endingCutscene:null\}\)/,
    'the ending checkpoint is cleared after the return is committed');
}

// Time beats fire once, pause freezes their clock, reload restarts the scene,
// and normal completion uses the same transaction as a skip.
{
  const spec = ENDING_CUTSCENES['tower-lost'];
  let state = createEndingCutsceneState(spec);
  let result = advanceEndingCutscene(state, spec, { deltaMs: 0 });
  state = result.state;
  assert.deepEqual(result.events.map((event) => event.beat?.id).filter(Boolean), ['strike-one-breath']);

  result = advanceEndingCutscene(state, spec, { deltaMs: 3000, paused: true });
  assert.equal(result.state.elapsedMs, 0, 'pause does not advance cutscene time');
  assert.equal(result.events.length, 0);

  result = advanceEndingCutscene(result.state, spec, { elapsedMs: 3000, paused: false });
  state = result.state;
  assert.deepEqual(result.events.map((event) => event.beat?.id).filter(Boolean), ['strike-two-hands', 'strike-three-posture']);
  assert.equal(new Set(state.fired).size, state.fired.length, 'beats fire once');

  const restarted = restartEndingCutscene(state, spec);
  assert.equal(restarted.cursor, 0, 'reload restarts the current cutscene safely');
  assert.equal(restarted.reducedMotion, state.reducedMotion);

  result = advanceEndingCutscene(restarted, spec, { skip: true });
  state = result.state;
  assert.equal(state.complete, true);
  assert.equal(state.completionId, endingCutsceneCompletionId('tower-lost'));
  const claimed = claimEndingCutsceneCompletion(state, state.completionId);
  assert.equal(claimed.claimed, true);
  assert.equal(claimEndingCutsceneCompletion(claimed.state, state.completionId).claimed, false,
    'completion transaction cannot duplicate rewards');
}

// Reduced motion changes presentation only. The same elapsed time reaches the
// same authored beat and completion state.
{
  const spec = ENDING_CUTSCENES['tower-lost'];
  const normal = advanceEndingCutscene(createEndingCutsceneState(spec), spec, { elapsedMs: 4800 }).state;
  const reduced = advanceEndingCutscene(
    createEndingCutsceneState(spec, { reducedMotion: true }), spec, { elapsedMs: 4800 },
  ).state;
  assert.equal(reduced.reducedMotion, true);
  assert.equal(reduced.cursor, normal.cursor);
  assert.deepEqual(reduced.fired, normal.fired);
  assert.equal(reduced.complete, normal.complete);
}

// Interaction presses are semantic and fresh: one press satisfies one beat.
{
  const spec = ENDING_CUTSCENES.drugged;
  let state = createEndingCutsceneState(spec);
  state = advanceEndingCutscene(state, spec, { deltaMs: 0 }).state;
  let result = advanceEndingCutscene(state, spec, { interaction: 'inspect-kit' });
  assert.equal(result.events[0]?.beat?.id, 'inspect-kit');
  state = result.state;
  result = advanceEndingCutscene(state, spec, { interaction: 'inspect-kit' });
  assert.equal(result.events.length, 0, 'held or repeated action cannot satisfy the next semantic interaction');
}

// A dragged body follows the trail instead of being glued to the camera, and a
// blocked follower rejects the player step before either body crosses a wall.
{
  const follower = draggedPayloadFollower([{ x: 0, y: 0 }, { x: 1, y: 0 }], { x: 2, y: 0 }, 1);
  assert.deepEqual(follower, { x: 1, y: 0 });
  let state = createDraggedPayloadState({ position: { x: 0, y: 0 }, spacing: 1 });
  state = gripDraggedPayload(state, { x: 1, y: 0 });
  let moved = draggedPayloadStep(state, { x: 1, y: 0 }, { x: 2, y: 0 }, { canOccupy: () => true });
  assert.equal(moved.allowed, true);
  assert.ok(moved.state.position.x > 0, 'payload advances from its own position');
  const blocked = draggedPayloadStep(moved.state, { x: 2, y: 0 }, { x: 3, y: 0 }, { canOccupy: () => false });
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.state.position, moved.state.position, 'blocked payload stays on the valid side of geometry');
  assert.equal(dropDraggedPayload(moved.state).gripped, false);
}

console.log('ending cutscene specs passed');
