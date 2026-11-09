import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCHIPELAGO_ISLANDS,ARCHIPELAGO_SURFACES,ARCHIPELAGO_SOLIDS} from '../src/data/source-continuation-archipelago.js';
import {SOURCE_CONTINUATION as C,continuationSupportAt} from '../src/data/source-continuation.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {JOURNEY_PORTALS} from '../src/data/source-continuation-journey.js';
import {sourceContinuationGeometry,sourceContinuationFlightGeometry,sourceContinuationExitBatchGeometry,sourceContinuationMeshPayload,sourceContinuationRenderFrame,installSourceContinuationMeshes,SOURCE_CONTINUATION_ARCHITECTURE} from '../src/render/source-continuation-renderer.js';
import {sourceExitPassageRenderParts,sourceExitPassageGeometryLibrary} from '../src/render/source-exit-passage.js';
import {sourceContinuationIslandGeometryLibrary} from '../src/render/source-continuation-islands.js';

const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<.0002,`${message}: ${a} != ${b}`);
const geometry=new Map(sourceContinuationGeometry().map(piece=>[piece.id,piece]));
const pose=(at,extra={})=>({...freshSourceContinuation({runId:'archipelago-render'}),status:'active',phase:'catch',chartId:0,
  x:at.x,z:at.z,feet:at.feet,level:at.level,yaw:0,pitch:-1.1,...extra});
function triangleY(a,b,c,x,z){
  const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if(Math.abs(d)<1e-9)return null;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,
    v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d,w=1-u-v;
  return Math.min(u,v,w)<-.00001?null:u*a[1]+v*b[1]+w*c[1];
}
function submittedFloor(state,{anchor={x:0,y:0,z:0}}={}){
  const frame=sourceContinuationRenderFrame(state,{anchor}),support=continuationSupportAt(state.x,state.z,state);
  assert.ok(support,`real support at ${state.x},${state.z},${state.feet}`);
  const prop=frame.props.find(p=>p.physicalKind==='surface'&&!p.portalDestination&&p.descriptorId===support.id);
  assert.ok(prop,`${support.id} must be submitted under the player's feet`);
  const payload=sourceContinuationMeshPayload(geometry.get(support.id));
  let height=null;
  for(let i=0;i<payload.positions.length;i+=9){
    const points=[0,3,6].map(k=>transform(prop.matrix,Array.from(payload.positions.slice(i+k,i+k+3)))),
      y=triangleY(...points,state.x+anchor.x,state.z+anchor.z);
    if(y!==null&&Math.abs(y-(state.feet+anchor.y))<.0002)height=y;
  }
  assert.notEqual(height,null,`${support.id} uploaded triangles must carry the standing body`);
  near(height,state.feet+anchor.y,support.id);
  return frame;
}

test('each destination submits the actual supported floor triangles with its native material',()=>{
  for(const island of ARCHIPELAGO_ISLANDS){
    const frame=submittedFloor(pose(island));
    assert.ok(frame.props.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances,island.id);
    if(island.existing)continue;
    const deck=geometry.get(island.id+'-deck');
    assert.equal(deck.material,{masonry:'cold-stone',soundboard:'piano-wood',binding:'case-lining'}[island.construction]);
    assert.ok(frame.canonicalProps.some(p=>p.descriptorId===island.id+'-deck'&&p.archipelago));
  }
});

test('new stair meshes retain their actual horizontal treads, including anchored submission',()=>{
  const stairs=ARCHIPELAGO_SURFACES.filter(s=>s.role==='stair');
  assert.ok(stairs.length>100);
  for(const row of stairs){
    const piece=geometry.get(row.id),payload=sourceContinuationMeshPayload(piece),x=(row.minX+row.maxX)/2,z=(row.minZ+row.maxZ)/2;
    let top=false;
    for(let i=0;i<payload.positions.length;i+=9){
      const points=[0,3,6].map(k=>Array.from(payload.positions.slice(i+k,i+k+3),(v,j)=>v+payload.bounds.center[j])),y=triangleY(...points,x,z);
      if(y!==null&&Math.abs(y-row.y)<.00001)top=true;
    }
    assert.ok(top,row.id);
  }
  const chosen=[stairs[0],stairs[Math.floor(stairs.length/3)],stairs[Math.floor(stairs.length*2/3)],stairs.at(-1)];
  for(const row of chosen)submittedFloor(pose({x:(row.minX+row.maxX)/2,z:(row.minZ+row.maxZ)/2,feet:row.y,level:row.level}),{anchor:{x:37,y:4,z:-22}});
});

test('physical roots, piers and lintels remain the architecture carrying the islands',()=>{
  const baked=sourceContinuationIslandGeometryLibrary()['catch-island-roots-stone'];
  assert.ok(baked,'the original listening and onward islands retain their rooted silhouettes');
  for(const island of ARCHIPELAGO_ISLANDS.filter(i=>!i.existing)){
    const pier=ARCHIPELAGO_SOLIDS.find(s=>s.islandId===island.id&&s.id.includes('-pier-')),
      lintel=ARCHIPELAGO_SOLIDS.find(s=>s.islandId===island.id&&s.id.endsWith('-lintel'));
    assert.ok(pier&&lintel,island.id);
    const frame=sourceContinuationRenderFrame(pose(island,{x:(pier.minX+pier.maxX)/2,z:pier.minZ-3,pitch:.5,yaw:Math.PI}));
    assert.ok(frame.props.some(p=>p.physicalKind==='solid'&&p.descriptorId===pier.id),'physical island pier is drawn');
    assert.ok(frame.props.some(p=>p.physicalKind==='solid'&&p.descriptorId===lintel.id),'physical island lintel is drawn');
    assert.equal(ARCHIPELAGO_SOLIDS.filter(s=>s.islandId===island.id&&s.id.includes('-root-')).length,3);
    assert.ok(frame.canonicalProps.some(p=>p.archipelagoPractical&&p.islandId===island.id));
  }
});

test('expanded geometry is retained canonically while ordinary and portal submissions stay bounded',()=>{
  const states=[pose(ARCHIPELAGO_ISLANDS[0],{pitch:0,yaw:Math.PI/2}),
    pose(ARCHIPELAGO_ISLANDS[7],{pitch:0,yaw:-Math.PI/2}),
    {...freshSourceContinuation({runId:'ii-render-budget'}),status:'active'},
    ...JOURNEY_PORTALS.map(p=>({...freshSourceContinuation({runId:'portal-render-budget'}),status:'active',phase:'wrong-return',...p.a.approach,chartId:p.a.chartId}))];
  let omitted=0;
  for(const state of states){
    const frame=sourceContinuationRenderFrame(state),canonical=frame.canonicalProps.filter(p=>p.archipelago),submitted=frame.props.filter(p=>p.archipelago&&!p.portalDestination);
    assert.ok(frame.props.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances,`native budget at ${state.chartId}:${state.x},${state.z}: ${frame.props.length}`);
    assert.ok(frame.props.every(p=>p.matrix.every(Number.isFinite)));
    if(state.chartId===0){assert.ok(canonical.length>200);omitted+=canonical.length-submitted.length;}
  }
  assert.ok(omitted>100,'offscreen expansion releases draw slots without deleting the canonical world');
  assert.equal(C.catch.finalDoor.x,-139,'the existing onward composition retains its position');
});

test('the held exit has a visible local chain which clears the leaves after the expedition',()=>{
  const state=pose({x:C.catch.finalApproach.x,z:C.catch.finalApproach.z,feet:C.catch.finalDoor.y,level:0},{pitch:0,yaw:Math.PI/2}),
    held=sourceContinuationRenderFrame(state),visited=ARCHIPELAGO_ISLANDS.filter(i=>Number.isInteger(i.mainIndex)).map(i=>i.id),
    ready=sourceContinuationRenderFrame({...state,expedition:{...state.expedition,visited}});
  assert.ok(held.props.filter(p=>p.expeditionLatch&&p.latchHeld).length>=7,'held leaves visibly carry the chain');
  assert.ok(held.canonicalProps.some(p=>p.id.endsWith('exit-counterweight-chain-3')&&p.y<C.catch.finalDoor.y),'the chain descends outside the destination deck');
  assert.equal(ready.props.some(p=>p.expeditionLatch&&p.latchHeld),false);
  assert.ok(ready.props.some(p=>p.id.endsWith('exit-chain-released')),'spent chain hangs beside the opening');
});

test('static uploaded geometry is reused while the moving closing front keeps its current bounds',()=>{
  const a=sourceContinuationGeometry(),b=sourceContinuationGeometry();
  assert.equal(a.find(p=>p.id==='iii-arrival-court-deck'),b.find(p=>p.id==='iii-arrival-court-deck'));
  const early=sourceContinuationGeometry({phase:'wrong-return',closure:{mode:'closing',frontX:10,frontZ:-12}}).find(p=>p.id==='wrong-closing-front'),
    late=sourceContinuationGeometry({phase:'wrong-return',closure:{mode:'closing',frontX:2,frontZ:-12}}).find(p=>p.id==='wrong-closing-front');
  assert.ok(early&&late);assert.notDeepEqual(early.p,late.p,'dynamic closure must not reuse a stale tessellation');
});

test('distant stair batching retains every real tread triangle rather than substituting a ramp',()=>{
  const portal=JOURNEY_PORTALS[0],frame=sourceContinuationRenderFrame({...freshSourceContinuation(),status:'active',...portal.a.approach,chartId:0}),
    flights=new Map(sourceContinuationFlightGeometry().map(piece=>[piece.id,piece])),submitted=frame.props.filter(p=>p.archipelagoFlight&&!p.portalDestination);
  assert.ok(submitted.length>0,'far flights share a draw while nearby treads retain individual descriptors');
  for(const prop of submitted){
    const piece=flights.get(prop.descriptorId),payload=sourceContinuationMeshPayload(piece);
    assert.equal(piece.i.length,piece.members.reduce((sum,id)=>sum+geometry.get(id).i.length,0),'the batch contains every original triangle');
    assert.equal(piece.material,'cold-stone');
    for(const id of [piece.members[0],piece.members[Math.floor(piece.members.length/2)],piece.members.at(-1)]){
      const row=geometry.get(id).descriptor,x=(row.minX+row.maxX)/2,z=(row.minZ+row.maxZ)/2;
      let found=false;
      for(let i=0;i<payload.positions.length;i+=9){
        const points=[0,3,6].map(k=>transform(prop.matrix,Array.from(payload.positions.slice(i+k,i+k+3)))),y=triangleY(...points,x,z);
        if(y!==null&&Math.abs(y-row.y)<.0002)found=true;
      }
      assert.ok(found,`${id} retains its original submitted horizontal top`);
    }
  }
  assert.ok(submitted.length<submitted.reduce((sum,p)=>sum+flights.get(p.descriptorId).members.length,0),'exact batches reduce distant tread draw calls');
  assert.ok(frame.props.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances,'exact batches retain the native instance budget');
  assert.equal(frame.voidLoop.omittedVisible,0,'the original visible void geometry retains its slots');
});

test('native mesh installation retains new island wood and cloth instead of applying the old silver-machine override',()=>{
  const noop=()=>{},gl={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,STATIC_DRAW:35044,FLOAT:5126,UNSIGNED_INT:5125,TEXTURE_2D:3553,ACTIVE_TEXTURE:34016,TEXTURE_BINDING_2D:32873,UNPACK_FLIP_Y_WEBGL:37440,UNPACK_PREMULTIPLY_ALPHA_WEBGL:37441,SRGB8_ALPHA8:35907,RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,LINEAR_MIPMAP_LINEAR:9987,LINEAR:9729,REPEAT:10497,CLAMP_TO_EDGE:33071,
    createBuffer:()=>({}),createVertexArray:()=>({}),createTexture:()=>({}),bindBuffer:noop,bufferData:noop,bindVertexArray:noop,enableVertexAttribArray:noop,disableVertexAttribArray:noop,vertexAttribPointer:noop,vertexAttribDivisor:noop,vertexAttrib1f:noop,bindTexture:noop,pixelStorei:noop,texImage2D:noop,generateMipmap:noop,texParameteri:noop,activeTexture:noop,getParameter:()=>0},
    pack={catalog:new Map()},maps={blueprint:true,texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}};
  installSourceContinuationMeshes(gl,pack,{maps});
  for(const island of ARCHIPELAGO_ISLANDS.filter(i=>!i.existing)){
    const piece=geometry.get(island.id+'-deck'),primitive=pack.catalog.get(piece.name).primitives[0];
    assert.equal(primitive.materialName,'continuation '+piece.material);
    assert.notEqual(primitive.materialRole,'source-silver-catch');
    if(island.construction!=='masonry'){
      assert.equal(primitive.metallic,0,'retained wood and case lining do not become silver metal');
      assert.ok(primitive.texture,'native grain/cloth texture remains attached');
    }
  }
  const spindle=geometry.get('catch-0-case-crescent');
  assert.equal(pack.catalog.get(spindle.name).primitives[0].materialRole,'source-silver-catch','the original machine keeps its approved silver finish');
});

test('distant exit batches preserve every physical box and stock material while nearby fittings stay individual',()=>{
  const portal=JOURNEY_PORTALS[0],frame=sourceContinuationRenderFrame({...freshSourceContinuation(),status:'active',...portal.a.approach,chartId:0});
  const parts=sourceExitPassageRenderParts(),library=new Map(sourceContinuationExitBatchGeometry().map(piece=>[piece.id,piece])),stock=sourceExitPassageGeometryLibrary();
  const batches=frame.props.filter(p=>p.exitPassageBatch&&!p.portalDestination);
  assert.ok(batches.length>0&&batches.length<parts.length);
  assert.equal(frame.canonicalProps.filter(p=>p.exitPassage&&!p.exitPassageBatch).length,parts.length);
  for(const prop of batches){
    const piece=library.get(prop.descriptorId),payload=sourceContinuationMeshPayload(piece),vertices=[];
    for(let i=0;i<payload.positions.length;i+=3)vertices.push(transform(prop.matrix,Array.from(payload.positions.slice(i,i+3))));
    assert.equal(payload.triangles,piece.members.length*12);
    for(const id of piece.members){
      const part=parts.find(p=>p.id===id);assert.equal(piece.material,stock[part.mesh].material);assert.deepEqual(piece.base,stock[part.mesh].base);
      const {min,max}=part.physicalBounds;
      for(const x of[min[0],max[0]])for(const y of[min[1],max[1]])for(const z of[min[2],max[2]])assert.ok(vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<.0002),`${id}: original world-space corner`);
    }
  }
  const close=sourceContinuationRenderFrame(pose({...C.catch.finalApproach,level:0},{yaw:Math.PI/2,pitch:0}));
  assert.equal(close.props.some(p=>p.exitPassageBatch),false);
  assert.ok(close.props.some(p=>p.descriptorId==='source-exit-floor-service-road'&&p.physicalKind==='surface'));
  assert.equal(frame.voidLoop.omittedVisible,0);
});
