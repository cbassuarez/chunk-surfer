// Read-only actual-overworld references for a Source integration design study.
import puppeteer from 'puppeteer-core';
import {mkdir,readFile,writeFile}from'node:fs/promises';
const out='artifacts/source-overworld-study';await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling']});
const page=await browser.newPage(),errors=[],captures=[],files=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const selected=process.env.SOURCE_OVERWORLD_VIEWS?.split(',')||null;
const previous=selected?JSON.parse(await readFile(`${out}/report.json`,'utf8')):null;
await page.setViewport({width:1440,height:900,deviceScaleFactor:.575});
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
page.on('pageerror',error=>{errors.push(String(error));console.error('PAGEERROR',String(error));});
page.on('console',message=>{if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail/i.test(message.text()))errors.push(message.text());});
try{
  const url=new URL(process.env.SOURCE_FIX_BASE||'http://127.0.0.1:5296/');
  for(const[k,v]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1',sam:'0',nothink:'1'}))url.searchParams.set(k,v);
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();});
  for(const view of[
    {name:'loading-bay',hook:'loading-bay',yaw:Math.PI/2,pitch:0,lights:[false,true]},
    {name:'practice-wing',hook:'practice-wing',yaw:Math.PI,pitch:0,lights:[false,true]},
    {name:'chapel',hook:'chapel',yaw:0,pitch:0,lights:[false,true]},
    {name:'front-atrium',hook:'front-atrium',yaw:Math.PI,pitch:0,lights:[true]},
    {name:'concert-hall',hook:'concert-hall',yaw:Math.PI/2,pitch:0,lights:[true]},
    {name:'loading-bay-outward',hook:'loading-bay',yaw:Math.PI*1.5,pitch:0,lights:[false]},
    {name:'first-lift-entry',preset:'first-lift',yaw:0,pitch:0,offset:{x:18,y:0},lights:[false,true]},
    {name:'first-lift-outward',preset:'first-lift',yaw:Math.PI+.5,pitch:-.12,offset:{x:18,y:0},lights:[false]},
    {name:'source-proper',preset:'first-contact',yaw:0,pitch:0,lights:[false]},
  ]){
    if(selected&&!selected.includes(view.name))continue;
    await page.evaluate(async({hook,preset,offset})=>{
      if(hook){if(!await window.__probe.godWarpHook(hook))throw new Error('Hook failed '+hook);}
      else{window.__probe.sourcePreset(preset);if(offset){const p=window.__probe.pos();window.__probe.sourceWarp(p.x+offset.x,p.y+offset.y);}}
    },view);
    await sleep(1100);
    for(const torch of view.lights){
      if(await page.evaluate(()=>!!window.__probe.rec().light)!==torch)await page.keyboard.press('f');
      await page.evaluate(({yaw,pitch})=>window.__probe.lookAtWorld(yaw,pitch),view);await sleep(650);
      const result=await page.evaluate(()=>{
        const c=document.querySelector('canvas.r3d');
        return{data:c.toDataURL('image/jpeg',.84),webp:c.toDataURL('image/webp',.78),width:c.width,height:c.height,pos:window.__probe.pos(),camera:window.__probe.lookAngles(),torch:!!window.__probe.rec().light,world:window.__probe.world(),top:window.__scenes?.top()?.id||null,lighting:window.__probe.r3dLighting?.(),pixelMesh:window.__chunkSurferPixelMesh?.status?.(),shore:window.__probe.sourceShoreView?.()};
      });
      const{data,webp,...meta}=result,bytes=Buffer.from(data.split(',')[1],'base64'),path=`${out}/${view.name}-${torch?'torch-on':'torch-off'}.jpg`,webpBytes=Buffer.from(webp.split(',')[1],'base64'),webpPath=`${out}/${view.name}-${torch?'torch-on':'torch-off'}.webp`;
      files.push({path,bytes},{path:webpPath,bytes:webpBytes});captures.push({...view,lights:undefined,path,bytes:bytes.length,webpPath,webpBytes:webpBytes.length,...meta});
      console.log('CAPTURE',path,JSON.stringify({pos:meta.pos,camera:meta.camera,torch:meta.torch,world:meta.world,bytes:bytes.length}));
    }
  }
}finally{
  await browser.close();
  for(const file of files)await writeFile(file.path,file.bytes);
  const finalCaptures=previous?[...previous.captures.filter(c=>!captures.some(n=>n.name===c.name&&n.torch===c.torch)),...captures]:captures;
  await writeFile(`${out}/report.json`,JSON.stringify({scope:'Current dev5296 actual renderer, Chromium/Metal, native736×460 JPEG. Authored God hooks and fixed diagnostic cameras; Source first-lift review offset puts eye on actual entry apron. RawGPUcanvas excludes UI overlay only; no image grading, palette changes, production edits, or full-run/native acceptance.',captures:finalCaptures,errors:[...(previous?.errors||[]),...errors]},null,2));
}
if(errors.length)process.exitCode=1;
