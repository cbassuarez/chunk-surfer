import test from 'node:test';
import assert from 'node:assert/strict';
import {MEMORY_FIELD,MEMORY_FIELD_ANT as ANT,MEMORY_FIELD_VISIT} from '../src/data/memory-field.js';
import {antPoseAt,antGoneAt,antPathLength,antMovingAt} from '../src/game/memory-field-ant.js';
import {freshMemoryField,stepMemoryField,tryMemoryField,memoryFieldAntActive} from '../src/game/memory-field-scene.js';
import {memoryFieldRenderFrame} from '../src/render/memory-field-frame.js';
import {memoryFieldGeometry} from '../src/render/memory-field-models.js';

const visit=MEMORY_FIELD_VISIT.second;
const run=(state,seconds,input={})=>{const events=[];for(let t=0;t<seconds;t+=.1){const r=stepMemoryField(state,visit,{dt:.1,...input});state=r.state;events.push(...r.events);}return{state,events};};

test('the ant is in the field, on the second visit, and crosses its slab at an ant\'s pace',()=>{
  assert.equal(visit.ant,ANT);
  assert.ok(antPathLength(ANT)>1&&antPathLength(ANT)<1.6);
  let moving=0;for(let t=0;t<60;t+=.05)moving+=antMovingAt(t)?1:0;
  assert.ok(moving/1200>.55&&moving/1200<.8,'it stops and feels about, most of the time going on');
  const gone=antGoneAt(ANT);assert.ok(gone>ANT.lines.at(-1).at&&gone<ANT.maxSeconds,`gone at ${gone}s, after the last thing he says`);
  assert.equal(antPoseAt(ANT,gone+.1).gone,true);
  assert.equal(antPoseAt(ANT,30).onSlab,true);assert.equal(antPoseAt(ANT,0).onSlab,false,'it comes out of the grass');
});

test('he never says it is about him',()=>{
  const all=ANT.lines.map(l=>l.text).join(' ');
  assert.doesNotMatch(all,/\b(me|myself|I am|I\'m like|like me|us)\b/i);
  for(const words of [/ravine/,/canopy/,/esplanade/,/step on it/,/going anywhere/,/Bach/,/Over and over/,/choosing/])assert.match(all,words);
  assert.doesNotMatch(all+ANT.gone+ANT.stood,/\bhold|\bheld/i);
});

test('getting up does nothing while he watches it; stopping trying lets him up',()=>{
  let state=freshMemoryField(visit);assert.ok(memoryFieldAntActive(state,visit));assert.equal(state.eyeH,ANT.eye);
  const start={x:state.x,z:state.z};
  ({state}=run(state,ANT.minSeconds+1,{forward:1}));
  assert.deepEqual({x:state.x,z:state.z},start,'walking does not move him');assert.equal(state.ant.tried,true);assert.equal(state.ant.done,false);
  const r=run(state,ANT.quietSeconds+.5);
  assert.equal(r.state.ant.done,true);assert.equal(r.state.ant.why,'stood');
  assert.ok(r.events.some(e=>e.type==='stand'&&e.text===ANT.stood));
  const up=run(r.state,ANT.standSeconds+.2).state;assert.ok(Math.abs(up.eyeH-MEMORY_FIELD.eye)<1e-6,'and he is back at his full height');
  assert.equal(tryMemoryField(freshMemoryField(visit),visit).state.ant.tried,true,'reaching for anything is trying to get up');
});

test('left to watch, it ends when the ant goes into the grass, and the wander carries on from there',()=>{
  const r=run(freshMemoryField(visit),antGoneAt(ANT)+.5);
  assert.equal(r.state.ant.why,'gone');assert.ok(r.events.some(e=>e.type==='stand'&&e.text===ANT.gone));
  assert.equal(r.events.filter(e=>e.type==='line').length,ANT.lines.length,'he says all of it');
  assert.equal(r.state.left,false,'the visit is not over: it is the wander now');
  const later=run(r.state,visit.lines[0].at+.5,{}).events;assert.ok(later.some(e=>e.text==='Warm.'),'its own lines start once he is up');
});

test('his eyes follow the ant, and the close grass and the ant are drawn only while he is down',()=>{
  let state=freshMemoryField(visit);({state}=run(state,20));
  const frame=memoryFieldRenderFrame(state,visit),ant=frame.props.find(p=>p.mesh.startsWith('mf_ant_')&&/^mf_ant_[01]$/.test(p.mesh));
  assert.ok(ant,'the ant is drawn');assert.ok(Math.abs(frame.eye[1]-ANT.eye)<.01);
  const pose=antPoseAt(ANT,state.ant.t),want=Math.atan2(pose.x-state.x,-(pose.z-state.z));
  assert.ok(Math.abs(Math.atan2(Math.sin(want-state.yaw),Math.cos(want-state.yaw)))<.2,'he is looking at it');
  const names=new Set(memoryFieldGeometry().map(r=>r.name));for(const mesh of frame.props.map(p=>p.mesh).filter(m=>m.startsWith('mf_')))assert.ok(names.has(mesh),mesh);
  const up=run(state,ANT.maxSeconds,{}).state,after=memoryFieldRenderFrame(up,visit);
  assert.ok(after.props.some(p=>p.mesh==='mf_ant_slab_top'),'the slab is still there');
  assert.ok(!after.props.some(p=>/^mf_ant_(0|1|patch)/.test(p.mesh)),'the ant and the close grass are not');
});
