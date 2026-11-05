import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const matrix=(x=0,y=0,z=0)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);

test('real visibility grouping keeps glyph memories out of stock, shadows and reflections',()=>{
  const stock={id:'wall',mesh:'printed-wall',x:0,y:-25,z:-4,matrix:matrix(0,-25,-4),sourceCodeDetached:true},
    ghost={id:'wall:freed-code',mesh:'printed-wall',x:0,y:4,z:-4,matrix:matrix(0,4,-4),sourceCodeOnly:true,noShadow:true,noReflection:true},
    ordinary={id:'neighbour',mesh:'printed-wall',x:1,y:0,z:-5,matrix:matrix(1,0,-5)},
    staticInstances=[stock,ghost,ordinary],environment={
      propDiagnosticsEnabled:false,propDiagnosticOptions:null,staticInstances,dynamicInstances:[],roofWatcherInstances:[],emergencyShadowInstances:[],stillnessReliefDrawInstances:[],pressureSurfaceInstances:[],diagnosticInstances:[],
      pack:{catalog:new Map([['printed-wall',{}]])},resolvedMeshName:p=>p.mesh,REFLECTION_SKIP:new Set(),characterSnapshot:()=>null,
      propInstanceVisible:(p,eye,range)=>Math.hypot(p.x-eye[0],p.z-eye[2])<=range,
      sourceDoorSceneryInView:()=>true,ordinaryPropInView:(p,_mesh,_frustum,matrices)=>{matrices?.set(p,p.matrix);return true;},
      propPortalBatchKey:p=>p.sourceCodeOnly?'\0source-code-memory':'',
    };
  const create=new Function(...Object.keys(environment),section('function visibleGroups(','function uploadInstances(')+'return visibleGroups;'),
    group=create(...Object.values(environment)),ids=options=>[...group([0,1,0],50,options).values()].flat().map(p=>p.id);
  assert.deepEqual(ids({}),['wall','neighbour']);
  assert.deepEqual(ids({shadow:true}),['wall','neighbour']);
  assert.deepEqual(ids({reflection:true}),['wall','neighbour']);
  const cached=new WeakMap(),code=group([0,1,0],50,{sourceCode:true,matrices:cached});
  assert.deepEqual([...code.values()].flat().map(p=>p.id),['wall:freed-code','neighbour']);
  assert.equal(code.size,2,'a frozen glyph batch cannot inherit moving-stock deformation uniforms');
  assert.equal(cached.get(ghost),ghost.matrix,'glyph culling caches the rest matrix rather than the departed stock matrix');
  stock.x=500;stock.matrix=matrix(500,-100,-4);
  assert.deepEqual(ids({sourceCode:true}),['wall:freed-code','neighbour'],'moving the carrier outside the view cannot cull letters at the original address');
  staticInstances.splice(0,staticInstances.length,ordinary);
  assert.deepEqual(ids({sourceCode:true}),['neighbour'],'replacing the scene list clears memories without a separate persistent registry');
});

test('memory grouping preserves current portal clips and Source-side batch isolation',()=>{
  const create=new Function('portalBatchKey',section('function propPortalBatchKey(','function sourceDoorSceneryInView(')+'return propPortalBatchKey;'),
    key=create(p=>p.portalClipPlanes?'\0portal-mesh:'+p.portalClipPlanes[0].join(','):''),
    plane=[1,0,0,5],original={mesh:'wall',sourceSurroundingsSide:1,portalClipPlanes:[plane],exteriorClipPlane:[0,0,1,-4],exteriorPortal:[0,4,-2,2,0,4]},
    ghost={...original,sourceCodeOnly:true};
  assert.notEqual(key(original),key(ghost),'frozen and living code must not share uniforms');
  assert.match(key(ghost),/portal-mesh:1,0,0,5/);
  assert.match(key(ghost),/source-side:1/);
  assert.notEqual(key(ghost),key({...ghost,portalClipPlanes:[[1,0,0,7]]}),'a current aperture update is reflected in the glyph batch');
  assert.notEqual(key(ghost),key({...ghost,sourceSurroundingsSide:2}));
});

test('suspended glyphs cannot become native receivers or invisible obstacles',()=>{
  const stock={id:'live',mesh:'wall',matrix:matrix(0,-20,-4)},ghost={...stock,id:'live:freed-code',matrix:matrix(0,4,-4),sourceCodeOnly:true},
    env={pack:{catalog:new Map([['wall',{primitives:[{nativeReceiverBounds:{min:[-1,0,-1],max:[1,2,1]}}]}]])},staticInstances:[stock,ghost],dynamicInstances:[],modelMatrix:p=>p.matrix,stillnessSurfaceEligible:()=>false};
  const text=section('export function stillnessNativeReceiverScene()','// Independent from ordinary prop instances:').replace(/\bexport\s+/g,''),
    run=new Function(...Object.keys(env),text+'return {scene:stillnessNativeReceiverScene(),obstacles:stillnessReceiverObstacles()};'),result=run(...Object.values(env));
  assert.deepEqual(result.scene.instances,[stock]);
  assert.deepEqual(result.obstacles.map(p=>p.id),['live']);
  assert.deepEqual(result.obstacles[0].min,[-1,-20,-5]);
  assert.deepEqual(result.obstacles[0].max,[1,-18,-3]);
});
