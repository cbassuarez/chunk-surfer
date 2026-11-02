import test from 'node:test';
import assert from 'node:assert/strict';
import {JOURNEY_PORTALS,JOURNEY_ROUTES,JOURNEY_SURFACES,JOURNEY_SIGHTLINES,JOURNEY_REFUGES} from '../src/data/source-continuation-journey.js';
import {SOURCE_CONTINUATION as C,SOURCE_CONTINUATION_ROUTES,continuationSupportAt} from '../src/data/source-continuation.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {continuationCameraBasis,continuationCameraEye,continuationBodyBasis,portalEdge,transferContinuationPortal} from '../src/game/source-continuation-portals.js';
import {sourceContinuationGeometry,sourceContinuationMeshPayload,sourceContinuationRenderFrame,sourceContinuationPresentation,sourceContinuationAcousticFrame,SOURCE_CONTINUATION_BACKDROP_ATLAS} from '../src/render/source-continuation-renderer.js';
import {portalIdentity,portalMultiply,portalTransformPoint,portalTransformVector,portalInverse,portalClipPlanes} from '../src/render/source-mesh-portals.js';
import {encodeSourceSurroundingsPressure,sampleSourceSurroundingsPressure} from '../src/render/source-surroundings-pressure.js';
import {pressureSurfaceInstances} from '../src/render/pressure-volume.js';
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),sub=(a,b)=>a.map((v,k)=>v-b[k]);
const close=(a,b,label='')=>assert.ok(Math.abs(a-b)<4e-5,`${label}: ${a} != ${b}`);
const close3=(a,b,label='')=>a.forEach((v,k)=>close(v,b[k],label));
const pose=p=>({...freshSourceContinuation(),status:'active',...p,phase:p.phase||'wrong-return'});
const planeValue=(p,q)=>dot(p.slice(0,3),q)+p[3];
const kept=(p,q)=>(!p.portalClipPlanes||p.portalClipPlanes.every(v=>planeValue(v,q)>=-1e-5))&&(!p.portalExcludePlanes||!p.portalExcludePlanes.some(cone=>cone.every(v=>planeValue(v,q)>=-1e-5)));
function topHeight(a,b,c,x,z){const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-10)return null;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d,w=1-u-v;return Math.min(u,v,w)<-1e-6?null:u*a[1]+v*b[1]+w*c[1];}
const geometry=new Map(sourceContinuationGeometry().filter(g=>g.kind==='surface').map(g=>[g.id,g]));
function actualSupported(p,label){
 const support=continuationSupportAt(p.x,p.z,p,{minY:p.feet-.01,maxY:p.feet+.01});assert.ok(support,label);const g=geometry.get(support.id),m=sourceContinuationMeshPayload(g);let actual=false;
 for(let i=0;i<m.positions.length;i+=9){const ps=[0,1,2].map(k=>Array.from(m.positions.slice(i+k*3,i+k*3+3),(v,j)=>v+m.bounds.center[j])),y=topHeight(...ps,p.x,p.z);if(y!=null&&Math.abs(y-p.feet)<1e-5)actual=true;}
 assert.ok(actual,`${label}: actual uploaded triangle top`);
}
function segment(a,b,label){assert.equal(a.chartId,b.chartId);const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.45));for(let i=0;i<=n;i++)actualSupported({...a,x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n},label);}

test('all seven real square apertures glue their actual corners and normals by exact reciprocal rigid matrices',()=>{
 assert.equal(JOURNEY_PORTALS.length,7);assert.deepEqual(JOURNEY_PORTALS.slice(0,4).map(p=>p.rotation),[{axis:'x',degrees:90},{axis:'z',degrees:90},{axis:'x',degrees:-90},{axis:'z',degrees:-90}]);
 for(const p of JOURNEY_PORTALS){close3(portalTransformPoint(p.matrix,p.a.center),p.b.center,p.id);close3(portalTransformVector(p.matrix,p.a.normal),p.b.normal.map(v=>-v),p.id);for(const a of p.a.corners){const q=portalTransformPoint(p.matrix,a);assert.ok(p.b.corners.some(b=>Math.hypot(...sub(q,b))<1e-8));close3(portalTransformPoint(p.inverseMatrix,q),a,p.id);}portalMultiply(p.inverseMatrix,p.matrix).forEach((v,k)=>close(v,portalIdentity()[k],p.id));assert.equal(p.a.halfWidth,1.6);assert.equal(p.a.halfHeight,1.6);}
});

test('the sustained main spine, both cross-link branches and refuge necks have actual matching triangle support',()=>{
 let metres=0;for(let i=1;i<JOURNEY_ROUTES.main.length;i++){const a=JOURNEY_ROUTES.main[i-1],b=JOURNEY_ROUTES.main[i];if(a.chartId!==b.chartId)continue;segment(a,b,'main spine');metres+=Math.hypot(a.x-b.x,a.z-b.z);}
 assert.ok(metres>400&&metres<500,'finite outward terrain, measured independently from duration');
 for(const p of JOURNEY_PORTALS.slice(5))for(const e of[p.a,p.b]){const a={...e,x:e.x+e.normal[0]*3,z:e.z+e.normal[2]*3};segment(a,e,p.id+' actual branch');}
 segment({x:-107,z:-18,feet:16.8,chartId:1},JOURNEY_REFUGES[0],'upper refuge neck');segment({x:-156,z:-45,feet:0,chartId:3},JOURNEY_REFUGES[1],'lower refuge neck');
 assert.ok(JOURNEY_SURFACES.some(s=>s.chartId===2&&s.maxX-s.minX<1),'the thin return is a physical risk, rather than more corridor padding');
});

test('two supported closed walks have nonidentity holonomy rather than a global Euclidean embedding',()=>{
 // 0→1→2→0 returns to the upper refuge actually connected to the original
 // stair network and the first departure. Catch is not a false closing edge.
 for(const indices of[[0,1,6],[1,2,5]]){
  let product=portalIdentity();for(const i of indices)product=portalMultiply(JOURNEY_PORTALS[i].matrix,product);
  assert.ok(product.slice(0,12).some((v,k)=>Math.abs(v-portalIdentity()[k])>.5),'orientation cannot telescope to one global chart embedding');
  for(let k=0;k<2;k++){const start=JOURNEY_PORTALS[indices[k]].b,end=JOURNEY_PORTALS[indices[k+1]].a,route=JOURNEY_ROUTES.main.filter(p=>p.chartId===start.chartId);assert.ok(route.length>6);actualSupported(start,'closed walk receiving pad');actualSupported(end,'closed walk departure pad');}
 }
 segment({x:0,z:-19,feet:8.4,chartId:0},{x:0,z:-12,feet:8.4,chartId:0},'physical return into earlier upper route');segment({x:0,z:-12,feet:8.4,chartId:0},{x:-18,z:-12,feet:8.4,chartId:0},'original upper route closes first loop');
 segment({x:-88,z:-1,feet:16.8,chartId:1},{x:-88,z:-5,feet:16.8,chartId:1},'shortcut emergence joins already walked upper return');
});

test('two forward viewpoints at each usable cross-link show the actual earlier landmark through independently rotated geometry',()=>{
 const seen=new Set();for(const ray of JOURNEY_SIGHTLINES.filter(s=>s.forwardRecognition)){
  const s=pose({x:ray.eye.x,z:ray.eye.z,feet:ray.feet,chartId:ray.chartId,yaw:ray.yaw,pitch:ray.pitch}),f=sourceContinuationRenderFrame(s),edge=JOURNEY_PORTALS.find(p=>p.id===ray.portalId),view=f.portals.find(p=>p.edgeId===edge.id&&p.side==='a');assert.ok(view,ray.id);
  const landmark='journey-'+ray.portalId+'-old-landmark',copy=f.props.find(p=>p.portalDestination&&p.landmarkId===landmark&&p.id.includes('joint-lamp-'));assert.ok(copy,`${ray.id}: earlier actual mesh is submitted`);assert.ok(kept(copy,[copy.x,copy.y,copy.z]),`${ray.id}: actual fixture lies inside finite aperture`);
  const original=portalTransformPoint(edge.matrix,[copy.x,copy.y,copy.z]);close3(original,[edge.toChart===0?1.08:-86.92,ray.target.y,ray.target.z]);
  const basis=continuationCameraBasis(s),target=[copy.x,copy.y,copy.z],delta=sub(target,f.eye);assert.ok(dot(delta,basis.forward)>0,'earlier route appears ahead before committing');
  // The old supported floor remains a rotated wall/ceiling in this view.
  const floor=f.props.find(p=>p.portalDestination&&p.physicalKind==='surface'&&p.chartId===ray.targetChart&&p.portalClipId===view.id&&(()=>{const g=geometry.get(p.descriptorId)?.descriptor;return g&&ray.target.x>=g.minX&&ray.target.x<=g.maxX&&ray.target.z>=g.minZ&&ray.target.z<=g.maxZ&&Math.abs(g.y-(ray.target.y-1.25))<1e-5;})());assert.ok(floor,'the viewed landmark belongs to an actual previously walked floor');assert.ok(Math.abs(floor.matrix[5])<.01,'that floor up is visibly changed, rather than just translated');
  const shifted=portalClipPlanes(edge.a,[ray.eye.x+.18,ray.eye.y,ray.eye.z+.12]);assert.notDeepEqual(shifted,copy.portalClipPlanes,'head translation changes finite aperture parallax');seen.add(ray.portalId);
 }
 assert.equal(seen.size,2);assert.ok(SOURCE_CONTINUATION_ROUTES.main.some(p=>p[0]===0&&p[1]===-20),'chart0 remembered floor is earned on original main route');
});

test('full controller camera and body bases are used exactly while all submitted geometry and clips share eye compensation',()=>{
 const e=portalEdge(JOURNEY_PORTALS[0]),s=pose({...e.source.approach,x:e.source.x+.02,yaw:-Math.PI/2,pitch:.12});s.hush={...s.hush,active:true,...s,bodyTransit:null};
 const beforeEye=continuationCameraEye(s);transferContinuationPortal(s,e,{velocity:[-3.2,0,0]});close3(continuationCameraEye(s),portalTransformPoint(e.matrix,beforeEye));
 const presentation=sourceContinuationPresentation(s),camera=continuationCameraBasis(s);for(const k of['right','up','forward'])close3(presentation.basis[k],camera[k]);close3(presentation.eye,continuationCameraEye(s));
 const raw=[s.x+2,s.feet+1,s.z-3],q=portalTransformPoint(presentation.compensation,raw),ordinary={right:[Math.cos(s.yaw),0,Math.sin(s.yaw)],up:[-Math.sin(s.yaw)*Math.sin(s.pitch),Math.cos(s.pitch),Math.cos(s.yaw)*Math.sin(s.pitch)],forward:[Math.sin(s.yaw)*Math.cos(s.pitch),Math.sin(s.pitch),-Math.cos(s.yaw)*Math.cos(s.pitch)]};for(const k of['right','up','forward'])close(dot(sub(raw,presentation.eye),camera[k]),dot(sub(q,presentation.eye),ordinary[k]));
});

test('one actual Hush pose has complementary portal halves before and after its canonical centre crosses',()=>{
 const p=JOURNEY_PORTALS[0],s=pose({...p.a.approach,yaw:-Math.PI/2}),actor={...s.hush,active:true,x:p.a.x+.08,z:p.a.z,feet:p.a.feet,chartId:0,heading:-Math.PI/2,mode:'follow',animationClock:8.2,density:{...s.hush.density,phase:.43,traction:.9}};s.hush=actor;
 const before=sourceContinuationRenderFrame(s),leading=before.pressureInstances.find(p=>p.portalFragment==='leading');assert.ok(leading);assert.ok(before.pressureInstances.some(p=>p.portalExcludePlanes));
 const originalRoot=before.pressureInstances.find(p=>!p.portalFragment).matrix;transferContinuationPortal(actor,portalEdge(p),{eye:false});
 const after=sourceContinuationRenderFrame(s),image=after.pressureInstances.find(p=>p.portalFragment==='destination'),trailing=after.pressureInstances.find(p=>p.portalFragment==='trailing');assert.ok(image&&trailing);originalRoot.forEach((v,k)=>close(v,image.matrix[k],'same skinned root across centre transfer'));
 for(const f of[before,after]){
  assert.ok(f.pressureInstances.length<=4);assert.equal(new Set(f.pressureInstances.map(p=>p.canonicalActorId)).size,1);
  assert.ok(f.pressureInstances.every(p=>p.mesh==='hush_density_core'&&p.densitySurface&&p.canonicalActorId===actor.id));
  assert.equal(new Set(f.pressureInstances.map(p=>p.character.time)).size,1);assert.equal(f.counts.hush,1);
  assert.ok(f.pressureInstances.every(p=>p.character.time===actor.density.phase*2.4));
  const surfaces=pressureSurfaceInstances(f.pressureInstances);assert.equal(surfaces.length,f.pressureInstances.length);
  surfaces.forEach((surface,i)=>{const core=f.pressureInstances[i];assert.equal(surface.mesh,'hush_density_return');assert.deepEqual(surface.character,core.character);assert.deepEqual([...surface.matrix],[...core.matrix]);assert.deepEqual(surface.portalClipPlanes,core.portalClipPlanes);assert.deepEqual(surface.portalExcludePlanes,core.portalExcludePlanes);});
 }
});

test('acoustic aperture paths survive looking away and carry chart0 ensembles through the outward graph',()=>{
 const p=JOURNEY_PORTALS[0],s=pose({...p.a.approach,yaw:-Math.PI/2}),a=sourceContinuationAcousticFrame(s),b=sourceContinuationAcousticFrame({...s,yaw:Math.PI/2}),source={x:-88,y:18,z:-5};assert.deepEqual(a.projectPoint(1,source),b.projectPoint(1,source));
 const remote=sourceContinuationAcousticFrame(pose({chartId:3,x:-158,z:-45,feet:0}));assert.ok(Object.values(remote.projectPoint(0,{x:0,y:1.62,z:2})).every(Number.isFinite));
 const catchPose=pose({phase:'catch',x:-164,z:-92,feet:-12.6,level:3,yaw:1,pitch:-1}),catchEar=sourceContinuationAcousticFrame(catchPose),catchBasis=continuationCameraBasis(catchPose);close3(catchEar.listener.eye,[-164,-12.6+C.eyeHeight,-92]);for(const axis of['forward','up','right'])close3(catchEar.listener[axis],catchBasis[axis],'the Catch listener follows the real first-person head');assert.notDeepEqual(catchEar.listener.forward,[0,0,-1]);
});


test('only two one-bounce actual neighborhoods are submitted and their source floors receive complementary holes',()=>{
 for(const portal of JOURNEY_PORTALS){const s=pose({...portal.a.approach}),f=sourceContinuationRenderFrame(s);assert.ok(f.portals.length<=2);assert.ok(f.props.length<=760);const active=new Set(f.portals.map(p=>p.id));for(const p of f.props.filter(p=>p.portalDestination&&!p.voidImage)){assert.ok(active.has(p.portalClipId));assert.equal(p.id.split(':through:').length,2,'there is no recursively copied third world');assert.ok(p.canonicalId);assert.equal(p.portalExcludePlanes,null);}
  const own=f.props.find(p=>!p.portalDestination&&p.physicalKind==='surface'),e=portal.a,q=e.center.map((v,k)=>v-e.normal[k]*2);assert.ok(own.portalExcludePlanes?.length);assert.equal(kept(own,q),false,'source deck cannot occlude the actual connected floor');
  for(const p of f.props.filter(p=>p.surroundings))assert.ok(p.sourceWorldMatrix?.length===16,'printed sky/pressure is evaluated in the same original world after full transforms');
 }
});


test('every outward chart retains exactly the same five Fall bodies and two native sender parts as a nonphysical background atlas',()=>{
 const elapsed=22.4,base=sourceContinuationRenderFrame(pose({elapsed})),canonical=base.canonicalProps.filter(p=>p.surroundings&&p.world==='fall'&&!p.portalDestination&&!p.backdropAtlas),ids=canonical.map(p=>p.id).sort();assert.equal(canonical.length,22);
 for(const atlas of SOURCE_CONTINUATION_BACKDROP_ATLAS.slice(1)){
  const approach=JOURNEY_PORTALS[atlas.chartId-1].b.approach,s=pose({...approach,elapsed}),f=sourceContinuationRenderFrame(s),sky=f.canonicalProps.filter(p=>p.backdropAtlas&&!p.portalDestination);assert.equal(sky.length,22);assert.deepEqual(sky.map(p=>p.canonicalId).sort(),ids);assert.equal(new Set(sky.filter(p=>p.materialRole!=='source-surroundings-emitter').map(p=>p.bodyId)).size,5);assert.equal(new Set(sky.filter(p=>p.materialRole==='source-surroundings-emitter').map(p=>p.bodyId)).size,2);assert.ok(sky.every(p=>p.chartId===atlas.chartId&&p.world==='fall'&&p.canonicalChartId===0&&p.sourceSurroundingsSide===0));assert.equal(f.props.some(p=>!p.portalDestination&&p.world==='centre'),false);
  for(const p of sky){const original=canonical.find(q=>q.id===p.canonicalId),expected=portalMultiply(atlas.matrix,original.matrix);expected.forEach((v,k)=>close(v,p.matrix[k],'one canonical body through the fixed tree'));close3(portalTransformPoint(portalInverse(p.sourceWorldMatrix),[p.x,p.y,p.z]),[original.x,original.y,original.z]);assert.equal(p.noCollision,true);assert.equal(p.walkable,false);assert.equal(p.decorative,true);assert.equal(p.physicalKind,undefined);assert.ok(!f.geometry.surfaces.some(q=>q.id===p.id)&&!f.geometry.solids.some(q=>q.id===p.id),'the sky cannot manufacture an unsupported roof or new collision');}
  assert.equal(f.surroundings.clock,elapsed);assert.ok(f.props.length<=760);const allImages=f.canonicalProps.filter(p=>p.surroundings&&p.world==='fall');assert.equal(new Set(allImages.map(p=>p.canonicalId||p.id)).size,22,'portal images do not create another cosmos');
 }
});

test('tree seams unfold one canonical backdrop and pressure source rather than restarting or deforming a second simulation',()=>{
 for(let k=0;k<4;k++){const edge=JOURNEY_PORTALS[k],from=SOURCE_CONTINUATION_BACKDROP_ATLAS[k],to=SOURCE_CONTINUATION_BACKDROP_ATLAS[k+1],unfolded=portalMultiply(edge.inverseMatrix,to.matrix);unfolded.forEach((v,i)=>close(v,from.matrix[i],'tree sky is continuous in the entry aperture'));}
 const elapsed=22.4,base=sourceContinuationRenderFrame(pose({elapsed})),original=base.canonicalProps.find(p=>p.surroundings&&p.world==='fall'&&!p.portalDestination&&!p.backdropAtlas&&p.materialRole!=='source-surroundings-emitter'),world=[original.x,original.y,original.z],origin={x:world[0]-9,y:world[1],z:world[2]},field=encodeSourceSurroundingsPressure({gate:base.surroundings.gate,waves:[{world:'fall',age:1,speed:9,width:12,strength:.8,radius:9,origin}]});
 const canonical=sampleSourceSurroundingsPressure(field,{side:1,world});assert.ok(canonical.stress>.79);
 for(const atlas of SOURCE_CONTINUATION_BACKDROP_ATLAS.slice(1)){const f=sourceContinuationRenderFrame(pose({...JOURNEY_PORTALS[atlas.chartId-1].b.approach,elapsed})),image=f.canonicalProps.find(p=>p.backdropAtlas&&!p.portalDestination&&p.canonicalId===original.id),response=sampleSourceSurroundingsPressure(field,{side:1,world:[image.x,image.y,image.z],presentationMatrix:image.sourceWorldMatrix});close(response.stress,canonical.stress);close(response.coordinate,canonical.coordinate);close3(response.displacement,portalTransformVector(atlas.matrix,canonical.displacement),'pressure is evaluated at the same original body point, then rigidly presented');}
});
