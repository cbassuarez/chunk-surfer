import test from 'node:test';
import assert from 'node:assert/strict';
import {JOURNEY_PORTALS,JOURNEY_ROUTES,JOURNEY_JOINT_SOLIDS} from '../src/data/source-continuation-journey.js';
import {SOURCE_CONTINUATION as C,CONTINUATION_DROP_LIPS,continuationSupportAt,continuationSurfaces,continuationSolids,continuationDoors} from '../src/data/source-continuation.js';
import {portalTransformPoint,portalInverse,portalMultiply,portalClipPlanes,transformPortalPlanes} from '../src/render/source-mesh-portals.js';
import {SOURCE_PARSER_ARCHITECTURE,SOURCE_PARSER_SCOPES,sourceParserGeometryLibrary,sourceParserPlacements,sourceParserArchitectureFrame,sourceParserArchitectureImages} from '../src/render/source-parser-architecture.js';
import {sourceRestReturnConfig} from '../src/render/source-rest-return.js';
import {SOURCE_REST_SEATS,sourceRestEyePosition} from '../src/game/source-rest-seat.js';
import {sourceContinuationVoidViews,sourceContinuationVoidInstance} from '../src/render/source-continuation-void.js';
import {cameraBasis} from '../src/render/camera-basis.js';

const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),
  sub=(a,b)=>a.map((v,k)=>v-b[k]),close=(a,b,e=2e-5)=>{assert.equal(a.length,b.length);a.forEach((v,k)=>assert.ok(Math.abs(v-b[k])<e,`${v} != ${b[k]}`));},
  points=g=>Array.from({length:g.p.length/3},(_,k)=>g.p.slice(k*3,k*3+3));

test('scope geometry is closed, consistently outward, finite and bounded architectural stock',()=>{
  const library=sourceParserGeometryLibrary();assert.equal(library.length,18);
  assert.ok(library.length<=SOURCE_PARSER_ARCHITECTURE.maxCanonicalProps);
  assert.ok(library.reduce((n,g)=>n+g.i.length/3,0)<6000);
  for(const geometry of library){
    const p=points(geometry),edges=new Map(),triangles=[];
    assert.equal(geometry.kind,'detail');assert.equal(geometry.material,'source');
    assert.ok(p.every(row=>row.every(Number.isFinite)));assert.ok(geometry.i.every(i=>Number.isInteger(i)&&i>=0&&i<p.length));
    for(let k=0;k<geometry.i.length;k+=3){
      const ids=geometry.i.slice(k,k+3),[a,b,c]=ids.map(i=>p[i]),n=cross(sub(b,a),sub(c,a));
      assert.ok(Math.hypot(...n)>1e-8,geometry.name+' degenerate triangle');
      const t=triangles.length;triangles.push(ids);
      for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');if(!edges.has(key))edges.set(key,[]);edges.get(key).push({triangle:t,orientation:a<b?1:-1});}
    }
    const neighbours=triangles.map(()=>[]);
    for(const uses of edges.values()){
      assert.equal(uses.length,2,geometry.name+' open or overlaid edge');
      assert.equal(uses[0].orientation+uses[1].orientation,0,geometry.name+' inconsistent winding');
      neighbours[uses[0].triangle].push(uses[1].triangle);neighbours[uses[1].triangle].push(uses[0].triangle);
    }
    const seen=new Set();
    for(let k=0;k<triangles.length;k++)if(!seen.has(k)){
      const queue=[k];seen.add(k);let volume=0;
      while(queue.length){const t=queue.pop(),[a,b,c]=triangles[t].map(i=>p[i]);volume+=dot(a,cross(b,c))/6;for(const peer of neighbours[t])if(!seen.has(peer)){seen.add(peer);queue.push(peer);}}
      assert.ok(volume>1e-7,geometry.name+' inward component');
    }
  }
});

test('every real dimensional entrance has an exact authored bracket basis and clear body opening',()=>{
  const placements=sourceParserPlacements(),library=new Map(sourceParserGeometryLibrary().map(g=>[g.name,g]));
  for(const edge of JOURNEY_PORTALS)for(const side of['a','b']){
    const part=placements.find(p=>p.realPortalId===edge.id&&p.portalSide===side),endpoint=edge[side];assert.ok(part);
    close(part.matrix.slice(12,15),endpoint.center);close(part.matrix.slice(0,3),endpoint.right);close(part.matrix.slice(4,7),endpoint.up);close(part.matrix.slice(8,11),endpoint.normal);
    assert.equal(part.chartId,endpoint.chartId);assert.equal(part.collidable,false);assert.equal(part.structural,false);
    for(const point of points(library.get(part.mesh))){
      const outsideX=Math.abs(point[0])>=endpoint.halfWidth+SOURCE_PARSER_ARCHITECTURE.clearance-1e-6,
        outsideY=Math.abs(point[1])>=endpoint.halfHeight+SOURCE_PARSER_ARCHITECTURE.clearance-1e-6;
      assert.ok(outsideX||outsideY,`${part.id} enters its real ${endpoint.halfWidth*2}m aperture`);
    }
    const other=edge[side==='a'?'b':'a'],map=side==='a'?edge.matrix:edge.inverseMatrix;
    close(portalTransformPoint(map,endpoint.center),other.center);
  }
});

test('the nesting hierarchy follows real chart scopes and continues down the Catch rather than inventing a route',()=>{
  const byId=new Map(SOURCE_PARSER_SCOPES.map(scope=>[scope.id,scope]));
  assert.equal(byId.get('chart-0').parent,null);
  for(const scope of SOURCE_PARSER_SCOPES)if(scope.parent){const parent=byId.get(scope.parent);assert.ok(parent);assert.equal(scope.depth,parent.depth+1);}
  assert.equal(byId.get('catch-0').parent,'chart-4');assert.equal(byId.get('catch-3').depth,8);
  const first=sourceParserPlacements().find(p=>p.realPortalId==='first-return'&&p.portalSide==='b'),
    fourth=sourceParserPlacements().find(p=>p.realPortalId==='last-return'&&p.portalSide==='b'),
    closure=sourceParserPlacements().find(p=>p.realPortalId==='catch-closure'&&p.portalSide==='b');
  assert.equal(first.nestingDepth,1);assert.equal(fourth.nestingDepth,4);assert.equal(closure.parserScope,'catch-0');assert.equal(closure.nestingDepth,5);
  assert.ok(sourceParserGeometryLibrary().find(g=>g.name===fourth.mesh).p.length>sourceParserGeometryLibrary().find(g=>g.name===first.mesh).p.length,'receiving scopes accumulate actual nested structural shells');
});

test('scope wells connect the real release lips to supported children and leave the drop envelope empty',()=>{
  const placements=sourceParserPlacements(),library=new Map(sourceParserGeometryLibrary().map(g=>[g.name,g]));
  for(const lip of CONTINUATION_DROP_LIPS){
    const part=placements.find(p=>p.realReleaseId===lip.id);assert.ok(part);assert.equal(part.childLevel,lip.level+1);
    assert.equal(part.scopeTo,'catch-'+(lip.level+1));assert.equal(part.nestingDepth,5+lip.level);
    close(part.matrix.slice(12,15),[lip.x,part.parserAnchor.center[1],lip.z]);
    const child=part.childAnchor.center,support=continuationSupportAt(child[0],child[2],{phase:'catch',chartId:0,level:part.childLevel,feet:child[1]-1.6});
    assert.ok(support,'the child brace must receive a real existing floor');assert.ok(Math.abs(support.y-(child[1]-1.6))<1e-6);
    assert.ok(child[1]<part.parserAnchor.center[1]-5);
    for(const p of points(library.get(part.mesh)))assert.ok(Math.abs(p[0])>C.bodyRadius+.8,'no gutter or bracket can become a bar across the falling body');
  }
  const final=placements.find(p=>p.realDoorId==='catch-final');assert.ok(final);close(final.matrix.slice(12,15),[C.catch.finalDoor.x,C.catch.finalDoor.y+1.3,C.catch.finalDoor.z]);
  assert.equal(final.parserFlow,'return');assert.equal(final.scopeTo,'outside');
});

test('parser architecture stays fixed through time, camera, save seek and scope changes; anchors apply once',()=>{
  const ordinary=sourceParserArchitectureFrame({phase:'wrong-return',chartId:0}),late=sourceParserArchitectureFrame({phase:'catch',chartId:4,level:3,elapsed:700,yaw:2,pitch:-1,sourceRestView:{degradation:.94}}),
    again=sourceParserArchitectureFrame({phase:'wrong-return',chartId:0}),origin={x:19,y:-12,z:43},moved=sourceParserArchitectureFrame({}, {origin});
  const rows=frame=>frame.props.map(p=>[p.id,Array.from(p.matrix)]);
  assert.deepEqual(rows(late),rows(ordinary));assert.deepEqual(rows(again),rows(ordinary));
  assert.equal(late.diagnostics.scopeId,'catch-3');assert.equal(late.diagnostics.depth,8);
  for(let k=0;k<ordinary.props.length;k++){
    const a=ordinary.props[k],b=moved.props[k];close(Array.from(b.matrix).slice(0,12),Array.from(a.matrix).slice(0,12));
    close([b.x,b.y,b.z],[a.x+origin.x,a.y+origin.y,a.z+origin.z]);
    close(portalTransformPoint(portalInverse(b.matrix),[b.x,b.y,b.z]),[0,0,0]);
    assert.equal(b.parserScope,a.parserScope);assert.equal(b.noShadow,true);assert.equal(b.noReflection,true);
  }
});

test('constructing scope scenery never mutates real supports, solids, doors or reciprocal route data',()=>{
  const snapshot=()=>JSON.stringify({surfaces:continuationSurfaces(),solids:continuationSolids(),doors:continuationDoors(),routes:JOURNEY_ROUTES,joints:JOURNEY_JOINT_SOLIDS,portals:JOURNEY_PORTALS}),before=snapshot();
  for(const chartId of[0,1,2,3,4])for(const phase of['wrong-return','catch'])sourceParserArchitectureFrame({phase,chartId,elapsed:400,level:chartId%4},{origin:{x:-18,y:7,z:42}});
  assert.equal(snapshot(),before);assert.equal(SOURCE_PARSER_ARCHITECTURE.collision,false);
  assert.ok(sourceParserPlacements().every(p=>!p.physicalKind&&!p.doorProgress&&!p.horizonTide&&!p.sourceCodeOnly));
});

const translation=(x=0,y=0,z=0)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
test('parser images use only the current chart and real destination maps with current aperture planes',()=>{
  const edge=JOURNEY_PORTALS[0],origin={x:17,y:4,z:-21},frame=sourceParserArchitectureFrame({}, {origin}),copy=structuredClone(frame),
    eye=edge.a.center.map((v,k)=>v+edge.a.normal[k]*4),planes=portalClipPlanes(edge.a,eye),
    view={id:edge.id+':a',destinationChart:edge.toChart,toCurrent:edge.inverseMatrix,planes},
    exclude=[planes],native=sourceParserArchitectureImages(frame,{chartId:0,origin,sourceExcludes:exclude}),
    projected=sourceParserArchitectureImages(frame,{chartId:0,origin,portalViews:[view],sourceExcludes:exclude}),
    expectedMap=portalMultiply(translation(origin.x,origin.y,origin.z),portalMultiply(view.toCurrent,translation(-origin.x,-origin.y,-origin.z))),
    targets=frame.props.filter(p=>p.chartId===edge.toChart),images=projected.props.filter(p=>p.portalDestination);
  assert.ok(native.props.length>0);assert.ok(native.props.every(p=>p.chartId===0&&!p.portalDestination));
  assert.ok(native.props.every(p=>p.portalExcludePlanes.length===1));assert.equal(images.length,targets.length);
  for(let k=0;k<targets.length;k++){
    const original=targets[k],image=images[k];close(image.matrix,portalMultiply(expectedMap,original.matrix));
    close([image.x,image.y,image.z],portalTransformPoint(expectedMap,[original.x,original.y,original.z]));
    assert.deepEqual(image.portalClipPlanes,transformPortalPlanes(planes,translation(origin.x,origin.y,origin.z)));
    assert.equal(image.parserScope,original.parserScope);assert.equal(image.canonicalId,original.id);assert.equal(image.portalExcludePlanes,null);
  }
  const movedPlanes=portalClipPlanes(edge.a,eye.map((v,k)=>v+(k===1?.6:0))),changed=sourceParserArchitectureImages(frame,{chartId:0,origin,portalViews:[{...view,planes:movedPlanes}]}).props.filter(p=>p.portalDestination);
  assert.notDeepEqual(changed[0].portalClipPlanes,images[0].portalClipPlanes,'a moving eye changes the finite current aperture, not scope geometry');
  assert.deepEqual(frame,copy);
});

test('open Return projections preserve execution metadata and do not duplicate their foreground mask',()=>{
  const origin={x:3,y:5,z:-8},frame=sourceParserArchitectureFrame({}, {origin}),seat=SOURCE_REST_SEATS[0],
    target={...frame.props.find(p=>p.chartId===0&&p.region==='wrong-return'),id:'parser-rest-part',restPlace:true,sourceExecution:{id:'actual-branch',strength:.6}},
    canonical={props:[target]},config=sourceRestReturnConfig(seat,{origin}),eye=sourceRestEyePosition(seat).map((v,k)=>v+[origin.x,origin.y,origin.z][k]),
    planes=portalClipPlanes(config.sourceAperture,eye),restReturn={planes,frame:{...config,seat,seatId:seat.id}},
    result=sourceParserArchitectureImages(canonical,{chartId:0,origin,sourceExcludes:[planes],restReturn}),
    native=result.props.find(p=>!p.portalDestination),image=result.props.find(p=>p.restReturnDestination);
  assert.equal(native.portalExcludePlanes.length,1);assert.ok(image);assert.equal(image.sourceExecution,target.sourceExecution);
  close(image.matrix,portalMultiply(config.toCurrent,target.matrix));assert.equal(image.portalClipPlanes,planes);assert.equal(image.portalExcludePlanes,null);
  assert.equal(result.diagnostics.returnImages,1);assert.equal(result.diagnostics.physicalBudgetUsed,0);
  const closed=sourceParserArchitectureImages(canonical,{chartId:0,origin});
  assert.equal(closed.props.length,1);assert.equal(closed.props[0].portalExcludePlanes,null);assert.equal(closed.props[0].restReturnDestination,undefined);
});

test('native void images have an independent fixed budget and preserve the exact scope mapping',()=>{
  const state={phase:'wrong-return',chartId:0,x:0,z:-1.95,feet:0},eye=[0,1.62,-1.95],basis=cameraBasis(0,.7),
    views=sourceContinuationVoidViews(state,{eye,basis}),frame=sourceParserArchitectureFrame(state),
    result=sourceParserArchitectureImages(frame,{chartId:0,voidViews:views}),natives=new Map(frame.props.map(p=>[p.id,p])),
    byView=new Map([...views.lower,...views.upper].map(v=>[v.id,v])),images=result.props.filter(p=>p.voidImage);
  assert.ok(views.domain);assert.ok(images.length>0);
  for(const image of images){
    const original=natives.get(image.canonicalId),view=byView.get(image.portalClipId),expected=sourceContinuationVoidInstance(original,view);
    assert.ok(original&&view);close(image.matrix,expected.matrix);assert.deepEqual(image.portalClipPlanes,expected.portalClipPlanes);
    assert.equal(image.parserScope,original.parserScope);assert.equal(image.nestingDepth,original.nestingDepth);
  }
  for(const limit of[0,1,3,96,1000]){
    const limited=sourceParserArchitectureImages(frame,{chartId:0,voidViews:views,limit});
    assert.ok(limited.props.length<=Math.min(limit,96));assert.equal(limited.diagnostics.physicalBudgetUsed,0);
    assert.equal(limited.diagnostics.budget,Math.min(limit,96));
    for(const part of limited.props)assert.ok([...part.matrix,part.x,part.y,part.z].every(Number.isFinite));
  }
  assert.equal(frame.props.length,18,'limiting scope images cannot consume or remove canonical physical scenery');
});
