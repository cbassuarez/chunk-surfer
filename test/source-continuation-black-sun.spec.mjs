import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C} from '../src/data/source-continuation.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_TIDES,sourceTideField} from '../src/game/source-continuation-tides.js';
import {SOURCE_BLACK_SUN,sourceBlackSunStream,sourceContinuationBlackSunProps} from '../src/render/source-continuation-black-sun.js';
import {sourceContinuationIslandPlacements,SOURCE_ISLANDS} from '../src/render/source-continuation-islands.js';
import {sourceContinuationLeafFrame,SOURCE_LEAVES} from '../src/render/source-continuation-leaves.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {portalTransformPoint} from '../src/render/source-mesh-portals.js';

const catchState=(extra={})=>({...freshSourceContinuation(),phase:'catch',status:'active',level:3,feet:-12.6,x:-166,z:-92,yaw:Math.PI,pitch:0,elapsed:40,...extra});
const sun=SOURCE_TIDES.wells.catch,eye=[C.catch.center.x,-11,C.catch.center.z];

test('over Source III the black sun eats the blood moon, and there is no second black hole',()=>{
  const f=sourceContinuationRenderFrame(catchState()),omen=f.props.filter(p=>p.blackSun);
  assert.deepEqual(omen.map(p=>p.mesh.replace('source-continuation-','')).sort(),['catch-black-sun','catch-black-sun-corona','catch-blood-moon','catch-blood-moon-stream']);
  assert.equal(f.restHorizon,null);
  const ii=sourceContinuationRenderFrame({...freshSourceContinuation(),phase:'wrong-return',status:'active',elapsed:40});
  assert.equal(ii.props.filter(p=>p.blackSun).length,0);assert.ok(ii.restHorizon,'Source II keeps its own hole');
});

test('the moon orbits at the head of its own stream, which falls into the black limb',()=>{
  for(const time of [0,40,190]){
    const props=sourceContinuationBlackSunProps(catchState(),{time}),moon=props.find(p=>p.mesh.endsWith('blood-moon')),stream=props.find(p=>p.mesh.endsWith('moon-stream'));
    const head=portalTransformPoint(stream.matrix,sourceBlackSunStream(0)),centre=portalTransformPoint(moon.matrix,[0,0,0]);
    assert.ok(Math.hypot(...head.map((v,k)=>v-centre[k]))<1e-3,'the stream leaves the moon itself');
    const tail=portalTransformPoint(stream.matrix,sourceBlackSunStream(1));
    assert.ok(Math.abs(Math.hypot(tail[0]-sun.x,tail[1]-sun.y,tail[2]-sun.z)-SOURCE_BLACK_SUN.radius)<1e-2,'and ends on the black disc');
  }
  const a=sourceContinuationBlackSunProps(catchState(),{time:0}).find(p=>p.mesh.endsWith('blood-moon')),b=sourceContinuationBlackSunProps(catchState(),{time:30}).find(p=>p.mesh.endsWith('blood-moon'));
  assert.ok(Math.hypot(a.matrix[12]-b.matrix[12],a.matrix[13]-b.matrix[13])>1,'the moon moves on its orbit');
  const still=sourceContinuationBlackSunProps(catchState(),{time:30,reducedMotion:true}).find(p=>p.mesh.endsWith('blood-moon'));
  assert.deepEqual(Array.from(still.matrix),Array.from(a.matrix),'reduced motion holds the omen still');
});

test('the omen hangs in the stack\'s ordinary sky with no island before it, and its pull is the Catch tide',()=>{
  const to=[sun.x-eye[0],sun.y-eye[1],sun.z-eye[2]],distance=Math.hypot(...to),elevation=Math.asin(to[1]/distance)*180/Math.PI;
  assert.ok(elevation>10&&elevation<28,`elevation ${elevation.toFixed(1)}`);
  assert.ok(distance+SOURCE_BLACK_SUN.radius*SOURCE_BLACK_SUN.streamerReach[1]<290,'inside the far clip');
  const reach=Math.asin((SOURCE_BLACK_SUN.radius*SOURCE_BLACK_SUN.streamerReach[1])/distance);
  for(const isle of sourceContinuationIslandPlacements()){
    const v=[isle.x-eye[0],isle.y-eye[1],isle.z-eye[2]],angle=Math.acos((v[0]*to[0]+v[1]*to[1]+v[2]*to[2])/(Math.hypot(...v)*distance));
    assert.ok(angle>reach+Math.max(...SOURCE_ISLANDS.shells.map(s=>Math.abs(s.sway))),`island ${isle.id} stands before the sun`);
  }
  const field=sourceTideField({...catchState(),x:-147,z:-92},{still:30});
  const pull=[field.x-field.wind.x,field.z-field.wind.z],toward=[sun.x+147,sun.z+92];
  assert.ok(pull[0]*toward[0]+pull[1]*toward[1]>0,'the body is drawn toward the black sun');
});

test('leaves ride the gust toward whatever devours the sky, and reduced motion keeps none',()=>{
  for(const [state,well] of [[catchState(),SOURCE_TIDES.wells.catch],[{...freshSourceContinuation(),phase:'wrong-return',status:'active',x:0,z:-19,feet:8.4,elapsed:40},SOURCE_TIDES.wells['wrong-return']]]){
    let memory=null,frame=null;const toward=[];
    for(let k=0;k<=60;k++){
      frame=sourceContinuationLeafFrame({...state,elapsed:state.elapsed+k*.05},{memory});
      if(k===0||k===60)toward.push(frame.props.reduce((s,p)=>s+Math.hypot(p.x-well.x,p.y-well.y,p.z-well.z),0)/frame.props.length);
      memory=frame.memory;
    }
    assert.equal(frame.props.length,SOURCE_LEAVES.count);
    assert.ok(frame.props.every(p=>p.matrix.length===16&&Array.from(p.matrix).every(Number.isFinite)&&p.mesh.startsWith('wind_leaf_')));
    assert.ok(toward[1]<toward[0],`${state.phase}: leaves drift toward the well (${toward[0].toFixed(1)} -> ${toward[1].toFixed(1)})`);
  }
  assert.equal(sourceContinuationLeafFrame(catchState(),{reducedMotion:true}).props.length,0);
  assert.equal(sourceContinuationLeafFrame({...catchState(),phase:'catch',chartId:3}).props.length,0);
});
