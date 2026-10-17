// Synthetic protocol verification. Never enters/submits a transcription and
// never counts this browser as a human participant.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const output='artifacts/lettering-study/evidence';mkdirSync(output,{recursive:true});
const sources=['artifacts/lettering-study/review.html','artifacts/lettering-study/review.js',
 'src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js',
 'public/assets/lettering-study/signs.glb','public/assets/lettering-study/manifest.json',
 'public/assets/lettering-study/polarity.glb','public/assets/lettering-study/polarity-manifest.json'];
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const errors=[],report={date:new Date().toISOString(),sourceHashes:Object.fromEntries(sources.map(path=>[path,sha(path)])),errors,
 kind:'Synthetic UI protocol validation. No new human reading, no transcription entered, no response submitted.',narrow:null,wide:null,trial:null};
const save=()=>writeFileSync(`${output}/reading-protocol-report.json`,JSON.stringify(report,null,2));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:800,height:900,deviceScaleFactor:1});page.on('pageerror',error=>errors.push(error.message));
 await page.evaluateOnNewDocument(()=>{window.WebSocket=class extends EventTarget{
  static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
  constructor(url){super();this.url=url;this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){this.readyState=3;}
 };});
 await page.goto(`${process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5334'}/artifacts/lettering-study/review.html?blind=1`,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.letteringStudy?.ready,{timeout:90000});await page.waitForNetworkIdle({idleTime:800,timeout:60000});
 report.narrow=await page.evaluate(()=>{
  const begin=document.querySelector('#trialBegin'),fresh=document.querySelector('#freshReader'),visible=element=>getComputedStyle(element).display!=='none'&&element.getBoundingClientRect().height>0;
  const freshnessInitiallyUnchecked=!fresh.checked,initiallyDisabled=begin.disabled;
  fresh.checked=true;fresh.dispatchEvent(new Event('change'));
  const blockedWithFreshness=begin.disabled;begin.click();
  return{viewport:[innerWidth,innerHeight],devicePixelRatio,freshnessInitiallyUnchecked,initiallyDisabled,blockedWithFreshness,
   status:document.querySelector('#trialStatus').textContent,hidden:{header:!visible(document.querySelector('header')),nav:!visible(document.querySelector('nav')),study:!visible(document.querySelector('#study'))},
   answerVisible:/STUDIOS\s*\/\s*PLANT|SAVE\s+ELLERY/.test(document.body.innerText),
   responseCount:JSON.parse(localStorage.getItem('ellery-lettering-trials')||'[]').length};
 });
 assert.ok(report.narrow.freshnessInitiallyUnchecked&&report.narrow.initiallyDisabled&&report.narrow.blockedWithFreshness);
 assert.equal(report.narrow.responseCount,0);assert.ok(Object.values(report.narrow.hidden).every(Boolean));assert.equal(report.narrow.answerVisible,false);
 await page.setViewport({width:1200,height:900,deviceScaleFactor:1});await page.waitForFunction(()=>!document.querySelector('#trialBegin').disabled,{timeout:10000});
 report.wide=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],devicePixelRatio,beginEnabled:!document.querySelector('#trialBegin').disabled,
  canvasCss:[document.querySelector('#blindCanvas').getBoundingClientRect().width,document.querySelector('#blindCanvas').getBoundingClientRect().height]}));
 assert.deepEqual(report.wide.canvasCss,[960,600]);
 report.trial=await page.evaluate(async()=>{
  const S=window.letteringStudy,canvas=document.querySelector('#blindCanvas'),input=document.querySelector('#transcription'),next=document.querySelector('#trialNext');
  const existing=localStorage.getItem('ellery-lettering-trials');document.querySelector('#trialBegin').click();
  const waitStart=performance.now();while(document.querySelector('#trialStatus').textContent!=='View 1 / 2'&&performance.now()-waitStart<10000)await new Promise(r=>setTimeout(r,10));
  const begun=performance.now(),rect=canvas.getBoundingClientRect(),display=S.R.r3dPixelMeshStatus();
  const pixels=()=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let nonblack=0;for(let i=0;i<data.length;i+=4)if(data[i]||data[i+1]||data[i+2])nonblack++;return nonblack;};
  const actual={viewport:[innerWidth,innerHeight],cssCanvas:[rect.width,rect.height],canvasRect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},
   outputPixels:[canvas.width,canvas.height],actualAcquisition:[display.sceneWidth,display.sceneHeight],devicePixelRatio,settings:S.R.r3dPixelMeshSettings(),actualEye:S.R.r3dEyePoint(),eyeCoordinateUnits:'r3dEyePoint returns engine cells; multiply X/Y/Z by 0.5 for metres. Requested camera coordinates are metres.',actualWorldYaw:S.R.r3dWorldYaw(),
   wholeCanvasVisible:rect.left>=0&&rect.top>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight};
  const first={nonblackPixels:pixels(),inputDisabled:input.disabled,nextDisabled:next.disabled};
  await new Promise(r=>setTimeout(r,2500));const at2500ms={elapsedMs:performance.now()-begun,nonblackPixels:pixels(),inputDisabled:input.disabled,nextDisabled:next.disabled};
  while(input.disabled&&performance.now()-begun<6000)await new Promise(r=>setTimeout(r,5));
  const after={elapsedMs:performance.now()-begun,nonblackPixels:pixels(),inputEnabled:!input.disabled,nextEnabled:!next.disabled,value:input.value,
   responseCount:JSON.parse(localStorage.getItem('ellery-lettering-trials')||'[]').length,localStorageUnchanged:localStorage.getItem('ellery-lettering-trials')===existing};
  const encounter=await S.configure('services',960,600,1);
  const servedPacks={};for(const [id,path,manifest]of [['base','/assets/lettering-study/signs.glb',S.manifest],['polarity','/assets/lettering-study/polarity.glb',S.polarityManifest]]){
   const bytes=await(await fetch(path)).arrayBuffer();
   servedPacks[id]={path,bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join(''),manifestSha256:manifest.glbSha256};
  }
  const readingEnvelope=S.currentReadingTrial();
  return{actual,requestedCamera:encounter.camera(3),first,at2500ms,after,servedPacks,readingEnvelope,
   noTranscriptionEntered:true,noResponseSubmitted:true,presentationPersistence:'review.js records viewport, CSS canvas, actual acquisition, output pixels, DPR, settings and camera with an eventual submitted response. This QA intentionally does not submit, so no response record is created.'};
 });save();
 const t=report.trial;
 assert.deepEqual(t.actual.cssCanvas,[960,600]);assert.deepEqual(t.actual.outputPixels,[960,600]);assert.deepEqual(t.actual.actualAcquisition,[960,600]);assert.ok(t.actual.wholeCanvasVisible,'Native trial canvas is clipped in the viewport');
 assert.ok(t.first.nonblackPixels>100&&t.first.inputDisabled&&t.first.nextDisabled);
 assert.ok(t.at2500ms.nonblackPixels>100&&t.at2500ms.inputDisabled&&t.at2500ms.nextDisabled);
 assert.ok(t.after.elapsedMs>=2850&&t.after.elapsedMs<4500);assert.equal(t.after.nonblackPixels,0);assert.ok(t.after.inputEnabled&&t.after.nextEnabled);
 assert.equal(t.after.value,'');assert.equal(t.after.responseCount,0);assert.ok(t.after.localStorageUnchanged);
 for(const [id,file]of [['base','signs.glb'],['polarity','polarity.glb']]){assert.equal(t.servedPacks[id].sha256,t.servedPacks[id].manifestSha256);assert.equal(t.servedPacks[id].sha256,report.sourceHashes['public/assets/lettering-study/'+file]);}
 assert.equal(t.readingEnvelope.trial.caseId,'services');assert.equal(t.readingEnvelope.trial.variant,'light-enamel');assert.equal(t.readingEnvelope.trial.arm,'candidate');assert.equal(t.readingEnvelope.trial.packSha,t.servedPacks.polarity.sha256);
 assert.deepEqual(t.readingEnvelope.presentation.cssCanvas,[960,600]);assert.deepEqual(t.readingEnvelope.presentation.actualAcquisition,{width:960,height:600});
 assert.deepEqual(t.readingEnvelope.presentation.settings,t.actual.settings);
 // Return via the actual UI and exercise case-dependent controls. No reading
 // answer is entered or submitted while inspecting the study controls.
 await page.click('#returnStudy');await page.setViewport({width:1400,height:1000,deviceScaleFactor:1});
 const smoke=await page.evaluate(async()=>{
  const S=window.letteringStudy,rows=[];
  const select=async(id,value)=>{const e=document.querySelector(id);e.value=value;e.dispatchEvent(new Event('change'));await new Promise(r=>requestAnimationFrame(r));};
  const switchCase=id=>document.querySelector(`[data-case="${id}"]`).click();
  async function sample(label,action=()=>{}){
   await action();await Promise.resolve();const pair=await S.compare();
   const optionState=id=>[...document.querySelector(id).options].map(o=>({value:o.value,disabled:o.disabled,selected:o.selected}));
   const settings=S.options(),diagnostics=JSON.parse(document.querySelector('#diagnostics').textContent);
   const row={label,activeCase:document.querySelector('[data-case].active')?.dataset.case,settings,
    lights:optionState('#light'),variants:optionState('#variant'),reference:pair.before.evidence.variant,
    candidate:pair.after.evidence.variant,camerasMatched:JSON.stringify(pair.before.evidence.camera)===JSON.stringify(pair.after.evidence.camera),
    shaderReady:pair.after.evidence.display.shaderReady,glError:pair.after.evidence.glError,
    canvasCss:[document.querySelector('#after').getBoundingClientRect().width,document.querySelector('#after').getBoundingClientRect().height],diagnosticsGlError:diagnostics.glError};
   rows.push(row);return row;
  }
  await sample('default-services',()=>switchCase('services'));
  await sample('palette-only',async()=>{await select('#reference','fabricated');await select('#variant','light-enamel');});
  await sample('services-practicals',()=>select('#light','normal'));
  await sample('placard',async()=>{await select('#light','torch');await select('#reference','baseline');switchCase('placard');});
  await sample('original-mount',()=>switchCase('dock-original'));
  await sample('original-emergency-on',()=>select('#light','emergencyOn'));
  await sample('original-emergency-off',()=>select('#light','emergencyOff'));
  await sample('services-after-emergency',()=>switchCase('services'));
  await sample('final-palette-candidate',async()=>{await select('#reference','fabricated');await select('#variant','light-enamel');await select('#light','torch');});
  scrollTo(0,0);
  return{rows,responseCount:JSON.parse(localStorage.getItem('ellery-lettering-trials')||'[]').length,transcription:document.querySelector('#transcription').value,
   note:'Synthetic UI smoke. Existing cases and valid authored light states only; no reading response submitted and no broad capture matrix rerun.'};
 });
 report.uiSmoke=smoke;
 for(const row of smoke.rows){assert.equal(row.glError,0);assert.equal(row.diagnosticsGlError,0);assert.ok(row.shaderReady);assert.ok(row.camerasMatched);assert.ok(!row.lights.some(o=>o.selected&&o.disabled),'Case switch retained a disabled light');
  const mount=row.variants.find(o=>o.value==='mount-only');assert.equal(mount.disabled,row.activeCase!=='dock-original','Mount-only is selectable outside its actual mounting case');}
 assert.equal(smoke.rows.find(r=>r.label==='default-services').candidate,'light-enamel');
 const palette=smoke.rows.find(r=>r.label==='palette-only');assert.equal(palette.reference,'fabricated');assert.equal(palette.candidate,'light-enamel');
 const placard=smoke.rows.find(r=>r.label==='placard');assert.equal(placard.candidate,'fabricated');assert.ok(placard.variants.find(o=>o.value==='light-enamel').disabled);
 assert.equal(smoke.responseCount,0);assert.equal(smoke.transcription,'');
 await page.screenshot({path:`${output}/final-review.png`,fullPage:true});
 report.sourceHashesAfter=Object.fromEntries(sources.map(path=>[path,sha(path)]));report.sourcesUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);save();
 writeFileSync(`${output}/final-review-qa.json`,JSON.stringify({date:report.date,readingArm:t.readingEnvelope.trial,nativePresentation:t.actual.cssCanvas,acquisition:t.actual.actualAcquisition,servedPacks:t.servedPacks,
  uiSmoke:smoke.rows.map(r=>({label:r.label,case:r.activeCase,reference:r.reference,candidate:r.candidate,light:r.settings.light,glError:r.glError,shaderReady:r.shaderReady,selectedLightValid:!r.lights.some(o=>o.selected&&o.disabled)})),
  responseCount:smoke.responseCount,sourcesUnchanged:report.sourcesUnchanged,errors,screenshot:'final-review.png',interpretation:'Synthetic UI and protocol QA; no human reading result or fabricated response.'},null,2));
 assert.ok(report.sourcesUnchanged);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({narrowBlocked:report.narrow.blockedWithFreshness,wideEnabled:report.wide.beginEnabled,nativePresentation:t.actual.cssCanvas,acquisition:t.actual.actualAcquisition,
  exposureMs:t.after.elapsedMs,opaqueBlackout:t.after.nonblackPixels===0,responseCount:t.after.responseCount,servedPacks:t.servedPacks,
  defaultCandidate:t.readingEnvelope.trial,uiSmokeStates:smoke.rows.length,sourcesUnchanged:report.sourcesUnchanged,errors}));
}catch(error){report.failure=error.message;save();throw error;}finally{
 const process=browser.process();let timer;try{await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(()=>{process?.kill('SIGTERM');resolve();},10000);})]);}finally{clearTimeout(timer);}
}
