import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C} from '../src/data/source-continuation.js';
import {continuationVoidDomain} from '../src/data/source-continuation-void.js';
import {captureContinuationVoidLoop,wrapContinuationVoid} from '../src/game/source-continuation-void.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame,sourceContinuationPresentation,SOURCE_CONTINUATION_ARCHITECTURE} from '../src/render/source-continuation-renderer.js';
import {sourceContinuationVoidViews,sourceContinuationVoidInFrustum} from '../src/render/source-continuation-void.js';
import {pressureSurfaceInstances} from '../src/render/pressure-volume.js';
import {portalTransformPoint} from '../src/render/source-mesh-portals.js';
const domain=continuationVoidDomain({chartId:0,feet:8.4});
function seam(pitch=-.6,d=domain){
 const fall={x:d.phase==='catch'?-190:29,z:d.phase==='catch'?-112:-31,feet:d.exitY-C.eyeHeight+.001,chartId:0,vx:3,vy:-27,vz:0,elapsed:4,
  fromPhase:d.phase||'wrong-return',voidLoop:captureContinuationVoidLoop({chartId:0,feet:8.4,phase:d.phase||'wrong-return'})};
 const oldEye=[fall.x,fall.feet+C.eyeHeight,fall.z],receipt=wrapContinuationVoid(fall);
 return {oldEye,state:{...freshSourceContinuation({runId:'void-native-mesh-proof'}),...fall,status:'active',phase:d.phase||'wrong-return',pitch,fall,lastSpaceWrap:receipt}};
}
const close=(a,b)=>a.forEach((v,k)=>assert.ok(Math.abs(v-b[k])<1e-5,`${a} != ${b}`));
test('the actual receiver and its visible native architecture survive the independent eye seam within the existing instance budget',()=>{
 for(const pitch of[-1.3,-.6,0,.6,1.3]){
  const {state,oldEye}=seam(pitch),before=sourceContinuationRenderFrame(state);
  close(before.eye,oldEye);assert.equal(before.voidLoop.omittedVisible,0);
  assert.ok(before.props.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances);assert.ok(before.voidLoop.copies>100,'the receiver is a full native view, not a six-part miniature');
  const image=before.props.find(p=>p.voidImageKind==='lower'&&p.descriptorId===domain.surfaceId);if(pitch>=0)continue;assert.ok(image);
  const fall={...state.fall,feet:state.fall.feet-.02},after=sourceContinuationRenderFrame({...state,feet:fall.feet,fall});
  const actual=after.props.find(p=>!p.portalDestination&&p.id===image.canonicalId);assert.ok(actual);
  const a=portalTransformPoint(image.matrix,[0,0,0]).map((v,k)=>v-before.eye[k]),
   b=portalTransformPoint(actual.matrix,[0,0,0]).map((v,k)=>v-after.eye[k]);
  close(a.map((v,k)=>v+(k===1?.02:0)),b);
  assert.equal(after.voidLoop.omittedVisible,0);assert.ok(after.props.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances);
 }
});
test('the local reciprocal opening persists on the real floor after landing and preserves native material ownership',()=>{
 const {state}=seam(.8),settled={...state,x:(domain.minX+domain.maxX)/2,z:(domain.minZ+domain.maxZ)/2,feet:domain.elevation,fall:null};
 const a=sourceContinuationRenderFrame(settled),b=sourceContinuationRenderFrame({...settled,elapsed:settled.elapsed+60});
 assert.ok(a.voidLoop.upperViews>0);assert.equal(a.voidLoop.upperViews,b.voidLoop.upperViews);
 const images=a.props.filter(p=>p.voidImageKind==='upper');assert.ok(images.length);
 for(const image of images){
  const original=a.canonicalProps.find(p=>p.id===image.canonicalId);assert.ok(original);
  assert.equal(image.mesh,original.mesh);assert.equal(image.portalClipPlanes.length,5);assert.equal(image.noShadow,true);assert.equal(image.noReflection,true);
 }
 assert.equal(a.recovery,null);assert.equal(a.revealProgress,null);
});
test('every HUSH dimensional image retains the exact canonical captured pose and coupled return clipping',()=>{
 for(const d of [domain,continuationVoidDomain('source-iii-void:catch')]){
 const {state}=seam(-.6,d);state.hush={...state.hush,active:true,x:(d.minX+d.maxX)/2,z:(d.minZ+d.maxZ)/2,feet:d.elevation,chartId:0};
 const f=sourceContinuationRenderFrame(state),images=f.pressureInstances.filter(p=>p.voidImage);
 assert.ok(images.length);assert.ok(f.pressureInstances.length<=4);
 const original=f.pressureInstances.find(p=>!p.voidImage);assert.ok(original);
 const surfaces=pressureSurfaceInstances(f.pressureInstances);
 for(const image of images){
  assert.deepEqual(image.character,original.character);
  const surface=surfaces.find(p=>p.id===image.id+':surface');assert.ok(surface);
  assert.deepEqual(surface.matrix,image.matrix);assert.deepEqual(surface.portalClipPlanes,image.portalClipPlanes);
  assert.deepEqual(surface.portalExcludePlanes,image.portalExcludePlanes);
 }
 }
});
test('Catch exposes its own native receiving world through the same dimensional floor machinery',()=>{
 const d=continuationVoidDomain('source-iii-void:catch'),fall={x:-190,z:-112,feet:d.exitY-C.eyeHeight+.001,chartId:0,
  vx:3,vy:-27,vz:0,elapsed:4,fromPhase:'catch',voidLoop:captureContinuationVoidLoop({phase:'catch'})};
 const oldEye=[fall.x,fall.feet+C.eyeHeight,fall.z],receipt=wrapContinuationVoid(fall),
  state={...freshSourceContinuation({runId:'catch-native-wrap'}),...fall,status:'active',phase:'catch',pitch:-1.1,fall,lastSpaceWrap:receipt},
  before=sourceContinuationRenderFrame(state);
 close(before.eye,oldEye);assert.equal(before.voidLoop.active,true);assert.equal(before.voidLoop.domainId,d.id);
 assert.equal(before.voidLoop.omittedVisible,0);assert.ok(before.props.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances);
 const image=before.props.find(p=>p.voidImageKind==='lower'&&p.descriptorId===d.surfaceId);assert.ok(image,'the actual crescent is visible before the eye crosses');
 const next={...fall,feet:fall.feet-.02},after=sourceContinuationRenderFrame({...state,feet:next.feet,fall:next}),
  original=after.props.find(p=>!p.portalDestination&&p.id===image.canonicalId);assert.ok(original);
 const a=portalTransformPoint(image.matrix,[0,0,0]).map((v,k)=>v-before.eye[k]),b=portalTransformPoint(original.matrix,[0,0,0]).map((v,k)=>v-after.eye[k]);
 close(a.map((v,k)=>v+(k===1?.02:0)),b);
 assert.equal(before.strictOverhead,false,'the current player camera remains authoritative');
 const p=sourceContinuationPresentation(state);assert.equal(sourceContinuationVoidViews(state,p).domain.id,d.id);
});

test('the real entry landing at the captured low look angle has no omitted visible dimensional geometry',()=>{
 const state={...freshSourceContinuation({runId:'actual-landing-reproduction'}),status:'active',x:0,z:-2.699,feet:0,pitch:-1.05};
 const f=sourceContinuationRenderFrame(state);assert.equal(f.voidLoop.omittedVisible,0);assert.equal(f.voidLoop.omittedCells,0);
 assert.ok(f.props.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances);assert.ok(f.voidLoop.upperViews>0);assert.ok(f.voidLoop.cells>0);
});

test('moving listening-place damage cannot be rejected using its retained logical collision bounds',()=>{
 const ordinary={physicalBounds:{min:[-1,-1,9],max:[1,1,11]},matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,-3,1]},
  view={eye:[0,0,0],basis:{right:[1,0,0],up:[0,1,0],forward:[0,0,-1]},aspect:16/9};
 assert.equal(sourceContinuationVoidInFrustum(ordinary,view),false,'unchanged geometry behind the observer may be rejected');
 for(const flag of['restAffliction','restDrift','restDetached','restFracture','restPainRattle','restRebuilt'])
  assert.equal(Boolean(sourceContinuationVoidInFrustum({...ordinary,[flag]:true},view)),true,flag+' requires current visual bounds, not old collision bounds');
});
