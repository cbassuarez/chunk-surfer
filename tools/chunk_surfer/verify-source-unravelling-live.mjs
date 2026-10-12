import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const baseline=process.env.SOURCE_UNRAVELLING_BASELINE==='1';
const out=`artifacts/source-unravelling/${baseline?'before':'after'}`;
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,protocolTimeout:120000,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling'],
});
const page=await browser.newPage(),errors=[],evidence={},checks=[];
let stage='startup';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
page.on('pageerror',error=>errors.push({stage,message:String(error)}));
page.on('console',message=>{
  if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID/i.test(message.text()))errors.push({stage,message:message.text()});
});
await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
const snap=()=>page.evaluate(()=>({
  pos:window.__probe.pos(),frame:window.__probe.horizonFrame(),
  render:window.__probe.horizon(),props:window.__probe.sourceProps(),
  phase:window.__probe.chunkSurf().phase,top:window.__scenes?.top()?.id,
  street:window.__probe.outskirtsStreet(),
}));
try{
  const url=new URL(process.env.SOURCE_FIX_BASE||'http://127.0.0.1:5297/');
  for(const[key,value]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1',sam:'0',nothink:'1'}))url.searchParams.set(key,value);
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
  await page.evaluate(async baseline=>{await window.__probe.testRun();window.__probe.tutSkip();if(baseline)await window.__probe.horizonPreset(0);else await window.__probe.preTapePreset(0);},baseline);
  const seam=await page.evaluate(()=>window.__probe.horizonFrame().seamY??window.__probe.pos().y+window.__probe.horizonFrame().depth);
  let previous=0;
  for(const[name,metres]of [['road',-70],['first-loss',-30],['seam',0],['overlap',30],['unravelled',125],['tail',245]]){
    stage=name;
    await page.evaluate(({seam,metres})=>{window.__probe.sourceWarp(0,seam-metres*2);window.__probe.lookAtWorld(0,0);},{seam,metres});
    await sleep(1400);
    evidence[name]=await snap();
    await page.screenshot({path:`${out}/${name}.png`});
    console.log('CAPTURE',name,JSON.stringify({pos:evidence[name].pos,decay:evidence[name].frame.unravelling,props:evidence[name].props.length,top:evidence[name].top}));
    if(!baseline){
      assert.equal(evidence[name].phase,'horizon');
      const decay=evidence[name].frame.unravelling;
      assert.ok(decay&&decay.amount>=previous,'loss never reverses while walking forward');
      assert.deepEqual(evidence[name].render.stats?.glErrors||[],[],'the road/splat compositor draws without GL errors');
      previous=decay.amount;
      if(metres>=-30)assert.equal(decay.active,true);
      if(metres===-70)assert.equal(decay.active,false,'the initial ordinary road has not already been unravelled by the fixture');
    }
  }
  if(!baseline){
    assert.ok(evidence.seam.props.length>0,'recognisable street survives the old seam');
    assert.ok(evidence.overlap.props.length>0,'familiar street props overlap the first splats');
    checks.push('Street props and splats overlap continuously across the old seam');
    const loss=evidence.tail.frame.unravelling.amount;
    await page.evaluate(seam=>window.__probe.sourceWarp(0,seam-200),seam);await sleep(1000);
    evidence.retreat=await snap();
    assert.ok(evidence.retreat.frame.unravelling.amount>=loss,'retreat cannot restore the street');
    await page.screenshot({path:`${out}/retreat.png`});
    checks.push('Retreat retains attained world loss');

    await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI/2,0));
    const start=(await snap()).pos;
    await page.keyboard.down('w');await sleep(1400);await page.keyboard.up('w');await sleep(500);
    evidence.lateral=await snap();
    assert.ok(evidence.lateral.pos.x>start.x+2,'actual keyboard walking explores beside the road');
    assert.equal(evidence.lateral.pos.y,start.y,'sideways exploration retains forward depth');
    await sleep(1400);
    assert.equal((await snap()).pos.y,start.y,'waiting beside the road cannot reset the walk');
    checks.push('Actual sideways walking and waiting keep forward progress');

    const listening=await snap();await sleep(2200);evidence.listening=await snap();
    assert.ok(evidence.listening.frame.unravelling.elapsedSeconds>listening.frame.unravelling.elapsedSeconds+.1,'world decay clock advances while standing');
    // Escape first dismisses an active thought shell, as it does in gameplay.
    // Use another real keypress to open the run-level pause in that case.
    for(let attempt=0;attempt<3;attempt++){
      await page.keyboard.press('Escape');await sleep(350);
      if(await page.evaluate(()=>window.__scenes?.top({includeOverlay:true})?.id==='pause'))break;
    }
    await page.waitForFunction(()=>window.__scenes?.top({includeOverlay:true})?.id==='pause',{timeout:5000});
    const paused=(await snap()).frame.unravelling;
    await sleep(1800);evidence.paused=await snap();
    assert.equal(evidence.paused.frame.unravelling.elapsedSeconds,paused.elapsedSeconds,'pause freezes decay');
    await page.keyboard.press('Escape');await sleep(300);
    checks.push('Standing permits decay; pause freezes the clock');

    // Reach the default exit using real held movement, without meeting the bust.
    await page.evaluate(seam=>{window.__probe.sourceWarp(0,seam-507);window.__probe.lookAtWorld(0,0);},seam);
    await page.keyboard.down('w');await sleep(1300);await page.keyboard.up('w');await sleep(300);
    evidence.defaultExit=await snap();
    assert.equal(evidence.defaultExit.phase,'chapel-outskirts','walking onward preserves the chapel route without the bust');
    checks.push('Actual forward walking reaches the default chapel continuation without the bust');

    // A separate review fixture checks the optional monument after proving
    // the untouched default route above; it does not choose the tower detour.
    stage='bust';
    await page.evaluate(async()=>{
      await window.__probe.horizonPreset(156);
      window.__probe.sourceWarp(-9,window.__probe.horizonFrame().seamY-156);
      window.__probe.lookAtWorld(0,0);
    });
    await sleep(1600);evidence.bust=await snap();
    await page.screenshot({path:`${out}/bust.png`});
    assert.equal(evidence.bust.render.bust.present,true,'the optional bust remains solid in the changing world');
    assert.deepEqual(evidence.bust.render.stats.glErrors,[]);
    checks.push('Optional bust remains present on the same physical ground');
  }
}finally{
  await writeFile(`${out}/live.json`,JSON.stringify({baseline,checks,errors,evidence},null,2));
  await browser.close();
}
if(errors.length){console.error(errors);process.exitCode=1;}
