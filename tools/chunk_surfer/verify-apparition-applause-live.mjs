import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const OUT=path.resolve('artifacts/apparition-applause/evidence');fs.mkdirSync(OUT,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,protocolTimeout:180000,args:['--use-angle=swiftshader','--no-sandbox','--autoplay-policy=no-user-gesture-required',
    '--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows']});
const page=await browser.newPage();await page.setViewport({width:960,height:640});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  window.__diffusion={ready:Promise.resolve(),stats:{criticalBank:'calm'},activateBank:async()=>true,retry:async()=>true};
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await page.goto('http://127.0.0.1:5355/index.html?nomic=1&sam=0&skiptut=1&nodisplaynotice=1',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>typeof window.__probe?.testRun==='function',{timeout:180000});
  await page.waitForFunction(()=>!!window.__scenes?.top?.()?.id,{timeout:180000});
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
  fs.writeFileSync(path.join(OUT,'technical-setup.json'),JSON.stringify({setup,aim,disclosure:'Probe-aimed, lamp-pinned and forced continuity card for engineering capture. Four-minute quiet budget retained. Not participant evidence.'},null,2));
  console.log(JSON.stringify({phase:'aim',aim}));
  // Let the original restraint elapse while the real renderer observes pulses.
  for(let i=0;i<25;i++){
    await delay(10000);
    const status=await page.evaluate(()=>{const s=window.__probe.apparitionApplause();return{director:s.director,ready:s.audio?.ready,budget:s.sharedBudgetReady,blocked:s.blocked,light:window.__probe.apparitions().lightingState};});
    console.log(JSON.stringify({phase:'quiet',elapsedSeconds:(i+1)*10,...status}));
    if(status.budget)break;
  }
  await page.evaluate(()=>window.__probe.apparitionApplauseCaptureStart());
  await delay(2500);
  const before=await page.evaluate(()=>window.__probe.apparitionApplause().director.emitted);
  if(!before)await page.evaluate(index=>window.__probe.apparitionForce('absence',index),aim.index);
  let fired=false;
  for(let i=0;i<160;i++){
    await delay(100);
    fired=await page.evaluate(()=>window.__probe.apparitionApplause().director.emitted>0);
    if(fired)break;
  }
  await delay(5000);
  const capture=await page.evaluate(()=>window.__probe.apparitionApplauseCaptureStop());
  if(capture?.dataUrl){
    const {dataUrl,...metadata}=capture;
    fs.writeFileSync(path.join(OUT,'hall-treatment-synchronized.webm'),Buffer.from(dataUrl.split(',')[1],'base64'));
    fs.writeFileSync(path.join(OUT,'hall-treatment-synchronized.json'),JSON.stringify(metadata,null,2));
  }
  const snapshot=await page.evaluate(()=>window.__probe.apparitionApplause());
  fs.writeFileSync(path.join(OUT,'hall-runtime.json'),JSON.stringify({fired,before,snapshot,errors},null,2));
  await page.screenshot({path:path.join(OUT,'hall-runtime.png')});
  console.log(JSON.stringify({phase:'captured',fired,played:snapshot.audio?.played,errors,bytes:capture?.bytes}));
  if(!fired)throw new Error('No eligible cue fired; see real observation/budget trace.');
}catch(error){
  const state=await page.evaluate(()=>({where:window.__probe?.whereAmI?.(),gate:window.__probe?.apparitionGate?.(),apparitions:window.__probe?.apparitions?.(),scene:window.__scenes?.top?.()?.id,applause:window.__probe?.apparitionApplause?.()})).catch(()=>null);
  fs.writeFileSync(path.join(OUT,'live-failure.json'),JSON.stringify({error:String(error),state,errors},null,2));
  await page.screenshot({path:path.join(OUT,'live-failure.png')}).catch(()=>{});
  throw error;
}finally{await browser.close();}
