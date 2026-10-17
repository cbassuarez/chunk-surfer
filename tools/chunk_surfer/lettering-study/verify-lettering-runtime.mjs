import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../../../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../../../src/game/source-space-runtime.js';

const root = resolve('.'), out = 'artifacts/lettering-study/evidence'; mkdirSync(out, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = ['src/render/props3d.js', 'src/render/source-text-atlas.js', 'src/render/battle-hand-tools.js', 'src/render/battle-hands.js', 'src/render/world-lettering-fonts.js'];
const before = Object.fromEntries(sources.map(file => [file, sha(readFileSync(file))]));
const preset = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT, { seed: 4417 });
const runtime = createSourceSpaceRuntime({ initialState: preset.state }); runtime.setPlayerPosition(preset.position);
const corpus = [...new Set(runtime.sourceScene({ px: preset.position.x, py: preset.position.y, time: 0 }).corpus)];
// The production loader installs the real procedural meshes onto this empty
// legal GLB. No game save, route, production pack or live UI is modified.
const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, meshes: [], nodes: [], materials: [], buffers: [{ byteLength: 4 }] }).padEnd(160, ' '));
const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
const glb = Buffer.alloc(12 + 8 + padded.length + 8 + 4);
glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
glb.writeUInt32LE(padded.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); padded.copy(glb, 20);
glb.writeUInt32LE(4, 20 + padded.length); glb.writeUInt32LE(0x004e4942, 24 + padded.length);
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://test.local');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Production lettering integration</title><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/","three/":"/node_modules/three/"}}</script>'); return;
  }
  if (url.pathname === '/fixture.glb') { response.setHeader('Content-Type', 'model/gltf-binary'); response.end(glb); return; }
  const relative = decodeURIComponent(url.pathname).slice(1);
  const file = resolve(root, relative.startsWith('assets/fonts/') ? `public/${relative}` : relative);
  if (!file.startsWith(root + '/') || !/^(src\/|content\/|assets\/fonts\/|node_modules\/three\/)/.test(relative)) { response.writeHead(404); response.end(); return; }
  try { const bytes = readFileSync(file); response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.json': 'application/json', '.otf': 'font/otf' })[extname(file)] || 'application/octet-stream'); response.end(bytes); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', timeout: 45000,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-extensions', '--disable-background-networking'] });
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async corpus => {
    const tools = await import('/src/render/battle-hand-tools.js');
    const Fonts = await import('/src/render/world-lettering-fonts.js');
    const originalFill = CanvasRenderingContext2D.prototype.fillText, painted = [];
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...extra) {
      const m = this.measureText(text), t = this.getTransform();
      painted.push({ text: String(text), font: this.font, extra: extra.length, canvas: [this.canvas.width, this.canvas.height],
        left: (x - m.actualBoundingBoxLeft) * t.a + t.e, right: (x + m.actualBoundingBoxRight) * t.a + t.e,
        top: (y - m.actualBoundingBoxAscent) * t.d + t.f, bottom: (y + m.actualBoundingBoxDescent) * t.d + t.f });
      return originalFill.call(this, text, x, y, ...extra);
    };
    const canceled = tools.buildBattleHandTool('torch'), cold = tools.buildBattleHandTool('torch');
    const coldInitial = { fontsReady: Fonts.worldLetteringFontsStatus().ready, lettering: cold.letteringStatus(), glyphsPainted: painted.length };
    const coldMap = cold.group.children.find(node => node.geometry?.type === 'PlaneGeometry')?.material?.map;
    const coldMapVersion = coldMap?.version; canceled.dispose();
    const [canceledResult, coldResult] = await Promise.all([canceled.letteringReady, cold.letteringReady]);
    const warmTools = [];
    for (const id of ['recorder', 'fork', 'radio', 'rig', 'coffee', 'spanner']) {
      const tool = tools.buildBattleHandTool(id); warmTools.push(tool);
      await tool.letteringReady;
    }
    const physicalPaint = painted.slice();
    const lateFont = { coldInitial, canceledResult, coldResult, oldMapVersion: coldMapVersion, newMapVersion: coldMap.version, physicalPaint,
      warmStates: warmTools.map(tool => ({ id: tool.id, ...tool.letteringStatus() })) };
    cold.dispose(); warmTools.forEach(tool => tool.dispose());

    const P3 = await import('/src/render/props3d.js');
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    P3.props3dInit(gl); await P3.loadPropPack('/fixture.glb'); P3.props3dResize(640, 480, { shadowMapSize: 512 });
    const fog = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, fog);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const matrix = new Float32Array([8.2,0,0,0,0,.52,0,0,0,0,1,0,0,1.6,-3,1]);
    const entry = { id: 'validation-resident', text: corpus[100], matrix, interactiveId: 'validation-only' };
    P3.setSourceScene({ key: 'validation-current-corpus', atlasKey: 'validation-current-corpus', corpus, staticInstances: [entry] });
    const render = () => P3.renderPropPass({ camX: 0, camY: 1.6, camZ: 0, yaw: 0, pitch: 0, light: 1, maxDistance: 20,
      timeSec: 0, reducedMotion: true, fogTexture: fog, fogSize: 1, zoneTints: new Float32Array(66).fill(1),
      sourceRoomLighting: false, ambientIntensity: 1, shadowPrepared: true });
    const uploads = [], originalData = gl.bufferData.bind(gl), originalImage = gl.texImage2D.bind(gl); let atlasPng;
    gl.bufferData = (...args) => { if (args[1] instanceof Float32Array && args[1].length === 24) uploads.push([...args[1]]); return originalData(...args); };
    gl.texImage2D = (...args) => { const image = args.at(-1); if (image instanceof HTMLCanvasElement && image.width === 2048) atlasPng = image.toDataURL(); return originalImage(...args); };
    painted.length = 0; const start = performance.now(); const rendered = render(); const firstRenderMs = performance.now() - start;
    const first = P3.propPackStats(), basePaint = painted.map(item => item.text); const baseAtlasPng = atlasPng;
    painted.length = 0; render(); const cached = P3.propPackStats(), cachedPaintCount = painted.length;
    const variant = '  return ███████; // authored omission';
    P3.setSourceScene({ key: 'validation-current-corpus', atlasKey: 'validation-current-corpus', corpus,
      dynamicInstances: [{ ...entry, id: 'validation-live-redaction', text: variant }] });
    painted.length = 0; render(); const changed = P3.propPackStats(), changedPaint = painted.map(item => item.text);
    const target = P3.propTargets(), read = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, read);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.color, 0);
    const pixels = new Uint8Array(640 * 480 * 4); gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let litPixels = 0; for (let n=0; n<pixels.length; n+=4) if (pixels[n] || pixels[n+1] || pixels[n+2]) litPixels++;
    const frame = document.createElement('canvas'); frame.width=640; frame.height=480;
    const data = frame.getContext('2d').createImageData(640,480);
    for(let y=0;y<480;y++)data.data.set(pixels.subarray(y*640*4,(y+1)*640*4),(479-y)*640*4);
    frame.getContext('2d').putImageData(data,0,0);
    const glErrors = []; for(let error=gl.getError(); error!==gl.NO_ERROR; error=gl.getError())glErrors.push(error);
    CanvasRenderingContext2D.prototype.fillText = originalFill;
    return { lateFont, rendered, firstRenderMs, first, cached, changed, cachedPaintCount, basePaint, changedPaint, variant,
      uploads, litPixels, glErrors, atlasPng: baseAtlasPng, rawFramePng: frame.toDataURL(), renderer: gl.getParameter(gl.RENDERER) };
  }, corpus);
  assert.equal(result.lateFont.coldInitial.fontsReady, false); assert.equal(result.lateFont.coldInitial.glyphsPainted, 0);
  assert.equal(result.lateFont.coldResult.ready, true); assert.equal(result.lateFont.coldResult.bakes, 1);
  assert.equal(result.lateFont.canceledResult.bakes, 0); assert.equal(result.lateFont.canceledResult.ready, false);
  assert.ok(result.lateFont.newMapVersion > result.lateFont.oldMapVersion, 'late pinned paint invalidates existing map');
  for (const row of result.lateFont.physicalPaint) {
    assert.ok(row.font.includes('World Lettering'), row.text); assert.equal(row.extra, 0, 'no one-axis maxWidth compression');
    assert.ok(row.left >= -1 && row.top >= -1 && row.right <= row.canvas[0]+1 && row.bottom <= row.canvas[1]+1, `unclipped physical label ${row.text}`);
  }
  assert.ok(result.lateFont.warmStates.every(state=>state.ready && !state.error));
  assert.equal(result.rendered, true); assert.equal(result.basePaint.length, corpus.length, 'actual P3 paints the complete corpus');
  assert.deepEqual(result.basePaint.toSorted(), corpus.toSorted(), 'actual P3 paints every exact corpus string once');
  assert.equal(result.first.textAtlasDiagnostics.accepted, corpus.length); assert.equal(result.first.textAtlasDiagnostics.omitted.length, 0);
  assert.equal(result.cached.textAtlasBuilds, result.first.textAtlasBuilds); assert.equal(result.cachedPaintCount, 0);
  assert.equal(result.changed.textAtlasBuilds, result.first.textAtlasBuilds + 1);
  assert.ok(result.changedPaint.includes(result.variant)); assert.equal(result.changed.textAtlasDiagnostics.accepted, corpus.length + 1);
  assert.deepEqual(result.glErrors, []); assert.deepEqual(errors, []); assert.ok(result.litPixels > 0);
  assert.ok(result.uploads.length >= 2); for (const row of result.uploads) assert.ok(Math.hypot(...row.slice(0,3))<=8.2+1e-5 && Math.hypot(...row.slice(4,7))<=.52+1e-5);
  writeFileSync(`${out}/source-atlas-production-upload.png`, Buffer.from(result.atlasPng.split(',')[1], 'base64')); delete result.atlasPng;
  writeFileSync(`${out}/source-atlas-production-raw-frame.png`, Buffer.from(result.rawFramePng.split(',')[1], 'base64')); delete result.rawFramePng;
  const after = Object.fromEntries(sources.map(file=>[file,sha(readFileSync(file))])); assert.deepEqual(after, before, 'source hashes unchanged during integration capture');
  writeFileSync(`${out}/lettering-runtime-integration.json`, JSON.stringify({ date:new Date().toISOString(), browser:await browser.version(), sourceHashes:before,
    scope:'Actual production P3 shader compilation,Canvas bake,GPU upload,raw prop pass and cache/variant contracts in an isolated WebGL2 fixture. This does not establish final compositor readability or live route comprehension.', corpusSha256:sha(JSON.stringify(corpus)), errors, ...result }, null, 2)+'\n');
  console.log(JSON.stringify({ corpus:corpus.length, accepted:result.first.textAtlasDiagnostics.accepted, variantAccepted:result.changed.textAtlasDiagnostics.accepted,
    fontSize:result.first.textAtlasDiagnostics.fontSize, cacheBakes:result.cachedPaintCount, glyphPaints:result.lateFont.physicalPaint.length,
    coldFontDeferred:true, disposedBakeSuppressed:true, glErrors:result.glErrors, rawPropPixels:result.litPixels, firstRenderMs:result.firstRenderMs }));
} finally { if(browser)await browser.close(); await new Promise(resolve=>server.close(resolve)); }
