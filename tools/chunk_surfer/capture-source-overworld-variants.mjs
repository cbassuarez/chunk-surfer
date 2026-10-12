// Isolated Source/overworld integration experiments; renderer responses only.
import puppeteer from 'puppeteer-core';
import {mkdir,readFile,writeFile}from'node:fs/promises';
import {SOURCE_OVERWORLD_VARIANTS,patchSourceOverworldModule,patchSourceOverworldRuntime}from'../../artifacts/source-overworld-study/overworld-recipes.mjs';
const out='artifacts/source-overworld-study/variants';await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),captures=[],errors=[],intercepts=[],files=[];
const views=[['landing','first-contact',0],['middle','all-insights',.7],['doors','final',.65]];
const selectedVariants=process.env.SOURCE_OVERWORLD_VARIANTS?.split(',')||Object.keys(SOURCE_OVERWORLD_VARIANTS);
const selectedViews=process.env.SOURCE_OVERWORLD_VIEWS?.split(',')||views.map(v=>v[0]);
const previous=process.env.SOURCE_OVERWORLD_MERGE?JSON.parse(await readFile(`${out}/report.json`,'utf8')):null;
try{
  for(const variant of selectedVariants){
    const page=await browser.newPage();await page.setViewport({width:1440,height:900,deviceScaleFactor:.575});
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
    page.on('pageerror',error=>{errors.push({variant,error:String(error)});console.error('PAGEERROR',variant,String(error));});
    page.on('console',message=>{if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail/i.test(message.text()))errors.push({variant,error:message.text()});});
    await page.setRequestInterception(true);
    page.on('request',async request=>{
      const modulePath=new URL(request.url()).pathname;
      if(modulePath==='/@vite/client'){
        const response=await fetch(request.url()),original=await response.text();
        // Preserve Vite's real CSS/runtime exports while fixing the browser
        // experiment to one response snapshot during concurrent design writes.
        await request.respond({status:200,contentType:'text/javascript',body:original.replaceAll('location.reload()','console.info("Study retained its fixed renderer snapshot")'),headers:{'Cache-Control':'no-store'}});return;
      }
      if(!['/src/render/r3d.js','/src/game/source-space-runtime.js'].includes(modulePath)){await request.continue();return;}
      try{
        const response=await fetch(request.url()),original=await response.text(),body=modulePath==='/src/render/r3d.js'?patchSourceOverworldModule(original,variant):patchSourceOverworldRuntime(original);
        intercepts.push({variant,url:request.url(),originalBytes:original.length,patchedBytes:body.length});
        await request.respond({status:200,contentType:'text/javascript',body,headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
      }catch(error){errors.push({variant,error:String(error)});await request.abort();}
    });
    const url=new URL(process.env.SOURCE_FIX_BASE||'http://127.0.0.1:5296/');
    for(const[k,v]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1',sam:'0',nothink:'1'}))url.searchParams.set(k,v);
    await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
    await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();});
    for(const[name,preset,yaw]of views){
      if(!selectedViews.includes(name))continue;
      await page.evaluate(({name,preset})=>{window.__probe.sourcePreset(preset);if(name==='doors'){const at=window.__probe.edgeDoorApproach();window.__probe.sourceWarp(at.x,at.y+6);}},{name,preset});
      await sleep(1100);
      if(await page.evaluate(()=>!!window.__probe.rec().light))await page.keyboard.press('f');
      await page.evaluate(yaw=>window.__probe.lookAtWorld(yaw,0),yaw);await sleep(650);
      const result=await page.evaluate(()=>{const c=document.querySelector('canvas.r3d');return{data:c.toDataURL('image/jpeg',.80),webp:c.toDataURL('image/webp',.78),width:c.width,height:c.height,pos:window.__probe.pos(),camera:window.__probe.lookAngles(),torch:!!window.__probe.rec().light,phase:window.__probe.chunkSurf().phase,pixelMesh:window.__chunkSurferPixelMesh?.status?.()};});
      const{data,webp,...meta}=result,bytes=Buffer.from(data.split(',')[1],'base64'),path=`${out}/${variant}-${name}.jpg`,webpBytes=Buffer.from(webp.split(',')[1],'base64'),webpPath=`${out}/${variant}-${name}.webp`;
      files.push({path,bytes},{path:webpPath,bytes:webpBytes});captures.push({variant,label:SOURCE_OVERWORLD_VARIANTS[variant].label,name,preset,path,bytes:bytes.length,webpPath,webpBytes:webpBytes.length,...meta});
      console.log('CAPTURE',variant,name,JSON.stringify({width:meta.width,height:meta.height,bytes:bytes.length,pos:meta.pos,camera:meta.camera,torch:meta.torch}));
    }
    await page.close();
  }
}catch(error){
  errors.push({fatal:String(error?.stack||error)});
}finally{
  await browser.close();for(const file of files)await writeFile(file.path,file.bytes);
  const finalCaptures=previous?[...previous.captures.filter(c=>!captures.some(n=>n.variant===c.variant&&n.name===c.name)),...captures]:captures;
  await writeFile(`${out}/report.json`,JSON.stringify({scope:'Actual current dev5296 Source geometry, rawGPU736×460 JPEGs, Chromium/Metal, same cameras and torchOFF. Isolated response substitutions inside TEXT_SPACE_FRAG approximate shared overworld engraving/material roles. These previews do not run the full pixelmesh acquisition/history pipeline. Exactblackdoor mask and Pressure pass remain after the experiment. No production source edits or native/full-run acceptance.',captures:finalCaptures,intercepts:[...(previous?.intercepts||[]),...intercepts],priorAttempts:previous?.errors?.length?[...(previous.priorAttempts||[]),{errors:previous.errors}]:previous?.priorAttempts||[],errors},null,2));
}
if(errors.length)console.error(errors);
// The intercepted local fetch pool can retain idle sockets after Chrome exits.
// All captures and diagnostics are flushed above; end this disposable helper.
process.exit(errors.length?1:0);
