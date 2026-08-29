import assert from 'node:assert/strict';
import { CHUNK_SURF_FLAGS } from '../src/data/chunk-surf-script.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import {
  CHUNK_SURF_PHASE,
  SOURCE_FINAL_OUTCOME,
  SOURCE_FINAL_STATUS,
  SOURCE_PURSUIT_BEAT,
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
  }
  if (best) state = event(state, 'SOURCE_CONTACT_RESOLVED', {
    checkpointId: 'landing-return',
    contact: {
      captures: 3,
      insights: ['music-human-name', 'surfer-vessel', 'borrowed-body-return'],
      seenBeats: ['music-1', 'vessel-1', 'body-1'],
      lastChoiceId: 'body-1.return',
    },
  });
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
assert.equal(inferLegacyChunkSurf({flags:{[CHUNK_SURF_FLAGS.completed]:true}}).finalEncounter.status,SOURCE_FINAL_STATUS.RESOLVED,'completed legacy saves migrate to a resolved encounter');

{
  const migrated=normalizeChunkSurfState({
    schema:2,active:true,phase:'landscape',profile:{bestEligible:true},tuned:['fork-room','surfer-origin'],recorded:['work-order-loop'],redaction:null,
  });
  assert.equal(migrated.schema,5);
  assert.deepEqual(migrated.optionalTraces,['surfer-origin','work-order-loop'],'schema-2 Tune and Record evidence migrates without loss');
  assert.equal(migrated.finalEncounter.status,SOURCE_FINAL_STATUS.LOCKED);
  assert.deepEqual(migrated.checkpoint,{id:'hall-entry',facing:0});
  // Saves written before the horizon existed carry no injury snapshot and no
  // tape. Zero only ever closes the fault, never opens one, so an old save can
  // lose the optional fight but can never be handed it unearned.
  assert.equal(migrated.injuriesAtEntry,0,'pre-horizon saves do not invent a prior injury');
  assert.deepEqual(migrated.horizon,{entered:false,reason:null,exit:null,maxDepth:0});
}

{
  const legacyLandscape=normalizeChunkSurfState({schema:3,active:true,phase:'landscape'});
  assert.equal(legacyLandscape.firstLiftCompleted,true,'old landscape saves resume above the landing tutorial');
  assert.equal(legacyLandscape.landingWeatherSpent,true,'old landscape saves do not restart landing weather');
  assert.deepEqual(legacyLandscape.sourceContacts.insights,[]);
  const newRun=freshChunkSurfState();
  assert.equal(newRun.firstLiftCompleted,false);
  assert.equal(newRun.landingWeatherSpent,false);
}

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
  let state=landscapeState();
  state=event(state,'LANDMARK_VISITED',{id:'surfer-origin'});
  state=event(state,'LANDMARK_VISITED',{id:'work-order-loop'});
  assert.deepEqual(state.optionalTraces,['surfer-origin','work-order-loop'],'visiting each authored place resolves its optional trace');
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
  let state=landscapeState();
  for(const id of ['fork-room','recordist-loop','body-room'])state=event(state,'LANDMARK_VISITED',{id});
  state=event(state,'FINAL_REACHED');
  state=event(state,'FINAL_ENCOUNTER_RESOLVED',{result:{outcome:SOURCE_FINAL_OUTCOME.RESCUE,won:true}});
  state=event(state,'SOURCE_COMPLETED');
  assert.equal(state.completed,true,'the generic fight seam can complete the chapter without the redaction adapter');
  assert.equal(state.bestEligible,false,'both optional traces jointly gate rescue');
}

{
  let state=landscapeState();
  state=event(state,'PURSUIT_STARTED',{id:SOURCE_PURSUIT_BEAT.BODY_RUN});
  assert.equal(state.pursuitBeat,SOURCE_PURSUIT_BEAT.BODY_RUN);
  assert.equal(state.hushStage,'hunt');
  state=event(state,'PURSUIT_CLEARED',{id:SOURCE_PURSUIT_BEAT.BODY_RUN});
  assert.equal(state.pursuitBeat,null);
  assert.ok(state.pursuitsCleared.includes(SOURCE_PURSUIT_BEAT.BODY_RUN));
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
  assert.equal(chunkSurfFlagsForState(event(state,'LANDMARK_VISITED',{id:'fork-room'})).includes(CHUNK_SURF_FLAGS.fork),false,
    'visiting the old fork room does not generate a Source tuning fork');
  assert.ok(chunkSurfFlagsForState(event(state, 'LANDMARK_TUNED', { id: 'fork-room' })).includes(CHUNK_SURF_FLAGS.fork),
    'legacy tuned saves retain their historical fork flag');
}

{
  const entry=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.HALL_ENTRY);
  const storm=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.HALL_STORM);
  const haystack=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.HAYSTACK);
  const landscape=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LANDSCAPE);
  const hunt=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.HUNT);
  const finalRun=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL_RUN);
  const final=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL);
  const landing=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LANDING);
  const firstLift=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT);
  const insights=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.ALL_INSIGHTS);
  const normalExit=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT);
  assert.equal(entry.state.phase,CHUNK_SURF_PHASE.HALL);
  assert.equal(storm.state.pageStage,3);
  assert.equal(haystack.state.phase,CHUNK_SURF_PHASE.HAYSTACK);
  assert.equal(landscape.state.phase,CHUNK_SURF_PHASE.LANDSCAPE);
  assert.equal(hunt.state.hushStage,'hunt');
  assert.equal(hunt.state.pursuitBeat,SOURCE_PURSUIT_BEAT.BODY_RUN);
  assert.equal(finalRun.state.pursuitBeat,SOURCE_PURSUIT_BEAT.FINAL_RUN);
  assert.equal(final.state.phase,CHUNK_SURF_PHASE.FINAL);
  assert.equal(final.state.active,true);
  assert.equal(landing.state.firstLiftCompleted,false);
  assert.equal(firstLift.state.firstLiftCompleted,false,'FIRST LIFT is the safe lower approach, not a completed ride');
  assert.equal(firstLift.state.landingDoorOpen,false,'the FOH leaf has shut by the end of the white approach');
  assert.equal(firstLift.state.landingDoorSealed,true,'the FIRST LIFT review point cannot reopen the Scene Dock');
  assert.equal(firstLift.state.sourceApproachComplete,true,'FIRST LIFT begins where the thirty-second approach resolves');
  for(const preset of [firstLift,hunt,finalRun,final]){
    assert.equal(preset.state.hasFork,false,'God presets do not generate a Source tuning fork');
    assert.deepEqual(preset.state.tuned,[],'God presets do not generate tuned landmarks');
    assert.deepEqual(preset.state.recorded,[],'God presets do not generate Source recordings');
  }
  assert.equal(insights.state.sourceContacts.insights.length,3);
  assert.equal(normalExit.state.phase,CHUNK_SURF_PHASE.FINAL);
}

console.log('chunk-surf-state specs passed');
