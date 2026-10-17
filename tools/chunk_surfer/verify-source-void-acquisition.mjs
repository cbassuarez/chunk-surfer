// A real-WebGL2 contract check for the physical Source -> shared recorder handoff.
// Run a local Vite server, then SOURCE_VOID_ACQUISITION_URL=http://127.0.0.1:5330/
// node tools/chunk_surfer/verify-source-void-acquisition.mjs
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const url=process.env.SOURCE_VOID_ACQUISITION_URL||'http://127.0.0.1:5330/';
assert.ok(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Local verification only.');
const output=resolve(process.env.SOURCE_VOID_ACQUISITION_OUT||'artifacts/bus-woman-wrong-origin/source-acquisition-webgl.json');
await mkdir(resolve(output,'..'),{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'source-void-acquisition-'));
let browser;
try{
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,
    args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();
  await page.goto(new URL('/src/render/r3d.js',url).href,{waitUntil:'domcontentloaded'});
  const report=await page.evaluate(async()=>{
    const renderer=await import('/src/render/r3d.js');
    const canvas=document.createElement('canvas');canvas.width=2;canvas.height=1;document.body.append(canvas);
    const gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error('WebGL2 is unavailable');
    const vertex=`#version 300 es
    void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
    const fragment=renderer.r3dSourceVoidPhysicalShader(),program=gl.createProgram(),logs=[];
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      const log=gl.getShaderInfoLog(shader);if(log)logs.push(log);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(log||'compile failed');
      gl.attachShader(program,shader);return shader;};
    const shaders=[compile(gl.VERTEX_SHADER,vertex),compile(gl.FRAGMENT_SHADER,fragment)];
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'link failed');
    gl.useProgram(program);gl.viewport(0,0,2,1);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
    const uniform=(name,method,...values)=>gl[method](gl.getUniformLocation(program,name),...values);
    const texture=(unit,format,internal,type,data)=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texImage2D(gl.TEXTURE_2D,0,internal,2,1,0,format,type,data);
      for(const [parameter,value]of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,parameter,value);
      return t;};
    const linear=[64,32,16],near=.1,far=100,metres=[2,8];
    const rasterDepth=z=>((far+near-2*near*far/z)/(far-near)+1)/2;
    const material=texture(0,gl.RGBA,gl.RGBA8,gl.UNSIGNED_BYTE,new Uint8Array([...linear,255,...linear,255]));
    texture(1,gl.RED,gl.R32F,gl.FLOAT,new Float32Array(metres.map(rasterDepth)));
    texture(2,gl.RGBA,gl.RGBA8,gl.UNSIGNED_BYTE,new Uint8Array(8));
    texture(3,gl.RGBA,gl.RGBA8,gl.UNSIGNED_BYTE,new Uint8Array(8));
    const destination=texture(4,gl.RGBA,gl.RGBA8,gl.UNSIGNED_BYTE,null),fbo=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,destination,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('incomplete verification target');
    for(const [name,value]of [['uProps',0],['uDepth',1],['uOpeningMask',2],['uReflection',3]])uniform(name,'uniform1i',value);
    uniform('uRes','uniform2f',2,1);uniform('uNearFar','uniform2f',near,far);
    uniform('uEyeCells','uniform3f',0,3.2,0);uniform('uEyeGround','uniform3f',0,0,1.6);uniform('uUnravelOrigin','uniform3f',0,0,0);
    uniform('uReflectEye','uniform4f',0,0,1.6,0);uniform('uEntryMetres','uniform1f',-100);
    for(const name of ['uPitch','uVoidDawn','uYaw','uRain','uTime','uReduceMotionOptical','uOpticalEffects','uFlash','uOvercast','uReflectDebug','uOpeningMaskReady'])uniform(name,'uniform1f',0);
    uniform('uTorch','uniform4f',0,.88,.94,1);uniform('uTorchColor','uniform3f',1,1,1);uniform('uBeacon','uniform4f',0,0,0,0);uniform('uPuddle','uniform4f',0,0,0,0);
    for(const name of ['uDoorA[0]','uDoorB[0]','uDoorC[0]'])uniform(name,'uniform4fv',new Float32Array(12));
    const render=(coverage,overlap)=>{
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,material);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,2,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([...linear,coverage,...linear,coverage]));
      uniform('uUnravelling','uniform4f',0,1,0,overlap?1:0);
      gl.clearColor(1,0,1,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);
      const pixels=new Uint8Array(8);gl.readPixels(0,0,2,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return [Array.from(pixels.subarray(0,4)),Array.from(pixels.subarray(4,8))];
    };
    const ordinary=render(255,false),partial=render(89,true),absent=render(0,true);
    const checks=[
      {name:'ordinary opaque input stays in linear RGB',pass:ordinary.every(pixel=>linear.every((v,i)=>Math.abs(pixel[i]-v)<=1)),expected:linear,actual:ordinary.map(pixel=>pixel.slice(0,3))},
      {name:'ordinary alpha carries real packed view depth',pass:ordinary.every((pixel,i)=>Math.abs(pixel[3]/255-1/(1+metres[i]*.14))<1.5/255),expected:metres.map(z=>1/(1+z*.14)),actual:ordinary.map(pixel=>pixel[3]/255)},
      {name:'distinct physical depths survive acquisition',pass:Math.abs(ordinary[0][3]-ordinary[1][3])>50},
      {name:'overlap retains physical coverage alpha',pass:partial.every(pixel=>Math.abs(pixel[3]-89)<=1),expected:89,actual:partial.map(pixel=>pixel[3])},
      {name:'empty overlap remains absent for the splat compositor',pass:absent.every(pixel=>pixel[3]===0),actual:absent.map(pixel=>pixel[3])},
    ];
    const error=gl.getError();gl.deleteFramebuffer(fbo);gl.deleteProgram(program);for(const shader of shaders)gl.deleteShader(shader);
    return {webgl2:true,shaderExport:'r3dSourceVoidPhysicalShader',input:{linearRGB:linear,metres,near,far},ordinary,partialOverlap:partial,absentOverlap:absent,checks,logs,error};
  });
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output,...report},null,2));
  assert.equal(report.error,0,'WebGL emitted an error');
  assert.ok(report.checks.every(check=>check.pass),report.checks.filter(check=>!check.pass).map(check=>check.name).join('; '));
}finally{await browser?.close();await rm(profile,{recursive:true,force:true});}
