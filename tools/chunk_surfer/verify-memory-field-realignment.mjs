// Run against a local production build with STATION_VERIFY_URL set.
// Fixture entry, seek and camera guidance are explicit in the receipt.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const url = process.env.STATION_VERIFY_URL;
assert.ok(url, 'Set STATION_VERIFY_URL to the final production preview; no stale default build is selected.');
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Use a local production preview.');
const out = process.env.FIELD_OUT || 'artifacts/memory-field-realignment/after';
await mkdir(out, { recursive: true });
const profile = await mkdtemp('/private/tmp/chunk-surfer-field-');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [], diagnostics = [], snapshots = {};
let browser, page, failure = null;

async function hold(key, ms) {
  await page.keyboard.down(key);
  try { await sleep(ms); } finally { await page.keyboard.up(key); }
  await sleep(180);
}

try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: profile, headless: true, protocolTimeout: 120000,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
      '--disk-cache-size=1', '--media-cache-size=1', '--disable-gpu-shader-disk-cache'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  page.on('pageerror', (error) => { errors.push(String(error)); console.error('PAGEERROR', String(error)); });
  page.on('console', (message) => {
    if (/shader.*error|GLSL.*error|ERROR: 0:/i.test(message.text())) errors.push(message.text());
    if (message.type() === 'error' && !message.text().includes('Failed to load resource') && diagnostics.length < 40) diagnostics.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && diagnostics.length < 40) diagnostics.push(`${response.status()}: ${new URL(response.url()).pathname}`);
  });
  page.on('requestfailed', (request) => {
    if (diagnostics.length < 40) diagnostics.push(`${request.failure()?.errorText}: ${request.url()}`);
  });
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.ok(response?.ok(), `production preview must serve successfully (${response?.status()})`);
  await page.waitForFunction(() => window.__probe?.testRun
    && ['eula', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 90000 });
  await page.evaluate(async () => {
    await window.__probe.testRun(); window.__probe.tutSkip();
    window.__probe.hush();
  });
  await page.evaluate(() => window.__chunkSurferDisplay.setRenderScale(.75));
  await sleep(350);
  snapshots.build = await page.evaluate(() => ({ url: location.href, scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
    resources: performance.getEntriesByType('resource').filter((entry) => /\/assets\/.*\.js(?:\?|$)/.test(entry.name)).map((entry) => entry.name) }));
  assert.ok(snapshots.build.scripts.some((src) => /\/assets\/.*\.js(?:\?|$)/.test(src)), 'capture must load a built production bundle');
  assert.ok(!snapshots.build.scripts.some((src) => /\/src\/|@vite/.test(src)), 'development module rendering is outside this check');
  if (process.env.STATION_VERIFY_BUNDLE) assert.ok(snapshots.build.scripts.some((src) => new URL(src).pathname.endsWith(`/assets/${process.env.STATION_VERIFY_BUNDLE}`)),
    `capture must load the intended bundle ${process.env.STATION_VERIFY_BUNDLE}`);
  async function field(){return page.evaluate(()=>{
    const probe=window.__probe,scene=window.__scenes.top(),field=probe.sixLoop.lastMinutes.field.view(),station=probe.stationField();
    return {scene:scene?.id,field,station:station.view?{view:station.view,session:station.session,renderer:station.renderer}:null,
      display:window.__chunkSurferPixelMesh?.status?.(),camera:probe.sixLoop.lastMinutes.world().eye};
  });}
  async function shot(name){
    assert.deepEqual(errors,[]);
    snapshots[name]=await field();
    await page.screenshot({path:out+'/'+name+'.png'});
    console.log('CAPTURE',name);
  }
  async function performanceSample(){
    return page.evaluate(async()=>{
      const screen=window.__chunkSurferPixelMesh, first=screen.status(), began=performance.now(), intervals=[];
      let previous=began;
      await new Promise(resolve=>requestAnimationFrame(function tick(at){
        intervals.push(at-previous);previous=at;
        if(at-began<2300)requestAnimationFrame(tick);else resolve();
      }));
      const last=screen.status(),seconds=(previous-began)/1000,frames=last.framesRendered-first.framesRendered;
      intervals.sort((a,b)=>a-b);
      return {frames,seconds,fps:frames/seconds,p95FrameIntervalMs:intervals[Math.floor(intervals.length*.95)],
        sceneWidth:last.sceneWidth,sceneHeight:last.sceneHeight};
    });
  }
  async function locateScene(name,expression){
    await page.waitForFunction(expression,{timeout:80000});
    console.log('READY',name);
  }
  async function preset(route){
    await page.evaluate(async route=>{
      if(route==='chapel')await window.__probe.chapelOutskirtsPreset(125);
      else await window.__probe.bellsPreset(440);
      window.__probe.hush();
    },route);
    await sleep(500);
  }
  async function enterStation(visit='second',route='chapel',{physical=false}={}){
    await preset(route);
    const door=await page.evaluate(visit=>window.__probe.doorFieldDoors().find(d=>d.fieldId===visit&&!d.shut),visit);
    assert.ok(door,`missing ${route} ${visit} door`);
    if (physical) {
      await page.evaluate(d=>{
        const [a,b]=d.threshold,n=d.normal,p=window.__probe;
        p.sourceWarp((a.x+b.x)/2+n[0]*2.4,(a.y+b.y)/2+n[2]*2.4);
        p.lookAtWorld(Math.atan2(-n[0],n[2]),0);p.hush();
      },door);
      await sleep(300);
      for(let i=0;i<5;i++){
        await page.keyboard.press('e');await sleep(270);
        if(await page.evaluate(id=>window.__probe.doorFieldDoors().find(d=>d.id===id)?.opened,door.id))break;
      }
      assert.equal(await page.evaluate(id=>window.__probe.doorFieldDoors().find(d=>d.id===id)?.opened,door.id),true);
      await shot('chapel-open-field-preview');
      await hold('w',1300);
    } else {
      await page.evaluate(d=>{const p=window.__probe;p.lookAtWorld(Math.atan2(-d.normal[0],d.normal[2]),0);p.crossFieldDoor(d.id);},door);
    }
    await locateScene(route+':'+visit,()=>window.__probe.stationField()?.view?.ready);
    await sleep(3000);
  }
  async function film(name,seconds){
    if (!process.env.FIELD_FILM) return;
    const timing=await field();
    const data=await page.evaluate(async ms=>{
      const canvas=document.querySelector('canvas.r3d');
      const stream=canvas.captureStream(30), audio=window.__probe.stationFieldCaptureAudio(), chunks=[];
      for(const track of audio?.stream.getAudioTracks()||[]) stream.addTrack(track);
      const recorder=new MediaRecorder(stream,{mimeType:audio?'video/webm;codecs=vp8,opus':'video/webm;codecs=vp8',videoBitsPerSecond:6400000});
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.start(250);await new Promise(resolve=>setTimeout(resolve,ms));
      return new Promise(resolve=>{recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>{audio?.dispose();stream.getVideoTracks().forEach(t=>t.stop());resolve(reader.result);};reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};recorder.stop();});
    },seconds*1000);
    await writeFile(out+'/'+name+'.webm',Buffer.from(data.split(',')[1],'base64'));
    snapshots[name]={camera:timing,seconds};console.log('MOTION',name);
  }
  async function face(yaw,pitch){await page.evaluate(v=>window.__scenes.top().setLook(v),{yaw,pitch});await sleep(150);}
  async function canonicalTime(t){
    await page.evaluate(t=>{
      const scene=window.__probe.sixLoop.lastMinutes.field.scene();const state=scene.view().state;
      scene.place({elapsed:t,ant:{...state.ant,t},leaving:null});
      for(let i=0;i<55;i++)scene.update(.1);
    },t);
    await sleep(240);
  }
  assert.equal(await page.evaluate(()=>window.__probe.sixLoop.lastMinutes.field.begin('second')),true);
  await locateScene('canonical ant',()=>window.__probe.sixLoop.lastMinutes.field.view()?.ready&&window.__scenes.top()?.id==='memory-field');
  await canonicalTime(13.3);
  await shot('canonical-ant-crossing');
  await film('canonical-ant-in-motion',5);
  await canonicalTime(28.8);
  await shot('canonical-ant-pebble');
  await hold('w',180);
  await page.waitForFunction(()=>window.__probe.sixLoop.lastMinutes.field.view()?.state.ant?.why==='stood',{timeout:15000});
  await page.waitForFunction(()=>window.__probe.sixLoop.lastMinutes.field.view()?.state.eyeH>1.617,{timeout:12000});
  await page.waitForFunction(()=>window.__scenes.top()?.allowsLook===true,{timeout:12000});
  await hold('s',245);
  await page.evaluate(()=>{const scene=window.__scenes.top(),s=scene.view().state;scene.setLook({yaw:Math.atan2(-s.x,.42+s.z),pitch:Math.atan2(.04-s.eyeH,Math.hypot(s.x,.42+s.z))});});
  await sleep(380);
  await shot('canonical-standing-slab');
  snapshots.canonicalResult=await field();
  await page.evaluate(()=>{const scene=window.__probe.sixLoop.lastMinutes.field.scene();const state=scene.view().state;scene.place({leaving:{at:state.elapsed-15,why:'over'}});});
  await page.waitForFunction(()=>!window.__probe.sixLoop.lastMinutes.field.view(),{timeout:12000});
  await enterStation('second','chapel',{physical:true});
  await shot('chapel-station-entry');
  snapshots.performance=await performanceSample();
  await face(0,-.78);
  await hold('w',760);
  const stage=await field();
  assert.ok(stage.station.view.state.z<1.4);
  await face(0,Math.atan2(.04-1.62,.42+stage.station.view.state.z));
  await shot('chapel-station-slab');
  await page.keyboard.press('e');
  const witnessed=await field();
  assert.equal(witnessed.station.view.witness.inspected,true);
  await face(.08,.20);
  await sleep(Number(process.env.FIELD_DEFORMATION_WAIT||17700));
  await shot('chapel-station-unmaking');
  snapshots.unmakingPerformance=await performanceSample();
  await film('chapel-station-unmaking-in-motion',4);
  await face(Math.PI,0);
  await hold('w',1780);
  await page.waitForFunction(()=>!window.__probe.stationField()?.session,{timeout:12000});
  snapshots.chapelReturn=await field();
  await enterStation('second','tower');
  await shot('tower-station-entry');
  snapshots.towerEntry=await field();
  await face(Math.PI,0);
  await hold('w',700);
  await page.waitForFunction(()=>!window.__probe.stationField()?.session,{timeout:12000});
  snapshots.towerReturn=await field();
  if (process.env.FIELD_LATE === '1') {
    await enterStation('fourth','tower');
    const late=await field();
    const {x,z}=late.station.view.state;
    await face(Math.atan2(.5-x,7+z),0);
    await hold('w',3050);
    await shot('tower-fourth-van-door');
    const p=(await field()).station.view.state;
    await face(Math.atan2(-13.2-p.x,12+p.z),-.04);
    await hold('w',4750);
    const q=(await field()).station.view.state;
    await face(Math.atan2(-14-q.x,12+q.z),-.25);
    await hold('w',1120);
    await shot('tower-fourth-fence-jumper');
  }
  snapshots.loaded = await page.evaluate(() => ({ url: location.href,
    scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
    resources: performance.getEntriesByType('resource').filter((entry) => /\/assets\/.*\.js(?:\?|$)/.test(entry.name)).map((entry) => entry.name) }));
  assert.deepEqual(errors, [], 'no JavaScript or shader errors in the completed production capture');
} catch (error) {
  failure = String(error?.stack || error); console.error(error); process.exitCode = 1;
  if (page) {
    try {
      snapshots.failure = await page.evaluate(() => ({ realm: window.__probe?.stationRealm?.(), reward: window.__probe?.stationErrand?.(), scene: window.__scenes?.top()?.id || null }));
      await page.screenshot({ path: `${out}/failure.png` });
    } catch {}
  }
} finally {
  try {
    if (!failure) await rm(`${out}/failure.png`, { force: true });
    await writeFile(`${out}/report.json`, JSON.stringify({ passed: failure === null, failure,
      scope: 'Actual production game final dither in isolated Chrome. Visit and starting positions are staged. Time and gaze are guided. Keyboard opens and crosses the chapel door, stands, walks, inspects and returns. The tower entrance is staged and its return uses the keyboard. No packaged-native, earned playthrough, or fresh-player validation.',
      errors, diagnostics, snapshots }, null, 2));
  } finally {
    try { await browser?.close(); } finally { await rm(profile, { recursive: true, force: true }); }
  }
}
