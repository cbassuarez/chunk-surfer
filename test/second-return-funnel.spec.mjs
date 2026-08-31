import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POST_RUN_ACTIONS, POST_RUN_STAGE_COPY, hushAvailabilityCopy, transferRoomCopy } from '../src/game/post-run-copy.js';
import { normalizeMeta } from '../src/progression/schema.js';
import { returnIndexEntries } from '../src/progression/report.js';
import { lastReturnRecord } from '../src/progression/return-history.js';
import { SECOND_SHIFT_BY_ENDING } from '../src/game/second-shift.js';
import { ACHIEVEMENT_BY_ID } from '../src/progression/achievement-defs.js';
import { EVENT_TYPES } from '../src/progression/events.js';
import { HUSH_DOSSIER } from '../src/game/hush-dossier.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';

const ids=['sacrifice','helped','inversion','drugged','surfaced'];
for(const id of ids){
  const shift=SECOND_SHIFT_BY_ENDING[id];
  assert.ok(shift.evidence&&shift.residue&&shift.evidenceLabel&&shift.residueLabel&&shift.lead&&shift.adjacentEndingId);
}
assert.equal(HUSH_DOSSIER.length,8);
assert.ok(HUSH_DOSSIER.every((record)=>record.source&&record.date&&record.status&&record.paragraphs.length>=2),'room-only dossier remains a set of primary records');
for(const mesh of ['legacy_tape_rack','legacy_patchbay','legacy_transfer_deck'])assert.ok(PROP_MESH[mesh],`${mesh} has a packed contract`);
assert.equal(CONSERVATORY_PROPS.filter((prop)=>prop.id.startsWith('legacy-')).length,4,'the inaccessible transfer room is physically furnished');
const legacy=normalizeMeta({
  endingsSeen:['sacrifice'],
  returns:{records:{'return:r':{id:'return:r',endingId:'sacrifice'}},history:[{id:'return:r',endingId:'sacrifice'}]},
});
assert.deepEqual(legacy.returns.history,['return:r'],'legacy object history normalizes to summary IDs');
assert.equal(lastReturnRecord(legacy).endingId,'sacrifice');
const adjacent=returnIndexEntries(legacy).find((entry)=>entry.id==='inversion');
assert.equal(adjacent.status,'LEAD');
assert.equal(adjacent.displayClassification,'INVERSION');
assert.ok(adjacent.adjacentLead);
assert.equal(returnIndexEntries(legacy).find((entry)=>entry.id==='drugged').displayClassification,'');
assert.deepEqual(ACHIEVEMENT_BY_ID.ACH_SECOND_TRACK.events,[EVENT_TYPES.CAUSAL_TAPE_PROMOTED]);
assert.deepEqual(ACHIEVEMENT_BY_ID.ACH_UNINJURED.events,[EVENT_TYPES.RUN_FINISHED]);

const title=readFileSync('src/game/title.js','utf8');
const report=readFileSync('src/game/return-report.js','utf8');
const archive=readFileSync('src/game/archive.js','utf8');
const main=readFileSync('src/main.js','utf8');
const renderer=readFileSync('src/render/r3d.js','utf8');
assert.doesNotMatch(title,/just-surf|onJustSurf/i);
assert.match(title,/transferRoomOpen \? \[\{ id: 'transfer-room'/);
// The row's help line lives in post-run-copy so the title, the return report and
// the archive all say the same thing about the same state. The contract is that
// the title ASKS rather than authoring its own words for it; that outlived the
// mode it was written for.
assert.match(title,/transferRoomCopy\(/);
assert.match(transferRoomCopy({filed:0}).short,/NOTHING FILED/);
assert.ok(!transferRoomCopy({filed:0}).enabled&&transferRoomCopy({filed:2}).enabled,
  'an empty file and a full one are distinguishable states, the way a resumable session and a first run were');
const postRun=readFileSync('src/game/post-run-copy.js','utf8');
assert.match(postRun,/resume: Object\.freeze\(\{[\s\S]*?CONTINUE OR RESTART/);
assert.match(postRun,/hasSession \? HUSH_COPY\.resume : HUSH_COPY\.ready/);
assert.match(postRun,/incompatible: Object\.freeze/);
// Same move: the report's own strings became POST_RUN_ACTIONS and
// POST_RUN_STAGE_COPY so the three surfaces cannot describe one state three
// ways. Assert the four facts still exist and that the report reads them.
assert.match(report,/POST_RUN_ACTIONS/);
assert.match(report,/POST_RUN_STAGE_COPY/);
assert.match(report,/transferRoomCopy/);
assert.ok(POST_RUN_ACTIONS.some((action)=>action.id==='replay'),'a way back into the story');
assert.ok(POST_RUN_ACTIONS.some((action)=>action.id==='transfer-room'),'and a way into the transfer room');
assert.match(POST_RUN_STAGE_COPY.filing.panel,/PREPARING THE HUSH/);
assert.match(hushAvailabilityCopy({status:'not-qualified'}).short,/1 INJURY/);
assert.match(hushAvailabilityCopy({status:'ready'}).body,/cause the events your past self experienced/);
// 'RETURN FILES' is 'RUN HISTORY' now — the archive's second tab, in the same
// plain register as the rest of the post-run copy.
assert.match(archive,/RUN HISTORY/);
assert.match(main,/progressionEvents\.on\('\*',/,'causal capture subscribes through the progression event bus contract');
assert.match(main,/function openTransferRoom\(\)\{[\s\S]{0,200}?scenes\.remove\('title'\)/,'the report fork cannot leave the title rendering underneath the transfer room');
assert.match(main,/sensoryProfile:worldView\?\.sensoryProfile\|\|'story'/,'camera rigs pass their explicit sensory profile into the renderer');
assert.match(renderer,/const hushSense=sensoryProfile==='hush-prowl'\?1/,'Prowl has a dedicated renderer sensory treatment');
assert.match(renderer,/uHushSense/,'the HUSH room-read remains separate from story lighting');

console.log('second-return funnel contracts passed');
