import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import {makeRoofPasswordScene} from '../src/game/roof-password-scene.js';
import {roofGateEligibility} from '../src/game/roof-access.js';
import {shouldOpenPauseForEvent} from '../src/game/pause.js';
import {ROOF_PASSWORD,ROOF_PASSWORD_PAGE,ROOF_PASSWORD_HOST_ID} from '../src/data/roof-password.js';
import {PAGES} from '../src/data/conservatory-script.js';
import {ACADEMIC_GALLERY_PROPS} from '../src/data/academic-gallery-treatment.js';
import {paperAtlasIndex} from '../src/game/paper-assets.js';
const press=(scene,key,rest={})=>scene.key({key,...rest});
const type=(scene,word)=>[...word].forEach(key=>press(scene,key));

test('the word is discoverable on one reachable gallery furnishing, in a retained physical document',()=>{
 assert.equal(PAGES.filter(p=>p.id===ROOF_PASSWORD_PAGE.id).length,1);
 assert.equal(ROOF_PASSWORD_PAGE.hosted,ROOF_PASSWORD_HOST_ID);
 assert.ok(ROOF_PASSWORD_PAGE.body.some(line=>typeof line?.raw==='string'&&line.raw.includes(ROOF_PASSWORD)));
 const host=ACADEMIC_GALLERY_PROPS.find(p=>p.id===ROOF_PASSWORD_HOST_ID);
 assert.ok(host&&host.interactive&&host.mesh==='loose_note');assert.equal(host.floorOverride,10);
 assert.match(ROOF_PASSWORD_PAGE.pickupNoiseLabel,/paper/);
});

test('incorrect physical wheel settings never unlock; keyboard correction can submit the actual word once',()=>{
 let opened=0,cancelled=0;
 const s=makeRoofPasswordScene({verify:word=>roofGateEligibility(new Set(['master']),word).canOpen,onOpen:()=>opened++,onCancel:()=>cancelled++});
 const world={id:'world'};scenes.replace(world);scenes.push(s);
 assert.equal(s.view().word,'AAAAAA');press(s,'Enter');assert.equal(opened,0);assert.match(s.view().error,/stop/);
 type(s,'SALMON');press(s,'Enter');assert.equal(opened,0);assert.equal(scenes.top(),s);
 for(let i=0;i<6;i++)press(s,'Backspace');assert.equal(s.view().word,'AAAAAA');
 type(s,ROOF_PASSWORD.toLowerCase());press(s,'Enter');assert.equal(opened,0,'opening follows the latch movement');
 s.update(.7);assert.equal(opened,1);assert.equal(cancelled,0);assert.equal(scenes.top(),world);
 press(s,'Enter');assert.equal(opened,1);scenes.clear();
});

test('Escape owns local cancellation and cannot open the run pause or grant roof access',()=>{
 let opened=0,cancelled=0;const world={id:'world'};
 const s=makeRoofPasswordScene({verify:()=>true,onOpen:()=>opened++,onCancel:()=>cancelled++});
 scenes.replace(world);scenes.push(s);type(s,'VES');
 assert.equal(shouldOpenPauseForEvent({storyMode:true,key:'Escape',topSceneId:s.id,localEscape:s.handlesEscape}),false);
 press(s,'Escape');assert.equal(opened,0);assert.equal(cancelled,1);assert.equal(scenes.top(),world);
 press(s,'Escape');assert.equal(cancelled,1);scenes.clear();
});

test('controller directions set the same six actual wheels and the school key is checked at submission',()=>{
 let hasKey=false,opened=0;const s=makeRoofPasswordScene({verify:word=>roofGateEligibility(new Set(hasKey?['master']:[]),word).canOpen,onOpen:()=>opened++});
 scenes.replace({id:'world'});scenes.push(s);
 for(const letter of ROOF_PASSWORD){for(let i=0;i<letter.charCodeAt(0)-65;i++)press(s,'ArrowUp');press(s,'ArrowRight');}
 assert.equal(s.view().word,ROOF_PASSWORD);press(s,'Enter');assert.equal(opened,0);
 hasKey=true;press(s,'Enter');assert.equal(opened,0,'a refused handle cannot immediately be retried');
 s.update(.45);press(s,'Enter');assert.equal(s.view().phase,'released');s.update(.7);assert.equal(opened,1);scenes.clear();
});

test('actual roof prop adapter opens from the word with zero takes, persists the existing flag, and respects open saves',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=main.indexOf('function interactAcademicRoofProp('),end=main.indexOf('\n// World interaction follows',start);
 assert.ok(start>0&&end>start);const body=main.slice(start,end);
 assert.doesNotMatch(body,/completedRecordingTakes|recorder check|accepted room take/);
 let access=false,denied=0,refreshes=0,cues=0;
 const env={roofGateEligibility,makeRoofPasswordScene,playerKeys:new Set(['master']),scenes,facilityMapCache:{key:'old'},
  flagTest:()=>access,flagApply:flags=>{assert.deepEqual(flags,['roof.access']);access=true;},
  STORY:{menuDenied:()=>denied++,menuMove(){},menuLatch(){},menuBack(){}},SPEECH:{say(){}},CUES:{CUE:{door:'door'},playCue:()=>cues++},refreshWorldProps:()=>refreshes++};
 const interact=Function('env',`with(env){return (${body});}`)(env);
 scenes.replace({id:'world'});assert.equal(interact({action:'roof-gate'}),true);assert.equal(access,false);
 const scene=scenes.top();type(scene,ROOF_PASSWORD);press(scene,'Enter');assert.equal(access,false,'the persistent access flag waits for the real latch animation');scene.update(.7);assert.equal(access,true);assert.equal(cues,1);assert.equal(refreshes,1);assert.equal(denied,0);
 assert.equal(interact({action:'roof-gate'}),true);assert.equal(scenes.top().id,'world');assert.equal(cues,1,'existing open saves remain open without resubmission');scenes.clear();
});

test('the actual world paper adapter binds the hosted slip to its baked word while furniture stays furniture',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const start=main.indexOf('function worldPaperIndex('),end=main.indexOf('\n// SOURCE HAS ONE LIGHTING CONTEXT',start);
 assert.ok(start>0&&end>start);
 const resolve=Function('env',`with(env){return (${main.slice(start,end)});}`)({PAGES,paperAtlasIndex,
  ambientPaperDocumentId:()=>{throw new Error('a named service slip must not use ambient filler');}});
 const index=paperAtlasIndex(ROOF_PASSWORD_PAGE.id);
 assert.ok(index>=0,'the shipped paper catalogue contains the credential');
 assert.equal(resolve({id:ROOF_PASSWORD_HOST_ID,mesh:'loose_note'}),index,
  'the paper lying on the console and the retained reader share the actual baked page');
 assert.ok(PAGES.some(p=>p.hosted==='deadend-ground-credenza'),'the furniture control really hosts a document');
 assert.equal(resolve({id:'deadend-ground-credenza',mesh:'classic_credenza_01'}),-1,
  'hosting an inspectable page does not texture the entire cabinet as paper');
 assert.equal(resolve({id:'unrelated-note',mesh:'loose_note'}),-1,'an unrelated blank sheet is not a password clue');
 assert.equal(resolve({id:ROOF_PASSWORD_HOST_ID,mesh:'loose_note',paperIndex:12}),12,
  'an explicit caller-owned texture index retains precedence');
});

test('the actual closed-threshold refusal directs players to the service word without suggesting a take',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const start=main.indexOf("if(move.edgePortal==='academic-loggia-to-roof-service'&&!flagTest('roof.access')){");
 const end=main.indexOf('\n      }',start)+8;
 assert.ok(start>0&&end>start);const branch=main.slice(start,end);
 assert.doesNotMatch(branch,/recorder|recording|take/i);
 const messages=[],move={edgePortal:'academic-loggia-to-roof-service'};
 const act=Function('move','flagTest','pushEvent',branch);
 act(move,()=>false,text=>messages.push(text));
 assert.equal(messages.length,1);assert.match(messages[0],/service word.*gallery/i);
 act(move,()=>true,text=>messages.push(text));
 assert.equal(messages.length,1,'an already-open saved route remains silent');
});

test('the actual God gate diagnostic follows the word lock and never consults recording totals',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const start=main.indexOf('function godRoofGateCheck('),end=main.indexOf('\nfunction godCycleRenStage(',start);
 assert.ok(start>0&&end>start);const body=main.slice(start,end);
 assert.doesNotMatch(body,/completedRecordingTakes|recordedTakeCheck/);
 let access=false;
 const playerKeys=new Set(['master']);
 const check=Function('env',`with(env){return (${body});}`)({playerKeys,roofGateEligibility,
  flagTest:()=>access,completedRecordingTakes:()=>{throw new Error('a word lock cannot depend on recorded takes');}});
 assert.match(check(),/SET SERVICE WORD/);
 playerKeys.clear();assert.match(check(),/NO MASTER KEY/);
 access=true;assert.equal(check(),'OPEN','a previously opened gate stays open after loading');
});
