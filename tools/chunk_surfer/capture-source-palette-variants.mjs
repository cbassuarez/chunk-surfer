// Isolated Source palette experiments: only the browser response is substituted.
// No gameplay source files, assets, saves, or renderer implementation are edited.
import puppeteer from 'puppeteer-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { SOURCE_PALETTE_VARIANTS, patchSourcePaletteModule } from '../../artifacts/source-palette-study/palette-recipes.mjs';

const out='artifacts/source-palette-study/variants';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,protocolTimeout:120000,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling'],
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const views=[['landing','first-contact',0,0],['middle','all-insights',.7,0],['doors','final',.65,0]];
const captures=[],errors=[],intercepts=[],files=[];
const chosenVariants=process.env.SOURCE_PALETTE_VARIANTS?.split(',')||['baseline',...Object.keys(SOURCE_PALETTE_VARIANTS)];
const chosenViews=process.env.SOURCE_PALETTE_VIEWS?.split(',')||views.map(v=>v[0]);
const previous=process.env.SOURCE_PALETTE_VARIANTS?JSON.parse(await readFile(`${out}/report.json`,'utf8')):null;
try{
  for(const variant of chosenVariants){
    const page=await browser.newPage();
    await page.setViewport({width:1440,height:900,deviceScaleFactor:.575});
    await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
    page.on('pageerror',error=>{errors.push({variant,error:String(error)});console.error('PAGEERROR',variant,String(error));});
    page.on('console',message=>{if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail/i.test(message.text()))errors.push({variant,error:message.text()});});
    await page.setRequestInterception(true);
    page.on('request',async request=>{
        const path=new URL(request.url()).pathname;
        if(variant==='baseline'||path!=='/src/render/r3d.js'){await request.continue();return;}
        try{
          const response=await fetch(request.url());
          const original=await response.text();
          const body=patchSourcePaletteModule(original,variant);
          intercepts.push({variant,url:request.url(),originalBytes:original.length,patchedBytes:body.length});
          await request.respond({status:200,contentType:'text/javascript',body,headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
        }catch(error){errors.push({variant,error:String(error)});await request.abort();}
    });
    const url=new URL(process.env.SOURCE_FIX_BASE||'http://127.0.0.1:5296/');
    for(const [key,value]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1',sam:'0',nothink:'1'}))url.searchParams.set(key,value);
    await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
    await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();});
    // Render directly at the export resolution, retaining the exact 1.6 aspect
    // of the full-size renderer. This is an actual GPU render, not image grading.
    await page.evaluate(()=>{const c=document.querySelector('canvas.r3d'),p=c.parentElement;p.style.width='736px';p.style.height='460px';window.dispatchEvent(new Event('resize'));});
    await sleep(600);
    for(const [name,preset,yaw,pitch]of views){
      if(!chosenViews.includes(name))continue;
      await page.evaluate(({name,preset,yaw,pitch})=>{
        window.__probe.sourcePreset(preset);
        if(name==='doors'){const at=window.__probe.edgeDoorApproach();window.__probe.sourceWarp(at.x,at.y+6);}
        window.__probe.lookAtWorld(yaw,pitch);
      },{name,preset,yaw,pitch});
      await sleep(650);
      if(await page.evaluate(()=>!!window.__probe.rec().light))await page.keyboard.press('f');
      await sleep(650);
      // Authored preset arrival can settle its own camera after the synchronous
      // warp. Reapply the comparison bearing only after that arrival settles.
      await page.evaluate(({yaw,pitch})=>window.__probe.lookAtWorld(yaw,pitch),{yaw,pitch});
      await sleep(500);
      const capture=await page.evaluate(()=>{
        const c=document.querySelector('canvas.r3d');
        return{data:c.toDataURL('image/jpeg',.80),width:c.width,height:c.height,pos:window.__probe.pos(),camera:window.__probe.lookAngles(),torch:!!window.__probe.rec().light,phase:window.__probe.chunkSurf().phase};
      });
      const bytes=Buffer.from(capture.data.split(',')[1],'base64'),{data,...meta}=capture;
      const path=`${out}/${variant}-${name}.jpg`;files.push({path,bytes});
      captures.push({variant,name,preset,yaw,pitch,path,bytes:bytes.length,...meta});
      console.log('CAPTURE',variant,name,JSON.stringify({width:meta.width,height:meta.height,bytes:bytes.length,pos:meta.pos,torch:meta.torch}));
    }
    await page.close();
  }
}finally{
  await browser.close();
  for(const file of files)await writeFile(file.path,file.bytes);
  const finalCaptures=previous?[...previous.captures.filter(c=>!captures.some(n=>n.variant===c.variant&&n.name===c.name)),...captures]:captures;
  await writeFile(`${out}/report.json`,JSON.stringify({scope:'Actual current dev renderer, Chromium/Metal, same cameras and geometry, torch off; palette experiments substitute only TEXT_SPACE_FRAG in intercepted dev module responses. Raw GPU canvas JPEG exports; no raster grading. Provisional experiments, not implemented palettes or native acceptance.',captures:finalCaptures,intercepts:[...(previous?.intercepts||[]),...intercepts],errors:[...(previous?.errors||[]),...errors]},null,2));
}
if(errors.length){console.error(errors);process.exitCode=1;}
