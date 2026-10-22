// Numerical witness for the production tape fragment, not a replacement look.
// A physical fragment keeps its opacity when the camera puts it elsewhere on
// screen. The former screen-coordinate entry cloud changed that opacity.
// Run explicitly: this launches an isolated headless WebGL2 context.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const source = readFileSync(new URL('../src/render/horizon3d.js', import.meta.url), 'utf8');
const fragment = source.match(/const FRAG = `([\s\S]*?)`;/)?.[1];
assert.ok(fragment, 'the production tape fragment is present');
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--use-angle=metal', '--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const result = await page.evaluate(fragment => {
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 64;
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) throw new Error('WebGL2 required');
    const compile = (type, text) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, text); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex = `#version 300 es
precision highp float;
uniform float uWitnessDepth;
out vec2 vQuad;out vec4 vColor;out float vKind,vSeed,vViewDepth;
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  gl_Position=vec4(p*2.0-1.0,0.0,1.0);
  vQuad=vec2(0.0);vColor=vec4(1.0);vKind=0.0;vSeed=0.0;vViewDepth=uWitnessDepth;
}`;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program); gl.bindVertexArray(gl.createVertexArray());
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    for (let index = 0; index < 2; index++) {
      const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 96, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, texture, 0);
    }
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete witness framebuffer');
    const u = name => gl.getUniformLocation(program, name);
    // Valid non-feedback sampler bindings are required even with the street
    // branch inactive; leaving an attached target on unit zero rejects draws.
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(u('uStreet'), 0); gl.uniform1i(u('uStreetDepth'), 0);
    gl.uniform1f(u('uVeil'), 1); gl.uniform1f(u('uWorldActive'), 0);
    gl.uniform2f(u('uSceneRes'), 96, 64);
    gl.viewport(0, 0, 96, 64);
    const draw = (entry, depth) => {
      gl.uniform1f(u('uEntryReveal'), entry); gl.uniform1f(u('uWitnessDepth'), depth);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const pixels = new Uint8Array(96 * 64 * 4); gl.readPixels(0, 0, 96, 64, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const alpha = []; for (let i = 3; i < pixels.length; i += 4) alpha.push(pixels[i]);
      return { entry, depth, minimum: Math.min(...alpha), maximum: Math.max(...alpha),
        mean: alpha.reduce((sum, value) => sum + value, 0) / alpha.length };
    };
    return { entryWitnesses: [.2, .5, .85].map(entry => draw(entry, 1)),
      nearby: draw(.35, 1), beyondArrival: draw(.35, 60),
      arrivedNear: draw(1, 1), arrivedFar: draw(1, 80), glError: gl.getError() };
  }, fragment);
  if (process.env.HORIZON_CLOUD_GPU_REPORT) writeFileSync(process.env.HORIZON_CLOUD_GPU_REPORT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ kind: 'horizon-cloud-presentation', ...result }));
  assert.equal(result.glError, 0, 'the exact fragment compiles, links and draws into both scene attachments');
  for (const witness of result.entryWitnesses) {
    assert.ok(witness.maximum - witness.minimum <= 1,
      `entry ${witness.entry}: moving one physical fragment across the screen must not mask it (${witness.minimum}..${witness.maximum})`);
    assert.ok(witness.minimum > 250, 'near fragments remain available to the world-anchored vertex reveal');
  }
  assert.ok(result.nearby.mean > 250 && result.beyondArrival.maximum === 0,
    'entry still limits the visible arrival to nearby physical fragments');
  assert.equal(result.arrivedNear.mean, result.arrivedFar.mean, 'the finished recording has no entry depth veil');
} finally { await browser.close(); }
