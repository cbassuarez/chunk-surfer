import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {VAN_REAR_STOCK_PARTS,vanRearStockState} from '../src/data/van-rear-stock.js';
import {normalizeFieldKit,resolveFieldKit} from '../src/game/field-kit.js';
import {packedWorkbenchGroups,packWorkbenchGroup} from '../src/game/bench-preparation.js';
import {freshMeta} from '../src/progression/schema.js';
import {workbenchCatalog,WORKBENCH_VARIANTS} from '../src/data/workbench-catalog.js';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import * as productionProps from '../src/game/props.js';

const fieldKit={headphones:'reference',microphone:'reference',recorder:'reference',flashlight:'reference',cosmetics:{faceplate:'aluminum'}};
test('the physical van uses the same fifteen ordinary choices and fitting destinations as preparation',()=>{
 assert.equal(VAN_REAR_STOCK_PARTS.length,15);
 assert.equal(new Set(VAN_REAR_STOCK_PARTS.map(p=>p.mesh)).size,15);
 assert.ok(VAN_REAR_STOCK_PARTS.every(p=>!p.mesh.includes('witness')));
 for(const bagTaken of [false,true])for(const packedGroups of [[],['headphones'],['microphone','recorder','flashlight'],Object.keys(WORKBENCH_VARIANTS)]){
  const state={bagTaken,fieldKit,packedGroups};
  const catalog=workbenchCatalog(state);
  for(const part of vanRearStockState(state))assert.equal(part.visible,catalog.find(o=>o.key===part.key).destination==='bench',part.key);
 }
});
test('revising any packed choice returns the previous option to stock and takes only the newly selected option',()=>{
 for(const [group,options]of Object.entries(WORKBENCH_VARIANTS))for(let i=0;i<options.length;i++){
  const kit=structuredClone(fieldKit);if(group==='faceplate')kit.cosmetics.faceplate=options[i];else kit[group]=options[i];
  const result=vanRearStockState({bagTaken:true,fieldKit:kit,packedGroups:[group]});
  for(const part of result.filter(p=>p.group===group))assert.equal(part.visible,part.optionId!==options[i]);
 }
 const shut=vanRearStockState({closed:true,bagTaken:true,fieldKit,packedGroups:[]});
 assert.ok(shut.every(p=>!p.visible));
});
test('ordinary stock has matching nonblocking physical props at the same van-local origin',()=>{
 const van=CONSERVATORY_PROPS.find(p=>p.id==='yard-van');
 for(const part of VAN_REAR_STOCK_PARTS){
  const prop=CONSERVATORY_PROPS.find(p=>p.id===part.id);
  assert.ok(prop);assert.equal(prop.mesh,part.mesh);assert.equal(prop.blocks,false);assert.equal(prop.interactive,false);
  assert.deepEqual([prop.x,prop.y,prop.yaw],[van.x,van.y,van.yaw]);assert.equal(PROP_MESH[part.mesh].blocks,false);
 }
});
test('the live host reconciles actual saved packing and restores revised stock on return or reload',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const block=main.slice(main.indexOf('function syncVanProps(){'),main.indexOf('function vanDoorInstances(){'));
 assert.match(block,/packedGroups:packedWorkbenchGroups\(getSave\(\).flags\)/);
 assert.match(block,/fieldKit:resolveFieldKit\(getSave\(\).fieldKit,getMeta\(\)\)/);
 assert.match(block,/if\(!part.visible\)PROPS.setLooseProp\(part.id,null\)/);
 assert.match(block,/else if\(!PROPS.propById\(part.id\)\)PROPS.restoreAuthoredProp\(part.id\)/);
});

test('the production bay follows opening, changing a packed choice, sign-out and physical door landing',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const source=main.slice(main.indexOf('function syncVanProps(){'),main.indexOf('// Two instances, hung'));
 const state={flags:{},fieldKit:normalizeFieldKit()},present=new Set(CONSERVATORY_PROPS.map(p=>p.id));let open=1;
 const context={planName:'conservatory',FP:{isLoaded:()=>true},getSave:()=>state,getMeta:()=>freshMeta(),
  flagTest:id=>!!state.flags[id],vanDoorOpenFraction:()=>open,vanRearStockState,resolveFieldKit,packedWorkbenchGroups,
  PROPS:{setLooseProp:(id,value)=>{assert.equal(value,null);present.delete(id);},propById:id=>present.has(id),restoreAuthoredProp:id=>present.add(id)}};
 vm.createContext(context);vm.runInContext(source,context);context.syncVanProps();
 assert.ok(present.has('yard-van-field-case'));assert.ok(!present.has('yard-van-field-case-open'));
 state.flags['bag.taken']=true;state.flags=packWorkbenchGroup(state.flags,'headphones');context.syncVanProps();
 assert.ok(!present.has('yard-van-field-case'));assert.ok(present.has('yard-van-field-case-open'));
 assert.ok(!present.has('yard-van-stock-headphones-reference'));assert.ok(present.has('yard-van-stock-headphones-closed'));
 state.fieldKit.headphones='closed';context.syncVanProps();
 assert.ok(present.has('yard-van-stock-headphones-reference'));assert.ok(!present.has('yard-van-stock-headphones-closed'));
 state.flags['kit.fitted']=true;context.syncVanProps();
 assert.ok(!present.has('yard-van-field-case-open'));assert.ok(present.has('yard-van-stock-headphones-open'));
 state.flags['van.closed']=true;context.syncVanProps();
 assert.ok(present.has('yard-van-lamp'),'practical remains while the leaves swing over it');
 assert.ok(VAN_REAR_STOCK_PARTS.every(p=>!present.has(p.id)));
 open=0;context.syncVanProps();assert.ok(!present.has('yard-van-lamp'));
});

test('every prop API called by the production van synchronizer is actually exported',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const source=main.slice(main.indexOf('function syncVanProps(){'),main.indexOf('// Two instances, hung'));
 const names=[...source.matchAll(/PROPS\.([A-Za-z0-9_]+)\(/g)].map(match=>match[1]);
 assert.ok(names.includes('restoreAuthoredProp'));
 for(const name of new Set(names))assert.equal(typeof productionProps[name],'function',`live props API must export ${name}`);
});
