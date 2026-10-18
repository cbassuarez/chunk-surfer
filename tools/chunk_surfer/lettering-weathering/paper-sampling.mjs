// Focused native paper regression. The control is the exact P3 source captured
// before adding its paper-only area resolver; all other live inputs are shared.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import {PRINTED_SURFACE_GLSL} from '../../../src/render/printed-surface.js';
import {PIXEL_MESH_FRAG} from '../../../src/render/pixel-mesh/shader.js';
const out='artifacts/lettering-weathering/paper-area';fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourcePaths=['tools/chunk_surfer/lettering-weathering/paper-sampling.mjs','src/render/props3d.js','src/data/paper-pigment.js','src/render/r3d.js','src/render/pixel-mesh/shader.js','src/render/printed-surface.js','artifacts/lettering-weathering/native.js','artifacts/lettering-weathering/native.html','assets/paper/world-pigment.png','assets/paper/world-material.png','artifacts/lettering-weathering/paper-area-controls/props3d.js','artifacts/lettering-weathering/paper-area-controls/pixel-mesh-shader.js','artifacts/lettering-weathering/paper-area-controls/printed-surface.js','artifacts/lettering-weathering/paper-area-controls/paper-pigment.js','public/assets/conservatory-props.glb','public/assets/conservatory-props.lettering.json','src/data/generated/prop-geometry.js'];
const hashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,sha(fs.readFileSync(p))]));
const report={version:1,kind:'world-paper-native-area-coverage',date:new Date().toISOString(),sourceHashes:hashes(),proofRandom:{algorithm:'LCG32: state=1664525*state+1013904223 mod 2^32; value=state/2^32',seed:305419896,scope:'Isolated proof startup only; production randomness unchanged'},arms:[],errors:[],scope:'Same canonical paper RGB/coverage/geometry/material; explicit area contract in P3 and the actual final compositor. Exact archived solid-paper compositor control, plus matched placard and gilt controls. Inspection fixture, not route proof or body-copy reading accuracy.'};
const save=()=>fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const profile=fs.mkdtempSync('/private/tmp/chunk-lettering-paper-');let browser=null;
try{
 browser=await puppeteer.launch({userDataDir:profile,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--no-sandbox','--disable-background-networking'],protocolTimeout:180000});
 const witness=await browser.newPage();
 const glslFunction=name=>{const start=PIXEL_MESH_FRAG.indexOf('float '+name+'(');assert.ok(start>=0);let at=PIXEL_MESH_FRAG.indexOf('{',start),depth=1;while(depth){at++;if(PIXEL_MESH_FRAG[at]==='{')depth++;if(PIXEL_MESH_FRAG[at]==='}')depth--;}return PIXEL_MESH_FRAG.slice(start,at+1);};
 report.gpuAreaWitness=await witness.evaluate(({helper,stroke})=>{
  const c=document.createElement('canvas');c.width=c.height=256;const gl=c.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');
  const compile=(type,source)=>{const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
  const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`));
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`#version 300 es
precision highp float;uniform int mode;uniform float coverage,period,phase;out vec4 o;
${helper}
${stroke}
void main(){if(mode==0){float tag=floor(gl_FragCoord.x)/255.0;o=vec4(printedSurfaceKind(tag)/3.0,printedSurfaceCoverage(tag),printedSurfaceArea(tag),1.0);}else{float threshold=strokeDistance(gl_FragCoord.xy,vec2(cos(.6283),sin(.6283)),period,phase);float a=printedAreaPigmentSample(coverage,threshold);o=vec4(a,a,a,1.0);}}`));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);gl.bindVertexArray(gl.createVertexArray());gl.viewport(0,0,256,256);gl.disable(gl.DITHER);
  const uniform=n=>gl.getUniformLocation(program,n),pixels=new Uint8Array(256*256*4),draw=()=>{gl.drawArrays(gl.TRIANGLES,0,3);gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,pixels);};
  gl.uniform1i(uniform('mode'),0);draw();const tags=[];for(let byte=0;byte<256;byte++)tags.push([...pixels.slice(byte*4,byte*4+3)]);
  gl.uniform1i(uniform('mode'),1);const screens=[];for(const [id,period,jitter]of[['hatch',5.5,.22],['crosshatch',6.5,.26],['crosshatchTight',4.25,.3]]){gl.uniform1f(uniform('period'),period);gl.uniform1f(uniform('phase'),(.37-.5)*jitter);const levels=[];for(let level=0;level<=15;level++){gl.uniform1f(uniform('coverage'),level/15);draw();let selected=0;for(let i=0;i<pixels.length;i+=4)selected+=pixels[i]===255;levels.push(selected/(256*256));}screens.push({id,levels});}
  const error=gl.getError();gl.deleteProgram(program);return{tags,screens,glError:error,scope:'Actual shared marker/area-selection GLSL and actual final-shader primary screen function, rendered/read back on native WebGL2. Full P3/final program compilation follows in native fixtures.'};
 },{helper:PRINTED_SURFACE_GLSL,stroke:glslFunction('strokeDistance')});
 assert.equal(report.gpuAreaWitness.glError,0);
 for(let byte=0;byte<256;byte++){const decoded=(await import('../../../src/render/printed-surface.js')).decodePrintedSurface(byte/255);assert.deepEqual(report.gpuAreaWitness.tags[byte],[decoded.kind*85,Math.round(decoded.coverage*255),decoded.area?255:0],`GPU marker byte ${byte}`);}
 for(const screen of report.gpuAreaWitness.screens)screen.levels.forEach((fraction,i)=>assert.ok(Math.abs(fraction-i/15)<.003,`GPU fractional area ${screen.id}/${i}: ${fraction}`));
 await witness.close();save();
 for(const arm of['control','after']){
  const page=await browser.newPage();await page.setViewport({width:1100,height:800,deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push({arm,error:e.stack||e.message}));
  page.on('console',m=>{if(m.type()==='error'||m.text().startsWith('LETTERING'))console.log(arm,m.text());});
  const overrides=new Map();
  if(arm==='control')for(const [url,file]of[
   ['/src/render/props3d.js','props3d.js'],['/src/render/pixel-mesh/shader.js','pixel-mesh-shader.js'],
   ['/src/render/printed-surface.js','printed-surface.js'],['/src/data/paper-pigment.js','paper-pigment.js']
  ])overrides.set(url,'artifacts/lettering-weathering/paper-area-controls/'+file);
  await page.setRequestInterception(true);page.on('request',async r=>{
   const file=overrides.get(new URL(r.url()).pathname);if(!file){await r.continue();return;}
   let body=fs.readFileSync(file);const js=file.endsWith('.js');if(js)body=Buffer.from(body.toString().replace(/\bfrom\s*(['"])(\.\.?\/[^'"]+)\1/g,(all,q,s)=>'from '+q+new URL(s,r.url()).href+q));
   await r.respond({status:200,contentType:js?'application/javascript':file.endsWith('.glb')?'model/gltf-binary':'application/json',body});
  });
  await page.evaluateOnNewDocument(()=>{let proofRandomState=305419896;Math.random=()=>{proofRandomState=(Math.imul(proofRandomState,1664525)+1013904223)>>>0;return proofRandomState/4294967296;};window.productionWallNow=performance.now.bind(performance);window.productionClock=0;Object.defineProperty(performance,'now',{value:()=>window.productionClock});window.WebSocket=class extends EventTarget{static OPEN=1;constructor(){super();this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){this.readyState=3;}};});
  await page.goto('http://127.0.0.1:5334/artifacts/lettering-weathering/native.html',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.productionLettering?.ready||window.productionLettering?.failure,{timeout:120000});assert.equal(await page.evaluate(()=>window.productionLettering.failure),undefined);
  await page.waitForNetworkIdle({idleTime:500,timeout:45000});
  await page.evaluate(()=>{window.productionClock=100000;const S=window.productionLettering,render=S.render;S.render=o=>{window.productionClock+=1000/60;return render(o);};});
  const views=[];
  for(const fixture of[
   {id:'loose_note',faceId:'loose_note-paper-0',label:'paper',views:[['normal',.42,0],['near',.32,0],['oblique',.42,.2],['far',1.5,0]]},
   {id:'vigil_part_sign_save',faceId:'vigil_part_sign_save:0',label:'placard',views:[['normal',2.5,0],['oblique',2.5,.5]]},
   {id:'tower_peal_board',faceId:'tower_peal_board:0',label:'gilt',views:[['normal',2.5,0],['oblique',2.5,.5]]}
  ]){
   await page.evaluate(({id,faceId})=>window.productionLettering.configure({kind:'fixture',id,faceId,width:960,height:600}),fixture);
   for(const [name,distance,offset]of fixture.views)for(const stage of['props','scene','mark-alpha','final']){
    const result=await page.evaluate(({distance,offset,stage})=>{const S=window.productionLettering;for(let i=0;i<8;i++)S.render({distance,offset,stage,light:'torch',timeSec:20,reset:true,capture:false});const r=S.render({distance,offset,stage,light:'torch',timeSec:20,reset:true});return{png:r.frame.toDataURL(),evidence:r.evidence};},{distance,offset,stage});
    assert.equal(result.evidence.glError,0);const file=`${fixture.label}-${arm}-${name}-${stage}.png`;fs.writeFileSync(path.join(out,file),Buffer.from(result.png.split(',')[1],'base64'));views.push({file,fixture:fixture.label,...result.evidence});
   }
  }
  report.arms.push({arm,views});save();await page.close();console.log('Paper native arm complete',arm);
 }
 report.imageComparisons=[];
 for(const view of report.arms[0].views){
  const after=view.file.replace('-control-','-after-');
  const a=await sharp(path.join(out,view.file)).removeAlpha().raw().toBuffer(),b=await sharp(path.join(out,after)).removeAlpha().raw().toBuffer();
  assert.equal(a.length,b.length);let changedPixels=0,changedChannels=0,maxDelta=0;
  for(let i=0;i<a.length;i+=3){let changed=false;for(let k=0;k<3;k++){const d=Math.abs(a[i+k]-b[i+k]);if(d){changed=true;changedChannels++;maxDelta=Math.max(maxDelta,d);}}changedPixels+=changed;}
  const comparison={before:view.file,after,changedPixels,changedChannels,maxDelta,requiredExact:view.fixture!=='paper'||view.stage==='props'};
  report.imageComparisons.push(comparison);
 }
 report.sourceHashesAfter=hashes();report.changedSources=sourcePaths.filter(p=>report.sourceHashes[p]!==report.sourceHashesAfter[p]);assert.deepEqual(report.changedSources,[]);assert.deepEqual(report.errors,[]);report.complete=true;report.nonPaperExact=report.imageComparisons.filter(c=>c.requiredExact).every(c=>c.changedPixels===0);save();assert.equal(report.nonPaperExact,true,'Canonical raw paper or non-paper frame changed');
}catch(e){report.failure=e.stack;save();throw e;}finally{if(browser)await browser.close();fs.rmSync(profile,{recursive:true,force:true});}
