import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SOURCE_HALL_SHEET_COUNT,sourceHallSheet} from '../src/data/source-hall.js';
import {sourcePageFor} from '../src/data/source-pages.js';
import {ambientPaperDocumentId} from '../src/game/paper-assets.js';
import {buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET} from '../src/game/chunk-surf-god.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';

const source=readFileSync(new URL('../src/game/source-space-runtime.js',import.meta.url),'utf8');
const start=source.indexOf('  let paperFallbackKey=null;'),end=source.indexOf('\n  function pageInstances(',start);
assert.ok(start>=0&&end>start,'execute the exact production cache and document resolver');
function fixture(){
  let calls=0;
  const state={seed:4417,interactivePageSlot:null},sourceDialogue={assignments:{}};
  const context=vm.createContext({state,sourceDialogue,SOURCE_HALL_SHEET_COUNT,sourceHallSheet,ambientPaperDocumentId,
    sourcePageFor(...args){calls++;return sourcePageFor(...args);}});
  vm.runInContext(source.slice(start,end)+'\nthis.resolve=paperDocumentIdForSheet;this.size=()=>paperFallbackIds.size;',context);
  return{state,sourceDialogue,resolve:context.resolve,size:context.size,calls:()=>calls};
}
const uncached=(index,state)=>{
  const sheet=sourceHallSheet(state.seed,index,{slot:state.interactivePageSlot});
  const page=sourcePageFor(index,sheet?.documentStage??0,state.seed);
  return page?`source-page:${page.id}`:ambientPaperDocumentId(state.seed,index);
};
test('all stock addresses remain exactly equivalent and warm frames avoid corpus selection',()=>{
  const f=fixture(),expected=Array.from({length:SOURCE_HALL_SHEET_COUNT},(_,i)=>uncached(i,f.state));
  assert.deepEqual(expected.map((_,i)=>f.resolve(i)),expected);assert.equal(f.calls(),SOURCE_HALL_SHEET_COUNT);
  for(let frame=0;frame<10;frame++)assert.deepEqual(expected.map((_,i)=>f.resolve(i)),expected);
  assert.equal(f.calls(),SOURCE_HALL_SHEET_COUNT,'unchanged frames never reselect deterministic stock');
  assert.equal(f.size(),SOURCE_HALL_SHEET_COUNT);
  for(const i of[-1,960,961,999999,.5])assert.equal(f.resolve(i),uncached(i,f.state));
  assert.equal(f.size(),SOURCE_HALL_SHEET_COUNT,'invalid addresses cannot grow the finite cache');
});
test('live assignments immediately override stock, and seed, slot and new runtime reset ownership',()=>{
  const f=fixture(),stock=f.resolve(47);assert.equal(f.calls(),1);
  f.sourceDialogue.assignments['source-sheet-47']='newly-assigned';
  assert.equal(f.resolve(47),'source-page:newly-assigned');assert.equal(f.calls(),1);
  delete f.sourceDialogue.assignments['source-sheet-47'];assert.equal(f.resolve(47),stock);
  f.state.seed=9221;assert.equal(f.resolve(47),uncached(47,f.state));assert.equal(f.calls(),2);assert.equal(f.size(),1);
  f.state.interactivePageSlot=7;assert.equal(f.resolve(47),uncached(47,f.state));assert.equal(f.calls(),3);assert.equal(f.size(),1);
  const next=fixture();assert.equal(next.calls(),0);assert.equal(next.size(),0);assert.equal(next.resolve(47),stock);assert.equal(next.calls(),1);
});
test('the integrated remembered hall retains its full submitted print and exact warm matrices',()=>{
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LANDSCAPE,{seed:4417,marbleEyes:'returned'});
  const runtime=createSourceSpaceRuntime({initialState:built.state});runtime.setPlayerPosition(built.position);
  const frame=()=>runtime.propInstances(built.position.x,built.position.y,{time:77,reducedMotion:true,viewYaw:0});
  const first=frame(),second=frame();
  assert.ok(first.filter(p=>p.mesh==='loose_note').length>800,'the optimization cannot erase the dense historical paper field');
  assert.deepEqual(second.map(p=>[p.id,p.mesh,p.paperIndex,Array.from(p.matrix)]),first.map(p=>[p.id,p.mesh,p.paperIndex,Array.from(p.matrix)]));
});
