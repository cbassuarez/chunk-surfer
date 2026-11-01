import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cinematicLens,cinematicTanHalfFov,cinematicCircleOfConfusion,createCinematicLensPass} from '../src/render/cinematic-lens.js';
import {authoredCameraFrame} from '../src/render/authored-camera.js';
const lens={focalLengthMm:50,sensorHeightMm:24,focusDistanceM:2,apertureFNumber:4,maxBlurPx:12};
test('physical optics focus at axial depth and scale with aperture and output',()=>{
  assert.equal(cinematicCircleOfConfusion(2,lens,800),0);
  assert.ok(cinematicCircleOfConfusion(1,lens,800)<0);
  const far=cinematicCircleOfConfusion(10,lens,800);
  assert.ok(far>0&&far<12);
  assert.equal(cinematicCircleOfConfusion(10,{...lens,apertureFNumber:8},800),far/2);
  assert.equal(cinematicCircleOfConfusion(10,lens,400),far/2);
  // Thin lens: 50mm / f4 focused at2m, object at10m gives0.256410mm diameter.
  assert.ok(Math.abs(far-4.273504273504273)<1e-9);
});
test('invalid owners restore ordinary projection; excessive blur is bounded',()=>{
  assert.equal(cinematicLens(null),null);assert.equal(cinematicLens({...lens,focusDistanceM:NaN}),null);
  assert.equal(cinematicTanHalfFov(null),.95);
  assert.equal(cinematicCircleOfConfusion(.2,{...lens,apertureFNumber:1.2,maxBlurPx:3},800),-3);
  assert.equal(cinematicCircleOfConfusion(10,{...lens,maxBlurPx:0},800),0);
  assert.equal(cinematicTanHalfFov(lens),.24);
});
test('an authored lens is copied without mutating the walking camera or caller',()=>{
  const input={eye:[1,2,3],yaw:.4,pitch:.2,lens},copy=authoredCameraFrame(input);
  assert.deepEqual(copy.lens,lens);assert.notEqual(copy.lens,lens);assert.notEqual(copy.eye,input.eye);
  copy.eye[0]=99;copy.lens.focalLengthMm=90;assert.equal(input.eye[0],1);assert.equal(lens.focalLengthMm,50);
  assert.deepEqual(authoredCameraFrame({eye:[1,2,3],yaw:.4,pitch:.2}),{eye:[1,2,3],yaw:.4,pitch:.2});
});
test('the physical lens basis reaches architecture, mesh, engraving and world projection and resets every frame',()=>{
  const r=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  assert.match(r,/activeCameraTanHalfFov=driveFrameActive \? \.65 : cinematicTanHalfFov\(authoredCamera\?\.lens\)/);
  assert.match(r,/P3\.setFrameCameraTanHalfFov\(activeCameraTanHalfFov\)/);
  assert.match(r,/uv\.x\*rgt\*uCameraTanHalfFov \+ uv\.y\*up\*uCameraTanHalfFov/);
  assert.match(r,/pixelMeshU\('uCameraTanHalfFov'\),activeCameraTanHalfFov/);
  assert.match(r,/const tanHalfFov=activeCameraTanHalfFov/);
  assert.match(r,/cinematicLensPass\.run\(postSourceTex,sceneTex,lens/);
});
test('the pre-print comparison preserves the original floating view depth for acquisition',()=>{
  const r=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const start=r.indexOf('function runPixelMeshPass('),end=r.indexOf('\nfunction loadImageTexture(',start),pass=r.slice(start,end);
  assert.match(pass,/const depthSourceTex = sourceTexture === sceneTex \? pressureSourceTex : sceneTex/);
  assert.match(pass,/gl\.activeTexture\(gl\.TEXTURE2\);\s*gl\.bindTexture\(gl\.TEXTURE_2D, depthSourceTex\);\s*gl\.uniform1i\(pixelMeshU\('uDepth'\), 2\)/);
});
function lensGL({complete=true}={}){
  const images=[],deletedTextures=[],deletedFramebuffers=[];
  const constants=['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','TEXTURE_2D','RGBA8','RGBA16F','RGBA','UNSIGNED_BYTE','FLOAT','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','FRAMEBUFFER','COLOR_ATTACHMENT0','FRAMEBUFFER_COMPLETE','DEPTH_TEST','BLEND','TEXTURE0','TRIANGLES'];
  const gl=Object.fromEntries(constants.map((k,i)=>[k,i+1]));
  for(const k of ['shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texParameteri','bindFramebuffer','framebufferTexture2D','drawBuffers','viewport','disable','bindVertexArray','useProgram','activeTexture','uniform1i','uniform2f','uniform4f','uniform1f','drawArrays','deleteProgram'])gl[k]=()=>{};
  for(const k of ['createShader','createProgram','createTexture','createFramebuffer'])gl[k]=()=>({});
  gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getUniformLocation=()=>({});
  gl.checkFramebufferStatus=()=>complete?gl.FRAMEBUFFER_COMPLETE:-1;
  gl.texImage2D=(...args)=>images.push(args);gl.deleteTexture=t=>deletedTextures.push(t);gl.deleteFramebuffer=f=>deletedFramebuffers.push(f);
  return{gl,images,deletedTextures,deletedFramebuffers};
}
test('changing comparison order reallocates precision at the same viewport size',()=>{
  const {gl,images,deletedTextures,deletedFramebuffers}=lensGL(),pass=createCinematicLensPass(gl),source={},depth={};
  const options={width:640,height:400,outputHeight:800};
  pass.run(source,depth,lens,{...options,stage:'pre-print'});
  assert.equal(images[0][2],gl.RGBA16F);assert.equal(images[0][7],gl.FLOAT);assert.equal(pass.status().targetFormat,'rgba16f');
  pass.run(source,depth,lens,{...options,stage:'pre-print'});assert.equal(images.length,1,'same precision reuses its target');
  pass.run(source,depth,lens,{...options,stage:'post-print'});
  assert.equal(images.length,2);assert.equal(images[1][2],gl.RGBA8);assert.equal(images[1][7],gl.UNSIGNED_BYTE);assert.equal(pass.status().targetFormat,'rgba8');
  assert.equal(deletedTextures.length,1);assert.equal(deletedFramebuffers.length,1);
  pass.run(source,depth,lens,{...options,stage:'pre-print'});assert.equal(images.length,3);assert.equal(images[2][2],gl.RGBA16F);
  pass.inactive();assert.equal(pass.status().active,false);pass.dispose();assert.equal(deletedTextures.length,3);assert.equal(deletedFramebuffers.length,3);
});
test('an unavailable lens target keeps the source and never reports a bypassed effect as active',()=>{
  const {gl}=lensGL({complete:false}),pass=createCinematicLensPass(gl),source={};
  for(let i=0;i<2;i++){
    assert.equal(pass.run(source,{},lens,{width:640,height:400}),source);
    assert.equal(pass.status().active,false);assert.match(pass.status().error,/framebuffer incomplete/);
  }
});
