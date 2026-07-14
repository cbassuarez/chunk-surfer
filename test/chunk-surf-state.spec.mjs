import assert from 'node:assert/strict';
import {
  CHUNK_SURF_FLAGS,
} from '../src/data/chunk-surf-script.js';
import {
  canOfferChunkSurf,
  createChunkSurfState,
  moveChunkSurf,
  tuneChunkSurf,
  turnChunkSurf,
  recordChunkSurf,
  redactChunkSurf,
  chunkSurfCompletion,
  chunkSurfFlagsForState,
} from '../src/game/chunk-surf-state.js';

function face(state, dir) {
  return turnChunkSurf(state, dir);
}

function go(state, dir = 'forward') {
  return moveChunkSurf(state, dir);
}

function routeToBestCandidate() {
  let s = createChunkSurfState({ drankCoffee: true, hasRig: true, endingsSeen: ['sacrifice', 'inversion'] });
  s = go(s); // fork-room
  s = tuneChunkSurf(s);
  s = go(s); // recordist-loop
  s = tuneChunkSurf(s);
  s = face(s, 'east');
  s = go(s); // body-room
  s = tuneChunkSurf(s);
  s = recordChunkSurf(s);
  s = face(s, 'south');
  s = go(s); // surfer-origin
  s = tuneChunkSurf(s);
  s = face(s, 'east');
  s = go(s); // approach
  s = go(s); // work-order-loop
  s = tuneChunkSurf(s);
  s = face(s, 'north');
  s = go(s); // body-room
  s = face(s, 'east');
  s = go(s); // final-page
  s = tuneChunkSurf(s);
  return s;
}

assert.equal(canOfferChunkSurf({ completedTakes: 3, roomId: 'lux_nova' }), false, 'does not offer before four takes');
assert.equal(canOfferChunkSurf({ completedTakes: 4, roomId: 'studio_b3' }), false, 'does not offer away from chapel approach');
assert.equal(canOfferChunkSurf({ completedTakes: 4, roomId: 'lux_nova' }), true, 'offers at chapel after four takes');
assert.equal(canOfferChunkSurf({ completedTakes: 4, roomId: 'chapel_approach', alreadyCompleted: true }), false, 'does not offer after completion');

{
  let s = createChunkSurfState({ drankCoffee: true, hasRig: true });
  s = moveChunkSurf(s, 'back');
  assert.equal(s.scare?.reason, 'turned-back', 'backing out of the first corridor produces the scare');
}

{
  let s = createChunkSurfState({ drankCoffee: false, hasRig: true });
  s = go(s, 'forward');
  s = tuneChunkSurf(s);
  assert.equal(s.hasFork, true, 'tuning fork room grants the fork/tool');
  assert.ok(chunkSurfFlagsForState(s).includes(CHUNK_SURF_FLAGS.fork), 'fork flag is exported');
}

{
  let s = routeToBestCandidate();
  s = redactChunkSurf(s, 'source');
  const complete = chunkSurfCompletion(s);
  assert.equal(complete.completed, true, 'wrong final redaction still completes the rupture');
  assert.equal(complete.bestEligible, false, 'wrong final redaction does not unlock the fifth ending');
}

{
  let s = routeToBestCandidate();
  s = redactChunkSurf(s, 'body');
  const complete = chunkSurfCompletion(s);
  assert.equal(complete.completed, true, 'correct final redaction completes the rupture');
  assert.equal(complete.bestEligible, true, 'full route unlocks the fifth ending');
  assert.ok(complete.flags.includes(CHUNK_SURF_FLAGS.bestEligible), 'best-ending flag is exported');
  assert.ok(complete.flags.includes(CHUNK_SURF_FLAGS.correctRedaction), 'correct-redaction flag is exported');
}

{
  let s = routeToBestCandidate();
  s = { ...s, profile: { ...s.profile, bestEligible: false } };
  s = redactChunkSurf(s, 'body');
  assert.equal(chunkSurfCompletion(s).bestEligible, false, 'no-rig/nonqualified route can learn truth without fifth ending');
}

console.log('chunk-surf-state specs passed');
