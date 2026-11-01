import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { includePositionBounds, propBoundsInView } from '../src/render/prop-frustum-culling.js';
import { viewFrustum } from '../src/render/view-frustum.js';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const projection=[1,0,0,0,0,1,0,0,0,0,-1.002,-1,0,0,-.2002,0];
const planes=viewFrustum(identity,projection),box={min:[-1,-1,-1],max:[1,1,1]};

test('bounds include every position from every primitive and reject malformed inputs',()=>{
  const first=includePositionBounds(null,new Float32Array([-2,3,4,1,-1,9]));
  assert.deepEqual(includePositionBounds(first,new Float32Array([8,2,-5])),{min:[-2,-1,-5],max:[8,3,9]});
  assert.equal(includePositionBounds(first,[0,NaN,0]),null);
  assert.equal(includePositionBounds(first,[1,2]),null);
});

test('offscreen boxes reject; boundaries, large envelopes and unknown inputs remain visible',()=>{
  const at=(x,y,z)=>[...identity.slice(0,12),x,y,z,1];
  assert.equal(propBoundsInView(box,at(0,0,-8),planes),true);
  assert.equal(propBoundsInView(box,at(0,0,8),planes),false);
  assert.equal(propBoundsInView(box,at(30,0,-8),planes),false);
  assert.equal(propBoundsInView(box,at(9.95,0,-8),planes),true);
  assert.equal(propBoundsInView({min:[-100,-5,-100],max:[100,5,100]},at(0,0,30),planes),true);
  assert.equal(propBoundsInView(null,at(0,0,30),planes),true);
  assert.equal(propBoundsInView(box,at(NaN,0,30),planes),true);
  assert.equal(propBoundsInView(box,at(0,0,30),[[NaN,0,0,0]]),true);
});

test('arbitrary affine transforms never reject a box intersecting the view planes',()=>{
  let seed=12;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let trial=0;trial<5000;trial++){
    const m=[rand()*6-3,rand()*6-3,rand()*6-3,0,rand()*6-3,rand()*6-3,rand()*6-3,0,
      rand()*6-3,rand()*6-3,rand()*6-3,0,rand()*80-40,rand()*80-40,rand()*80-60,1];
    const corners=[];
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])
      corners.push([m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]]);
    const mayIntersect=planes.every(p=>corners.some(c=>p[0]*c[0]+p[1]*c[1]+p[2]*c[2]+p[3]>=-.05));
    if(mayIntersect)assert.equal(propBoundsInView(box,m,planes),true,`trial ${trial}`);
  }
});

test('production admits unbounded and shader-deformed content, and culls bounded static meshes',()=>{
  const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  const start=source.indexOf('function ordinaryPropInView('),end=source.indexOf('\nfunction visibleGroups(',start);
  assert.ok(start>=0&&end>start);
  const ctx={propBoundsInView,modelMatrix:instance=>instance.matrix};vm.createContext(ctx);
  vm.runInContext(source.slice(start,end),ctx);
  const mesh={cullBoundsValid:true,cullBounds:box,nodeMatrix:identity,extras:{},primitives:[{}]};
  const offscreen={matrix:[...identity.slice(0,12),0,0,20,1]};
  assert.equal(ctx.ordinaryPropInView(offscreen,mesh,planes),false);
  for(const instance of [{...offscreen,character:{}},{...offscreen,paperIndex:0},{...offscreen,portraitIndex:14}])
    assert.equal(ctx.ordinaryPropInView(instance,mesh,planes),true);
  for(const modified of [{...mesh,cullBoundsValid:false},{...mesh,characterAsset:{}},
    {...mesh,extras:{vegetationWind:{amplitudeM:.1}}},{...mesh,primitives:[{sourceSurroundingsPressure:true}]}])
    assert.equal(ctx.ordinaryPropInView(offscreen,modified,planes),true);
  assert.match(source,/ordinaryPropInView\(i,pack\.catalog\.get\(resolved\),frustum,matrices\)/);
  assert.match(source,/visibleGroups\(lightEye,64,\{shadow:true[^\n]*frustum:viewFrustum/);
  assert.match(source,/visibleGroups\(eye,maxDistance,\{lodEye:eye,reflection,frustum:viewFrustum/);
});

test('a visible prop reuses exactly the culled transform for upload only within that pass',()=>{
  const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  const start=source.indexOf('function ordinaryPropInView('),end=source.indexOf('\nfunction renderShadowPass(',start);
  assert.ok(start>=0&&end>start);
  const boxMesh={cullBoundsValid:true,cullBounds:box,nodeMatrix:identity,extras:{},primitives:[{}],instanceBuffer:{}};
  const ordinary={id:'ordinary',mesh:'cube',matrix:[...identity.slice(0,12),0,0,-8,1]};
  const deformed={id:'paper',mesh:'cube',paperIndex:0,matrix:[...identity.slice(0,12),1,0,-8,1]};
  const uploads=[];let transforms=0;
  const ctx={propBoundsInView,modelMatrix:p=>{transforms++;return new Float32Array(p.matrix)},
    staticInstances:[ordinary,deformed],dynamicInstances:[],roofWatcherInstances:[],emergencyShadowInstances:[],diagnosticInstances:[],
    propDiagnosticsEnabled:false,propDiagnosticOptions:null,propInstanceVisible:()=>true,sourceDoorSceneryInView:()=>true,
    propPortalBatchKey:()=>'',resolvedMeshName:p=>p.mesh,characterSnapshot:()=>null,pack:{catalog:new Map([['cube',boxMesh]])},
    REFLECTION_SKIP:new Set(),PROP_INSTANCE_FLOATS:29,practicalLightFrameByPropId:new Map(),PAPER_ATLAS_HANDLING:[],
    writePropInstanceFlags(){},propPoweredMaterialScale:()=>1,
    gl:{ARRAY_BUFFER:1,DYNAMIC_DRAW:2,bindBuffer(){},bufferData:(_,data)=>uploads.push(Array.from(data))}};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
  const cache=new WeakMap(),groups=ctx.visibleGroups([0,0,0],90,{frustum:planes,matrices:cache});
  ctx.uploadInstances(boxMesh,groups.get('cube'),cache);
  assert.equal(transforms,2,'static transform is made once; deformed bypass still gets one upload transform');
  assert.equal(uploads[0][12],0);assert.equal(uploads[0][29+12],1);
  ordinary.matrix[12]=2;
  const newCache=new WeakMap(),next=ctx.visibleGroups([0,0,0],90,{frustum:planes,matrices:newCache});
  ctx.uploadInstances(boxMesh,next.get('cube'),newCache);
  assert.equal(uploads[1][12],2,'a new render pass reflects a changed transform');
  ctx.uploadInstances(boxMesh,[ordinary]);
  assert.deepEqual(uploads[2].slice(0,16),uploads[1].slice(0,16),'uncached upload has identical matrix bytes');
});

test('ordinary primitives skip character morph GL calls while animated meshes bind all morph data',()=>{
  const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  const shader=readFileSync(new URL('../src/render/character-asset.js',import.meta.url),'utf8');
  const start=source.indexOf('function bindCharacterPose('),end=source.indexOf('\nconst VEGETATION_CLASS=',start);
  assert.ok(start>=0&&end>start);
  assert.match(shader,/if\(uCharacterEnabled<\.5\)return;/);
  const calls=[],gl={TEXTURE9:9,TEXTURE_2D:2,uniform1f:(...a)=>calls.push(['enable',...a]),
    uniformMatrix4fv(){},uniform4fv(){},uniform1i:(...a)=>calls.push(['int',...a]),
    uniform2i:(...a)=>calls.push(['size',...a]),activeTexture:(...a)=>calls.push(['active',...a]),bindTexture:(...a)=>calls.push(['texture',...a])};
  const ctx={gl,characterSnapshot:(_,mesh)=>mesh.characterAsset?{pose:{bones:[],morphs:[]}}:null};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
  const uniform=name=>name,staticMesh={},animatedMesh={characterAsset:{}},primitive={characterMorphCount:2,characterVertexCount:17,characterMorphTexture:'atlas',characterMorphSize:[8,5]};
  ctx.bindCharacterPose(uniform,staticMesh,{});ctx.bindMeshCharacterMorph(uniform,staticMesh,primitive);
  assert.deepEqual(calls,[['enable','uCharacterEnabled',0]],'disabled deformation needs no per-primitive bindings');
  calls.length=0;ctx.bindCharacterPose(uniform,animatedMesh,{});ctx.bindMeshCharacterMorph(uniform,animatedMesh,primitive);
  assert.ok(calls.some(c=>c[0]==='enable'&&c[2]===1));
  assert.ok(calls.some(c=>c[0]==='int'&&c[1]==='uCharacterMorphCount'&&c[2]===2));
  assert.ok(calls.some(c=>c[0]==='texture'&&c[2]==='atlas'));
  assert.match(source,/bindMeshCharacterMorph\(SU,mesh,primitive\)/);
  assert.match(source,/bindMeshCharacterMorph\(U,m,p\)/);
});
