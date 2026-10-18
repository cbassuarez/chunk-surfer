import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const OUT=path.resolve('artifacts/apparition-applause/evidence');fs.mkdirSync(OUT,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:process.env.APPLAUSE_HEADFUL!=='1',userDataDir:process.env.APPLAUSE_TEST_PROFILE||undefined,
  protocolTimeout:180000,args:['--use-angle=swiftshader','--no-sandbox','--autoplay-policy=no-user-gesture-required',
    '--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows']});
const page=await browser.newPage();await page.setViewport({width:1024,height:640,deviceScaleFactor:.75});
await page.setCacheEnabled(false);
console.log(JSON.stringify({phase:'browser-launched'}));
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  window.__diffusion={ready:Promise.resolve(),stats:{criticalBank:'calm'},activateBank:async()=>true,retry:async()=>true};
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await page.goto('http://127.0.0.1:5355/index.html?nomic=1&sam=0&skiptut=1&nodisplaynotice=1',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>typeof window.__probe?.apparitionApplauseStudyStart==='function',{timeout:60000});
  await page.waitForFunction(()=>!!window.__scenes?.top?.()?.id,{timeout:30000});
  if(await page.evaluate(()=>window.__scenes?.top?.()?.id==='eula'))throw new Error('This browser profile needs normal legal entry; the verifier cannot accept the EULA.');
  await page.keyboard.press('Enter');
  await page.evaluate(async()=>{
    await window.__chunkSurferDisplay?.setWindowPreset('960x600');
    await window.__chunkSurferDisplay?.setRenderScale(.5);
  });
  // A facilitator must enter the game normally in a previously accepted test
  // profile. This verifier does not dismiss or bypass legal entry screens.
  const setup=await page.evaluate(()=>window.__probe.apparitionApplauseStudyStart({condition:'treatment',participantId:'technical-forced-capture',seed:'hall-first-encounter-v1'}));
  console.log(JSON.stringify({phase:'setup',setup}));
  await page.waitForFunction(()=>window.__probe.apparitions().compositionId==='hall-aisle-breadth',{timeout:30000});
  const aim=await page.evaluate(()=>{
    const p=window.__probe,a=p.apparitions();
    p.apparitionCaptureLight(a.lightId);
    const index=Math.max(0,a.bodies.findIndex(b=>!b.shadowOnly));
    p.lookAtWorld(a.bearings[index],a.pitches[index]);
    return{lightId:a.lightId,index:a.bodies[index]?.index,body:a.bodies[index]};
  });
  fs.writeFileSync(path.join(OUT,'technical-setup.json'),JSON.stringify({setup,aim,disclosure:'Probe-aimed, lamp-pinned and forced continuity card, followed by an actual held S key for engineering capture. Four-minute quiet budget retained;960x600 display at0.5 render scale and0.75 device scale; full effects. Not participant evidence.'},null,2));
  console.log(JSON.stringify({phase:'aim',aim}));
  // Warm the capture before the protected quiet boundary. Initial WebGL readback
  // may discard observation warmth; the ordinary scheduler must re-earn it.
  let recording=false;
  for(let i=0;i<25;i++){
    await delay(10000);
    const status=await page.evaluate(()=>{const s=window.__probe.apparitionApplause();return{director:s.director,ready:s.audio?.ready,budget:s.sharedBudgetReady,blocked:s.blocked,light:window.__probe.apparitions().lightingState};});
    console.log(JSON.stringify({phase:'quiet',elapsedSeconds:(i+1)*10,...status}));
    if(!recording&&i>=19){
      await page.evaluate(()=>window.__probe.apparitionApplauseCaptureStart());
      recording=true;
    }
    if(status.budget)break;
  }
  if(!recording)throw new Error('Capture did not warm before the opportunity.');
  const before=await page.evaluate(()=>window.__probe.apparitionApplause().director.emitted);
  if(!before)await page.evaluate(index=>window.__probe.apparitionForce('absence',index),aim.index);
  await page.waitForFunction(()=>!!window.__probe.apparitionApplause().director.pending,{timeout:10000});
  await delay(250);
  const stationary=await page.evaluate(()=>({nowMs:performance.now(),state:window.__probe.apparitionApplause(),position:window.__probe.whereAmI()}));
  if(stationary.state.director.emitted)throw new Error('A stationary player received the action-dependent cue.');
  await page.keyboard.down('s');
  let fired=false;
  try{
    await page.waitForFunction(()=>window.__probe.apparitionApplause().director.emitted>0,{timeout:2500});
    fired=true;
  }finally{
    await page.keyboard.up('s');
  }
  const reaction=await page.evaluate(()=>({nowMs:performance.now(),position:window.__probe.whereAmI()}));
  await delay(4500);
  const capture=await page.evaluate(()=>window.__probe.apparitionApplauseCaptureStop());
  if(capture?.dataUrl){
    const {dataUrl,...metadata}=capture;
    const marker=dataUrl.indexOf(';base64,');
    if(marker<0)throw new Error('Capture has no base64 payload.');
    const bytes=Buffer.from(dataUrl.slice(marker+8),'base64');
    if(bytes.length!==capture.bytes)throw new Error('Capture byte count does not match the browser blob.');
    fs.writeFileSync(path.join(OUT,'hall-treatment-synchronized.webm'),bytes);
    fs.writeFileSync(path.join(OUT,'hall-treatment-synchronized.json'),JSON.stringify(metadata,null,2));
  }
  const snapshot=await page.evaluate(()=>window.__probe.apparitionApplause());
  fs.writeFileSync(path.join(OUT,'hall-runtime.json'),JSON.stringify({fired,before,stationary,reaction,snapshot,errors,setup,aim},null,2));
  await page.screenshot({path:path.join(OUT,'hall-runtime.png')});
  console.log(JSON.stringify({phase:'captured',fired,played:snapshot.audio?.played,errors,bytes:capture?.bytes}));
  if(!fired)throw new Error('No eligible cue fired; see real observation/budget trace.');
}catch(error){
  const state=await page.evaluate(()=>({where:window.__probe?.whereAmI?.(),gate:window.__probe?.apparitionGate?.(),apparitions:window.__probe?.apparitions?.(),scene:window.__scenes?.top?.()?.id,applause:window.__probe?.apparitionApplause?.()})).catch(()=>null);
  fs.writeFileSync(path.join(OUT,'live-failure.json'),JSON.stringify({error:String(error),state,errors},null,2));
  await page.screenshot({path:path.join(OUT,'live-failure.png')}).catch(()=>{});
  throw error;
}finally{await browser.close();}
// Decode only after the owned render process has stopped: one compute worker.
execFileSync('ffmpeg',['-v','error','-y','-copyts','-i',path.join(OUT,'hall-treatment-synchronized.webm'),
  '-map','0','-c','copy','-map_metadata','0',path.join(OUT,'hall-treatment-preview.webm')]);
execFileSync('python3',[path.join(OUT,'analyze-capture.py')],{stdio:'inherit'});
