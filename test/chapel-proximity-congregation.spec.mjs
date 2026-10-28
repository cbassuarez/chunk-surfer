import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createChapelChoirApproach} from '../src/game/chapel-choir-approach.js';
import {chapelChoirPose} from '../src/game/chapel-choir-performance.js';
import {CHAPEL_CONGREGATION,CHAPEL_WATCHER_ID} from '../src/data/chapel-dressing.js';
import {createChapelApparitions} from '../src/game/chapel-apparitions.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
const people=CHAPEL_CONGREGATION.filter(p=>p.role==='congregant');
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} ~= ${b}`);

test('most existing people sit in real pews and only nine specific, unequal people may rise',()=>{
  assert.equal(people.length,45);assert.equal(people.filter(p=>p.figure==='kneeling').length,9);
  assert.equal(people.filter(p=>['seated','bowed'].includes(p.figure)).length,36);
  const lifted=people.filter(p=>p.rapture);assert.equal(lifted.length,9);
  assert.equal(new Set(lifted.map(p=>p.rapture.height)).size,9);
  assert.equal(people.filter(p=>p.watchful).length,1);assert.equal(people.find(p=>p.watchful).id,CHAPEL_WATCHER_ID);
  assert.equal(people.find(p=>p.watchful).rapture,null);assert.notEqual(people.find(p=>p.watchful).figure,'kneeling');
  for(const p of people){
    assert.equal(chapelChoirPose({phase:52,presence:p,fervour:0,elapsed:52}).lift,0,'global clip phase is never enough');
    const pose=chapelChoirPose({phase:52,presence:p,fervour:1,elapsed:52});
    assert.equal(pose.lift>0,!!p.rapture);if(p.rapture)assert.ok(pose.lift<=p.rapture.height+.0001);
    assert.equal(chapelChoirPose({phase:52,presence:p,fervour:1,elapsed:4}).lift,0,'an entry cannot skip the gathering');
  }
});

test('approach starts quietly from phrase zero and builds from actual audible vocal effort',()=>{
  const a=createChapelChoirApproach();
  a.update({now:10000,active:true,distance:23});
  assert.equal(a.update({now:20000,active:true,distance:23}).engaged,false);
  a.update({now:20001,active:true,distance:12});
  assert.equal(a.update({now:20001.6,active:true,distance:12}).engaged,false);
  const first=a.update({now:20002.5,active:true,distance:12});
  assert.equal(first.engaged,true);assert.equal(first.phase,0);assert.equal(first.arrivalEnvelope,0);assert.equal(first.fervour,0);
  let frame;
  for(let i=1;i<=1040;i++)frame=a.update({now:20002.5+i/20,active:true,distance:12});
  near(frame.phase,52,1e-6);assert.equal(frame.arrivalEnvelope,1);assert.ok(frame.fervour>.9);
  const heights=people.map(p=>chapelChoirPose({phase:frame.phase,presence:p,elapsed:frame.elapsed,fervour:frame.fervour}).lift);
  assert.equal(heights.filter(h=>h>0).length,9);assert.equal(heights.filter(h=>h===0).length,36);
});

test('pause, focus, recorder protection and return do not manufacture missed singing or ascent',()=>{
  const a=createChapelChoirApproach();a.update({now:0,active:true,distance:10});a.update({now:1.5,active:true,distance:10});
  const before=a.update({now:11.5,active:true,distance:10});
  const held=a.update({now:10000,active:true,distance:10,muted:true});
  near(held.elapsed,before.elapsed);near(held.fervour,before.fervour);
  const returned=a.update({now:20000,active:true,distance:10});near(returned.elapsed,before.elapsed);
  const moved=a.update({now:20001,active:true,distance:10});near(moved.elapsed,before.elapsed+1);
  assert.equal(a.update({now:20002,active:true,distance:25}).engaged,false);
  a.update({now:20003,active:true,distance:10});assert.equal(a.update({now:20004.5,active:true,distance:10}).phase,0);
});

test('one seated watcher tracks the visitor and shifts only centimetres, while others keep their prayer',()=>{
  const watcher={...people.find(p=>p.watchful),x:0,y:0,z:0,scale:1},rest={...people.find(p=>!p.watchful&&p.figure==='seated'),id:'rest',x:2,y:0,z:0,scale:1};
  const rt=createChapelApparitions(),eye={x:1.6,y:1.62,z:-3};let frame;
  for(let i=0;i<=160;i++)frame=rt.frame({congregation:[watcher,rest],eye,timeSec:i/20,canSee:()=>true});
  const keen=frame.singing.find(p=>p.watchful),quiet=frame.singing.find(p=>!p.watchful);
  assert.ok(Math.abs(keen.headYaw)>1.5);assert.ok(Math.abs(keen.pewShift)>.005&&Math.abs(keen.pewShift)<=.045);
  assert.ok(Math.abs(quiet.headYaw)<.15);assert.ok(Math.abs(quiet.bodyTwist)<.05);assert.equal(quiet.pewShift,0);
  assert.equal(keen.lift,0);assert.ok(frame.instances.every(p=>p.apparitionVariant===0),'coats and faces retain real material shading');
});

test('the production chapel pack has clothing, skin, shoes and face regions rather than one pressure material',()=>{
  const pack=parseGlb(fs.readFileSync(new URL('../public/assets/chapel-dressing.glb',import.meta.url)));
  const materials=pack.json.materials;
  for(const name of ['chapel worn charcoal wool','chapel faded brown wool','chapel worn pallid skin','chapel worn leather shoe','chapel faded shirt and collar'])assert.ok(materials.some(m=>m.name===name),name);
  for(const name of ['chapel_presence_seated_upper','chapel_presence_bowed_upper','chapel_presence_kneeling_upper']){
    const mesh=pack.json.meshes.find(m=>m.name===name);assert.ok(mesh.primitives.length>=2,name);
    assert.ok(mesh.primitives.some(p=>/wool/.test(materials[p.material].name)),name);
    assert.ok(mesh.primitives.some(p=>/skin/.test(materials[p.material].name)),name);
  }
  const head=pack.json.meshes.find(m=>m.name==='chapel_presence_head');assert.ok(head.primitives.some(p=>/eye shade/.test(materials[p.material].name)));
  const shader=fs.readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  assert.ok(shader.includes('if(vPortrait>=10&&vPortrait<=12)'),'diagnosis is grounded in the production early-return pressure shader');
});
