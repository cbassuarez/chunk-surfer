import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base=process.env.SOURCE_TERMINAL_URL||'http://127.0.0.1:5296';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
try{
  const page=await browser.newPage();
  await page.setViewport({width:320,height:216,deviceScaleFactor:2});
  const failures=[];
  page.on('pageerror',(error)=>failures.push(error.message));
  // Expose only test hooks on a served copy of the real native-surface module.
  // Production code, real GLSL, score transport and image loading stay intact.
  await page.setRequestInterception(true);
  page.on('request',async(request)=>{
    if(new URL(request.url()).pathname==='/src/window-media-surface.js'){
      const response=await fetch(request.url()),source=await response.text();
      await request.respond({status:200,contentType:'text/javascript',body:source+'\nwindow.__terminalProof={acceptEnvelope,clearMediaScore,label:currentLabel,state:()=>({token:assignment?.content?.token,loaded:!!source,renderer:canvas.dataset.renderer,envelope:!!envelope})};'});
    }else await request.continue();
  });
  await page.goto(`${base}/window-media.html`,{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>window.__terminalProof&&document.querySelector('#media')?.dataset.renderer==='webgl2');
  await page.evaluate(async()=>{
    const {sectorErrorPhases}=await import('/src/render/sector-error.js');
    const {sourceWarningFrames}=await import('/src/render/source-warning.js');
    const {sourceWarningCompositionPlan,createPaneScoreEnvelope}=await import('/src/platform/window-composition.js');
    const terminal=sectorErrorPhases({count:10,seed:4417}),warning=sourceWarningFrames({operatorName:'MORGAN',permitted:true});
    // Pre-print frames plus one list of formation frames per message.
    const images={},phaseTokens=terminal.map((data,index)=>{const token=`snapshot-sector-${index}`;images[token]=data;return token;}),preTokens=warning.pre.map((data,index)=>{const token=`snapshot-pre-${index}`;images[token]=data;return token;}),messageTokens=warning.messages.map((steps,m)=>steps.map((data,step)=>{const token=`snapshot-warning-${m}-${step}`;images[token]=data;return token;}));
    window.__terminalProof.make=(revision,elapsed)=>{
      const plan=sourceWarningCompositionPlan({phaseTokens,preTokens,messageTokens,epochMs:Date.now()-elapsed});
      const envelope=createPaneScoreEnvelope(plan,'source-warning:0',{targetLabel:window.__terminalProof.label(),sessionToken:'proof-session',revision,snapshotFrames:images});
      return window.__terminalProof.acceptEnvelope(envelope);
    };
    window.__terminalProof.frames=images;
    await window.__terminalProof.make(1,-5000);
  });
  await page.waitForFunction(()=>window.__terminalProof.state().loaded);
  await page.screenshot({path:'/private/tmp/source-terminal-native-320.png'});
  const initial=await page.evaluate(()=>document.querySelector('#media').toDataURL());
  await page.evaluate(()=>window.__terminalProof.make(2,4400));
  await page.waitForFunction(()=>String(window.__terminalProof.state().token).startsWith('snapshot-warning-0-')&&window.__terminalProof.state().loaded);
  await page.screenshot({path:'/private/tmp/source-name-native-320.png'});
  const addressed=await page.evaluate(()=>document.querySelector('#media').toDataURL());
  assert.notEqual(initial,addressed,'a later snapshot must replace the first image');
  await page.evaluate(()=>window.__terminalProof.make(3,8500));
  await page.waitForFunction(()=>String(window.__terminalProof.state().token).startsWith('snapshot-warning-4-')&&window.__terminalProof.state().loaded);
  await page.screenshot({path:'/private/tmp/source-watch-out-native-320.png'});
  const warning=await page.evaluate(()=>document.querySelector('#media').toDataURL());
  assert.notEqual(addressed,warning);
  const cleared=await page.evaluate(()=>{
    window.__terminalProof.clearMediaScore({sessionToken:'proof-session',revision:3});
    return {state:window.__terminalProof.state(),fallback:document.querySelector('#fallback').getAttribute('src')};
  });
  assert.equal(cleared.state.envelope,false);assert.equal(cleared.state.loaded,false);assert.equal(cleared.fallback,null);
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({renderer:'actual native-surface WebGL2 module in Chromium',screenshots:['/private/tmp/source-terminal-native-320.png','/private/tmp/source-name-native-320.png','/private/tmp/source-watch-out-native-320.png'],tokenReplacement:true,cleared:true,syntheticIdentityOnly:true}));
}finally{await browser.close();}
