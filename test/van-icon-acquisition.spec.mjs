import test from 'node:test';
import assert from 'node:assert/strict';
import * as Three from 'three';
import {PIXEL_MESH_FRAG} from '../src/render/pixel-mesh/shader.js';
import {getLookProfile} from '../src/render/look-profiles.js';
import {worldLightTreatmentFrame,fineMarkFootprint} from '../src/render/world-light-treatment.js';
import {createVanIconAcquisition,vanIconAcquisitionLayout,vanIconAcquisitionProfile,VAN_ICON_ACQUISITION_VARIANTS,VAN_ICON_ACQUISITION_PROFILE,VAN_ICON_ACQUISITION_PROVENANCE} from '../tools/app-icon/acquisition.mjs';

function fixture(){
 const textures=[],urls=[],calls=[];
 const THREE={...Three,TextureLoader:class{loadAsync(url){urls.push(url);const texture=new Three.Texture();textures.push(texture);return Promise.resolve(texture);}}};
 let target=null,alpha=.37,scissor=true;const colour=new Three.Color('#123456'),viewport=new Three.Vector4(2,5,128,128);
 const renderer={toneMappingExposure:1.28,autoClear:true,getRenderTarget:()=>target,setRenderTarget:value=>{target=value;},getScissorTest:()=>scissor,setScissorTest:value=>{scissor=value;},getClearAlpha:()=>alpha,
  getClearColor:out=>out.copy(colour),setClearColor:(value,a)=>{colour.set(value);alpha=a;},getViewport:out=>out.copy(viewport),setViewport:(...v)=>v[0]?.isVector4?viewport.copy(v[0]):viewport.set(...v),clear(){},
  render(scene,camera){calls.push({scene,camera,target,material:scene.children[0]?.material,width:target?.width,height:target?.height});}};
 const pass=createVanIconAcquisition(THREE,renderer),scene=new Three.Scene(),paint=new Three.MeshBasicMaterial({color:'#c8102e'});paint.name='owner paint / red';
 const body=new Three.Mesh(new Three.BoxGeometry(),paint);scene.add(body);const rain=new Three.Mesh(new Three.BufferGeometry(),new Three.MeshBasicMaterial());rain.name='icon-rain';scene.add(rain);
 const camera=new Three.OrthographicCamera(-4,4,4,-4,.1,80);camera.position.set(4.4,3,10);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 return{pass,scene,camera,renderer,calls,urls,textures,colour,viewport};
}

test('van icon submits the full game fragment as its declared hero VFD/acquisition mixture without an external image overlay',async()=>{
 const f=fixture();assert.equal(f.pass.render(f.scene,f.camera,{width:256,height:256}),false,'do not export placeholder noise while preparation is pending');await f.pass.ready;
 assert.match(f.urls[0],/\/assets\/blue-noise-64\.png$/);assert.doesNotMatch(f.urls[0],/tools\/app-icon\/assets/);
 f.pass.render(f.scene,f.camera,{width:256,height:256,time:1.17});
 assert.deepEqual(f.calls.map(c=>[c.width??null,c.height??null]),[[256,256],[256,256],[null,null]]);
 const material=f.calls[2].material,u=material.uniforms;
 assert.equal(material.fragmentShader,PIXEL_MESH_FRAG.replace(/^#version 300 es\s*/,''));
 assert.deepEqual(material.defines,{SOURCE_DESKTOP_TRANSPARENT:1});assert.equal(material.blending,Three.NoBlending);
 assert.equal(u.uRecordingCaptureMix.value,VAN_ICON_ACQUISITION_PROFILE.recording.captureMix);assert.equal(u.uSourcePressureFinish.value,0);assert.equal(u.uDebugSource.value,0);assert.equal(u.uClusteredDotMix.value,0);
 assert.equal(u.uScreenKind.value,2);assert.equal(u.uCellPx.value,1);assert.equal(u.uScreenPeriodPx.value,6.5);
 assert.equal(u.uTime.value,1.17);assert.equal(f.pass.debug().provenance,VAN_ICON_ACQUISITION_PROVENANCE);assert.equal(f.pass.debug().profile,VAN_ICON_ACQUISITION_PROFILE.id);
 assert.equal(VAN_ICON_ACQUISITION_PROVENANCE.shaderCharacters,PIXEL_MESH_FRAG.length);assert.match(VAN_ICON_ACQUISITION_PROVENANCE.shaderFingerprint,/^fnv1a32:[0-9a-f]{8}$/);
 assert.equal(getLookProfile('calm').vfd.cellPx,2,'the game profile is untouched');assert(Object.isFrozen(VAN_ICON_ACQUISITION_PROFILE.recording));
 f.pass.dispose();
});

test('native icon exports screen at their actual output size and preserve measured camera, coverage and caller state',async()=>{
 const f=fixture();await f.pass.ready;const projection=f.camera.projectionMatrixInverse.clone(),cameraWorld=f.camera.matrixWorld.clone();
 for(const size of[16,24,32,48,64,128,256,512,1024]){
  f.pass.render(f.scene,f.camera,{width:size,height:size,time:3.4,reducedMotion:true,reduceFlash:true});const u=f.calls.at(-1).material.uniforms;
  assert.deepEqual(u.uRes.value.toArray(),[size,size]);assert.equal(u.uCellPx.value,1);assert.equal(u.uScreenPeriodPx.value,size<64?4.25:6.5);
  assert.equal(f.calls.at(-3).target.width,size);assert.equal(f.calls.at(-3).target.height,size);
  assert.deepEqual(u.uSourceProjectionInverse.value.elements,projection.elements);assert.deepEqual(u.uSourceCameraWorld.value.elements,cameraWorld.elements);
  assert.equal(u.uReduceMotion.value,1);assert.equal(u.uReduceFlash.value,1);
  assert.equal(u.uRecordingCaptureMix.value,vanIconAcquisitionProfile(size,size).recording.captureMix);
  assert.equal(u.uToneAmount.value,vanIconAcquisitionProfile(size,size).vfd.toneAmount);assert.equal(f.pass.debug().coveragePreserved,true);
 }
 assert.deepEqual(f.viewport.toArray(),[2,5,128,128]);assert.equal(f.colour.getHex(),new Three.Color('#123456').getHex());assert.equal(f.renderer.getClearAlpha(),.37);assert.equal(f.renderer.getScissorTest(),true);assert.equal(f.renderer.autoClear,true);
 const d=f.pass.debug();assert.equal(d.participation.paintMeshes,1);assert.equal(d.participation.weatherMeshes,1);assert.equal(d.participation.materialCount,2);assert.equal(d.depthReconstruction,'inverse-projection');assert.equal(d.temporalMemory,false);
 let released=0;for(const target of[f.calls[0].target,f.calls[1].target])target.addEventListener('dispose',()=>released++);
 f.pass.dispose();f.pass.dispose();assert.equal(released,2);assert.equal(f.pass.render(f.scene,f.camera),false);
});

test('invalid export sizes remain bounded and reduced-motion/flash flags reset rather than sticking between frames',async()=>{
 assert.deepEqual([vanIconAcquisitionLayout(NaN).width,vanIconAcquisitionLayout(Infinity).height],[256,256]);assert.equal(vanIconAcquisitionLayout(99999).width,4096);
 const f=fixture();await f.pass.ready;
 f.pass.render(f.scene,f.camera,{width:32,height:32,reducedMotion:true,reduceFlash:true});
 f.pass.render(f.scene,f.camera,{width:256,height:256,time:NaN});const u=f.calls.at(-1).material.uniforms;
 assert.equal(u.uReduceMotion.value,0);assert.equal(u.uReduceFlash.value,0);assert.equal(u.uTime.value,0);assert.equal(u.uScreenPeriodPx.value,6.5);assert.equal(u.uCellPx.value,1);
 f.pass.dispose();
});


test('the existing continuous world-mark uniforms reach only the shared post material without changing the caller renderer',async()=>{
 const f=fixture();await f.pass.ready;const draw=f.renderer.render,exposure=f.renderer.toneMappingExposure;
 const callerRender=function(...args){assert.equal(this,f.renderer);return draw.apply(this,args);};f.renderer.render=callerRender;
 const sourceMaterial=f.scene.children[0].material;
 f.pass.render(f.scene,f.camera,{width:128,height:128,time:2.3});
 const acquisition=f.calls.at(-2).material,post=f.calls.at(-1).material,u=post.uniforms;
 assert.equal(u.uWorldLightTreatment.value,worldLightTreatmentFrame('marks-only').level);
 assert.equal(u.uFineMarkPx.value,fineMarkFootprint(u.uCellPx.value));
 assert.equal(acquisition.uniforms.uWorldLightTreatment,undefined,'ordinary scene acquisition is not mistaken for the full post material');
 assert.equal(sourceMaterial.uniforms,undefined,'physical van materials are untouched');
 assert.equal(f.renderer.render,callerRender);assert.equal(f.renderer.toneMappingExposure,exposure);
 const report=f.pass.debug();assert.equal(report.marks.uploads,1);assert.equal(report.branches.continuousRuntimeScreenPhase,true);assert.equal(report.branches.pixelSizedFineRank,true);
 assert.equal(report.sourceTone.exposure,exposure);assert.equal(report.sourceTone.recordingInput,'real broad source luma');
 f.pass.render(f.scene,f.camera,{width:256,height:256,time:2.42});assert.equal(f.pass.debug().marks.uploads,2);
 assert.equal(post.fragmentShader,PIXEL_MESH_FRAG.replace(/^#version 300 es\s*/,''),'uniform completion cannot fork the shader');
 f.pass.dispose();
});

test('the revised hero policy retains display headroom and opens real shadow detail without changing zero-light protection',()=>{
 const hero=VAN_ICON_ACQUISITION_PROFILE,world=getLookProfile('calm');
 assert(hero.vfd.whitePoint>.85&&hero.vfd.whitePoint<=1,'bright icon light uses the display range rather than the dim-room VFD window');
 assert(hero.recording.densityGamma>.75&&hero.recording.densityGamma<=1,'the curve gently opens shadow detail; exposure/lighting still set the actual tonal volume');
 assert.equal(hero.recording.blackFloor,world.recording.blackFloor,'no new ambient floor invents light on black tyres');
 assert(hero.recording.captureMix>0&&hero.recording.captureMix<1,'the shared form branch genuinely contributes');assert.equal(hero.vfd.cellPx,1);assert.equal(hero.recording.scenePinning,1);
 assert.match(VAN_ICON_ACQUISITION_PROVENANCE.tonePolicy,/recording capture uses real broad source luma/);
 assert.match(VAN_ICON_ACQUISITION_PROVENANCE.tonePolicy,/whitePoint shapes the supporting form\/colour branch/);
 assert.equal(getLookProfile('calm'),world);assert.notEqual(hero,world);
});


test('study variants select only bounded shared-shader mixtures and compact output receives its declared legibility policy',async()=>{
 const f=fixture();await f.pass.ready;let renders=0;
 for(const [size,variant]of [[128,'detail'],[256,'ink'],[48,'ink'],[16,'detail'],[256,'unknown'],[128,'__proto__']]){
  const selected=Object.hasOwn(VAN_ICON_ACQUISITION_VARIANTS,variant)?variant:'detail',p=vanIconAcquisitionProfile(size,size,selected);
  assert.equal(f.pass.render(f.scene,f.camera,{width:size,height:size,variant}),true);renders++;
  const u=f.calls.at(-1).material.uniforms,d=f.pass.debug();
  assert.equal(u.uRecordingCaptureMix.value,p.recording.captureMix);assert.equal(u.uToneAmount.value,p.vfd.toneAmount);
  assert.equal(d.variant,selected);assert.equal(d.profile,p.id);assert.equal(d.profilePolicy,p);
  assert.equal(d.sourceTone.recordingMix,p.recording.captureMix);assert.equal(d.sourceTone.supportingVfdToneAmount,p.vfd.toneAmount);
  assert.equal(d.provenance.externalRawOverlay,false);assert.equal(d.provenance.pureOneBit,false);assert.match(d.provenance.recordingMode,/hero mix of game VFD\/acquisition/);
  assert.equal(f.calls.length,renders*3,'the existing three passes remain the entire composition; there is no raw RGB overlay draw');
 }
 assert(VAN_ICON_ACQUISITION_VARIANTS.detail.recordingMix<VAN_ICON_ACQUISITION_VARIANTS.ink.recordingMix);
 assert(VAN_ICON_ACQUISITION_VARIANTS.detail.toneAmount<VAN_ICON_ACQUISITION_VARIANTS.ink.toneAmount);
 for(const variant of Object.keys(VAN_ICON_ACQUISITION_VARIANTS)){
  const compact=vanIconAcquisitionProfile(48,48,variant),hero=vanIconAcquisitionProfile(128,128,variant);
  assert(compact.recording.captureMix<hero.recording.captureMix,'compact output reserves more of the game form/colour branch');
  assert(compact.vfd.toneAmount<=hero.vfd.toneAmount);assert.equal(compact.recording.captureMix,VAN_ICON_ACQUISITION_PROVENANCE.compactPolicy.recordingMix);
 }
 assert.equal(getLookProfile('calm').recording.captureMix,1,'the global game look is untouched');f.pass.dispose();
});
