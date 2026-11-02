import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as MODEL from '../src/game/archive-model.js';
import * as DECK from '../src/render/achievement-deck.js';
import {achievementEntries,achievementCompletion} from '../src/progression/achievements.js';
import {ACHIEVEMENT_DEFS} from '../src/progression/achievement-defs.js';
import {completionCollections} from '../src/progression/completion.js';
import {returnFileEntries} from '../src/game/second-shift.js';
import {returnDefinition} from '../src/progression/report.js';
import {endingHintForEnding} from '../src/game/post-run-copy.js';
import {createHitRegions} from '../src/render/hit-regions.js';
import {machinePanelBody,machinePanelAperture} from '../src/render/presentation.js';
import {fitText,fitLines} from '../src/render/fit-text.js';
import {freshSave} from '../src/game/save.js';
import {playDurationLine} from '../src/game/play-duration.js';
import {UI_COLOR} from '../src/render/palette.js';
import {inputPrompt,activeInputPromptDevice} from '../src/game/bindings.js';
import {measureElectronicText} from '../src/render/electronic-text.js';

function fixture(meta={},size={cols:116,rows:40}){
 const calls=[],regions=[],cells=[],nodes=new Map(),clips=[];let pop=0,body=null,aperture=null,focused=true;
 const save=freshSave(),before=JSON.stringify(meta),hits=createHitRegions(),add=hits.add;
 hits.add=r=>{regions.push(r);return add(r);};
 const text=(x,y,value,role,alpha)=>calls.push({x,y,value:String(value),role,alpha,w:String(value).length,h:1,clip:clips.at(-1)});
 const withClip=(r,fn)=>{clips.push(r);try{return fn();}finally{clips.pop();}};
 const context={...MODEL,...DECK,achievementEntries,achievementCompletion,completionCollections,returnFileEntries,returnDefinition,endingHintForEnding,fitText,fitLines,UI_COLOR,playDurationLine,inputPrompt,activeInputPromptDevice,
  getSave:()=>save,getMeta:()=>{throw Error('Must not read real profile');},uiCellMetrics:()=>({cellW:8.45,cellH:20}),
  uiSize:()=>size,uiFill:()=>{},uiLine:()=>{},uiText:text,uiWrap:(value,width)=>fitLines(value,width),uiWithClip:withClip,
  drawVfdText:(x,y,value,o={})=>{text(x,y,value);return String(value).length*(o.scale||1);},drawAchievementIcon:()=>{},createHitRegions:()=>hits,
  drawAchievementRule:()=>{},drawAchievementCell:(id,r,o)=>cells.push({id,...r,...o}),
  drawAchievementVfd:(value,x,y,o={})=>{let w=measureElectronicText(value,{fontSize:o.fontPx||15,cellWidth:(o.fontPx||15)*.64})/8.45;w=Math.min(w,o.width??Infinity);if(o.align==='right')x-=w;else if(o.align==='center')x-=w/2;calls.push({x,y,value:String(value).toUpperCase(),w,h:(o.fontPx||15)/20,vfd:true,clip:clips.at(-1)});},
  drawAchievementDeckControl:(r,label,options={})=>calls.push({...r,value:label,hardware:true,options}),
  withAchievementDeck:(r,o,fn)=>DECK.withAchievementDeck(r,o,b=>{body=b;aperture={...b};return withClip(b,()=>fn(b));}),
  withMachinePanel:(x,y,w,h,o,fn)=>{body=machinePanelBody(x,y,w,h,{footer:'CONTROLS'});aperture=machinePanelAperture(x,y,w,h);fn(body);},
  AUDIO:new Proxy({},{get:()=>()=>{}}),PB:{archivedPlaybackActive:()=>false},takeStamp:()=>'',archivedRecordingRows:()=>[],archivedRecordingStatus:()=>'',
  scenes:{pop:()=>pop++},document:{hasFocus:()=>focused,getElementById:id=>nodes.get(id),createElement:()=>({style:{},setAttribute(){},remove(){}}),body:{appendChild:n=>nodes.set(n.id,n)}},
 };
 const source=fs.readFileSync(new URL('../src/game/archive.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm,'').replaceAll('export function ','function ');
 vm.createContext(context);vm.runInContext(source,context);const scene=context.makeArchiveScene({meta,getRun:()=>save.run});scene.enter();
 const render=()=>{calls.length=0;regions.length=0;cells.length=0;scene.render();return calls;};render();
 return{scene,render,calls,regions,cells,nodes,setFocus:v=>focused=v,body:()=>body,aperture:()=>aperture,popped:()=>pop,unchanged:()=>assert.equal(JSON.stringify(meta),before)};
}
const allMeta=()=>({achievements:Object.fromEntries(ACHIEVEMENT_DEFS.map(d=>[d.id,{unlockedAt:1000}]))});

test('MASTER INDEX uses the canonical 38 denominator, all challenges, and honest cross-run100%',()=>{
 for(const [meta,percent]of[[{achievements:{unknown:{unlockedAt:1}}},'0%'],[allMeta(),'100%']]){
  const f=fixture(meta);assert.equal(f.scene.view().percent,percent);assert.equal(f.scene.view().completion.total,38);assert.ok(f.calls.some(c=>c.value.includes(percent)));f.unchanged();
 }
 const f=fixture({achievements:{[ACHIEVEMENT_DEFS[0].id]:{unlockedAt:1}}});f.scene.key({key:'f'});assert.equal(f.scene.view().count,37);f.scene.key({key:'f'});assert.equal(f.scene.view().count,1);f.unchanged();
});

test('the full-size icon matrix presents all38 slots and every one is reached by real scene input',()=>{
 const f=fixture();assert.equal(f.regions.filter(r=>r.id.startsWith('entry:')).length,38);const visited=new Set([f.scene.view().selectedId]);
 for(let n=1;n<38;n++){f.scene.key({key:'ArrowRight',controller:true});visited.add(f.scene.view().selectedId);}
 assert.equal(visited.size,38);assert.equal(f.scene.view().selectedId,ACHIEVEMENT_DEFS.at(-1).id);
 f.scene.key({key:'Home'});const columns=f.scene.view().gridColumns;f.scene.key({key:'ArrowDown',controller:true});assert.equal(f.scene.view().selectedIndex,columns);f.scene.key({key:'ArrowUp',controller:true});assert.equal(f.scene.view().selectedIndex,0);
 f.unchanged();
});

test('compact matrix scrolls rows and still reaches the final real slot without tiny icons',()=>{
 const f=fixture({}, {cols:68,rows:20});assert.ok(f.cells.length<38);f.scene.key({key:'End'});f.render();assert.equal(f.scene.view().selectedId,'ACH_COMPLETE_ARCHIVE');assert.ok(f.scene.view().gridStartRow>0);assert.ok(f.cells.some(c=>c.id==='ACH_COMPLETE_ARCHIVE'));assert.ok(f.cells.every(c=>c.w*8.45>=40));
 f.scene.key({key:'Enter'});f.render();assert.equal(f.scene.view().detailOpen,true);assert.ok(f.calls.some(c=>c.value.includes('MASTER COPY')));f.unchanged();
});

test('concealed names/icons remain anonymous and hint/full-reveal are separate local actions',()=>{
 const f=fixture(),index=ACHIEVEMENT_DEFS.findIndex(d=>d.hidden&&d.hint);for(let i=0;i<index;i++)f.scene.key({key:'ArrowRight'});f.render();
 const def=ACHIEVEMENT_DEFS[index];assert.equal(f.scene.view().selected.concealed,true);assert.ok(f.cells.find(c=>c.id===def.id).concealed);assert.ok(!f.nodes.get('archive-a11y-status').textContent.includes(def.description));
 f.scene.key({key:'h'});assert.equal(f.scene.view().selected.hintVisible,true);assert.equal(f.scene.view().selected.concealed,true);
 f.scene.key({key:'r'});f.scene.key({key:'Enter',repeat:true});assert.equal(f.scene.view().selected.concealed,true);f.scene.key({key:'Escape'});assert.equal(f.scene.view().revealArmed,false);
 f.scene.key({key:'r'});f.scene.key({key:'Enter'});assert.equal(f.scene.view().selected.concealed,false);assert.equal(f.scene.view().selected.unlocked,false);f.unchanged();
});

test('pointer categories and all archive tabs preserve discoveries and filed-run panes',()=>{
 const f=fixture(),r=f.regions.find(r=>r.id==='category:method');f.scene.pointer({type:'pointerdown',cellX:r.x+.1,cellY:r.y+.1});assert.equal(f.scene.view().category,'method');f.render();
 const tab=f.regions.find(r=>r.id==='tab:discoveries');f.scene.pointer({type:'pointerdown',cellX:tab.x+.2,cellY:tab.y+.2});assert.equal(f.scene.view().tab,'discoveries');f.render();assert.ok(f.calls.some(c=>c.value.includes('DISCOVERIES 0/30')));
 f.scene.key({key:'Tab'});assert.equal(f.scene.view().tab,'history');f.scene.key({key:'Tab'});assert.equal(f.scene.view().tab,'achievements');f.unchanged();
});

test('mapped controller input reaches filter, category, hints and full reveal',()=>{
 const f=fixture(),key=(key,action)=>f.scene.key({key,controller:true,controllerAction:action});
 key('q','tabPrev');assert.equal(f.scene.view().tab,'history');key('Tab','tabNext');assert.equal(f.scene.view().tab,'achievements');f.render();
 key('ArrowUp','move_up');assert.equal(f.scene.view().listFocus,'filter');key('ArrowUp','move_up');assert.equal(f.scene.view().listFocus,'categories');key('ArrowRight','move_right');assert.equal(f.scene.view().category,'work');
 key('ArrowDown','move_down');key('Enter','confirm');assert.equal(f.scene.view().filter,'locked');key('ArrowDown','move_down');
 // Return to all categories through the same physical-category control.
 f.render();const all=f.regions.find(r=>r.id==='category:all');f.scene.pointer({type:'pointerdown',cellX:all.x+.1,cellY:all.y+.1});
 while(!f.scene.view().selected.concealed)key('ArrowRight','move_right');
 key('Enter','confirm');key('Enter','confirm');assert.equal(f.scene.view().selected.hintVisible,true);key('ArrowRight','move_right');assert.equal(f.scene.view().detailAction,'reveal');key('Enter','confirm');assert.equal(f.scene.view().revealArmed,true);key('Enter','confirm');assert.equal(f.scene.view().selected.concealed,false);f.unchanged();
});

test('all real titles/requirements are retained through word wrapping and compact inspection scroll',()=>{
 for(const def of ACHIEVEMENT_DEFS){for(const width of[260,410]){const title=DECK.achievementTextLines(def.name,width,{fontPx:18});const desc=DECK.achievementTextLines(def.description,width,{fontPx:14});assert.equal(title.join(' '),def.name.toUpperCase());assert.equal(desc.join(' '),def.description.toUpperCase());}}
 const f=fixture(allMeta(),{cols:68,rows:18});const index=ACHIEVEMENT_DEFS.findIndex(d=>d.id==='ACH_COMPLETE_ARCHIVE');for(let i=0;i<index;i++)f.scene.key({key:'ArrowRight'});f.scene.key({key:'Enter'});f.render();assert.ok(f.scene.view().maxDetailScroll>0);
 for(let i=0;i<30;i++){f.scene.key({key:'ArrowDown'});f.render();}assert.equal(f.scene.view().detailScroll,f.scene.view().maxDetailScroll);
 f.scene.key({key:'Escape'});assert.equal(f.popped(),0);f.scene.key({key:'Escape'});assert.equal(f.popped(),1);f.unchanged();
});

test('displayed grid cells and emitted VFD content stay in their actual display budgets',()=>{
 for(const size of[{cols:116,rows:40},{cols:90,rows:30},{cols:68,rows:20}]){
  const f=fixture({},size);const check=()=>{f.render();const b=f.body();for(const cell of f.cells){assert.ok(cell.x>=b.x&&cell.x+cell.w<=b.x+b.w+.01);assert.ok(cell.y>=b.y&&cell.y+cell.h<=b.y+b.h+.01);}for(const c of f.calls.filter(c=>c.vfd)){const clip=c.clip||b;assert.ok(c.x>=clip.x-.01&&c.x+c.w<=clip.x+clip.w+.01,JSON.stringify(c));assert.ok(c.y>=b.y-.01&&c.y+c.h<=b.y+b.h+.01,JSON.stringify(c));}};
  check();f.scene.key({key:'ArrowRight'});f.scene.key({key:'ArrowRight'});f.scene.key({key:'h'});check();f.scene.key({key:'r'});check();f.scene.key({key:'Enter'});check();
 }
});

test('semantic pigment is consistent across tabs, category keys, filters and all real slots',()=>{
 const f=fixture();
 for(const[label,category]of[['ACHIEVEMENTS 38','work'],['DISCOVERIES 0/30','disclosures'],['RUNS 0','returns']])assert.equal(f.calls.find(c=>c.value===label).options.category,category);
 for(const def of ACHIEVEMENT_DEFS)assert.equal(f.cells.find(c=>c.id===def.id).category,def.category);
 const r=f.regions.find(r=>r.id==='category:method');f.scene.pointer({type:'pointerdown',cellX:r.x+.1,cellY:r.y+.1});f.scene.pointer({type:'pointerup',cellX:-1,cellY:-1});f.scene.key({key:'f'});f.render();
 assert.equal(f.calls.find(c=>c.value==='LOCKED').options.category,'method');f.unchanged();
});

test('resin keys are normally open: pointer release anywhere removes travel but retains selection light',()=>{
 const f=fixture(),r=f.regions.find(r=>r.id==='category:method');
 f.scene.pointer({type:'pointerdown',cellX:r.x+.1,cellY:r.y+.1});f.render();
 let key=f.calls.find(c=>c.value.startsWith('MASTERY '));assert.equal(key.options.selected,true);assert.equal(key.options.pressed,true);assert.equal(f.scene.view().pressedId,'category:method');
 f.scene.pointer({type:'pointerup',cellX:-20,cellY:-20});f.render();key=f.calls.find(c=>c.value.startsWith('MASTERY '));assert.equal(key.options.selected,true);assert.equal(key.options.pressed,false);assert.equal(f.scene.view().pressedId,null);
 f.unchanged();
});

test('keyboard/controller actuation clears on keyup and focus loss cannot strand a depressed key',()=>{
 const f=fixture();f.scene.key({key:'f',code:'KeyF'});f.render();assert.equal(f.calls.find(c=>c.value==='LOCKED').options.pressed,true);
 f.scene.keyup({key:'x',code:'KeyX'});assert.equal(f.scene.view().pressedId,'filter');f.scene.keyup({key:'f',code:'KeyF'});assert.equal(f.scene.view().pressedId,null);
 f.scene.key({key:'Enter',controller:true,controllerAction:'confirm'});assert.equal(f.scene.view().pressedId,'entry:0');f.scene.keyup({key:'Enter',controller:true,controllerAction:'confirm'});assert.equal(f.scene.view().pressedId,null);
 f.scene.key({key:'f',code:'KeyF'});f.setFocus(false);f.scene.update();assert.equal(f.scene.view().pressedId,null);f.setFocus(true);
 f.scene.key({key:'f',code:'KeyF'});f.scene.resume();assert.equal(f.scene.view().pressedId,null);f.unchanged();
});
