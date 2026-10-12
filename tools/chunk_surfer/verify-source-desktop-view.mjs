// Passive renderer fixture only; this never opens a native desktop overlay.
// SOURCE_DESKTOP_URL=http://127.0.0.1:5297 SOURCE_DESKTOP_OUT=/private/tmp/source-desktop-view \
//   node tools/chunk_surfer/verify-source-desktop-view.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const base=process.env.SOURCE_DESKTOP_URL || 'http://127.0.0.1:5297';
const out=resolve(process.env.SOURCE_DESKTOP_OUT || '/private/tmp/source-desktop-view');
await mkdir(out,{recursive:true});
const checks=[], errors=[], frames=[];
let browser, page, failure=null, revision=0;
function check(ok,name,detail) { checks.push({name,passed:!!ok,...(detail===undefined?{}:{detail})}); console.log(`${ok?'PASS':'FAIL'} ${name}${detail===undefined?'':` ${JSON.stringify(detail)}`}`); }
const baseline={version:1,active:true,mode:'native',phase:'contained',clock:2,transition:0,tier:0,movementIndex:0,
  composureRatio:1,coherenceRatio:1,cover:{count:3,capacity:3,guard:5,exposed:false},
  intent:{kind:'broadcast',progress:.25},reaction:{phase:'closed',progress:.25,tier:'',armed:false},
  desktop:{width:1440,height:900,scale:1,origin:{x:0,y:0},command:{x:0,y:648,width:1440,height:252}}};
async function sample(name,changes={},capture=true) {
  const envelope={token:'source-desktop-fixture',revision:revision++,snapshot:{...baseline,...changes}};
  const rendered=await page.evaluate(envelope=>window.__sourceDesktopSurface.accept(envelope),envelope);
  check(rendered,`${name} accepts authoritative state`);
  const result=await page.evaluate(()=>{
    const source=document.getElementById('source-desktop'), canvas=document.createElement('canvas');
    canvas.width=source.width; canvas.height=source.height; const context=canvas.getContext('2d'); context.drawImage(source,0,0);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    let alpha=0,transparent=0,solid=0,bright=0,hash=2166136261,minX=canvas.width,maxX=0,minY=canvas.height,maxY=0;
    let bodySamples=0,bodyDark=0,bodyLight=0,bodyMid=0,bodyEdges=0;
    for(let n=0;n<pixels.length;n+=4) {
      const opacity=pixels[n+3]; alpha+=opacity; if(!opacity)transparent++; if(opacity>240)solid++;
      if(opacity>16) { const pixel=n/4,x=pixel%canvas.width,y=Math.floor(pixel/canvas.width); minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y); }
      if(pixels[n]>245&&pixels[n+1]>245&&pixels[n+2]>245&&opacity>240)bright++;
      // The central torso is separate from the pre-existing code grain on the
      // flanking strata. A dithered prop cannot make an undithered body pass.
      const x=(n/4)%canvas.width,y=Math.floor((n/4)/canvas.width);
      if(opacity>220&&x>canvas.width*.48&&x<canvas.width*.52&&y>canvas.height*.21&&y<canvas.height*.33){
        const luma=(pixels[n]*.2126+pixels[n+1]*.7152+pixels[n+2]*.0722)/255;
        bodySamples++;
        if(luma<.16)bodyDark++;else if(luma>.6)bodyLight++;else bodyMid++;
        if(x>0&&pixels[n-1]>220){
          const left=(pixels[n-4]*.2126+pixels[n-3]*.7152+pixels[n-2]*.0722)/255;
          if(Math.abs(luma-left)>.4)bodyEdges++;
        }
      }
      for(let c=0;c<4;c++)hash=Math.imul(hash^pixels[n+c],16777619);
    }
    return {debug:window.__sourceDesktopSurface.debug(),pixels:{width:canvas.width,height:canvas.height,
      transparent:transparent/(pixels.length/4),solid:solid/(pixels.length/4),nearWhite:bright/(pixels.length/4),
      meanAlpha:alpha/(pixels.length/4),hash:hash>>>0,bounds:{minX,maxX,minY,maxY},
      body:{samples:bodySamples,dark:bodyDark/Math.max(1,bodySamples),light:bodyLight/Math.max(1,bodySamples),
        mid:bodyMid/Math.max(1,bodySamples),edges:bodyEdges}}};
  });
  const compact={name,frame:result.debug.frame,gpu:result.debug.gpu,dither:result.debug.dither,pixels:result.pixels}; frames.push(compact);
  if(capture) await page.screenshot({path:join(out,`${name}.png`),omitBackground:true});
  return result;
}
try {
  browser=await puppeteer.launch({executablePath:process.env.SOURCE_DESKTOP_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless:true,protocolTimeout:120000,args:[`--use-angle=${process.env.SOURCE_DESKTOP_ANGLE || (process.platform==='darwin'?'metal':'swiftshader')}`,
      '--disable-renderer-backgrounding','--disable-background-timer-throttling','--disk-cache-size=1048576','--media-cache-size=1048576']});
  page=await browser.newPage(); await page.setCacheEnabled(false); await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  // This fixture is a finite sampled sequence. Concurrent unrelated source
  // edits must not replace its renderer halfway through pixel comparisons.
  await page.evaluateOnNewDocument(()=>{
    const NativeSocket=window.WebSocket;
    class FixtureSocket extends EventTarget {
      static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
      constructor(url) { super();this.url=String(url);this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.dispatchEvent(new Event('open'))); }
      send() {} close() {this.readyState=3;}
    }
    window.WebSocket=class extends NativeSocket {
      constructor(url,protocols) { if(protocols==='vite-hmr')return new FixtureSocket(url); super(url,protocols); }
    };
  });
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|WebGL.*context.*lost/i.test(message.text()))errors.push(message.text());});
  await page.goto(new URL('/source-desktop-surface.html',base).href,{waitUntil:'networkidle0',timeout:120000});
  await page.waitForFunction(()=>window.__sourceDesktopSurface?.debug().ready || document.documentElement.dataset.renderError,{timeout:120000});
  const loaded=await page.evaluate(()=>window.__sourceDesktopSurface.debug());
  check(loaded.ready&&!loaded.error,'actual assets initialize',loaded.error);
  check(loaded.skinnedMeshes>0&&loaded.bones>=30,'actual borrowed body is skinned',{meshes:loaded.skinnedMeshes,bones:loaded.bones});
  check(['pressure_hold','pressure_listen','pressure_load','pressure_arrest','pressure_pivot'].every(name=>loaded.animationClips.includes(name)), 'authored clips are loaded',loaded.animationClips);
  check(loaded.modelIds.includes('upright_piano')&&loaded.modelIds.includes('open_instrument_case'),'actual Source model architecture is loaded',loaded.modelIds);
  const contained=await sample('01-contained',{active:false});
  check(contained.pixels.solid>.015&&contained.pixels.transparent>.65,'contained stage renders visible body and transparent desktop',contained.pixels);
  const half=await sample('02-dissolving',{phase:'dissolving',transition:.5,clock:3.2,cover:{count:0,capacity:2,guard:4}});
  const desktop=await sample('03-desktop',{phase:'desktop',transition:1,clock:4.4,tier:1,cover:{count:0,capacity:2,guard:4}});
  check(desktop.debug.dither?.shader==='pixel-mesh'&&desktop.debug.dither?.renderCount>0,'the live model passes through the shared game shader',desktop.debug.dither);
  const body=desktop.pixels.body;
  check(body.samples>500&&body.dark>.05&&body.light>.05&&body.mid<.2&&body.edges>100,
    'actual torso pixels contain distinct dark and light dither marks',body);
  check(desktop.debug.frame.openness===1&&half.debug.frame.openness===.5,'owner transition drives shell dissolution');
  check(desktop.pixels.transparent>contained.pixels.transparent,'dissolution exposes more desktop without erasing the body',{contained:contained.pixels.transparent,desktop:desktop.pixels.transparent});
  check(desktop.pixels.bounds.maxY<648,'all rendered physical presentation clears command island',desktop.pixels.bounds);
  const hold=await sample('04-hold',{phase:'desktop',clock:5,tier:1,actionId:'hold',cover:{count:1,capacity:2,guard:4}});
  check(hold.debug.frame.guardVisible,'HOLD materializes surviving cover');
  const expose=await sample('05-expose',{phase:'desktop',clock:5.6,tier:1,actionId:'expose',cover:{count:0,capacity:2,guard:4,exposed:true}});
  check(expose.debug.frame.rakeVisible&&expose.pixels.nearWhite<.01,'EXPOSE produces a bounded rake without a white hotspot',expose.pixels.nearWhite);
  await sample('06-overload',{phase:'desktop',clock:6,tier:1,intent:{kind:'overload',progress:.72},reaction:{phase:'open',progress:.72,tier:'perfect',armed:true}});
  await sample('07-loop',{phase:'desktop',clock:7,tier:1,intent:{kind:'loop',progress:.7}});
  const comfort=await sample('08-reduced-motion',{phase:'desktop',clock:8,tier:2,reducedMotion:true,reduceFlash:true,intent:{kind:'overload',progress:.7}});
  const paused=await sample('09-paused',{phase:'desktop',clock:80,transition:.2,paused:true,intent:{kind:'loop',progress:1}},false);
  check(paused.pixels.hash===comfort.pixels.hash,'pause freezes actual rendered pixels',{before:comfort.pixels.hash,after:paused.pixels.hash});
  const stale=await page.evaluate(()=>window.__sourceDesktopSurface.accept({token:'source-desktop-fixture',revision:0,snapshot:{active:false,phase:'ended'}}));
  check(!stale,'late native revisions cannot erase current encounter');
  const reform=await sample('10-reformed',{phase:'reforming',clock:9,transition:1,cover:{count:2,capacity:2,guard:4}});
  check(reform.debug.frame.openness===0,'completing the movement reforms finite shell');
  await page.setViewport({width:640,height:480,deviceScaleFactor:2});
  const dense=await sample('11-small-dense',{phase:'desktop',clock:10,tier:2,cover:{count:0,capacity:1,guard:3},
    desktop:{width:640,height:480,scale:2,command:{x:0,y:345,width:640,height:135}}});
  check(dense.debug.width===640&&dense.debug.height===480&&dense.debug.dpr===2,'monitor resize updates logical dimensions and bounded dense rendering');
  check(dense.pixels.width===1280&&dense.pixels.height===960&&dense.pixels.bounds.maxY<690,'dense monitor body remains outside command island',dense.pixels.bounds);
  const canvasSize=await page.evaluate(()=>{const r=document.getElementById('source-desktop').getBoundingClientRect();return {width:r.width,height:r.height};});
  check(canvasSize.width===640&&canvasSize.height===480,'DPR does not enlarge the passive CSS surface',canvasSize);
  const ended=await sample('12-ended',{phase:'ended',active:false,paused:true},false);
  check(ended.pixels.transparent===1,'ending disposes the visual footprint while paused');
  check(errors.length===0,'no browser or shader errors',errors);
  assert.ok(checks.every(item=>item.passed),'renderer checks failed');
} catch(error) { failure=String(error?.stack||error); console.error(failure); }
finally {
  if(browser)await browser.close();
  await writeFile(join(out,'report.json'),JSON.stringify({url:base,kind:'passive-browser-renderer-fixture',checks,errors,frames,failure},null,2));
}
console.log(`REPORT ${join(out,'report.json')}`);
if(failure)process.exitCode=1;
