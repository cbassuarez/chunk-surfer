// Selected encounter in the actual game renderer: authored placement, GLB,
// world prop target and final VFD/dither target, at approach and return range.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CELL } from '../../src/data/floorplan/legend.js';
import { SOURCE_PRE_TAPE } from '../../src/data/source-level.js';
import { OUTSKIRT_DOG_ENCOUNTER, OUTSKIRT_STRETCH_START, OUTSKIRT_STRETCH_METRES } from '../../src/data/source-outskirts-arrival.js';

const url = process.env.VACANT_DOG_VERIFY_URL || 'http://127.0.0.1:5330/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
const output = resolve('artifacts/outskirts-man-dog-design/production/live');
await mkdir(output, { recursive: true });
const assetHash = createHash('sha256').update(await readFile('public/assets/outskirts-vacant-dog.glb')).digest('hex');
const handlerHash = createHash('sha256').update(await readFile('public/assets/outskirts-dog-handler.glb')).digest('hex');
const profile = await mkdtemp('/private/tmp/chunk-vacant-dog-');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const id = key => `r${OUTSKIRT_DOG_ENCOUNTER.pass}-${key}`;
const assetResponses = [], assetRequests = [], logs = [], errors = [], captures = [];
let browser, page, fatal = null, propsModuleUrl = null, renderModuleUrl = null, warpDebug = [];

async function state() {
  return page.evaluate(async ({ propsModuleUrl, renderModuleUrl }) => {
    const R = await import(renderModuleUrl);
    const P = await import(propsModuleUrl);
    return {
      scene: window.__scenes?.top()?.id,
      position: window.__probe.pos(),
      flashlight: !!window.__probe.rec().light,
      lighting: window.__probe.r3dLighting?.(),
      props: window.__probe.sourceProps(),
      pixelMesh: R.r3dPixelMeshStatus(),
      characters: P.characterStats(),
    };
  }, { propsModuleUrl, renderModuleUrl });
}

async function waitFor(predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await state();
    if (predicate(last)) return last;
    await pause(100);
  }
  throw new Error(`Timed out: ${JSON.stringify({ scene: last?.scene, characters: last?.characters,
    pair: last?.props?.filter(p => /dog-walker/.test(p.id)) })}`);
}

async function warp(x, z, target, targetHeight = 1.45) {
  const yaw = Math.atan2(target.x - x, -(target.z - z));
  const pitch = Math.atan2(targetHeight - 1.62, Math.hypot(target.x - x, target.z - z));
  const result = await page.evaluate(({ x, z, yaw, pitch, cell }) => {
    const warp = window.__probe.sourceWarp(x / cell - .5, z / cell - .5);
    const look = window.__probe.lookAtWorld(yaw, pitch);
    window.__probe.hush();
    return { warp, look, pos: window.__probe.pos(), source: window.__probe.chunkSurf()?.phase };
  }, { x, z, yaw, pitch, cell: CELL });
  warpDebug.push({ x, z, yaw, pitch, result });
  await pause(350);
}

async function capture(name) {
  const current = await state();
  assert.equal(current.pixelMesh?.enabled, true, 'the shared final dither pass is off');
  for (const key of [OUTSKIRT_DOG_ENCOUNTER.handlerKey, OUTSKIRT_DOG_ENCOUNTER.dogKey, OUTSKIRT_DOG_ENCOUNTER.leadKey]) {
    assert.ok(current.props.some(prop => prop.id === id(key)), `${name}: ${key} not submitted`);
  }
  assert.ok(current.characters?.poses?.some(pose => pose.id === id(OUTSKIRT_DOG_ENCOUNTER.handlerKey)),
    `${name}: the handler did not reach the skinned renderer`);
  const screenshot = join(output, name + '.png');
  await page.screenshot({ path: screenshot });
  const stages = {};
  for (const stage of ['props', 'vfd']) {
    const source = await page.evaluate(stage => window.__probe.sourceShoreCapture(stage), stage);
    assert.ok(source?.startsWith('data:image/png;base64,'), `${name}: missing ${stage} capture`);
    const bytes = Buffer.from(source.split(',')[1], 'base64');
    const path = join(output, `${name}-${stage}.png`);
    await writeFile(path, bytes);
    stages[stage] = { path, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  assert.notEqual(stages.props.sha256, stages.vfd.sha256, 'final stage bypassed the world target');
  captures.push({ name, screenshot, stages, state: {
    flashlight: current.flashlight, lighting: current.lighting, pixelMesh: current.pixelMesh,
    pair: current.props.filter(prop => /dog-walker/.test(prop.id)),
    nearby: current.props.filter(prop => prop.distance < 16).map(prop => ({ id: prop.id, mesh: prop.mesh, distance: prop.distance })),
    handlerPose: current.characters.poses.find(pose => pose.id === id(OUTSKIRT_DOG_ENCOUNTER.handlerKey)),
    poseErrors: current.characters.poseErrors,
  } });
  console.log('CAPTURE', screenshot);
}

try {
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: profile, headless: true, protocolTimeout: 120000,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling', '--disk-cache-size=1048576', '--media-cache-size=1048576', '--disable-gpu-shader-disk-cache'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: .8 });
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
    const NativeSocket = window.WebSocket;
    class QuietSocket extends EventTarget {
      constructor() { super(); this.readyState = 1; queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
      send() {} close() {}
    }
    window.WebSocket = class extends NativeSocket {
      constructor(target, protocols) {
        if (protocols === 'vite-hmr') return new QuietSocket();
        super(target, protocols);
      }
    };
  });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'warning' || message.type() === 'error') logs.push(message.text());
    if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID|outskirts vacant dog pack unavailable/i.test(message.text())) errors.push(message.text());
  });
  page.on('request', request => {
    if (request.url().includes('.glb')) assetRequests.push(request.url());
    if (new URL(request.url()).pathname === '/src/render/props3d.js') propsModuleUrl = request.url();
    if (new URL(request.url()).pathname === '/src/render/r3d.js') renderModuleUrl = request.url();
  });
  page.on('response', async response => {
    const path = new URL(response.url()).pathname;
    if (!path.endsWith('/outskirts-vacant-dog.glb') && !path.endsWith('/outskirts-dog-handler.glb')) return;
    try {
      const bytes = await response.buffer();
      assetResponses.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } catch (error) { errors.push(`asset response: ${error}`); }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.testRun, { timeout: 90000 });
  await page.waitForFunction(() => ['eula', 'lens-calibration', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 90000 });
  for (let attempt = 0; attempt < 180; attempt++) {
    const scene = await page.evaluate(() => window.__scenes?.top()?.id);
    if (scene === 'title' || scene === 'lens-calibration') break;
    if (scene === 'eula') await page.keyboard.press('Enter');
    await pause(250);
  }
  await page.evaluate(async () => {
    await window.__probe.testRun(); window.__probe.tutSkip(); window.__probe.hush();
    window.__probe.setFlags(['van.closed', 'kit.fitted']);
  });
  assert.ok(propsModuleUrl && renderModuleUrl, 'actual renderer module URLs not observed');
  const depth = SOURCE_PRE_TAPE.stillLength +
    (OUTSKIRT_STRETCH_START + OUTSKIRT_DOG_ENCOUNTER.pass * OUTSKIRT_STRETCH_METRES + 11) / CELL;
  await page.evaluate(async depth => { await window.__probe.preTapePreset(depth); window.__probe.hush(); }, depth);
  const ready = await waitFor(s => s.props.some(p => p.id === id(OUTSKIRT_DOG_ENCOUNTER.dogKey)), 60000);
  for (let attempt = 0; attempt < 600 && assetResponses.length < 2; attempt++) await pause(100);
  assert.ok(assetResponses.some(asset => asset.sha256 === assetHash),
    `browser did not load the selected dog GLB bytes; requests=${assetRequests.length}; logs=${logs.slice(-5).join(' | ')}`);
  assert.ok(assetResponses.some(asset => asset.sha256 === handlerHash),
    `browser did not load the selected handler GLB bytes; requests=${assetRequests.length}; logs=${logs.slice(-5).join(' | ')}`);
  await waitFor(s => s.characters?.meshes?.includes('outskirts_dog_handler'), 15000);
  const man = ready.props.find(p => p.id === id(OUTSKIRT_DOG_ENCOUNTER.handlerKey));
  const dog = ready.props.find(p => p.id === id(OUTSKIRT_DOG_ENCOUNTER.dogKey));
  const target = { x: (man.x + dog.x) / 2, y: dog.y, z: (man.z + dog.z) / 2 };
  await warp(man.x - 3.4, man.z + 7.0, target);
  if ((await state()).flashlight) await page.keyboard.press('f');
  await pause(400);
  await capture('approach-lamp-only');
  await page.keyboard.press('f');
  await pause(400);
  await capture('approach-flashlight');
  await warp((man.x + dog.x) / 2, man.z + 3.35, { x: dog.x + .25, y: dog.y, z: dog.z }, 1.12);
  await page.keyboard.press('f');
  await pause(400);
  await capture('near-lamp-only');
  await page.keyboard.press('f');
  await pause(400);
  await capture('near-flashlight');
  await page.keyboard.press('f');
  const nearYaw = warpDebug.at(-1).yaw;
  await page.evaluate(yaw => window.__probe.lookAtWorld(yaw + Math.PI, 0), nearYaw);
  await pause(250);
  await page.evaluate(yaw => window.__probe.lookAtWorld(yaw, 0), nearYaw);
  await pause(250);
  await capture('near-return-look');
  await warp(man.x - 3.4, man.z - 7.0, target);
  await capture('return-look');
  await warp(man.x - 1.5, man.z - 3.5, target);
  const backYaw = warpDebug.at(-1).yaw;
  await page.evaluate(yaw => window.__probe.lookAtWorld(yaw + Math.PI, 0), backYaw);
  await pause(350);
  await page.evaluate(yaw => window.__probe.lookAtWorld(yaw, 0), backYaw);
  await pause(350);
  await capture('near-back-look');
  assert.equal(errors.length, 0, `browser errors: ${errors.join('; ')}`);
} catch (error) {
  fatal = String(error.stack || error);
  console.error(fatal);
  if (page && !page.isClosed()) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
} finally {
  await browser?.close();
  await rm(profile, { recursive: true, force: true });
  await writeFile(join(output, 'report.json'), JSON.stringify({ assetHash, handlerHash, assetResponses, assetRequests, propsModuleUrl, renderModuleUrl, warpDebug, logs, captures, errors, fatal }, null, 2));
}
process.exit(fatal || errors.length ? 1 : 0);
