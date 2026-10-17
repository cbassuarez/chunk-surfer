// Actual game character acceptance. Diagnostic warps visit only the woman's
// existing authored placements; every capture uses the game's own material,
// scene composition and VFD/dither targets.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CELL } from '../../src/data/floorplan/legend.js';
import { SOURCE_PRE_TAPE } from '../../src/data/source-level.js';
import { OUTSKIRT_STRETCH_START, OUTSKIRT_STRETCH_METRES } from '../../src/data/source-outskirts-arrival.js';

const url = process.env.BUS_WOMAN_VERIFY_URL || 'http://127.0.0.1:5330/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Local verification only.');
const out = resolve(process.env.BUS_WOMAN_VERIFY_OUT || 'artifacts/bus-woman-wrong-origin/live-final');
const stageForReturn = [0,0,1,1,2,2,2,3,3,3,4,4,5];
const stageMesh = stage => stage ? `outskirts_bus_woman_wrong_origin_${stage}` : 'outskirts_bus_woman';
const wrongOriginAssetHash = createHash('sha256').update(await readFile(resolve('public/assets/outskirts-bus-woman-wrong-origin.glb'))).digest('hex');
const expectedAssetHash = createHash('sha256').update(await readFile(resolve('public/assets/bus-woman-character.glb'))).digest('hex');
const sleep = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const runFile = promisify(execFile);
const checks = [], captures = [], videos = [], errors = [], diagnostics = [], assets = [], requests = new Set();
let continuation = null;
if (process.env.BUS_WOMAN_VERIFY_RESUME) {
  const prior = JSON.parse(await readFile(resolve(process.env.BUS_WOMAN_VERIFY_RESUME), 'utf8'));
  assert.equal(prior.wrongOriginAssetHash, wrongOriginAssetHash, 'continuation must use the identical accepted actor bytes');
  assert.equal(prior.expectedAssetHash, expectedAssetHash, 'continuation must use the identical canonical actor bytes');
  assert.ok(prior.checks.every(check => check.pass) && !prior.errors.length, 'continuation cannot reuse failed game checks');
  assert.equal(prior.captures.filter(capture => /^return-\d+-stage-\d-torch$/.test(capture.name)).length, 13, 'continuation requires all thirteen completed actual captures');
  checks.push(...prior.checks); captures.push(...prior.captures); videos.push(...prior.videos);
  continuation = { report: resolve(process.env.BUS_WOMAN_VERIFY_RESUME), previousFatal: prior.fatal,
    reason: 'Completed exact-hash core retained; finish fixture moves within the existing 1.6m P8 inspection reach.', previousGeneratedAt: prior.generatedAt };
}
let browser, page, profile, fatal = null, failureState = null, bootCheckpoint = null, stage = 'boot', propsModuleUrl, renderModuleUrl;
function check(pass, name, detail) {
  checks.push({ pass: !!pass, name, detail }); console.log(pass ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail) : '');
  assert.ok(pass, name);
}
async function state(renderStages = null) {
  return page.evaluate(async ({ propsModuleUrl, renderModuleUrl, renderStages }) => {
    const P = propsModuleUrl ? await import(propsModuleUrl) : null;
    const R = renderModuleUrl ? await import(renderModuleUrl) : null;
    const p = window.__probe;
    const result={ pos: p.pos(), look: p.lookAngles(), scene: window.__scenes.top({ includeOverlay: true })?.id,
      light: !!p.rec().light, torch:p.torch(), presentation: p.busWomanPresentation(), convo: p.convo(),
      reflection: p.reflection(),
      dither: R?.r3dPixelMeshStatus(), lookProfile: R?.r3dLookStatus(),
      frontEndNegative: p.frontEndGrade(), lighting: R?.r3dLightingDebug(), frontEndPlate: R?.r3dFrontEndPlate(),
      characters: P ? { ...P.characterStats(), poses: P.characterStats().poses.filter(p => /bus_woman/.test(p.mesh)) } : null };
    if(renderStages)result.renderTargets=Object.fromEntries(renderStages.map(stage=>[stage,p.sourceShoreCapture(stage)]));
    return result;
  }, { propsModuleUrl, renderModuleUrl, renderStages });
}
async function until(predicate, timeout = 15000) {
  const stop = Date.now() + timeout; let current;
  while (Date.now() < stop) { current = await state(); if (predicate(current)) return current; await sleep(80); }
  throw new Error(`Timed out at ${stage}; scene=${current?.scene}; source=${current?.presentation?.source}; clock=${current?.presentation?.clock?.clock}`);
}
const body = (s, id) => s.presentation.instances.find(p => p.id === id && /^(exterior_bus_woman|outskirts_bus_woman(?:_wrong_origin_[1-5])?)$/.test(p.mesh));
function frame(p) {
  if (p.matrix) return { x: p.matrix[12], y: p.matrix[13], z: p.matrix[14],
    front: [-p.matrix[8], -p.matrix[10]], right: [p.matrix[0], p.matrix[2]] };
  return { x: p.x, y: p.y, z: p.z, front: [Math.sin(p.yaw || 0), -Math.cos(p.yaw || 0)], right: [Math.cos(p.yaw || 0), Math.sin(p.yaw || 0)] };
}
async function aim(target, camera, targetHeight = 1.05) {
  const distance = Math.hypot(target.x - camera.x, target.z - camera.z);
  const yaw = Math.atan2(target.x - camera.x, -(target.z - camera.z));
  const pitch = Math.atan2(target.y + targetHeight - (camera.y + 1.62), distance);
  await page.evaluate(({ yaw, pitch }) => window.__probe.lookAtWorld(yaw, pitch), { yaw, pitch });
  await sleep(220);
}
async function placeWorld(camera, source) {
  await page.evaluate(({ x, z, source, cell }) => {
    const p = window.__probe;
    if (source) p.sourceWarp(x / cell - .5, z / cell - .5);
    else p.warpRuntime(x / cell - .5, z / cell - .5);
    p.hush();
  }, { ...camera, source, cell: CELL });
  await sleep(220);
}
async function view(id, { front = 2.3, right = 0, height = 1.05, explicit = null } = {}) {
  const s = await until(s => !!body(s, id)); const target = frame(body(s, id));
  const camera = explicit ? { ...explicit, y: explicit.y ?? target.y } : {
    x: target.x + target.front[0] * front + target.right[0] * right,
    z: target.z + target.front[1] * front + target.right[1] * right, y: target.y };
  await placeWorld(camera, s.presentation.source); await aim(target, camera, height);
  return { target, camera };
}
async function torch(on) {
  if ((await state()).light !== on) await page.keyboard.press('f');
  await sleep(250); check((await state()).light === on, `ordinary F sets torch ${on ? 'on' : 'off'}`);
}
async function capture(name, id, timing = null) {
  stage = name;
  const current = await state(['props','scene','vfd','marks']),targets=current.renderTargets;
  delete current.renderTargets;
  check(!!body(current, id), `${name}: existing authored body submitted`, id);
  check(current.characters?.poses.some(p => p.id === id), `${name}: production renderer prepared her rig`);
  check(!current.characters?.poseErrors?.length, `${name}: no character pose errors`, current.characters?.poseErrors);
  check(current.dither?.enabled === true, `${name}: shared pixel-mesh/dither pass is active`, current.dither);
  check(current.dither.lastGlError===0&&!current.dither.lastError,`${name}: actual recorder reports zero GPU errors`);
  if (process.env.BUS_WOMAN_VERIFY_MODE !== 'render') {
    check(current.dither.physicalAcquisition === current.presentation.source, `${name}: physical calibration belongs only to the Source set`);
    if (current.presentation.source) check(Math.abs(current.dither.captureExposure - 3) < .001, `${name}: linear Source capture uses its authored exposure`);
  }
  const file = join(out, `${name}.png`); await page.screenshot({ path: file });
  const pipeline = {};
  for (const renderStage of ['props', 'scene', 'vfd', 'marks']) {
    const encoded = targets[renderStage];
    check(typeof encoded === 'string' && encoded.startsWith('data:image/png;base64,'), `${name}: actual ${renderStage} target is available`);
    const bytes = Buffer.from(encoded.split(',')[1], 'base64'), path = join(out, `${name}-${renderStage}.png`);
    await writeFile(path, bytes); pipeline[renderStage] = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  check(pipeline.props.sha256 !== pipeline.vfd.sha256, `${name}: the final actor passes through scene encoding`);
  check(errors.length === 0, `${name}: no JavaScript/WebGL/character errors`, errors);
  captures.push({ name, file, pipeline, state: current, ...(timing?{timing}:{}), acquisition:'Metadata and all four render targets acquired in one browser turn.' }); console.log('CAPTURE', file);
  return current;
}
async function pauseAtClock(target = null){
  return page.evaluate(target=>new Promise((resolve,reject)=>{
    const deadline=performance.now()+60000;
    const poll=()=>{
      const paused=window.__scenes.top({includeOverlay:true})?.id==='pause';
      const clock=window.__probe.busWomanClock().clock;
      if(paused&&target!=null&&clock<target){window.__chunkSurferDisplay.openPause();requestAnimationFrame(poll);return;}
      if(paused||target==null||clock>=target){
        if(!paused)window.__chunkSurferDisplay.openPause();
        resolve(window.__probe.busWomanClock().clock);return;
      }
      if(performance.now()>deadline){reject(new Error('Actual saved-clock boundary was not reached'));return;}
      requestAnimationFrame(poll);
    };
    poll();
  }),target);
}
async function armReceiptFreeze(id){
  await page.evaluate(id=>{
    const before=window.__probe.busWomanClock().woman?.receivedAt,deadline=performance.now()+15000;
    window.__busWomanReceiptFreeze=new Promise((resolve,reject)=>{
      const poll=()=>{
        const frame=window.__probe.busWomanClock();
        if(frame.woman?.receiveId===id&&frame.woman.receivedAt!==before){
          // Same ordinary Escape handler as keyboard input; only dismiss the
          // accepted dialogue, then freeze the real run before its next tick.
          if(String(window.__scenes.top()?.id).startsWith('thought:')){
            window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
            window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',code:'Escape',bubbles:true}));
          }
          if(window.__scenes.top()?.id!=='pause')window.__chunkSurferDisplay.openPause();
          resolve(window.__probe.busWomanClock());return;
        }
        if(performance.now()>deadline){reject(new Error('Ordinary choice never started this actor receipt'));return;}
        requestAnimationFrame(poll);
      };
      poll();
    });
  },id);
}
async function pausedCapture(name, id, {atClock=null,leavePaused=false}={}) {
  // Use the actual desktop/display pause command. Chromium's Escape can be
  // consumed by pointer capture or by the entering speech before the game.
  await pauseAtClock(atClock);
  const before = await state(); await sleep(700); const after = await state();
  let timing=null;
  if(atClock!=null){
    const actualClock=before.presentation.clock.clock;
    timing={targetClock:atClock,actualClock,error:actualClock-atClock,allowedWindow:[atClock,atClock+.101]};
    check(actualClock>=atClock-1e-7&&actualClock<=atClock+.101,`${name}: frozen gesture lies inside its actual planned clock window`,timing);
  }
  check(before.scene==='pause'&&after.scene==='pause',`${name}: actual game pause owns the frozen clock`);
  check(JSON.stringify(before.presentation.clock) === JSON.stringify(after.presentation.clock), `${name}: pause freezes saved performance state`);
  check(JSON.stringify(before.characters.poses) === JSON.stringify(after.characters.poses), `${name}: pause freezes actual character palettes`);
  await capture(name, id, timing);
  if(!leavePaused)await page.evaluate(() => window.__chunkSurferDisplay.openPause());
}
async function recordGameFrames(name, finishAt, scope, metadata = {}) {
  const directory = join(out, `${name}-frames`), file = join(out, `${name}.mp4`);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const frames = [];
  while (true) {
    const current=await page.evaluate(async({renderModuleUrl,actorId})=>{
      const R=await import(renderModuleUrl),p=window.__probe,presentation=p.busWomanPresentation();
      const actor=presentation.instances.find(part=>part.id===actorId);
      return {clock:presentation.clock.clock,clip:actor?.character?.clip,clipTime:actor?.character?.time,mesh:actor?.mesh,
        pos:p.pos(),look:p.lookAngles(),torch:p.torch(),lighting:R.r3dLightingDebug(),dither:R.r3dPixelMeshStatus(),
        encoded:p.sourceShoreCapture('vfd')};
    },{renderModuleUrl,actorId:metadata.actorId||'r12-bus-woman'});
    const {encoded,...observed}=current,clock=current.clock;
    const image = `frame-${String(frames.length).padStart(4, '0')}.png`;
    assert.ok(encoded?.startsWith('data:image/png;base64,'),'Actual VFD review frame is available.');
    assert.ok(current.dither.lastGlError===0&&!current.dither.lastError,'Actual review frame emitted a GPU error.');
    await writeFile(join(directory,image),Buffer.from(encoded.split(',')[1],'base64'));
    frames.push({ image,...observed });
    if(frames.length===1&&metadata.resumeAtStart)await page.evaluate(()=>window.__chunkSurferDisplay.openPause());
    if (clock >= finishAt) break;
    await sleep(60);
    if (frames.length > 200) throw new Error('Review frame capture exceeded its finite bound');
  }
  // Encode actual rendered PNGs using their observed saved-game clock. Direct
  // file output avoids the Chromium/Puppeteer pipe producing an empty MP4.
  const manifest = join(directory, 'frames.ffconcat');
  const lines = ['ffconcat version 1.0'];
  for (let index = 0; index < frames.length; index++) {
    lines.push(`file '${frames[index].image}'`);
    if (index < frames.length - 1) lines.push(`duration ${Math.max(.001, frames[index + 1].clock - frames[index].clock).toFixed(6)}`);
  }
  await writeFile(manifest, lines.join('\n') + '\n');
  const encoded=await encodeReviewFrames(file,manifest,frames.length);
  videos.push({ file,...encoded,frames, startClock: frames[0].clock, endClock: frames.at(-1).clock, scope,...metadata,
    method: 'Actual engine VFD target and clock/lighting read in one browser turn per frame, fixed player view, encoded using saved-clock frame intervals. No viewport HUD/post screenshot or engine tape/export claim.' });
  console.log('VIDEO', file, frames.length, 'actual game frames');
}
async function encodeReviewFrames(file,manifest,frameCount){
  // Reordered B-frames shortened the MP4 duration below its last VFR PTS.
  const encoded=await runFile('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-safe','0','-f','concat','-i',manifest,
    '-fps_mode','vfr','-c:v','libx264','-bf','0','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',file],{maxBuffer:1024*1024});
  const bytes=await readFile(file);
  assert.ok(bytes.length>10000,`Review encoder produced only ${bytes.length} bytes; stderr=${encoded.stderr}`);
  const probed=await runFile('/opt/homebrew/bin/ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_streams','-show_format',
    '-show_entries','stream=codec_name,has_b_frames,nb_frames,duration:format=duration:frame=best_effort_timestamp_time,pkt_duration_time,duration_time','-of','json',file],{maxBuffer:1024*1024});
  const info=JSON.parse(probed.stdout),stream=info.streams[0],last=info.frames.at(-1);
  const lastTimestamp=Number(last?.best_effort_timestamp_time),lastFrameDuration=Number(last?.duration_time??last?.pkt_duration_time);
  const streamDuration=Number(stream.duration),containerDuration=Number(info.format.duration),minimumDuration=lastTimestamp+lastFrameDuration;
  assert.equal(Number(stream.has_b_frames),0,'VFR review encoder must not reorder B-frames.');
  assert.equal(info.frames.length,frameCount,'Saved MP4 lost an atomic captured frame.');
  assert.ok(Number.isFinite(minimumDuration)&&lastFrameDuration>0,'Final saved frame has no finite duration.');
  assert.ok(streamDuration+1e-5>=minimumDuration&&containerDuration+1e-5>=minimumDuration,'Saved MP4 duration cuts off its last frame.');
  return {bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),encoderStderr:encoded.stderr,
    encoderVerification:{codec:stream.codec_name,bFrames:Number(stream.has_b_frames),frameCount:info.frames.length,streamDuration,containerDuration,lastTimestamp,lastFrameDuration,minimumDuration,passed:true}};
}
async function observedCycleVideo(name, duration, scope, actorId='r12-bus-woman') {
  const now=await page.evaluate(()=>window.__probe.busWomanClock().clock);
  const cycle=(Math.floor((now+.25)/24)+1)*24,target=cycle-.15;
  const actual=await pauseAtClock(target);
  check(actual>=target-1e-7&&actual<=target+.101,`${name}: actual pre-gesture boundary is frozen before recording`,{target,actual});
  await recordGameFrames(name,cycle+duration,scope,{actorId,resumeAtStart:true,
    gestureStartClock:cycle,gestureCycle:24,startPlannedWindow:[target,target+.101]});
}
async function road(pass) {
  stage = `road-pass-${pass + 1}`;
  const depth = SOURCE_PRE_TAPE.stillLength + (OUTSKIRT_STRETCH_START + pass * OUTSKIRT_STRETCH_METRES + 23.4) / CELL;
  await page.evaluate(async depth => { await window.__probe.preTapePreset(depth); window.__probe.hush(); }, depth);
  await until(s => s.presentation.source === true);
}
async function boot() {
  console.log('NAVIGATE',url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  console.log('GAME DOCUMENT READY');
  await page.waitForFunction(() => window.__probe?.testRun && window.__probe.busWomanPresentation, { timeout: 90000 });
  // Wait until the asynchronous licence gate has actually appeared. The
  // existing testRun checkpoint can then bypass unavailable local material
  // calibration without a delayed EULA stealing ordinary game input.
  await page.waitForFunction(() => ['eula', 'lens-calibration', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 90000 });
  for (let n = 0; n < 180; n++) {
    const scene = await page.evaluate(() => window.__scenes?.top()?.id);
    if (scene === 'title' || scene === 'lens-calibration') { bootCheckpoint = scene; break; }
    if (scene === 'eula') await page.keyboard.press('Enter');
    await sleep(300);
  }
  assert.ok(bootCheckpoint, 'Settled title or real material-calibration checkpoint is available.');
  console.log('BOOT CHECKPOINT', bootCheckpoint);
  propsModuleUrl = [...requests].find(value => new URL(value).pathname === '/src/render/props3d.js');
  renderModuleUrl = [...requests].find(value => new URL(value).pathname === '/src/render/r3d.js');
  assert.ok(propsModuleUrl && renderModuleUrl, 'Observed the actual game module URLs.');
  await page.evaluate(async () => {
    await window.__probe.testRun(); window.__probe.tutSkip(); window.__probe.hush();
    window.__probe.setFlags(['van.closed', 'kit.fitted']); window.__probe.setReduceMotion(false);
    window.__probe.warpCell(54.15, 206.55, 0);
  });
  await until(s => ['exterior_bus_woman', 'outskirts_bus_woman', 'bus_woman_bag', 'bus_woman_ticket', ...[1,2,3,4,5].map(stageMesh)].every(mesh => s.characters?.assets?.some(a => a.mesh === mesh)), 60000);
  // DevTools response-body collection completes independently of the game's
  // fetch/decode/install. Wait for its byte proof rather than racing it.
  await until(() => assets.some(asset => asset.sha256 === wrongOriginAssetHash)
    && assets.some(asset => asset.sha256 === expectedAssetHash), 30000);
  check(assets.some(asset => asset.sha256 === wrongOriginAssetHash), 'browser loaded the exact separate Wrong origin pack', { wrongOriginAssetHash, assets });
  check((await state()).characters.packs.some(pack => /outskirts-bus-woman-wrong-origin/.test(pack.url) && pack.meshes.length === 5), 'the separate pack installs only five altered road bodies');
  check(assets.some(asset => asset.sha256 === expectedAssetHash), 'browser loaded the exact selected production GLB bytes', { expectedAssetHash, assets });
  await until(s => !!body(s, 'yard-bus-waiter'), 30000);
}
async function giveTicket(id = 'r12-bus-woman', { prefix = '', crossDuringReceive = false, receiptFront = 1.45, reviewVideoOnly = false } = {}) {
  stage = 'existing-ticket-choice';
  // Set only the inventory fixture; ordinary E and the existing choice must
  // perform the physical receipt. This is not evidence of finding the paper.
  await page.evaluate(() => window.__probe.setFlag('outskirts.ticket.found', true));
  if (crossDuringReceive) {
    const close = frame(body(await state(), id));
    await view(id, { explicit: { x: close.x + 1.33, z: close.z + .6, y: close.y - .5 }, height: 1.25 });
  } else await view(id, { front: receiptFront, right: .10, height: receiptFront < 1.2 ? 1.28 : 1.10 });
  await page.keyboard.press('e');
  await until(s => String(s.scene).startsWith('thought:'), 10000);
  for (let n = 0; n < 15; n++) {
    const s = await state(), options = s.convo?.pending?.options || [];
    if (options.some(option => /Give her the return half/i.test(option))) {
      const index = options.findIndex(option => /Give her the return half/i.test(option)), at = s.convo.pending.index || 0;
      for (let k = 0; k < (index - at + options.length) % options.length; k++) await page.keyboard.press('ArrowDown');
      await armReceiptFreeze(id);
      await page.keyboard.press('Enter'); break;
    }
    await page.keyboard.press('Enter'); await sleep(160);
  }
  await page.evaluate(async()=>{await window.__busWomanReceiptFreeze;delete window.__busWomanReceiptFreeze;});
  const postChoice=await state();
  check(postChoice.presentation.ticketReturned, 'ordinary E and the existing dialogue choice give her the return half');
  const receipt = postChoice.presentation.clock?.woman;
  check(receipt?.receiveId === id && receipt.receivedAt != null, 'the physical choice starts receipt at this existing woman', receipt);
  check(body(postChoice, id)?.character?.clip === 'bus_woman_receive', 'the authored choice samples the actual receive clip');
  if (crossDuringReceive) {
    const close = frame(body(await state(), id));
    await view(id, { explicit: { x: close.x + 1.33, z: close.z - 3, y: close.y - .5 }, height: 1.1 });
  }
  if (reviewVideoOnly) {
    stage = 'return-13-close-handoff-review';
    await recordGameFrames('return-13-close-handoff', receipt.receivedAt + 11.5,
      'Actual close game VFD frames of ordinary E/dialogue receipt, pocket storage and later retrieval; inventory reset is a fixture, no audio track or engine tape/export claim.',
      {receivedAt:receipt.receivedAt,actorId:id,mesh:body(postChoice,id)?.mesh,resumeAtStart:true});
    return;
  }
  if(crossDuringReceive){
    await pausedCapture(prefix+'08a-receive-supported-step',id,{atClock:receipt.receivedAt+.30,leavePaused:true});
    check((await state()).presentation.clock.woman.stepAt != null,'P8 crossing starts the saved step during receipt');
  }
  for (const [target, name] of [[.95, '09-receive-grasp'], [1.9, '10-receive-carry'], [2.65, '11-receive-right-pocket']]) {
    await pausedCapture(prefix+name,id,{atClock:receipt.receivedAt+target,leavePaused:true});
  }
  await pausedCapture(prefix+'12a-retrieve-ticket-ready',id,{atClock:receipt.receivedAt+9.95,leavePaused:true});
  check((await state()).presentation.instances.some(p => p.id === `${id}:return-half`), 'the later ready gesture retrieves the existing right-pocket paper');
  await pausedCapture(prefix+'12b-returned-ticket-held-ready',id,{atClock:receipt.receivedAt+11.1,leavePaused:true});
  check(body(await state(),id)?.character?.clip==='bus_woman_ticket_wait','the saved receipt reaches the real single-paper hold');
  await page.evaluate(()=>window.__chunkSurferDisplay.openPause());
}
async function reviewFootage(){
  stage='return-02-observed-hand-test';
  await page.evaluate(()=>window.__probe.setFlag('outskirts.ticket.returned',false));
  await road(1);
  const aboard=frame(body(await until(s=>!!body(s,'r1-bus-woman-aboard')),'r1-bus-woman-aboard'));
  await view('r1-bus-woman-aboard',{explicit:{x:aboard.x,z:aboard.z-1.45,y:aboard.y},height:1.12});
  await torch(true);
  await observedCycleVideo('return-02-observed-hand-test',3.5,
    'Actual game VFD frames spanning one observed saved-clock hand-test; no first-arrival guarantee, audio track or engine tape/export claim.','r1-bus-woman-aboard');
  stage='return-13-continuous-search';
  await road(12); await view('r12-bus-woman',{front:1.1,right:.18,height:1.28});
  await observedCycleVideo('return-13-felt-origin-search',6.1,
    'Actual close game frames spanning one full search; no audio track or engine tape/export claim.');
  await giveTicket('r12-bus-woman',{receiptFront:1.1,reviewVideoOnly:true});
}
async function run() {
  await boot();
  if (process.env.BUS_WOMAN_VERIFY_MODE === 'footage') {
    await reviewFootage();
    return;
  }
  if (process.env.BUS_WOMAN_VERIFY_MODE === 'render') {
    await road(12); await view('r12-bus-woman', process.env.BUS_WOMAN_VERIFY_CLOSE === '1'
      ? { front: 1.1, right: .18, height: 1.28 } : { front: 1.75, right: .12, height: 1.15 });
    await torch(true); await capture('render-13-torch', 'r12-bus-woman');
    if (process.env.BUS_WOMAN_VERIFY_EXPOSURE_SWEEP === '1') {
      for (const exposure of [2, 3, 4, 6]) {
        await page.evaluate(value => window.__probe.captureExposure(value), exposure); await sleep(150);
        await capture(`render-13-exposure-${exposure}`, 'r12-bus-woman');
      }
      await page.evaluate(() => window.__probe.captureExposure(null));
    }
    await torch(false); await capture('render-13-ambient', 'r12-bus-woman');
    if(process.env.BUS_WOMAN_VERIFY_PEAKS==='1'){
      await torch(true);
      const start=await until(s=>s.presentation.clock.clock%24>=21.5,60000);
      const cycle=(Math.floor(start.presentation.clock.clock/24)+1)*24;
      for(const [time,name] of [[.75,'first-hold'],[1.84,'counterbrace'],[2.53,'smaller-retry'],[3.75,'withdrawn']]){
        await pausedCapture(`render-13-search-${name}`,'r12-bus-woman',{atClock:cycle+time,leavePaused:true});
      }
      await page.evaluate(()=>window.__chunkSurferDisplay.openPause());
      await giveTicket('r12-bus-woman',{prefix:'render-',receiptFront:1.1});
    }
    return;
  }
  const yard = await until(s => !!body(s, 'yard-bus-waiter'));
  check(yard.presentation.instances.filter(p => p.mesh === 'exterior_bus_woman').length === 1, 'ordinary yard has one unaltered canonical body');
  const yardBodyBefore = body(yard, 'yard-bus-waiter');
  if (!continuation) {
  await view('yard-bus-waiter'); await torch(false); await capture('00-yard-before-ambient', 'yard-bus-waiter');
  await torch(true); await pausedCapture('00-yard-before-torch', 'yard-bus-waiter');
  await page.evaluate(() => window.__probe.setFlag('outskirts.ticket.returned', false));
  for (let pass = 0; pass < 13; pass++) {
    await road(pass);
    const id = pass === 1 ? 'r1-bus-woman-aboard' : `r${pass}-bus-woman`;
    const entry = body(await until(s => !!body(s, id)), id);
    check(entry.mesh === stageMesh(stageForReturn[pass]), `return ${pass+1} selects explicit authored stage ${stageForReturn[pass]}`, entry.mesh);
    if (pass === 1) {
      const aboard = frame(entry);
      await view(id, { explicit: { x: aboard.x, z: aboard.z - 1.45, y: aboard.y }, height: 1.12 });
    } else if (pass === 7) {
      const close = frame(entry);
      await view(id, { explicit: { x: close.x + 1.33, z: close.z + 1.0, y: close.y - .5 }, height: 1.25 });
    } else await view(id, { front: 1.75, right: .12, height: 1.15 });
    await torch(true);
    await capture(`return-${String(pass+1).padStart(2,'0')}-stage-${stageForReturn[pass]}-torch`, id);
    if ([1,7,12].includes(pass)) {
      await torch(false); await capture(`return-${pass+1}-ambient`, id); await torch(true);
      await view(id, { front: .2, right: 1.9, height: 1.2 });
      await capture(`return-${pass+1}-profile`, id);
    }
    if (pass === 7) {
      const before = frame(body(await state(), id));
      await view(id, { explicit: { x: before.x + 1.33, z: before.z - 3, y: before.y - .5 }, height: 1.05 });
      await sleep(1100);
      const stepped = body(await state(), id);
      check(Math.abs(stepped.matrix[14] - (entry.matrix[14]-.18)) < .012, 'close encounter retains the authored eighteen centimetre step', {before:entry.matrix[14],after:stepped.matrix[14]});
      await capture('return-08-retained-step', id);
      await page.evaluate(() => window.__probe.setReduceMotion(true));
      await capture('return-08-reduced-motion', id);
      check(body(await state(),id).mesh === stageMesh(3), 'reduced motion preserves stage three anatomy');
      await page.evaluate(() => window.__probe.setReduceMotion(false));
    }
  }
  }
  await page.evaluate(() => window.__probe.setFlag('outskirts.ticket.returned', false));
  await road(7);
  await giveTicket('r7-bus-woman', { prefix: 'p8-', crossDuringReceive: true });
  check((await state()).presentation.instances.filter(p=>p.id==='r7-bus-woman:return-half').length===1, 'P8 receipt finishes its real retrieval and single-paper hold after crossing');
  await page.evaluate(() => window.__probe.setFlag('outskirts.ticket.returned', false));
  await road(12);
  await view('r12-bus-woman', {front:1.1,right:.18,height:1.28});
  await giveTicket('r12-bus-woman', {receiptFront:1.1});
  const received = body(await state(),'r12-bus-woman');
  check(received.mesh === stageMesh(5), 'returning the ticket does not heal or switch final anatomy');
  check((await state()).presentation.instances.filter(p=>p.id==='r12-bus-woman:return-half').length===1, 'final state has one actual return half');
  await page.evaluate(() => window.__probe.setReduceMotion(true));
  await capture('return-13-reduced-motion-held-ticket','r12-bus-woman');
  await page.evaluate(() => window.__probe.setReduceMotion(false));
  await view('r12-bus-woman',{front:2.8,height:.45});
  const reflected=await capture('return-13-wet-reflection','r12-bus-woman');
  check(reflected.reflection.active && reflected.reflection.ready && reflected.reflection.instances>0, 'wet-road mirrored physical pass is active', reflected.reflection);
  const encoded = await page.evaluate(() => window.__probe.sourceShoreCapture('reflection'));
  check(typeof encoded==='string' && encoded.startsWith('data:image/png;base64,'), 'actual wet reflection target can be inspected');
  await writeFile(join(out,'return-13-wet-reflection-target.png'), Buffer.from(encoded.split(',')[1],'base64'));
  await road(2); await view('r2-bus-woman');
  check(body(await state(),'r2-bus-woman').mesh===stageMesh(1), 'backtracking selects that return own early anatomy');
  await capture('return-03-backtracked-stage-one','r2-bus-woman');
  await page.evaluate(() => {window.__probe.warpCell(54.15,206.55,0);window.__probe.hush();});
  const yardAfter=await until(s=>!!body(s,'yard-bus-waiter'));
  check(body(yardAfter,'yard-bus-waiter').mesh===yardBodyBefore.mesh, 'ordinary yard remains canonical after every altered return');
  check(!yardAfter.presentation.instances.some(p=>/wrong_origin/.test(p.mesh)), 'no altered body appears at the ordinary shelter');
  await view('yard-bus-waiter'); await torch(true); await capture('99-yard-after-torch','yard-bus-waiter');
  check(captures.every(capture=>capture.state.characters.poseErrors.length===0),'every captured game performance has a valid frozen character palette');
  console.log('CORE MATRIX COMPLETE',captures.length,'captures',checks.length,'checks');
  // Optional footage begins only after every functional/renderer check, and
  // reuses this booted game instead of competing with another heavy browser.
  if(process.env.BUS_WOMAN_VERIFY_VIDEO!=='0'){
    try{await reviewFootage();}
    catch(error){diagnostics.push({stage,reviewFootageError:String(error.stack||error)});console.error('REVIEW FOOTAGE',error);}
  }
}

if(process.env.BUS_WOMAN_VERIFY_REENCODE_REPORT){
  const reportPath=resolve(process.env.BUS_WOMAN_VERIFY_REENCODE_REPORT),report=JSON.parse(await readFile(reportPath,'utf8'));
  assert.equal(report.wrongOriginAssetHash,wrongOriginAssetHash,'Encoder-only update must retain the exact live-tested actor.');
  assert.ok(report.summary.passed&&!report.errors.length,'Encoder-only update cannot promote failed game evidence.');
  const gameEvidenceSha256=createHash('sha256').update(JSON.stringify([report.checks,report.captures,report.assets,report.errors])).digest('hex');
  for(const video of report.videos){
    const previous=await readFile(video.file),previousSha256=createHash('sha256').update(previous).digest('hex');
    const encoded=await encodeReviewFrames(video.file,join(video.file.replace(/\.mp4$/,'-frames'),'frames.ffconcat'),video.frames.length);
    Object.assign(video,encoded,{encodingUpdatedAt:new Date().toISOString(),previousEncoding:{sha256:previousSha256,bytes:previous.length,reason:'Reordered B-frames shortened stream/container duration below the terminal presentation timestamp.'}});
    console.log('REENCODED',video.file,JSON.stringify({sha256:video.sha256,...video.encoderVerification}));
  }
  report.encodingUpdate={at:new Date().toISOString(),reason:'Encoder-only no-B-frame correction from the same retained atomic PNGs; all live game checks, captures, saved clocks and lighting metadata unchanged.',gameEvidenceSha256};
  await writeFile(reportPath,JSON.stringify(report,null,2));
  process.exit(0);
}

await mkdir(out, { recursive: true });
try {
  profile = await mkdtemp('/private/tmp/chunk-surfer-bus-woman-');
  browser = process.env.BUS_WOMAN_VERIFY_ATTACH_WS ? await puppeteer.connect({browserWSEndpoint:process.env.BUS_WOMAN_VERIFY_ATTACH_WS,protocolTimeout:120000})
    : await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: profile, headless: true, protocolTimeout: 120000,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
      '--disk-cache-size=1048576', '--media-cache-size=1048576', '--disable-gpu-shader-disk-cache'] });
  page = process.env.BUS_WOMAN_VERIFY_ATTACH_WS ? (await browser.pages())[0]||await browser.newPage() : await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: .8 }); await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
    const NativeSocket = window.WebSocket;
    class QuietSocket extends EventTarget { constructor() { super(); this.readyState = 1; queueMicrotask(() => this.dispatchEvent(new Event('open'))); } send() {} close() {} }
    window.WebSocket = class extends NativeSocket { constructor(url, protocols) { if (protocols === 'vite-hmr') return new QuietSocket(); super(url, protocols); } };
  });
  page.on('request', request => requests.add(request.url()));
  page.on('requestfailed',request=>diagnostics.push({stage,requestFailed:request.url(),reason:request.failure()?.errorText}));
  page.on('response', async response => {
    if (!new URL(response.url()).pathname.match(/\/(bus-woman-character|outskirts-bus-woman-wrong-origin)\.glb$/)) return;
    try { const bytes = await response.buffer(); assets.push({ url: response.url(), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
    catch (error) { diagnostics.push({ stage, assetResponse: String(error) }); }
  });
  page.on('pageerror', error => { errors.push({ stage, error: String(error) }); console.error('GAME PAGE ERROR', stage, String(error)); });
  page.on('console', message => {
    if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID|character pose unavailable|bus woman.*character pack unavailable/i.test(message.text())) errors.push({ stage, error: message.text() });
    if (message.type() === 'error') diagnostics.push({ stage, error: message.text() });
  });
  await run();
  if(process.env.BUS_WOMAN_VERIFY_KEEP_BROWSER==='1'){
    await writeFile(join(out,'preview.json'),JSON.stringify({generatedAt:new Date().toISOString(),expectedAssetHash,wrongOriginAssetHash,assets,checks,captures,errors,diagnostics},null,2));
    await writeFile(join(out,'browser.json'),JSON.stringify({pid:process.pid,webSocket:browser.wsEndpoint(),profile},null,2));
    console.log('REVIEW BROWSER RETAINED',join(out,'browser.json'));
    await new Promise(done=>{process.once('SIGUSR2',done);browser.once('disconnected',done);});
  }
} catch (error) {
  fatal = String(error.stack || error); console.error(fatal);
  failureState = await state().catch(() => null);
  if (page && !page.isClosed()) await page.screenshot({ path: join(out, 'failure.png') }).catch(() => {});
} finally {
  await browser?.close().catch(()=>{}); if (profile) await rm(profile, { recursive: true, force: true });
  if (!fatal) await rm(join(out, 'failure.png'), { force: true });
  await writeFile(join(out, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), url, propsModuleUrl, renderModuleUrl,
    summary: { passed: !fatal && errors.length === 0 && checks.every(check => check.pass), captures: captures.length,
      checks: checks.length, failedChecks: checks.filter(check => !check.pass).length, errors: errors.length, videos: videos.length, footageErrors: diagnostics.filter(item => item.reviewFootageError).length, fatal },
    scope: 'Actual Chromium/Metal game renderer, thirteen existing authored appearances, ordinary yard before/after, separate Wrong origin pack, GLB skinning, props, wet reflection and shared VFD/dither targets, ordinary torch input and pause. The existing testRun diagnostic checkpoint bypasses unavailable local material calibration at ws://127.0.0.1:8000. Diagnostic warps shorten travel; the ticket inventory flag is a fixture, while the existing ordinary E/dialogue choice performs receipt. No alternate model renderer or additional live character placement.',
    bootCheckpoint,unverified: ['Native-window rendering', 'Local AI material-bank generation', 'Full uninterrupted journey pacing', 'Captured-recording playback'],
    verificationMode:process.env.BUS_WOMAN_VERIFY_MODE||'full',continuation,expectedAssetHash, wrongOriginAssetHash, assets, checks, captures, videos, errors, diagnostics, fatal, failureState, cleanup: { browserClosed: true, disposableProfileRemoved: true } }, null, 2));
}
process.exit(fatal || errors.length || checks.some(check => !check.pass) ? 1 : 0);
