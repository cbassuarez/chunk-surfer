import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestApertureFrame,SOURCE_REST_APERTURE_GEOMETRY_LIMIT} from '../src/render/source-rest-aperture-frame.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';

const pose=seat=>({...freshSourceContinuation(),...seat,...seat.approach,status:'active',sourceRestView:{
  seatId:seat.id,mode:'seated',progress:1,degradation:.3,musicTime:160,musicSignal:.4,look:seat.view}});
const noteScore={duration:716.4,notes:[{id:'detected-note',onset:159.8,duration:.8,midi:67,velocity:.8,confidence:1}]};

test('apertures export only current submitted music architecture, never bodies, whole worlds or projected duplicates',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const state=pose(seat),frame=sourceContinuationRenderFrame(state,{noteScore}),view=sourceRestApertureFrame(frame,state,{viewport:{width:1440,height:900,tanHalfFov:.81}});
    assert.ok(view);assert.equal(view.phase,seat.phase);assert.equal(view.mediaTime,160);
    assert.equal(SOURCE_REST_APERTURE_GEOMETRY_LIMIT,24);
    assert.ok(view.geometry.length>0&&view.geometry.length<=SOURCE_REST_APERTURE_GEOMETRY_LIMIT);assert.deepEqual(view.eye,frame.eye);
    assert.deepEqual(view.viewport,{width:1440,height:900,aspect:1.6,tanHalfFov:.81,supplied:true});assert.equal(view.degradation,.3);
    if(seat.phase==='catch'){
      const strings=view.geometry.filter(g=>g.role==='strings');assert.equal(strings.length,6);
      assert.deepEqual(strings.map(g=>[g.reactive,g.register]),['acoustic','electronic'].flatMap(choir=>['low','mid','high'].map(register=>[choir+'-strings',register])));
      assert.equal(view.geometry.filter(g=>g.role==='lid').length,3,'actual opaque lids participate in occlusion');
      for(const role of ['case','lining','bridge','soundboard','manual-bed'])assert.ok(view.geometry.some(g=>g.role===role));
    }
    for(const item of view.geometry){
      const source=frame.props.find(p=>p.id===item.id);
      assert.ok(source);assert.ok(!source.restBody&&!source.portalDestination&&!source.portalFragment);
      assert.deepEqual(item.matrix,Array.from(source.matrix));
      assert.ok(item.p.length&&item.i.length&&item.base.length===4);
      assert.ok(seat.phase==='catch'?source.restHarpsichordPart:source.restNoteArchitecture);
    }
    assert.equal(view.geometry.some(g=>/hush|operator|recorder|dialogue|cassette/.test(g.id)),false);
  }
});

test('apertures follow the final rotated world transform and retire at black or outside the listening owner',()=>{
  const state=pose(SOURCE_REST_SEATS[1]),frame=sourceContinuationRenderFrame(state,{studyRotation:Math.PI/2}),view=sourceRestApertureFrame(frame,state);
  for(const row of view.geometry)assert.deepEqual(row.matrix,Array.from(frame.props.find(p=>p.id===row.id).matrix));
  for(const change of [{chartId:1},{sourceRestView:{...state.sourceRestView,mode:'standing'}},{sourceRestView:{...state.sourceRestView,degradation:.96}}])
    assert.equal(sourceRestApertureFrame(frame,{...state,...change}),null);
  assert.equal(sourceRestApertureFrame(null,state),null);
});
