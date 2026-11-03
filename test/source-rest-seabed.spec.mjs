import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestSeabed,SOURCE_REST_SEABED} from '../src/game/source-rest-seabed.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {sourceRestHeadlampPower} from '../src/game/source-rest-headlamps.js';

const seat=SOURCE_REST_SEATS[1];
const state=progress=>({...freshSourceContinuation(),...seat,...seat.approach,status:'active',
  sourceRestView:{seatId:seat.id,mode:'seated',progress:1,look:seat.view,degradation:progress,audibleSeconds:250,musicTime:250}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<.0001,`${a} != ${b}`);

test('the sand and its living and sunken contents grow around the actual moved seat',()=>{
  const early=sourceRestSeabed(state(.1)),mid=sourceRestSeabed(state(.6)),late=sourceRestSeabed(state(.9));
  assert.ok(early.level<mid.level&&mid.level<late.level);
  assert.ok(early.diagnostics.cars>=1&&mid.diagnostics.cars>early.diagnostics.cars&&late.diagnostics.cars>mid.diagnostics.cars);
  assert.ok(mid.diagnostics.grass>0&&mid.diagnostics.crabs>0);
  assert.ok(late.diagnostics.cars<=SOURCE_REST_SEABED.cars.length);
  assert.ok(mid.props.every(p=>p.decorative&&!p.structural&&!p.collidable));
  assert.equal(sourceRestSeabed({...state(.6),sourceRestView:null}).props.length,0);
  assert.equal(sourceRestSeabed({...state(.6),phase:'wrong-return'}).props.length,0);
});

test('renderer preserves seabed-owned transforms and lamp positions through architectural recession',()=>{
  const anchor={x:13,y:-20,z:5};
  for(const progress of [.1,.6,.9]){
    const input=state(progress),source=sourceRestSeabed(input),frame=sourceContinuationRenderFrame(input,{anchor});
    const drawn=frame.props.filter(p=>p.restSeabed&&!p.portalDestination);
    assert.equal(drawn.length,source.props.length,`all seabed parts submitted at ${progress}`);
    for(const part of source.props){
      const actual=drawn.find(p=>p.id==='source-continuation-'+part.id);assert.ok(actual,part.id);
      assert.equal(actual.restDrift,undefined,`${part.id} must stay with the rising sand`);
      for(let k=0;k<16;k++)near(actual.matrix[k],part.matrix[k]+(k===12?anchor.x:k===13?anchor.y:k===14?anchor.z:0));
    }
  }
});

test('headlamps fade to blackout, and reduced motion holds the sand life still',()=>{
  const a=sourceRestSeabed(state(.3),{reducedMotion:true}),b=sourceRestSeabed({...state(.3),sourceRestView:{...state(.3).sourceRestView,audibleSeconds:500}},{reducedMotion:true}),
    late=sourceRestSeabed(state(.9),{reducedMotion:true}),dark=sourceRestSeabed(state(.96),{reducedMotion:true});
  const life=p=>['seabed-grass','seabed-crab'].includes(p.kind);
  assert.deepEqual(a.props.filter(life).map(p=>p.matrix),b.props.filter(life).map(p=>p.matrix));
  assert.ok(a.props.some(p=>p.kind==='seabed-lamp'));
  assert.ok(late.headlampPower<a.headlampPower);
  assert.equal(dark.headlampPower,0);assert.equal(dark.props.some(p=>p.kind==='seabed-lamp'),false);
  assert.equal(dark.lights.some(p=>p.id.startsWith('rest-seabed-headlamps')),false);
  assert.ok(sourceRestHeadlampPower({time:120,progress:.3,marked:true,reducedMotion:true})>sourceRestHeadlampPower({time:120,progress:.9,marked:true,reducedMotion:true}));
  assert.equal(sourceRestHeadlampPower({time:120,progress:.96,marked:true}),0);
});
