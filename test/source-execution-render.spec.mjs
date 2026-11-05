import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROP_INSTANCE_FLOATS,writePropInstanceFlags,propPoweredMaterialScale} from '../src/render/prop-instance-layout.js';
import {sourceExecutionParameters} from '../src/render/source-execution-trails.js';
import {SOURCE_CODE_SCREEN_GLSL,SOURCE_CODE_PHYSICAL_FRAG,SOURCE_CODE_TEXT_FRAG} from '../src/render/source-code-screen.js';
import {sourceContinuationRenderFrame,SOURCE_CONTINUATION_ARCHITECTURE} from '../src/render/source-continuation-renderer.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {continuationDoors} from '../src/data/source-continuation.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';

const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

test('actual glyph upload reuses four floats without changing stock emission, transforms or tide slots',()=>{
  const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8'),start=source.indexOf('function uploadInstances('),end=source.indexOf('function renderShadowPass(',start),uploads=[],
    gl={ARRAY_BUFFER:1,DYNAMIC_DRAW:2,bindBuffer(){},bufferData:(_target,data)=>uploads.push(new Float32Array(data))},
    mesh={instanceBuffer:{},nodeMatrix:identity()},part={id:'actual-code',mesh:'stock',matrix:identity(),emissive:[.2,.3,.4,.7],sourceExecution:{phase:.4,gain:.8,tail:.16,reducedMotion:false}},
    env={gl,PROP_INSTANCE_FLOATS,writePropInstanceFlags,propPoweredMaterialScale,sourceExecutionParameters,practicalLightFrameByPropId:new Map(),modelMatrix:p=>p.matrix,PAPER_ATLAS_HANDLING:[],writePropHorizonTide(){throw Error('unrequested tide');}},
    run=new Function(...Object.keys(env),source.slice(start,end)+'return uploadInstances;')(...Object.values(env));
  run(mesh,[part]);run(mesh,[part],null,{sourceCode:true});
  assert.deepEqual(Array.from(uploads[0].slice(20,24)),Array.from(new Float32Array(part.emissive)));
  assert.deepEqual(uploads[1].slice(20,24),sourceExecutionParameters(part.sourceExecution));
  for(let k=0;k<PROP_INSTANCE_FLOATS;k++)if(k<20||k>=24)assert.equal(uploads[0][k],uploads[1][k],'only glyph-private emission floats may differ');
  run(mesh,[{...part,sourceExecution:undefined}],null,{sourceCode:true});
  assert.deepEqual(uploads[2].slice(20,24),sourceExecutionParameters(null),'authored emission cannot accidentally start execution');
  run(mesh,[part]);assert.deepEqual(uploads[3],uploads[0],'the next ordinary pass restores its real authored material');
});

test('execution stays in the clean glyph program and remains inside its depth and faculty masks',()=>{
  assert.match(SOURCE_CODE_PHYSICAL_FRAG,/flat in vec4 vEmissive/);
  assert.match(SOURCE_CODE_TEXT_FRAG,/flat in float vSyntax/);
  assert.match(SOURCE_CODE_SCREEN_GLSL,/sourceExecutionStrength/);
  assert.match(SOURCE_CODE_SCREEN_GLSL,/sourceCodeWorldVisibility\(world\)/);
  assert.match(SOURCE_CODE_SCREEN_GLSL,/sourceRestFaculty/);
  assert.doesNotMatch(SOURCE_CODE_SCREEN_GLSL,/uTime|performance|Math\.random|captureBit/);
  const names=[...SOURCE_CODE_SCREEN_GLSL.matchAll(/uniform sampler2D ([^;]+);/g)].flatMap(m=>m[1].split(','));assert.equal(names.length,4);
});

test('real door receipts light code and fixed parser scopes without changing the supported route or its budget',()=>{
  const door=continuationDoors().find(p=>p.phase==='wrong-return'&&(p.chartId??0)===0),base={...freshSourceContinuation(),status:'active',elapsed:100},
    frame=sourceContinuationRenderFrame({...base,doorOpen:{[door.id]:true},doorMotion:{[door.id]:{from:0,to:1,startedAt:99,duration:.6}}}),
    idle=sourceContinuationRenderFrame({...base,elapsed:106,doorOpen:{[door.id]:true},doorMotion:{[door.id]:{from:0,to:1,startedAt:99,duration:.6}}});
  assert.equal(frame.executionTrail.active,true);assert.ok(frame.executionTrail.lit>0);assert.ok(frame.executionTrail.selected<=8);
  assert.equal(idle.executionTrail.active,false);
  assert.ok(frame.parserArchitecture.props.length>0&&frame.parserArchitecture.props.length<=96);
  assert.equal(frame.parserArchitecture.diagnostics.physicalBudgetUsed,0);
  assert.ok(frame.counts.props<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances);
  assert.deepEqual(frame.geometry,idle.geometry);
  assert.ok(frame.props.every(p=>!p.parserArchitecture));
  assert.ok(frame.parserArchitecture.props.every(p=>p.parserArchitecture&&p.collidable===false));
});

test('late freed code carries a finite trail and all projected copies retain the same canonical evaluation',()=>{
  const seat=SOURCE_REST_SEATS[0],base={...freshSourceContinuation(),...seat.approach,status:'active',phase:seat.phase,chartId:seat.chartId,feet:seat.feet,elapsed:100,
    sourceRestView:{seatId:seat.id,progress:1,mode:'seated',look:seat.view,degradation:.82,musicTime:400}},
    door=continuationDoors().find(p=>p.phase===seat.phase&&(p.chartId??0)===seat.chartId),
    frame=sourceContinuationRenderFrame({...base,doorOpen:{[door.id]:true},doorMotion:{[door.id]:{from:0,to:1,startedAt:99,duration:.6}}},{reducedMotion:true}),
    owners=new Map([...frame.canonicalProps,...frame.sourceCodeInstances.filter(p=>!p.portalDestination),...frame.parserArchitecture.props.filter(p=>!p.portalDestination)].map(p=>[p.id,p]));
  assert.ok(frame.sourceCodeInstances.length>0);assert.equal(frame.executionTrail.active,true);
  const lit=[...frame.props,...frame.sourceCodeInstances,...frame.parserArchitecture.props].filter(p=>p.sourceExecution?.gain>0);assert.ok(lit.length>0);
  assert.ok(lit.every(p=>p.sourceExecution.reducedMotion&&p.sourceExecution.phase===.5&&p.sourceExecution.gain===.32));
  for(const copy of lit.filter(p=>p.portalDestination)){const owner=owners.get(copy.canonicalId);if(owner)assert.deepEqual(copy.sourceExecution,owner.sourceExecution);}
  assert.ok(frame.props.filter(p=>p.sourceCodeDetached).every(p=>!p.sourceExecution),'departed stock cannot carry a second execution copy');
});
