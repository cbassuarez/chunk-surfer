// Real window-media renderer, with the Tauri transport mocked in Chrome.
// This checks native pane content/shaders, not macOS window placement/focus.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.GAME_URL||'http://127.0.0.1:5203';
const out='artifacts/practice-windows';await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--no-sandbox','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const errors=[];
try {
  const panes=[];
  for(let index=0;index<4;index++){
    const page=await browser.newPage();page.on('pageerror',error=>{errors.push(String(error));console.error('PANE ERROR',String(error));});
    page.on('console',message=>{if(message.type()==='error')console.error('PANE CONSOLE',message.text());});
    await page.setViewport({width:index<2?280:220,height:index<2?280:124,deviceScaleFactor:2});
    await page.evaluateOnNewDocument(index=>{
      let serial=0;const callbacks=new Map(),listeners=new Map();window.__paneEvents=[];
      window.__TAURI_INTERNALS__={
        metadata:{currentWindow:{label:`window-media-${index+1}`}},
        transformCallback:callback=>{callbacks.set(++serial,callback);return serial;},
        invoke:async(command,args)=>{
          if(command==='plugin:event|listen'){listeners.set(args.event,args.handler);return args.handler;}
          if(command==='plugin:event|emit')window.__paneEvents.push(args);
          return true;
        },
      };
      window.__deliverPane=payload=>callbacks.get(listeners.get('window-media-score'))?.({payload});
      window.__paneListening=()=>listeners.has('window-media-score');
    },index);
    await page.goto(`${base}/window-media.html`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__paneListening?.());panes.push(page);
  }
  let revision=0;
  for(const move of ['hold','expose','monitor','playback']){
    for(let index=0;index<4;index++){
      const page=panes[index];
      const content=await page.evaluate(async({move,index,revision})=>{
        const {compilePracticeCuePlan}=await import('/src/platform/window-choreography.js');
        const {drawPracticeRebus}=await import('/src/render/practice-rebus.js');
        const {createPaneScoreEnvelope}=await import('/src/platform/window-composition.js');
        const canvas=document.createElement('canvas');canvas.width=560;canvas.height=560;
        drawPracticeRebus(canvas.getContext('2d'),0,0,560,560,`${move}:${index===0?'left':'right'}`);
        const plan=compilePracticeCuePlan({id:`practice:${move}`,cycle:2,parts:[`${move}:left`,`${move}:right`]},
          {clueTokens:['snapshot-left','snapshot-right'],epochMs:Date.now()});
        const surface=plan.surfaces[index];
        const envelope=createPaneScoreEnvelope(plan,surface.id,{targetLabel:`window-media-${index+1}`,sessionToken:'practice-render-test',revision,
          snapshotData:index<2?canvas.toDataURL('image/png'):null});
        window.__deliverPane(envelope);
        return surface.content;
      },{move,index,revision:++revision});
      await page.waitForFunction(()=>document.getElementById('media').dataset.renderer==='webgl2');
      await page.waitForFunction(revision=>Number(document.documentElement.dataset.revision)===revision,{},revision);
      if(index<2)await page.waitForFunction(()=>document.getElementById('fallback').complete&&document.getElementById('fallback').naturalWidth>0);
      await new Promise(resolve=>setTimeout(resolve,index<2?180:800));
      await page.screenshot({path:`${out}/${index<2?`${move}-${index+1}`:`nvme-${index-1}`}.png`});
      assert.ok(content.kind===(index<2?'snapshot':'video'));
      assert.ok(await page.evaluate(()=>window.__paneEvents.some(event=>event.event==='window-media-accepted')));
    }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: all eight puzzle halves and both NVMe footage panes rendered through window-media WebGL; no module/shader errors. Native transport mocked.');
} finally {await browser.close();}
