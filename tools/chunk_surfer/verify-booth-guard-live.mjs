// Actual opening lodge, shared Wrong Fold character asset, normal idle pose.
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from 'puppeteer-core';
const base=process.env.GAME_URL||'http://127.0.0.1:5308';
const out=process.env.OUT||'artifacts/booth-guard/live';
await mkdir(out,{recursive:true});
const errors=[],checks=[],frames=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser,page,profile,failure=null;
try{
  profile=await mkdtemp(join(tmpdir(),'chunk-booth-guard-'));
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
    userDataDir:profile,protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling','--disk-cache-size=1048576','--media-cache-size=1048576','--disable-gpu-shader-disk-cache']});
  page=await browser.newPage();await page.setCacheEnabled(false);await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>{
    Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
    const NativeSocket=window.WebSocket;
    class QuietSocket extends EventTarget{constructor(){super();this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){}}
    window.WebSocket=class extends NativeSocket{constructor(url,protocols){if(protocols==='vite-hmr')return new QuietSocket();super(url,protocols);}};
  });
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(/shader.*error|ERROR: 0:|character pose unavailable|character pack unavailable/i.test(m.text()))errors.push(m.text());});
  await page.goto(`${base}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
  await page.evaluate(async()=>{
    await window.__probe.testRun();window.__probe.tutSkip();
    const url=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/render/props3d.js')?.name;
    window.__boothRenderer=await import(url||'/src/render/props3d.js');
    window.__probe.setFlags(['van.closed','kit.fitted']);
    window.__probe.storyCapturePreset('arrival-lodge');
    window.__probe.warpCell(75.6,214,0);
    window.__probe.lookAtWorld(-Math.PI/2,-.02);
  });
  await page.waitForFunction(()=>window.__boothRenderer.characterStats().poses.some(p=>p.id==='yard-booth-guard-idle'&&p.mesh==='outskirts_fold_guard'),{timeout:90000});
  await sleep(900);
  async function capture(name){
    const state=await page.evaluate(()=>({characters:window.__boothRenderer.characterStats(),
      ids:window.__probe.props().renderedIds,scene:window.__scenes.top()?.id||null,view:window.__scenes.top()?.view?.()||null}));
    const guards=state.characters.poses.filter(p=>p.id?.startsWith('yard-booth-guard-'));
    assert.equal(guards.length,1,'exactly one physical guard is submitted');
    assert.equal(guards[0].mesh,'outskirts_fold_guard');assert.equal(guards[0].clip,'idle');
    assert.deepEqual(state.characters.poseErrors,[]);
    frames.push({name,guard:guards[0],scene:state.scene,sourceId:state.view?.line?.sourceId});
    await page.screenshot({path:`${out}/${name}.png`});return state;
  }
  await capture('01-opening-booth');checks.push('Opening booth draws the real Wrong Fold guard in normal idle, with one body and no pose errors.');
  await page.evaluate(()=>window.__probe.storyCapturePreset('booth-window-conversation'));
  await page.waitForFunction(()=>window.__scenes.top()?.id==='thought:cold-open',{timeout:15000});
  await sleep(900);await capture('02-conversation');
  const captured=new Set(['idle']);
  for(let n=0;n<200&&captured.size<3;n++){
    const state=await page.evaluate(()=>({view:window.__scenes.top()?.view?.(),poses:window.__boothRenderer.characterStats().poses}));
    const guard=state.poses.find(p=>p.id?.startsWith('yard-booth-guard-'));
    if(guard){const mode=guard.id.slice('yard-booth-guard-'.length);if(!captured.has(mode)){await capture(`03-${mode}`);captured.add(mode);}}
    const options=state.view?.pending?.options||[];
    if(options.length){
      const preferred=options.findIndex(o=>/keys|go in|keyring|continue|sign/i.test(o.text||o.label||''));
      const at=state.view.pending.index||0,index=preferred<0?options.length-1:preferred;
      for(let i=0;i<(index-at+options.length)%options.length;i++)await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Enter');await sleep(240);
  }
  assert.ok(captured.has('ledger')&&captured.has('handoff'),'normal shared guard must survive ledger and handoff dialogue states');
  checks.push('Real dialogue reaches ledger and handoff; both retain the same upright character.');
  assert.deepEqual(errors,[]);checks.push('No JavaScript, shader, asset or character-pose errors.');
}catch(e){failure=String(e?.stack||e);process.exitCode=1;console.error(failure);await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{
  try{
    await writeFile(`${out}/report.json`,JSON.stringify({passed:!failure,failure,checks,errors,frames,
      scope:'Chromium/Metal actual opening lodge and keyboard-driven dialogue from an authored checkpoint; not a complete opening playthrough.'},null,2));
    console.log(JSON.stringify({passed:!failure,checks,errors,frames:frames.map(f=>({name:f.name,guard:f.guard.id,clip:f.guard.clip}))},null,2));
  }finally{await browser?.close();if(profile)await rm(profile,{recursive:true,force:true});}
}
