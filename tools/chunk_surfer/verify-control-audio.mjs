// Production input/graph checks plus offline renders of the actual cue engine.
// Uses a disposable God run and simulated controller; never requests a mic.
import puppeteer from 'puppeteer-core';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5214',out='artifacts/control-audio';
await mkdir(out,{recursive:true});
const bundle=await build({stdin:{contents:"export {createControlCueEngine} from './src/audio/control-cue-engine.js'; export {CONTROL_RECIPES} from './src/audio/vendor/cuelume-mechanical.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let page;
try{
 page=await browser.newPage();const errors=[],checks=[];
 page.on('pageerror',e=>errors.push(String(e)));await page.setViewport({width:1280,height:760});
 await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>window.__controlPad?[window.__controlPad]:[]});
  window.__controlContexts=[];
  const Audio=window.AudioContext;
  window.AudioContext=new Proxy(Audio,{construct(target,args){const ctx=Reflect.construct(target,args);window.__controlContexts.push(ctx);return ctx;}});
 });
 await page.goto(`${base}/?nomic=1&sam=0&progresslab=1&skiptut=1&nodisplaynotice=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top()?.id);
 await page.evaluate(()=>{
  window.__probe.testRun();window.__probe.godWarpGetIn();window.__probe.tutSkip();
  window.__probe.setFlags(['bag.taken','title.shown','setup.levels','combat.trained','setup.waypoint','setup.case.started','setup.case.opened','setup.case.skills-opened','setup.case.skills-done','setup.case.map-opened','setup.case.closed','setup.case.arrived',
   'rig.machine','rig.ears','rig.power','rig.fork','rig.bent','rig.radio','rig.voice']);
 });
 await page.waitForFunction(()=>window.__probe.radio().call.status==='calling',{timeout:15000});
 const audio=()=>page.evaluate(()=>window.__probe.audio().uiCues);
 assert.equal((await audio()).connected,true);assert.equal(await page.evaluate(()=>window.__controlContexts.length),1);checks.push('one game AudioContext, shared interface bus');
 await page.keyboard.press('v');await page.waitForFunction(()=>window.__scenes.top()?.id==='radio:initial_checkin');
 for(let n=0;n<9;n++){
  if(await page.evaluate(()=>!!window.__scenes.top()?.view?.().pending?.options?.length))break;
  await page.keyboard.press('Enter');await sleep(220);
 }
 const viewport=await page.evaluate(()=>window.__scenes.top().view().viewport);
 let before=(await audio()).played;await page.keyboard.press('ArrowDown');
 let events=(await audio()).history;assert.ok(events.some(e=>e.name==='tick'&&e.profile==='radio'));assert.ok((await audio()).played>before);
 await page.screenshot({path:`${out}/radio-controls.png`});
 await page.keyboard.press('Enter');assert.ok((await audio()).history.some(e=>e.name==='toggle'&&e.profile==='radio'));
 checks.push('radio choice navigation and accepted confirmation');await page.keyboard.press('v');await sleep(200);
 await page.keyboard.press('r');await page.waitForFunction(()=>window.__scenes.top()?.id==='recorder');
 before=(await audio()).played;await page.keyboard.press('Tab');await sleep(150);
 events=(await audio()).history;assert.ok(events.some(e=>e.name==='latch'&&e.scope==='recorder'));assert.ok(events.some(e=>e.name==='release'&&e.scope==='recorder:takes'));
 assert.equal((await audio()).played-before,3,'one press, one latch, one release; shortcut hints are silent');
 assert.ok(events.every(e=>!e.scope.startsWith('prompt:')),'hint animations never add duplicate audio');
 checks.push('recorder keyboard press, latch, release');
 const point=await page.evaluate(size=>{
  const hit=window.__scenes.top().debugState().hitRegions.find(r=>r.kind==='transport'&&r.index===1),rect=document.getElementById('map').getBoundingClientRect();
  return{x:rect.left+(hit.x+hit.w/2)/size.cols*rect.width,y:rect.top+(hit.y+hit.h/2)/size.rows*rect.height};
 },viewport);
 await page.mouse.move(point.x,point.y);await sleep(100);before=(await audio()).played;
 await page.mouse.move(point.x+1,point.y+1);await sleep(100);assert.equal((await audio()).played,before);
 await page.mouse.click(point.x,point.y);assert.equal((await audio()).history.at(-1).name,'refuse');checks.push('pointer hover is stable; disabled STOP refuses');
 await page.screenshot({path:`${out}/recorder-controls.png`});
 await page.evaluate(()=>{window.__controlPad={id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};});
 await sleep(250);before=(await audio()).played;
 await page.evaluate(()=>window.__controlPad.buttons[0]={pressed:true,value:1,touched:true});await sleep(100);
 await page.evaluate(()=>window.__controlPad.buttons[0]={pressed:false,value:0,touched:false});
 assert.ok((await audio()).played>before);assert.equal((await audio()).history.at(-1).name,'refuse');checks.push('controller and pointer use the same refusal');
 await page.evaluate(()=>{window.__controlPad=null;window.__chunkSurferDesktopMenu.dispatch('mute');});
 assert.equal((await audio()).global,0);assert.equal((await audio()).voices,0);
 before=(await audio()).played;await page.keyboard.press('Tab');assert.equal((await audio()).played,before);
 await page.evaluate(()=>window.__chunkSurferDesktopMenu.dispatch('mute'));await sleep(200);
 assert.equal((await audio()).voices,0);assert.equal((await audio()).global,1);
 checks.push('desktop mute silences real controls; unmute does not replay them');
 await page.evaluate(()=>{window.__controlPad=null;window.dispatchEvent(new Event('blur'));});
 assert.equal((await audio()).voices,0);assert.equal((await audio()).focused,false);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await sleep(200);assert.equal((await audio()).voices,0);checks.push('blur cancels voices; focus replays nothing');
 assert.equal(await page.evaluate(()=>window.__probe.setRecording(true).recording),true);
 await page.keyboard.press('Tab');
 assert.equal((await audio()).history.at(-1).quiet,true);checks.push('live recording uses reduced interface level');
 await page.evaluate(()=>window.__probe.setRecording(false));
 await sleep(250);assert.equal((await audio()).voices,0);assert.equal((await audio()).pending,0);
 checks.push('completed controls release every voice; shortcut hints stay silent');
 await page.keyboard.press('r');await page.keyboard.press('Escape');
 await page.waitForFunction(()=>window.__scenes.top()?.id==='pause');
 before=(await audio()).played;await page.keyboard.press('ArrowDown');
 assert.ok((await audio()).played>before);assert.equal((await audio()).history.at(-1).name,'tick');
 checks.push('pause keeps the interface bus audible while gameplay is stopped');
 await sleep(250);
 assert.deepEqual(errors,[]);
 const live=await audio();
 // Render every published recipe through real Web Audio nodes. The proxy only
 // allows scheduling before OfflineAudioContext starts; synthesis is unchanged.
 const rendered=await page.evaluate(async source=>{
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const mod=await import(url);URL.revokeObjectURL(url);
  const output=[];
  for(const name of Object.keys(mod.CONTROL_RECIPES)){
   const ctx=new OfflineAudioContext(1,16800,48000);
   const adapter=new Proxy(ctx,{get(t,k){if(k==='state')return'running';const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});
   const engine=mod.createControlCueEngine({context:adapter,destination:ctx.destination});engine.play(name);
   const buffer=await ctx.startRendering(),samples=Array.from(buffer.getChannelData(0));
   const peak=Math.max(...samples.map(Math.abs)),rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);
   output.push({name,peak,rms,samples});engine.dispose();
  }
  return output;
 },bundle.outputFiles[0].text);
 const total=rendered.length*(16800+9600),wave=Buffer.alloc(44+total*2);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(48000,24);wave.writeUInt32LE(96000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(total*2,40);
 let offset=44;for(const cue of rendered){assert.ok(cue.peak>.001&&cue.peak<.2,`${cue.name} peak ${cue.peak}`);for(const v of cue.samples){wave.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),offset);offset+=2;}offset+=9600*2;}
 await writeFile(`${out}/control-palette.wav`,wave);checks.push('all 13 recipes render audible finite signals below peak limit');
 const report={checks,errors,live,recipes:rendered.map(({samples,...row})=>row),scope:'Production browser input with a disposable God run and simulated controller. Real OfflineAudioContext renders. Native hardware and acoustic speaker/microphone feedback are not covered.'};
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 await rm(`${out}/failure.png`,{force:true});console.log('PASS',checks.length,'control audio checks');
}catch(error){if(page){console.log('STATE',await page.evaluate(()=>({scene:window.__scenes?.top()?.id,radio:window.__probe?.radio?.(),audio:window.__probe?.audio?.()})));await page.screenshot({path:`${out}/failure.png`});}console.error(error);throw error;}finally{await browser.close();}
