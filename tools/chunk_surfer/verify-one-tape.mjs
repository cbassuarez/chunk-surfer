import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import puppeteer from 'puppeteer-core';
const noMic=process.env.NO_MIC==='1';
const out=noMic?'artifacts/one-tape/no-microphone':'artifacts/one-tape',base=process.env.GAME_URL||'http://127.0.0.1:5214';
await mkdir(out,{recursive:true});
const bundle=await build({stdin:{contents:"export * from './src/audio/take-slate.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',message=>{if(/LOOP FAULT|loop fault x/.test(message.text()))errors.push(message.text());});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const state=()=>page.evaluate(()=>window.__scenes.top()?.debugState?.());
async function click(id){const s=await state(),h=s.hitRegions.find(h=>h.id===id);assert.ok(h,id);
 const p=await page.evaluate(({h,s})=>{const r=document.getElementById('map').getBoundingClientRect();return{x:r.x+(h.x+h.w/2)/s.viewport.cols*r.width,y:r.y+(h.y+h.h/2)/s.viewport.rows*r.height};},{h,s});
 await page.mouse.click(p.x,p.y);await sleep(150);
}
async function begin(){
 await page.keyboard.press('r');await page.keyboard.press('Enter');
 for(let i=0;i<100;i++){
   if(await page.evaluate(()=>window.__probe.rec().recording))return;
   const listening=await page.evaluate(()=>window.__probe.rec().listening&&!window.__scenes.top());
   await page.keyboard.press(listening?'r':'Enter');await sleep(100);
 }
 throw new Error('The recorder did not roll: '+JSON.stringify(await page.evaluate(()=>({rec:window.__probe.rec(),scene:window.__scenes.top()?.id,why:window.__probe.encounters()}))));
}
try{
 await page.setViewport({width:1280,height:760});
 await page.evaluateOnNewDocument(noMic=>{
   Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
     if(noMic)throw new DOMException('Microphone denied by test fixture','NotAllowedError');
     if(!window.__slateInput){const ctx=new AudioContext(),source=ctx.createOscillator(),gain=ctx.createGain(),destination=ctx.createMediaStreamDestination();
       source.frequency.value=330;gain.gain.value=0;source.connect(gain);gain.connect(destination);source.start();await ctx.resume();window.__slateInput={ctx,gain,stream:destination.stream};}
     return window.__slateInput.stream;
   }});
 },noMic);
 await page.goto(`${base}/?nodisplaynotice=1&sam=0&skiptut=1&nothink=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__probe?.tape&&window.__scenes?.top()?.id,{timeout:60000});
 await page.evaluate(()=>{
   window.__probe.testRun();window.__probe.godWarpGetIn();window.__probe.tutSkip();
   window.__probe.setFlags(['bag.taken','map.taken','van.preparation.v1','title.shown','setup.levels','combat.trained','setup.waypoint','setup.case.started','setup.case.opened','setup.case.skills-opened','setup.case.skills-done','setup.case.map-opened','setup.case.closed','setup.case.arrived','rig.machine','rig.ears','rig.power','rig.fork','rig.bent','rig.radio','rig.voice']);
   window.__probe.bagOpen('map');
 });
 await page.waitForFunction(()=>window.__scenes.top()?.debugState?.()?.mapPresentation);
 await click('bag:map:read-file');assert.ok((await state()).mapNav.roomFile);
 await page.screenshot({path:`${out}/room-history-wide.png`});
 for(const [width,height,scale] of [[960,600,1],[960,600,1.5]]){
   await page.setViewport({width,height});await page.evaluate(scale=>window.__chunkSurferDisplay.setUiScale(scale),scale);await sleep(350);
   await page.screenshot({path:`${out}/room-history-${scale===1?'compact':'large-text'}.png`});
   const before=(await state()).mapNav.roomFile.page;await page.keyboard.press('ArrowRight');
   assert.ok((await state()).mapNav.roomFile.page>=before);
 }
 checks.push('room histories open and page inside the existing survey console at three sizes');
 await page.keyboard.press('Escape');assert.equal((await state()).mapNav.roomFile,null);
 await page.keyboard.press('b');
 await page.setViewport({width:1280,height:760});await page.evaluate(()=>window.__chunkSurferDisplay.setUiScale(1));
 await page.evaluate(()=>window.__probe.godWarpHook('studio-b3'));await sleep(600);
 // Keep the existing God fixture's adversary away while measuring transport.
 // This is not a difficulty or combat acceptance run.
 await page.evaluate(()=>{window.__tapeDirections=new Set();window.__probe.radioVisual('dead',{deployed:true});window.__probe.radioTune({squelchAfterSec:100000});window.__tapeIsolation=setInterval(()=>{window.__probe.placePresence(-500,-500);const direction=window.__probe.playback().snapshot?.seeking;if(direction)window.__tapeDirections.add(direction);},50);});
 await begin();
 await page.waitForFunction(()=>!window.__probe.rec().slating||window.__probe.tape().takes.at(-1)?.slate?.atSeconds!==undefined,{timeout:40000});
 // Escape first dismisses an active speech caption, then opens Pause.
 for(let i=0;i<4&&await page.evaluate(()=>window.__scenes.top()?.id!=='pause');i++){await page.keyboard.press('Escape');await sleep(150);}
 await page.waitForFunction(()=>window.__scenes.top()?.id==='pause');
 if(!noMic)await page.waitForFunction(()=>window.__probe.tape().slateCaptureState==='paused');
 const pausedAt=await page.evaluate(()=>window.__probe.rec().takeTapeElapsed);await sleep(700);
 assert.equal(await page.evaluate(()=>window.__probe.rec().takeTapeElapsed),pausedAt);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__scenes.top()?.id!=='pause');
 if(!noMic)await page.waitForFunction(()=>window.__probe.tape().slateCaptureState==='recording');
 checks.push('pausing freezes the tape and microphone capture; resume continues the slate');
 await sleep(1000);
 await page.screenshot({path:`${out}/slate.png`});
 const input=await page.evaluate(()=>!!window.__slateInput);
 assert.equal(input,!noMic);
 if(input){await page.evaluate(()=>window.__slateInput.gain.gain.value=.08);await sleep(1500);await page.evaluate(()=>window.__slateInput.gain.gain.value=0);}
 await page.waitForFunction(()=>!window.__probe.rec().slating,{timeout:30000});
 await page.waitForFunction(()=>window.__probe.rec().takeElapsed>=12,{timeout:30000});
 await page.keyboard.press('r');await sleep(350);
 let tape=await page.evaluate(()=>window.__probe.tape());
 assert.equal(tape.takes.length,1);assert.equal(tape.takes[0].status,'abandoned');assert.ok(tape.transport.headSeconds>=12);
 if(noMic){assert.equal(tape.takes[0].slate.mode,'fallback');assert.ok(tape.takes[0].slate.durationSeconds>0);checks.push('denying microphone access automatically speaks the recordist slate and then starts clean time');}
 checks.push('normal recorder input starts a slate and retains an early stopped take');
 console.log('Early take and slate verified.');
 await page.keyboard.press('r');await page.keyboard.press('Tab');await sleep(250);
 await page.screenshot({path:`${out}/abandoned-take.png`});
 await page.keyboard.press('Enter');await sleep(150);
 assert.equal((await page.evaluate(()=>window.__probe.playback())).snapshot?.seeking,'rewind');
 await page.screenshot({path:`${out}/rewind.png`});
 await page.waitForFunction(()=>window.__probe.playback().snapshot?.seeking===undefined&&window.__probe.playback().playing,{timeout:10000});
 await sleep(400);const playback=await page.evaluate(()=>window.__probe.tape());
 assert.ok(playback.transport.headSeconds<tape.transport.headSeconds);checks.push('the abandoned take is playable and rewinds the same physical tape counter');
 await page.keyboard.press('Enter');await page.keyboard.press('r');
 await page.evaluate(async code=>{window.__slateStorage=await import(URL.createObjectURL(new Blob([code],{type:'text/javascript'})));},bundle.outputFiles[0].text);
 if(input){
   await page.waitForFunction(()=>!!window.__probe.tape().takes[0]?.slate?.audioKey,{timeout:10000});
   const audio=await page.evaluate(async()=>{
     const key=window.__probe.tape().takes[0].slate.audioKey,blob=await window.__slateStorage.readSlateAudio(key);
     const buffer=await window.__slateInput.ctx.decodeAudioData(await blob.arrayBuffer());
     return {bytes:blob.size,duration:buffer.duration,peak:buffer.getChannelData(0).reduce((p,v)=>Math.max(p,Math.abs(v)),0)};
   });assert.ok(audio.bytes>100&&audio.peak>.01);checks.push('the actual encoded microphone slate is stored locally and decodes to audible samples');
 }
 await begin();
 assert.ok(await page.evaluate(()=>window.__tapeDirections.has('forward')));checks.push('recording after playback fast-forwards to the end before appending');
 await page.waitForFunction(()=>window.__probe.tape().takes.at(-1)?.slate?.atSeconds!==undefined,{timeout:40000});
 if(input){await page.evaluate(()=>window.__slateInput.gain.gain.value=.08);await sleep(1500);await page.evaluate(()=>window.__slateInput.gain.gain.value=0);}
 await page.waitForFunction(()=>!window.__probe.rec().slating,{timeout:30000});
 await page.waitForFunction(()=>window.__probe.rec().takeElapsed>=45,{timeout:65000});
 await page.screenshot({path:`${out}/usable-take.png`});
 await page.keyboard.press('r');await sleep(350);
 const completed=await page.evaluate(()=>({tape:window.__probe.tape(),rec:window.__probe.rec()}));
 assert.equal(completed.tape.takes.length,2);assert.equal(completed.tape.takes[0].status,'abandoned');assert.equal(completed.tape.takes[1].status,'accepted');
 assert.ok(completed.tape.takes[1].cleanSeconds>=45&&completed.tape.takes[1].cleanSeconds<60);
 assert.deepEqual(completed.rec.takes,['main_b3']);
 assert.equal(completed.tape.takes[1].startSeconds,completed.tape.takes[0].endSeconds);
 checks.push('a fresh replacement appends after the failed take and stopping at 45 seconds completes the actual job room');
 console.log('Usable replacement verified.');
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__probe?.tape&&window.__scenes?.top()?.id,{timeout:60000});
 await page.evaluate(()=>window.__probe.testRun());await sleep(500);
 assert.deepEqual((await page.evaluate(()=>window.__probe.tape())).takes,completed.tape.takes);
 checks.push('the full tape, slate references and accepted room survive a production save/reload');
 tape=await page.evaluate(()=>window.__probe.tape());
 await writeFile(`${out}/report.json`,JSON.stringify({checks,errors,tape,microphoneInput:input},null,2));
 assert.deepEqual(errors,[]);await rm(`${out}/failure.png`,{force:true});console.log(JSON.stringify({checks,errors,microphoneInput:input}));
}catch(error){console.log(await page.evaluate(()=>({rec:window.__probe?.rec(),tape:window.__probe?.tape(),hunter:window.__probe?.takeHunter(),mic:window.__probe?.mic(),scene:window.__scenes?.top()?.id})).catch(()=>({errors})));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{await browser.close();}
