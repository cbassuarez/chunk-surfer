// Optional real-WebGL regression for the HUSH material. Two overlapping
// silhouettes move across one unchanged field; both the raw pigment and the
// production recording-ink function must agree at each common screen pixel.
// HUSH_SCREEN_CHROME may point to a local Chrome/Chromium binary.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {HUSH_COSMOS_INK_GLSL,hushCosmosField} from '../../src/render/hush-cosmos.js';

const executablePath=process.env.HUSH_SCREEN_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await puppeteer.launch({executablePath,headless:true,pipe:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage();
  const result=await page.evaluate(field=>{
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=200;
    const gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw Error('WebGL2 unavailable');
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const v=shader(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}');
    const f=shader(gl.FRAGMENT_SHADER,`#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uShift; uniform float uPass;
${field}
out vec4 color;
void main(){
 vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y;
 if(length(vec2((p.x-uShift)*1.3,p.y))>.31){color=vec4(0.0);return;}
 vec3 raw=hushCosmosField(gl_FragCoord.xy,uRes).rgb;
 // Emulate the recorder's already-made binary mark, then run the production
 // ink operation. A second invocation must not create or lose a mark.
 vec3 acquired=vec3(step(.12,max(raw.r,max(raw.g,raw.b))));
 vec3 ink=hushCosmosRecordedInk(acquired,0.0);
 if(uPass>1.5)ink=hushCosmosRecordedInk(ink,0.0);
 color=vec4(uPass<.5?raw:ink,1.0);
}`);
    const program=gl.createProgram();gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);gl.uniform2f(gl.getUniformLocation(program,'uRes'),canvas.width,canvas.height);
    const draw=(shift,pass)=>{gl.uniform1f(gl.getUniformLocation(program,'uShift'),shift);gl.uniform1f(gl.getUniformLocation(program,'uPass'),pass);gl.drawArrays(gl.TRIANGLES,0,3);const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
    const a=draw(-.08,0),b=draw(.08,0),inkA=draw(-.08,1),inkB=draw(.08,1),post=draw(-.08,2);
    let common=0,differentRaw=0,differentInk=0,differentPost=0,light=0,dark=0;const representative={};
    for(let i=0;i<a.length;i+=4){
      if(!a[i+3]||!b[i+3])continue;common++;
      if(a.slice(i,i+3).some((x,k)=>x!==b[i+k]))differentRaw++;
      if(inkA.slice(i,i+3).some((x,k)=>x!==inkB[i+k]))differentInk++;
      if(inkA.slice(i,i+3).some((x,k)=>x!==post[i+k]))differentPost++;
      if(Math.max(a[i],a[i+1],a[i+2])>80)light++;else dark++;
      const max=Math.max(a[i],a[i+1],a[i+2]),min=Math.min(a[i],a[i+1],a[i+2]);
      const kind=max<20?'dark':max>80&&max-min>50?'chromatic':max>80&&max-min<20?'silver':null;
      if(kind&&!representative[kind]){const index=i/4;representative[kind]={pixel:[index%canvas.width+.5,Math.floor(index/canvas.width)+.5],rgb:[a[i],a[i+1],a[i+2]]};}
    }
    return {common,differentRaw,differentInk,differentPost,light,dark,representative,glError:gl.getError()};
  },HUSH_COSMOS_INK_GLSL);
  assert.ok(result.common>1000,'both silhouette positions must overlap');
  assert.ok(result.light>20&&result.dark>100,'the overlap exercises both markings and the dark field');
  assert.equal(result.differentRaw,0,'screen pigment must not move with the silhouette');
  assert.equal(result.differentInk,0,'recorded pigment must not move with the silhouette');
  assert.equal(result.differentPost,0,'a later POST ink pass cannot repaint marks');
  assert.equal(result.glError,0);
  assert.deepEqual(Object.keys(result.representative).sort(),['chromatic','dark','silver']);
  for(const sample of Object.values(result.representative)){
    const cpu=hushCosmosField(sample.pixel,[320,200]).color;
    cpu.forEach((v,i)=>assert.ok(Math.abs(Math.round(v*255)-sample.rgb[i])<=1,`CPU/GL field mismatch at ${sample.pixel}`));
  }
  console.log(JSON.stringify({passed:true,...result}));
}finally{await browser.close();}
