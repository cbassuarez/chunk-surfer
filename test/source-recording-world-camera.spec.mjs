import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceContinuationCamera} from '../src/render/source-continuation-renderer.js';
import {cameraBasis} from '../src/render/camera-basis.js';
import {sourceContinuationFrame,normalizeSourceContinuation,freshSourceContinuation} from '../src/game/source-continuation.js';
import {continuationSupportAt,SOURCE_CONTINUATION as C} from '../src/data/source-continuation.js';
import {sourceContinuationRecordingReturnProps,sourceContinuationRecordingReturnFocus,sourceContinuationRecordingDestination,SOURCE_CONTINUATION_RECORDING_RETURNS} from '../src/game/source-continuation-contact.js';
import {sourceRecordingCassetteWorldProps,sourceRecordingCassetteGeometry,SOURCE_RECORDING_CASSETTE as CASE} from '../src/render/source-recording-cassette-model.js';

const dot=(a,b)=>a.reduce((sum,n,k)=>sum+n*b[k],0),transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[12+k]);
const recording=chapter=>({id:'custody-'+chapter,takeId:'take-4',takeKey:'exact-key',takeOrdinal:4,roomId:'main_b3',place:'Studio B3',status:'held',durationSeconds:65,destination:sourceContinuationRecordingDestination(chapter)});
function body(chapter,pose={}){const a=SOURCE_CONTINUATION_RECORDING_RETURNS.find(row=>row.chapter===chapter),state=normalizeSourceContinuation({...freshSourceContinuation({runId:'world-camera'}),...a,...pose,status:'active',yaw:0});state.hush.active=false;state.counterweight.active=false;return state;}
const custody=chapter=>({schema:1,runId:'world-camera',recordings:[recording(chapter)]});
function projection(state,descriptor,{width=1280,height=720}={}){
 const camera=sourceContinuationCamera(sourceContinuationFrame(state),{viewportAspect:width/height}),basis=cameraBasis(camera.yaw,camera.pitch),geometry=sourceRecordingCassetteGeometry(),parts=sourceRecordingCassetteWorldProps(descriptor,{labelReady:false}),points=[];
 for(const part of parts.filter(row=>row.mesh==='source_recording_cassette_shell')){
  const mesh=geometry[part.mesh];for(let k=0;k<mesh.p.length;k+=3){const world=transform(part.matrix,mesh.p.slice(k,k+3)),v=world.map((n,i)=>n-camera.eye[i]),depth=dot(v,basis.forward);assert.ok(depth>0);
   points.push({x:(.5+dot(v,basis.right)/depth/.95/(width/height)*.5)*width,y:(.5-dot(v,basis.up)/depth/.95*.5)*height});}
 }
 const min=[Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y))],max=[Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))];
 return{camera,widthPixels:max[0]-min[0],heightPixels:max[1]-min[1],min,max,viewport:{width,height}};
}

test('Source III retains substantial in-frame cartridge projection from its supported first-person outer walk',()=>{
 const anchor=SOURCE_CONTINUATION_RECORDING_RETURNS.find(row=>row.chapter==='III'),angle=Math.atan2(anchor.z-C.catch.center.z,anchor.x-C.catch.center.x),
  outer={x:C.catch.center.x+Math.cos(angle)*11.5,z:C.catch.center.z+Math.sin(angle)*11.5},state=body('III',outer),
  descriptor=sourceContinuationRecordingReturnProps(state,custody('III')).find(row=>row.sourceRecordingReturn);
 assert.ok(continuationSupportAt(state.x,state.z,state,{minY:state.feet-.06,maxY:state.feet+.06}),'the observing body occupies an existing supported walk');
 // Controlled sightline staging: use ordinary voluntary look from that walk.
 // A north-facing body at the receipt anchor has already passed the side table;
 // neither that view nor the retired overhead camera is the current camera.
 state.yaw=Math.atan2(descriptor.x-state.x,-(descriptor.z-state.z));
 state.pitch=Math.atan2(descriptor.y-(state.feet+C.eyeHeight),Math.hypot(descriptor.x-state.x,descriptor.z-state.z));
 const actual=projection(state,descriptor);
 assert.equal(actual.camera.strictOverhead,false);assert.ok(Math.abs(actual.camera.eye[1]-state.feet-C.eyeHeight)<1e-8);assert.equal(descriptor.worldWidth,1.15);assert.equal(descriptor.pitch,-Math.PI/2);
 assert.ok(actual.widthPixels>30);assert.ok(actual.heightPixels>18);
 assert.ok(actual.min[0]>0&&actual.min[1]>0&&actual.max[0]<1280&&actual.max[1]<720);
 console.log(JSON.stringify({evidence:'source-iii-cassette-supported-first-person-camera-cpu-projection',actual,body:{x:state.x,z:state.z,feet:state.feet},limit:'Controlled voluntary-look staging using actual camera and model vertices; no occlusion, final dither, ordinary noticing, native perception or player acceptance claim.'}));
});

test('the flat display is reachable from the original receipt anchor and outer walk while leaving those lines clear',()=>{
 const anchor=SOURCE_CONTINUATION_RECORDING_RETURNS.find(row=>row.chapter==='III'),angle=Math.atan2(anchor.z-C.catch.center.z,anchor.x-C.catch.center.x),outer={x:C.catch.center.x+Math.cos(angle)*11.5,z:C.catch.center.z+Math.sin(angle)*11.5};
 for(const pose of[{},outer]){const state=body('III',pose),focus=sourceContinuationRecordingReturnFocus(state,{custody:custody('III')});assert.ok(focus);assert.ok(focus.distance<=1.45+1e-6);assert.equal(focus.receiptId,'custody-III');}
 const state=body('III',outer),props=sourceContinuationRecordingReturnProps(state,custody('III')),base=props.find(row=>row.id.startsWith('source-recording-stand:'));
 assert.ok(Math.hypot(base.x-outer.x,base.z-outer.z)>Math.hypot(base.scaleX/2,base.scaleZ/2)+C.bodyRadius,'base is beside the actual outer walk, not through its body line');
 for(const dx of[-1,1])for(const dz of[-1,1])assert.ok(continuationSupportAt(base.x+dx*base.scaleX/2,base.z+dz*base.scaleZ/2,state));
 const cassette=props.find(row=>row.sourceRecordingReturn),cradle=props.find(row=>row.id.startsWith('source-recording-cradle:')),bottom=cassette.y-CASE.depth/2*(cassette.worldWidth/CASE.width),gap=bottom-(cradle.y+cradle.scaleY);
 assert.ok(gap>=0&&gap<.006,'the flat case rests within6mm of its real cradle top');assert.ok(props.every(row=>row.noCollision===true));
});

test('Source II retains substantial upright projection near its real first-person route without occupying its centreline',()=>{
 const state=body('II',{x:16,z:-17}),props=sourceContinuationRecordingReturnProps(state,custody('II')),descriptor=props.find(row=>row.sourceRecordingReturn),actual=projection(state,descriptor);
 assert.equal(actual.camera.strictOverhead,false);assert.equal(descriptor.worldWidth,.4);assert.equal(descriptor.pitch,0);assert.ok(actual.widthPixels>25);assert.ok(actual.heightPixels>14);
 const base=props.find(row=>row.id.startsWith('source-recording-stand:'));assert.ok(base.x-base.scaleX/2>16+C.bodyRadius,'main walk atx16 clears the fixture');
 const cradle=props.find(row=>row.id.startsWith('source-recording-cradle:')),bottom=descriptor.y-CASE.height/2*(descriptor.worldWidth/CASE.width),gap=bottom-(cradle.y+cradle.scaleY);
 assert.ok(gap>=0&&gap<.006,'the upright case rests within6mm of its real cradle top');
 assert.ok(sourceContinuationRecordingReturnFocus(body('II',{x:16,z:-21}),{custody:custody('II')}));
});
