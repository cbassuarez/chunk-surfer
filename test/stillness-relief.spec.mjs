import test from 'node:test';
import assert from 'node:assert/strict';
import {STILLNESS_ANATOMY_GRID as grid} from '../src/data/generated/stillness-anatomy.js';
import {stillnessReliefDepthScale,stillnessReliefInstances,updateStillnessReliefMeshes,
  stillnessReliefDiagnostics,clearStillnessRelief,releaseStillnessReliefMeshes} from '../src/render/stillness-relief.js';

const wall={id:'native-wall:pressure',origin:[2,3,4],right:[1,0,0],up:[0,1,0],normal:[0,0,1],
  widthM:1.4,heightM:1.9,depthM:.2,materialId:7,space:'overworld'};
const floor={...wall,id:'native-source:floor',right:[1,0,0],up:[0,0,-1],normal:[0,1,0],space:'source-III',
  donorName:'native-host',donorPrimitiveIndex:1,uvOrigin:[.5,2],uvRight:[.125,0],uvUp:[0,-.125]};
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} must equal ${b} ± ${tolerance}`);
function context(){
  let id=0,currentVao=null;const bound=new Map(),buffers=new Map(),attributes=new Map(),calls=[],deleted=[];
  const gl={ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,DYNAMIC_DRAW:3,STATIC_DRAW:4,FLOAT:5,UNSIGNED_SHORT:6,
    createBuffer:()=>({buffer:++id}),createVertexArray:()=>({vao:++id}),bindVertexArray:v=>{currentVao=v;},
    bindBuffer:(target,b)=>bound.set(target,b),bufferData:(target,data)=>{buffers.set(bound.get(target),new data.constructor(data));calls.push('data');},
    bufferSubData:(target,offset,data)=>{buffers.set(bound.get(target),new data.constructor(data));calls.push('subData');},
    enableVertexAttribArray(){},disableVertexAttribArray(){},vertexAttribDivisor(){},vertexAttrib1f(){},
    vertexAttribPointer:(location)=>{if(!attributes.has(currentVao))attributes.set(currentVao,new Map());attributes.get(currentVao).set(location,bound.get(gl.ARRAY_BUFFER));},
    deleteBuffer:b=>deleted.push(b),deleteVertexArray:v=>deleted.push(v),deleteTexture(){assert.fail('A borrowed native texture must never be deleted');}};
  const donor={base:[.4,.3,.2,1],texture:{native:'albedo'},normalTexture:{native:'normal'},ormTexture:{native:'orm'},
    materialName:'native substrate',materialRole:'source-continuation',printedSurface:{coverage:'solid'},roughness:.8,
    characterMorphCount:3,characterMorphTexture:{native:'not-a-head'}};
  const native={primitives:[{materialName:'wrong primitive'},donor]},pack={catalog:new Map([['native-host',native]])};
  const geometry=(entry,location)=>buffers.get(attributes.get(entry.primitives[0].vao).get(location));
  return{gl,pack,donor,native,calls,geometry,deleted};
}

test('late pressure stays outward, bounded and receiver-specific while leaving the first build alone',()=>{
  for(const amount of[0,.1,.3,.6])for(const time of[0,5,21,100])
    assert.equal(stillnessReliefDepthScale({amount,time},wall),amount);
  let minimum=1,maximum=0,difference=0;
  for(let t=0;t<42;t+=.037){
    const a=stillnessReliefDepthScale({amount:1,time:t,profile:2},floor);
    assert.ok(a>=.88&&a<=1);minimum=Math.min(minimum,a);maximum=Math.max(maximum,a);
    difference=Math.max(difference,Math.abs(a-stillnessReliefDepthScale({amount:1,time:t,profile:2},{...floor,id:'a-different-host'})));
  }
  assert.ok(maximum-minimum>.05,'a peak must continue visibly pushing and partially withdrawing');
  assert.ok(difference>.02,'different receiving surfaces must not pulse in lockstep');
});

test('pressure is continuous through every wrap in several full cycles and release reaches zero',()=>{
  let previous=stillnessReliefDepthScale({amount:1,time:0},floor);
  for(let i=1;i<=60*240;i++){
    const next=stillnessReliefDepthScale({amount:1,time:i/240},floor);
    assert.ok(Math.abs(next-previous)<.001,'no phase-boundary height jump');previous=next;
  }
  previous=1;
  for(let i=100;i>=0;i--){
    const amount=i/100,next=stillnessReliefDepthScale({amount,time:7.9},floor);
    assert.ok(next>=0&&next<=amount);assert.ok(next<=previous+1e-10);previous=next;
  }
  assert.equal(previous,0);assert.deepEqual(stillnessReliefInstances({amount:0,time:9},[wall]),[]);
});

test('reduced motion or reduced flash freezes idle height exactly and uses only the supplied presentation clock',()=>{
  for(const flag of['reducedMotion','reduceFlash'])for(const time of[0,3,30,300]){
    assert.equal(stillnessReliefDepthScale({amount:.9,time,[flag]:true},floor),.9);
    const instance=stillnessReliefInstances({amount:.9,time,[flag]:true},[floor])[0];close(instance.matrix[9],.18);
  }
  assert.equal(stillnessReliefDepthScale({amount:1,time:1,motionTime:8},wall),
    stillnessReliefDepthScale({amount:1,time:500,motionTime:8},wall));
  assert.equal(stillnessReliefDepthScale({amount:1,time:4},wall),stillnessReliefDepthScale({amount:1,time:4},wall));
});

test('effort changes height only, leaving the plane, anatomical aspect and material UVs fixed',()=>{
  const h=context(),a=updateStillnessReliefMeshes(h.gl,h.pack,{amount:1,time:1},[floor])[0];
  const entry=h.pack.catalog.get(a.mesh),uvs=Array.from(h.geometry(entry,2)),b=updateStillnessReliefMeshes(h.gl,h.pack,{amount:1,time:7},[floor])[0];
  for(const index of[0,1,2,3,4,5,6,7,11,12,13,14,15])assert.equal(a.matrix[index],b.matrix[index]);
  assert.notEqual(a.stillnessDepthM,b.stillnessDepthM);
  assert.deepEqual(Array.from(h.geometry(entry,2)),uvs);close(uvs[0],.5-.5*Math.hypot(...a.matrix.slice(0,3))*.125);
  assert.ok(a.matrix[9]>0&&b.matrix[9]>0,'Source floor pushes into positive world Y');
  releaseStillnessReliefMeshes(h.gl,h.pack);
});

test('connected mesh boundary remains flat in both forms and after every strain update',()=>{
  const h=context();
  for(const amount of[.2,.7,1]){
    const instance=updateStillnessReliefMeshes(h.gl,h.pack,{amount,time:2},[wall])[0],entry=h.pack.catalog.get(instance.mesh),p=h.geometry(entry,0);
    for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.columns;x++)if(x<2||y<2||x>=grid.columns-2||y>=grid.rows-2){
      const at=(y*grid.columns+x)*3+2;assert.equal(p[at],0);assert.equal(grid.positions[at],0);assert.equal(grid.strainedPositions[at],0);
    }
    assert.ok(p.every(Number.isFinite));assert.ok(h.geometry(entry,1).every(Number.isFinite));
  }
  releaseStillnessReliefMeshes(h.gl,h.pack);
});

test('peak matrix motion performs no further geometry upload and diagnostics report its actual current protrusion',()=>{
  const h=context(),first=updateStillnessReliefMeshes(h.gl,h.pack,{amount:1,time:2},[floor])[0];
  const entry=h.pack.catalog.get(first.mesh),uploadCount=stillnessReliefDiagnostics(h.pack).geometryUploads;
  h.calls.length=0;
  for(const time of[3,4,8,13]){
    const instance=updateStillnessReliefMeshes(h.gl,h.pack,{amount:1,time},[floor])[0],diagnostic=stillnessReliefDiagnostics(h.pack);
    close(diagnostic.actualMaxProtrusionM,diagnostic.normalizedMaxHeight*instance.stillnessDepthM,1e-12);
    close(diagnostic.effectiveDepths[0].actualMaxProtrusionM,diagnostic.actualMaxProtrusionM,1e-12);
    assert.equal(diagnostic.geometryUploads,uploadCount);assert.equal(h.pack.catalog.get(instance.mesh),entry);
  }
  assert.deepEqual(h.calls,[]);releaseStillnessReliefMeshes(h.gl,h.pack);
});

test('native donor primitive, textures and cache ownership survive moving effort and clear/release',()=>{
  const h=context(),instance=updateStillnessReliefMeshes(h.gl,h.pack,{amount:1,time:2},[floor])[0];
  const p=h.pack.catalog.get(instance.mesh).primitives[0];
  for(const field of['base','texture','normalTexture','ormTexture','printedSurface'])assert.equal(p[field],h.donor[field]);
  assert.equal(p.materialName,h.donor.materialName);assert.equal(p.characterMorphTexture,undefined);
  const many=Array.from({length:12},(_,i)=>({...wall,id:'wall:'+i}));
  assert.equal(updateStillnessReliefMeshes(h.gl,h.pack,{amount:1,time:2},many).length,8);
  assert.equal(stillnessReliefDiagnostics(h.pack).installedReceiverCount,8);
  clearStillnessRelief(h.gl,h.pack);assert.equal(stillnessReliefDiagnostics(h.pack).installedReceiverCount,4);
  assert.equal(stillnessReliefDiagnostics(h.pack).actualMaxProtrusionM,0);
  releaseStillnessReliefMeshes(h.gl,h.pack);assert.equal(h.pack.catalog.size,1);assert.equal(h.pack.catalog.get('native-host'),h.native);
});
