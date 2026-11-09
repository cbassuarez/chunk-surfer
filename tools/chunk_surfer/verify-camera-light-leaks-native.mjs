// Compile the exact production post shader against one retained native scene.
// The previous control reverses only this task's light-leak gain changes.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const out=resolve('artifacts/interruption-extras-audit/light-leak-comparison');await mkdir(out,{recursive:true});
const input='artifacts/interruption-extras-audit/native/02-walking-door-scene.png';
const inputBytes=await readFile(input);const report={method:'Exact production post shader, native Metal, one retained actual native field scene. Explicit fixed uniforms and camera; controlled previous shader reverses only the local light-leak gain patch. This is an optical settings regression comparison, not gameplay or medical certification.',input,inputSha256:createHash('sha256').update(inputBytes).digest('hex')};
let server,browser,profile;
try{
  server=await createServer({configFile:'vite.config.js',optimizeDeps:{noDiscovery:true},server:{host:'127.0.0.1',port:5409,strictPort:true,hmr:false,watch:null}});await server.listen();
  profile=await mkdtemp(join(tmpdir(),'chunk-camera-leak-'));
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,args:['--use-angle=metal']});
  const page=await browser.newPage();await page.setViewport({width:640,height:400,deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5409/artifacts/interruption-extras-audit/post-shader-review.html',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async({input})=>{
    const R3=await import('/src/render/r3d.js'),sources=R3.r3dPostShaderSources();
    const previous=sources.fragment
      .replace('blinding*=cameraLightGain;lensGoing*=cameraLightGain;afterSun*=cameraLightGain;','')
      .replace('soft/mix(12.0,max(.001,softWeightSum),clamp(uReduceFlash,0.0,1.0))','soft/12.0')
      .replace('burn*min(1.0,leakAmount*1.7)*cameraLightGain','burn*min(1.0,leakAmount*1.7)')
      .replace('disc*leakAmount*.2*cameraLightGain','disc*leakAmount*.2')
      .replace('flare*.94*cameraLightGain','flare*.94')
      .replace('*.55*cameraLightGain;','*.55;');
    if(previous===sources.fragment)throw Error('The controlled previous shader was not reconstructed.');
    const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});
    if(!gl)throw Error('WebGL2 is unavailable');
    const ext=gl.getExtension('WEBGL_debug_renderer_info');
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
    const program=fragment=>{const value=gl.createProgram();gl.attachShader(value,compile(gl.VERTEX_SHADER,sources.vertex));gl.attachShader(value,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(value);if(!gl.getProgramParameter(value,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(value));return value;};
    const programs={previous:program(previous),revised:program(sources.fragment)};
    const image=new Image();image.src='/'+input;await image.decode();
    const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.bindVertexArray(gl.createVertexArray());gl.viewport(0,0,canvas.width,canvas.height);
    const frames={};
    for(const[name,p]of Object.entries(programs))for(const reduceFlash of[false,true])for(const peak of[false,true]){
      gl.useProgram(p);const set=(name,...values)=>{const at=gl.getUniformLocation(p,name);if(at==null)return;if(values.length===1)gl.uniform1f(at,values[0]);else if(values.length===2)gl.uniform2f(at,...values);else gl.uniform4f(at,...values);};
      gl.uniform1i(gl.getUniformLocation(p,'uSrc'),0);set('uRes',canvas.width,canvas.height);set('uPerception',1,1,0,0);set('uPerceptionAt',.5,.5,0,0);
      set('uReduceFlash',Number(reduceFlash));set('uReduceMotion',1);set('uLeak',peak?1:0,peak?.5:0,.17,.25);
      set('uLeakWave',.5,.5,peak?2.5:0,.2);set('uLeakLens',peak?1:0,0,.5,.55);set('uLeakShimmer',0);
      gl.drawArrays(gl.TRIANGLES,0,3);gl.finish();
      const bytes=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      let sum=0,nearWhite=0;for(let i=0;i<bytes.length;i+=4){sum+=(.2126*bytes[i]+.7152*bytes[i+1]+.0722*bytes[i+2])/255;if(bytes[i]>242&&bytes[i+1]>242&&bytes[i+2]>242)nearWhite++;}
      frames[`${name}-${reduceFlash?'reduced':'full'}-${peak?'peak':'idle'}`]={image:canvas.toDataURL('image/png'),bytes:Array.from(bytes),meanCodeLuma:sum/(canvas.width*canvas.height),nearWhiteFraction:nearWhite/(canvas.width*canvas.height),glError:gl.getError()};
    }
    return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),frames};
  },{input});
  report.renderer=result.renderer;report.frames={};
  for(const[name,value]of Object.entries(result.frames)){
    const file=join(out,`${name}.png`),pixels=Buffer.from(value.bytes);await writeFile(file,Buffer.from(value.image.split(',')[1],'base64'));
    report.frames[name]={file,sha256:createHash('sha256').update(pixels).digest('hex'),meanCodeLuma:value.meanCodeLuma,nearWhiteFraction:value.nearWhiteFraction,glError:value.glError};
  }
  for(const mode of['full','reduced'])assert.equal(report.frames[`previous-${mode}-idle`].sha256,report.frames[`revised-${mode}-idle`].sha256,'effect-off output must remain exact');
  assert.equal(report.frames['previous-full-peak'].sha256,report.frames['revised-full-peak'].sha256,'full setting remains pixel-identical');
  const before=report.frames['previous-reduced-peak'],after=report.frames['revised-reduced-peak'];
  assert.ok(after.meanCodeLuma<before.meanCodeLuma*.8,'Reduce Flash materially attenuates the displayed light pulse');
  assert.ok(Object.values(report.frames).every(frame=>frame.glError===0));
  report.pass=true;console.log(JSON.stringify(report,null,2));
}catch(error){report.pass=false;report.error=String(error.stack||error);process.exitCode=1;console.error(report.error);}
finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server?.httpServer?.closeAllConnections?.();await server?.close();if(profile)await rm(profile,{recursive:true,force:true});}
