import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL, EYE} from '../src/data/floorplan/legend.js';
import * as D from '../src/game/chapel-tape-demand.js';
import {chapelTapeDemandInstances} from '../src/render/chapel-tape-demand.js';

FP.compile(conservatory.levels, conservatory);
const context={runId:'chapel-departure-render',chapelWon:true,chapelRoute:true};
const logical={x:186,y:117};
const physical=FP.logicalToPhysical(logical.x,logical.y);
const origin={x:physical.x*CELL,y:physical.y,z:physical.z*CELL};
const group=physical.renderGroup;
const listener=(changes={})=>{
  const value={...origin,yaw:.3,zone:FP.zoneAt(logical.x,logical.y),...changes};
  return{...value,eye:{x:value.x,y:value.y+EYE,z:value.z}};
};
const reduce=(state,event)=>D.reduceChapelTapeDemand(state,event,context);
function departure(){
  const armed=reduce(D.freshChapelTapeDemand(context.runId),{type:'arm'});
  return reduce(armed,{type:'depart',route:'inversion',departure:{stage:'rescue',position:logical,remainingMs:53000}});
}
function caught(extra={}){
  return reduce(departure(),{type:'catch',catch:{doorId:'chapel-c17',mode:'spatial',kind:'building',
    anchor:{x:origin.x-1.8,y:origin.y+.94,z:origin.z},position:logical,group,wallYaw:.8,initialDistance:1.8,...extra}});
}
function frame(state,position=listener(),renderGroup=group){
  return chapelTapeDemandInstances(state,{plan:FP,context,group:renderGroup,listener:position,timeSec:2,reducedMotion:true});
}
const cases=instances=>instances.filter(p=>['tape_demand_field_case','tape_demand_field_case_broken'].includes(p.mesh));
const pose=p=>({x:p.x,y:p.y,z:p.z,yaw:p.yaw});
const endOf=matrix=>({x:matrix[12]+matrix[4],y:matrix[13]+matrix[5],z:matrix[14]+matrix[6]});
function strapSag(instances){
  const a=instances.find(p=>p.id==='chapel-tape-demand:strap-a')?.matrix;
  const b=instances.find(p=>p.id==='chapel-tape-demand:strap-b')?.matrix;
  assert.ok(a&&b,'both halves of the physical strap are present');
  const middle=endOf(a),ring=endOf(b);
  assert.ok(Math.hypot(middle.x-b[12],middle.y-b[13],middle.z-b[14])<1e-4,'strap halves meet');
  return(a[13]+ring.y)/2-middle.y;
}

test('departure and recovered travel show one carried case that follows the rendered eye',()=>{
  const states=[departure(),reduce(caught(),{type:'interact',distanceM:.8,slack:true})];
  for(const state of states){
    const first=cases(frame(state));
    assert.equal(first.length,1);assert.equal(first[0].id,'chapel-tape-demand:carried-case');
    const moved=cases(frame(state,listener({x:origin.x+.6,z:origin.z-.4,yaw:1.4})));
    assert.equal(moved.length,1);
    assert.notDeepEqual(pose(moved[0]),pose(first[0]),'the carried object remains attached to the moving person');
    assert.equal(frame(state).some(p=>p.mesh==='tape_demand_strap'),false,'a released case has no invisible active tether');
  }
});

test('a lost grip leaves one world-anchored case fixed across walking, look and save normalization',()=>{
  let state=caught();
  for(let i=0;i<10;i++)state=reduce(state,{type:'strain',seconds:.1});
  assert.equal(state.catch.holder,'anchor');
  const first=cases(frame(state));assert.equal(first.length,1);assert.equal(first[0].id,'chapel-tape-demand:held-case');
  const restored=D.normalizeChapelTapeDemand(JSON.parse(JSON.stringify(state)),context);
  for(const position of [listener({yaw:2.8}),listener({x:origin.x+1,z:origin.z+.7,yaw:-1})]){
    const shown=cases(frame(restored,position));assert.equal(shown.length,1);
    assert.deepEqual(pose(shown[0]),pose(first[0]),'looking or moving does not drag a confiscated case with the camera');
    assert.equal(frame(restored,position).some(p=>p.id==='chapel-tape-demand:carried-case'),false,'custody never duplicates the carried case');
  }
  assert.ok(Math.hypot(first[0].x-state.catch.anchor.x,first[0].z-state.catch.anchor.z)<.25,'the case stays visibly local to the actual anchor');
});

test('stepping toward a real attachment visibly slackens the joined strap',()=>{
  const state=caught(),anchor=state.catch.anchor;
  const taut=frame(state,listener({x:anchor.x+1.8,z:anchor.z}));
  const slack=frame(state,listener({x:anchor.x+.7,z:anchor.z}));
  assert.equal(cases(taut).length,1);assert.equal(cases(slack).length,1);
  assert.ok(strapSag(slack)>strapSag(taut)+.15,'available slack is expressed as sag rather than only a changed prompt');
});

test('a congregation holder uses the same single-case custody without an architectural crack',()=>{
  const state=caught({kind:'congregation',receiverId:'chapel-dressing:presence-0'});
  const instances=frame(state);
  assert.equal(cases(instances).length,1);
  assert.equal(instances.some(p=>p.mesh==='tape_demand_wall_catch'),false,'a hand-owned case cannot also appear caught by a wall');
  assert.equal(frame(caught()).filter(p=>p.mesh==='tape_demand_wall_catch').length,1,'architectural custody has exactly one visible attachment');
});

test('dormant, complete and foreign-group custody cannot leak a case or tether into another scene',()=>{
  const hidden=[D.freshChapelTapeDemand(context.runId),reduce(caught(),{type:'complete'})];
  for(const state of hidden)assert.deepEqual(frame(state),[]);
  for(const state of [caught(),caught({holder:'anchor'})]){
    const instances=frame(state,listener(),group==='upper'?'ground':'upper');
    assert.equal(cases(instances).length,0);
    assert.equal(instances.some(p=>p.mesh==='tape_demand_strap'||p.mesh==='tape_demand_wall_catch'),false);
  }
});
