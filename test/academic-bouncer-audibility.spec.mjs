import test from 'node:test';
import assert from 'node:assert/strict';
import {conservatory as C} from '../src/data/floorplan/conservatory.js';
import {CELL} from '../src/data/floorplan/legend.js';
import {ACADEMIC_BOUNCER_ACTORS as GUARDS,ACADEMIC_BOUNCER_EXCHANGE} from '../src/data/academic-bouncers.js';
import {ACADEMIC_SOCIETY_ACTORS as RESIDENTS} from '../src/data/academic-society.js';
import {academicBouncerSocialAudible as audible,academicBouncerSegmentClear as segment} from '../src/game/academic-bouncer-audibility.js';
import * as FP from '../src/world/floorplan.js';
FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,
  connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});
const project=(x,y)=>{const p=FP.logicalToPhysical(x*2,y*2);return{x:p.x*CELL,y:p.y,z:p.z*CELL};};
const actors=GUARDS.concat(RESIDENTS).map(a=>({...a,...project(a.x,a.y)}));
const byId=id=>actors.find(a=>a.id===id);
const anchor={x:GUARDS[0].x*2,y:GUARDS[0].y*2};
const clearSegment=(a,b)=>segment(FP,a,b,{cellSize:CELL,anchor});
const event=(...ids)=>({lines:ids.map(actorId=>({actorId,text:'Spatial test only'}))});
const formal=GUARDS[0].id,dry=GUARDS[1].id;
const listener={x:64.5,y:10,z:38.5};
const aside=actors.map(a=>GUARDS.some(g=>g.id===a.id)
  ?{...a,...project(...[GUARDS.find(g=>g.id===a.id).asidePath.at(-1).x,GUARDS.find(g=>g.id===a.id).asidePath.at(-1).y])}:a);

test('actual line speakers, including reciprocal replies, determine range rather than an event owner',()=>{
  const cast=[{id:'near',x:0,y:10,z:0},{id:'reply',x:20,y:10,z:0}];
  assert.equal(audible({actorId:'near',...event('near','reply')},{listener:{x:1,y:10,z:0},actors:cast,clearSegment:()=>true}),false);
  assert.equal(audible(event('near','near'),{listener:{x:1,y:10,z:0},actors:cast,clearSegment:()=>true}),true);
});
test('unknown, ambiguous, invisible or non-finite speakers and empty lines refuse social playback',()=>{
  for(const value of [null,{lines:[]},{lines:[{}]},event('missing')])assert.equal(audible(value,{listener,actors,clearSegment}),false);
  for(const cast of [[{id:formal,x:0,y:10,z:NaN}],[{id:formal,x:0,y:10,z:0,visible:false}],[byId(formal),byId(formal)]]){
    assert.equal(audible(event(formal),{listener,actors:cast,clearSegment}),false);
  }
  assert.equal(audible(event(formal),{listener:{...listener,y:NaN},actors,clearSegment}),false);
});
test('audibility requires explicit positive segment evidence and fails closed for callback errors',()=>{
  for(const callback of [undefined,()=>false,()=>undefined,()=>1,()=>{throw Error('unknown geometry');}]){
    assert.equal(audible(event(formal),{listener,actors,clearSegment:callback}),false);
  }
});
test('all speaker-to-listener and speaker-to-speaker pairs respect physical 8m and floor .55m limits',()=>{
  const player={x:0,y:10,z:0},cast=[{id:'a',x:-4,y:10,z:0},{id:'b',x:4,y:10,z:0}];
  assert.equal(audible(event('a','b'),{listener:player,actors:cast,clearSegment:()=>true}),true);
  assert.equal(audible(event('a','b'),{listener:player,actors:[cast[0],{...cast[1],x:4.001}],clearSegment:()=>true}),false);
  assert.equal(audible(event('a'),{listener:{...player,y:9.44},actors:cast,clearSegment:()=>true}),false);
  assert.equal(audible(event('a'),{listener:{...player,x:4.001},actors:cast,clearSegment:()=>true}),false);
});
test('a blocked reciprocal pair cannot be hidden by individually clear player rays',()=>{
  const cast=[{id:'a',x:1,y:10,z:0},{id:'b',x:2,y:10,z:0}];
  assert.equal(audible(event('a','b'),{listener:{x:0,y:10,z:0},actors:cast,clearSegment:(a,b)=>!(a.x===1&&b.x===2)}),false);
});
test('compiled incoming stair pose302,132 hears both actual guard bodies across the physical seam',()=>{
  const p=FP.logicalToPhysical(302,132),body={x:p.x*CELL,y:p.y,z:p.z*CELL};
  assert.deepEqual(body,listener);
  assert.equal(audible({lines:ACADEMIC_BOUNCER_EXCHANGE},{listener:body,actors,clearSegment}),true);
  assert.equal(audible({lines:ACADEMIC_BOUNCER_EXCHANGE},{listener:{...body,y:7.4},actors,clearSegment}),false);
});
test('aside Hugh can exchange locally with Odette and Agathe across the open stairwell; Vera is beyond both peer ranges',()=>{
  const body={x:60.5,y:10,z:39};
  assert.equal(audible(event(dry,'odette','agathe'),{listener:body,actors:aside,clearSegment}),true);
  assert.equal(audible(event(formal,'odette'),{listener:body,actors:aside,clearSegment}),false);
  assert.equal(audible(event(formal,'agathe'),{listener:body,actors:aside,clearSegment}),false);
  const a=aside.find(a=>a.id===formal),b=byId('odette');
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>8,'the stair-safe reception anchor is beyond Vera\'s strict 8m peer limit');
  assert.equal(segment(FP,a,b,{cellSize:CELL}),false,'synthetic negative well spans cannot masquerade as known clear geometry');
  assert.equal(clearSegment(a,b),true,'exact academic anchor metadata resolves the collision-only open well');
});
test('compiled actual solid partition rejects a social ray',()=>{
  const a={x:66.25,y:10,z:1.25},b={x:68.25,y:10,z:1.25};
  assert.equal(clearSegment(a,b),false);
  assert.equal(audible(event('a','b'),{listener:a,actors:[{id:'a',...a},{id:'b',...b}],clearSegment}),false);
});
test('compiled real leaf blocks the same ray when closed and permits it when open',()=>{
  const id='academic-studio-1',before=FP.doorState().find(d=>d.id===id).open;
  const a={x:56.5,y:10,z:11.25},b={x:58,y:10,z:11.25};
  try{FP.setDoorOpen(id,false);assert.equal(clearSegment(a,b),false);
    FP.setDoorOpen(id,true);assert.equal(clearSegment(a,b),true);
  }finally{FP.setDoorOpen(id,before);}
});
test('missing mappings, non-finite points and absent anchor evidence refuse rather than assuming open air',()=>{
  assert.equal(segment(FP,{x:-999,y:10,z:-999},listener,{cellSize:CELL,anchor}),false);
  assert.equal(segment(FP,{...listener,x:NaN},listener,{cellSize:CELL,anchor}),false);
  assert.equal(segment(null,listener,listener,{cellSize:CELL,anchor}),false);
  assert.equal(segment(FP,listener,listener,{cellSize:0,anchor}),false);
  assert.equal(segment(FP,listener,{...listener,y:4.8},{cellSize:CELL,anchor}),false);
});
