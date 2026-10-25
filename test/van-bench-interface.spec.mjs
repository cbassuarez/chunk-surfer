import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,size} from './helpers/van-bench-fixture.mjs';
import {vanWorkbenchLayout,VAN_WORKBENCH_GROUPS,vanWorkbenchOptions} from '../src/render/van-workbench-view.js';
import {freshFieldKit} from '../src/game/field-kit.js';
const intersects=(a,b)=>a.x<b.x+b.w-1e-8&&a.x+a.w>b.x+1e-8&&a.y<b.y+b.h-1e-8&&a.y+a.h>b.y+1e-8;
test('one full-frame bench has only a case action and exit before an object is handled',()=>{
 const f=fixture();const l=f.scene.debugState().layout;assert.deepEqual(l.stage,{x:0,y:0,w:150,h:38});assert.equal(l.context,null);
 assert.deepEqual(l.regions.filter(r=>!r.object).map(r=>r.id),['van:close','van:continue']);assert.equal(l.regions.some(r=>/mode:|group:|standard|review/.test(r.id)),false);f.scene.exit();
});
test('keyboard and pointer share one object hierarchy with no duplicate option list',()=>{
 const f=fixture();const l=f.scene.debugState().layout;const objects=l.physical.filter(r=>r.keyboard!==false);
 assert.ok(objects.length>15);assert.ok(objects.every(r=>l.keyboardRegions.some(k=>k.id===r.id)));
 assert.equal(new Set(l.regions.map(r=>r.id)).size,l.regions.length);assert.equal(l.variants.length,0);
 for(let i=0;i<objects.length+3;i++)f.scene.key({key:'Tab'});assert.equal(f.calls.length,0);f.scene.exit();
});
test('context actions and cosmetic swatches remain positive, bounded and disjoint at minimum and large-text grids',()=>{
 for(const dimensions of [{cols:40,rows:16},{cols:75,rows:20},{cols:113,rows:30},size])for(const group of VAN_WORKBENCH_GROUPS){
  const state={fieldKit:freshFieldKit(),cosmeticMeta:{endingsSeen:['helped','drugged']}};
  const option=vanWorkbenchOptions(group.id,state).at(-1);const selection={key:group.id==='flashlightHousing'?'variant:flashlight:reference':'recorder',item:'recorder',group:group.id,optionId:option.id,customizing:group.cosmetic};
  const l=vanWorkbenchLayout(dimensions,state,group.id,{}, {selection});
  for(const r of [l.context,...l.regions]){assert.ok(r.x>=0&&r.y>=0&&r.w>0&&r.h>0,`${group.id} positive`);assert.ok(r.x+r.w<=dimensions.cols+1e-8&&r.y+r.h<=dimensions.rows+1e-8,`${dimensions.cols} ${group.id} ${r.id} bounded`);}
  const actions=[l.apply,l.inspect,l.dismiss,...l.customize,...l.variants];
  for(let i=0;i<actions.length;i++)for(let j=i+1;j<actions.length;j++)assert.equal(intersects(actions[i],actions[j]),false,`${dimensions.cols} ${group.id}: ${actions[i].id} / ${actions[j].id}`);
  assert.equal(l.regions.some(r=>r.id==='van:continue'),false,'put down object before the take-case label returns');
 }
});
test('optional spanner has no mandatory prompt or refusal; handling and putting it down write nothing',()=>{
 const f=fixture();f.point('van:object:spanner');assert.equal(f.count('spanner'),0);f.scene.key({key:'Escape'});assert.equal(f.count('spanner'),0);
 f.point('van:object:spanner');f.point('van:apply');assert.equal(f.count('spanner'),1);assert.equal(f.state().spannerTaken,true);f.point('van:apply');assert.equal(f.count('spanner'),1);f.point('van:inspect');assert.equal(f.calls.at(-1).args[0],'plant-spanner');f.scene.exit();
});
test('held Back or Inspect cannot dismiss the object and the bench in one held input',()=>{
 const f=fixture();f.point('van:object:variant:headphones:closed');f.scene.key({controllerAction:'back'});f.scene.key({controllerAction:'back',repeat:true});assert.equal(f.count('close'),0);
 f.scene.key({key:'i'});f.scene.key({key:'i',repeat:true});assert.equal(f.count('inspect'),1);f.scene.exit();
});
test('a forged or hidden physical option never becomes an actionable target',()=>{
 const l=vanWorkbenchLayout(size,{fieldKit:freshFieldKit()},'headphones',{
 counterfeit:{x:1,y:1,w:3,h:3,kind:'variant',group:'headphones',optionId:'counterfeit'},
 witness:{x:4,y:1,w:3,h:3,kind:'variant',group:'faceplate',optionId:'witness'},
 },{});assert.equal(l.physical.length,0);
});

test('save recovery occupies the handled object action slot and stays above its context',()=>{
 const selection={key:'variant:headphones:closed',group:'headphones',optionId:'closed',item:'headphones-closed'};
 const l=vanWorkbenchLayout({cols:75,rows:20},{fieldKit:freshFieldKit()},'headphones',{case:{x:25,y:4,w:26,h:10}}, {selection,saveFailure:true});
 assert.deepEqual({x:l.retry.x,y:l.retry.y,w:l.retry.w,h:l.retry.h},{x:l.apply.x,y:l.apply.y,w:l.apply.w,h:l.apply.h});
 assert.equal(l.regions.at(-1).id,'van:retry');assert.equal(l.keyboardRegions[0].id,'van:retry');
});
