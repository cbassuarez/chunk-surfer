// Bounded saved-media integrity + actual-media UI smoke. Run through shared compute gate.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import puppeteer from 'puppeteer-core';
if(!process.env.WEATHER_SKIP_POST)execFileSync(process.execPath,['tools/chunk_surfer/weathering/post-check.mjs'],{stdio:'inherit'});
const base='http://127.0.0.1:5334/artifacts/weathering-study/',report={at:new Date().toISOString(),kind:'automated-actual-media-smoke',humanResults:false,roles:[],proofViews:[],errors:[]};
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',dumpio:true,args:['--use-angle=metal','--no-sandbox']});
try {
 const page=await browser.newPage();await page.setViewport({width:1500,height:1050,deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+'proof.html',{waitUntil:'networkidle0'});
 for(const id of ['hall-sign','hall-oak','bay-steel','bay-masonry']){
  await page.click(`[data-id="${id}"]`);
  for(const view of ['final','2m-torch-final','4m-torch-final','3m-normal-final','props','scene','close-bench',...(['hall-oak','bay-steel'].includes(id)?['inside-bench']:[])]){
   await page.select('#view',view);await page.waitForFunction(()=>['before','after'].every(id=>{const im=document.getElementById(id);return im.complete&&im.naturalWidth===960&&im.naturalHeight===600;}));
   report.proofViews.push({id,view,images:'960x600 loaded'});
  }
 }
 await page.click('[data-id="hall-sign"]');await page.select('#view','final');await page.select('#display','fit');await page.waitForFunction(()=>document.getElementById('after').complete);await page.screenshot({path:'artifacts/weathering-study/proof-browser.png',fullPage:false});
 for(const role of ['reader','material']){
  await page.setViewport({width:950,height:670,deviceScaleFactor:1});await page.goto(base+'human-test.html?role='+role,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.getElementById('mediaStatus').textContent.includes('ready'),{timeout:45000});assert.equal(await page.$eval('#begin',e=>e.disabled),true);
  await page.setViewport({width:1400,height:1000,deviceScaleFactor:1});await page.waitForFunction(()=>!document.getElementById('begin').disabled);await page.click('#begin');await page.click('#showStill');await page.waitForFunction(()=>!document.getElementById('viewer').hidden);
  const size=await page.$eval('#still',e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight}));assert.deepEqual(size,{width:960,height:600,naturalWidth:960,naturalHeight:600});
  if(role==='reader')await page.waitForFunction(()=>!document.getElementById('stillQuestions').hidden,{timeout:7000});else {assert.equal(await page.$eval('#closeViewer',e=>e.hidden),false);await page.click('#closeViewer');}
  await page.$$eval('#stillQuestions textarea',rows=>rows.forEach(e=>e.value='AUTOMATED WORKFLOW CHECK — no human observation'));await page.$eval('#stillQuestions',e=>e.requestSubmit());await page.click('#showMotion');await page.waitForFunction(()=>document.getElementById('motion').ended,{timeout:15000});await page.click('#closeViewer');assert.equal(await page.$eval('#motionQuestions',e=>e.hidden),false);
  report.roles.push({role,allFourActualMediaReady:true,minViewportGate:true,nativeStill:size,firstStillAndNaturalMotionWorkflow:true,automatedOnly:true});
 }
 assert.deepEqual(report.errors,[]);fs.writeFileSync('artifacts/weathering-study/actual-media-ui-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
