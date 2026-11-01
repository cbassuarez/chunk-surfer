import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_REST_SEATS,sourceRestEyePosition} from '../src/game/source-rest-seat.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';

for(const seat of SOURCE_REST_SEATS){
  test(`${seat.id}: the real Source renderer submits the bench and seated camera in its chart`,()=>{
    const state={...freshSourceContinuation({runId:'rest-render'}),status:'active',phase:seat.phase,
      chartId:seat.chartId,level:seat.level,x:seat.approach.x,z:seat.approach.z,feet:seat.feet,
      yaw:seat.view.yaw,pitch:seat.view.pitch,fall:null,recovery:null,reveal:null};
    const standing=sourceContinuationRenderFrame(state);
    const bench=standing.props.find(prop=>prop.id===`source-continuation-prop-${seat.id}`);
    assert.ok(bench,'bench is submitted in its own chart');
    assert.equal(bench.chartId,seat.chartId);
    const seated=sourceContinuationRenderFrame({...state,sourceRestView:{seatId:seat.id,progress:1,look:seat.view}});
    assert.equal(seated.props.some(prop=>prop.id===`source-continuation-prop-${seat.id}`),true,'both real benches remain visible below the corrected seated eye');
    sourceRestEyePosition(seat).forEach((n,k)=>assert.ok(Math.abs(seated.eye[k]-n)<1e-6));
    assert.equal(seated.strictOverhead,false);
    assert.equal(seated.counts.body,0,'a first-person seated view does not render the overhead standing body');
  });
}
