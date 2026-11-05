import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_EARTHFALL as C,SOURCE_EARTHFALL_MATERIAL_CELL,sourceEarthfallFracturePose} from '../src/data/source-earthfall.js';
import {freshSourceEarthfall} from '../src/game/source-earthfall.js';
import {sourceEarthfallRenderFrame,sourceEarthfallShakenFrame,sourceEarthfallGeometry,sourceEarthfallFaultGeometry,createSourceEarthfallRenderer} from '../src/render/source-earthfall-renderer.js';
import {sourceContinuationEntranceOffset} from '../src/game/source-continuation-entry.js';
import {portalMultiply,portalIdentity} from '../src/render/source-mesh-portals.js';
import {earthfallCollapseMeshes} from '../src/render/source-earthfall-collapse.js';
import {SOURCE_DEMOLITION_GEOMETRY as DEMO} from '../src/data/generated/source-demolition-geometry.js';
import {ST_BRENDANS_PRESENCE_MESH} from '../src/data/st-brendans-presences.js';
import {doorAssembly} from '../src/data/source-door-fields.js';

const fresh=()=>freshSourceEarthfall({runId:'earthfall-memory'});
const at=(elapsed,more={})=>({...fresh(),committed:true,committedAt:0,clock:elapsed,elapsed,phase:'falling',feet:80,...more});
const memory=(frame,id)=>frame.sourceCodeInstances.find(p=>p.sourceCodeMemory.ownerId===id);
const rows=items=>items.map(p=>[p.id,Array.from(p.matrix)]);
const translation=(x=0,y=0,z=0)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);

test('Earthfall releases exact original code at the bond-failure boundary, never before commitment',()=>{
  const cell=SOURCE_EARTHFALL_MATERIAL_CELL,id='source-earthfall-'+cell.id,
    release=sourceEarthfallFracturePose(cell.index,0,cell.center).releaseAt,
    intact=sourceEarthfallRenderFrame(fresh()),before=sourceEarthfallRenderFrame(at(release-1e-6)),
    released=sourceEarthfallRenderFrame(at(release));
  assert.ok(Number.isFinite(release));assert.equal(memory(before,id),undefined);
  const ghost=memory(released,id),owner=intact.props.find(p=>p.id===id);
  assert.ok(ghost);assert.equal(ghost.mesh,owner.mesh);assert.deepEqual(ghost.matrix,owner.matrix);
  assert.equal(ghost.sourceMemoryRole,'earth');assert.equal(ghost.earthfallRole,'freed-memory');
  assert.equal(released.props.find(p=>p.id===id).sourceCodeDetached,true);
  assert.equal(sourceEarthfallRenderFrame({...at(40),committed:false}).sourceCodeInstances.length,0);
  assert.equal(intact.sourceCodeInstances.length,0);
});

test('cold seeks, camera changes and quake leave released letters at the same authored world address',()=>{
  const id='source-earthfall-'+SOURCE_EARTHFALL_MATERIAL_CELL.id,
    early=sourceEarthfallRenderFrame(at(8.3)),later=sourceEarthfallRenderFrame(at(15,{yaw:2.4,pitch:1.1,x:3,z:-30})),
    again=sourceEarthfallRenderFrame(at(8.3)),quiet=sourceEarthfallRenderFrame(at(15),{reducedMotion:true}),
    shaken=sourceEarthfallShakenFrame(later);
  assert.deepEqual(rows(early.sourceCodeInstances),rows(again.sourceCodeInstances),'no first-visible-frame registry is involved');
  for(const frame of[later,quiet,shaken])assert.deepEqual(memory(frame,id).matrix,memory(early,id).matrix);
  assert.equal(shaken.sourceCodeInstances,later.sourceCodeInstances,'ground shaking only transforms physical props');
  assert.notDeepEqual(later.props.find(p=>p.id===id).matrix,memory(later,id).matrix,'stock really departed while its code stayed');
  assert.deepEqual(rows(sourceEarthfallShakenFrame(quiet).sourceCodeInstances),rows(quiet.sourceCodeInstances));
});

test('glyph memories stay separate from Earthfall mass, fixed faults and physical counts',()=>{
  const frame=sourceEarthfallRenderFrame(at(15)),sourceMeshes=new Set(sourceEarthfallGeometry().filter(p=>p.material==='source').map(p=>p.name));
  assert.ok(frame.sourceCodeInstances.length>120);
  assert.equal(frame.counts.props,frame.props.length);assert.equal(frame.counts.memories,frame.sourceCodeInstances.length);
  assert.equal(frame.props.filter(p=>p.earthfallRole==='earth').length,120);
  assert.equal(frame.props.filter(p=>p.earthfallRole==='chunk-fault').length,12);assert.equal(frame.counts.faultSheets,1952);
  assert.ok(frame.props.every(p=>!p.sourceCodeOnly));
  assert.ok(frame.sourceCodeInstances.every(p=>p.sourceCodeOnly&&p.noShadow&&p.noReflection&&p.structural===false));
  assert.ok(frame.sourceCodeInstances.every(p=>sourceMeshes.has(p.mesh)),'only existing printed construction retains code');
  assert.ok(frame.sourceCodeInstances.every(p=>!p.horizonTide&&!p.character&&p.earthfallRole==='freed-memory'));
  assert.ok(frame.sourceCodeInstances.every(p=>['earth','ground-joist','stratum','stratum-support'].includes(p.sourceMemoryRole)));
  const clear=sourceEarthfallRenderFrame(fresh());assert.equal(clear.sourceCodeInstances.length,0,'a fresh owner has no memory of the prior fall');
});

test('the actual continuation-preview adapter transforms stock and code once with current portal metadata',()=>{
  const source=readFileSync(new URL('../src/render/source-earthfall-renderer.js',import.meta.url),'utf8'),
    start=source.indexOf('export function sourceEarthfallContinuationPreview('),end=source.indexOf('export function createSourceEarthfallRenderer(',start),
    block=source.slice(start,end).replace('export function','function'),offset=-sourceContinuationEntranceOffset().z,
    code={id:'wall:freed-code',mesh:'source-wall',matrix:translation(2,8,-4),x:2,y:8,z:-4,sourceCodeOnly:true,sourceCodeMemory:{ownerId:'wall'},
      portalClipPlanes:[[1,0,0,-2],[0,0,1,4]],portalExcludePlanes:[[[0,0,1,-7]]],sourceWorldMatrix:translation(1,2,3)},
    world={props:[{...code,id:'wall',sourceCodeOnly:false}],sourceCodeInstances:[code],lights:[],surroundings:{gate:{z:1},pressure:{gate:{z:1}}}},
    env={freshSourceContinuation:()=>({}),sourceContinuationRenderFrame:()=>world,sourceContinuationEntranceOffset,matrix:translation,multiply:portalMultiply},
    run=new Function(...Object.keys(env),'let continuationPreview=null;'+block+'return sourceEarthfallContinuationPreview();'),
    preview=run(...Object.values(env)),ghost=preview.sourceCodeInstances[0];
  assert.equal(preview.props.length,1);assert.equal(preview.sourceCodeInstances.length,1);
  assert.equal(ghost.matrix[14],code.matrix[14]+offset);assert.equal(ghost.z,code.z+offset);
  assert.deepEqual(ghost.portalClipPlanes,code.portalClipPlanes.map(p=>[p[0],p[1],p[2],p[3]-p[2]*offset]));
  assert.deepEqual(ghost.portalExcludePlanes,code.portalExcludePlanes.map(planes=>planes.map(p=>[p[0],p[1],p[2],p[3]-p[2]*offset])));
  assert.deepEqual(ghost.sourceWorldMatrix,portalMultiply(translation(0,0,offset),portalMultiply(code.sourceWorldMatrix,translation(0,0,-offset))));
  assert.equal(ghost.sourceCodeMemory,code.sourceCodeMemory);assert.equal(code.matrix[14],-4);
});

test('Earthfall renderer submits glyphs alongside stock and clears both when released',async()=>{
  const goods=doorAssembly('bay-goods-pair',{activeLeaves:'all'}),catalog=new Set([
    'grand_piano','instrument_case',...sourceEarthfallGeometry().map(p=>p.name),...sourceEarthfallFaultGeometry().map(p=>p.name),
    DEMO.staticMesh,...DEMO.parts.map(p=>p.mesh),...earthfallCollapseMeshes(),...Object.values(ST_BRENDANS_PRESENCE_MESH),
    goods.frameMesh,goods.leafMesh,goods.freeStandingHeadMesh,
  ].filter(Boolean)),calls=[];
  const renderer=new Proxy({}, {get:(_,key)=>(...args)=>{calls.push({key,args});return key==='r3dBasePropsReady'?Promise.resolve(true):key==='r3dFrame'?true:undefined;}}),
    props={propMeshCatalog:()=>[...catalog],installAuthoredPropMeshes:()=>true,setAuthoredPropRange:()=>()=>true,setPressureInstances(){}},
    aside={initialize:async()=>true,ready:()=>true,dispose(){},diagnostics:()=>({}),ensureResident:async()=>true},
    owner=createSourceEarthfallRenderer({renderer,props,asideRenderer:aside});
  assert.equal(await owner.initialize(),true);assert.equal(owner.render(at(15)),true);
  const submitted=calls.findLast(c=>c.key==='r3dSetProps').args[0],frame=sourceEarthfallShakenFrame(sourceEarthfallRenderFrame(at(15)));
  assert.deepEqual(rows(submitted.filter(p=>!p.sourceCodeOnly)),rows(frame.props));
  assert.deepEqual(rows(submitted.filter(p=>p.sourceCodeOnly)),rows(frame.sourceCodeInstances));
  assert.equal(owner.diagnostics().frame.counts.memories,frame.sourceCodeInstances.length);
  assert.equal(owner.dispose(),true);assert.deepEqual(calls.findLast(c=>c.key==='r3dSetProps').args[0],[]);
  assert.equal(owner.render(at(15)),false);
});
