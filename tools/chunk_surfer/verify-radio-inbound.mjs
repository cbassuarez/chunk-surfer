import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5214',out='artifacts/radio-inbound';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(String(e));console.log(String(e));});
 await page.setViewport({width:1280,height:760});
 await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
 await page.evaluateOnNewDocument(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>window.__radioPad?[window.__radioPad]:[]}));
 await page.goto(`${base}/?nomic=1&sam=0&progresslab=1&skiptut=1&nodisplaynotice=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top()?.id);
 const state=()=>page.evaluate(()=>({scene:window.__scenes.top()?.id,blocked:window.__scenes.blocksWorld(),radio:window.__probe.radio(),progress:window.__progress.snapshot(),view:window.__scenes.top()?.view?.()}));
 async function fresh(){
  await page.evaluate(()=>{
   window.__probe.testRun();window.__probe.godWarpGetIn();window.__probe.tutSkip();
   window.__probe.setFlags(['bag.taken','title.shown','setup.levels','combat.trained','setup.waypoint','setup.case.started','setup.case.opened','setup.case.skills-opened','setup.case.skills-done','setup.case.map-opened','setup.case.closed','setup.case.arrived']);
  });
  await page.waitForFunction(()=>window.__probe.radio().call.status==='calling',{timeout:15000});
 }
 await fresh();console.log('RING',JSON.stringify((await state()).radio.call));
 assert.equal((await state()).blocked,false);assert.ok(!(await state()).scene?.startsWith('radio:'));
 await page.keyboard.press('w');await page.screenshot({path:`${out}/incoming-gameplay.png`});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__scenes.top()?.id==='pause');
 const before=(await state()).radio.call.remainingMs;await sleep(500);assert.equal((await state()).radio.call.remainingMs,before);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__scenes.top()?.id!=='pause');
 await page.evaluate(()=>window.__probe.radioTune({answerWindowSec:.25}));
 await page.waitForFunction(()=>window.__probe.radio().missed.includes('initial_checkin'));
 assert.equal((await state()).radio.transmissions,0);assert.equal((await state()).radio.pendingCue,null);
 await page.evaluate(()=>window.__probe.radioTune({concernAfterSec:30}));
 await page.waitForFunction(()=>{
  const saved=JSON.parse(localStorage.getItem('chunk-surfer:save:v4')||'null');
  return saved?.radio?.concernRemainingMs>0&&saved.radio.concernRemainingMs<30000;
 },{timeout:6000});
 await page.evaluate(()=>window.__probe.radioTune({concernAfterSec:.25}));
 await page.waitForFunction(()=>window.__probe.radio().pendingCue?.id==='missed_checkin'&&window.__probe.radio().call.status==='calling');
 assert.equal((await state()).blocked,false);
 await page.evaluate(()=>window.__probe.radioTune({answerWindowSec:.25}));
 await page.waitForFunction(()=>!!window.__progress.snapshot().meta.achievements.ACH_DO_NOT_DISTURB);
 assert.equal((await state()).radio.transmissions,0);
 const summary=await page.evaluate(()=>window.__progress.finalize('sacrifice'));
 assert.ok(summary.unlockedAchievements.includes('ACH_RADIO_SILENCE'));
 console.log('SKIPPED',JSON.stringify({radio:summary.radio,achievements:summary.unlockedAchievements}));
 await page.evaluate(()=>localStorage.clear());await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top()?.id);
 await fresh();await page.keyboard.press('v');
 await page.waitForFunction(()=>window.__scenes.top()?.id==='radio:initial_checkin');
 assert.equal((await state()).radio.transmissions,1);
 assert.ok((await state()).progress.run.ledger.radio.uses>0);
 await sleep(500);await page.screenshot({path:`${out}/accepted-call.png`});
 for(let i=0;i<8&&!(await state()).view?.pending;i++){await page.keyboard.press('Enter');await sleep(200);}
 assert.ok((await state()).view.pending?.options?.length);
 await page.screenshot({path:`${out}/accepted-choices.png`});
 await page.setViewport({width:960,height:600});await page.evaluate(()=>window.__chunkSurferDisplay.setUiScale(1.5));await sleep(300);
 await page.screenshot({path:`${out}/accepted-large-text.png`});
 const view=(await state()).view;assert.ok(view.layout.choices.at(-1).y+view.layout.choices.at(-1).h<view.layout.footerY);
 await page.keyboard.press('v');assert.equal((await state()).radio.pendingCue,null,'lowering does not create a callback backlog');
 await page.evaluate(()=>localStorage.clear());await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top()?.id);await fresh();
 await page.evaluate(()=>{window.__radioPad={id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};});
 await sleep(250);await page.evaluate(()=>{window.__radioPad.buttons[5]={pressed:true,value:1,touched:true};});
 await sleep(180);await page.evaluate(()=>{window.__radioPad.buttons[5]={pressed:false,value:0,touched:false};});
 await page.waitForFunction(()=>window.__scenes.top()?.id==='radio:initial_checkin');
 assert.equal((await state()).radio.transmissions,1);
 await page.screenshot({path:`${out}/controller-accepted.png`});
 assert.deepEqual(errors,[]);
 const report={checks:['incoming leaves world running','pause preserves answer time','ignored call expires unheard','reminder countdown autosaves','one worried follow-up','Do Not Disturb persisted','Radio Silence awarded at completion','V accepts pending call','answer counts as use','shared panel choices fit at 150%','lowering retires the call','controller radio button accepts the call'],errors,
  scope:'Production bundle; disposable run and shortened deadline fixtures. Completion hook validates awards, not an earned full playthrough.'};
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log('PASS',report.checks.length,'inbound checks');
}finally{await browser.close();}
