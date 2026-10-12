import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { availableCombatActions, availableCombatTools, combatMovesForTool, runCombatTurn } from '../../src/game/combat-state.js';

const url=process.env.TOWER_URL||'http://127.0.0.1:5299/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1';
const out=new URL('../../artifacts/tower-route-implementation/live-combat/',import.meta.url).pathname;
const checks=[],captures=[],errors=[],actions=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser,page,profile,fatal;
const check=(pass,name,detail)=>{checks.push({pass:!!pass,name,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail));};
const state=()=>page.evaluate(()=>({battle:window.__probe.battleState(),cathedral:window.__probe.cathedralState(),scene:window.__scenes.top()?.id,
  titleGrade:window.__probe.frontEndGrade(),
  saved:JSON.parse(localStorage.getItem('chunk-surfer:save:v4')||'null')?.chunkSurf?.finale?.cathedral}));
async function shot(name){
  const image=await page.screenshot({type:'png'}),path=`${out}${name}.webp`;
  await writeFile(path,await sharp(image).webp({quality:86}).toBuffer());
  captures.push({name,path,...await state()});
}
async function boot(){
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun,{timeout:90000});
  for(let i=0;i<180;i++){
    const id=await page.evaluate(()=>window.__scenes.top()?.id);
    if(id==='title')return;
    if(id==='eula')await page.keyboard.press('Enter');
    await sleep(500);
  }
  throw new Error('Title did not settle');
}
async function continueReload(){
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun,{timeout:90000});
  for(let i=0;i<180;i++){
    const id=await page.evaluate(()=>window.__scenes.top()?.id);
    if(id==='eula')await page.keyboard.press('Enter');
    if(id==='title'){
      await page.evaluate(()=>window.__chunkSurferDesktopMenu.dispatch('continue'));
      break;
    }
    await sleep(400);
  }
  for(let i=0;i<80;i++){
    const s=await state();if(s.battle?.checkpoint?.cathedralPhase===2)return s;
    await sleep(250);
  }
  return state();
}
function choose(state){
  // An automated knowledgeable player. The pure model ranks legal commands;
  // only actual keyboard input can change the live browser encounter.
  const score=(before,after)=>after.result?.won?10000:after.result?-10000:
    (after.movementIndex-before.movementIndex)*160
    +(before.movementCoherence-after.movementCoherence)*2.2
    +(after.composure-before.composure)*3
    +(after.take&&!before.take?7:0)+(after.charge-before.charge)*1.5;
  return availableCombatActions(state).filter(action=>action.enabled).map(action=>({action,score:score(state,runCombatTurn(state,{type:action.id}))}))
    .sort((a,b)=>b.score-a.score)[0]?.action;
}
async function command(view,action){
  if(view.phase==='move')await page.keyboard.press('ArrowUp');
  let current=(await state()).battle;
  const tools=availableCombatTools(current.state),target=tools.findIndex(tool=>tool.id===action.tool);
  for(let i=0;i<(target-current.selectedTool+tools.length)%tools.length;i++)await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  current=(await state()).battle;
  const moves=combatMovesForTool(current.state,action.tool),index=moves.findIndex(move=>move.id===action.id);
  for(let i=0;i<(index-current.selectedMove+moves.length)%moves.length;i++)await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');await sleep(100);
  const next=(await state()).battle;
  if(next?.phase==='move'&&next.state.turns===view.state.turns)await page.keyboard.press('Enter');
}
await mkdir(out,{recursive:true});
try{
  profile=await mkdtemp('/private/tmp/tower-combat-chrome-');
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:120000,
    args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disk-cache-size=1048576','--media-cache-size=1048576','--disable-gpu-shader-disk-cache']});
  page=await browser.newPage();await page.setViewport({width:1440,height:900,deviceScaleFactor:.6});
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
  page.on('pageerror',error=>errors.push(String(error)));
  await boot();await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();
    window.__probe.setFlags(['bag.taken','kit.taken','kit.fitted']);
    await window.__probe.cathedralPreset('phase-one');window.__probe.hush();});
  let reloaded=false,firstBand=false,phaseOneSeen=false,phaseTwoSeen=false;
  const stop=Date.now()+540000;
  while(Date.now()<stop){
    const s=await state(),view=s.battle;
    if(s.cathedral.finale.stage==='tower-escape'){
      await shot('04-earned-collapse');check(true,'ordinary command input completes both phases and begins the carry',s.cathedral.finale);break;
    }
    if(!view){await page.keyboard.press('Enter');await sleep(350);continue;}
    if(view.state.definition.cathedralPhase===1)phaseOneSeen=true;
    if(view.state.definition.cathedralPhase===2)phaseTwoSeen=true;
    if(['talk','ready','arrival','prepare','done'].includes(view.phase)){
      await page.keyboard.press('Enter');await sleep(400);continue;
    }
    if(view.phase==='resolve'){
      await sleep(350);await page.keyboard.press('Enter');continue;
    }
    if(!['tool','move'].includes(view.phase)){await sleep(250);continue;}
    if(!firstBand){
      firstBand=true;await shot('01-command-band');
      check(view.state.source===null&&view.state.definition.kind==='cathedral','Cathedral has its own objective without Source ending channels',view.state.definition.kind);
      check(!view.fireball?.active,'Cathedral does not offer an unused fireball-return objective');
    }
    if(view.state.definition.cathedralPhase===2&&!reloaded){
      reloaded=true;const before={phase:2,here:s.cathedral.here,movement:view.state.movementIndex,composure:view.state.composure,turns:view.state.turns,
        charge:view.state.charge,battery:view.state.battery,take:view.state.take,damage:s.cathedral.finale.cathedral.damage};
      await shot('02-phase-two-before-reload');await continueReload();
      await page.waitForFunction(()=>window.__probe.frontEndGrade()===false,{timeout:15000});
      const restored=await state();
      check(restored.titleGrade===false,'native-menu Continue retires the title grade before live gameplay');
      check(restored.battle?.state?.definition?.cathedralPhase===2,'actual page reload + Continue resumes phase two',restored.scene);
      const resumed=restored.battle?.state;
      check(resumed?.turns===before.turns&&resumed?.movementIndex===before.movement&&resumed?.composure===before.composure
        &&resumed?.charge===before.charge&&resumed?.battery===before.battery&&JSON.stringify(resumed?.take)===JSON.stringify(before.take),
        'phase two reload preserves resources, reference take, movement and turn',before);
      check(JSON.stringify(restored.cathedral.finale.cathedral.damage)===JSON.stringify(before.damage),'reload preserves the visibly damaged church',restored.cathedral.finale.cathedral.damage);
      check(JSON.stringify(restored.cathedral.here)===JSON.stringify(before.here),'reload preserves the actual crossing position',restored.cathedral.here);
      await shot('03-phase-two-restored');continue;
    }
    const action=choose(view.state);if(!action)throw new Error('No enabled combat response');
    actions.push({phase:view.state.definition.cathedralPhase,movement:view.state.movementIndex,turn:view.state.turns,action:action.id,composure:view.state.composure});
    await command(view,action);await sleep(180);
  }
  const final=await state();
  check(phaseOneSeen&&phaseTwoSeen,'both live phase definitions were played');
  check(reloaded,'second-phase reload was exercised');
  check(final.cathedral.finale.stage==='tower-escape','fight wins reach the playable extraction',final.cathedral.finale);
  check(['bells-swinging','frame-shaken','bell-fallen','pulpitum-split','lantern-out'].every(mark=>final.cathedral.finale.cathedral.damage.includes(mark)),
    'normal movement completion wires every physical breakdown mark',final.cathedral.finale.cathedral.damage);
}catch(error){fatal=String(error.stack||error);errors.push(fatal);console.error(fatal);}
finally{
  if(browser)await browser.close();if(profile)await rm(profile,{recursive:true,force:true});
  await writeFile(`${out}report.json`,JSON.stringify({createdAt:new Date().toISOString(),url,
    scope:'Frozen production bundle in Chromium/Metal. Preset establishes accepted crossing precondition. A model-informed automated player uses ordinary arrow/Enter inputs to play both phases; actual reload and Continue tests phase/resource restoration. No game or shader substitutions. This proves integration, not human difficulty or native-platform acceptance.',checks,captures,actions,errors},null,2));
}
process.exit(fatal||errors.length||checks.some(check=>!check.pass)?1:0);
