// Actual Vite player acceptance for the academic roof. This uses God warps only
// to establish locations; the screenshots and focus come from the live renderer.
import puppeteer from 'puppeteer-core';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const url = process.env.ROOF_LIVE_URL || 'http://127.0.0.1:5351/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0';
const out = resolve(process.env.ROOF_LIVE_OUT || 'artifacts/roof-floor-design/live');
await mkdir(out, { recursive: true });
const assetHashes = async () => Object.fromEntries(await Promise.all([
  'public/assets/conservatory-props.glb', 'src/render/props3d.js',
].map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const hashesBefore = await assetHashes();
const profile = await mkdtemp(join(tmpdir(), 'chunk-roof-live-'));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, userDataDir: profile, protocolTimeout: 300000,
  args: ['--no-sandbox', '--enable-webgl', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport(process.env.ROOF_LIVE_DIAGNOSTIC === '1' || process.env.ROOF_LIVE_MINIMAL === '1'
  ? { width: 960, height: 600, deviceScaleFactor: 1 }
  : { width: 1120, height: 700, deviceScaleFactor: 1 });
// The companion Vite server starts with server.hmr=false to hold one coherent
// module snapshot while teammates edit files. No game response is replaced.
await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
const errors = [], captures = [], checks = [];
let stage = 'boot';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
page.on('pageerror', error => errors.push({ stage, type: 'pageerror', message: String(error.stack || error) }));
page.on('console', message => {
  const value = message.text();
  if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID/i.test(value)) {
    const previous = errors.find(item => item.type === 'console' && item.message === value);
    if (previous) previous.count = (previous.count || 1) + 1;
    else errors.push({ stage, type: 'console', message: value, count: 1 });
  }
});
function check(value, name, detail) {
  const item = { pass: !!value, name, detail };
  checks.push(item); console.log(item.pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail ?? null));
}
async function state() {
  return page.evaluate(() => {
    const p = window.__probe;
    return {
      pos: p?.pos?.(), look: p?.lookAngles?.(), floor: p?.floorH?.(),
      scene: window.__scenes?.top?.()?.id || null,
      sceneView: window.__scenes?.top?.()?.view?.() || null,
      viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight,
        canvasRects: [...document.querySelectorAll('canvas')].map(canvas => {
          const rect = canvas.getBoundingClientRect();
          return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
        }) },
      focus: p?.interactionFocus?.(), props: p?.props?.(),
      light: p?.rec?.()?.light, lighting: p?.r3dLighting?.(),
      display: { pixelMesh: window.__chunkSurferPixelMesh?.status?.(),
        look: window.__chunkSurferPixelMesh?.lookStatus?.(),
        screen: p?.screen?.() },
      performance: window.__chunkSurferDisplay?.performanceSnapshot?.(),
      save: JSON.parse(localStorage.getItem('chunk-surfer:save:v4') || 'null'),
    };
  });
}
async function shot(name) {
  stage = name; await sleep(700);
  const snapshot = await state();
  const path = join(out, `${name}.webp`);
  await page.screenshot({ path, type: 'webp', quality: 88 });
  captures.push({ name, path, pos: snapshot.pos, look: snapshot.look,
    floor: snapshot.floor, scene: snapshot.scene, focus: snapshot.focus,
    viewport: snapshot.viewport,
    light: snapshot.light, renderedIds: snapshot.props?.renderedIds,
    lighting: snapshot.lighting, display: snapshot.display,
    performance: snapshot.performance });
  console.log('CAPTURE', name, path, JSON.stringify({ pos: snapshot.pos, focus: snapshot.focus, rendered: snapshot.props?.renderedIds?.filter(id => id.includes('roof')) }));
  return snapshot;
}
async function shotCanvases(name) {
  const canvases = await page.evaluate(() => [...document.querySelectorAll('canvas')].map((canvas, index) => ({
    index, id: canvas.id, width: canvas.width, height: canvas.height, data: canvas.toDataURL('image/png'),
  })));
  for (const canvas of canvases) {
    const path = join(out, `${name}-canvas-${canvas.index}.png`);
    await writeFile(path, Buffer.from(canvas.data.split(',')[1], 'base64'));
    console.log('CANVAS', name, path, JSON.stringify({ id: canvas.id, width: canvas.width, height: canvas.height }));
  }
}
async function warp(x, y, facing = null) {
  await page.evaluate(({ x, y, facing }) => window.__probe.warpCell(x, y, facing), { x, y, facing });
  await sleep(450);
}
async function aim(x, y, pitch = -0.02) {
  await page.evaluate(({ x, y, pitch }) => {
    const here = window.__probe.pos();
    const target = { x: x * 2 + 1, y: y * 2 + 1 };
    const bearing = Math.atan2(target.x - here.x, -(target.y - here.y));
    window.__probe.lookAtWorld(bearing, pitch);
  }, { x, y, pitch });
  await sleep(160);
}
async function findFocus(id, positions) {
  for (const [x, y] of positions) {
    await warp(x, y);
    const prop = (await state()).props?.instances?.find(item => item.id === id);
    if (prop) await aim(prop.x, prop.y, 0);
    if ((await state()).focus?.propId === id) return [x, y];
  }
  return null;
}
async function press(key) { await page.keyboard.press(key); await sleep(250); }

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  console.log('BOOT committed');
  await page.waitForFunction(() => window.__probe?.testRun && window.__scenes?.top?.()?.id, { timeout: 120000 });
  console.log('BOOT probe ready');
  const bootViewport = await state();
  check(bootViewport.viewport.innerWidth >= 960 && bootViewport.viewport.innerHeight >= 600,
    'safe inner viewport', bootViewport.viewport);
  stage = 'fixture';
  await page.evaluate(async () => {
    await window.__probe.testRun(); window.__probe.tutSkip(); window.__probe.hush?.();
    window.__probe.setFlags(['setup.levels', 'combat.trained', 'setup.waypoint', 'roof.access', 'academic.entered']);
    window.__probe.setTorch(false);
  });
  console.log('BOOT fixture ready');
  if (process.env.ROOF_LIVE_REN_PULSE === '1') {
    // A bounded visual fixture starts at the authored cassette return. The
    // conversation itself advances through world focus and ordinary keys.
    await page.evaluate(async () => {
      const { saveCommit } = await import('/src/game/save.js');
      const { freshRoofRenState } = await import('/src/game/roof-ren.js');
      saveCommit({ roofRen: { ...freshRoofRenState(), stage: 'carrying', met: true } });
      window.__probe.setTorch(true);
    });
    await warp(210.5, 274); await aim(210, 273, 0);
    await shot('ren-before-memory-fold');
    await shotCanvases('ren-before-memory-fold');
    await press('e');
    let captured = false;
    for (let guard = 0; guard < 120; guard++) {
      const dialogue = await page.evaluate(() => ({ scene: window.__scenes?.top?.()?.id,
        view: window.__scenes?.top?.()?.view?.() }));
      if (dialogue.scene !== 'thought:roof-ren') throw new Error(`Ren dialogue closed before memory fold: ${dialogue.scene}`);
      if (dialogue.view?.line?.text?.startsWith('Ren answers her before')) {
        await sleep(340);
        await shot('ren-memory-fold-pulse');
        await shotCanvases('ren-memory-fold-pulse');
        await sleep(1000);
        await shot('ren-memory-fold-restored');
        await shotCanvases('ren-memory-fold-restored');
        captured = true; break;
      }
      if (dialogue.view?.pending?.kind === 'branch') {
        const index = dialogue.view.pending.options.findIndex(option => option.id === 'roof-ren.return-sealed');
        if (index < 0) throw new Error(`Unexpected Ren choice: ${dialogue.view.pending.options.map(option => option.id).join(', ')}`);
        await press(String(index + 1));
      } else {
        if (dialogue.view?.lineAge < .26 && !dialogue.view?.typing) await sleep(Math.ceil((.27 - dialogue.view.lineAge) * 1000));
        await press('Enter');
      }
    }
    check(captured, 'authored cassette line contracts Ren fold', { captured });
  } else if (process.env.ROOF_LIVE_SEAT_ONLY === '1') {
    await warp(193, 294); await aim(202, 280, 0.04);
    await shot('arrival');
    if (process.env.ROOF_LIVE_RAW === '1') {
      await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('world'));
      await shot('arrival-world-raw');
      await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('final'));
    }
    if (process.env.ROOF_LIVE_OUTWARD === '1') {
      // Same occupied height, two real bearings of the playable civic block.
      await warp(201,282);
      await page.evaluate(() => window.__probe.lookAtWorld(-2.27,-.12));
      await shot('overworld-church-baths-bearing');
      await page.evaluate(() => window.__probe.lookAtWorld(2.39,-.12));
      await shot('overworld-mill-yard-bearing');
    }
    const seatAt = await findFocus('roof-sit-west', [[200, 289], [199, 289], [200, 288], [201, 289], [199, 288]]);
    check(!!seatAt, 'supported glass seat focusable', seatAt);
    if (seatAt) {
      await press('e');
      await page.waitForFunction(() => window.__scenes?.top?.()?.id === 'academic-roof-sit' &&
        window.__scenes.top().view?.().phase === 'seated', { timeout: 15000 });
      await shot('glass-seated');
      if (process.env.ROOF_LIVE_RAW === '1') {
        await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('world'));
        await shot('glass-seated-world-raw');
        await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('final'));
      }
      await press('e');
      await page.waitForFunction(() => window.__scenes?.top?.()?.id !== 'academic-roof-sit', { timeout: 15000 });
    }
    for (const [name, x, y, pitch] of (process.env.ROOF_LIVE_FAST === '1' ? [] : [['south',200,288,-0.60], ['middle',200,284,-0.60], ['north',200,279,-0.60],
      ['down-south',200,287,-2.15], ['down-middle',201,283,-2.15]])) {
      await warp(x,y); await aim(200,280,pitch);
      await shot(`glass-parallax-${name}`);
      if (process.env.ROOF_LIVE_RAW === '1') {
        await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('world'));
        await shot(`glass-parallax-${name}-world-raw`);
        await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('final'));
      }
    }
  } else if (process.env.ROOF_LIVE_REN_FACE === '1') {
    await page.evaluate(() => window.__probe.setTorch(true));
    await warp(211, 275); await aim(210, 273, 0);
    await shot('ren-face-standard-approach');
    await warp(210.5, 274); await aim(210, 273, 0);
    await shot('ren-face-near-final');
    await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('world'));
    await shot('ren-face-near-raw');
    await page.evaluate(() => { window.__probe.setTorch(false); window.__chunkSurferPixelMesh.setDebugSource('final'); });
    await shot('ren-face-near-dark-final');
    await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('world'));
    await shot('ren-face-near-dark-raw');
    await page.evaluate(() => { window.__probe.setTorch(true); window.__chunkSurferPixelMesh.setDebugSource('final'); });
    await warp(208, 273); await aim(210, 273, 0);
    await shot('ren-profile-lit-final');
    await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('world'));
    await shot('ren-profile-lit-raw');
    await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('final'));
    await page.evaluate(() => window.__probe.setTorch(false));
    await shot('ren-profile-dark-final');
    await page.evaluate(() => window.__probe.setTorch(true));
    await warp(212, 273); await aim(210, 273, 0);
    await shot('ren-intact-profile-lit-final');
  } else if (process.env.ROOF_LIVE_DEPTH === '1') {
    const seatAt = await findFocus('roof-sit-west', [[200, 289], [199, 289], [200, 288], [201, 289], [199, 288]]);
    check(!!seatAt, 'depth study seated position is reachable', seatAt);
    if (seatAt) {
      await press('e');
      await page.waitForFunction(() => window.__scenes?.top?.()?.id === 'academic-roof-sit' &&
        window.__scenes.top().view?.().phase === 'seated', { timeout: 15000 });
      await shot('seat-eye-minus-068');
      const stages = await page.evaluate(() => {
        const gl = [...document.querySelectorAll('canvas')].map(canvas => canvas.getContext('webgl2')).find(Boolean);
        const original = gl.readPixels;
        let sample = null;
        gl.readPixels = function (...args) {
          const result = original.apply(this, args);
          const [,, width, height,, type, pixels] = args;
          if (type === this.FLOAT && pixels instanceof Float32Array && width > 500) {
            const packedFar = 1 / (1 + 90 * .14);
            const point = (x, y) => {
              const sx = Math.min(width - 1, Math.floor(x * width));
              const sy = Math.min(height - 1, Math.floor(y * height));
              const at = ((height - 1 - sy) * width + sx) * 4;
              return { x, y, rgb: Array.from(pixels.subarray(at, at + 3)).map(v => +v.toFixed(5)),
                packedDepth: +pixels[at + 3].toFixed(6), farSky: pixels[at + 3] <= packedFar + .0005 };
            };
            const row = y => {
              const sy = Math.min(height - 1, Math.floor(y * height));
              let far = 0, meanDepth = 0, meanLuma = 0;
              for (let x = 0; x < width; x++) {
                const at = ((height - 1 - sy) * width + x) * 4;
                const d = pixels[at + 3];
                far += d <= packedFar + .0005 ? 1 : 0;
                meanDepth += d;
                meanLuma += pixels[at] * .2126 + pixels[at + 1] * .7152 + pixels[at + 2] * .0722;
              }
              return { y, farFraction: +(far / width).toFixed(3), meanDepth: +(meanDepth / width).toFixed(5),
                meanLuma: +(meanLuma / width).toFixed(5) };
            };
            sample = { width, height, packedFar, points: [
              point(.5, .15), point(.5, .3), point(.5, .37), point(.5, .40), point(.5, .43),
              point(.25, .40), point(.75, .40), point(.5, .5), point(.5, .65), point(.5, .82),
            ], rows: [.15, .25, .3, .35, .37, .4, .42, .45, .5, .65, .82].map(row) };
          }
          return result;
        };
        try {
          const scene = window.__probe.sourceShoreCapture('scene');
          const vfd = window.__probe.sourceShoreCapture('vfd');
          return { sample, scene, vfd };
        } finally { gl.readPixels = original; }
      });
      check(!!stages.sample, 'raw scene depth readback acquired', stages.sample);
      await writeFile(join(out, 'scene-stage.png'), Buffer.from(stages.scene.split(',')[1], 'base64'));
      await writeFile(join(out, 'vfd-stage.png'), Buffer.from(stages.vfd.split(',')[1], 'base64'));
      await writeFile(join(out, 'depth-samples.json'), JSON.stringify(stages.sample, null, 2));
      for (const [name, drop] of [['eye-minus-048', -.48], ['eye-minus-042', -.42]]) {
        await page.evaluate(drop => {
          const scene = window.__scenes.top();
          if (!scene.__qaWorldView) scene.__qaWorldView = scene.worldView.bind(scene);
          scene.worldView = () => ({ ...scene.__qaWorldView(), floorH: 17 + drop });
        }, drop);
        await shot(name);
      }
    }
  } else if (process.env.ROOF_LIVE_TONE === '1') {
    const seatAt = await findFocus('roof-sit-west', [[200, 289], [199, 289], [200, 288], [201, 289], [199, 288]]);
    check(!!seatAt, 'tone sweep seated position is reachable', seatAt);
    if (seatAt) {
      await press('e');
      await page.waitForFunction(() => window.__scenes?.top?.()?.id === 'academic-roof-sit' &&
        window.__scenes.top().view?.().phase === 'seated', { timeout: 15000 });
      const variants = [
        { name: 'baseline', white: 1, exposure: 1, screen: 'hatch' },
        { name: 'white-075', white: .75, exposure: 1, screen: 'hatch' },
        { name: 'white-050', white: .5, exposure: 1, screen: 'hatch' },
        { name: 'exposure-2', white: 1, exposure: 2, screen: 'hatch' },
        { name: 'exposure-4', white: 1, exposure: 4, screen: 'hatch' },
        { name: 'stochastic', white: 1, exposure: 1, screen: 'stochastic' },
        { name: 'crosshatch', white: 1, exposure: 1, screen: 'crosshatch' },
        { name: 'combo-075-2-stochastic', white: .75, exposure: 2, screen: 'stochastic' },
        { name: 'combo-050-4-stochastic', white: .5, exposure: 4, screen: 'stochastic' },
      ];
      for (const variant of variants) {
        const applied = await page.evaluate(({ white, exposure, screen }) => {
          const p = window.__probe;
          const values = { white: p.whitePointScale(white),
            exposure: p.captureExposure(exposure), screen: p.screen(screen) };
          window.__chunkSurferPixelMesh.resetMemory();
          return values;
        }, variant);
        const frame = await shot(`tone-${variant.name}`);
        captures.at(-1).tuning = { requested: variant, applied };
        check(frame.scene === 'academic-roof-sit' &&
          frame.display.screen.effective === variant.screen &&
          applied.white === variant.white && applied.exposure === variant.exposure,
        `tone ${variant.name} applied`, { applied, effectiveScreen: frame.display.screen.effective });
      }
    }
  } else if (process.env.ROOF_LIVE_DIAGNOSTIC === '1') {
    const vantage = [201, 282];
    const directions = [
      ['north', 201, 270], ['east', 213, 282],
      ['south', 201, 295], ['west', 190, 282],
    ];
    for (const [name, x, y] of directions) {
      await warp(...vantage); await aim(x, y, -0.03);
      await shot(`sweep-${name}`);
    }
    await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('world'));
    await warp(...vantage); await aim(189, 282, -0.03);
    await shot('sweep-west-world-raw');
    await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('final'));
    if (process.env.ROOF_LIVE_AB === '1') {
      const remove = async ids => page.evaluate(async ids => {
        const source = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/game/props.js')?.name;
        const props = await import(source || '/src/game/props.js');
        for (const id of ids) props.setLooseProp(id, null);
      }, ids);
      await remove(['academic-roof-structure', 'academic-roof-glazing', 'baseboard-academicRoof']);
      await warp(...vantage); await aim(201, 270, -0.03);
      const noRoofMeshes = await shot('ab-no-native-roof-meshes');
      check(!noRoofMeshes.props?.renderedIds?.includes('academic-roof-structure'), 'native roof mesh exclusion took effect');
      const groundIds = (await state()).props.instances.filter(p => p.renderGroups?.includes('ground') || p.renderGroup === 'ground').map(p => p.id);
      await remove(groundIds);
      await warp(...vantage); await aim(201, 270, -0.03);
      await shot('ab-no-ground-meshes');
    }
  } else if (process.env.ROOF_LIVE_MINIMAL === '1') {
    await warp(193, 294); await aim(202, 280, 0.04);
    const arrival = await shot('arrival');
    check(arrival.props?.renderedIds?.includes('academic-roof-structure'), 'native roof structure submitted');
    if (process.env.ROOF_LIVE_RAW === '1') {
      await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('world'));
      await shot('arrival-world-raw');
      await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('final'));
    }
    await page.evaluate(() => window.__probe.setTorch(true));
    const renAt = await findFocus('roof-ren', [[208, 275], [209, 275], [209, 276]]);
    check(!!renAt, 'Ren focusable', renAt);
    if (renAt) {
      await shot('ren-close-torch-on');
      if (process.env.ROOF_LIVE_RAW === '1') {
        await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('world'));
        await shot('ren-close-world-raw');
        await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('final'));
      }
      await page.evaluate(() => window.__probe.setTorch(false));
      await shot('ren-close-torch-off');
      if (process.env.ROOF_LIVE_REN_CLOSE === '1') {
        for (const [label, x, y] of [['front', 209.6, 274.0], ['side', 211.0, 273.5]]) {
          await warp(x, y); await aim(210, 273, 0);
          await page.evaluate(() => window.__probe.setTorch(true));
          await shot(`ren-${label}-near-final`);
          await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('world'));
          await shot(`ren-${label}-near-raw`);
          await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('final'));
        }
        await warp(...renAt); await aim(210, 273, 0);
      }
      await press('e');
      const talk = await shot('ren-dialogue');
      check(talk.scene === 'thought:roof-ren', 'Ren authored dialogue opens', talk.scene);
      await press('Escape');
    }
    const seatAt = await findFocus('roof-sit-west', [[200, 289], [199, 289], [200, 288], [201, 289], [199, 288]]);
    check(!!seatAt, 'supported glass seat focusable', seatAt);
    if (seatAt) {
      await press('e');
      await page.waitForFunction(() => window.__scenes?.top?.()?.id === 'academic-roof-sit' &&
        window.__scenes.top().view?.().phase === 'seated', { timeout: 15000 });
      const seated = await shot('glass-seated');
      check(seated.scene === 'academic-roof-sit' && seated.sceneView?.phase === 'seated', 'glass sit settles', seated.sceneView);
      if (process.env.ROOF_LIVE_RAW === '1') {
        await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('world'));
        await shot('glass-seated-world-raw');
        await page.evaluate(() => window.__chunkSurferPixelMesh.setDebugSource('final'));
      }
      const perf = await page.evaluate(async () => {
        const counter = () => window.__chunkSurferPixelMesh.status().framesRendered;
        const start = performance.now(), frames = counter();
        await new Promise(resolve => setTimeout(resolve, 3000));
        const seconds = (performance.now() - start) / 1000;
        return { frames: counter() - frames, seconds, fps: +( (counter() - frames) / seconds ).toFixed(1),
          snapshot: window.__chunkSurferDisplay.performanceSnapshot?.() };
      });
      checks.push({ pass: true, name: 'stationary seated native frame rate', detail: perf });
      console.log('PERF', JSON.stringify(perf));
    }
  } else {
  await warp(193, 294); await aim(202, 280, 0.04);
  const arrival = await shot('01-arrival-torch-off');
  check(arrival.props?.renderedIds?.includes('academic-roof-structure'), 'roof structure submitted to native prop renderer');
  check(arrival.props?.renderedIds?.includes('academic-roof-glazing'), 'supported glass submitted to native prop renderer');
  check(!arrival.scene, 'roof arrival is ordinary walkable world', arrival.scene);
  await page.evaluate(() => window.__probe.setTorch(true));
  await shot('02-arrival-torch-on');

  await warp(204, 281); await aim(210, 273, -0.02);
  const renFar = await shot('03-ren-approach-torch-on');
  check(renFar.props?.renderedIds?.includes('roof-ren'), 'Ren submitted with torch on');
  await page.evaluate(() => window.__probe.setTorch(false));
  const renOff = await shot('04-ren-approach-torch-off');
  check(renOff.props?.renderedIds?.includes('roof-ren'), 'Ren submitted with torch off');

  const renFocusAt = await findFocus('roof-ren', [[209, 275], [209, 276], [210, 276], [209, 274], [208, 275], [210, 275]]);
  check(!!renFocusAt, 'Ren can be focused with ordinary world interaction', { at: renFocusAt, focus: (await state()).focus });
  if (renFocusAt) {
    await shot('05-ren-focus'); await press('e');
    const talk = await shot('06-ren-dialogue');
    check(talk.scene === 'thought:roof-ren', 'Ren opens authored dialogue', { scene: talk.scene, view: talk.sceneView });
    await press('Escape');
  }

  const sitFocusAt = await findFocus('roof-sit-west', [[200, 289], [199, 289], [200, 288], [201, 289], [199, 288]]);
  check(!!sitFocusAt, 'supported glass seat can be focused', { at: sitFocusAt, focus: (await state()).focus });
  if (sitFocusAt) {
    await shot('07-supported-glass-focus'); await press('e');
    await page.waitForFunction(() => window.__scenes?.top?.()?.id === 'academic-roof-sit' &&
      window.__scenes.top().view?.().phase === 'seated', { timeout: 15000 });
    const sit = await shot('08-supported-glass-seated');
    check(sit.scene === 'academic-roof-sit' && sit.sceneView?.phase === 'seated', 'seat enters settled playable sit scene', { scene: sit.scene, view: sit.sceneView });
    await press('e');
    await page.waitForFunction(() => window.__scenes?.top?.()?.id !== 'academic-roof-sit', { timeout: 15000 });
    const stood = await state();
    check(stood.scene !== 'academic-roof-sit', 'E stands from supported glass', { scene: stood.scene });
  }

  await page.evaluate(() => window.__probe.setFlag('roof.access', false));
  await warp(17, 277); await aim(17, 276);
  const gate = await shot('09-loggia-gate');
  check(gate.props?.renderedIds?.includes('roof-gate'), 'entry gate rendered in loggia', { focus: gate.focus });

  if (process.env.ROOF_LIVE_AB === '1') {
  // Visual A/B from one frozen production module snapshot. Remove selected
  // props only in this disposable browser's runtime and use its normal render
  // refresh. This locates any facade that occludes the city panorama.
  await warp(193, 294); await aim(202, 280, 0.04);
  await shot('10-occlusion-baseline');
  async function removeProps(ids) {
    return page.evaluate(async ids => {
      const source = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/game/props.js')?.name;
      const mod = await import(source || '/src/game/props.js');
      const removed = ids.filter(id => !!mod.propById(id));
      for (const id of removed) mod.setLooseProp(id, null);
      return removed;
    }, ids);
  }
  const roofStructureRemoved = await removeProps(['academic-roof-structure']);
  await warp(193, 294); await aim(202, 280, 0.04);
  const noStructure = await shot('11-no-roof-structure');
  check(!noStructure.props?.renderedIds?.includes('academic-roof-structure'), 'roof structure exclusion took effect', roofStructureRemoved);
  const glazingRemoved = await removeProps(['academic-roof-glazing']);
  await warp(193, 294); await aim(202, 280, 0.04);
  const noGlazing = await shot('12-no-roof-glazing');
  check(!noGlazing.props?.renderedIds?.includes('academic-roof-glazing'), 'roof glazing exclusion took effect', glazingRemoved);
  const groundIds = (await state()).props.instances.filter(p => p.renderGroups?.includes('ground') || p.renderGroup === 'ground').map(p => p.id);
  const groundRemoved = await removeProps(groundIds);
  await warp(193, 294); await aim(202, 280, 0.04);
  const noGround = await shot('13-no-ground-props');
  check(groundRemoved.length > 50, 'ground facade group excluded for A/B', groundRemoved.length);
  check(noGround.props?.renderedIds?.every(id => !groundRemoved.includes(id)), 'excluded ground props are absent from renderer',
    noGround.props?.renderedIds?.filter(id => groundRemoved.includes(id)).slice(0, 5));
  }
  }
} catch (error) {
  errors.push({ stage, type: 'fatal', message: String(error.stack || error) });
  console.error('FATAL', error);
} finally {
  const hashesAfter = await assetHashes();
  check(JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter),
    'Ren shader and shared props pack stayed fixed during capture', { hashesBefore, hashesAfter });
  const report = { url, checks, captures, errors, hashesBefore, hashesAfter };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log('REPORT', join(out, 'report.json'));
  await browser.close();
}
if (errors.length || checks.some(item => !item.pass)) process.exitCode = 1;
