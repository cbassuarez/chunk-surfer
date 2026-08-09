import fs from 'node:fs';
import { conservatory } from '../../../src/data/floorplan/conservatory.js';
import { CHAPEL_KEY_CHECK, PAGES } from '../../../src/data/conservatory-script.js';
import { CONSERVATORY_PROPS } from '../../../src/data/conservatory-props.js';
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
ck('sheet 6 supplies the first clue without the answer',/replacement lock/i.test(logText)&&/front of house/i.test(logText)&&!/C-17/i.test(logText));
ck('later sheets do not bypass the two-clue check',!/C-17/i.test(pageText(PAGES.find((p)=>p.id==='page-9'))));

const rings=CONSERVATORY_PROPS.filter((prop)=>prop.action==='chapel-key-ring');
ck('key-control exposes three independently aimed props',rings.map((prop)=>prop.keyTag).join('|')==='CH-04|C-17|FOH-M');
ck('the cabinet shell is non-interactive',CONSERVATORY_PROPS.find((prop)=>prop.id==='box-office-key-cabinet')?.interactive===false);
ck('key-control is physical rather than a choice overlay',Object.values(CHAPEL_KEY_CHECK).every((node)=>!node.choices));
ck('early handling does not call a dropped ring wrong',!/wrong|motive|guess/i.test(CHAPEL_KEY_CHECK.early_drop.lines.map((line)=>line.text).join(' ')));
ck('known handling may recognise a non-C-17 ring',/Not C-seventeen/.test(CHAPEL_KEY_CHECK.known_drop.lines.map((line)=>line.text).join(' ')));
const ringAction=main.slice(main.indexOf("if(hit.action==='chapel-key-ring')"),main.indexOf("if(hit.action==='tower-hammer-isolator')"));
ck('selection is permitted before either clue',!ringAction.includes('chapel.clue.log')&&!ringAction.includes('chapel.clue.ledger'));
ck('C-17 grants and persists the existing item contract',ringAction.includes("items.add('chapel_key')")&&ringAction.includes("flagApply(['chapel.keyTaken'])"));
ck('wrong tags use the runtime-only motion path',ringAction.includes('beginKeyCabinetMotion(hit)')&&main.includes('stepKeyCabinetDrop(keyCabinetMotion,now)'));
ck('one impact edge owns both noise and threat',main.includes('if(frame.impact)')&&main.includes('REC.emitNoise(.46')&&main.includes('STAB.reportThreat()'));
ck('saved C-17 restores to the player key ring',main.includes("includes('chapel_key'))playerKeys.add('chapel')"));
const unknownKeyEntry=normalizeEquipment({id:'key-c17',label:'key ring · tag C-17',value:'ADDED'});
ck('an early C-17 remains unidentified in the bag',unknownKeyEntry.title==='KEY RING'&&unknownKeyEntry.subtitle==='TAG C-17'&&unknownKeyEntry.facts.some((fact)=>fact[1]==='UNKNOWN'));
const chapelKeyEntry=normalizeEquipment({id:'chapel-key',label:'chapel key · C-17',value:'ADDED'});
ck('ledger or route knowledge identifies the acquired key',main.includes("id:chapelKeyIsIdentified()?'chapel-key':'key-c17'")&&chapelKeyEntry.title==='CHAPEL KEY'&&chapelKeyEntry.subtitle==='TAG C-17');
const keyControlCopy=[logText,...Object.values(CHAPEL_KEY_CHECK).flatMap((node)=>node.lines.map((line)=>line.text))].join(' ');
ck('key-control copy uses replacement lock and key ring',!/\bcore\b|\btumbler\b|keyring/i.test(keyControlCopy));

const authoredRows=conservatory.levels.flatMap((level)=>level.rows||[]).join('');
ck('the conservatory contains no old chapel passage glyph',!authoredRows.includes('='));

if(!pass){console.error('\n❌ KEY CONTROL FAILURES');process.exit(1);}
console.log('\n✅ KEY CONTROL PASSED');
