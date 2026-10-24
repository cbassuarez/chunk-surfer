// Shared-renderer drive promotion: prevent the cabin lens/material scope from
// leaking into the rest of Source, and retain the approved acquisition body.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as P3 from '../src/render/props3d.js';
import {r3dFrame,r3dEyePoint,r3dProjectWorld,r3dSetLookAngles} from '../src/render/r3d.js';
import {PIXEL_MESH_FRAG} from '../src/render/pixel-mesh/shader.js';
import {CELL} from '../src/data/floorplan/legend.js';
import {createPropRangeController} from '../src/render/prop-range.js';
const propSource=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const rendererSource=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-6,`${message}: ${a} != ${b}`);
function functionSource(source,name){
 const begin=source.indexOf('function '+name+'(');assert.ok(begin>=0,`${name} exists`);
 let at=source.indexOf('{',begin),depth=1,start=at;
 while(depth){at++;if(source[at]==='{')depth++;else if(source[at]==='}')depth--;}
 return source.slice(begin,at+1);
}

test('drive frame restores the ordinary range and camera after departure',()=>{
 try{
  P3.setDriveStudyFrame(null);r3dFrame({});r3dSetLookAngles({yaw:0,pitch:0});
  const eye=r3dEyePoint(),point={x:eye.x*CELL+2,y:eye.y*CELL+1,z:eye.z*CELL-10};
  const before=r3dProjectWorld(point),baseline=P3.driveStudyRendererStatus();
  close(baseline.tanHalfFov,.95,'ordinary lens');assert.equal(P3.propTargets().far,90);
  P3.setDriveStudyFrame({heading:0});r3dFrame({driveStudy:{active:true}});
  const driving=r3dProjectWorld(point);close(driving.x-.5,(before.x-.5)*.95/.65,'drive horizontal projection');
  close(driving.y-.5,(before.y-.5)*.95/.65,'drive vertical projection');
  assert.equal(P3.propTargets().far,260);assert.equal(P3.driveStudyRendererStatus().active,true);
  // The regular renderer clears a stale host frame itself, even if the session
  // forgot to clear P3 before the next chapter rendered.
  r3dFrame({driveStudy:{active:false}});
  assert.equal(P3.driveStudyRendererStatus().active,false);assert.equal(P3.propTargets().far,90);
  assert.deepEqual(r3dProjectWorld(point),before);
  P3.setDriveStudyFrame({active:false});assert.equal(P3.driveStudyRendererStatus().active,false);
 }finally{P3.setDriveStudyFrame(null);r3dFrame({});r3dSetLookAngles({yaw:0,pitch:0});}
});

test('mirror views retain the real bay, boundary and landform while excluding cabin objects',()=>{
 for(const mesh of['drive_road','drive_plain_paving','drive_retaining_wall','drive_bridge_earthwork','drive_terrain_ridge','drive_terrain_slope','drive_drain_channel','cut_guardrail'])
  assert.equal(P3.driveMirrorIncludesMesh(mesh),true,`${mesh} belongs in the reverse sightline`);
 for(const mesh of['drive_cabin','drive_radio','drive_wheel','drive_recorder_body','drive_left_hand','drive_right_hand'])
  assert.equal(P3.driveMirrorIncludesMesh(mesh),false,`${mesh} must not occlude the external mirror camera`);
 assert.match(propSource,/uDriveWetSurface'\),\(name==='drive_road'\|\|name==='drive_plain_paving'\)\?1:0/,'painted road and unmarked paving share the same actual wet response');
});

test('prop raster projection uses the same selected lens and far depth',()=>{
 const source=functionSource(propSource,'perspective');
 const raster=new Function('driveMirrorAspect','driveStudyFrame','NEAR','FAR','aspect',source+';return perspective(aspect);');
 for(const[frame,mirror,lens,far]of[[null,0,.95,90],[{},0,.65,260],[{},.66,.95,260]]){
  const m=raster(mirror,frame,.05,far,1.6);close(1/m[5],lens,'raster lens');close(1/m[0],lens*1.6,'raster aspect');
  const near=.05,z=14,ndc=(m[10]*-z+m[14])/z;
  const reconstructed=2*near*far/(far+near-ndc*(far-near));assert.ok(Math.abs(reconstructed-z)<.0001,'float32 projection reconstructs14m within0.1mm');
 }
 assert.match(rendererSource,/vec2\(uRes\.x\/uRes\.y,1\.0\)\*\(uDriveSky\.a>\.5\?\.65:\.95\)/,
  'source compositor selects the same physical lens');
 assert.match(rendererSource,/uCameraTanHalfFov'\),state\?\.driveStudy\?\.active===true \? \.65 : \.95/,
  'final camera reconstruction receives the same strict drive activation');
});

test('drive eye follows authored suspension exactly while walking keeps its floor easing',()=>{
 const assignment=rendererSource.match(/^  camY = [^\n]+;/m)?.[0];
 assert.ok(assignment,'the rendered eye assignment exists');
 const evaluateHeight=new Function('authoredCamera','driveFrameActive','snapCamera','camY','floorGoal','dt','state',assignment+';return camY;');
 // Unrelated authored-camera hosts may add their own exact-eye branch. The
 // drive supplies no authoredCamera; exercise its real null fallback here.
 const height=(drive,snap,eye,goal,dt)=>evaluateHeight(null,drive,snap,eye,goal,dt,{});
 // An old elevated Source eye must not ease down through the roof, and the
 // existing suspension/head waveform must not acquire another phase delay.
 let eye=24;
 for(const metres of[1.65,1.69,1.64,1.61,1.66]){
  const goal=metres/CELL;eye=height(true,false,eye,goal,1/60);
  assert.equal(eye,goal,'drive renders the exact physical eye, including its heave');
 }
 const walking=height(false,false,1.65/CELL,2.2/CELL,1/60);
 assert.ok(walking>1.65/CELL&&walking<2.2/CELL,'ordinary walking retains its eased rise');
 assert.equal(height(false,true,1.65/CELL,2.2/CELL,1/60),2.2/CELL,'an explicit ordinary snap remains authoritative');
});

test('approved acquisition and final dither body are unchanged outside camera rays',()=>{
 // Snapshot taken from the actual dirty production shader immediately before
 // promotion. Excluding only cameraRay and its new uniform, every acquisition,
 // ink, edge, material and dither byte must remain identical in this change.
 // Re-pinned 2026-10-24 for the Transit Mk3 cab: marks inside the van are keyed
 // to the van's metres and the cab takes the hatch screen (approved by Seb).
 const body=PIXEL_MESH_FRAG
  .replace('// Zero retains the ordinary lens for transparent instrument hosts.\nuniform float uCameraTanHalfFov;\n','')
  .replace(/vec3 cameraRay\(vec2 frag\)\{[\s\S]*?\n\}/,'CAMERA_RAY');
 assert.equal(createHash('sha256').update(body).digest('hex'),'3c26a7e640a18e3a1af8bdc78e32f7abf25d9de5dd9a659dcd5be46a2b14fd6b');
 assert.match(PIXEL_MESH_FRAG,/uCameraTanHalfFov>0\.0\?uCameraTanHalfFov:0\.95/,
  'transparent instrument hosts without this uniform retain their ordinary lens');
});

test('both static and living material paths retain scoped biological finish flags',()=>{
 for(const definition of['matDef','definition']){
  assert.ok(propSource.includes(`studyLocalFinish:${definition}.extras?.studyLocalFinish===true,cutTissue:${definition}.extras?.cutTissue===true`));
 }
 assert.ok(propSource.includes("gl.uniform1f(U('uDriveTissue'),driveStudyFrame&&p.cutTissue?1:0)"));
 assert.ok(propSource.includes('p.letteringFinish?.localSpecular||(driveStudyFrame&&p.studyLocalFinish)'));
 assert.match(propSource,/uPayphoneCast<\.5&&uDriveTissue<\.5/,
  'authored tissue can retain its maroon while ordinary emergency-red handling remains');
});

test('weather resolves against the actual pane and opaque depth before acquisition',()=>{
 assert.match(rendererSource,/surfaceT>paneT\+\.012/);
 assert.match(rendererSource,/shiftedDepth>paneT\*viewDot\+\.015/);
 assert.match(rendererSource,/eye\+wd\*\(outside\+\.025\)/);
 assert.match(rendererSource,/uDriveVolumeShadowReady/);
 assert.match(rendererSource,/weather\?\.active&&wt\?1:0/);
 assert.match(propSource,/driveWetOwner!==wet\.owner\|\|driveWetRevision!==wet\.revision/,
  'restoring a different weather owner uploads its actual map despite a reused revision');
});

test('renderer reinitialisation disposes context-owned mirror, wetness and canvas resources',()=>{
 const calls=[],gl={deleteTexture:x=>calls.push(['texture',x]),deleteRenderbuffer:x=>calls.push(['depth',x]),deleteFramebuffer:x=>calls.push(['fbo',x])};
 const run=new Function('gl','authoredPropRange',`
 let driveStudyFrame={},FAR=260,driveMirrorAt=1,driveMirrorAspect=.7,driveRendererError='old';
 let driveWetTexture='wet',driveWetUploadUnit=5,driveWetRevision=9,driveWetOwner='owner',driveWetSize='48x32';
 const driveTextures=new Map([['canvas','canvas'],['mirror','mirror']]);
 const driveCanvasSizes=new Map([['canvas','666x239']]);
 const driveMirrorTargets=new Map([['mirror',{depth:'depth',framebuffer:'fbo'}]]);
 ${functionSource(propSource,'disposeDriveStudyResources')}
 disposeDriveStudyResources();return{driveStudyFrame,FAR,driveMirrorAt,driveWetTexture,driveWetOwner,driveWetSize,
 textures:driveTextures.size,canvases:driveCanvasSizes.size,mirrors:driveMirrorTargets.size};`);
 const result=run(gl,createPropRangeController());assert.deepEqual(calls,[['texture','canvas'],['texture','mirror'],['texture','wet'],['depth','depth'],['fbo','fbo']]);
 assert.deepEqual(result,{driveStudyFrame:null,FAR:90,driveMirrorAt:-1,driveWetTexture:null,driveWetOwner:null,driveWetSize:'',textures:0,canvases:0,mirrors:0});
 assert.match(propSource,/export function props3dInit\(context\)\{\s+disposeDriveStudyResources\(\)/);
});
