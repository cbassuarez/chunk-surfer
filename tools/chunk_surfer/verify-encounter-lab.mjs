import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.GAME_URL||'http://127.0.0.1:5203',output='artifacts/encounter-lab';
await mkdir(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-angle=metal']});
const errors=[];let page, recording;
try{
  page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const state=()=>page.evaluate(()=>window.__encounterLab.snapshot());
  const phase=id=>page.waitForFunction(id=>window.__encounterLab?.snapshot().sequence.phase===id,{timeout:20000},id);
  const shot=name=>page.screenshot({path:`${output}/${name}.png`});
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.goto(`${base}/encounter-lab.html`);await page.waitForFunction(()=>!!window.__encounterLab);await page.evaluate(()=>document.fonts.ready);await sleep(150);
  if(process.env.RECORD_ENCOUNTER==='1')recording=await page.screencast({path:`${output}/walkthrough.webm`,fps:30,ffmpegPath:'/opt/homebrew/bin/ffmpeg'});
  await shot('01-exploration');
  await page.click('#approach');await phase('versus');await shot('02-splash-live');
  await phase('reveal');await sleep(500);await shot('03-reveal');
  await phase('dialogue');await shot('04-dialogue');
  assert.equal((await state()).combat,null);
  await page.keyboard.press('Enter');await phase('equipment');await sleep(400);
  assert.equal((await state()).combat,null);assert.equal((await state()).sequence.canAct,false);
  await shot('05-equipment');
  // A carried key cannot accidentally start the first turn.
  await page.evaluate(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true})));
  assert.equal((await state()).sequence.phase,'equipment');
  await page.click('[data-slot="2"]');await page.click('[data-gear="radio"]');
  assert.deepEqual((await state()).loadout.top,['light','recorder','radio','tuning-fork']);
  await page.click('#skills-tab');await sleep(80);
  assert.equal((await state()).build.unspent,2);
  await page.click('[data-skill="torch.whiteout"]');await page.click('#patch-action');
  assert.equal((await state()).build.unspent,1);assert.ok((await state()).build.techniques.includes('torch.whiteout'));
  await shot('06-skills');
  // Pulling the supply must return the dependent lead too, using the real reducer.
  await page.click('[data-skill="torch.afterimage"]');await page.click('#patch-action');
  assert.equal((await state()).build.unspent,3);assert.ok(!(await state()).build.techniques.includes('torch.whiteout'));
  await page.click('#patch-action');assert.equal((await state()).build.unspent,2);
  await page.click('[data-skill="torch.whiteout"]');await page.click('#patch-action');
  await page.click('#equipment-tab');assert.equal((await state()).loadout.top[2],'radio');
  await page.click('#ready');await phase('fight');await sleep(120);await shot('07-battle');
  assert.equal((await state()).combat.tools.rig,false);assert.equal((await state()).combat.tools.radio,true);
  assert.ok((await state()).combat.techniques.includes('torch.whiteout'));
  const before=(await state()).combat;
  await page.click('[data-tool="recorder"]');await page.click('[data-move="monitor"]');
  await page.waitForFunction(()=>!window.__encounterLab.snapshot().resolving);await shot('08-first-turn');
  const after=(await state()).combat;assert.ok(after.take,'monitor captured a real take');assert.ok(after.cycleIndex>before.cycleIndex,'enemy turn resolved');
  if(recording){await sleep(800);await recording.stop();recording=null;}
  await page.keyboard.press('Escape');assert.equal((await state()).sequence.canAct,false);await page.keyboard.press('Escape');
  // Review samples are deterministic and have no player saves or live microphone.
  await page.click('[data-preview="versus"]');await sleep(150);await shot('09-splash-study');
  await page.click('#motion-option');assert.equal((await state()).reduced,true);
  await page.click('#dialogue-option');await page.click('#replay');await phase('equipment');
  assert.ok(!(await state()).history.includes('dialogue'));assert.equal((await state()).combat,null);
  await page.setViewport({width:1024,height:720});await sleep(160);await shot('10-equipment-compact');
  await page.click('#skills-tab');await sleep(120);await shot('11-skills-compact');
  for(const width of [1024,800,480]){
    await page.setViewport({width,height:width===480?900:720});await sleep(100);
    for(const tab of ['equipment','skills']){
      await page.click(`#${tab}-tab`);await sleep(80);
      const layout=await page.evaluate(()=>{const m=document.getElementById('module').getBoundingClientRect(),r=document.getElementById('ready').getBoundingClientRect(),g=document.getElementById('game').getBoundingClientRect();return{module:{x:m.x,y:m.y,right:m.right,bottom:m.bottom},ready:{y:r.y,bottom:r.bottom},game:{y:g.y,bottom:g.bottom},w:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};});
      assert.ok(layout.module.x>=0&&layout.module.right<=layout.w,`${width} module fits`);
      assert.ok(layout.ready.bottom<=layout.game.bottom,`${width} ready is reachable`);assert.equal(layout.overflow,false,`${width} no horizontal overflow`);
      await shot(`12-${tab}-${width}`);
    }
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/report.json`,JSON.stringify({result:'PASS',realCombat:true,phases:['called','intrusion','versus','battle','reveal','dialogue','equipment','arming','fight'],viewports:[1440,1024,800,480],checks:['turn gate','held input','optional dialogue','gear replacement','skill prerequisites and refund','build applied to combat','real first turn','pause','reduced motion','layout'],errors},null,2));
  console.log(`PASS — encounter prototype. Screenshots: ${output}`);
}catch(error){console.error(errors,await page?.evaluate(()=>window.__encounterLab?.snapshot()));await page?.screenshot({path:`${output}/failure.png`});throw error;}finally{if(recording)await recording.stop();await browser.close();}
