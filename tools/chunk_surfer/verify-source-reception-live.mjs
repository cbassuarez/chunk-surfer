// Disposable review save; real W/E/Space input drives exploration and escape.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='artifacts/source-spirit-jail-design/implementation',errors=[],checks=[],snapshots={};
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
page.on('pageerror',e=>{errors.push(String(e));console.log('PAGE ERROR',String(e));});
page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404')){errors.push(m.text());console.log('CONSOLE ERROR',m.text());}});
page.on('response',r=>{if(r.status()>=400)console.log('RESOURCE',r.status(),r.url());});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const at=()=>page.evaluate(()=>window.__probe.sourceReception().player);
async function aim(x,z,pitch=0){await page.evaluate(({x,z,pitch})=>{const p=window.__probe,a=p.sourceReception().player;p.lookAtWorld(Math.atan2(x-a.x,-(z-a.z)),pitch);},{x,z,pitch});}
async function point(target){
  let previous=await at(),stalled=0;
  for(let n=0;n<350;n++){
    const p=await at();if(Math.hypot(p.x-target.x,p.z-target.z)<.36)return;
    await aim(target.x,target.z);
    await page.keyboard.down('w');await sleep(140);await page.keyboard.up('w');
    const now=await at();stalled=Math.hypot(now.x-previous.x,now.z-previous.z)<.02?stalled+1:0;previous=now;
    if(stalled>8)throw Error(`Walk stalled ${JSON.stringify({target,at:now,frame:await page.evaluate(()=>window.__probe.sourceReception())})}`);
  }
  throw Error('Walk timed out');
}
async function walk(id){
  const route=await page.evaluate(async id=>{const {lastReceptionPath}=await import('/src/game/source-last-reception.js'),{SOURCE_LAST_RECEPTION:S}=await import('/src/data/source-last-reception.js');return lastReceptionPath(window.__probe.sourceReception().player,S.anchors[id]);},id);
  assert.ok(route.length,`route to ${id}`);for(const p of route)await point(p);
}
async function talk(id){
  const actor=await page.evaluate(id=>window.__probe.sourceReception().residents.find(a=>a.id===id),id);
  await aim(actor.x,actor.z,.02);await sleep(120);await page.keyboard.press('e');await sleep(120);
  const top=await page.evaluate(()=>window.__scenes.top()?.id);assert.ok(top?.includes('source-reception:'),`E talks to ${id}, got ${top}`);
  const before=await page.evaluate(()=>window.__probe.sourceReception().elapsed);
  await sleep(350);
  assert.equal(await page.evaluate(()=>window.__probe.sourceReception().elapsed),before,'reading stops jail time');
  for(let n=0;n<25;n++){
    if(!(await page.evaluate(()=>window.__scenes.top()?.id||'')).includes('source-reception:'))break;
    await page.keyboard.press('Space');await sleep(100);
  }
  assert.ok(!(await page.evaluate(()=>window.__scenes.top()?.id||'')).includes('source-reception:'),'conversation finishes');
  await page.evaluate(()=>window.__probe.hush());
}
async function evidence(name){
  snapshots[name]=await page.evaluate(()=>({position:window.__probe.pos(),reception:window.__probe.sourceReception(),source:window.__probe.chunkSurf(),props:window.__probe.sourceProps(),pack:window.__probe.props().pack,lighting:window.__probe.r3dLighting(),characters:window.__receptionP3.characterStats(),pixelMesh:window.__chunkSurferPixelMesh?.lookStatus?.(),rec:window.__probe.rec()}));
  await page.screenshot({path:`${out}/${name}.png`});
  for(const stage of ['props','scene']){const data=await page.evaluate(stage=>window.__receptionR3.r3dCaptureStageCanvas(stage)?.toDataURL('image/png'),stage);if(data)await writeFile(`${out}/${name}-${stage}.png`,Buffer.from(data.split(',')[1],'base64'));}
  console.log('EVIDENCE',name,JSON.stringify({at:snapshots[name].reception.player,phase:snapshots[name].reception.phase,assets:snapshots[name].characters.meshes.filter(n=>n.includes('reception')),errors:snapshots[name].characters.poseErrors}));
}
try{
  await page.goto((process.env.SOURCE_RECEPTION_URL||'http://127.0.0.1:5318')+'/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0',{waitUntil:'domcontentloaded',timeout:90000});
  console.log('BOOT page loaded');
  await page.waitForFunction(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
  await page.evaluate(async()=>{
    const p=window.__probe;await p.testRun();p.tutSkip();p.sourcePreset('last-reception');p.hush();p.propDiagnostics(true);
    const url=path=>performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name||path;
    window.__receptionP3=await import(url('/src/render/props3d.js'));window.__receptionR3=await import(url('/src/render/r3d.js'));
  });
  console.log('BOOT reception checkpoint active');
  await page.bringToFront();
  await page.waitForFunction(()=>window.__receptionP3.characterStats().meshes.includes('source_reception_host'),{timeout:90000});
  await aim(-63,-450);await sleep(250);await evidence('01-exterior');
  await walk('mainInside');await talk('host');await aim(-79,-450);await evidence('02-lounge');
  await walk('lounge');await aim(-66.1,-447.7,-.06);await evidence('09-seated-guest');
  await walk('returnDoor');await walk('returnRoom');await walk('release');await walk('serviceLink');await walk('serviceRoom');await walk('serviceOutside');
  assert.equal(await page.evaluate(()=>window.__probe.sourceReception().phase),'exploring');checks.push('both exits freely walkable before reveal');
  await walk('serviceRoom');await walk('serviceLink');await walk('returnRoom');
  await point({x:-62.5,z:-457,y:9});await talk('warning');
  await walk('westLink');await walk('westLoop');await walk('window');
  await talk('window');
  await walk('stairToe');await walk('stairFoot');await walk('galleryTop');await walk('gallery');
  assert.ok(Math.abs((await at()).y-11.8)<.1);await aim(-64,-450,-.2);await evidence('03-gallery');
  await walk('galleryTop');await walk('stairFoot');await walk('stairToe');await walk('window');
  assert.ok(Math.abs((await at()).y-9)<.1);checks.push('gallery walked up and down without jump or warp');
  await talk('window');
  await evidence('04-public-reveal');
  await walk('westLoop');await walk('westLink');await walk('returnRoom');await walk('release');await walk('serviceLink');await walk('serviceRoom');await walk('serviceOutside');
  assert.equal(await page.evaluate(()=>window.__probe.sourceReception().phase),'escaped');checks.push('real keyboard service escape succeeds under convergence');
  await aim(-63,-460);await evidence('05-escaped');
  await walk('serviceRoom');await walk('serviceLink');await walk('returnRoom');
  assert.equal(await page.evaluate(()=>window.__probe.sourceReception().phase),'escaped');checks.push('return visit remains explorable without another trap');
  // A second disposable visit exercises the failure branch using the same
  // spoken discovery, then deliberately remains beside the window resident.
  await page.evaluate(()=>{window.__probe.sourcePreset('last-reception');window.__probe.hush();});
  await walk('mainInside');await walk('returnDoor');await walk('returnRoom');await walk('westLink');await walk('westLoop');await walk('window');
  await talk('window');
  const beforeCapture=await page.evaluate(()=>window.__probe.rec());
  await talk('window');
  await page.waitForFunction(()=>window.__probe.sourceReception().phase==='captured',{timeout:20000});
  await page.keyboard.press('Escape');
  const heldAt=await page.evaluate(()=>window.__probe.sourceReception().phaseElapsed);
  await sleep(500);
  assert.equal(await page.evaluate(()=>window.__probe.sourceReception().phaseElapsed),heldAt,'pause stops capture beat');
  await evidence('06-captured');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__probe.sourceReception().phase==='released',{timeout:10000});
  await page.evaluate(()=>window.__probe.hush());await aim(-64,-460,-.08);await evidence('07-imprint');
  const afterCapture=await page.evaluate(()=>window.__probe.rec());
  for(const key of ['injuries','composure','maxComposure','takes'])assert.deepEqual(afterCapture[key],beforeCapture[key],`capture preserves ${key}`);
  assert.equal(snapshots['07-imprint'].reception.residents.filter(a=>a.id==='imprint').length,1);
  await page.keyboard.press('f');await sleep(200);await evidence('08-torch-off');await page.keyboard.press('f');
  await walk('serviceLink');await walk('serviceRoom');await walk('serviceOutside');
  assert.equal(await page.evaluate(()=>window.__probe.sourceReception().phase),'released');
  checks.push('capture pauses safely, retains one dithered imprint and releases to the same bank without global injury');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors},null,2));
}catch(error){errors.push(String(error));console.error(error);await evidence('failure').catch(()=>{});process.exitCode=1;}
finally{await writeFile(`${out}/live-report.json`,JSON.stringify({checks,errors,snapshots},null,2));await browser.close();}
