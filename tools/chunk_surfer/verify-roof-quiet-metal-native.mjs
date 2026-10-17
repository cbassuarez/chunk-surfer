// Native 3D movement acceptance: only the initial north-gallery placement is a QA warp.
// Every route transition thereafter is a real keyboard step against live collision.
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { conservatory } from '../../src/data/floorplan/conservatory.js';
import { ACADEMIC_ROOF } from '../../src/data/academic-roof.js';
import * as FP from '../../src/world/floorplan.js';
import * as PROPS from '../../src/game/props.js';

const placementOnly=process.env.ROOF_QUIET_PLACEMENT_ONLY==='1';
const listenPort=Number(process.env.ROOF_WALK_PORT)||5382;
const url = process.env.ROOF_WALK_URL || `http://127.0.0.1:${listenPort}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0`;
const out = resolve(process.env.ROOF_WALK_OUT || 'artifacts/roof-floor-design/quiet-metal/baseline');
await mkdir(out, { recursive:true });
const propPackHash=async()=>createHash('sha256').update(await readFile(resolve('public/assets/conservatory-props.glb'))).digest('hex');
const propPackHashStart=await propPackHash();
// Disable HMR: parallel narrative/roof edits during acceptance must not reload
// the browser halfway through a real stair transition.
const server=process.env.ROOF_WALK_URL?null:await createServer({configFile:'vite.config.js',
  server:{host:'127.0.0.1',port:listenPort,strictPort:true,hmr:false}});
if(server)await server.listen();
if(!placementOnly){FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});PROPS.propsInit(FP);}
const key = p => `${p.x},${p.y}`;
const logical = (x,y) => placementOnly?{x:x*2+1,y:y*2+1}:FP.toRuntimePoint({x,y});
const within = p => (p.x>=84&&p.x<100&&p.y>=478&&p.y<500)||
  (p.x>=316&&p.x<380&&p.y>=548&&p.y<586)||
  (p.x>=380&&p.x<428&&p.y>=540&&p.y<594);
function path(start,end){
  const seen=new Map([[key(start),null]]),queue=[start];
  for(let i=0;i<queue.length;i++){
    const p=queue[i];if(key(p)===key(end))break;
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
      const move=FP.canStep(p.x,p.y,p.x+dx,p.y+dy,{keys:new Set(['master'])});
      if(!move.ok)continue;
      const to=move.redirect||{x:p.x+dx,y:p.y+dy};
      if(!within(to)||!PROPS.propCanOccupy(to.x,to.y)||seen.has(key(to)))continue;
      seen.set(key(to),{from:key(p),dx,dy,portal:move.edgePortal||null});queue.push(to);
    }
  }
  if(!seen.has(key(end)))throw Error(`No authored path ${key(start)} -> ${key(end)}`);
  const reversed=[];for(let here=key(end);here!==key(start);){
    const edge=seen.get(here);reversed.push({to:here,dx:edge.dx,dy:edge.dy,portal:edge.portal});here=edge.from;
  }
  return reversed.reverse();
}
const reusableEndpoint=process.env.ROOF_QUIET_WS||null;
const profile=reusableEndpoint?null:await mkdtemp(join(tmpdir(),'chunk-roof-walk-'));
const browser=reusableEndpoint?await puppeteer.connect({browserWSEndpoint:reusableEndpoint,protocolTimeout:180000}):await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,userDataDir:profile,timeout:90000,protocolTimeout:90000,
  args:['--no-sandbox','--enable-webgl','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const previousPages=reusableEndpoint?await browser.pages():[];
const page=await browser.newPage();
for(const previous of previousPages)if(previous.url().startsWith('http://127.0.0.1:5382'))await previous.close();
await page.setCacheEnabled(false);await page.setViewport({width:960,height:600,deviceScaleFactor:1});
await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  const prototype=WebGL2RenderingContext.prototype,create=prototype.createProgram,link=prototype.linkProgram,draw=prototype.drawArrays;
  const programs=new WeakMap();window.__quietPrograms=[];
  prototype.createProgram=function(...args){const program=create.apply(this,args);window.__quietPrograms.push({context:this,program});return program;};
  prototype.linkProgram=function(program){const result=link.call(this,program),sources=(this.getAttachedShaders(program)||[]).map(shader=>this.getShaderSource(shader));
    const source=sources.find(source=>source.includes('quietMetalInk'));
    if(source)programs.set(program,{source,lateCap:source.includes('finalColor=mix(finalColor,min(finalColor,quietMetalInk),quietMetal)')});return result;};
  prototype.drawArrays=function(...args){
    const program=this.getParameter(this.CURRENT_PROGRAM),kind=programs.get(program);
    if(kind&&window.__quietCaptureDiagnostic){
      const names=['uMarks','uRecordingCaptureMix','uDebugSource','uRecordedPressureReady','uRecordedPressureNearFar'];
      const uniforms=Object.fromEntries(names.map(name=>[name,this.getUniform(program,this.getUniformLocation(program,name))]));
      const previous=this.getParameter(this.ACTIVE_TEXTURE);this.activeTexture(this.TEXTURE0+uniforms.uMarks);
      const marksTexture=this.getParameter(this.TEXTURE_BINDING_2D);this.activeTexture(previous);
      window.__quietDrawState={context:this,marksTexture,uniforms,lateCap:kind.lateCap,sourceLength:kind.source.length,recordedAt:performance.now()};
    }
    const result=draw.apply(this,args);
    if(kind&&window.__quietCaptureDiagnostic){
      const diagnostic=window.__quietDrawState,viewport=this.getParameter(this.VIEWPORT),width=viewport[2],height=viewport[3];
      const previousRead=this.getParameter(this.READ_FRAMEBUFFER_BINDING),previousBuffer=this.getParameter(this.READ_BUFFER),drawFbo=this.getParameter(this.DRAW_FRAMEBUFFER_BINDING);
      const output=new Uint8Array(width*height*4),sampledMarks=new Uint8Array(width*height*4),fbo=this.createFramebuffer();
      try{
        this.bindFramebuffer(this.READ_FRAMEBUFFER,drawFbo);this.readBuffer(this.COLOR_ATTACHMENT0);this.readPixels(0,0,width,height,this.RGBA,this.UNSIGNED_BYTE,output);
        this.bindFramebuffer(this.READ_FRAMEBUFFER,fbo);this.framebufferTexture2D(this.READ_FRAMEBUFFER,this.COLOR_ATTACHMENT0,this.TEXTURE_2D,diagnostic.marksTexture,0);this.readBuffer(this.COLOR_ATTACHMENT0);
        this.readPixels(0,0,width,height,this.RGBA,this.UNSIGNED_BYTE,sampledMarks);
        Object.assign(diagnostic,{width,height,output,sampledMarks});
      }finally{this.bindFramebuffer(this.READ_FRAMEBUFFER,previousRead);this.readBuffer(previousBuffer);this.deleteFramebuffer(fbo);}
      window.__quietCaptureDiagnostic=false;
    }
    return result;
  };
});
const report={url,placementOnly,propPackHashStart,steps:[],captures:[],checks:[],errors:[],start:null,end:null};
report.console=[];report.network=[];
page.on('console',message=>{if(['error','warn'].includes(message.type())){const item={phase,type:message.type(),text:message.text(),location:message.location()};report.console.push(item);console.log('BROWSER_CONSOLE',JSON.stringify(item));}});
page.on('requestfailed',request=>{const item={phase,url:request.url(),failure:request.failure()};report.network.push(item);console.log('REQUEST_FAILED',JSON.stringify(item));});
let phase='boot';const log=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail));};
const state=()=>page.evaluate(()=>({pos:window.__probe?.pos?.(),floor:window.__probe?.floorH?.(),
  scene:window.__scenes?.top?.()?.id||null,sceneView:window.__scenes?.top?.()?.view?.()||null,
  focus:window.__probe?.interactionFocus?.(),look:window.__probe?.lookAngles?.(),
  group:window.__probe?.world?.(),flags:{access:window.__probe?.flag?.('roof.access')},
  eye:window.__probe?.sourceShoreView?.()?.eye||null,
  lighting:window.__probe?.r3dLighting?.(),
  screen:window.__chunkSurferPixelMesh?.status?.()}));
async function walkTo(label,target){
  if(placementOnly){
    await page.evaluate(({x,y})=>window.__probe.warpCell((x-1)/2,(y-1)/2),target);
    await new Promise(r=>setTimeout(r,2400));
    const arrived=(await state()).pos;
    log(`${label} uses an explicit QA material-comparison placement`,key(arrived)===key(target),{target,arrived});return;
  }
  const from=(await state()).pos;
  const initialRoute=path(from,target);console.log('ROUTE',label,initialRoute.length);
  let moved=0,stalls=0;
  // The first-person controller may consume more than one half-metre cell per
  // keypress, especially while crossing an edge portal. Replan from the real
  // live cell each time; never count a scripted redirect as a keyboard step.
  for(let attempt=0;attempt<initialRoute.length*8+24;attempt++){
    const current=(await state()).pos;
    if(key(current)===key(target))break;
    const route=path(current,target),edge=route[0];phase=`${label}:${attempt+1}`;
    const yaw=Math.atan2(edge.dx,-edge.dy);
    await page.evaluate(yaw=>window.__probe.lookAtWorld(yaw,0),yaw);
    const before=(await state()).pos;
    await page.keyboard.press('w');
    const after=await state();
    const trace={phase,label,index:attempt+1,from:before,to:after.pos,aimed:edge.to,
      floor:after.floor,scene:after.scene,portal:edge.portal};
    report.steps.push(trace);
    if(key(after.pos)===key(before)){
      if(++stalls>=4)throw Error(`Movement stalled at ${phase}: ${key(before)} toward ${edge.to}`);
    }else{
      stalls=0;moved++;
      if(!within(after.pos)||!PROPS.propCanOccupy(after.pos.x,after.pos.y))
        throw Error(`Walk left authored route at ${phase}: ${key(before)} -> ${key(after.pos)}`);
      path(after.pos,target); // prove each live landing still leads to destination
    }
  }
  const arrived=(await state()).pos;
  log(`${label} traversed with keyboard`,key(arrived)===key(target),{presses:moved,target,arrived});
  if(key(arrived)!==key(target))throw Error(`Could not finish ${label}: ${key(arrived)} != ${key(target)}`);
}
const sourceHashes={};
for(const source of ['src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js','tools/chunk_surfer/academic-roof-geometry.mjs'])sourceHashes[source]=createHash('sha256').update(await readFile(source)).digest('hex');
report.sourceHashes=sourceHashes;
page.on('pageerror',error=>{report.errors.push({phase,message:String(error.stack||error)});console.error('PAGE_ERROR',String(error.stack||error));});
async function capture(name){
  phase=name;await new Promise(r=>setTimeout(r,750));
  await page.evaluate(async()=>{window.__quietCaptureDiagnostic=true;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  const s=await state(),file=join(out,`${name}.webp`);
  await page.screenshot({path:file,type:'webp',quality:92});
  const raw=await page.evaluate(async()=>{
    const stages=Object.fromEntries(['props','scene','marks','mark-alpha','vfd'].map(stage=>[stage,window.__probe.sourceShoreCapture?.(stage)]));
    // Diagnostic readback preserves the material-mark alpha identity. The
    // ordinary stage export deliberately makes depth/identity alpha opaque.
    const P3=await import('/src/render/props3d.js');
    const target=P3.propTargets(),pressure=P3.pressureTargets(),canvas=document.querySelector('canvas.r3d'),gl=canvas?.getContext('webgl2');
    const diagnostic=window.__quietDrawState;
    if(diagnostic?.output){
      const encode=(pixels,alphaOnly=false)=>{
        const output=document.createElement('canvas');output.width=diagnostic.width;output.height=diagnostic.height;
        const ctx=output.getContext('2d'),frame=ctx.createImageData(output.width,output.height);
        for(let y=0;y<output.height;y++)for(let x=0;x<output.width;x++){
          const source=((output.height-1-y)*output.width+x)*4,offset=(y*output.width+x)*4;
          if(alphaOnly){const a=pixels[source+3];frame.data.set([a,a,a,255],offset);}
          else frame.data.set([pixels[source],pixels[source+1],pixels[source+2],255],offset);
        }
        ctx.putImageData(frame,0,0);return output.toDataURL('image/png');
      };
      stages['draw-immediate']=encode(diagnostic.output);stages['draw-sampled-mark-alpha']=encode(diagnostic.sampledMarks,true);
    }
    stages._drawDiagnostic=diagnostic?{uniforms:diagnostic.uniforms,lateCap:diagnostic.lateCap,sourceLength:diagnostic.sourceLength,pressure:{ready:pressure.ready,draws:pressure.draws,near:pressure.near,far:pressure.far},sampledEqualsPropMarks:diagnostic.marksTexture===target.marks}:null;
    if(gl&&target.marks){
      const previousRead=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),previousBuffer=gl.getParameter(gl.READ_BUFFER);
      const fbo=gl.createFramebuffer();
      // Props may render below display resolution; texture dimensions are
      // obtained from the ordinary exported props stage, never guessed.
      const probe=window.__probe.sourceShoreCapture('props');
      const img=new Image();img.src=probe;await img.decode();
      const width=img.width,height=img.height,pixels=new Uint8Array(width*height*4),histogram={};
      try{
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.marks,0);gl.readBuffer(gl.COLOR_ATTACHMENT0);
        if(gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE){
          gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          const output=document.createElement('canvas');output.width=width;output.height=height;
          const ctx=output.getContext('2d'),frame=ctx.createImageData(width,height);
          for(let y=0;y<height;y++)for(let x=0;x<width;x++){
            const a=pixels[((height-1-y)*width+x)*4+3],offset=(y*width+x)*4;
            frame.data.set([a,a,a,255],offset);histogram[a]=(histogram[a]||0)+1;
          }
          ctx.putImageData(frame,0,0);stages['prop-mark-alpha']=output.toDataURL('image/png');
          stages._markAlphaHistogram=histogram;
        }
      }finally{gl.bindFramebuffer(gl.READ_FRAMEBUFFER,previousRead);gl.readBuffer(previousBuffer);gl.deleteFramebuffer(fbo);}
    }
    return stages;
  });
  for(const[stage,data]of Object.entries(raw))if(typeof data==='string')await writeFile(join(out,`${name}-${stage}.png`),Buffer.from(data.split(',')[1],'base64'));
  s.markAlphaHistogram=raw._markAlphaHistogram||null;
  s.drawDiagnostic=raw._drawDiagnostic||null;
  report.captures.push({name,file,...s});console.log('CAPTURE',name,JSON.stringify({pos:s.pos,eye:s.eye,floor:s.floor,look:s.look}));return s;
}
async function viewPair(name,yaw,pitch){
  await page.evaluate(({yaw,pitch})=>window.__probe.lookAtWorld(yaw,pitch),{yaw,pitch});
  for(const enabled of [true,false]){
    await page.evaluate(enabled=>window.__probe.setTorch(enabled),enabled);
    await new Promise(r=>setTimeout(r,1500));
    await capture(`${name}-torch-${enabled?'on':'off'}`);
  }
}
try{
  try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});}
  catch(error){if(error.name!=='TimeoutError')throw error;console.log('NAVIGATION_DELAY_CONTINUE_SAME_BROWSER',String(error));}
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:120000});
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();
    window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','academic.entered'],['roof.access']);
    window.__probe.setTakes(['main_b3'],true);window.__probe.setTorch(true);window.__probe.warpCell(44,243);
    for(const canvas of document.querySelectorAll('#map > canvas'))if(canvas.style.zIndex==='8')canvas.style.visibility='hidden';
    window.__probe.lookAtWorld(0,-.03);
  });
  await new Promise(r=>setTimeout(r,1800));
  console.log('NATIVE_BROWSER_FROZEN',propPackHashStart);
  report.start=await state();
  log('north gallery roof gate focusable',report.start.focus?.propId==='roof-gate',report.start.focus);
  await page.keyboard.press('e');
  log('accepted take and master key open gate',(await state()).flags.access===true,(await state()).flags);
  await walkTo('first grated landing',logical(ACADEMIC_ROOF.stairFoot.x,ACADEMIC_ROOF.stairFoot.y));
  await viewPair('01-first-foot-school-west-down',Math.PI*1.5,-.75);
  if(process.env.ROOF_QUIET_PRIMARY_ONLY!=='1')await viewPair('02-first-foot-car-and-facade',5.62,-.73);
  await walkTo('outer switchback guard lookout',logical(159,278.5));
  await viewPair('03-outer-turn-northeast-down',Math.PI*.25,-.82);
  if(process.env.ROOF_QUIET_PRIMARY_ONLY!=='1')await viewPair('04-outer-turn-car-deep',.55,-1.38);
  report.end=await state();
  report.propPackHashEnd=await propPackHash();
  log('prop pack remained byte-identical through native review',report.propPackHashEnd===report.propPackHashStart,report.propPackHashEnd);
}catch(error){report.errors.push({phase,message:String(error.stack||error)});console.error('FATAL',phase,error);
  try{report.failureState=await page.evaluate(()=>({ready:document.readyState,probe:!!window.__probe,scene:window.__scenes?.top?.()?.id,text:document.body.innerText.slice(0,1200)}));await page.screenshot({path:join(out,'failure.webp'),type:'webp'});}catch{}
}finally{
  try{if(process.env.ROOF_QUIET_HOLD==='1')report.browserEndpoint=browser.wsEndpoint();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log('REPORT',join(out,'report.json'));
    if(process.env.ROOF_QUIET_HOLD==='1'){
      console.log('QA_BROWSER_HELD',browser.wsEndpoint(),profile);
      for(let i=0;i<600;i++){try{await readFile(join(out,'release'));break;}catch{}await new Promise(r=>setTimeout(r,1000));}
    }}
  finally{if(reusableEndpoint)await browser.disconnect();else await browser.close();if(profile)await rm(profile,{recursive:true,force:true});await server?.close();}
}
process.exit(report.errors.length||report.checks.some(c=>!c.pass)?1:0);
