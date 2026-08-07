import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
assert.match(title,/replay \? \[\{ id: 'hush-run'/);
assert.match(title,/RESUME TAPE \/ RESTART TAPE/);
assert.match(title,/SOURCE TAPE INCOMPATIBLE|hushAvailability\?\.message/);
assert.match(report,/REOPEN STORY CASE/);
assert.match(report,/COMPLETE A RETURN WITH ≤ 1 INJURY/);
assert.match(report,/FILING SECOND TRACK/);
assert.match(report,/CAUSE WHAT THE SOURCE TAPE ALREADY CONTAINS/);
assert.match(archive,/RETURN FILES/);
assert.match(main,/progressionEvents\.on\('\*',/,'causal capture subscribes through the progression event bus contract');
assert.match(main,/async function enterHushRun\(\)[\s\S]*scenes\.remove\('title'\)/,'the report fork cannot leave the title rendering underneath THE HUSH');
assert.match(main,/sensoryProfile:worldView\?\.sensoryProfile\|\|'story'/,'camera rigs pass their explicit sensory profile into the renderer');
assert.match(renderer,/const hushSense=sensoryProfile==='hush-prowl'\?1/,'Prowl has a dedicated renderer sensory treatment');
assert.match(renderer,/uHushSense/,'the HUSH room-read remains separate from story lighting');

console.log('second-return funnel contracts passed');
