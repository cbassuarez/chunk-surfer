// Art-review captures for the Horizon crossing.
//
// The horizon is the one part of this game that cannot be reasoned about from
// the source: it is forty near-opaque slices of a baked recording composited
// back to front around a body standing inside them, and every question about it
// — is there a floor, can you see where the corridor went, is the tape a wall or
// a volume — is a question about what a frame actually looks like.
//
//   npx vite --port 5199 --host 127.0.0.1
//   node tools/chunk_surfer/verify-horizon.mjs
//
// TUNES is a JSON array of r3dHorizonTune patches, each with a `tag`, so a
// tuning sweep is one run and the PNGs are named by what produced them:
//
//   TUNES='[{"tag":"a","bore":0.9},{"tag":"b","bore":0.99}]' node tools/...
//
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE=process.env.BASE||'http://127.0.0.1:5199';
const OUT=path.resolve(process.env.OUT||'artifacts/horizon-review');
fs.mkdirSync(OUT,{recursive:true});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',protocolTimeout:600000,
  args:['--use-angle=metal','--no-sandbox','--autoplay-policy=no-user-gesture-required',
        '--disable-renderer-backgrounding','--disable-background-timer-throttling'],
});
const page=await browser.newPage();
await page.setViewport({width:1280,height:760});
await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  window.__diffusion={ready:Promise.resolve(),stats:{criticalBank:'calm'},activateBank:async()=>true,retry:async()=>true};
});
const errs=[];
page.on('pageerror',e=>errs.push('PAGEERROR: '+e));
page.on('console',m=>{const t=m.text();if(/shader|GLSL|compile|ERROR:/i.test(t))errs.push(t);});
const top=()=>page.evaluate(()=>window.__scenes?.top?.()?.id||null);
const wait=(fn,t=300000)=>page.waitForFunction(fn,{timeout:t});

await page.goto(`${BASE}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&nothink=1`,{waitUntil:'domcontentloaded',timeout:60000});
await wait(()=>!!window.__scenes?.top?.()?.id);
if(await top()==='eula'){await page.keyboard.press('Enter');await wait(()=>window.__scenes?.top?.()?.id!=='eula',30000);}
await wait(()=>window.__scenes?.top?.()?.id==='opening-credits');
await page.evaluate(()=>window.__scenes.top().update(30));
await wait(()=>window.__scenes?.top?.()?.id==='title',60000);
await page.evaluate(()=>window.__probe.testRun());
await wait(()=>window.__chunkParity?.().screen==='game',240000);
await sleep(1800);
for(let i=0;i<8;i++){
  const ready=await page.evaluate(()=>window.__chunkParity?.().screen==='game'&&!window.__scenes?.top?.()?.id);
  if(ready)break;
  await page.keyboard.press(i%2?'Escape':'Enter');await sleep(400);
}
if(process.env.GALLERY_REVIEW==='1'){
  const warped=await page.evaluate(()=>window.__probe.godWarpHook('academic-gallery'));
  await sleep(900);
  await page.evaluate(()=>{window.__probe.setTorchBattery(1);window.__probe.setTorch(true);window.__scenes?.clear?.();});
  for(const phase of ['in-the-water','returned']){
    const state=await page.evaluate(phase=>window.__probe.galleryEyesReview(phase),phase);
    await sleep(900);
    await page.screenshot({path:path.join(OUT,`gallery-${phase}.png`)});
    console.log('gallery',phase,JSON.stringify(state));
  }
  console.log('gallery-warp',warped,errs.length?errs.slice(0,10):'no shader errors');
  await browser.close();process.exit(0);
}
const TUNES=JSON.parse(process.env.TUNES||'[{}]');
for(const tune of TUNES){
await page.evaluate((t)=>window.__probe.horizonTune(t),tune);
const tag=tune.tag||'base';
for(const depth of [80,168]){
  const st=await page.evaluate((d)=>window.__probe.horizonPreset(d),depth);
  await sleep(1600);
  for(let i=0;i<6;i++){
    const ready=await page.evaluate(()=>!window.__scenes?.top?.()?.id);
    if(ready)break;
    await page.keyboard.press('Escape');await sleep(300);
  }
  await sleep(900);
  const frame=await page.evaluate(()=>({f:window.__probe.horizonFrame?.(),h:window.__probe.horizon?.()||null}));
  await page.screenshot({path:path.join(OUT,`horizon-${tag}-${String(depth).padStart(3,'0')}.png`)});
  if(depth===168&&process.env.BUST_UX==='1'){
    const ui=await page.evaluate(()=>{
      const seal=window.__probe.bustReliquary().seal;
      window.__scenes?.clear?.();
      window.__probe.sourceWarp(seal.x,seal.y+1.4,0);
      window.__probe.lookAtWorld(0,.34);
      const opened=window.__probe.bustReliquaryOfferReview();
      return{opened,top:window.__scenes?.top?.()?.id,view:window.__scenes?.top?.()?.view?.(),seal};
    });
    console.log('choice-ui',JSON.stringify(ui));
    await page.screenshot({path:path.join(OUT,'bust-choice.png')});
    const approach=await page.evaluate(()=>{
      const scene=window.__scenes.top();
      for(let i=0;i<24&&window.__scenes.top()===scene&&!scene.view().pending;i++){
        scene.update(10);scene.key({key:'Enter'});
      }
      const options=scene.view().pending;
      scene.key({key:'5'});
      return{options,top:window.__scenes.top()?.id||null,bust:window.__probe.bustReliquary()};
    });
    console.log('approach-ui',JSON.stringify({choices:approach.options,top:approach.top,sealReady:approach.bust.saved?.sealReady,route:approach.bust.saved?.decision}));
    await page.evaluate(({seal})=>{window.__probe.sourceWarp(seal.x,seal.y+1.4,0);window.__probe.lookAtWorld(0,.34);},ui);
    await page.keyboard.press('e');
    await sleep(800);
    const sealUi=await page.evaluate(()=>({top:window.__scenes.top()?.id||null,view:window.__scenes.top()?.view?.()||null,bust:window.__probe.bustReliquary()}));
    console.log('seal-ui',JSON.stringify({top:sealUi.top,node:sealUi.view?.nodeId,atSeal:sealUi.bust.atSeal,route:sealUi.bust.saved?.decision}));
    await page.screenshot({path:path.join(OUT,'bust-seal-choice.png')});
    const consent=await page.evaluate(()=>{
      const scene=window.__scenes.top();
      if(!scene||scene.id!=='finale')return{error:'seal dialogue did not open'};
      for(let i=0;i<24&&window.__scenes.top()===scene&&!scene.view().pending;i++){
        scene.update(10);scene.key({key:'Enter'});
      }
      const options=scene.view().pending;
      scene.key({key:'1'});
      return{options,top:window.__scenes.top()?.id||null,bust:window.__probe.bustReliquary(),frame:window.__probe.horizonFrame()};
    });
    console.log('consent-ui',JSON.stringify({error:consent.error,choices:consent.options,top:consent.top,decision:consent.bust?.saved?.decision,clip:consent.bust?.placement?.performance?.clip,road:consent.frame?.towerPath?.length}));
    await page.screenshot({path:path.join(OUT,'bust-consent.png')});
  }
  if(depth===168&&process.env.BUST_REVIEW==='1'){
    const view=await page.evaluate(()=>({seal:window.__probe.bustReliquary().seal,placement:window.__probe.bustReliquary().placement,frame:window.__probe.horizonFrame()}));
    console.log('bust',JSON.stringify(view));
    for(const [name,back,pitch,side] of [['full',16,.24,0],['three-quarter',11,.36,5],['near',5,.60,0],['face',5,.95,0],['seal',5,.14,0]]){
      await page.evaluate(({seal,back,pitch,side})=>{
        window.__probe.sourceWarp(seal.x+side,seal.y+back);
        window.__probe.lookAtWorld(side?-.25:0,pitch);
        window.__scenes?.clear?.();
      },{seal:view.seal,back,pitch,side});
      await sleep(900);
      await page.screenshot({path:path.join(OUT,`bust-${name}.png`)});
    }
    for(const [name,phase,advance,back,pitch] of [
      ['recognition-open','recognition',3,10,.38],
      ['recognition-settled','recognition',7,10,.38],
      ['recognition-face','recognition',10,5,.95],
      ['ritual-contact','ritual',1.25,7,.48],
      ['ritual-turn','ritual',2.5,9,.38],
      ['ritual-settled','ritual',1.25,10,.34],
    ]){
      const state=await page.evaluate(({phase,advance,seal,back,pitch})=>{
        const result=window.__probe.bustReliquaryReview(phase,advance);
        window.__probe.sourceWarp(seal.x,seal.y+back);
        window.__probe.lookAtWorld(0,pitch);
        window.__scenes?.clear?.();
        return {result,rig:window.__probe.horizon?.()?.bust?.rig};
      },{phase,advance,seal:view.seal,back,pitch});
      console.log('stage',name,JSON.stringify({clip:state.result?.placement?.performance?.clip,time:state.result?.placement?.performance?.time,eyes:state.result?.placement?.eyes,recognized:state.result?.saved?.recognized,lods:state.rig?.lods,drawLod:state.rig?.drawLod}));
      await sleep(600);
      await page.screenshot({path:path.join(OUT,`bust-${name}.png`)});
    }
    await page.evaluate(()=>window.__probe.bustReliquaryReturnReview(1));
    await sleep(700);
    await page.screenshot({path:path.join(OUT,'bust-return.png')});
  }
  console.log(tag,'depth',depth,'phase',st?.phase);
}
}
console.log(errs.length?('ERRORS:\n'+errs.slice(0,10).join('\n')):'no shader errors');
await browser.close();
