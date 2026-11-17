import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createMenuFeedbackClock,createMenuFeedbackPass,MENU_FEEDBACK_SETTINGS,MENU_FEEDBACK_PRESENT_GLSL} from '../src/render/menu-feedback-pass.js';
import {MENU_SIGNAL_FINISH_GLSL,MENU_SIGNAL_COMPOSITE_GLSL} from '../src/render/menu-signal-treatments.js';
import {FrontEndSession} from '../src/game/front-end-session.js';
import {normalizeFrontEndPlate,interpolateFrontEndPlate} from '../src/render/front-end-plate.js';

test('the selected settings are exact and the same finishing code is used by preview and production',()=>{
  assert.deepEqual(MENU_FEEDBACK_SETTINGS,{id:'feedback',name:'Feedback well',mode:3,damage:.96,registration:22,feedback:.95,exposure:.2,vignette:.4,colorA:'#679ead',colorB:'#ed784a'});
  assert.ok(MENU_SIGNAL_COMPOSITE_GLSL.includes(MENU_SIGNAL_FINISH_GLSL));
  assert.ok(MENU_FEEDBACK_PRESENT_GLSL.includes(MENU_SIGNAL_FINISH_GLSL));
  assert.doesNotMatch(MENU_FEEDBACK_PRESENT_GLSL,/foregroundImage|canvas|ui\.rgb/);
});

test('recursive integration is the same at 30, 60 and 120 presented frames per second',()=>{
  const receipts=[];
  for(const fps of [30,60,120]){
    const clock=createMenuFeedbackClock(),times=[];
    for(let i=0;i<=fps*5;i++)times.push(...clock.advance(i/fps).times);
    assert.equal(times.length,150);receipts.push(times);
  }
  assert.deepEqual(receipts[0],receipts[1]);assert.deepEqual(receipts[1],receipts[2]);
});

test('pause, reduced motion and an absent presentation cannot accumulate catch-up history',()=>{
  const clock=createMenuFeedbackClock();clock.advance(0);
  assert.equal(clock.advance(.1).ticks,3);
  assert.equal(clock.advance(.2,{paused:true}).ticks,3);
  assert.equal(clock.advance(60,{paused:true}).ticks,3);
  assert.equal(clock.advance(60.1).ticks,3,'resume has no deferred tick');
  assert.equal(clock.advance(60.2).ticks,6);
  assert.equal(clock.advance(60.3,{reducedMotion:true}).ticks,6);
  assert.equal(clock.advance(61.3,{reducedMotion:true}).ticks,6);
  assert.equal(clock.advance(61.4).ticks,6);
  assert.equal(clock.advance(75).ticks,6,'unannounced absence also has no debt');
  assert.equal(clock.advance(75.1).ticks,9);
  clock.reset();assert.equal(clock.advance(80).time,3.2);
});

test('feedback belongs only to a prepared menu camera and crossfades out through the existing lift',()=>{
  const session=new FrontEndSession();session.enterTitle();assert.equal(session.snapshot().plate.signal,0);
  session.markCameraReady();session.enterTitle();assert.equal(session.snapshot().plate.signal,1);
  session.beginLift();let previous=1;
  for(let i=0;i<100;i++){
    const plate=session.update(1/120).plate;assert.ok(plate.signal<=previous);previous=plate.signal;
    assert.equal(plate.negative,0);assert.equal(plate.exposureStops,0,'source is never double graded');
  }
  assert.equal(previous,0);assert.equal(normalizeFrontEndPlate('credits').signal,0);
  assert.equal(interpolateFrontEndPlate('title','gameplay',.5).signal,.5);
});

test('a session plate invalidates the cached preset so returning to the positive reference really disables feedback',()=>{
  const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const setter=source.slice(source.indexOf('export function r3dSetFrontEndPlate('),source.indexOf('export function r3dFrontEndPlate(')).replace(/^export /,'');
  const context=vm.createContext({normalizeFrontEndPlate,frontEndPlate:normalizeFrontEndPlate('gameplay'),frontEndPlatePresetId:null});
  vm.runInContext(setter,context);
  context.r3dSetFrontEndPlate('gameplay');
  assert.equal(context.r3dSetFrontEndPlate(normalizeFrontEndPlate('title')).signal,1,'signal-only session change takes effect');
  assert.equal(context.r3dSetFrontEndPlate('gameplay').signal,0,'previous preset name must not retain the session plate');
  assert.equal(context.r3dSetFrontEndPlate('title').signal,1);
  context.r3dSetFrontEndPlate(normalizeFrontEndPlate('gameplay'));
  assert.equal(context.r3dSetFrontEndPlate('title').signal,1,'restoring a preset also works after an object override');
});

function fakeGL({complete=true,compile=true}={}){
  const keys=['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','TEXTURE_2D','RGBA8','RGBA','UNSIGNED_BYTE','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','FRAMEBUFFER','COLOR_ATTACHMENT0','FRAMEBUFFER_COMPLETE','DEPTH_TEST','BLEND','TRIANGLES','COLOR_BUFFER_BIT','BACK'];
  const gl=Object.fromEntries(keys.map((key,i)=>[key,i+1]));gl.TEXTURE0=100;
  const allocations=[],deleted=[],draws=[],uniforms=[];let framebuffer=null,program=null,unit=0;
  const textures=new Map(),attachments=new Map();
  for(const key of ['createProgram','createShader','createTexture','createFramebuffer'])gl[key]=()=>{const v={kind:key,id:allocations.length};allocations.push(v);return v;};
  for(const key of ['shaderSource','compileShader','attachShader','linkProgram','texImage2D','texParameteri','drawBuffers','viewport','disable','bindVertexArray','clearColor','clear'])gl[key]=()=>{};
  gl.deleteShader=()=>{};for(const key of ['deleteTexture','deleteFramebuffer','deleteProgram'])gl[key]=v=>deleted.push(v);
  gl.getShaderParameter=()=>compile;gl.getShaderInfoLog=()=> 'deliberate shader failure';gl.getProgramParameter=()=>true;
  gl.getUniformLocation=(_,key)=>key;gl.checkFramebufferStatus=()=>complete?gl.FRAMEBUFFER_COMPLETE:-1;
  gl.activeTexture=value=>{unit=value-gl.TEXTURE0;};gl.bindTexture=(_,t)=>textures.set(unit,t);
  gl.bindFramebuffer=(_,f)=>{framebuffer=f;};gl.framebufferTexture2D=(_,a,b,t)=>attachments.set(framebuffer,t);
  gl.useProgram=p=>{program=p;};
  for(const key of ['uniform1i','uniform1f','uniform2f','uniform3fv'])gl[key]=(name,...values)=>uniforms.push({program,name,values});
  gl.drawArrays=()=>{
    const target=attachments.get(framebuffer);
    if(target)assert.notEqual(target,textures.get(1),'history must never sample its own draw attachment');
    draws.push({framebuffer,program,source:textures.get(0),history:textures.get(1)});
  };
  return{gl,allocations,deleted,draws,uniforms};
}

test('world-only history ping-pongs, reuses storage, freezes, resizes and releases completely',()=>{
  const h=fakeGL(),pass=createMenuFeedbackPass(h.gl);assert.equal(h.allocations.length,0,'inactive gameplay is allocation free');
  const input=pass.prepare(640,400);pass.present({now:0});
  assert.equal(pass.status().historySteps,42);assert.equal(h.draws.length,43);
  assert.ok(h.draws.slice(0,42).every(d=>d.source===input.texture));assert.equal(h.draws.at(-1).framebuffer,null);
  assert.equal(pass.status().bufferBytes,640*400*4*3);
  pass.prepare(640,400);pass.present({now:.1});assert.equal(pass.status().historySteps,45);
  pass.present({now:.2,reducedMotion:true});assert.equal(pass.status().historySteps,45);
  pass.present({now:5,reducedMotion:true});assert.equal(pass.status().historySteps,45);
  assert.equal(h.allocations.filter(v=>v.kind==='createTexture').length,3,'no per-frame texture allocation');
  pass.prepare(800,600);pass.present({now:5.1,reducedMotion:true});assert.equal(pass.status().historySteps,87);
  assert.equal(h.deleted.filter(v=>v.kind==='createTexture').length,3);
  assert.ok(h.uniforms.some(u=>u.name==='sourceIsFramebuffer'&&u.values[0]===1),'GL input orientation is explicit');
  pass.reset();pass.present({now:6});assert.equal(pass.status().ticks,0);
  pass.inactive();assert.equal(pass.status().active,false);assert.equal(pass.status().bufferBytes,0);
  assert.equal(h.deleted.filter(v=>v.kind==='createTexture').length,6);
  const programs=h.allocations.filter(v=>v.kind==='createProgram').length;pass.dispose();assert.equal(h.deleted.filter(v=>v.kind==='createProgram').length,programs);
});

test('a failed GPU target releases partial allocations and leaves ordinary world presentation available',()=>{
  const h=fakeGL({complete:false}),pass=createMenuFeedbackPass(h.gl),warn=console.warn;console.warn=()=>{};
  try{assert.equal(pass.prepare(640,400),null);assert.match(pass.status().error,/framebuffer incomplete/);assert.equal(pass.status().bufferBytes,0);assert.equal(pass.prepare(640,400),null);}
  finally{console.warn=warn;pass.dispose();}
  assert.equal(h.allocations.filter(v=>v.kind==='createTexture').length,h.deleted.filter(v=>v.kind==='createTexture').length);
});

test('renderer integration is after world POST, before its receipt, outside offscreen captures',()=>{
  const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const pass=source.slice(source.indexOf('function presentThroughPost('),source.indexOf('export function r3dCanvas()'));
  assert.ok(pass.indexOf('gl.drawArrays(gl.TRIANGLES, 0, 3)')<pass.indexOf('menuFeedbackPass.present('));
  assert.ok(pass.indexOf('menuFeedbackPass.present(')<pass.indexOf('presentationReceiptListener(performance.now())'));
  assert.match(pass,/!presentTarget&&frontEndPlate.signal/);assert.doesNotMatch(pass,/foreground|uiDraw|uiCanvas/);
  assert.match(source,/next.signal===frontEndPlate.signal/,'the plate setter cannot discard a signal-only change');
});
