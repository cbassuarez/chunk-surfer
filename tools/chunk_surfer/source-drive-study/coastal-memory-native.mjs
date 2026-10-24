// Bounded technical review of the real on-foot scene. This file does not launch
// until the coordinator explicitly releases its one browser/GPU capture slot.
import puppeteer from 'puppeteer-core';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, statfs } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { coastalGlbMeshes, coastalMeshTriangles, coastalGeometrySightline } from './coastal-sightlines.mjs';
import { coastalNativeMenuReady } from './coastal-native-gates.mjs';
import { captureCoastalVisibility, classifyCoastalVisibility } from './coastal-visibility.mjs';

if (process.env.COASTAL_MEMORY_NATIVE_AUTHORIZED !== '1') throw Error('Coastal GPU/browser capture is not released. Set COASTAL_MEMORY_NATIVE_AUTHORIZED=1 only after coordinator approval.');
const baseURL = process.env.COASTAL_MEMORY_BASE_URL, snapshot = process.env.COASTAL_MEMORY_SNAPSHOT_DIR;
const nativeMode = process.env.COASTAL_MEMORY_NATIVE_MODE || 'full';
if (!['full', 'lighting', 'drawing', 'reload', 'appearance', 'visibility'].includes(nativeMode)) throw Error('Unknown bounded coastal native mode.');
if (!baseURL || !snapshot) throw Error('An explicit frozen URL and source snapshot are required; mutable production is not a capture fixture.');
const output = resolve(process.env.COASTAL_MEMORY_NATIVE_OUTPUT_DIR || 'artifacts/source-drive-study/islet-study/native');
const filmBudget = Number(process.env.COASTAL_MEMORY_NATIVE_BUDGET_MIB || 35) * 1024 * 1024;
if (!Number.isFinite(filmBudget) || filmBudget < 8 * 1024 * 1024) throw Error('A finite budget of at least 8 MiB is required.');
const free = await statfs('.');
if (free.bavail * free.bsize < 200 * 1024 * 1024) throw Error('Capture requires at least 200 MiB free before launch.');
const attempt = 'attempt-' + Date.now(), run = join(output, attempt); await mkdir(run, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'coastal-memory-native-'));
const frozenCoast = await import(pathToFileURL(join(snapshot, 'src/data/coastal-memory.js')));
const frozenCoastScene = await import(pathToFileURL(join(snapshot, 'src/game/coastal-memory/scene.js')));
const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const acquiredLandTriangles = coastalMeshTriangles(coastalGlbMeshes(await readFile(join(snapshot, 'public/assets/source-drive/coastal-memory/coastal-memory.glb'))),
  frozenCoastScene.makeCoastalMemoryScene({ worldFromLocal: identityMatrix }).props);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function filesBelow(dir) { const out = []; for (const item of await readdir(dir, { withFileTypes: true })) { const path = join(dir, item.name); if (item.isDirectory()) out.push(...await filesBelow(path)); else out.push(path); } return out; }
const sourcePaths = (await filesBelow(join(snapshot, 'src'))).filter(path => /\.(js|glsl)$/.test(path));
const assetPaths = (await filesBelow(join(snapshot, 'public/assets/source-drive'))).filter(path => /\.(glb|json)$/.test(path));
const identity = () => Promise.all([...sourcePaths, ...assetPaths].sort().map(async path => ({ path: path.slice(snapshot.length + 1), sha256: hash(await readFile(path)) })));
const report = { kind: 'coastal-memory-native-review', mode: nativeMode, staticOnly: !['full', 'appearance'].includes(nativeMode), attempt, snapshot, baseURL,
  scope: 'Actual complete game, final dither and authored on-foot controls in native Chromium/Metal. A declared Bells preset plus coastal start seam bypass the optional Source entry threshold. Primary route is ordinary WASD/right-drag/R/E; film is a short subset. Separate pause/reload placement is labelled. This is not an uninterrupted Source chapter, physical WebView, human reading/fear/comfort or listening acceptance.',
  sourceBefore: await identity(), harnessSha256: hash(await readFile(new URL(import.meta.url))),
  captureLoad: { concurrentHostLoad: 'unknown', normalPerformanceClaim: false,
    qualification: 'Other tasks may use the shared host. Capture is bounded visual/behavior evidence; cadence includes acquisition and encoding and is not a normal FPS benchmark. No other task processes are modified.' },
  harnessDependencies: await Promise.all(['coastal-sightlines.mjs', 'coastal-native-gates.mjs', 'coastal-visibility.mjs'].map(async name => ({ path: 'tools/chunk_surfer/source-drive-study/' + name, sha256: hash(await readFile(new URL('./' + name, import.meta.url))) }))),
  checks: [], errors: [], fixtures: [], inputs: [], telemetry: [], screenshots: [], films: [], assetResponses: [], sourceResponses: [] };
let browser, page, film = null, filmBytes = 0;
function check(name, pass, detail) { report.checks.push({ name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name); if (!pass) throw Error(name); }
const state = () => page.evaluate(() => __probe.coastalMemory.state());
async function log(type, detail = {}) { report.inputs.push({ type, ...detail, wallMs: Date.now(), pageMs: await page.evaluate(() => performance.now()), film }); }
async function press(key) { await page.keyboard.press(key); await log('press', { key }); }
async function down(key) { await page.keyboard.down(key); await log('keydown', { key }); }
async function up(key) { await page.keyboard.up(key); await log('keyup', { key }); }
async function observe(label) { const q = await state(); report.telemetry.push({ label, wallMs: Date.now(), state: q }); return q; }

function bootstrap(version) {
  localStorage.setItem('chunk-surfer:meta:v2', JSON.stringify({ version: 2, eulaAccepted: version, eulaAcceptedAt: Date.now() }));
  const nativeFocus = document.hasFocus.bind(document); window.__coastFocusOverride = true;
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => window.__coastFocusOverride ?? nativeFocus() });
  const Socket = WebSocket; window.WebSocket = class extends Socket { constructor(url, protocols) {
    if (protocols === 'vite-hmr') return new class extends EventTarget { constructor() { super(); this.readyState = 1; queueMicrotask(() => this.dispatchEvent(new Event('open'))); } send() {} close() {} };
    super(url, protocols);
  } };
  const connect = AudioNode.prototype.connect, taps = new WeakMap(); window.__coastOutputTaps = [];
  AudioNode.prototype.connect = function (...args) {
    const result = connect.apply(this, args), context = this.context;
    if (args[0] === context?.destination) {
      let tap = taps.get(context);
      if (!tap) { const destination = context.createMediaStreamDestination(), analyser = context.createAnalyser(); analyser.fftSize = 512; tap = { context, destination, analyser, samples: new Float32Array(512), nodes: new WeakSet(), nodeNames: [] }; taps.set(context, tap); window.__coastOutputTaps.push(tap); }
      if (!tap.nodes.has(this)) { tap.nodes.add(this); tap.nodeNames.push(this.constructor.name); connect.call(this, tap.destination, args[1] ?? 0); connect.call(this, tap.analyser, args[1] ?? 0); }
    }
    return result;
  };
}

function beginCompositeFilm() {
  const map = document.querySelector('#map'), rect = map.getBoundingClientRect(), canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width); canvas.height = Math.round(rect.height);
  const ctx = canvas.getContext('2d'), tap = window.__coastOutputTaps[0];
  if (!tap) throw Error('The actual shared game output tap is unavailable.');
  const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0];
  if (typeof track.requestFrame !== 'function') throw Error('Explicit composite-frame capture is unavailable.');
  const joined = new MediaStream([...stream.getVideoTracks(), ...tap.destination.stream.getAudioTracks()]);
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mime) throw Error('An audio/video WebM encoder is unavailable.');
  const rec = new MediaRecorder(joined, { mimeType: mime, videoBitsPerSecond: 6000000, audioBitsPerSecond: 128000 });
  const f = window.__coastFilm = { canvas, ctx, tap, track, rec, chunks: [], frames: [], layers: [], running: true, start: performance.now(), last: -Infinity };
  rec.ondataavailable = event => { if (event.data.size) f.chunks.push(event.data); };
  function draw(now) {
    if (!f.running) return;
    if (now - f.last >= 31.5) {
      f.last = now; const host = map.getBoundingClientRect(); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const layers = [...map.querySelectorAll('canvas')].map((element, index) => ({ element, index, style: getComputedStyle(element), rect: element.getBoundingClientRect() }))
        .filter(x => x.style.display !== 'none' && x.style.visibility !== 'hidden' && Number(x.style.opacity) > 0 && x.rect.width > 0 && x.rect.height > 0)
        .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0) || a.index - b.index);
      f.layers = layers.map(x => ({ className: x.element.className, index: x.index, opacity: x.style.opacity, filter: x.style.filter, blend: x.style.mixBlendMode }));
      for (const layer of layers) { if (layer.style.mixBlendMode !== 'normal') throw Error('A non-normal canvas blend cannot be certified by this compositor.'); ctx.globalAlpha = Number(layer.style.opacity); ctx.filter = layer.style.filter; ctx.drawImage(layer.element, layer.rect.x - host.x, layer.rect.y - host.y, layer.rect.width, layer.rect.height); }
      ctx.globalAlpha = 1; ctx.filter = 'none'; tap.analyser.getFloatTimeDomainData(tap.samples);
      const q = __probe.coastalMemory.state();
      f.frames.push({ t: now, ms: now - f.start, scene: __scenes.top()?.id, active: q.active, ready: q.ready, paused: q.paused,
        pose: q.pose || null, originalPose: q.originalPose, noteOpen: q.noteOpen, recorderHeld: q.recorderHeld,
        listenedSeconds: q.listenedSeconds, wreckNoticed: q.wreckNoticed, wreckLightLevel: q.wreckLightLevel,
        returnCover: q.returnCover, coverAlpha: q.coverAlpha, elapsed: q.elapsed, status: q.status,
        outputRms: Math.sqrt(tap.samples.reduce((n, value) => n + value * value, 0) / tap.samples.length) });
      track.requestFrame();
    }
    requestAnimationFrame(draw);
  }
  rec.start(250); requestAnimationFrame(draw); return { start: f.start, width: canvas.width, height: canvas.height, mime, tapNodes: tap.nodeNames, contextCount: window.__coastOutputTaps.length };
}
async function beginFilm(name) { if (film) throw Error('A film already owns capture.'); film = name; report.films.push({ name, capture: await page.evaluate(beginCompositeFilm), initial: await state(), scope: 'Bounded primary-route subset; no technical pose or clock assignment inside this film.' }); }
async function endFilm() {
  if (!film) return;
  const name = film, record = report.films.find(row => row.name === name);
  const data = await page.evaluate(async () => {
    const f = window.__coastFilm; f.running = false;
    await new Promise(resolve => { f.rec.onstop = resolve; f.rec.stop(); }); f.track.stop();
    const blob = new Blob(f.chunks, { type: f.rec.mimeType }), bytes = new Uint8Array(await blob.arrayBuffer()); let text = '';
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { base64: btoa(text), frames: f.frames, layers: f.layers, start: f.start, end: performance.now(), mime: f.rec.mimeType };
  });
  const bytes = Buffer.from(data.base64, 'base64'); delete data.base64; film = null; filmBytes += bytes.length;
  const path = join(run, name + '.webm'); await writeFile(path, bytes);
  Object.assign(record, { path: attempt + '/' + name + '.webm', sha256: hash(bytes), bytes: bytes.length,
    preservedBeforeBudgetCheck: true, requestedVideoBitsPerSecond: 6000000 });
  data.inputs = report.inputs.filter(row => row.film === name);
  await writeFile(join(run, name + '-trace.json'), JSON.stringify(data, null, 2)); record.trace = attempt + '/' + name + '-trace.json';
  if (filmBytes > filmBudget) throw Error('Coastal movie exceeds its explicit storage budget; original bytes and trace were preserved before reporting failure.');
  const probe = JSON.parse(execFileSync(process.env.FFPROBE_PATH || '/opt/homebrew/bin/ffprobe', ['-v', 'error', '-count_packets', '-show_entries', 'stream=codec_name,codec_type,width,height,sample_rate,channels,nb_read_packets', '-show_entries', 'format=size,duration', '-of', 'json', path], { encoding: 'utf8', timeout: 30000 }));
  execFileSync(process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-'], { timeout: 60000 });
  const cadence = data.frames.slice(1).map((row, i) => row.t - data.frames[i].t).sort((a, b) => a - b), percentile = p => cadence[Math.floor((cadence.length - 1) * p)];
  Object.assign(record, { path: attempt + '/' + name + '.webm', sha256: hash(bytes), bytes: bytes.length, probe, fullDecode: true,
    final: await state(), wallSeconds: (data.end - data.start) / 1000, maximumOutputRms: Math.max(0, ...data.frames.map(row => row.outputRms)),
    cadence: { frames: data.frames.length, p50Ms: percentile(.5), p95Ms: percentile(.95), maximumMs: cadence.at(-1), qualification: 'Composite readback and encoding included; not GPU timing or perceptual smoothness proof.' } });
  let heldW = false, inputIndex = 0, stalledMs = 0, maximumHeldStallMs = 0, movingSamples = 0, stalledSamples = 0;
  for (let i = 1; i < data.frames.length; i++) {
    const a = data.frames[i - 1], b = data.frames[i];
    while (inputIndex < data.inputs.length && data.inputs[inputIndex].pageMs <= a.t) {
      const event = data.inputs[inputIndex++]; if (event.key === 'w') heldW = event.type === 'keydown';
    }
    if (heldW && a.active && b.active && a.ready && b.ready && !a.paused && !b.paused && a.pose && b.pose) {
      movingSamples++; const stationary = Math.hypot(a.pose.x - b.pose.x, a.pose.z - b.pose.z) < .001;
      if (stationary) { stalledSamples++; stalledMs += b.t - a.t; maximumHeldStallMs = Math.max(maximumHeldStallMs, stalledMs); } else stalledMs = 0;
    } else stalledMs = 0;
  }
  record.motion = { movingSamples, stalledSamples, samePoseFractionWhileWHeld: movingSamples ? stalledSamples / movingSamples : null,
    maximumHeldStallMs, intervalsOver125Ms: cadence.filter(ms => ms > 125).length,
    qualification: 'Per-frame actual pose and logged ordinary W input during this encoded capture. Includes collision contacts, readback, encoding and unowned host contention; not uncaptured game performance or perceptual smoothness acceptance.' };
  return { record, frames: data.frames };
}
async function extractMovieStill(record, capturedFrame, name) {
  if (!capturedFrame) throw Error('No recorded native frame available for ' + name);
  const path = join(run, name + '.png');
  execFileSync(process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-ss', String(capturedFrame.ms / 1000), '-i', join(run, record.name + '.webm'), '-frames:v', '1', '-y', path], { timeout: 30000 });
  const bytes = await readFile(path);
  const row = { name, path: attempt + '/' + name + '.png', sha256: hash(bytes), bytes: bytes.length,
    fromMovieMs: capturedFrame.ms, sourceMovie: record.path, sourceMovieSha256: record.sha256, capturedFrame,
    qualification: 'Decoded from original intact ordinary-input movie; no PNG readback, camera fixture or pose reset during motion.' };
  report.screenshots.push(row); console.log('SCREENSHOT', name); return row;
}

async function cameraReceipt() { return page.evaluate(async () => {
  const q = __probe.coastalMemory.state(); if (!q.active || !q.pose) return null;
  const R = await import('/src/render/r3d.js'), C = await import('/src/data/coastal-memory.js'), p = q.pose;
  const expected = { eye: C.coastalWorldPoint([p.x, p.feet + 1.62, p.z]), yaw: p.yaw + Math.atan2(C.COASTAL_WORLD_FROM_LOCAL[2], C.COASTAL_WORLD_FROM_LOCAL[0]), pitch: p.pitch };
  const actual = R.r3dViewCamera(), angle = value => Math.atan2(Math.sin(value), Math.cos(value));
  return { expected, actual, eyeErrorM: Math.hypot(actual.eye.x - expected.eye[0], actual.eye.y - expected.eye[1], actual.eye.z - expected.eye[2]), yawError: angle(actual.yaw - expected.yaw), pitchError: actual.pitch - expected.pitch };
}); }
async function clearWalkedSightline(label, target) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const q = await state(), camera = await cameraReceipt();
  const actualEye = [camera.actual.eye.x, camera.actual.eye.y, camera.actual.eye.z];
  const localEye = frozenCoast.coastalLocalPoint(actualEye), ray = coastalGeometrySightline(localEye, target, acquiredLandTriangles);
  const technicalAssignments = report.inputs.slice(report.primaryRouteStartInput || 0).filter(row => row.type === 'technical-pose-assignment');
  const receipt = { label, pose: q.pose, camera, ...ray, ordinaryWalk: technicalAssignments.length === 0 && report.inputs.some(row => row.type === 'keydown' && row.key === 'w'),
    qualification: ray.qualification + ' Actual rendered camera reached by logged ordinary WASD; a clear ray or noticed flag does not prove the wreck/pier reads in the picture.' };
  (report.sightlines ??= []).push(receipt);
  check('ordinary walked viewpoint has an exact acquired-mesh clear line: ' + label,
    receipt.ordinaryWalk && ray.clear && camera.eyeErrorM < .015, receipt);
  return receipt;
}
async function screenshot(name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const before = await state(), cameraBefore = await cameraReceipt();
  const clip = await page.$eval('#map', element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  const bytes = await page.screenshot({ path: join(run, name + '.png'), clip });
  report.screenshots.push({ name, path: attempt + '/' + name + '.png', sha256: hash(bytes), bytes: bytes.length, stateBefore: before, cameraBefore, cameraAfter: await cameraReceipt() });
  if (cameraBefore && before.ready) check('actual camera matches supported local pose ' + name,
    cameraBefore.eyeErrorM < .015 && Math.abs(cameraBefore.yawError) < .015 && Math.abs(cameraBefore.pitchError) < .015, cameraBefore);
  console.log('SCREENSHOT', name);
}
async function look(yaw, pitch) {
  // Ordinary right-drag events, chunked to remain inside the visible viewport.
  for (let n = 0; n < 16; n++) {
    const q = await state(); if (!q.active) return;
    const dyaw = Math.atan2(Math.sin(yaw - q.pose.yaw), Math.cos(yaw - q.pose.yaw)), dpitch = pitch - q.pose.pitch;
    if (Math.abs(dyaw) < .006 && Math.abs(dpitch) < .006) return;
    const dx = Math.max(-180, Math.min(180, dyaw / .004)), dy = Math.max(-150, Math.min(150, -dpitch / .003));
    await page.mouse.move(550, 380); await page.mouse.down({ button: 'right' }); await page.mouse.move(550 + dx, 380 + dy, { steps: 5 }); await page.mouse.up({ button: 'right' });
    await log('right-drag', { dx, dy, targetYaw: yaw, targetPitch: pitch }); await wait(35);
  }
  throw Error('Ordinary right-drag could not acquire the requested look.');
}
async function lookAtLocal(target) {
  const camera = await cameraReceipt();
  if (!camera) throw Error('Actual supported coastal camera is unavailable.');
  const eye = frozenCoast.coastalLocalPoint([camera.actual.eye.x, camera.actual.eye.y, camera.actual.eye.z]);
  const dx = target[0] - eye[0], dz = target[2] - eye[2];
  await look(Math.atan2(dx, -dz), Math.atan2(target[1] - eye[1], Math.hypot(dx, dz)));
}
async function walkTo(x, z, { tolerance = .23, allowReturn = false, maximumSeconds = 30, pitch = -.08 } = {}) {
  const began = Date.now(); let held = false, lastDistance = Infinity, stalled = 0;
  try {
    while (Date.now() - began < maximumSeconds * 1000) {
      const q = await state();
      if (!q.active || q.status === 'return-pending') { if (allowReturn) return q; throw Error('Unexpected coastal departure.'); }
      const distance = Math.hypot(x - q.pose.x, z - q.pose.z); if (distance <= tolerance) return q;
      const yaw = Math.atan2(x - q.pose.x, -(z - q.pose.z)), error = Math.atan2(Math.sin(yaw - q.pose.yaw), Math.cos(yaw - q.pose.yaw));
      if (Math.abs(error) > .035) { if (held) { await up('w'); held = false; } await look(yaw, pitch); }
      if (!held) { await down('w'); held = true; }
      await wait(distance < .65 ? 70 : 160); await observe('walk');
      stalled = distance >= lastDistance - .012 ? stalled + 1 : 0; lastDistance = distance;
      if (stalled > 14) throw Error('The ordinary walking approach is blocked.');
    }
    throw Error('The ordinary walking approach exceeded its bounded duration.');
  } finally { if (held) await up('w'); }
}
async function waitForMenu() { await page.waitForFunction(coastalNativeMenuReady, { timeout: 120000 }); }
async function enterFixture(label, { filmName = null, settleMs = 750 } = {}) {
  await page.evaluate(async () => { await __probe.testRun(); __probe.tutSkip(); await __probe.bellsPreset(440); });
  const original = await page.evaluate(() => ({ position: __probe.pos(), tape: __probe.tape(), source: __probe.chunkSurf() }));
  if (filmName) { await beginFilm(filmName); await wait(160); }
  await page.evaluate(async () => { await __probe.coastalMemory.start(); return true; });
  await page.waitForFunction(() => { const q = __probe.coastalMemory.state(); return q.ready || q.error; }, { timeout: 90000 });
  const prepared = await state();
  if (prepared.error) {
    report.initializationFailure = { state: prepared, original };
    await screenshot('coastal-init-error'); await press('x');
    await page.waitForFunction(() => !__probe.coastalMemory.state().active, { timeout: 15000 });
    report.errorRailReturn = await observe('initialization-error-return');
    check('actual X error rail returns the exact Source body', report.errorRailReturn.originalPose.x === original.position.x && report.errorRailReturn.originalPose.y === original.position.y && report.errorRailReturn.saved?.returnReceipt?.delivered, report.errorRailReturn);
    throw Error(prepared.error);
  }
  if (settleMs) await wait(settleMs);
  const q = await observe(label); report.fixtures.push({ label, original, initial: q, qualification: 'Declared Bells door-field and coastal start seam, not earned optional-door traversal.' });
  check(label + ' freezes the exact Source body', q.returnPose.x === original.position.x && q.returnPose.y === original.position.y && q.originalPose.x === original.position.x && q.originalPose.y === original.position.y, { original: original.position, returnPose: q.returnPose });
  return q;
}
async function inspectionGate() {
  if (process.env.COASTAL_MEMORY_INSPECTION_GATE !== '1') return;
  await press('Escape'); await page.waitForFunction(() => __probe.coastalMemory.state().paused, { timeout: 5000 });
  const gate = join(run, 'continue.json');
  await writeFile(join(run, 'preview-ready.json'), JSON.stringify({ attempt, gate, screenshots: report.screenshots,
    qualification: 'Native pictures acquired; movie has not started. The game is held by ordinary Escape while the coordinator inspects them.' }, null, 2));
  console.log('PREVIEW_READY', run);
  const until = Date.now() + 480000; let approved = false;
  while (Date.now() < until) {
    let decision = null;
    try { decision = JSON.parse(await readFile(gate, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (decision) { if (decision.continue !== true) throw Error(decision.reason || 'Native picture inspection declined further capture.'); approved = true; break; }
    await wait(400);
  }
  if (!approved) throw Error('Native picture inspection timed out; no movie was started.');
  report.previewInspection = { approved: true, gate, qualification: 'Coordinator approved these native pictures before any video encoder started; this is not human gameplay or final sound acceptance.' };
  await press('Escape'); await page.waitForFunction(() => !__probe.coastalMemory.state().paused, { timeout: 5000 });
}
async function lightingStudy() {
  report.scope = 'Separately declared supported body/camera placements through the actual coastal geometry, final dither and real torch. Public captureExposure overrides are isolated diagnostic lighting fixtures; no movie, walked route, startup-independent acceptance or user-experience proof.';
  report.lightingFixtures = [];
  async function capture(name, override = null) {
    await wait(650); await screenshot(name);
    const diagnostics = await page.evaluate(async () => {
      const R = await import('/src/render/r3d.js'), P = await import('/src/render/props3d.js');
      const materials = P.installAuthoredPropMeshes((gl, pack) => Object.fromEntries(['cm_grass_bank', 'cm_limestone_block', 'cm_music_box_plinth', 'cm_broken_music_box', 'cm_damp_note', 'cm_distant_pier'].map(name => [name,
        pack.catalog.get(name)?.primitives.map(p => ({ base: p.base ? [...p.base] : null, roughness: p.roughness, metallic: p.metallic,
          emissive: p.emissive ? [...p.emissive] : null, colorTexture: !!p.texture, normalTexture: !!p.normalTexture, ormTexture: !!p.ormTexture,
          printedSurface: p.printedSurface || null })) || null])));
      return { coast: __probe.coastalMemory.state(), torch: __probe.torch(), lighting: R.r3dLightingDebug(),
        pixelMesh: window.__chunkSurferPixelMesh?.status?.(), surface: R.r3dSurfaceStats(), dreams: R.r3dSurfaceDreamStats(),
        props: P.propPackStats(), materials, materialReadMethod: 'Read-only loaded catalogue inspection through existing installer callback; no primitive, GL state or texture mutation.' };
    });
    report.lightingFixtures.push({ name, override, diagnostics }); console.log('LIGHTING_DIAGNOSTIC', name, JSON.stringify({ exposure: diagnostics.lighting.captureExposure, pixelExposure: diagnostics.pixelMesh.captureExposure, torch: diagnostics.torch.on }));
  }
  async function place(name, x, z, target) {
    const result = await page.evaluate(async ({ x, z, target }) => {
      const C = await import('/src/data/coastal-memory.js'), feet = C.coastalSupportAt(x, z)?.height;
      const dx = target[0] - x, dz = target[2] - z, pose = { x, z, feet, yaw: Math.atan2(dx, -dz), pitch: Math.atan2(target[1] - feet - 1.62, Math.hypot(dx, dz)) };
      return { pose, accepted: __probe.coastalMemory.pose(pose) };
    }, { x, z, target });
    report.fixtures.push({ label: name, ...result, qualification: 'Explicit supported technical body/camera placement; no traversal or narrative progression claim.' });
    await log('technical-pose-assignment', { label: name, ...result }); check('supported lighting placement ' + name, result.accepted, result.pose);
  }
  const box = await page.evaluate(async () => (await import('/src/data/coastal-memory.js')).COASTAL_MEMORY_LAYOUT.musicBox);
  const torchBefore = await page.evaluate(() => __probe.torch()); if (!torchBefore.on) await press('l');
  report.torchOperation = { before: torchBefore, after: await page.evaluate(() => __probe.torch()), pressed: !torchBefore.on };
  check('actual torch ON for lighting fixtures', report.torchOperation.after.on, report.torchOperation);
  try {
    await place('box-lighting-camera', 25.9, 43, [box.x, box.y, box.z]); await capture('lighting-box-authored');
    for (const exposure of [1, 2, 3]) {
      const actual = await page.evaluate(value => __probe.captureExposure(value), exposure); await log('capture-exposure-fixture', { requested: exposure, actual });
      await capture('lighting-box-exposure-' + exposure, exposure);
    }
    const reset = await page.evaluate(() => __probe.captureExposure(null)); await log('capture-exposure-reset', { value: null, actual: reset });
    await capture('lighting-box-authored-reset');
    const wreck = await page.evaluate(async () => { const C = await import('/src/data/coastal-memory.js'), m = C.COASTAL_SETTLED_BODY_LOCAL; return [m[12] + m[4] * 1.2, m[13] + m[5] * 1.2, m[14] + m[6] * 1.2]; });
    await place('wreck-lighting-camera', 33, 42, wreck); await wait(1800); await capture('diagnostic-wreck-authored');
    const pier = await page.evaluate(async () => (await import('/src/data/coastal-memory.js')).COASTAL_MEMORY_LAYOUT.pier.position);
    await place('pier-lighting-camera', 10, 74, pier); await capture('diagnostic-pier-authored');
    check('lighting fixtures retain Source body ownership', report.lightingFixtures.every(row => row.diagnostics.coast.originalPose.x === row.diagnostics.coast.returnPose.x && row.diagnostics.coast.originalPose.y === row.diagnostics.coast.returnPose.y));
  } finally { await page.evaluate(() => __probe.captureExposure(null)); }
}

async function drawingStudy() {
  report.scope = 'Separate supported technical camera placements establish actual prop submission/draw calls and target dimensions, followed by a separately declared pause/reload fixture. No movie, ordinary route, complete Source traversal or visual recognizability claim.';
  report.drawingFixtures = [];
  const m = frozenCoast.COASTAL_SETTLED_BODY_LOCAL, wreck = [m[12] + m[4] * 1.2, m[13] + m[5] * 1.2, m[14] + m[6] * 1.2];
  const torch = await page.evaluate(() => __probe.torch()); if (!torch.on) await press('l');
  await page.evaluate(async () => (await import('/src/render/props3d.js')).setPropDiagnostics(true, { exclusive: false }));
  try {
    for (const [label, x, z, target] of [
      ['technical-distant-pier-same-view', 13.07639, 86, frozenCoast.COASTAL_MEMORY_LAYOUT.pier.position],
      ['technical-wreck-primary-view', 35, 43, wreck],
      ['technical-wreck-nearer-clear-rim', 1.6821942714711806, 8, wreck],
    ]) {
      const placement = await page.evaluate(async ({ x, z, target }) => {
        const C = await import('/src/data/coastal-memory.js'), feet = C.coastalSupportAt(x, z)?.height;
        const dx = target[0] - x, dz = target[2] - z, pose = { x, z, feet, yaw: Math.atan2(dx, -dz), pitch: Math.atan2(target[1] - feet - 1.62, Math.hypot(dx, dz)) };
        return { pose, accepted: __probe.coastalMemory.pose(pose) };
      }, { x, z, target });
      await log('technical-pose-assignment', { label, ...placement });
      report.fixtures.push({ label, ...placement, qualification: 'Explicit supported technical placement; no walked approach claim.' });
      check('supported actual drawing fixture ' + label, placement.accepted, placement);
      if (label.includes('wreck')) await page.waitForFunction(() => __probe.coastalMemory.state().wreckLightLevel >= .999, { timeout: 10000 });
      await wait(180); await screenshot(label);
      const diagnostics = await page.evaluate(async () => {
        const P = await import('/src/render/props3d.js'), R = await import('/src/render/r3d.js'), C = await import('/src/render/coastal-memory-renderer.js');
        const q = __probe.coastalMemory.state(), camera = R.r3dViewCamera(), frame = C.coastalMemoryRenderFrame(q), targets = P.propTargets();
        return { state: q, pack: P.propPackStats(), catalog: P.propMeshCatalog(), submittedIds: P.propInstanceIds(),
          rangeVisibleIds: frame.scene.props.filter(p => P.propInstanceVisible(p, [camera.eye.x, camera.eye.y, camera.eye.z], 320)).map(p => p.id),
          camera, pixelMesh: window.__chunkSurferPixelMesh?.status?.(), targets: { ready: targets.ready, near: targets.near, far: targets.far },
          instrumentation: 'setPropDiagnostics(true,{exclusive:false}); no extra props, exclusions, light, exposure, material or shader changes.' };
      });
      const eye = frozenCoast.coastalLocalPoint([diagnostics.camera.eye.x, diagnostics.camera.eye.y, diagnostics.camera.eye.z]);
      report.drawingFixtures.push({ label, ...diagnostics, geometryRay: coastalGeometrySightline(eye, target, acquiredLandTriangles),
        qualification: 'Submitted IDs and range-visible IDs are CPU records; mainDrawCallsByMesh proves draw submission, not visible lit pixels or recognizability.' });
    }
  } finally { await page.evaluate(async () => (await import('/src/render/props3d.js')).setPropDiagnostics(false)); }
  await reloadStudy();
}
async function reloadStudy() {
  if (nativeMode === 'reload') report.scope = 'Separately declared same-frozen-source partial-audio checkpoint, global pause, actual page reload and ordinary Enter on CONTINUE. No movie, drawing fixture, ordinary route or final appearance claim.';
  // Repeat the failed tail of the earlier primary run in a new, clearly
  // separated fixture; never rewrite that original failed full report.
  const placement = { x: 25.9, z: 43, yaw: Math.PI / 2, pitch: -.7 };
  const accepted = await page.evaluate(p => __probe.coastalMemory.pose(p), placement);
  await log('technical-pose-assignment', { label: 'separate-draw-run-pause-reload', placement, accepted });
  check('separate reload fixture has supported box pose', accepted, placement);
  await press('r'); await wait(2300); await press('Escape');
  await page.waitForFunction(() => __probe.coastalMemory.state().paused, { timeout: 5000 });
  const before = await observe('drawing-fixture-paused-before'); await wait(650); const held = await observe('drawing-fixture-paused-after');
  check('separate reload fixture contains genuinely partial audible monitoring', before.listenedSeconds > 0 && before.listenedSeconds < 9 && !before.recordingReceipt, { listenedSeconds: before.listenedSeconds, receipt: before.recordingReceipt });
  check('separate actual global pause freezes body, scene and audio credit', JSON.stringify(before.pose) === JSON.stringify(held.pose) && before.elapsed === held.elapsed && before.listenedSeconds === held.listenedSeconds);
  const save = await page.evaluate(() => localStorage.getItem('chunk-surfer:save:v4'));
  check('the exact paused local save is exportable before reload', typeof save === 'string' && save.length > 0);
  await writeFile(join(run, 'paused-save-v4.json'), save);
  report.pausedSave = { path: attempt + '/paused-save-v4.json', sha256: hash(Buffer.from(save)), bytes: Buffer.byteLength(save), qualification: 'Exact disposable-profile paused save before page reload; never reinjected for this proof.' };
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }); await waitForMenu();
  report.reloadMenu = await page.evaluate(() => document.getElementById('title-a11y-status')?.textContent);
  check('normal saved-night CONTINUE is selected before recovery', report.reloadMenu?.includes('RESUME THE NIGHT YOU LEFT.'), report.reloadMenu);
  await press('Enter'); report.recoveryInput = 'Ordinary Enter on the actual CONTINUE title; no testRun, skip, pose assignment or saved-state injection after reload.';
  await page.waitForFunction(() => __probe.coastalMemory.state().active && __probe.coastalMemory.state().ready, { timeout: 90000 });
  const after = await observe('drawing-fixture-reload-resumed');
  check('separate reload restores active pose, exact Source return and partial actual audio credit', JSON.stringify(after.pose) === JSON.stringify(before.pose) && JSON.stringify(after.returnPose) === JSON.stringify(before.returnPose) && after.listenedSeconds === before.listenedSeconds && !after.recorderHeld, { before, after });
  await screenshot('technical-reload-at-musicbox');
  report.actualExposureAfterReload = await page.evaluate(async () => ({ lighting: (await import('/src/render/r3d.js')).r3dLightingDebug().captureExposure, acquisition: window.__chunkSurferPixelMesh?.status?.().captureExposure }));
}
async function appearanceStudy() {
  report.scope = 'Bounded frozen-v9 appearance evidence: ordinary spawn/box approach, actual musicbox monitoring, then a short intact foot walk from10,39 via3,30 to the existing nearer wreck rim. Separate supported fixed pier/primary-wreck views are technical comparisons. Not a full Source route or repeated proof of historical V8 behavior.';
  report.appearance = { historicalBehaviorReference: 'v8-combined-evidence.json', ordinaryFilmRoute: [[10, 39], [3, 30], [1.6821942714711806, 8]], technicalViewsSeparate: true };
  await screenshot('appearance-bank-arrival');
  await walkTo(25.9, 43, { maximumSeconds: 25, pitch: -.18 });
  const torchBefore = await page.evaluate(() => __probe.torch()); if (!torchBefore.on) await press('l');
  const torchAfter = await page.evaluate(() => __probe.torch());
  report.torchOperation = { before: torchBefore, after: torchAfter, pressed: !torchBefore.on };
  check('bounded appearance uses the actual host torch ON', torchAfter.on, report.torchOperation);
  const box = frozenCoast.COASTAL_MEMORY_LAYOUT.musicBox, atBox = await state();
  await look(Math.atan2(box.x - atBox.pose.x, -(box.z - atBox.pose.z)), Math.atan2(box.y - atBox.pose.feet - 1.62, Math.hypot(box.x - atBox.pose.x, box.z - atBox.pose.z)));
  await screenshot('appearance-musicbox'); await press('e'); await screenshot('appearance-anonymous-note'); await press('e');
  await inspectionGate();
  await press('r'); await page.waitForFunction(() => __probe.coastalMemory.state().recordingReceipt?.delivered, { timeout: 30000 });
  const heard = await observe('appearance-actual-monitor-take');
  check('bounded appearance retains one actual coastal take after9audible seconds', heard.listenedSeconds === 9 && heard.recordingReceipt?.delivered && !heard.completed, heard.recordingReceipt);
  await press('r'); await walkTo(25.9, 41.6, { maximumSeconds: 4, pitch: -.1 });
  await walkTo(10, 39, { maximumSeconds: 16, tolerance: .12, pitch: -.08 });
  await beginFilm('nearer-wreck-approach');
  await walkTo(3, 30, { maximumSeconds: 13, tolerance: .12, pitch: -.08 });
  await walkTo(1.6821942714711806, 8, { maximumSeconds: 19, tolerance: .08, pitch: -.08 });
  const m = frozenCoast.COASTAL_SETTLED_BODY_LOCAL, target = [m[12] + m[4] * 1.2, m[13] + m[5] * 1.2, m[14] + m[6] * 1.2], near = await state();
  const dx = target[0] - near.pose.x, dz = target[2] - near.pose.z;
  await look(Math.atan2(dx, -dz), Math.atan2(target[1] - near.pose.feet - 1.62, Math.hypot(dx, dz)));
  await clearWalkedSightline('appearance-nearer-wreck-ordinary-supported-approach', target); await screenshot('appearance-nearer-wreck-onset');
  await page.waitForFunction(() => __probe.coastalMemory.state().wreckLightLevel >= .999, { timeout: 10000 });
  await wait(900); await screenshot('appearance-nearer-wreck-lit'); await endFilm();
  const filmRow = report.films.find(f => f.name === 'nearer-wreck-approach');
  check('bounded nearer approach contains intact decoded picture and actual shared audio', filmRow?.fullDecode && filmRow.probe.streams.some(s => s.codec_type === 'video') && filmRow.probe.streams.some(s => s.codec_type === 'audio') && filmRow.maximumOutputRms > .00001, filmRow);
  report.drawingFixtures = [];
  await page.evaluate(async () => (await import('/src/render/props3d.js')).setPropDiagnostics(true, { exclusive: false }));
  try {
    for (const [label, x, z, givenTarget] of [
      ['appearance-primary-wreck-fixed-comparison', 35, 43, target],
      ['appearance-pier-fixed-comparison', 13.07639, 86, frozenCoast.COASTAL_MEMORY_LAYOUT.pier.position],
    ]) {
      const placement = await page.evaluate(async ({ x, z, target }) => {
        const C = await import('/src/data/coastal-memory.js'), feet = C.coastalSupportAt(x, z)?.height, dx = target[0] - x, dz = target[2] - z;
        const pose = { x, z, feet, yaw: Math.atan2(dx, -dz), pitch: Math.atan2(target[1] - feet - 1.62, Math.hypot(dx, dz)) };
        return { pose, accepted: __probe.coastalMemory.pose(pose) };
      }, { x, z, target: givenTarget });
      await log('technical-pose-assignment', { label, ...placement });
      report.fixtures.push({ label, ...placement, qualification: 'Separate supported fixed-camera appearance comparison after the ordinary-walk movie; no walked approach claim.' });
      check('bounded fixed comparison is physically supported ' + label, placement.accepted, placement);
      await wait(180); await screenshot(label);
      const diagnostics = await page.evaluate(async () => {
        const P = await import('/src/render/props3d.js'), R = await import('/src/render/r3d.js'), t = P.propTargets();
        return { state: __probe.coastalMemory.state(), pack: P.propPackStats(), catalog: P.propMeshCatalog(), submittedIds: P.propInstanceIds(), camera: R.r3dViewCamera(), targets: { ready: t.ready, near: t.near, far: t.far }, lighting: R.r3dLightingDebug(), pixelMesh: window.__chunkSurferPixelMesh?.status?.() };
      });
      report.drawingFixtures.push({ label, ...diagnostics, qualification: 'Actual nonexclusive P3 mainDrawCallsByMesh instrumentation; draw submission is not recognizability proof.' });
    }
  } finally { await page.evaluate(async () => (await import('/src/render/props3d.js')).setPropDiagnostics(false)); }
  const final = await state();
  check('bounded appearance never transfers Source body ownership', final.originalPose.x === final.returnPose.x && final.originalPose.y === final.returnPose.y, final.returnPose);
  report.actualExposureAtFinish = await page.evaluate(async () => ({ lighting: (await import('/src/render/r3d.js')).r3dLightingDebug().captureExposure, acquisition: window.__chunkSurferPixelMesh?.status?.().captureExposure }));
}
async function finalAppearanceStudy() {
  report.scope = 'Frozen final coastal appearance and bounded behavior proof. Preview car/pier cameras are separate supported fixtures. After preview acceptance a fresh declared Bells/start fixture records before coastal.start through the real entry cover and gaze-triggered lamp wake, then ordinary unfilmed arrival-path travel and an intact box/listen/note-to-pier/exact-Source-return film. A separate supported partial-listening fixture verifies global pause and ordinary Enter on saved-night CONTINUE. No earned optional-door or whole-Source traversal, unbriefed recognition or uncaptured performance claim.';
  report.appearance = { version: 2, historicalBehaviorReference: 'v8-combined-evidence.json',
    ordinaryArrivalRoute: frozenCoast.COASTAL_MEMORY_LAYOUT.arrivalPath,
    ordinaryReturnRoute: frozenCoast.COASTAL_MEMORY_LAYOUT.coastalPath, previewTechnicalViewsSeparate: true };
  const m = frozenCoast.COASTAL_SETTLED_BODY_LOCAL, target = [m[12] + m[4] * 1.2, m[13] + m[5] * 1.2, m[14] + m[6] * 1.2];
  await screenshot('preview-front-quarter-arrival');
  await lookAtLocal(target);
  await page.waitForFunction(() => __probe.coastalMemory.state().wreckLightLevel >= .999, { timeout: 10000 });
  await screenshot('preview-front-quarter-lit');
  const pier = frozenCoast.COASTAL_MEMORY_LAYOUT.pier.position;
  const placement = await page.evaluate(async target => {
    const C = await import('/src/data/coastal-memory.js'), x = 13.07639, z = 86, feet = C.coastalSupportAt(x, z)?.height, dx = target[0] - x, dz = target[2] - z;
    const pose = { x, z, feet, yaw: Math.atan2(dx, -dz), pitch: Math.atan2(target[1] - feet - 1.62, Math.hypot(dx, dz)) };
    return { pose, accepted: __probe.coastalMemory.pose(pose) };
  }, pier);
  await log('technical-pose-assignment', { label: 'preview-pier', ...placement });
  report.fixtures.push({ label: 'preview-pier', ...placement, qualification: 'Separate supported preview only; fresh primary fixture begins after inspection.' });
  check('final pier preview has actual supported placement', placement.accepted, placement);
  await wait(180); await screenshot('preview-pier'); await inspectionGate();

  report.primaryRouteStartInput = report.inputs.length;
  const initial = await enterFixture('final-primary-entry-and-ordinary-route', { filmName: 'coastal-entry-headlamp-reveal', settleMs: 0 });
  await wait(2400); await lookAtLocal(target);
  await page.waitForFunction(() => __probe.coastalMemory.state().wreckLightLevel >= .999, { timeout: 10000 });
  // A real small approach and retreat keeps the car on screen while exposing
  // motion stability. The frozen D12 support/capsule sweep was checked before
  // native launch; this is ordinary input, with no pose or clock assignment.
  await down('w'); await wait(180); await up('w'); await wait(600);
  await down('s'); await wait(180); await up('s'); await wait(600);
  await lookAtLocal(target); await wait(7500);
  const revealPoses = await page.evaluate(() => window.__coastFilm.frames.filter(f => f.active && f.pose).map(f => f.pose));
  const revealInput = report.inputs.filter(row => row.film === 'coastal-entry-headlamp-reveal');
  const spawn = frozenCoast.COASTAL_MEMORY_LAYOUT.spawn;
  report.appearance.revealMovement = { maximumDisplacementM: Math.max(0, ...revealPoses.map(p => Math.hypot(p.x - spawn.x, p.z - spawn.z))),
    sampledPoses: revealPoses.length, allSupported: revealPoses.every(p => frozenCoast.COASTAL_MEMORY_LAYOUT.canOccupy(p.x, p.z, p.feet)),
    ordinaryInputs: revealInput.filter(row => ['w', 's'].includes(row.key)),
    qualification: 'Actual recorded native poses and ordinary W/S input. The target is re-aimed only after keys release; no pose, timer or renderer assignment.' };
  check('reveal film includes real supported ordinary W and S foot movement', report.appearance.revealMovement.maximumDisplacementM > .15
    && report.appearance.revealMovement.allSupported && ['w', 's'].every(key => revealInput.some(row => row.type === 'keydown' && row.key === key)
      && revealInput.some(row => row.type === 'keyup' && row.key === key)), report.appearance.revealMovement);
  const reveal = await endFilm();
  check('intact entry film begins before coast ownership and includes real cover and lamp wake',
    reveal.frames.some(f => !f.active) && reveal.frames.some(f => f.active && f.coverAlpha > .15)
      && reveal.frames.some(f => f.active && f.coverAlpha < .01)
      && reveal.frames.some(f => f.active && f.wreckLightLevel > 0 && f.wreckLightLevel < .99)
      && reveal.frames.some(f => f.wreckLightLevel >= .999),
    { first: reveal.frames[0], activeFrames: reveal.frames.filter(f => f.active).length,
      coverRange: [Math.min(...reveal.frames.filter(f => f.active).map(f => f.coverAlpha)), Math.max(...reveal.frames.filter(f => f.active).map(f => f.coverAlpha))] });
  const movingWreck = reveal.frames.find((frame, i) => i > 0 && frame.active && frame.pose && reveal.frames[i - 1].pose
    && frame.wreckLightLevel >= .999 && Math.hypot(frame.pose.x - reveal.frames[i - 1].pose.x, frame.pose.z - reveal.frames[i - 1].pose.z) > .01);
  await extractMovieStill(reveal.record, movingWreck, 'final-front-quarter-lit');
  for (const [x, z] of frozenCoast.COASTAL_MEMORY_LAYOUT.arrivalPath.slice(1))
    await walkTo(x, z, { maximumSeconds: 17, tolerance: .15, pitch: -.08 });
  check('ordinary arrival route reaches the musicbox without pose resets', (await state()).canInspectNote
    && !report.inputs.slice(report.primaryRouteStartInput).some(row => row.type === 'technical-pose-assignment'), await state());
  const priorTorch = await page.evaluate(() => __probe.torch()); if (!priorTorch.on) await press('l');
  report.torchOperation = { before: priorTorch, after: await page.evaluate(() => __probe.torch()), pressed: !priorTorch.on, qualification: 'Ordinary L input only when actual host torch was OFF.' };
  check('actual host torch is ON at the musicbox', report.torchOperation.after.on, report.torchOperation);
  const box = frozenCoast.COASTAL_MEMORY_LAYOUT.musicBox, atBox = await state();
  await look(Math.atan2(box.x - atBox.pose.x, -(box.z - atBox.pose.z)), Math.atan2(box.y - atBox.pose.feet - 1.62, Math.hypot(box.x - atBox.pose.x, box.z - atBox.pose.z)));
  await screenshot('final-musicbox-and-note'); await press('e'); await screenshot('final-anonymous-note'); await press('e');

  await page.evaluate(async () => (await import('/src/render/props3d.js')).setPropDiagnostics(true, { exclusive: false }));
  await beginFilm('coastal-box-to-pier-return'); await press('e'); await wait(1500); await press('e'); await press('r');
  await page.waitForFunction(() => __probe.coastalMemory.state().recordingReceipt?.delivered, { timeout: 30000 });
  const heard = await observe('final-nine-actual-audible-seconds');
  check('actual monitoring commits the new coastal take once', heard.listenedSeconds === 9 && heard.recordingReceipt?.delivered && !heard.completed, heard.recordingReceipt);
  await press('r');
  for (const [x, z] of frozenCoast.COASTAL_MEMORY_LAYOUT.coastalPath.slice(1).filter(([, z]) => z <= 86))
    await walkTo(x, z, { maximumSeconds: 17, tolerance: .14, pitch: z >= 68 ? -.18 : -.08 });
  const atPier = await state();
  await look(Math.atan2(pier[0] - atPier.pose.x, -(pier[2] - atPier.pose.z)), Math.atan2(pier[1] - atPier.pose.feet - 1.62, Math.hypot(pier[0] - atPier.pose.x, pier[2] - atPier.pose.z)));
  await clearWalkedSightline('final-ordinary-pier-approach', pier); await wait(900);
  const pierStepStartMs = await page.evaluate(() => performance.now());
  await down('w'); await wait(160); await up('w'); await wait(500);
  await down('s'); await wait(160); await up('s'); await wait(500);
  const pierStepEndMs = await page.evaluate(() => performance.now());
  await lookAtLocal(pier);
  report.finalDrawing = await page.evaluate(async () => {
    const P = await import('/src/render/props3d.js'), R = await import('/src/render/r3d.js'), C = await import('/src/render/coastal-memory-renderer.js'), t = P.propTargets();
    const submitted = C.coastalMemoryRenderFrame(__probe.coastalMemory.state()).scene.lamps;
    return { pack: P.propPackStats(), catalog: P.propMeshCatalog(), submittedIds: P.propInstanceIds(), camera: R.r3dViewCamera(),
      targets: { ready: t.ready, near: t.near, far: t.far }, lighting: R.r3dLightingDebug(), pixelMesh: window.__chunkSurferPixelMesh?.status?.(),
      shadow: { ready: t.shadowReady, size: t.shadowSize, matrix: Array.from(t.shadowMatrix) },
      submittedLightOrder: submitted.map(lamp => ({ id: lamp.id, castsShadow: lamp.castsShadow, position: [lamp.x, lamp.y, lamp.z], shadowYaw: lamp.shadowYaw, shadowPitch: lamp.shadowPitch })),
      expectedShadowOwner: submitted.find(lamp => lamp.castsShadow)?.id || null,
      shadowQualification: 'Actual P3 shadow matrix and target plus current-state authored light order and real R3 light array; origin residual identifies which physical light owns the exposed map. This does not inspect each shadow-depth texel.' };
  });
  report.finalDrawing.shadowOriginChecks = report.finalDrawing.submittedLightOrder.map(lamp => {
    const point = [...lamp.position, 1], matrix = report.finalDrawing.shadow.matrix;
    const clip = [0, 1, 2, 3].map(row => point.reduce((sum, value, col) => sum + value * matrix[col * 4 + row], 0));
    return { id: lamp.id, clip, originXYWResidual: Math.hypot(clip[0], clip[1], clip[3]) };
  }).sort((a, b) => a.originXYWResidual - b.originXYWResidual);
  const intendedPierShadow = frozenCoast.COASTAL_MEMORY_LAYOUT.pier.fixtures?.[0]?.id || 'coastal-pier-marker';
  check('pier approach assigns its real aperture the bounded physical shadow owner', report.finalDrawing.expectedShadowOwner === intendedPierShadow
    && report.finalDrawing.shadowOriginChecks[0]?.id === intendedPierShadow && report.finalDrawing.shadowOriginChecks[0].originXYWResidual < .002
    && report.finalDrawing.pack.shadow.active && report.finalDrawing.shadow.ready, report.finalDrawing);
  await walkTo(13.07639, 87.25, { maximumSeconds: 6, allowReturn: true, pitch: -.08 });
  await page.waitForFunction(() => !__probe.coastalMemory.state().active, { timeout: 15000 }); await wait(650);
  const departure = await endFilm();
  await page.evaluate(async () => (await import('/src/render/props3d.js')).setPropDiagnostics(false));
  const returned = await observe('final-covered-source-return'), lookAfter = await page.evaluate(async () => (await import('/src/render/r3d.js')).r3dLookAngles());
  check('ordinary descent restores exact Source body and captured look once', returned.saved?.completed && returned.saved.returnReceipt?.delivered
    && returned.originalPose.x === initial.returnPose.x && returned.originalPose.y === initial.returnPose.y
    && Math.abs(lookAfter.yaw - initial.returnPose.yaw) < 1e-6 && Math.abs(lookAfter.pitch - initial.returnPose.pitch) < 1e-6,
    { returned, lookAfter, initialReturnPose: initial.returnPose });
  check('intact return film records near-full cover before Source ownership returns', departure.frames.some(f => f.active && f.returnCover >= .9)
    && departure.frames.some(f => !f.active), { frameCount: departure.frames.length });
  const movingPier = departure.frames.filter((f, i) => f.active && f.t >= pierStepStartMs && f.t <= pierStepEndMs && f.pose
    && i > 0 && departure.frames[i - 1].pose && Math.hypot(f.pose.x - departure.frames[i - 1].pose.x, f.pose.z - departure.frames[i - 1].pose.z) > .01)
    .find(Boolean);
  if (!movingPier) throw Error('No actual in-motion pier frame was recorded.');
  await extractMovieStill(departure.record, movingPier, 'final-pier'); await screenshot('final-source-return');
  for (const record of report.films) check('decoded original film contains actual shared game audio ' + record.name,
    record.fullDecode && record.probe.streams.some(s => s.codec_type === 'video') && record.probe.streams.some(s => s.codec_type === 'audio') && record.maximumOutputRms > .00001, record);
  check('primary route has no technical position assignments', !report.inputs.slice(report.primaryRouteStartInput).some(row => row.type === 'technical-pose-assignment'));
  report.primaryRouteEndInput = report.inputs.length; report.tapeAfterPrimary = await page.evaluate(() => __probe.tape());
  report.actualExposureAtFinish = await page.evaluate(async () => ({ lighting: (await import('/src/render/r3d.js')).r3dLightingDebug().captureExposure, acquisition: window.__chunkSurferPixelMesh?.status?.().captureExposure }));
  await enterFixture('separate-final-pause-reload-fixture'); await reloadStudy();
}
async function visibilityStudy() {
  report.scope = 'Frozen-v9 static stage diagnosis, not route or visual acceptance: separately supported actual car/pier cameras, genuine L torchOFF/ON pairs, synchronous P3linear/post-water-scene/finalVFD readbacks and exact Float32 scene-alpha opaque depth versus exact source GLB triangles. No movie, exposure override, material change or added scene object.';
  report.visibilityFixtures = [];
  const driveMeshes = coastalGlbMeshes(await readFile(join(snapshot, 'public/assets/source-drive/drive.glb'))),
    coastMeshes = coastalGlbMeshes(await readFile(join(snapshot, 'public/assets/source-drive/coastal-memory/coastal-memory.glb')));
  const m = frozenCoast.COASTAL_SETTLED_BODY_LOCAL, wreck = [m[12] + m[4] * 1.2, m[13] + m[5] * 1.2, m[14] + m[6] * 1.2];
  await page.evaluate(async () => (await import('/src/render/props3d.js')).setPropDiagnostics(true, { exclusive: false }));
  try {
    for (const [label, x, z, target, name] of [
      ['primary-car', 35, 43, wreck, 'drive_vehicle_body'],
      ['near-car', 1.6821942714711806, 8, wreck, 'drive_vehicle_body'],
      ['pier', 13.07639, 86, frozenCoast.COASTAL_MEMORY_LAYOUT.pier.position, 'cm_distant_pier'],
    ]) {
      if ((await state()).paused) await press('Escape');
      const placement = await page.evaluate(async ({ x, z, target }) => {
        const C = await import('/src/data/coastal-memory.js'), feet = C.coastalSupportAt(x, z)?.height, dx = target[0] - x, dz = target[2] - z;
        const pose = { x, z, feet, yaw: Math.atan2(dx, -dz), pitch: Math.atan2(target[1] - feet - 1.62, Math.hypot(dx, dz)) };
        return { pose, accepted: __probe.coastalMemory.pose(pose) };
      }, { x, z, target });
      await log('technical-pose-assignment', { label, ...placement });
      report.fixtures.push({ label, ...placement, qualification: 'Supported technical stage camera; no walked approach claim.' });
      check('visibility camera supported ' + label, placement.accepted, placement);
      if (label.includes('car')) await page.waitForFunction(() => __probe.coastalMemory.state().wreckLightLevel >= .999, { timeout: 10000 });
      const mesh = (name.startsWith('drive_') ? driveMeshes : coastMeshes).find(v => v.name === name);
      if (!mesh) throw Error('Exact target mesh unavailable: ' + name);
      const positions = mesh.primitives.flatMap(v => v.positions);
      for (const wantedTorch of [false, true]) {
        if ((await state()).paused) await press('Escape');
        const priorTorch = await page.evaluate(() => __probe.torch());
        if (priorTorch.on !== wantedTorch) await press('l');
        await wait(260); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const actualTorch = await page.evaluate(() => __probe.torch());
        check('genuine torch state ' + label + '/' + wantedTorch, actualTorch.on === wantedTorch, { priorTorch, actualTorch });
        await press('Escape'); await page.waitForFunction(() => __probe.coastalMemory.state().paused, { timeout: 5000 });
        const capture = await page.evaluate(captureCoastalVisibility, { mesh: name, positions }), fixture = label + '-torch-' + (wantedTorch ? 'on' : 'off');
        check('exact single float-stage readback ' + fixture, capture.exactFloatReadbacks === 1 && capture.glError === 0, { readbacks: capture.exactFloatReadbacks, glError: capture.glError });
        const images = [];
        for (const stage of capture.stages) for (const [suffix, field] of [['', 'dataUrl'], ['-crop', 'cropDataUrl']]) {
          const bytes = Buffer.from(stage[field].split(',')[1], 'base64'), path = fixture + '-' + stage.name + suffix + '.png';
          await writeFile(join(run, path), bytes); images.push({ stage: stage.name + suffix, path: attempt + '/' + path, sha256: hash(bytes), bytes: bytes.length });
        }
        delete capture.stages;
        const classification = classifyCoastalVisibility(capture, mesh), rawPath = fixture + '-raw.json';
        await writeFile(join(run, rawPath), JSON.stringify(capture));
        const result = { fixture, wantedTorch, actualTorch, capture: { ...capture, values: undefined }, classification, images,
          raw: { path: attempt + '/' + rawPath, sha256: hash(await readFile(join(run, rawPath))) } };
        await writeFile(join(run, fixture + '-analysis.json'), JSON.stringify(result, null, 2));
        report.visibilityFixtures.push(result);
        console.log('VISIBILITY_FIXTURE', fixture, JSON.stringify({ region: capture.region, counts: classification.counts, signals: classification.depthConsistentTarget, lighting: capture.lighting.torch }));
      }
    }
  } finally { await page.evaluate(async () => (await import('/src/render/props3d.js')).setPropDiagnostics(false)); }
}

try {
  browser = await puppeteer.launch({ executablePath: process.env.COASTAL_MEMORY_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, userDataDir: profile, protocolTimeout: 120000,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  page = await browser.newPage(); await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 }); await page.bringToFront();
  page.on('pageerror', error => { report.errors.push(String(error)); console.log('PAGEERROR', String(error)); });
  page.on('console', message => { if (message.type() === 'error' && /coastal|LOOP FAULT|shader|compile|SyntaxError|ReferenceError|Failed to load module/i.test(message.text())) { report.errors.push(message.text()); console.log('RENDERERROR', message.text().slice(0, 500)); } });
  page.on('response', response => { const path = new URL(response.url()).pathname; if (path.startsWith('/src/')) report.sourceResponses.push({ path, fixed: response.headers()['x-source-drive-snapshot'] === 'fixed' }); if (path.startsWith('/assets/')) { report.assetResponses.push({ path, status: response.status() }); if (response.status() >= 400) console.log('ASSETFAIL', response.status(), path); } });
  const eula = (await readFile(join(snapshot, 'LEGAL/EULA.md'), 'utf8')).match(/^Version:\s*(.+)$/m)?.[1]?.trim(); if (!eula) throw Error('The frozen local-test licence version is missing.');
  await page.evaluateOnNewDocument(bootstrap, eula);
  await page.goto(baseURL + '/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&skiptut=1', { waitUntil: 'domcontentloaded', timeout: 60000 }); await waitForMenu();
  report.bootstrap = await page.evaluate(() => ({ scene: __scenes.top()?.id, title: document.getElementById('title-a11y-status')?.textContent,
    lens: window.__diffusion?.stats || null, qualification: 'Natural material calibration and terminal menu completed before diagnostic entry.' }));
  const initial = await enterFixture(nativeMode === 'drawing' ? 'separate-draw-inspection-fixture' : nativeMode === 'reload' ? 'separate-native-reload-fixture' : nativeMode === 'appearance' ? 'bounded-appearance-fixture' : 'primary-on-foot-route');
  report.loadedAssets = await page.evaluate(async () => { const out = []; for (const path of ['/assets/source-drive/drive.glb', '/assets/source-drive/coastal-memory/coastal-memory.glb']) { const r = await fetch(path), bytes = await r.arrayBuffer(), digest = await crypto.subtle.digest('SHA-256', bytes); out.push({ path, status: r.status, sha256: [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('') }); } return out; });
  for (const item of report.loadedAssets) check('loaded asset matches snapshot ' + item.path, item.status === 200 && item.sha256 === report.sourceBefore.find(row => row.path === 'public' + item.path)?.sha256, item);
  report.pixelMesh = await page.evaluate(() => window.__chunkSurferPixelMesh?.status?.());
  check('actual final dither shader is acquired without a GL fault', report.pixelMesh?.enabled && report.pixelMesh.shaderReady && !report.pixelMesh.lastError && !report.pixelMesh.lastGlError, report.pixelMesh);
  check('natural startup and initial coast emitted no runtime faults before encoding', report.errors.length === 0, report.errors);
  check('native source responses identify the fixed snapshot', report.sourceResponses.length > 0 && report.sourceResponses.every(row => row.fixed), { responses: report.sourceResponses.length, nonFixed: report.sourceResponses.filter(row => !row.fixed) });
  if (nativeMode === 'lighting') await lightingStudy();
  else if (nativeMode === 'drawing') await drawingStudy();
  else if (nativeMode === 'reload') await reloadStudy();
  else if (nativeMode === 'appearance') await (process.env.COASTAL_MEMORY_NATIVE_FINAL === '1' ? finalAppearanceStudy() : appearanceStudy());
  else if (nativeMode === 'visibility') await visibilityStudy();
  else {
  await screenshot('bank-arrival');
  await walkTo(25.9, 43, { maximumSeconds: 25, pitch: -.18 });
  check('the primary approach reached the box with ordinary supported walking', (await state()).canInspectNote, await state());
  if (process.env.COASTAL_MEMORY_NATIVE_USE_TORCH === '1') {
    const before = await page.evaluate(() => __probe.torch());
    if (!before.on) await press('l');
    const after = await page.evaluate(() => __probe.torch()); report.torchOperation = { before, after, pressed: !before.on, qualification: 'Actual host torch retained ON or raised with ordinary L only when OFF; no renderer light override.' };
    check('the actual saved torch is ON for close material inspection', after.on === true, report.torchOperation);
  }
  const box = await page.evaluate(async () => (await import('/src/data/coastal-memory.js')).COASTAL_MEMORY_LAYOUT.musicBox);
  const boxView = await state();
  await look(Math.atan2(box.x - boxView.pose.x, -(box.z - boxView.pose.z)), Math.atan2(box.y - boxView.pose.feet - 1.62, Math.hypot(box.x - boxView.pose.x, box.z - boxView.pose.z)));
  await screenshot('musicbox-and-note'); await press('e'); await screenshot('anonymous-note'); await press('e');
  await inspectionGate();
  await beginFilm('musicbox-wreck-walkby'); await press('r');
  await page.waitForFunction(() => __probe.coastalMemory.state().recordingReceipt?.delivered, { timeout: 30000 });
  const heard = await observe('nine-audible-seconds');
  check('actual monitor earns one coastal take, without completing the coast', heard.listenedSeconds === 9 && heard.recordingReceipt?.delivered && !heard.completed, heard.recordingReceipt);
  await press('r'); await screenshot('musicbox-heard');
  // Walk around the real plinth rather than asking the operator to clip it.
  await walkTo(25.9, 41.6, { maximumSeconds: 4, pitch: -.1 });
  await walkTo(34.6, 42.5, { maximumSeconds: 10, tolerance: .12, pitch: -.1 });
  await walkTo(35, 43, { maximumSeconds: 4, tolerance: .08, pitch: -.1 });
  const target = await page.evaluate(async () => { const C = await import('/src/data/coastal-memory.js'), m = C.COASTAL_SETTLED_BODY_LOCAL; return [m[12] + m[4] * 1.2, m[13] + m[5] * 1.2, m[14] + m[6] * 1.2]; });
  const q = await state(), dx = target[0] - q.pose.x, dz = target[2] - q.pose.z, dy = target[1] - q.pose.feet - 1.62;
  await look(Math.atan2(dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  await clearWalkedSightline('submerged-van-from-clear-shoulder', target); await screenshot('submerged-headlamp-onset');
  await page.waitForFunction(() => __probe.coastalMemory.state().wreckLightLevel >= .999, { timeout: 10000 }); await wait(700); await screenshot('submerged-headlamps-lit'); await endFilm();
  for (const [x, z] of frozenCoast.COASTAL_MEMORY_LAYOUT.coastalPath.filter(([x, z]) => z >= 50 && z <= 86))
    await walkTo(x, z, { maximumSeconds: 16, tolerance: .12, pitch: -.08 });
  const pier = frozenCoast.COASTAL_MEMORY_LAYOUT.pier.position, pierView = await state();
  await look(Math.atan2(pier[0] - pierView.pose.x, -(pier[2] - pierView.pose.z)), Math.atan2(pier[1] - pierView.pose.feet - 1.62, Math.hypot(pier[0] - pierView.pose.x, pier[2] - pierView.pose.z)));
  await clearWalkedSightline('distant-pier-before-physical-road-trench', pier); await screenshot('distant-pier-descent');
  await walkTo(13.07639, 87.25, { maximumSeconds: 5, allowReturn: true, pitch: -.08 });
  await page.waitForFunction(() => !__probe.coastalMemory.state().active, { timeout: 15000 });
  const returned = await observe('primary-return');
  check('descent restores the exact captured Source position once', returned.saved?.completed && returned.saved.returnReceipt?.delivered && returned.originalPose.x === initial.returnPose.x && returned.originalPose.y === initial.returnPose.y, returned);
  const lookAfter = await page.evaluate(async () => (await import('/src/render/r3d.js')).r3dLookAngles());
  check('return restores the captured Source look', Math.abs(lookAfter.yaw - initial.returnPose.yaw) < 1e-6 && Math.abs(lookAfter.pitch - initial.returnPose.pitch) < 1e-6, { expected: initial.returnPose, actual: lookAfter });
  report.tapeAfterPrimary = await page.evaluate(() => __probe.tape()); await screenshot('source-return');

  // Explicitly separate fixture: technical placement is never inside the film
  // or represented as an ordinary walk from the previous completed route.
  await enterFixture('separate-pause-reload-fixture');
  const placement = { x: 25.9, z: 43, yaw: Math.PI / 2, pitch: -.7 };
  const placed = await page.evaluate(pose => __probe.coastalMemory.pose(pose), placement); await log('technical-pose-assignment', { placement, accepted: placed });
  report.fixtures.push({ label: 'pause-reload-box-placement', placement, accepted: placed, qualification: 'Supported explicit position assignment in a separate fixture; not ordinary traversal evidence.' }); check('declared pause fixture placement is supported', placed, placement);
  await press('r'); await wait(2300); await press('Escape');
  await page.waitForFunction(() => __probe.coastalMemory.state().paused, { timeout: 5000 });
  const pausedBefore = await observe('pause-before'); await wait(650); const pausedAfter = await observe('pause-after');
  check('global Escape freezes position and audible credit', JSON.stringify(pausedBefore.pose) === JSON.stringify(pausedAfter.pose) && pausedBefore.listenedSeconds === pausedAfter.listenedSeconds && pausedBefore.elapsed === pausedAfter.elapsed, { before: pausedBefore.listenedSeconds, after: pausedAfter.listenedSeconds });
  await screenshot('global-pause'); await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }); await waitForMenu();
  check('normal saved-night CONTINUE is selected before full-run recovery', (await page.evaluate(() => document.getElementById('title-a11y-status')?.textContent))?.includes('RESUME THE NIGHT YOU LEFT.'));
  await press('Enter');
  await page.waitForFunction(() => __probe.coastalMemory.state().active && __probe.coastalMemory.state().ready, { timeout: 90000 });
  const resumed = await observe('reload-resumed');
  check('reload restores the active coast, exact Source return and partial actual listening', JSON.stringify(resumed.pose) === JSON.stringify(pausedBefore.pose) && resumed.listenedSeconds === pausedBefore.listenedSeconds && JSON.stringify(resumed.returnPose) === JSON.stringify(pausedBefore.returnPose) && !resumed.recorderHeld, { saved: pausedBefore, resumed });
  await screenshot('reload-at-musicbox');
  const firstFilm = report.films[0]; check('bounded movie contains decoded video and actual shared audio', firstFilm?.fullDecode && firstFilm.probe.streams.some(s => s.codec_type === 'audio') && firstFilm.maximumOutputRms > .00001, firstFilm);
  const unchangedBody = report.telemetry.filter(row => row.state.active).every(row => row.state.originalPose.x === row.state.returnPose.x && row.state.originalPose.y === row.state.returnPose.y);
  check('every active sampled coast preserves Source body ownership', unchangedBody, { samples: report.telemetry.length });
  }
  check('no native runtime/shader errors were observed', report.errors.length === 0, report.errors);
} catch (error) {
  report.failure = String(error?.stack || error);
  if (page) { try { report.failureState = await page.evaluate(() => ({ scene: window.__scenes?.top?.()?.id, sceneView: window.__scenes?.top?.()?.view?.(),
    coast: window.__probe?.coastalMemory?.state?.(), lens: window.__diffusion?.stats || null,
    title: document.getElementById('title-a11y-status')?.textContent || null })); } catch (reason) { report.failureStateError = String(reason); } }
  console.error('COASTAL_NATIVE_FAILURE', report.failure); process.exitCode = 1;
}
finally {
  if (film && page) { try { await endFilm(); } catch (error) { report.captureFinalizationError = String(error); } }
  report.sourceAfter = await identity(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  report.passed = !report.failure && !report.captureFinalizationError && report.sourceStable
    && report.checks.length > 0 && report.checks.every(row => row.pass === true) && report.errors.length === 0;
  report.limits = ['Human fear, material recognition, note reading and independent sound review remain pending.', 'Capture cadence includes readback/encoding; it is not uncaptured performance or physical WebView proof.', 'Frozen snapshot correspondence does not establish equality with subsequently changed live sources.', 'Primary fixture bypasses optional Source threshold; separate pause/reload fixture contains one declared supported pose assignment.'];
  if (nativeMode === 'appearance') report.limits[3] = report.appearance?.version === 2
    ? 'Preview pier placement is separate. Primary entry/ordinary walking/covered return and separate normal CONTINUE reload use declared Bells/start fixtures; optional Source entry and whole chapter are not proved.'
    : 'Bounded appearance entry uses a declared Bells/start fixture. The movie is ordinary foot walking; later fixed pier/primary-wreck comparisons use labelled supported technical placements. Whole Source/route and reload acceptance are not repeated here.';
  const reportBytes = Buffer.from(JSON.stringify(report, null, 2));
  await writeFile(join(run, 'report.json'), reportBytes);
  await writeFile(join(output, 'latest.json'), JSON.stringify({ attempt, report: attempt + '/report.json', failure: report.failure || null }, null, 2));
  if (nativeMode === 'appearance') await writeFile(join(output, 'appearance-latest.json'), JSON.stringify({ attempt, report: attempt + '/report.json', reportSha256: hash(reportBytes), failure: report.failure || null }, null, 2));
  if (browser) await browser.close(); await rm(profile, { recursive: true, force: true });
  console.log('COASTAL_NATIVE_REPORT', join(run, 'report.json'));
}
