import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestPlaceStudy,sourceRestVista,SOURCE_REST_TREATMENTS} from '../src/game/source-rest-place.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {sourceRestGeometryLibrary} from '../src/render/source-rest-models.js';
import {sourceContinuationMeshPayload,sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {continuationSupportAt} from '../src/data/source-continuation.js';

test('three spatial treatments have genuinely different mass and the selected loggia fits existing support',()=>{
  const views=SOURCE_REST_TREATMENTS.map(t=>sourceRestPlaceStudy(t.id));
  assert.equal(new Set(views.map(v=>v.parts.length)).size,3);
  assert.ok(views[0].parts.some(p=>p.id.startsWith('ceiling-panel')));
  assert.ok(views[1].parts.some(p=>p.id==='bay-soundboard'));
  assert.ok(views[2].parts.some(p=>p.id==='tidal-cap'));
  const seat=SOURCE_REST_SEATS[0],s={...seat,status:'active'};
  for(const part of views[0].parts.filter(p=>p.id.startsWith('floor-')||p.id.startsWith('loggia-post-'))){
    for(const dx of[-part.sx/2,part.sx/2])for(const dz of[-part.sz/2,part.sz/2])assert.ok(continuationSupportAt(part.x+dx,part.z+dz,s),part.id);
  }
  assert.ok(sourceRestVista(0).every(p=>p.y<seat.feet-1),'the garden remains visibly below the supported route');
});

test('bespoke furniture has bevelled upholstered geometry and clears the supported seated eye',()=>{
  const models=sourceRestGeometryLibrary(),seat=SOURCE_REST_SEATS[0];
  for(const name of ['rest-settle-frame','rest-settle-cloth','rest-settle-piping']){
    const data=sourceContinuationMeshPayload({...models[name],name:'source-continuation-'+name,kind:'detail'});
    assert.ok(data.triangles>40,name);assert.ok(data.positions.every(Number.isFinite));
    assert.ok(data.bounds.max[1]<1.04,`${name}: body and eye do not clip`);
    for(let i=0;i<data.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...data.normals.slice(i,i+3))-1)<1e-5);
  }
  const s={...freshSourceContinuation(),...seat,...seat.approach,status:'active',sourceRestView:{seatId:seat.id,progress:1,look:seat.view}};
  const frame=sourceContinuationRenderFrame(s);
  assert.ok(frame.props.some(p=>p.mesh.endsWith('rest-settle-cloth')));
  assert.ok(frame.props.some(p=>p.restVista));assert.ok(frame.props.filter(p=>p.restTreatment==='loggia').length>30);
  assert.ok(!frame.props.some(p=>p.mesh.endsWith('rest-vista-arch')),'the actual window and real Source architecture replace the floating arches');
  assert.ok(frame.lights.length<=8,'local diffuse lighting respects the native light budget');
  assert.ok(frame.counts.props<760);
});
