// Real-game, explicitly staged Source II/III capture checks. Run only while the
// shared renderer is available. This script never calls captureAudio or a mic.
// SOURCE_HUSH_CAPTURE_URL defaults to the dedicated no-HMR review server.
// SOURCE_HUSH_CAPTURE_VIDEO=0 disables the optional video-only canvas recorder.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.SOURCE_HUSH_CAPTURE_URL || 'http://127.0.0.1:5595/';
const out = resolve(process.env.SOURCE_HUSH_CAPTURE_OUT || `artifacts/source-hush-capture/live-${Date.now()}`);
const executablePath = process.env.SOURCE_HUSH_CAPTURE_CHROME
  || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const profile = await mkdtemp(join(tmpdir(), 'chunk-surfer-hush-capture-'));
await mkdir(out, { recursive: true });
const sourcePaths = ['src/main.js', 'src/game/source-continuation.js', 'src/game/source-continuation-scene.js',
  'src/game/source-continuation-contact.js', 'src/game/source-space-runtime.js', 'src/render/hush-cosmos.js',
  'src/render/props3d.js', 'src/render/pressure-composite.js'];
const manifest = await Promise.all(sourcePaths.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })));
const report = { kind: 'source-hush-capture-real-game', passed: false,
  disclosure: 'The initial body, HUSH proximity and prior chapter wins are developer-staged. Ordinary update detects the capture; no E or combat confirmation is sent. Trusted Escape pauses/resumes; trusted Space and arrow keys advance text and choose the visible decline option. This is not earned-route, participant, packaged-native or acoustic acceptance.',
  audio: { browserMuted: true, microphoneRequested: false, captureAudioCalled: false, videoAudioTracks: 0 },
  url: null, sourceManifest: manifest, chapters: [], pageErrors: [], consoleErrors: [], shaderErrors: [], glErrors: [], hmrSockets: [], inputEvents: [], failure: null };
let browser, page, videoChapter = null;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const url = new URL(base);
for (const [key, value] of Object.entries({ firstStrikeReview: '1', silentReview: '1', mode: 'story', skiptut: '1', nodisplaynotice: '1', skipwarn: '1', nomic: '1', sam: '0' })) url.searchParams.set(key, value);
report.url = url.href;
const args = ['--mute-audio', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];
if (process.platform === 'darwin') args.push('--use-angle=metal');
if (process.env.SOURCE_HUSH_CAPTURE_ANGLE) args.push(`--use-angle=${process.env.SOURCE_HUSH_CAPTURE_ANGLE}`);

async function inspect() {
  return page.evaluate(() => {
    const api = document.querySelector('#first-strike-review')?.reviewApi;
    if (!api) return null;
    const state = api.inspect(), top = window.__scenes?.top?.();
    const live = top?.id === 'source-continuation' ? top.view?.() : null;
    const body = window.__probe?.hushBody?.() || null;
    const physical = value => value ? { phase: value.phase, x: value.x, z: value.z, feet: value.feet, chartId: value.chartId,
      status: value.status, elapsed: value.elapsed, grace: value.grace, recovery: value.recovery || null,
      contactHeld: value.contactHeld || null, hush: value.hush ? { x: value.hush.x, z: value.hush.z, feet: value.hush.feet,
        active: value.hush.active, mode: value.hush.mode, defeated: value.hush.defeated, density: value.hush.density } : null } : null;
    return { wall: performance.now(), scene: state.scene, dialogue:top?.sourceContactDialogue?top.view?.():null,run: state.run, paused: state.paused, foreground: state.foreground,
      focused: document.hasFocus(), visibility: document.visibilityState, camera: state.camera, output: state.output,
      contact: { ...state.contact, checkpoint: physical(state.contact?.checkpoint) }, continuation: physical(live),
      recording: state.recording,
      bodyDraw: body ? { ready: body.ready, mode: body.mode, asset: body.asset, revision: body.revision, error: body.error,
        geometry: body.geometry ? { ready: body.geometry.ready, width: body.geometry.width, height: body.geometry.height,
          instances: body.geometry.instances, draws: body.geometry.draws, error: body.geometry.error } : null,
        projection: body.projection, performance: body.body?.performance || null } : null };
  });
}
async function until(predicate, label, { timeout = 20000, chapter = null } = {}) {
  const start = Date.now(); let value;
  while (Date.now() - start < timeout) {
    value = await inspect();
    if (chapter && value) chapter.samples.push(value);
    if (value && predicate(value)) return value;
    await delay(100);
  }
  throw Error(`${label} timed out; final state ${JSON.stringify(value)}`);
}
async function advanceDialogue(chapter, { toChoices = false } = {}) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const value = await inspect();
    if (!value?.scene?.startsWith('source-contact:')) return value;
    const dialogue = value.dialogue;
    if (dialogue?.pending) {
      assert.ok(toChoices, 'declining must not lead to another unreviewed choice');
      return value;
    }
    // Wait for the presenter's ordinary dwell. Never send Space into a menu
    // without first reading its visible options (Space confirms that menu).
    if (dialogue?.line && dialogue.lineAge >= .4) {
      await page.keyboard.press('Space');
    }
    await delay(160);
  }
  throw Error(`Source ${chapter.chapter} dialogue did not advance`);
}
async function glStatus(label) {
  const values = await page.evaluate(() => (window.__sourceHushCaptureContexts || []).map(({ canvas, context }) => {
    const errors = [];
    for (let count = 0; count < 8; count++) { const error = context.getError(); if (!error) break; errors.push(error); }
    return { width: canvas.width, height: canvas.height, lost: context.isContextLost(), errors };
  }));
  report.glErrors.push({ label, contexts: values });
  assert.ok(values.length > 0, 'the real game must have a WebGL context');
  assert.ok(values.every(value => !value.lost && value.errors.length === 0), `${label}: WebGL errors or lost context`);
}
async function startVideo(chapter) {
  if (process.env.SOURCE_HUSH_CAPTURE_VIDEO === '0') return;
  const result = await page.evaluate(() => {
    if (!globalThis.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return { supported: false };
    const host = document.getElementById('wrap'); if (!host) return { supported: false, reason: 'No game wrap' };
    const bounds = host.getBoundingClientRect(), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bounds.width)); canvas.height = Math.max(1, Math.round(bounds.height));
    const context = canvas.getContext('2d'), stream = canvas.captureStream(15);
    if (stream.getAudioTracks().length) throw Error('Silent recorder unexpectedly has audio');
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { stream.getTracks().forEach(track => track.stop()); return { supported: false }; }
    const recording = { canvas, context, stream, live: true, chunks: [], frames: 0, visibleFrames: 0, errors: [] };
    const compose = () => {
      if (!recording.live) return;
      const box = host.getBoundingClientRect(); context.globalAlpha = 1; context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height);
      const layers = [...host.querySelectorAll('canvas')].filter(source => {
        const rectangle = source.getBoundingClientRect(), style = getComputedStyle(source);
        return rectangle.width && rectangle.height && style.display !== 'none' && style.visibility !== 'hidden';
      }).sort((a, b) => (parseFloat(getComputedStyle(a).zIndex) || 0) - (parseFloat(getComputedStyle(b).zIndex) || 0));
      try {
        for (const source of layers) { const r = source.getBoundingClientRect(); context.globalAlpha = Number(getComputedStyle(source).opacity || 1);
          context.drawImage(source, r.left - box.left, r.top - box.top, r.width, r.height); }
        context.globalAlpha = 1; recording.frames++;
        if (recording.frames === 1 || recording.frames % 15 === 0) {
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let maximum = 0; for (let i = 0; i < pixels.length; i += 128) maximum = Math.max(maximum, pixels[i], pixels[i + 1], pixels[i + 2]);
          if (maximum > 16) recording.visibleFrames++;
        }
      } catch (error) { if (!recording.errors.length) recording.errors.push(String(error)); }
      recording.raf = requestAnimationFrame(compose);
    };
    recording.recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
    recording.ended = new Promise(resolve => recording.recorder.onstop = resolve);
    recording.recorder.ondataavailable = event => { if (event.data.size) recording.chunks.push(event.data); };
    window.__sourceHushSilentVideo = recording; compose(); recording.recorder.start(200);
    return { supported: true, mimeType, audioTracks: stream.getAudioTracks().length, width: canvas.width, height: canvas.height };
  });
  chapter.video = result;
  if (result.supported) videoChapter = chapter;
}
async function stopVideo() {
  if (!videoChapter || !page || page.isClosed()) return;
  const chapter = videoChapter; videoChapter = null;
  const value = await page.evaluate(async () => {
    const recording = window.__sourceHushSilentVideo; if (!recording) return null;
    recording.live = false; cancelAnimationFrame(recording.raf); recording.recorder.stop(); await recording.ended;
    recording.stream.getTracks().forEach(track => track.stop());
    const blob = new Blob(recording.chunks, { type: recording.recorder.mimeType });
    const base64 = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob); });
    window.__sourceHushSilentVideo = null;
    return { base64, bytes: blob.size, frames: recording.frames, visibleFrames: recording.visibleFrames, errors: recording.errors };
  });
  if (!value) return;
  const file = `source-${chapter.chapter.toLowerCase()}-capture.webm`;
  await writeFile(join(out, file), Buffer.from(value.base64, 'base64'));
  const { base64, ...metrics } = value; chapter.video = { ...chapter.video, file, ...metrics };
  assert.ok(value.bytes > 1000 && value.frames > 0 && value.visibleFrames > 0 && value.errors.length === 0, 'optional canvas video must contain visible frames');
}

try {
  browser = await puppeteer.launch({ executablePath, headless: true, userDataDir: profile, protocolTimeout: 180000, args });
  page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.pageErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    const text = message.text(); if (message.type() === 'error') report.consoleErrors.push(text);
    if (/shader.*error|GLSL.*error|ERROR:\s*0:|WebGL.*(?:INVALID|CONTEXT_LOST)/i.test(text)) report.shaderErrors.push(text);
  });
  const client = await page.createCDPSession(); await client.send('Network.enable');
  client.on('Network.webSocketWillSendHandshakeRequest', event => {
    const protocol = Object.entries(event.request.headers || {}).find(([key]) => key.toLowerCase() === 'sec-websocket-protocol')?.[1];
    if (String(protocol).includes('vite-hmr')) report.hmrSockets.push({ protocol, at: event.timestamp });
  });
  await page.evaluateOnNewDocument(() => {
    const NativeSocket=window.WebSocket;
    class ReviewHmrSocket extends EventTarget {
      constructor(){super();this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
      send(){}close(){this.readyState=3;}
    }
    window.WebSocket=class extends NativeSocket {
      constructor(url,protocols){if((Array.isArray(protocols)?protocols:[protocols]).includes('vite-hmr'))return new ReviewHmrSocket();super(url,protocols);}
    };
    const consoleError=console.error.bind(console);
    console.error=(...args)=>{if(args[0]==='boot failed')window.__sourceHushCaptureBootError=String(args[1]?.stack||args[1]);consoleError(...args);};
    addEventListener('error',event=>{if(event.error)window.__sourceHushCaptureBootError=String(event.error.stack||event.message);});
    addEventListener('unhandledrejection',event=>{window.__sourceHushCaptureBootError=String(event.reason?.stack||event.reason);});
    window.__sourceHushCaptureContexts = [];
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
      const context = original.call(this, kind, ...options);
      if (context && ['webgl', 'webgl2', 'experimental-webgl'].includes(kind)
        && !window.__sourceHushCaptureContexts.some(entry => entry.context === context)) window.__sourceHushCaptureContexts.push({ canvas: this, context });
      return context;
    };
    window.__sourceHushCaptureInputs = [];
    for (const type of ['keydown', 'keyup']) addEventListener(type, event => {
      if (['Escape', 'KeyE', 'Enter', 'Space', 'ArrowDown', 'ArrowUp'].includes(event.code)) window.__sourceHushCaptureInputs.push({ type, code: event.code, trusted: event.isTrusted, wall: performance.now() });
    }, true);
  });
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.bringToFront();
  await page.waitForFunction(() => !!document.querySelector('#first-strike-review')?.reviewApi||!!window.__sourceHushCaptureBootError, { timeout: 120000 });
  const bootError=await page.evaluate(()=>window.__sourceHushCaptureBootError||null);if(bootError)throw Error(bootError);
  for (const chapterId of ['II', 'III']) {
    const chapter = { chapter: chapterId, fixture: true, earnedRoute: false, samples: [], actions: [] }; report.chapters.push(chapter);
    await page.evaluate(async () => { await document.querySelector('#first-strike-review').reviewApi.stage('source-II', { elapsedSeconds: 0 }); });
    await page.evaluate(()=>{document.querySelector('#first-strike-review').style.visibility='hidden';const receipt=document.querySelector('#first-strike-review-receipt');if(receipt)receipt.style.display='none';});
    chapter.beforeFixture = await inspect(); await startVideo(chapter);
    chapter.actions.push({ action: 'DEV contactFixture', chapter: chapterId, captured: true, sentInteract: false });
    await page.evaluate(async chapter => { await document.querySelector('#first-strike-review').reviewApi.contactFixture(chapter, false, { captured: true }); }, chapterId);
    const captured = await until(value => value.scene?.startsWith('source-contact:'), `Source ${chapterId} capture conversation`, { chapter });
    chapter.captured = captured;
    await delay(1200);
    assert.equal(captured.contact.status.chapter, chapterId); assert.equal(captured.contact.status.activeBattleId, null);
    assert.equal(captured.contact.checkpoint.recovery?.reason, 'hush-pressure');
    assert.equal(captured.contact.checkpoint.recovery?.contact, 'pending');
    assert.equal(captured.contact.held, 'source-contact');
    assert.ok(captured.bodyDraw?.geometry?.draws > 0, 'the real HUSH body must have submitted pressure geometry');
    const screenshot = `source-${chapterId.toLowerCase()}-captured-dialogue.png`;
    await page.screenshot({ path: join(out, screenshot) }); chapter.dialogueScreenshot = screenshot; await glStatus(`${chapterId}-dialogue`);
    const originalRecovery = captured.contact.checkpoint.recovery, wins = captured.contact.chapterWins;
    await page.evaluate(() => document.getElementById('map')?.focus());
    chapter.actions.push({ action: 'trusted Escape pauses and resumes dialogue', combatConfirmed: false });
    await page.keyboard.press('Escape');
    await until(value => value.scene === 'pause' && value.paused, `Source ${chapterId} capture can pause`);
    await page.keyboard.press('Escape');
    await until(value => value.scene?.startsWith('source-contact:') && !value.paused, `Source ${chapterId} capture resumes without consent`);
    const choiceView = await advanceDialogue(chapter, { toChoices: true });
    const menu = choiceView.dialogue.pending;
    const declineIndex = menu.options.findIndex(option => option.id === 'contact.leave');
    assert.ok(declineIndex >= 0, 'the visible menu must offer the captured decline');
    assert.equal(menu.options[declineIndex].text, 'Let it carry me back.');
    chapter.declineChoice = { id: menu.options[declineIndex].id, text: menu.options[declineIndex].text };
    chapter.actions.push({ action: 'select visible decline with trusted arrows and Space', ...chapter.declineChoice, combatConfirmed: false });
    for (let step = menu.index; step !== declineIndex; step = (step + 1) % menu.options.length) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await advanceDialogue(chapter);
    const released = await until(value => value.scene === 'source-continuation' && value.continuation?.recovery?.contact === 'released',
      `Source ${chapterId} declined capture resumes queued recovery`, { chapter });
    chapter.released = released;
    assert.equal(released.contact.status.activeBattleId, null); assert.deepEqual(released.contact.chapterWins, wins);
    assert.deepEqual(released.continuation.recovery.target, originalRecovery.target);
    const recovered = await until(value => value.scene === 'source-continuation' && !value.continuation?.recovery && value.continuation?.grace > 0,
      `Source ${chapterId} recovery completes with grace`, { timeout: 25000, chapter });
    chapter.recovered = recovered;
    assert.equal(recovered.contact.status.activeBattleId, null); assert.deepEqual(recovered.contact.chapterWins, wins);
    assert.ok(Math.hypot(recovered.continuation.x - originalRecovery.target.x, recovered.continuation.z - originalRecovery.target.z,
      recovered.continuation.feet - originalRecovery.target.feet) < .08, 'declining must return to the same queued earned anchor');
    const after = `source-${chapterId.toLowerCase()}-recovered.png`;
    await page.screenshot({ path: join(out, after) }); chapter.recoveryScreenshot = after; await glStatus(`${chapterId}-recovered`);
    await page.evaluate(() => document.querySelector('#first-strike-review').reviewApi.persist()); await stopVideo();
    chapter.passed = true;
  }
  report.inputEvents = await page.evaluate(() => window.__sourceHushCaptureInputs || []);
  assert.equal(report.inputEvents.some(event => event.code === 'KeyE' || event.code === 'Enter'), false, 'no interaction or combat-confirmation key is manufactured');
  assert.equal(report.inputEvents.filter(event => event.code === 'Escape' && event.type === 'keydown' && event.trusted).length, 4);
  assert.deepEqual(report.hmrSockets, [], 'run this capture against the dedicated no-HMR server');
  assert.deepEqual(report.shaderErrors, []); assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} catch (error) {
  report.failure = String(error?.stack || error); process.exitCode = 1;
  if (page && !page.isClosed()) {
    try { report.final = await inspect(); await page.screenshot({ path: join(out, 'failure.png') }); } catch (failure) { report.captureFailure = String(failure); }
  }
} finally {
  try { await stopVideo(); } catch (error) { report.videoStopError = String(error); report.passed = false; process.exitCode = 1; }
  await writeFile(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (browser) await browser.close(); await rm(profile, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: report.passed, out, failure: report.failure, chapters: report.chapters.map(chapter => ({ chapter: chapter.chapter, passed: chapter.passed || false })) }));
}
