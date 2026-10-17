// Synthetic DOM/clock checks only. Never enters a transcription, submits a
// response, claims a participant, or creates a game/WebGL rendering context.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createServer} from 'node:http';
import puppeteer from 'puppeteer-core';
const root=process.cwd(),directory='artifacts/lettering-production',output=`${directory}/solid-paint/reading-protocol`,temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ellery-reading-protocol-'));
const files=[`${directory}/reading-test.html`,`${directory}/reading-test.js`,`${directory}/reading-trials.json`,
 `${directory}/solid-paint/review-evidence/report.json`,`${directory}/solid-paint/review-evidence/dock-mode3-final.png`,`${directory}/solid-paint/review-evidence/vigil-mode3-final.png`];
fs.mkdirSync(output,{recursive:true});
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={date:new Date().toISOString(),kind:'Synthetic software-browser protocol validation only; no transcription entered or response submitted.',
 humanReadingResults:'pending fresh reader',sourceHashes:Object.fromEntries(files.map(file=>[file,sha(file)])),errors:[],rendererContextsCreated:[]};
const server=createServer((request,response)=>{
 const uri=decodeURIComponent(new URL(request.url,'http://local').pathname),file=path.resolve(root,`.${uri}`);
 if(!file.startsWith(path.resolve(directory)+path.sep)){response.writeHead(404);response.end();return;}
 try{const bytes=fs.readFileSync(file);response.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png'})[path.extname(file)]||'application/octet-stream');response.setHeader('Cache-Control','no-store');response.end(bytes);}catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const save=()=>fs.writeFileSync(`${output}/production-reading-protocol-qa.json`,JSON.stringify(report,null,2)+'\n');
try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',timeout:45000,
  args:['--no-sandbox','--disable-gpu','--disable-webgl','--disable-extensions','--disable-background-networking']});
 const base=`http://127.0.0.1:${server.address().port}/${directory}/reading-test.html?protocol-test=1`;
 const context=await browser.createBrowserContext(),page=await context.newPage();
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.setViewport({width:800,height:900,deviceScaleFactor:1});
 await page.goto(base,{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.letteringReadingTest?.snapshot().ready);
 report.narrow=await page.evaluate(()=>{
  const begin=document.querySelector('#begin'),fresh=document.querySelector('#freshReader'),initial={checked:fresh.checked,disabled:begin.disabled};
  fresh.checked=true;fresh.dispatchEvent(new Event('change'));begin.click();
  return{...initial,disabledAfterFreshness:begin.disabled,...window.letteringReadingTest.snapshot()};
 });
 assert.equal(report.narrow.checked,false);assert.ok(report.narrow.disabled&&report.narrow.disabledAfterFreshness);assert.equal(report.narrow.viewCount,0);
 await page.setViewport({width:1200,height:900,deviceScaleFactor:1});await page.bringToFront();await page.waitForFunction(()=>!document.querySelector('#begin').disabled);
 const responsesBefore=await page.evaluate(()=>window.letteringReadingTest.snapshot().responseCount);
 await page.click('#begin');await page.waitForFunction(()=>window.letteringReadingTest.snapshot().phase==='exposing');
 report.first=await page.evaluate(()=>({state:window.letteringReadingTest.snapshot(),inputDisabled:document.querySelector('#response').disabled,saveDisabled:document.querySelector('#save').disabled}));
 assert.deepEqual(report.first.state.currentView.nativeImage.css,[960,600]);assert.deepEqual(report.first.state.currentView.nativeImage.natural,[960,600]);
 assert.ok(report.first.state.active&&report.first.inputDisabled&&report.first.saveDisabled);
 const r=report.first.state.currentView.nativeImage.rect;assert.ok(r.left>=0&&r.top>=0&&r.right<=1200&&r.bottom<=900);
 await delay(2500);
 report.at2500=await page.evaluate(()=>({state:window.letteringReadingTest.snapshot(),inputDisabled:document.querySelector('#response').disabled}));
 assert.ok(report.at2500.state.active&&report.at2500.inputDisabled);
 await page.waitForFunction(()=>window.letteringReadingTest.snapshot().phase==='response',{timeout:6000});
 report.after=await page.evaluate(()=>({state:window.letteringReadingTest.snapshot(),inputEnabled:!document.querySelector('#response').disabled,
  value:document.querySelector('#response').value,answerTextVisible:/STUDIOS\s*\/\s*PLANT|SAVE\s+ELLERY|KEEP\s+ELLERY/i.test(document.body.innerText)}));
 assert.ok(!report.after.state.active&&!report.after.state.stimulusVisible&&!report.after.state.stageVisible&&report.after.inputEnabled);
 assert.equal(report.after.value,'');assert.equal(report.after.state.responseCount,responsesBefore);assert.equal(report.after.answerTextVisible,false);
 const elapsed=report.after.state.currentView.actualExposureMs;assert.ok(elapsed>=2990&&elapsed<4500);assert.equal(report.after.state.currentView.interrupted,false);
 const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:temporary});
 await page.click('#download');const download=path.join(temporary,'ellery-lettering-production-reading.json');
 for(let i=0;i<50&&!fs.existsSync(download);i++)await delay(100);
 assert.ok(fs.existsSync(download),'actual browser JSON download exists');const payload=JSON.parse(fs.readFileSync(download));
 assert.equal(payload.syntheticProtocolTest,true);assert.equal(payload.responses.length,0);assert.equal(payload.views.length,1);assert.equal(payload.views[0].response,null);
 const rejectKeys=value=>{if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){assert.ok(!['copy','expectedCopy','expected','expectedTranscription','answer','answers','text','lines','glyphs'].includes(key),`answer key leaked as ${key}`);rejectKeys(item);}};
 rejectKeys(payload);assert.match(payload.views[0].imageSha256,/^[0-9a-f]{64}$/);assert.ok(payload.views[0].sourceCapture.frame.evidence.camera);
 report.download={filename:path.basename(download),syntheticProtocolTest:true,responses:0,views:1,imageSha256:payload.views[0].imageSha256,
  captureIndexSha256:payload.captureIndexSha256,answerKeyFieldsAbsent:true,actualExposureMs:payload.views[0].actualExposureMs};
 await page.screenshot({path:`${output}/production-reading-protocol-after.png`,fullPage:true});
 await page.reload({waitUntil:'domcontentloaded'});
 report.reload=await page.evaluate(()=>({state:window.letteringReadingTest.snapshot(),beginHidden:document.querySelector('#begin').hidden,nextHidden:document.querySelector('#next').hidden}));
 assert.equal(report.reload.state.viewCount,1);assert.ok(!report.reload.state.active&&report.reload.beginHidden&&report.reload.nextHidden);
 await context.close();
 for(const kind of ['blur','resize']){
  const context=await browser.createBrowserContext(),p=await context.newPage();p.on('pageerror',error=>report.errors.push(error.message));
  await p.setViewport({width:1200,height:900,deviceScaleFactor:1});await p.goto(base,{waitUntil:'networkidle0'});await p.waitForFunction(()=>window.letteringReadingTest?.snapshot().ready);await p.bringToFront();
  await p.click('#freshReader');await p.click('#begin');await p.waitForFunction(()=>window.letteringReadingTest.snapshot().phase==='exposing');await delay(100);
  if(kind==='blur')await p.evaluate(()=>window.dispatchEvent(new Event('blur')));else await p.setViewport({width:900,height:700,deviceScaleFactor:1});
  await p.waitForFunction(()=>window.letteringReadingTest.snapshot().phase==='response');
  const state=await p.evaluate(()=>window.letteringReadingTest.snapshot());
  assert.ok(state.currentView.interrupted);assert.ok(state.currentView.actualExposureMs<3000);assert.equal(state.responseCount,0);
  assert.ok(state.currentView.interruptions.some(event=>event.kind===(kind==='blur'?'window-blur':'viewport-resize')));
  report[`${kind}Interruption`]={method:kind==='blur'?'Synthetic DOM window blur event':'Actual browser viewport resize',...state};
  await context.close();
 }
 report.browser=await browser.version();report.browserFlags=['--disable-gpu','--disable-webgl'];
 report.sourceHashesAfter=Object.fromEntries(files.map(file=>[file,sha(file)]));assert.deepEqual(report.sourceHashesAfter,report.sourceHashes);
 report.sourcesUnchanged=true;assert.deepEqual(report.errors,[]);save();
 console.log(JSON.stringify({native:[960,600],actualExposureMs:elapsed,answersEntered:0,responsesSubmitted:0,narrowBlocked:true,reloadReplayBlocked:true,
  blurRecorded:true,resizeRecorded:true,download:report.download.filename,sourceHashesStable:true,humanReading:'pending fresh reader'}));
}catch(error){report.failure=error.message;save();throw error;}finally{
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});
}
