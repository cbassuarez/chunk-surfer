import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_REST_ALCOVE,SOURCE_REST_ALCOVE_SOLIDS} from '../src/data/source-rest-alcove.js';
import {continuationSupportAt,continuationChartSolids} from '../src/data/source-continuation.js';
import {sourceContinuationCanOccupy,freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_REST_SEATS,sourceRestApproachProtected} from '../src/game/source-rest-seat.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {continuationWalkSegment,continuationSupportedPath} from '../src/game/source-continuation-hush.js';
const seat=SOURCE_REST_SEATS[0],state={...freshSourceContinuation(),...seat,status:'active'};
const blocked=(a,b)=>{const solids=continuationChartSolids(state);for(let i=0;i<=160;i++){const p=a.map((n,k)=>n+(b[k]-n)*i/160);if(solids.some(s=>p[0]>=s.minX&&p[0]<=s.maxX&&p[1]>=s.minY&&p[1]<=s.maxY&&p[2]>=s.minZ&&p[2]<=s.maxZ))return true;}return false;};

test('the hidden alcove uses the original upper-refuge floor and a fully supported dogleg',()=>{
  assert.equal(seat.chartId,0);assert.equal(seat.feet,8.4);assert.deepEqual(seat.discovery,SOURCE_REST_ALCOVE.discovery);
  assert.ok(sourceRestApproachProtected(seat),'the seated body retains the existing refuge protection');
  const route=SOURCE_REST_ALCOVE.route;
  for(let n=1;n<route.length;n++)for(let i=0;i<=40;i++){
    const a=route[n-1],b=route[n],t=i/40,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    assert.equal(continuationSupportAt(x,z,state)?.id,'wrong-upper-refuge');
    assert.ok(sourceContinuationCanOccupy(x,z,state),`dogleg ${n}, sample ${i}`);
  }
  for(let i=0;i<=40;i++)assert.ok(sourceContinuationCanOccupy(0,-15-i*.15,state),'the earlier-upper-return portal centre stays physically open');
});

test('the actual return screen conceals the seat from the ordinary crossing but the seated window is open',()=>{
  assert.ok(blocked([0,seat.feet+1.62,-14],[seat.x,seat.feet+.78,seat.z]),'the main crossing cannot see straight to the seat');
  assert.equal(blocked([seat.x,seat.feet+1.04,seat.z],[-3.7,seat.feet+1.04,seat.z]),false,'the western view passes through the real window opening');
  const frame=sourceContinuationRenderFrame(state),walls=frame.props.filter(p=>p.role==='rest-alcove');
  assert.equal(walls.length,SOURCE_REST_ALCOVE_SOLIDS.length);
  assert.ok(walls.every(p=>p.restPlace&&p.physicalBounds),'every visible screen has exact collision and stays through early departure');
  const before=sourceContinuationRenderFrame({...state,sourceRestView:{seatId:seat.id,progress:1,degradation:0}}),early=sourceContinuationRenderFrame({...state,sourceRestView:{seatId:seat.id,progress:1,degradation:.5}});
  for(const p of before.props.filter(p=>p.role==='rest-alcove'))assert.deepEqual(early.props.find(q=>q.id===p.id).matrix,p.matrix,'the solid screen cannot vanish while getting up remains available');
});

test('the original east crossing and hidden dogleg are walked by the production controller with HUSH active',()=>{
  let s=normalizeSourceContinuation({...freshSourceContinuation({runId:'alcove-real-walk'}),status:'active',x:3.85,z:3,feet:8.4,yaw:Math.PI,
    lastSafe:{x:3.85,z:3,feet:8.4,chartId:0,yaw:Math.PI,pitch:0,phase:'wrong-return',level:0}});
  const events=[];
  function walk(target){
    for(let n=0;n<600;n++){
      const dx=target.x-s.x,dz=target.z-s.z,d=Math.hypot(dx,dz);if(d<.035)return;
      const result=stepSourceContinuation(s,{dt:.05,renderReady:true,forward:Math.min(1,d/(3.2*.05)),look:{yaw:Math.atan2(dx,-dz)}});
      s=result.state;events.push(...result.events);
      assert.equal(s.fall,null);assert.equal(s.recovery,null);assert.equal(s.chartId,0);assert.equal(s.feet,8.4);
    }
    assert.fail(`blocked walking to ${target.x},${target.z} at ${s.x},${s.z}`);
  }
  // This is the established outgoing arm, followed by the unchanged direct
  // cross to the old refuge. The hidden route only branches north afterwards.
  walk({x:3.85,z:-20});walk({x:0,z:-20});walk({x:0,z:-19.3});walk({x:0,z:-20});
  for(const target of SOURCE_REST_ALCOVE.route.slice(3))walk(target);
  assert.ok(sourceRestApproachProtected(seat));assert.equal(s.hush.active,true);
  for(const target of SOURCE_REST_ALCOVE.route.slice(0,-1).reverse())walk(target);
  assert.equal(events.some(event=>['fold','capture','return','recovered'].includes(event.type)),false,'the dogleg cannot bypass a portal or rely on recovery');
  const a={x:3.85,z:-20,feet:8.4,chartId:0,phase:'wrong-return'},b={x:0,z:-20,feet:8.4,chartId:0,phase:'wrong-return'};
  assert.equal(continuationWalkSegment(a,b),true,'HUSH retains the original supported crossing');
  assert.equal(continuationWalkSegment(b,a),true,'the existing pursuit navigation remains reciprocal');
  assert.equal(continuationSupportedPath(a,b).length,2,'the new screens do not force a pursuit detour');
});
