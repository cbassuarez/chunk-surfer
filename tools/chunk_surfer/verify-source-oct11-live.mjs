import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const out = 'artifacts/source-oct11-audit';
await mkdir(out, {recursive:true});
const browser = await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true, protocolTimeout:120000,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling'],
});
const page = await browser.newPage(), errors = [], evidence = {}, checks = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {
  if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail/i.test(message.text())) errors.push(message.text());
});
await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
await page.evaluateOnNewDocument(() => Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
try {
  const url=new URL(process.env.SOURCE_FIX_BASE || 'http://127.0.0.1:5297/');
  for(const [key,value] of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1',sam:'0',nothink:'1'}))url.searchParams.set(key,value);
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(() => window.__probe?.testRun && ['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
  await page.evaluate(async () => {await window.__probe.testRun();window.__probe.tutSkip();});
  for (const [name,stage,depth] of [
    ['ghost-forward','first-contact',0],['ghost-torch-on','first-contact',0],['splat-head','horizon',0],['splat-middle','horizon',120],['splat-tail','horizon',380],
  ]) {
    await page.evaluate(async ({stage,depth}) => {
      if (stage === 'horizon') await window.__probe.horizonPreset(depth);
      else window.__probe.sourcePreset(stage);
      const moduleUrl = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/game/speech.js')?.name;
      if (moduleUrl) (await import(moduleUrl)).clearSpeech?.();
    },{stage,depth});
    await sleep(1800);
    if (stage !== 'horizon') {
      await page.evaluate(() => window.__probe.lookAtWorld(0,0));
      const torchOn = await page.evaluate(() => !!window.__probe.rec().light);
      if (torchOn !== (name === 'ghost-torch-on')) await page.keyboard.press('f');
      await sleep(1000);
    }
    evidence[name] = await page.evaluate(() => ({
      state:window.__probe.chunkSurf(), presence:window.__probe.presence(), pos:window.__probe.pos(),
      body:window.__probe.hushBody?.(), horizon:window.__probe.horizonFrame?.(),
      props:window.__probe.props(), top:window.__scenes?.top()?.id,
    }));
    await page.screenshot({path:`${out}/${name}.png`});
    console.log('CAPTURE',name,JSON.stringify({pos:evidence[name].pos,presence:evidence[name].presence,body:evidence[name].body,phase:evidence[name].state.phase}));
    if(stage!=='horizon') {
      const p=evidence[name].body.projection;
      assert.ok(p.amount>.9&&p.w>.02&&p.h>.15&&p.x>.25&&p.x<.75&&p.y>0&&p.y<1,'Pressure resolves in forward view');
      assert.equal(evidence[name].presence.active,true);
      checks.push(`${name}: Pressure projects within the forward view`);
    }
  }
  await page.evaluate(()=>{window.__probe.sourcePreset('final');const at=window.__probe.edgeDoorApproach();window.__probe.sourceWarp(at.x,at.y);window.__probe.lookAtWorld(0,0);});
  await sleep(800);
  if(await page.evaluate(()=>!!window.__probe.rec().light)) await page.keyboard.press('f');
  evidence.doorsBefore=await page.evaluate(()=>({row:window.__probe.edgeDoorField(),props:window.__probe.sourceProps(),state:window.__probe.chunkSurf(),pos:window.__probe.pos()}));
  assert.equal(evidence.doorsBefore.row.filter(d=>d.real).length,1);
  assert.ok(evidence.doorsBefore.row.length>=30);
  await page.evaluate(()=>window.__probe.lookAtWorld(.65,0));
  await sleep(250);await page.screenshot({path:`${out}/doors-row.png`});
  const fake=evidence.doorsBefore.row.find(d=>d.index===1);
  await page.evaluate(fake=>{window.__probe.sourceWarp(Math.round(fake.x),Math.ceil(fake.y)+1);window.__probe.lookAtWorld(0,0);},fake);
  await sleep(300);await page.screenshot({path:`${out}/door-fake-before.png`});
  await page.keyboard.press('f');await sleep(300);
  await page.screenshot({path:`${out}/door-fake-torch-on.png`});
  await page.keyboard.press('f');await sleep(150);
  await page.keyboard.press('w');await sleep(400);
  evidence.fakeAfter=await page.evaluate(()=>({row:window.__probe.edgeDoorField(),props:window.__probe.sourceProps(),state:window.__probe.chunkSurf(),pos:window.__probe.pos()}));
  assert.equal(evidence.fakeAfter.row.find(d=>d.index===1).erased,true,'real W touch erases a fake');
  assert.equal(evidence.fakeAfter.state.phase,evidence.doorsBefore.state.phase,'fake does not exit Source');
  assert.ok(!evidence.fakeAfter.props.some(p=>p.id===fake.id),'fake assembly removed from submissions');
  await page.screenshot({path:`${out}/door-fake-gone.png`});
  checks.push('Actual W touch removes fake pair without opening a passage');
  await page.evaluate(()=>{const at=window.__probe.edgeDoorApproach();window.__probe.sourceWarp(at.x,at.y);window.__probe.lookAtWorld(0,0);});
  await sleep(300);await page.keyboard.press('e');await sleep(1000);
  evidence.realOpen=await page.evaluate(()=>({door:window.__probe.edgeDoor(),pos:window.__probe.pos(),state:window.__probe.chunkSurf()}));
  assert.ok(evidence.realOpen.door.passable,'E swings the real pair open');
  await page.screenshot({path:`${out}/door-real-open.png`});
  await page.keyboard.down('w');await sleep(1800);await page.keyboard.up('w');await sleep(300);
  evidence.throughReal=await page.evaluate(()=>({door:window.__probe.edgeDoor(),pos:window.__probe.pos(),state:window.__probe.chunkSurf()}));
  assert.equal(evidence.throughReal.state.phase,'horizon','real movement crosses into telephone walk');
  await page.screenshot({path:`${out}/door-real-through.png`});
  checks.push('Actual E and W open the sole real pair and cross continuously into the telephone walk');
} finally {
  await writeFile(`${out}/live.json`,JSON.stringify({evidence,checks,errors},null,2));
  await browser.close();
}
if (errors.length) {console.error(errors);process.exitCode=1;}
