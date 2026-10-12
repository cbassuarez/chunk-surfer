import puppeteer from 'puppeteer-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const out=resolve('artifacts/bust-route-audit/current'), files=[], captures=[], checks=[], errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser,page,stage='boot',failure=null;
const check=(pass,name,detail)=>{checks.push({pass:!!pass,name,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail));};
async function state(){return page.evaluate(()=>{const p=window.__probe;return {
  pos:p.pos(),look:p.lookAngles(),source:p.chunkSurf(),scene:window.__scenes?.top({includeOverlay:true})?.id,
  dialogue:window.__scenes?.top()?.view?.(),bells:p.bellsFrame(),horizon:p.horizonFrame(),horizonRender:p.horizon(),
  doors:p.doorFieldDoors(),crossing:p.sourceCrossing(),crossingDebug:p.crossingDebug(),lockIn:p.lockInWalk(),
  land:p.towerLand(),landSpots:p.landSpots(),tower:p.sourceTowerView(),keyAnswers:p.towerKeyAnswers(),
  service:p.stationService(),props:p.sourceProps(),lighting:p.r3dLighting(),torch:!!p.rec().light,
  pixelMesh:window.__chunkSurferPixelMesh?.status?.(),cathedral:p.cathedralState(),
};});}
async function shot(name){stage=name;const s=await state();const data=await page.evaluate(()=>document.querySelector('canvas.r3d').toDataURL('image/png'));const path=join(out,`${name}.png`);files.push({path,bytes:Buffer.from(data.split(',')[1],'base64')});captures.push({name,path,...s});console.log('CAPTURE',name,JSON.stringify({pos:s.pos,phase:s.source.phase,land:s.land,doors:s.doors.length,scene:s.scene}));return s;}
async function aim(yaw=0,pitch=0){await page.evaluate(v=>window.__probe.lookAtWorld(v.yaw,v.pitch),{yaw,pitch});await sleep(450);}
async function torch(on){if(await page.evaluate(()=>!!window.__probe.rec().light)!==on)await page.keyboard.press('f');await sleep(200);}
async function hold(key,ms){await page.keyboard.down(key);try{await sleep(ms);}finally{await page.keyboard.up(key);}await sleep(250);}
async function bells(depth,yaw=0){await page.evaluate(async depth=>{await window.__probe.bellsPreset(depth);window.__probe.hush();},depth);await sleep(1250);await torch(true);await aim(yaw,0);}
async function nearDoor(door){await page.evaluate(door=>{const p=window.__probe,[a,b]=door.threshold,n=door.normal;p.sourceWarp((a.x+b.x)/2+n[0]*3,(a.y+b.y)/2+n[2]*3);p.hush();},door);await sleep(650);await aim(Math.atan2(-door.normal[0],door.normal[2]),0);}
async function openAndCross(door,name){await nearDoor(door);for(let i=0;i<5;i++){await page.evaluate(()=>window.__probe.hush());await page.keyboard.press('e');await sleep(250);if(await page.evaluate(id=>window.__probe.doorFieldDoors().find(d=>d.id===id)?.opened,door.id))break;}check(await page.evaluate(id=>window.__probe.doorFieldDoors().find(d=>d.id===id)?.opened,door.id),`${name}: ordinary E opens actual field door`,door.id);await hold('w',600);const s=await shot(name);check(s.crossing.frame?.id===door.id,`${name}: ordinary W starts the actual crossing`,s.crossing.frame);return s;}
async function walkTo(target){for(let i=0;i<30;i++){const s=await state(),d=Math.hypot(s.pos.x-target.x,s.pos.y-target.y);if(d<1.2)return true;await aim(Math.atan2(target.x-s.pos.x,-(target.y-s.pos.y)),0);await hold('w',Math.min(450,Math.max(60,d*55)));}return false;}
try{
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
  page=await browser.newPage();await page.setViewport({width:1440,height:900,deviceScaleFactor:.575});await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
  const recordError=error=>{let e=errors.find(e=>e.error===error);if(e)e.count++;else{errors.push({stage,error,count:1});console.error('GPUERROR',error);}};
  page.on('pageerror',e=>recordError(String(e)));page.on('console',m=>{if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID/i.test(m.text()))recordError(m.text());});
  await page.goto('http://127.0.0.1:5297/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();await window.__probe.horizonPreset(168);});await sleep(1500);await torch(true);await aim(-Math.PI/2,0);await shot('01-bust');
  await bells(90);const entry=await shot('02-bell-architecture');const before=entry.pos;await hold('d',500);const moved=await state();await hold('a',500);const after=await state();check(Math.hypot(moved.pos.x-before.x,moved.pos.y-before.y)>.5&&after.source.phase==='bells','actual lateral exploration stays in bell passage',{before,moved:moved.pos,after:after.pos});
  await bells(330);await shot('03-bell-ring');
  await bells(440);const field=await shot('04-service-door-field');check(field.doors.filter(d=>d.key).length===2&&field.doors.some(d=>d.lockIn),'tower field contains two keys and one lock-in',{keys:field.doors.filter(d=>d.key),lockIn:field.doors.find(d=>d.lockIn)});
  await bells(530);await shot('05-tower-locked');
  const doors=(await state()).doors,keys=doors.filter(d=>d.key),lockIn=doors.find(d=>d.lockIn);
  for(let i=0;i<keys.length;i++){await openAndCross(keys[i],`06-key-${i+1}-crossing`);await sleep(3400);const s=await state();check(s.doors.find(d=>d.id===keys[i].id)?.erased,`key ${i+1} is durably taken back`,{door:s.doors.find(d=>d.id===keys[i].id),answers:s.keyAnswers});}
  const keyed=await shot('07-keys-answered');check(keyed.doors.find(d=>d.route==='tower')?.unlocked,'two actual key crossings unlock the tower route',keyed.keyAnswers);
  await openAndCross(lockIn,'08-lock-in-world');await hold('w',3000);const progress=await state();check(progress.lockIn.walk?.progress>0&&progress.lockIn.walk?.progress<1,'ordinary held W advances lock-in walk',progress.lockIn);
  for(let i=0;i<4&&!(await state()).land;i++)await hold('w',4000);
  const land=await shot('09-school-hall-natural-entry');check(land.land==='school-hall'&&land.lockIn.seen,'natural lock-in exit enters the current school hall',land.lockIn);
  if(land.land==='school-hall'){
    const initial=land.pos;await hold('w',450);const advance=await state();check(Math.hypot(advance.pos.x-initial.x,advance.pos.y-initial.y)>.5,'ordinary movement works inside the school hall',{initial,advance:advance.pos});
    const exit=advance.landSpots.find(s=>s.kind==='land-door'||s.id==='land-door');
    if(exit){const walked=await walkTo({x:exit.x,y:exit.y-2});check(walked,'walk back to the actual hall exit',{exit,pos:(await state()).pos});await aim(Math.atan2(exit.x-(await state()).pos.x,-(exit.y-(await state()).pos.y)),0);await page.evaluate(()=>window.__probe.hush());await page.keyboard.press('e');await sleep(700);const returned=await shot('10-hall-door-return');check(returned.land===null&&returned.source.phase==='bells','ordinary E at hall door returns directly to tower road',{pos:returned.pos,phase:returned.source.phase,land:returned.land});}
  }
  const route=(await state()).doors.find(d=>d.route==='tower');if(route){await nearDoor(route);await shot('11-tower-unlocked-threshold');await hold('w',1000);await sleep(1400);const arrived=await shot('12-belfry-arrival');check(arrived.source.finale.route==='tower'&&arrived.cathedral?.here?.level==='belfry','ordinary W crosses the actual unlocked tower door into belfry',{source:arrived.source.finale,cathedral:arrived.cathedral});}
}catch(e){failure=String(e.stack||e);console.error(failure);errors.push({fatal:failure});}
finally{if(browser)await browser.close();await mkdir(out,{recursive:true});for(const f of files)await writeFile(f.path,f.bytes);await writeFile(join(out,'report.json'),JSON.stringify({generatedAt:new Date().toISOString(),scope:'Current stable5297; actual Chromium/Metal native canvas, no shader/module substitutions or source edits. Diagnostic presets/warps establish approaches. E/W/D/A are ordinary input. This tests local route mechanisms, not an earned continuous playthrough, listening, save reload or complete combat.',captures,checks,errors},null,2));}
process.exit(failure||errors.length||checks.some(c=>!c.pass)?1:0);
