import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFreedMemoryFrame} from '../src/render/source-freed-memory.js';

const matrix=(x=0,y=0,z=0,yaw=0)=>{
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,x,y,z,1]);
};
const part=(id='wall',extra={})=>({id,mesh:'source-wall',matrix:matrix(3,9,-14,.4),x:3,y:9,z:-14,...extra});
const physical=result=>result.props.filter(p=>!p?.sourceCodeOnly);

test('release clocks detach glyph ownership at the exact boundary without moving physical stock',()=>{
  const rest=part(),live={...rest,matrix:matrix(22,-40,-9,1.6),x:22,y:-40,z:-9,horizonTide:{release:20,anchor:1.2}},
    before=structuredClone({rest,live});
  const early=sourceFreedMemoryFrame([rest],[live],{clock:19.999999});
  assert.equal(early.memories.length,0);assert.equal(early.props[0],live);
  const at=sourceFreedMemoryFrame([rest],[live],{clock:20});
  assert.equal(at.memories.length,1);assert.equal(at.props[0].sourceCodeDetached,true);
  assert.equal(at.props[0].matrix,live.matrix,'physical matrix must remain the exact original object');
  assert.equal(at.props[0].horizonTide,live.horizonTide,'physical infall remains active');
  assert.deepEqual(at.memories[0].matrix,rest.matrix);
  assert.deepEqual({rest,live},before);
});

test('falling, rotating and removed owners leave the same original world address on a cold seek',()=>{
  const rest=part('offscreen-before-fall',{matrix:matrix(120,100,-382,.87),x:120,y:100,z:-382});
  const falling=sourceFreedMemoryFrame([rest],[{...rest,restDetached:true,matrix:matrix(-60,-50,90,-1.2)}]);
  const later=sourceFreedMemoryFrame([rest],[{...rest,restDetached:true,matrix:matrix(800,-900,300,2.7)}]);
  const consumed=sourceFreedMemoryFrame([rest],[]);
  assert.deepEqual(falling.memories,later.memories);
  assert.deepEqual(later.memories,consumed.memories,'absence of the stock must not erase its source');
  assert.deepEqual([consumed.memories[0].x,consumed.memories[0].y,consumed.memories[0].z],[120,100,-382]);
  assert.notEqual(consumed.memories[0].matrix,rest.matrix,'the rest buffer is owned by the proxy, not a mutable carrier');
  assert.equal(consumed.props.length,1);assert.equal(consumed.props[0].sourceCodeOnly,true);
});

test('ordinary attached motion does not release code; explicit degradation and detachment do',()=>{
  const rest=part();
  for(const live of [rest,{...rest,matrix:matrix(50,-20,10)},{...rest,restDrift:0},{...rest,horizonTide:{release:100}}]){
    assert.equal(sourceFreedMemoryFrame([rest],[live],{clock:99}).memories.length,0);
  }
  for(const live of [{...rest,restDetached:true},{...rest,restDrift:.00001}]){
    assert.equal(sourceFreedMemoryFrame([rest],[live]).memories.length,1);
  }
});

test('an owner-specific release policy overrides default damage and eligibility stays explicit',()=>{
  const rest=part('cell',{releaseAt:6}),live={...rest,restDetached:true},calls=[];
  const options={released:(original,current,{clock})=>{
    calls.push([original,current,clock]);return clock>=original.releaseAt;
  }};
  assert.equal(sourceFreedMemoryFrame([rest],[live],{...options,clock:5.999}).memories.length,0);
  assert.equal(sourceFreedMemoryFrame([rest],[live],{...options,clock:6}).memories.length,1);
  assert.deepEqual(calls.map(row=>row[2]),[5.999,6]);
  assert.ok(calls.every(([original,current])=>original===rest&&current===live));
  assert.equal(sourceFreedMemoryFrame([rest],[live],{eligible:()=>false}).memories.length,0);
  assert.equal(sourceFreedMemoryFrame([rest],[live],{released:()=>false}).props[0],live);
});

test('physical ordering, transforms and all intact inputs survive alongside the glyph-only append',()=>{
  const a=part('a'),b=part('b'),falling={...a,restDetached:true,matrix:matrix(8,-70,5)},live=[b,falling],
    before=structuredClone({a,b,live}),result=sourceFreedMemoryFrame([a,b],live);
  assert.deepEqual(physical(result).map(p=>p.id),['b','a']);
  assert.equal(result.props[0],b,'an unchanged physical prop keeps its original reference');
  assert.equal(result.props[1].matrix,falling.matrix);
  assert.deepEqual(result.props[1],{...falling,sourceCodeDetached:true});
  assert.equal(result.props[2],result.memories[0]);
  assert.deepEqual({a,b,live},before);
});

test('replacement fragments lose duplicate glyphs without claiming prefix neighbours',()=>{
  const rest=part('pier'),ids=['pier:horizon-0','pier:fracture:2','pier:mistake-section:4',
    'pier:horizon-0:fracture:1','pier2','pier-neighbour','pier:horizon-','pier:fracture:','pier:mistake-'],
    rows=ids.map(id=>part(id)),linked=part('opaque-fragment',{fracturedFrom:'pier'}),
    linkedNested=part('another-fragment',{fracturedFrom:'pier:horizon-2'}),mistake=part('replacement',{restMistakeCarrier:'pier'}),
    result=sourceFreedMemoryFrame([rest],[...rows,linked,linkedNested,mistake]);
  const output=new Map(physical(result).map(p=>[p.id,p]));
  for(const id of ids.slice(0,4))assert.equal(output.get(id).sourceCodeDetached,true,id);
  for(const id of ids.slice(4))assert.equal(output.get(id).sourceCodeDetached,undefined,id);
  for(const row of [linked,linkedNested,mistake])assert.equal(output.get(row.id).sourceCodeDetached,true,row.id);
  assert.equal(result.memories.length,1,'replacement fragments must not invent individual copies of the original code');
  for(const row of rows)assert.equal(row.sourceCodeDetached,undefined);
});

test('native source mapping and current chart/portal metadata survive without baking a node transform',()=>{
  const printedSurface={coverage:'baseColorAlpha',process:'source-blueprint-fragments'},uvs=[0,0,1,0,1,1],
    clip=[[1,0,0,5]],excludes=[[[0,0,1,-4]]],world=matrix(8,0,13),node=matrix(2,3,-5,.2),
    rest=part('chart-wall',{printedSurface,uvs,text:'const actual = original.call();',chartId:4,
      portalClipPlanes:clip,portalExcludePlanes:excludes,sourceWorldMatrix:world,nodeMatrix:node,
      sourceMemoryRole:'stratum',matrix:matrix(7,14,-24)}),
    memory=sourceFreedMemoryFrame([rest],[]).memories[0];
  assert.equal(memory.mesh,rest.mesh);assert.equal(memory.printedSurface,printedSurface);assert.equal(memory.uvs,uvs);
  assert.equal(memory.text,rest.text);assert.equal(memory.chartId,4);
  assert.equal(memory.portalClipPlanes,clip);assert.equal(memory.portalExcludePlanes,excludes);
  assert.equal(memory.sourceWorldMatrix,world);assert.equal(memory.nodeMatrix,node);
  assert.deepEqual(memory.matrix,rest.matrix,'normal prop upload, not memory policy, multiplies mesh.nodeMatrix once');
  assert.deepEqual([memory.x,memory.y,memory.z],[7,14,-24]);assert.equal(memory.sourceMemoryRole,'stratum');
  const nextClip=[[1,0,0,9]],next=sourceFreedMemoryFrame([{...rest,portalClipPlanes:nextClip}],[]).memories[0];
  assert.equal(next.portalClipPlanes,nextClip,'a fresh projection must not inherit a previously captured aperture');
});

test('retained glyphs clear carrier animation and have no stock, shadow or reflection ownership',()=>{
  const rest=part('animated-carrier',{horizonTide:{release:2},horizonChip:true,restDetached:true,restDrift:8,
    animation:{clip:'fall'},animationTime:99,pose:{y:5},morphWeights:[1],vegetationWind:{amplitudeM:3},
    apparitionVariant:14,portraitIndex:9,emissive:[1,0,1,1],structural:true}),
    memory=sourceFreedMemoryFrame([rest],[]).memories[0];
  for(const key of ['horizonTide','horizonChip','restDetached','restDrift','animation','animationTime','pose',
    'morphWeights','vegetationWind','apparitionVariant','portraitIndex','emissive'])assert.equal(key in memory,false,key);
  assert.equal(memory.sourceCodeOnly,true);assert.equal(memory.sourceCodeDetached,false);
  assert.equal(memory.structural,false);assert.equal(memory.noShadow,true);assert.equal(memory.noReflection,true);
  assert.deepEqual(memory.sourceCodeMemory,{ownerId:rest.id});
  assert.equal(rest.horizonTide.release,2);assert.equal(rest.apparitionVariant,14);
});

test('bounded memory allocation never suppresses an owner whose memory was omitted',()=>{
  const rest=Array.from({length:4},(_,n)=>part('wall-'+n)),live=rest.map(p=>({...p,restDetached:true})),
    limited=sourceFreedMemoryFrame(rest,live,{limit:2});
  assert.deepEqual(limited.memories.map(p=>p.sourceCodeMemory.ownerId),['wall-0','wall-1']);
  assert.equal(limited.props[0].sourceCodeDetached,true);assert.equal(limited.props[1].sourceCodeDetached,true);
  assert.equal(limited.props[2],live[2]);assert.equal(limited.props[3],live[3]);
  assert.equal(limited.diagnostics.omitted,2);assert.equal(limited.diagnostics.limit,2);
  const none=sourceFreedMemoryFrame(rest,live,{limit:0});
  assert.deepEqual(none.props,live);assert.equal(none.memories.length,0);
  const collision=part('wall-0:freed-code'),reserved=sourceFreedMemoryFrame([rest[0]],[live[0],collision]);
  assert.equal(reserved.memories.length,0);assert.equal(reserved.props[0],live[0]);assert.equal(reserved.props[1],collision);
});

test('duplicate rest entries and repeated projection cannot append duplicate code owners',()=>{
  const rest=part(),live={...rest,restDetached:true},first=sourceFreedMemoryFrame([rest,rest],[live]);
  assert.equal(first.memories.length,1);assert.equal(first.diagnostics.skipped,1);
  const again=sourceFreedMemoryFrame([rest],first.props);
  assert.equal(again.props.filter(p=>p.sourceCodeOnly).length,1);
  assert.equal(again.props[0].sourceCodeDetached,true);
  assert.equal(again.props[1],first.memories[0]);
});

test('invalid data, bodies, paper and existing glyph memories cannot become architecture memories',()=>{
  const overflow=Array.from(matrix());overflow[12]=Number.MAX_VALUE;
  const invalid=[null,{},part(' '),part('bad-mesh',{mesh:7}),part('short',{matrix:[1,2]}),
    part('nan',{matrix:Array(16).fill(NaN)}),part('overflow',{matrix:overflow}),
    part('actor',{character:{clip:'idle'}}),part('player',{playerBody:true}),part('player-flag',{player:true}),
    part('body',{restBody:true}),part('paper',{paperIndex:0}),part('already-memory',{sourceCodeOnly:true})];
  const good=part('actual-source'),result=sourceFreedMemoryFrame([...invalid,good],[]);
  assert.deepEqual(result.memories.map(p=>p.sourceCodeMemory.ownerId),['actual-source']);
  assert.equal(result.diagnostics.skipped,invalid.length);
  assert.deepEqual(sourceFreedMemoryFrame(null,null).props,[]);
});

test('new runs and interleaved rooms resolve their own rest address without retained history',()=>{
  const a=part('shared-id',{matrix:matrix(2,100,-8)}),b=part('shared-id',{matrix:matrix(-400,14,82)});
  const first=sourceFreedMemoryFrame([a],[]).memories[0];
  const second=sourceFreedMemoryFrame([b],[]).memories[0];
  assert.deepEqual(first.matrix,a.matrix);assert.deepEqual(second.matrix,b.matrix);
  assert.deepEqual(sourceFreedMemoryFrame([a],[a]).memories,[],'new intact ownership must not inherit an older run release');
  assert.deepEqual(sourceFreedMemoryFrame([a],[]).memories[0],first,'cold seeking reconstructs the same authored memory');
});

test('a full retained owner set isolates exact nested descendants at the fixed default cap',()=>{
  const rest=Array.from({length:520},(_,n)=>part('island-pier-'+n));
  const linked=rest.map((p,n)=>part(p.id+':horizon-'+n+':fracture:0'));
  const result=sourceFreedMemoryFrame(rest,linked);
  assert.equal(result.memories.length,512);assert.equal(result.diagnostics.omitted,8);
  assert.ok(result.props.slice(0,512).every(p=>p.sourceCodeDetached));
  assert.ok(result.props.slice(512,520).every((p,n)=>p===linked[n+512]));
});
