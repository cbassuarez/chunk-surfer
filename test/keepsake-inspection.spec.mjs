import test from 'node:test';
import assert from 'node:assert/strict';
import {keepsakeInspectionActions} from '../src/game/keepsake-inspection.js';

test('numbered tape inspection follows changing contents and exact history, without mutating the ledger',()=>{
  const item={content:{kind:'take',roomId:'practice_2',outcome:'clean'},source:'b3-store',
    history:[{kind:'tutorial'},{kind:'take',roomId:'practice_2',outcome:'rejected'},{kind:'take',roomId:'practice_2',outcome:'clean',over:{roomId:'practice_2'}}]};
  const before=structuredClone(item),actions=keepsakeInspectionActions('recording-cassette:5',item);
  assert.match(actions.find(a=>a.id==='label').lines[0].text,/practice 2.*CLEAN/);
  assert.equal(actions.find(a=>a.id==='history').lines.length,3);
  assert.match(actions.find(a=>a.id==='stock').lines[0].text,/two sealed blanks found in B3/);
  assert.deepEqual(item,before);assert.equal(actions.some(a=>a.intent||a.effect||a.command),false);
});

test('Ren and the eyes expose distinct physical evidence without resolving their quests',()=>{
  const tape=keepsakeInspectionActions('ren-home-cassette');
  assert.match(tape.find(a=>a.id==='warning').lines[0].text,/YOU ASKED US TO KEEP THIS FROM YOU/);
  assert.match(tape.find(a=>a.id==='custody').lines.at(-1).text,/Listening and returning.*separate/);
  const eyes=keepsakeInspectionActions('marble-eyes');
  assert.notDeepEqual(eyes[0].view,eyes[1].view);assert.match(eyes[1].lines[0].text,/pieces of a face/);
  assert.deepEqual(keepsakeInspectionActions('keyring'),[]);
});
