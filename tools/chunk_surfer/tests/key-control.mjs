import fs from 'node:fs';
import { conservatory } from '../../../src/data/floorplan/conservatory.js';
import { CHAPEL_KEY_CHECK, PAGES } from '../../../src/data/conservatory-script.js';
import * as FP from '../../../src/world/floorplan.js';
import { normalizeEquipment } from '../../../src/game/bag-model.js';

let pass=true;
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};
const main=fs.readFileSync(new URL('../../../src/main.js',import.meta.url),'utf8');

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});

const box=FP.toRuntimePoint({x:94,y:13});
const chapel=FP.toRuntimePoint({x:92,y:58});
ck('box-office staff leaf is locked without master',FP.canStep(box.x,box.y+2,box.x,box.y,{keys:new Set()}).why==='locked');
ck('box-office staff leaf answers to master',FP.canStep(box.x,box.y+2,box.x,box.y,{keys:new Set(['master'])}).why==='closed');
FP.setDoorOpen('foh-office',true);
ck('box-office staff leaf opens after the master turns it',FP.canStep(box.x,box.y+2,box.x,box.y,{keys:new Set(['master'])}).ok);
ck('chapel leaves remain locked to the standard ring',FP.canStep(chapel.x,chapel.y-2,chapel.x,chapel.y,{keys:new Set(['master'])}).why==='locked');
ck('C-17 answers to the complete keyring',FP.canStep(chapel.x,chapel.y-2,chapel.x,chapel.y,{keys:new Set(['master','chapel'])}).why==='closed');
FP.setDoorOpen('chapel-c17',true);
ck('C-17 opens the complete chapel threshold',FP.canStep(chapel.x,chapel.y-2,chapel.x,chapel.y,{keys:new Set(['master','chapel'])}).ok);

const log=PAGES.find((p)=>p.id==='page-6');
const pageText=(page)=> (page?.body||[]).map((line)=>typeof line==='string'?line:line?.raw||'').join(' ');
const logText=pageText(log);
ck('sheet 6 supplies the first clue without the answer',/replacement (?:lock )?core/i.test(logText)&&/front of house/i.test(logText)&&!/C-17/i.test(logText));
ck('later sheets do not bypass the two-clue check',!/C-17/i.test(pageText(PAGES.find((p)=>p.id==='page-9'))));

const choices=CHAPEL_KEY_CHECK.start.choices;
ck('key-control presents the three authored tags',choices.map((c)=>c.keyTag).join('|')==='CH-04|C-17|FOH-M');
ck('only replacement-core C-17 grants the key',choices.filter((c)=>c.goto==='right').map((c)=>c.keyTag).join('|')==='C-17');
ck('a wrong tag is noisy and retryable',CHAPEL_KEY_CHECK.wrong.goto==='start'&&main.includes('REC.emitNoise(.46'));
ck('the clue gates and key grant are persisted',main.includes("flagTest('chapel.clue.log')")&&main.includes("flagTest('chapel.clue.ledger')")&&main.includes("items.add('chapel_key')"));
ck('saved C-17 restores to the player key ring',main.includes("includes('chapel_key'))playerKeys.add('chapel')"));
const chapelKeyEntry=normalizeEquipment({id:'chapel-key',label:'chapel key · C-17',value:'ADDED'});
ck('the bag identifies the acquired key',main.includes("id:'chapel-key'")&&chapelKeyEntry.title==='CHAPEL KEY'&&chapelKeyEntry.subtitle==='TAG C-17');

const authoredRows=conservatory.levels.flatMap((level)=>level.rows||[]).join('');
ck('the conservatory contains no old chapel passage glyph',!authoredRows.includes('='));

if(!pass){console.error('\n❌ KEY CONTROL FAILURES');process.exit(1);}
console.log('\n✅ KEY CONTROL PASSED');
