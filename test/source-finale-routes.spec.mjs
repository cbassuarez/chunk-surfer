import assert from 'node:assert/strict';
import fs from 'node:fs';

import { cathedralBellCombatDefinition } from '../src/data/combat-definitions.js';
import { ENDING_MANIFEST } from '../src/data/endings.js';
import {
  CHURCH_FURNISHINGS,
  CHURCH_EXPLORATION_EXIT_DOOR_ID,
  CHURCH_TOWER_ENDING_EXIT_DOOR_ID,
  churchTowerCarryDoorAccess,
} from '../src/data/st-brendans.js';
import { CHUNK_SURF_FLAGS } from '../src/data/chunk-surf-script.js';
import { createCombatState, validateCombatDefinition } from '../src/game/combat-state.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import {
  CHUNK_SURF_PHASE,
  HORIZON_EXIT,
  HORIZON_REASON,
  SOURCE_FINALE_RESULT,
  SOURCE_FINALE_ROUTE,
  SOURCE_FINALE_STAGE,
  SOURCE_FINAL_OUTCOME,
  chunkSurfCompletion,
  inferLegacyChunkSurf,
  normalizeChunkSurfState,
  reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';
import { createSourceSpaceRuntime, horizonBustEyeEvidence } from '../src/game/source-space-runtime.js';
import { ENDING_IDS } from '../src/progression/schema.js';
import { RETURN_DEFS } from '../src/progression/report.js';

const dispatch=(state,type,details={})=>reduceChunkSurf(state,{type,...details});
const finalState=()=>buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE,{seed:4417,hasRig:false}).state;

// Contact is explicit, durable, terminal in either direction, and cannot be
// converted into Horizon by an old normal-exit call after commitment.
{
  const ready=finalState();
  const normalExitPreset=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT,{seed:4417,hasRig:false});
  const warningRuntime=createSourceSpaceRuntime({initialState:normalExitPreset.state});
  warningRuntime.setPlayerPosition(normalExitPreset.position);
  assert.equal(warningRuntime.inspectFocused(normalExitPreset.position.x,normalExitPreset.position.y,normalExitPreset.position.facing).event,'boss-warning','both fault approaches share the no-return decision');
  const committed=dispatch(ready,'CONTACT_COMMITTED');
  assert.equal(committed.finale.route,SOURCE_FINALE_ROUTE.CONTACT);
  assert.equal(committed.finale.stage,SOURCE_FINALE_STAGE.CONTACT_COMMITTED);
  assert.deepEqual(dispatch(committed,'SOURCE_NORMAL_EXIT'),committed,'Contact cannot walk away after committing');

  const reloaded=normalizeChunkSurfState(JSON.parse(JSON.stringify(committed)));
  assert.equal(reloaded.finale.stage,SOURCE_FINALE_STAGE.CONTACT_COMMITTED,'reload resumes the committed fight introduction');

  let won=dispatch(reloaded,'FINAL_ENCOUNTER_RESOLVED',{result:{outcome:SOURCE_FINAL_OUTCOME.CONTAIN,won:true}});
  won=dispatch(won,'SOURCE_COMPLETED');
  assert.equal(chunkSurfCompletion(won).endingId,'contact-won');
  assert.equal(chunkSurfCompletion(won).transitionTarget,'ending');

  const lost=dispatch(committed,'FINAL_ENCOUNTER_LOST');
  const loss=chunkSurfCompletion(lost);
  assert.equal(loss.endingId,'contact-lost');
  assert.equal(lost.phase,CHUNK_SURF_PHASE.COMPLETED);
  assert.equal(lost.horizon.entered,false);
  assert.deepEqual(dispatch(lost,'SOURCE_NORMAL_EXIT'),lost);
}

// Horizon is produced only by deliberate refusal. The eyes prove a past act;
// they are neither consumed nor made eligible merely by having been offered.
{
  const walked=dispatch(finalState(),'SOURCE_NORMAL_EXIT');
  assert.equal(walked.phase,CHUNK_SURF_PHASE.HORIZON);
  assert.equal(walked.horizon.reason,HORIZON_REASON.WALKED_AWAY);
  assert.equal(horizonBustEyeEvidence('carried').eligible,true);
  assert.equal(horizonBustEyeEvidence('returned').eligible,true);
  assert.equal(horizonBustEyeEvidence('declined').eligible,false);
  assert.equal(horizonBustEyeEvidence('in-the-water').eligible,false);
  assert.equal(horizonBustEyeEvidence(null).eligible,false);

  const returned={...walked,profile:{...walked.profile,marbleEyes:'returned'}};
  const runtime=createSourceSpaceRuntime({initialState:returned});
  for(let beat=0;beat<3;beat+=1)runtime.talkToHorizonBust();
  assert.equal(runtime.state().finale.bust.recognized,true);
  assert.equal(runtime.decideHorizonBust(true).decision,'accepted');
  assert.equal(runtime.state().profile.marbleEyes,'returned','eye evidence is not consumed');
  // The detour opens the bell passage rather than closing the chapter; the
  // route commits here and the completion arrives four hundred metres later,
  // when the body walks into the room. See test/horizon.spec.mjs for the walk.
  const tower=runtime.takeHorizonBustDetour();
  assert.equal(tower.entered,'bells');
  assert.equal(runtime.state().finale.route,SOURCE_FINALE_ROUTE.TOWER);
  assert.equal(runtime.state().completed,false);
  const towerDone=runtime.enterBellsRoom();
  assert.equal(towerDone.completion.route,SOURCE_FINALE_ROUTE.TOWER);
  assert.equal(towerDone.completion.transitionTarget,'cathedral');

  let chapel={...walked,profile:{...walked.profile,marbleEyes:'declined'}};
  const noEyes=createSourceSpaceRuntime({initialState:chapel});
  assert.equal(noEyes.talkToHorizonBust().eligible,false);
  assert.equal(noEyes.state().finale.route,SOURCE_FINALE_ROUTE.CHAPEL);
  const chapelExit=noEyes.chooseHorizonExit(HORIZON_EXIT.CHAPEL);
  assert.equal(chapelExit.completion.transitionTarget,'chapel');
}

// A recognized bust decision permanently partitions Tower from Chapel. Tower
// then advances through machinery, Cathedral, fight, carry, and one ending.
{
  let state=dispatch(finalState(),'SOURCE_NORMAL_EXIT');
  state=dispatch(state,'HORIZON_BUST_RECOGNIZED',{eligible:true});
  state=dispatch(state,'HORIZON_BUST_DECIDED',{decision:'accepted'});
  const committed=state;
  assert.equal(committed.finale.route,SOURCE_FINALE_ROUTE.TOWER);
  assert.deepEqual(dispatch(committed,'HORIZON_BUST_DECIDED',{decision:'declined'}),committed);
  assert.deepEqual(dispatch(committed,'HORIZON_EXIT_CHOSEN',{exit:HORIZON_EXIT.CHAPEL}),committed,'Tower overrides Chapel and demolition preparation');
  state=dispatch(state,'HORIZON_EXIT_CHOSEN',{exit:HORIZON_EXIT.TOWER});
  // The tower road goes through the bell passage. Choosing it commits the route
  // and opens a place; walking into the room at the end of it is what closes
  // Source space, and only then does the Cathedral accept an arrival.
  assert.equal(state.phase,CHUNK_SURF_PHASE.BELLS);
  assert.equal(state.completed,false);
  assert.deepEqual(dispatch(state,'CATHEDRAL_ENTERED').finale.stage,SOURCE_FINALE_STAGE.CATHEDRAL,
    'the stage is already committed, so a resumed save can still hand over');
  state=dispatch(state,'BELLS_ROOM_ENTERED');
  assert.equal(state.completed,true);
  state=dispatch(state,'CATHEDRAL_ENTERED');
  assert.equal(state.finale.stage,SOURCE_FINALE_STAGE.CATHEDRAL);
  state=dispatch(state,'CATHEDRAL_FIGHT_STARTED');
  const fight=state;
  assert.equal(dispatch(fight,'CATHEDRAL_FIGHT_LOST').finale.result,SOURCE_FINALE_RESULT.LOST);
  const won=dispatch(fight,'CATHEDRAL_FIGHT_WON');
  assert.equal(won.finale.stage,SOURCE_FINALE_STAGE.TOWER_ESCAPE);
  const escaped=dispatch(won,'TOWER_ESCAPE_COMPLETED');
  assert.equal(chunkSurfCompletion(escaped).endingId,'tower-won');
  assert.equal(chunkSurfCompletion(dispatch(fight,'CATHEDRAL_FIGHT_LOST')).endingId,'tower-lost');
}

// Old Horizon losses are readable but no new reducer path produces one. Old
// non-Horizon victories become Open Channel, including pre-chunk state flags.
{
  const legacyLost=normalizeChunkSurfState({
    ...finalState(),schema:4,active:true,completed:false,phase:'horizon',
    horizon:{entered:true,reason:'lost',exit:null,maxDepth:40},
  });
  assert.equal(legacyLost.horizon.reason,HORIZON_REASON.LOST);
  assert.equal(legacyLost.finale.stage,SOURCE_FINALE_STAGE.HORIZON);

  const legacyWon=normalizeChunkSurfState({
    ...finalState(),schema:4,active:false,completed:true,phase:'completed',
    finalEncounter:{status:'resolved',outcome:'contain',won:true},
  });
  assert.equal(chunkSurfCompletion(legacyWon).endingId,'contact-won');
  const inferred=inferLegacyChunkSurf({flags:{[CHUNK_SURF_FLAGS.completed]:true}});
  assert.equal(chunkSurfCompletion(inferred).endingId,'contact-won');
}

// THE MOVING-MACHINERY PASSAGE IS GONE, AND WITH IT ITS SPEC.
//
// The tower road was a 2D obstacle course drawn over a datamosh: five wireframe
// masses on sine waves, a lateral lane, and a blocked flag. It is a walk through
// Source space now (test/source-bell-passage.spec.mjs), so the collision that
// matters is the ordinary cell collision every other tier uses.

// Both Cathedral phases are ordinary deterministic signal combat definitions,
// with spent pressure carried into phase two and no rhythm-control surface.
{
  const first=cathedralBellCombatDefinition({phase:1});
  const second=cathedralBellCombatDefinition({phase:2,carriedDamage:10});
  assert.deepEqual(validateCombatDefinition(first),[]);
  assert.deepEqual(validateCombatDefinition(second),[]);
  assert.ok(second.baseComposure<first.baseComposure);
  assert.equal(first.cathedralPhase,1);
  assert.equal(second.cathedralPhase,2);
  assert.ok(first.movements.every((movement)=>movement.intents.every((intent)=>!('timing' in intent)&&!('rope' in intent))));
  const continued=createCombatState(second,{continuation:{
    composure:17,charge:0,battery:.42,take:{id:'bell-print',label:'BELL PRINT',damage:10},
    turns:9,damageTaken:10,missedCounters:2,toolsUsed:{recorder:3},
    feedbackLoopUsed:true,recoveryHolds:1,recoveryUnlocked:true,signaturePressure:2,
  }});
  assert.equal(continued.composure,17);
  assert.equal(continued.charge,0);
  assert.equal(continued.battery,.42);
  assert.equal(continued.take.id,'bell-print');
  assert.equal(continued.turns,9);
  assert.equal(continued.damageTaken,10);
  assert.equal(continued.toolsUsed.recorder,3);
  assert.equal(continued.feedbackLoopUsed,true);
}

// The Cathedral retains physical shop dressing, while extraction uses the
// ceremonial west front; the archive is
// now nine outcomes grouped as five Chapel, two Contact, and two Tower.
{
  const furnishingIds=new Set(CHURCH_FURNISHINGS.map((entry)=>entry.id));
  for(const id of ['visitor-desk','visitor-guidebooks','visitor-till','visitor-postcards'])assert.ok(furnishingIds.has(id));
  assert.equal(CHURCH_TOWER_ENDING_EXIT_DOOR_ID,'brendan-west-door');
  assert.deepEqual(churchTowerCarryDoorAccess(CHURCH_EXPLORATION_EXIT_DOOR_ID),{
    allowed:true,completesEnding:true,reason:null,
  });
  assert.equal(ENDING_IDS.length,9);
  assert.equal(new Set(ENDING_IDS).size,9);
  assert.deepEqual(RETURN_DEFS.filter((entry)=>entry.family==='CONTACT').map((entry)=>entry.id),['contact-won','contact-lost']);
  assert.deepEqual(RETURN_DEFS.filter((entry)=>entry.family==='TOWER').map((entry)=>entry.id),['tower-won','tower-lost']);
  assert.equal(ENDING_MANIFEST['contact-won'].title,'Open Channel');
  assert.equal(ENDING_MANIFEST['contact-lost'].title,'No Return');
  assert.equal(ENDING_MANIFEST['tower-won'].title,'Exit Through the Gift Shop');
  assert.equal(ENDING_MANIFEST['tower-won'].cutscene.worldAnchors.westDoors.id,'brendan-west-door');
  assert.equal(ENDING_MANIFEST['tower-won'].cutscene.worldAnchors.nave.id,'nave');
  assert.equal(ENDING_MANIFEST['tower-lost'].title,'The Full Peal');
}

// God review exposes the new route checkpoints and all terminal outcomes, while
// the retired player-facing rhythm lab is absent from both God and Settings UI.
{
  const mainSource=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const settingsSource=fs.readFileSync(new URL('../src/game/settings.js',import.meta.url),'utf8');
  for(const id of[
    'tower-machinery-transition','tower-cathedral-entry','tower-cathedral-phase-one',
    'tower-cathedral-phase-two','tower-cathedral-carry',
    "['contact-won',ENDING_ARRIVAL.AGREED",
    "['contact-lost',ENDING_ARRIVAL.DEFEATED",
    "['tower-won',ENDING_ARRIVAL.CARRIED",
    "['tower-lost',ENDING_ARRIVAL.DEFEATED",
  ])assert.ok(mainSource.includes(id),`missing God route preset ${id}`);
  assert.match(mainSource,/function godCathedralFinalePreset[\s\S]*?godAbortBattle\(\);[\s\S]*?startCathedralCarry\(\)/,
    'Cathedral checkpoints can replace an active fight, including the carry hook');
  assert.match(mainSource,/function godEnterHorizon[\s\S]*?marbleEyes:'returned'/,
    'the Horizon bust review hook reaches the qualified Tower or Chapel proposition');
  assert.ok(!mainSource.includes("{id:'bell-tower',name:'TOWER'"));
  assert.ok(!settingsSource.includes('PEAL ASSIST'));
  assert.ok(!settingsSource.includes('RHYTHM OFFSET'));
}

console.log('source finale route specs passed');
