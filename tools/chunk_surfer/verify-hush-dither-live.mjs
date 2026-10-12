// Actual world renderer acceptance; authored Source checkpoint, real GLB and GPU.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const base=process.env.HUSH_DITHER_URL||'http://127.0.0.1:5307';
const out=resolve(process.env.HUSH_DITHER_OUT||'/private/tmp/hush-dither-world');
const ordinary=process.env.HUSH_DITHER_SCENE==='ordinary';
await mkdir(out,{recursive:true});
const errors=[],checks=[];
let browser,page,failure=null,status=null,pixels=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless:true,protocolTimeout:120000,args:['--use-angle=metal','--disable-renderer-backgrounding',
      '--disable-background-timer-throttling','--autoplay-policy=no-user-gesture-required']});
  page=await browser.newPage();
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>{
    Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
    const NativeSocket=window.WebSocket;
    class FixtureSocket extends EventTarget{
      static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
      constructor(url){super();this.url=String(url);this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
      send(){}close(){this.readyState=3;}
    }
    window.WebSocket=class extends NativeSocket{
      constructor(url,protocols){if(protocols==='vite-hmr')return new FixtureSocket(url);super(url,protocols);}
    };
  });
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|WebGL.*context.*lost|feedback loop/i.test(m.text()))errors.push(m.text());});
  await page.goto(new URL('/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1',base).href,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
  await page.evaluate(async ordinary=>{
    window.__probe.testRun();window.__probe.tutSkip();
    const url=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/game/save.js')?.name;
    window.__hushSave=await import(url||'/src/game/save.js');
    if(ordinary){
      window.__probe.setPower('sp01',false);
      window.__probe.warpCell(33,35.8,0);
      window.__probe.setTorchBattery(1);window.__probe.setTorch(true);
      const at=window.__probe.pos();
      const candidates=Array.from({length:16},(_,i)=>{
        const angle=i*Math.PI/8,dx=Math.sin(angle),dy=-Math.cos(angle);
        let last=at;
        for(let step=1;step<=12;step++){
          const next={x:at.x+dx*step*.5,y:at.y+dy*step*.5};
          if(!window.__probe.canStep(last.x,last.y,next.x,next.y))return null;
          last=next;
        }
        return last;
      }).filter(Boolean);
      if(!candidates.length)throw new Error('No walkable ordinary-world Hush placement');
      const url=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/game/presence.js')?.name;
      const presence=await import(url||'/src/game/presence.js');
      presence.spawnAtCell(candidates[0].x,candidates[0].y,{sector:'ordinary-dither-review',gaitSeed:4417});
    }else window.__probe.sourcePreset('first-contact');
    const speech=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/game/speech.js')?.name;
    if(speech)(await import(speech)).clearSpeech?.();
  },ordinary);
  await page.waitForFunction(()=>window.__probe.hushBody().ready,{timeout:90000});
  await sleep(1800);
  await page.evaluate(()=>{
    const p=window.__probe.presence(),s=window.__probe.pos();
    window.__probe.lookAtWorld(Math.atan2(p.x-s.x,-(p.y-s.y)),0);
  });
  await sleep(600);
  status=await page.evaluate(()=>({body:window.__probe.hushBody(),presence:window.__probe.presence(),position:window.__probe.pos(),source:window.__probe.chunkSurf()}));
  assert.ok(status.body.ready&&status.body.geometry.draws>0,'actual Hush GLB must be drawn in the world');
  checks.push('Actual pressure-character.glb is loaded and drawn by the world renderer.');
  const result=await page.evaluate(async()=>{
    const stages=Object.fromEntries(['pressure-material','pressure-geometry','vfd'].map(name=>[name,window.__probe.sourceShoreCapture(name)]));
    const decoded=await Promise.all(Object.entries(stages).map(async([name,url])=>{
      const image=new Image();image.src=url;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      return[name,{width:image.width,height:image.height,data:ctx.getImageData(0,0,image.width,image.height).data}];
    }));
    const data=Object.fromEntries(decoded),mask=data['pressure-geometry'],raw=data['pressure-material'],encoded=data.vfd;
    let samples=0,changed=0,dark=0,light=0,edges=0;
    const rawColors=new Set(),recordedColors=new Set();
    const luma=(a,i)=>(a[i]*.2126+a[i+1]*.7152+a[i+2]*.0722)/255;
    for(let i=0;i<mask.data.length;i+=4){
      if(mask.data[i+3]<220||!(Math.floor(mask.data[i+2]/64)%2))continue;
      samples++;
      const a=luma(raw.data,i),b=luma(encoded.data,i);
      if(Math.abs(a-b)>.025)changed++;
      if(b<.12)dark++;if(b>.4)light++;
      if(i>=4&&mask.data[i-1]>220&&Math.abs(b-luma(encoded.data,i-4))>.25)edges++;
      rawColors.add(`${raw.data[i]},${raw.data[i+1]},${raw.data[i+2]}`);
      recordedColors.add(`${encoded.data[i]},${encoded.data[i+1]},${encoded.data[i+2]}`);
    }
    return{stages,pixels:{width:mask.width,height:mask.height,samples,changed:changed/Math.max(1,samples),
      dark:dark/Math.max(1,samples),light:light/Math.max(1,samples),edges,rawColors:rawColors.size,recordedColors:recordedColors.size}};
  });
  pixels=result.pixels;
  for(const[name,url]of Object.entries(result.stages))await writeFile(join(out,`${name}.png`),Buffer.from(url.split(',')[1],'base64'));
  await page.screenshot({path:join(out,ordinary?'ordinary-world.png':'source-world.png')});
  console.log(JSON.stringify({pixels,status:status.body},null,2));
  assert.ok(pixels.samples>100,'actual covered mesh pixels must be visible');
  assert.ok(pixels.changed>.15&&pixels.dark>.05&&pixels.light>.01&&pixels.edges>20,'the actual body must acquire distinct dark and lit marks');
  checks.push('Actual covered mesh pixels change from material shading into distinct dark and lit acquisition marks.');
  assert.deepEqual(errors,[],'no JavaScript, shader, context or framebuffer feedback errors');
  checks.push('No JavaScript, shader, context or framebuffer feedback errors.');
}catch(error){failure=String(error?.stack||error);console.error(failure);process.exitCode=1;if(page)await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});}
finally{
  await writeFile(join(out,'report.json'),JSON.stringify({passed:!failure,failure,checks,errors,pixels,status,
    scope:`Chromium/Metal actual ${ordinary?'ordinary building renderer, with a live Presence spawned along a walkable ray from the plant room':'Source first-contact checkpoint'} and real Hush GLB; pixel comparison uses same-frame raw material, covered geometry and shared acquisition buffers. Not a full playthrough.`},null,2));
  await browser?.close();
}
