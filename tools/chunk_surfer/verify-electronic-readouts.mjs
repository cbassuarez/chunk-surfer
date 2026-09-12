// Electronic typography acceptance, using production Canvas renderers and a
// disposable Chromium profile. State boards are explicit rendering fixtures;
// the final R / post-door checks exercise actual main.js scenes. No mic input,
// user browser profile, existing save, or native-gamepad evidence is involved.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';

const base=process.env.CHUNK_SURFER_URL||'http://127.0.0.1:5296';
const output=resolve(process.env.ELECTRONIC_READOUT_ARTIFACT_DIR||'artifacts/electronic-readouts');
const sizes=[
  {name:'wide',width:1280,height:760,deviceScaleFactor:1,scale:1},
  {name:'large-text-retina',width:960,height:600,deviceScaleFactor:2,scale:1.5},
];
const modes=['monitor','record','play','check','listen','browse'];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const inside=(a,b)=>a.x>=b.x-1e-7&&a.y>=b.y-1e-7&&a.x+a.w<=b.x+b.w+1e-7&&a.y+a.h<=b.y+b.h+1e-7;
await mkdir(output,{recursive:true});
// Omitting userDataDir makes Puppeteer create and remove its own fresh profile.
const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,protocolTimeout:60000,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required'],
});
const page=await browser.newPage(),errors=[],measurements=[],live=[];
page.on('pageerror',error=>errors.push(error.stack||error.message));
const shot=async name=>{const path=`${output}/${name}.png`;await page.screenshot({path});console.log('CAPTURE',name);return path;};

async function board(mode,size){
  const result=await page.evaluate(async ({mode})=>{
    const ui=await import('/src/render/ui.js'),r=await import('/src/render/recorder-view.js');
    const instrument=await import('/src/render/recorder-instrument.js'),controls=await import('/src/game/recorder-scene.js');
    const {monitorSnapshotForRms}=await import('/src/audio/monitor.js');
    const dimensions=ui.uiSize(),rect=r.recorderPanelRect(dimensions),rolling=mode==='record',playing=mode==='play';
    const state={recording:rolling,playing,browsing:mode==='browse',playableHere:true,tapes:2};
    const view={rect,mode,counter:'00:18',counterLabel:'TIME COUNTER',progress:.4,locationSeconds:45,
      levels:playing?{left:.54,right:.32}:null,meter:rolling?monitorSnapshotForRms(.17):null,
      roomMeter:mode==='check'?monitorSnapshotForRms(.12):null,note:'STUDIO B3 / ROOM MIC',
      check:{heard:true,line:'The room mic is working. This is not a take.'},
      guide:{history:[{who:'direction',text:'Kill the light and roll.'}],
        line:{who:'player',text:'The headphones settle against your ears.'},typing:false,
        pending:{kind:'branch',index:0,options:[{text:'ROLL SOUND'},{text:'CHECK THE ROOM'}]}},
      rows:[{ordinal:'01',label:'STUDIO B3',status:'PRINTED',playable:true},
        {ordinal:'02',label:'THE TUB',status:'CONTAMINATED',warn:true,playable:true}],selected:0,
      buttons:mode==='check'?null:rolling?r.recordingOverlayButtons({rolling:true}):
        {keys:controls.recorderKeys(state).map(key=>({...key,...controls.recorderControlState(key.id,state)}))},
    };
    const native=[];const original=CanvasRenderingContext2D.prototype.fillText;
    const canvas=document.querySelector('#plate>canvas'),metrics=ui.uiCellMetrics(),dpr=devicePixelRatio;
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
      if(this.canvas===canvas){const t=this.getTransform();native.push({text:String(text),x:(t.a*x+t.c*y+t.e)/(metrics.cellW*dpr),y:(t.b*x+t.d*y+t.f)/(metrics.cellH*dpr)});}
      return original.call(this,text,x,y,...rest);
    };
    let body,coldMs,samples=[];
    try{
      ui.uiClear();const start=performance.now();body=r.drawRecorderFace(view);coldMs=performance.now()-start;
      for(let i=0;i<12;i++){ui.uiClear();const start=performance.now();r.drawRecorderFace(view);samples.push(performance.now()-start);}
    }finally{CanvasRenderingContext2D.prototype.fillText=original;}
    const display=instrument.recorderFaceLayout(rect).displayRect;
    const nativeInside=native.filter(p=>p.x>=display.x&&p.x<=display.x+display.w&&p.y>=display.y&&p.y<=display.y+display.h);
    samples.sort((a,b)=>a-b);
    return {mode,dimensions,metrics,rect,body,display,hits:r.recorderHitRegions(view),nativeInside,
      nativePrintCalls:native.length,coldMs,warmP95Ms:samples.at(-1)};
  },{mode});
  assert.ok(inside(result.rect,{x:0,y:0,w:result.dimensions.cols,h:result.dimensions.rows}),`${mode}/${size.name} bezel fits`);
  assert.ok(inside(result.body,result.display),`${mode}/${size.name} body fits glass`);
  assert.deepEqual(result.nativeInside,[],`${mode}/${size.name}: no native type under glass`);
  assert.ok(result.nativePrintCalls>0,'physical legends are still printed, not converted to phosphor');
  const transport=result.hits.filter(hit=>hit.kind==='transport');
  if(mode!=='check')assert.deepEqual(transport.map(hit=>hit.id),['rec','stop','takes']);
  for(const hit of result.hits)assert.ok(inside(hit,hit.kind==='transport'?result.rect:result.body),`${mode}/${size.name} ${hit.id} fits its real region`);
  if(mode==='listen')assert.equal(result.hits.filter(hit=>hit.kind==='choice').length,2);
  measurements.push({size:size.name,...result,screenshot:await shot(`recorder-${mode}-${size.name}`)});
}

async function transcriptBoard(size){
  const result=await page.evaluate(async ()=>{
    const ui=await import('/src/render/ui.js'),p=await import('/src/render/presentation.js'),t=await import('/src/render/transcript.js');
    const dimensions=ui.uiSize(),w=Math.min(88,dimensions.cols-6),h=Math.min(24,dimensions.rows-3);
    const panel={x:(dimensions.cols-w)/2,y:(dimensions.rows-h)/2,w,h};
    const native=[];const original=CanvasRenderingContext2D.prototype.fillText;
    const canvas=document.querySelector('#plate>canvas'),metrics=ui.uiCellMetrics(),dpr=devicePixelRatio;
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
      if(this.canvas===canvas){const m=this.getTransform();native.push({text:String(text),x:(m.a*x+m.c*y+m.e)/(metrics.cellW*dpr),y:(m.b*x+m.d*y+m.f)/(metrics.cellH*dpr)});}
      return original.call(this,text,x,y,...rest);
    };
    let body,layout;
    try{
      ui.uiClear();
      p.withMachinePanel(panel.x,panel.y,panel.w,panel.h,{label:'MONITOR',source:'DIALOGUE TYPOGRAPHY',theme:'amber'},b=>{
        body=b;layout=t.layoutTranscript({history:[{who:'guard',text:'The receiver is working. Keep this channel clear.'},
          {who:'system',text:'Channel established'}],line:{who:'direction',text:'You reach for the switch, then stop.'},
          who:'direction',typed:200,lineAge:2,typing:false},
          {width:b.w-2,maxRows:Math.floor(b.h)-1,keep:3});
        t.drawTranscript(layout,{x:b.x+1,y:b.y,width:b.w-2,maxRows:Math.floor(b.h)-1});
      });
    }finally{CanvasRenderingContext2D.prototype.fillText=original;}
    const display=p.machinePanelAperture(panel.x,panel.y,panel.w,panel.h);
    return {dimensions,panel,body,display,roles:layout.blocks.map(b=>b.role.kind),directionRows:layout.blocks.flatMap(b=>b.rows).filter(r=>r.italic).length,
      nativeInside:native.filter(p=>p.x>=display.x&&p.x<=display.x+display.w&&p.y>=display.y&&p.y<=display.y+display.h)};
  });
  assert.ok(result.directionRows>0,'the actual uiItalicText path was exercised');
  assert.ok(result.roles.includes('system'),'the actual system transcript path was exercised');
  assert.deepEqual(result.nativeInside,[],'dialogue/system/direction text does not use a native display font');
  measurements.push({size:size.name,mode:'transcript-fixture',...result,screenshot:await shot(`dialogue-transcript-${size.name}`)});
}

try{
  await page.setViewport(sizes[0]);
  // A real HTML document is required: document.write over a text/javascript
  // response can leave Chromium's plain-text compositor showing source code.
  const fixtureUrl=`${base}/__electronic-readouts-fixture__.html`;
  const fixtureRequest=request=>request.url()===fixtureUrl
    ?request.respond({status:200,contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><style>html,body{margin:0;background:#080c09}#plate{position:relative;width:100vw;height:100vh}</style></head><body><div id="plate"></div></body></html>'})
    :request.continue();
  await page.setRequestInterception(true);page.on('request',fixtureRequest);
  await page.goto(fixtureUrl,{waitUntil:'domcontentloaded'});
  await page.evaluate(async ()=>{
    (await import('/src/render/ui.js')).uiInit(document.getElementById('plate'));
    await document.fonts.load('600 14px "Hardware Sans"');
  });
  for(const size of sizes){
    await page.setViewport(size);await page.evaluate(async scale=>(await import('/src/render/ui.js')).uiSetScale(scale),size.scale);
    await pause(100);
    for(const mode of modes)await board(mode,size);
    await transcriptBoard(size);
  }
  await page.setRequestInterception(false);page.off('request',fixtureRequest);

  // Use the current van-era probe flow, never the obsolete startup difficulty
  // selector. This profile's first run is disposable, not a player save.
  await page.setViewport(sizes[0]);
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
  await page.goto(`${base}/?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&nothink=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top()?.id,{timeout:60000});
  // Let the fresh-profile boot reach its gate before probing into a run. Its
  // late callbacks must not cover the live scene. Do not accept terms or start
  // lens calibration: the existing diagnostic testRun owns this fixture.
  await page.waitForFunction(()=>['eula','opening-credits','title'].includes(window.__scenes.top()?.id),{timeout:120000});
  if(await page.evaluate(()=>window.__scenes.top()?.id)==='opening-credits'){
    await page.evaluate(()=>window.__scenes.top().update(30));
    await page.waitForFunction(()=>window.__scenes.top()?.id==='title',{timeout:30000});
  }
  await page.evaluate(()=>{
    window.__probe.testRun();window.__probe.godWarpGetIn();window.__probe.tutSkip();
    window.__probe.setFlags(['bag.taken','map.taken','van.preparation.v1','title.shown','setup.levels','combat.trained','setup.waypoint',
      'setup.case.started','setup.case.opened','setup.case.skills-opened','setup.case.skills-done','setup.case.map-opened','setup.case.closed','setup.case.arrived']);
  });
  await pause(500);await page.keyboard.press('r');
  await page.waitForFunction(()=>window.__scenes.top()?.id==='recorder',{timeout:30000});
  for(const size of sizes){
    await page.setViewport(size);await page.evaluate(scale=>window.__chunkSurferDisplay.setUiScale(scale),size.scale);await pause(350);
    const state=await page.evaluate(()=>({scene:window.__scenes.top()?.id,state:window.__scenes.top()?.debugState?.()}));
    assert.equal(state.scene,'recorder');
    live.push({size:size.name,kind:'recorder-main-R',...state,screenshot:await shot(`live-recorder-${size.name}`)});
  }
  await page.keyboard.press('r');await page.waitForFunction(()=>window.__scenes.top()?.id!=='recorder',{timeout:30000});
  assert.equal(await page.evaluate(()=>window.__probe.think('post-door')),true);
  await page.waitForFunction(()=>window.__scenes.top()?.id==='thought:post-door',{timeout:30000});await pause(2000);
  for(const size of sizes){
    await page.setViewport(size);await page.evaluate(scale=>window.__chunkSurferDisplay.setUiScale(scale),size.scale);await pause(350);
    const state=await page.evaluate(()=>({scene:window.__scenes.top()?.id,view:window.__scenes.top()?.view?.()}));
    assert.equal(state.scene,'thought:post-door');assert.equal(state.view.who,'direction');
    live.push({size:size.name,kind:'post-door-main-thought',...state,screenshot:await shot(`live-dialogue-${size.name}`)});
  }
  assert.deepEqual(errors,[],'no page exceptions');
  await writeFile(`${output}/report.json`,JSON.stringify({
    scope:'Production recorder six-state rendering fixtures and shared system/direction transcript; actual R and post-door main.js scene integration. Disposable Chromium profile, probe-seeded progression; no native input/audio-perception claim.',
    sizes,measurements,live,pageErrors:errors,visualReview:'Screenshots require human/agent inspection; numeric assertions prove geometry and native-type exclusion, not appearance.',
  },null,2)+'\n');
  console.log(`PASS: ${measurements.length} production state boards, ${live.length} live scenes; zero native text inside fixture displays. ${output}/report.json`);
}catch(error){
  await shot('failure');
  await writeFile(`${output}/failure.json`,JSON.stringify({error:error.stack,measurements,live,pageErrors:errors},null,2)+'\n');
  console.error(error.stack);process.exitCode=1;
}finally{await browser.close();}
