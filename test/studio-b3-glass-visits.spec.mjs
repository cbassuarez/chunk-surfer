import test from 'node:test';
import assert from 'node:assert/strict';
import {inB3Rooms,createB3GlassVisitTracker} from '../src/game/studio-b3-glass-visits.js';

test('both live room and control booth are B3; B2 and corridor are outside',()=>{
  for(const [x,z] of [[14,10],[22,10],[24.5,12]])
    assert.equal(inB3Rooms({x,z,floor:-4,group:'basement'}),true);
  for(const [x,z,floor,group] of [[26,12,-4,'basement'],[15,20,-4,'basement'],[14,10,0,'ground']])
    assert.equal(inB3Rooms({x,z,floor,group}),false);
});

test('turning away is not a return: see, leave the room, then return',()=>{
  const m=createB3GlassVisitTracker(),flags={seen:false,left:false};
  const frame=(inside,observed=false,extra={})=>m.step({eligible:true,inRoom:inside,observed,...flags,
    onSeen:()=>flags.seen=true,onLeft:()=>flags.left=true,...extra});
  assert.equal(frame(true),false);
  assert.equal(frame(true,true),false);
  assert.equal(frame(true,false),false,'a glance away changes no visit state');
  assert.equal(flags.left,false);
  frame(false);
  assert.deepEqual(flags,{seen:true,left:true});
  assert.equal(frame(true),true);
});

test('reload does not invent a departure, and unobserved visits do not consume the first view',()=>{
  const flags={seen:false,left:false};
  const step=(m,inRoom,observed=false)=>m.step({eligible:true,inRoom,observed,...flags,onSeen:()=>flags.seen=true,onLeft:()=>flags.left=true});
  let m=createB3GlassVisitTracker();step(m,true);step(m,false);assert.deepEqual(flags,{seen:false,left:false});
  m=createB3GlassVisitTracker();step(m,true,true);assert.deepEqual(flags,{seen:true,left:false});
  m=createB3GlassVisitTracker();step(m,true);assert.equal(flags.left,false,'restoring inside is not a departure');
  step(m,false);assert.equal(flags.left,true);
  m=createB3GlassVisitTracker();assert.equal(step(m,true),true,'real departure persists across reload');
});

test('paused and detached frames cannot fake a room exit',()=>{
  const m=createB3GlassVisitTracker();let left=0;
  m.step({eligible:true,inRoom:true,seen:true});
  m.step({eligible:true,suspended:true,inRoom:false,seen:true,onLeft:()=>left++});
  m.step({eligible:false,inRoom:false,seen:true,onLeft:()=>left++});
  assert.equal(left,0);
  m.step({eligible:true,inRoom:false,seen:true,onLeft:()=>left++});
  assert.equal(left,1);
});
