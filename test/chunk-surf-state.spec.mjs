import assert from 'node:assert/strict';
import { CHUNK_SURF_FLAGS } from '../src/data/chunk-surf-script.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import {
  CHUNK_SURF_PHASE,
  canOfferChunkSurf,
  chunkSurfCompletion,
  chunkSurfFlagsForState,
  freshChunkSurfState,
  inferLegacyChunkSurf,
  normalizeChunkSurfState,
  pageStageForDistance,
  reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';

const event = (state, type, details = {}) => reduceChunkSurf(state, { type, ...details });

function landscapeState({ best = true } = {}) {
  let state = freshChunkSurfState({ drankCoffee: true, hasRig: best, seed: 4417, returnPoint: { x: 86, y: 58, facing: 2 } });
  state = event(state, 'SOURCE_ENTERED', { returnPoint: state.returnPoint });
  state = event(state, 'HALL_ADVANCED', { distance: 112 });
  state = event(state, 'HAYSTACK_REACHED', { origin: { x: 0, y: -224 }, slot: 5 });
  state = event(state, 'HAYSTACK_PAGE_FOUND', { landscapeOrigin: { x: 0, y: -246 } });
  return event(state, 'TRANSFORMATION_COMPLETED');
}

function completeCandidate(redaction = 'body', { best = true } = {}) {
  let state = landscapeState({ best });
  for (const id of ['fork-room', 'recordist-loop', 'surfer-origin', 'work-order-loop', 'body-room']) {
    state = event(state, 'LANDMARK_VISITED', { id });
    state = event(state, 'LANDMARK_TUNED', { id });
  }
  state = event(state, 'LANDMARK_RECORDED', { id: 'body-room' });
  state = event(state, 'FINAL_REACHED');
  state = event(state, 'REDACTION_ARMED', { id: redaction });
  state = event(state, 'REDACTION_CONFIRMED', { id: redaction });
  return event(state, 'SOURCE_COMPLETED');
}

assert.equal(canOfferChunkSurf({ completedTakes: 3, roomId: 'lux_nova' }), false);
assert.equal(canOfferChunkSurf({ completedTakes: 4, roomId: 'studio_b3' }), false);
assert.equal(canOfferChunkSurf({ completedTakes: 4, roomId: 'lux_nova' }), true);
assert.equal(canOfferChunkSurf({ completedTakes: 4, roomId: 'chapel_approach', alreadyCompleted: true }), false);

assert.deepEqual([0, 27.9, 28, 56, 84, 112].map(pageStageForDistance), [0, 0, 1, 2, 3, 4]);
assert.equal(inferLegacyChunkSurf({flags:{[CHUNK_SURF_FLAGS.entered]:true}}).active,true,'incomplete legacy source saves restart in the Hall');

{
  let state = freshChunkSurfState();
  state = event(state, 'SOURCE_ENTERED', { returnPoint: { x: 4, y: 5 } });
  state = event(state, 'HALL_ADVANCED', { distance: 84 });
  state = event(state, 'HALL_ADVANCED', { distance: 20 });
  assert.equal(state.hallMaxDistance, 84, 'retreat never reverses page escalation');
  assert.equal(state.pageStage, 3);
  assert.equal(event(state, 'HAYSTACK_REACHED', { origin: { x: 0, y: -20 } }).phase, CHUNK_SURF_PHASE.HALL, 'haystack cannot begin early');
}

{
  const state = landscapeState();
  assert.equal(state.phase, CHUNK_SURF_PHASE.LANDSCAPE);
  assert.equal(state.active, true);
  assert.deepEqual(state.returnPoint, { x: 86, y: 58, facing: 2 });
}

{
  const wrong = chunkSurfCompletion(completeCandidate('source'));
  assert.equal(wrong.completed, true);
  assert.equal(wrong.bestEligible, false);
}

{
  const complete = chunkSurfCompletion(completeCandidate('body'));
  assert.equal(complete.completed, true);
  assert.equal(complete.bestEligible, true);
  assert.ok(complete.flags.includes(CHUNK_SURF_FLAGS.bestEligible));
  assert.ok(complete.flags.includes(CHUNK_SURF_FLAGS.correctRedaction));
}

{
  const complete = chunkSurfCompletion(completeCandidate('body', { best: false }));
  assert.equal(complete.bestEligible, false, 'route qualification remains part of ending eligibility');
}

{
  let state = landscapeState();
  state = event(state, 'HUSH_CONTACT');
  assert.equal(state.attempts, 1);
  assert.equal(state.phase, CHUNK_SURF_PHASE.LANDSCAPE, 'contact preserves spatial progress');
  assert.equal(normalizeChunkSurfState({ ...state, phase: 'invalid' }).phase, CHUNK_SURF_PHASE.HALL);
  assert.ok(chunkSurfFlagsForState(event(state, 'LANDMARK_TUNED', { id: 'fork-room' })).includes(CHUNK_SURF_FLAGS.fork));
}

{
  const entry=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.HALL_ENTRY);
  const storm=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.HALL_STORM);
  const haystack=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.HAYSTACK);
  const landscape=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LANDSCAPE);
  const hunt=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.HUNT);
  const final=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL);
  assert.equal(entry.state.phase,CHUNK_SURF_PHASE.HALL);
  assert.equal(storm.state.pageStage,3);
  assert.equal(haystack.state.phase,CHUNK_SURF_PHASE.HAYSTACK);
  assert.equal(landscape.state.phase,CHUNK_SURF_PHASE.LANDSCAPE);
  assert.equal(hunt.state.hushStage,'hunt');
  assert.equal(final.state.phase,CHUNK_SURF_PHASE.FINAL);
  assert.equal(final.state.active,true);
}

console.log('chunk-surf-state specs passed');
