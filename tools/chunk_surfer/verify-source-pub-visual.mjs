import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {suppressClientHmr} from './source-experience-study/prototype-session-contract.mjs';
import {SOURCE_PUB,sourcePubStretch} from '../../src/data/source-pub.js';

const base=process.env.PUB_REVIEW_URL||'http://127.0.0.1:5453';
const out=resolve(process.env.PUB_REVIEW_OUT||'artifacts/source-pub-undone-review/visual-final');
const walk=JSON.parse(await readFile(resolve('artifacts/source-pub-undone-review/final/live-report.json'),'utf8'));
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
assert.ok(!walk.failure&&walk.browserClosed&&walk.checks.every(c=>c.pass));
const report={startedAt:new Date().toISOString(),base,method:'Visual-only checkpoint fixtures copied from the separately completed real 28-action walk. Only runId is adapted to the disposable browser. Each fixture restores its captured production pose, stage and layer; diagnostic look frames the casks and Iona. No route progression or pacing is claimed by these fixtures. Native calibration is excluded. Actual live props/scene/VFD targets use production exposure and local lights.',checks:[],captures:[],errors:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let browser,page;
function check(pass,name,detail){report.checks.push({pass:!!pass,name,detail});console.log(pass?'PASS':'FAIL',name);assert.ok(pass,name);}
async function state(){return page.evaluate(()=>({scene:window.__scenes.top({includeOverlay:true})?.id,...window.__probe.sourcePub.state()}));}
async function ready(){await page.waitForFunction(()=>{const s=window.__probe.sourcePub.state();return s.ready&&s.rendering?.sceneryResident||s.error;},{timeout:90000});check(!(await state()).error,'checkpoint scenery initializes');await sleep(700);}
async function capture(name){
  const s=await state(),files={};await page.screenshot({path:resolve(out,name+'.png')});
  for(const stage of ['props','scene','vfd']){const data=await page.evaluate(stage=>window.__probe.sourceShoreCapture(stage),stage);assert.ok(data?.startsWith('data:image/png;base64,'));files[stage]=resolve(out,name+'-'+stage+'.png');await writeFile(files[stage],Buffer.from(data.split(',')[1],'base64'));}
  const{data,info}=await sharp(files.props).ensureAlpha().raw().toBuffer({resolveWithObject:true});let covered=0;for(let i=3;i<data.length;i+=4)if(data[i])covered++;
  const coverage=covered/(info.width*info.height);check(coverage>.12,'resident rendered geometry: '+name,{coverage});report.captures.push({name,files,state:s,propsCoverage:coverage});
}
try{
  await mkdir(out,{recursive:true});report.source=await Promise.all(['src/main.js','src/render/r3d.js','src/game/source-pub.js','src/render/source-pub-renderer.js','src/data/source-pub-scenography.js','public/assets/source-pub-scenography.glb'].map(async file=>({file,sha256:createHash('sha256').update(await readFile(resolve(file))).digest('hex')})));
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
  page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.evaluateOnNewDocument(()=>performance.setResourceTimingBufferSize(20000));await page.evaluateOnNewDocument(suppressClientHmr);page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto(base+'/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0',{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.__probe?.sourcePub&&window.__scenes?.top()?.id,{timeout:90000});
  await page.waitForFunction(()=>window.__scenes.has('eula')||window.__probe.meta()?.eulaAccepted,{timeout:90000});await sleep(350);
  if(await page.evaluate(()=>window.__scenes.has('eula'))){await page.keyboard.press('Enter');await sleep(150);check(!await page.evaluate(()=>window.__scenes.has('eula')),'normal disposable licence acceptance');}
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.clearDiagnosticScenes();await window.__probe.sourcePub.entranceFixture();});await page.keyboard.press('e');await ready();
  const runId=(await state()).runId;
  for(const [name,stage]of [['round-2-returned',2],['round-3-returned',3],['round-4-returned',4]]){
    const cp={...walk.captures.find(c=>c.name===name).state.saved,runId};
    await page.evaluate(async cp=>window.__probe.sourcePub.fixture(cp),cp);await ready();const s=await state();
    check(s.stage===stage&&s.layer===cp.layer&&s.task===cp.task,'captured checkpoint restores layer '+cp.layer);
    check(!await page.evaluate(()=>window.__scenes.has('eula')||window.__scenes.has('calibration')),'no boot plates under Source fixture '+stage);
    const dx=9.4*sourcePubStretch(s)-s.x,dz=6.08-s.z;
    await page.evaluate(({yaw,pitch})=>window.__probe.sourcePub.look(yaw,pitch),{yaw:Math.atan2(dx,-dz),pitch:.52});await sleep(500);await capture('layer-'+s.layer+'-cask-towers');
    const ix=11.3*sourcePubStretch(s)-s.x,iz=4.74-s.z;
    await page.evaluate(({yaw,pitch})=>window.__probe.sourcePub.look(yaw,pitch),{yaw:Math.atan2(ix,-iz),pitch:-.06});await sleep(500);await capture('layer-'+s.layer+'-iona');
  }
  check(report.errors.length===0,'no JavaScript errors',report.errors);report.finishedAt=new Date().toISOString();
}catch(error){report.failure=String(error.stack||error);console.error(error);process.exitCode=1;}
finally{if(browser)await browser.close();report.browserClosed=true;await mkdir(out,{recursive:true});await writeFile(resolve(out,'live-report.json'),JSON.stringify(report,null,2));}
