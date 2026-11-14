import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as L from '../src/game/cassette-ledger.js';
import * as PB from '../src/game/playback.js';
import {buildRunSummary} from '../src/progression/report.js';
import {ENDING_IDS} from '../src/progression/schema.js';
import {returnAccountLines} from '../src/game/return-report.js';
import {openingCabInspectionModel} from '../src/game/opening-cab-inspection.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const fn=name=>{const a=main.indexOf(`function ${name}(`);assert.ok(a>=0,name);return main.slice(a,main.indexOf('\n}',a)+2);};
const take=(l,roomId,outcome,extra={})=>L.recordOnCassette(l,L.nextCassette(l).n,{roomId,outcome,...extra}).ledger;

test('the shift is ticked once, in the cab, and signing at the lodge only adds his signature',()=>{
  let l=L.chooseShift(L.createCassetteLedger('contract'),'dead-air');
  assert.equal(l.issued,5);assert.equal(l.shiftChosen,'dead-air');
  assert.deepEqual(l.marks.map(m=>m.kind),['shift','issued']);
  assert.equal(L.chooseShift(l,'story'),l,'ink is permanent: the tick cannot move');
  l=L.signWorkOrder(l,{time:'21:42'});assert.deepEqual(l.marks.map(m=>m.kind),['shift','issued','signature']);
  const custom=L.chooseShift(L.createCassetteLedger('contract'),'custom');assert.equal(custom.shiftChosen,'custom');assert.equal(custom.issued,8);
  const late=L.signWorkOrder(L.createCassetteLedger('night'),{time:'21:42'});
  assert.deepEqual(late.marks.map(m=>m.kind),['shift','issued','signature'],'a run that skipped the cab still gets its tick');
});

test('the cab offers the tick only while the shift is open, on the work order alone',()=>{
  assert.equal(openingCabInspectionModel({shiftPending:true,workOrder:{id:'work-order'}},'job-papers').shiftPending,true);
  assert.equal(openingCabInspectionModel({shiftPending:false,workOrder:{id:'work-order'}},'job-papers').shiftPending,false);
  assert.equal(openingCabInspectionModel({shiftPending:true},'notebook').shiftPending,false);
  assert.match(fn('tickShiftOnWorkOrder'),/chooseShift\(cassetteLedger\(\),selection\.preset\)/);
  assert.match(main,/onChooseDifficulty:\(\)=>\{\n\s*if\(ownerPending\|\|failedSave\(\)\|\|!flagTest\('van\.difficulty\.pending'\)\)return;\n\s*if\(workOrderShiftTicked\(\)\)/);
  assert.match(main,/saveCommitSilent\(result\.patch\);inkFinalShiftSilent\(\);[\s\S]*?await persistVanWorkbenchState\(\)/);
});

test('a take on a lost cassette stops counting, survives a save that way, and counts again when found',()=>{
  PB.loadTakes([]);
  PB.debugSetTakes(['main_b3'],true);
  const id=PB.takeFor('main_b3').id;assert.deepEqual(PB.takeRoomIds(),['main_b3']);
  assert.equal(PB.setTakeLost(id,true),true);assert.deepEqual(PB.takeRoomIds(),[]);
  const saved=JSON.parse(JSON.stringify(PB.serializeTakes()));assert.equal(saved[0].lost,true);assert.equal(saved[0].counted,false);
  PB.loadTakes(saved);assert.deepEqual(PB.takeRoomIds(),[],'a reload does not find it for him');
  PB.setTakeLost(id,false);assert.deepEqual(PB.takeRoomIds(),['main_b3']);
  PB.loadTakes([]);
});

test('being taken, the B3 store and the chapel all go through the ledger',()=>{
  assert.match(main,/takeAnItem\(\);\n\s*lastCassetteLoss=loseCassetteWhenTaken\(\);/);
  assert.match(fn('loseCassetteWhenTaken'),/PB\.setTakeLost\(cassette\.content\.takeId,true\)/);
  assert.match(fn('tickLostCassettes'),/recoverCassette\(cassetteLedger\(\),spot\.n\)/);
  assert.match(main,/tickLostItem\(\);tickLostCassettes\(\);/);
  assert.match(main,/if\(hit\.action==='take-b3-cassettes'\)\{\n\s*const result=takeB3Store\(cassetteLedger\(\)\);/);
  assert.equal(CONSERVATORY_PROPS.find(p=>p.id==='b3-session-case')?.action,'take-b3-cassettes');
  assert.match(main,/REC\.addTake\('lux_nova'\);[^\n]*\n\s*fileChapelOnCassette\(\);/);
  assert.match(fn('fileChapelOnCassette'),/at\.options\.find\(option=>!option\.erases\)/,'the chapel never erases another room');
  assert.match(fn('pickCassetteToRecordOver'),/converse\('record-over'/);
});

test('the return report carries the cassettes and says whether the account is satisfied',()=>{
  let l=L.recordLevelCheck(L.chooseShift(L.createCassetteLedger('contract'),'night'));
  l=take(l,'main_b3','clean');l=take(l,'the_tub','rejected',{cause:'BREATH',atSec:41});l=L.takeB3Store(l).ledger;
  const save={run:{id:'r1',startedAt:0,status:'active',rules:{startedPreset:'night',currentPreset:'night'},integrity:{},ledger:{}},cassettes:l,playSeconds:120,rec:{tapes:[]}};
  const summary=buildRunSummary({endingId:ENDING_IDS[0],save,meta:{},now:120000});
  assert.deepEqual({issued:summary.workOrder.issued,found:summary.workOrder.found,clean:summary.workOrder.clean,rejected:summary.workOrder.rejected,
    satisfied:summary.workOrder.accountSatisfied},{issued:6,found:2,clean:1,rejected:1,satisfied:false});
  const text=returnAccountLines(summary,{width:80}).map(line=>line.text).join('\n');
  assert.match(text,/CASSETTES/);assert.match(text,/ISSUED\s+6 \+ 2 FOUND/);assert.match(text,/ACCOUNT\s+OPEN/);
  assert.match(text,/LAST NOTE\s+2\s+BREATH 0:41 - REJECT\. REDO/);
  assert.equal(buildRunSummary({endingId:ENDING_IDS[0],save:{...save,cassettes:undefined},meta:{},now:120000}).workOrder,null);
});
