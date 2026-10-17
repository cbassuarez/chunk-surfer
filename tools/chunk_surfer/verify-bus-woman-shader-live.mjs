// Compile the shipped character shaders in a real WebGL2 context. This does
// not stage any live game appearance; the isolated canvas is a render test.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const url = process.env.BUS_WOMAN_SHADER_VERIFY_URL || 'http://127.0.0.1:5330/';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Local verification only.');
const out = resolve('artifacts/bus-woman-design/production');
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'bus-woman-shader-'));
let browser;
try {
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, userDataDir: profile,
    args: ['--no-sandbox', '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  // A JS document provides this origin without booting a second game.
  await page.goto(new URL('/src/render/props3d.js', url).href, { waitUntil: 'domcontentloaded' });
  const report = await page.evaluate(async () => {
    const P = await import('/src/render/props3d.js');
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 160; document.body.append(canvas);
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is unavailable');
    const shader = P.props3dDebugShaders(), programs = [];
    for (const [name, vertex, fragment] of [
      ['material', shader.vertex, shader.fragment],
      ['shadow-depth', shader.shadowVertex, shader.shadowFragment],
      ['pressure', shader.pressureVertex, shader.pressureFragment],
    ]) {
      const v = gl.createShader(gl.VERTEX_SHADER), f = gl.createShader(gl.FRAGMENT_SHADER), p = gl.createProgram();
      gl.shaderSource(v, vertex); gl.compileShader(v); gl.shaderSource(f, fragment); gl.compileShader(f);
      const vertexOK = gl.getShaderParameter(v, gl.COMPILE_STATUS), fragmentOK = gl.getShaderParameter(f, gl.COMPILE_STATUS);
      const logs = [gl.getShaderInfoLog(v), gl.getShaderInfoLog(f)].filter(Boolean);
      gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
      const linked = gl.getProgramParameter(p, gl.LINK_STATUS); if (gl.getProgramInfoLog(p)) logs.push(gl.getProgramInfoLog(p));
      programs.push({ name, vertexOK, fragmentOK, linked, logs,
        palette: vertex.match(/uniform mat4 uCharacterBones\[(\d+)\]/)?.[1] });
      gl.deleteProgram(p); gl.deleteShader(v); gl.deleteShader(f);
    }
    P.props3dInit(gl); P.props3dResize(160, 160, { shadowMapSize: 512 });
    const loaded = await P.addCharacterPack('/assets/bus-woman-character.glb');
    P.setPropInstances([]);
    P.setDynamicPropInstances([
      { id: 'existing-yard-test', mesh: 'exterior_bus_woman', x: -.45, y: 0, z: -3, character: { clip: 'bus_woman_wait', time: 0 } },
      { id: 'existing-road-test', mesh: 'outskirts_bus_woman', x: .45, y: 0, z: -3, character: { clip: 'bus_woman_search', time: 2.4 } },
      { id: 'attached-bag-test', mesh: 'bus_woman_bag', x: -.7, y: .75, z: -3.15, character: {} },
      { id: 'attached-ticket-test', mesh: 'bus_woman_ticket', x: .8, y: 1.1, z: -3.15, character: {} },
    ]);
    P.prepareCharacterFrame(40);
    const args = { camX: 0, camY: 1.0, camZ: 0, yaw: 0, light: 1, timeSec: 40,
      zoneTints: new Float32Array(21 * 3).fill(1), shadowPrepared: true, ambientIntensity: .18 };
    P.preparePropShadowPass(args); P.renderPropPass({ ...args, reflection: true }); P.renderPropPass(args);
    const readTarget = texture => {
      const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      const pixels = new Uint8Array(160 * 160 * 4); gl.readPixels(0, 0, 160, 160, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.deleteFramebuffer(fbo);
      let occupied = 0; const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]) { occupied++; colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`); }
      return { occupied, colors: colors.size };
    };
    const material = readTarget(P.propTargets().color);
    const stats = P.characterStats();
    return { vertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
      minimumWebGL2Budget: 256, boundedPaletteVectors: 54 * 4, reservedVectors: 24,
      programs, loadedMeshes: loaded.meshes, material, poses: stats.poses.map(({ id, mesh, clip, time }) => ({ id, mesh, clip, time })),
      poseErrors: stats.poseErrors, error: gl.getError() };
  });
  await writeFile(join(out, 'shader-webgl.json'), `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(report.programs.every(program => program.vertexOK && program.fragmentOK && program.linked), 'a production character shader failed compilation/linking');
  assert.ok(report.programs.every(program => Number(program.palette) === 54), 'a pass omitted the complete articulated-hand palette');
  assert.equal(report.error, 0, 'WebGL emitted an error');
  assert.equal(report.poses.length, 4, 'the real GPU render lost a body or attachment');
  assert.equal(report.poseErrors.length, 0, 'the real GPU render failed to sample a production clip');
  assert.ok(report.material.occupied > 100 && report.material.colors > 10, 'the actual material target contains no shaded production geometry');
  assert.ok(report.boundedPaletteVectors + report.reservedVectors <= report.minimumWebGL2Budget);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close(); await rm(profile, { recursive: true, force: true });
}
