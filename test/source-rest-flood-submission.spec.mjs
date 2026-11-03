import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceRestFlood} from '../src/game/source-rest-flood.js';
import {sourceRestWeatherCue} from '../src/game/source-rest-weather-score.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {SOURCE_REST_ALCOVE} from '../src/data/source-rest-alcove.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame,SOURCE_CONTINUATION_ARCHITECTURE} from '../src/render/source-continuation-renderer.js';
import {coastalWaterUniforms} from '../src/render/coastal-memory-water.js';
import {sourceContinuationVoidInstance} from '../src/render/source-continuation-void.js';

const seat=SOURCE_REST_SEATS[0];
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<.00006,`${message}: ${a} != ${b}`);
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const anchor={x:13.25,y:-22.5,z:71.75};
function state(progress,stormAge,clock=340+stormAge){
  return{...freshSourceContinuation({runId:'flood-submission'}),...seat,...seat.approach,status:'active',
    sourceRestView:{seatId:seat.id,mode:'seated',progress:1,look:seat.view,degradation:progress,
      musicTime:clock,audibleSeconds:clock,weatherCue:sourceRestWeatherCue({active:true,seated:true,progress,stormAge,audibleSeconds:clock})}};
}
const canonicalFlood=frame=>frame.props.filter(p=>p.restFlood&&!p.portalDestination);

test('the production late storm submits every coherent wreck, fish and bubble despite architectural recession and a full prop budget',()=>{
  for(const reducedMotion of [false,true])for(const [progress,age]of [[.64,19],[.68,24],[.73,37]]){
    const s=state(progress,age),saved=structuredClone(s),original=sourceRestFlood(s,{reducedMotion}),
      frame=sourceContinuationRenderFrame(s,{anchor,reducedMotion}),submitted=canonicalFlood(frame);
    assert.deepEqual(s,saved,'the rendering fix cannot move the supported body or saved clock');
    assert.equal(submitted.length,original.props.length,'none of the flood carriers may be silently trimmed');
    assert.ok(frame.counts.props<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances);
    assert.ok(frame.props.some(p=>p.restDrift>4),'the architecture still recedes; this is not an event bypass');
    for(const p of original.props){
      const q=submitted.find(q=>q.id==='source-continuation-'+p.id);assert.ok(q,p.id);
      assert.equal(q.restDrift,undefined,'the water, not an unrelated architecture layer, owns this pose');
      for(let k=0;k<16;k++)near(q.matrix[k],p.matrix[k]+(k===12?anchor.x:k===13?anchor.y:k===14?anchor.z:0),p.id+' matrix '+k);
      assert.equal(q.floodKind,p.kind);assert.equal(q.memoryFish,p.memoryFish);assert.equal(q.memoryWreck,p.memoryWreck);
    }
    assert.ok(submitted.some(p=>p.mesh==='source_return_fish_body'));
    assert.ok(submitted.some(p=>p.mesh==='opening_drive_vehicle_body'));
    assert.ok(submitted.every(p=>p.decorative&&!p.structural));
  }
});

test('the actual submitted van and underwater headlamp carriers share one pose and world origin',()=>{
  for(const [progress,age]of [[.64,19],[.68,24],[.73,37]]){
    const frame=sourceContinuationRenderFrame(state(progress,age),{anchor}),
      body=canonicalFlood(frame).find(p=>p.memoryWreck==='sunken-near'&&p.mesh==='opening_drive_vehicle_body').matrix,
      water=frame.flood.water,uniforms=coastalWaterUniforms(water);
    assert.equal(water.lights.length,2);assert.equal(uniforms.active,true);
    for(const [index,side]of [-1,1].entries()){
      const expected=point(body,[side*.6,.65,-2.2]),actual=water.lights[index];
      for(let k=0;k<3;k++){
        near(actual.position[k],expected[k],'headlamp '+index+' axis '+k);
        near(actual.direction[k],-body[k+8],'headlamp '+index+' direction '+k);
      }
      assert.ok(actual.intensity>0);assert.ok(actual.position[1]<anchor.y+frame.flood.waterY);
      assert.ok(uniforms.positions[index*4+3]>0,'the real water compositor receives a powered light');
    }
  }
});

test('the persistent van lamps face the seated viewer through the real window and clear physical platforms',()=>{
  const frame=sourceContinuationRenderFrame(state(.2,-1,120)),eye=frame.eye,lights=frame.flood.water.lights,
    lenses=canonicalFlood(frame).filter(p=>p.floodKind==='flood-lens');
  assert.equal(lights.length,2);assert.equal(lenses.length,2);
  const crosses=(a,b,min,max)=>{
    let enter=0,leave=1;
    for(let k=0;k<3;k++){
      const d=b[k]-a[k];if(Math.abs(d)<1e-8){if(a[k]<min[k]||a[k]>max[k])return false;continue;}
      let t=(min[k]-a[k])/d,u=(max[k]-a[k])/d;if(t>u)[t,u]=[u,t];
      enter=Math.max(enter,t);leave=Math.min(leave,u);if(enter>leave)return false;
    }
    return enter>0&&enter<1;
  };
  for(const [i,light] of lights.entries()){
    assert.ok(light.position[1]<frame.flood.waterY,'both powered lenses sit under the tide');
    assert.ok(light.direction[0]>.99,'both beams face the seated listener');
    const t=(SOURCE_REST_ALCOVE.window.x-eye[0])/(light.position[0]-eye[0]),
      y=eye[1]+(light.position[1]-eye[1])*t,z=eye[2]+(light.position[2]-eye[2])*t,w=SOURCE_REST_ALCOVE.window;
    assert.ok(t>0&&t<1&&y>w.minY&&y<w.maxY&&z>w.minZ&&z<w.maxZ,'the light crosses the open window');
    for(const p of frame.props.filter(p=>p.physicalBounds&&!p.portalDestination))
      assert.equal(crosses(eye,light.position,p.physicalBounds.min,p.physicalBounds.max),false,p.id);
    for(let k=0;k<3;k++)near(lenses[i].matrix[12+k],light.position[k],'lens follows beam');
    assert.ok(lenses[i].emissive[3]>0,'actual visible lens follows its powered beam');
  }
});

test('the production seated camera has fish in front of the real alcove opening during the storm hold',()=>{
  const frame=sourceContinuationRenderFrame(state(.68,24)),eye=frame.eye,w=SOURCE_REST_ALCOVE.window;
  const visible=canonicalFlood(frame).filter(p=>p.mesh==='source_return_fish_body').filter(p=>{
    // Geometric sightline proof, not a rendered-pixel or human-recognition claim.
    const t=(w.x-eye[0])/(p.x-eye[0]),y=eye[1]+(p.y-eye[1])*t,z=eye[2]+(p.z-eye[2])*t;
    const depth=(p.x-eye[0])*Math.sin(frame.yaw)-(p.z-eye[2])*Math.cos(frame.yaw);
    return depth>0&&t>0&&t<1&&y>w.minY&&y<w.maxY&&z>w.minZ&&z<w.maxZ;
  });
  assert.ok(visible.length>=2,'the animals must cross the actual window sightline, not merely exist somewhere in Source');
});

test('every submitted wreck and animal resolves to actual generated vehicle and fauna geometry',()=>{
  const catalog=new Map();
  for(const file of ['source-vehicle-interior.glb','source-return/fauna.glb']){
    const bytes=readFileSync(new URL('../public/assets/'+file,import.meta.url)),gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
    for(const mesh of gltf.meshes)catalog.set(mesh.name,{mesh,gltf});
  }
  for(const p of canonicalFlood(sourceContinuationRenderFrame(state(.68,24)))){
    if(p.floodKind==='flood-bubble'||p.floodKind==='flood-lens')continue; // Installed by the renderer's authored-mesh installer.
    const entry=catalog.get(p.mesh);assert.ok(entry,'unresolved production mesh '+p.mesh);
    for(const primitive of entry.mesh.primitives){
      assert.ok(entry.gltf.accessors[primitive.attributes.POSITION].count>3);
      assert.ok(entry.gltf.accessors[primitive.indices].count>=3);
      assert.equal(primitive.mode??4,4);
    }
  }
});

test('finite portal aliases preserve the flood exemption and canonical animal identity',()=>{
  const original=canonicalFlood(sourceContinuationRenderFrame(state(.68,24))).find(p=>p.memoryFish===0),
    toCurrent=[1,0,0,0,0,1,0,0,0,0,1,0,0,-100,0,1],
    view={id:'flood-regression-view',toCurrent,planes:[],domainId:'under',kind:'lower',chartId:0};
  const alias=sourceContinuationVoidInstance(original,view);
  assert.equal(alias.restFlood,true);assert.equal(alias.memoryFish,original.memoryFish);assert.equal(alias.canonicalId,original.id);
  assert.equal(alias.floodKind,'flood-fauna');assert.equal(alias.restDrift,undefined);
  assert.equal(alias.portalDestination,true);near(alias.y,original.y-100,'lower world alias');
});

test('storm carriers retire to the seated tide, which leaves with the listener',()=>{
  const seated=state(.68,54),during=sourceContinuationRenderFrame(state(.68,24)),after=sourceContinuationRenderFrame(seated),
    departed=sourceContinuationRenderFrame({...seated,sourceRestView:null}),remaining=canonicalFlood(after);
  assert.equal(after.flood.active,false,'the storm has ended');
  assert.equal(after.flood.water.active,true,'the underlying seated tide remains');
  assert.equal(after.flood.water.flood,0);
  assert.equal(after.flood.water.lights.length,2);
  assert.ok(after.flood.water.lights.every(light=>light.source==='sunken-deep'));
  assert.ok(remaining.some(p=>p.memoryWreck==='sunken-deep'));
  assert.ok(remaining.every(p=>p.memoryWreck==='sunken-deep'||['breath-bubble','flood-lens'].includes(p.floodKind)));
  assert.equal(departed.flood.water.active,false);
  assert.equal(departed.flood.water.lights.length,0);
  assert.equal(canonicalFlood(departed).length,0);
  assert.deepEqual(after.geometry,during.geometry);
  assert.deepEqual(departed.geometry,during.geometry);
});
