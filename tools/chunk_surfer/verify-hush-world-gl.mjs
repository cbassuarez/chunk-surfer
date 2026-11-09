// Optional isolated WebGL2 compile/readPixels study. It proves world-oriented
// field ownership and transported recording ink, not native game acceptance.
// The browser is headless and muted. HUSH_WORLD_CHROME selects the executable.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { HUSH_COSMOS_INK_GLSL } from '../../src/render/hush-cosmos.js';

const executablePath = process.env.HUSH_WORLD_CHROME || process.env.HUSH_SCREEN_CHROME
  || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const browser = await puppeteer.launch({ executablePath, headless: true, pipe: true,
  args: ['--mute-audio', '--autoplay-policy=user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(field => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 200;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw Error('WebGL2 unavailable');
    const shader = (type, source) => {
      const value = gl.createShader(type); gl.shaderSource(value, source); gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(value)); return value;
    };
    const vertex = shader(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}');
    const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform vec2 uRes;uniform float uShift,uYaw,uPass;
${field}
out vec4 color;
void main(){
 vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y;
 vec3 viewRay=normalize(vec3(p,-1.0));float c=cos(uYaw),s=sin(uYaw);
 vec3 worldDirection=vec3(c*viewRay.x+s*viewRay.z,viewRay.y,-s*viewRay.x+c*viewRay.z);
 vec4 raw=hushCosmosWorldField(worldDirection);
 if(length(vec2((p.x-uShift)*1.3,p.y))>.31){color=vec4(0.0);return;}
 float transportedSignal=floor(raw.a*31.0+.5)/31.0;
 vec3 acquired=vec3(step(.12,max(raw.r,max(raw.g,raw.b))));
 vec3 ink=hushCosmosRecordedInk(acquired,transportedSignal);
 if(uPass>1.5)ink=hushCosmosRecordedInk(ink,transportedSignal);
 // A retained acquisition and scalar payload do not re-sample the sky when
 // POST is presented from another camera. This is a bounded identity fixture.
 if(uPass>2.5)ink=hushCosmosRecordedInk(vec3(1.0),12.0/31.0);
 color=vec4(uPass<.5?raw.rgb:ink,1.0);
}`);
    const program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program); gl.uniform2f(gl.getUniformLocation(program, 'uRes'), canvas.width, canvas.height);
    const draw = (shift, yaw, pass) => {
      gl.uniform1f(gl.getUniformLocation(program, 'uShift'), shift); gl.uniform1f(gl.getUniformLocation(program, 'uYaw'), yaw);
      gl.uniform1f(gl.getUniformLocation(program, 'uPass'), pass); gl.drawArrays(gl.TRIANGLES, 0, 3);
      const pixels = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels;
    };
    const a = draw(-.08, 0, 0), b = draw(.08, 0, 0), turned = draw(-.08, .4, 0);
    const inkA = draw(-.08, 0, 1), inkB = draw(.08, 0, 1), post = draw(-.08, 0, 2);
    const retained = draw(-.08, 0, 3), retainedAfterPan = draw(-.08, .8, 3);
    let common = 0, differentMask = 0, differentCamera = 0, differentInk = 0, differentPost = 0, differentRetained = 0, light = 0, dark = 0;
    const differs = (left, right, i) => left[i] !== right[i] || left[i + 1] !== right[i + 1] || left[i + 2] !== right[i + 2];
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3] || !b[i + 3]) continue;
      common++; if (differs(a, b, i)) differentMask++; if (differs(a, turned, i)) differentCamera++;
      if (differs(inkA, inkB, i)) differentInk++; if (differs(inkA, post, i)) differentPost++;
      if (differs(retained, retainedAfterPan, i)) differentRetained++;
      if (Math.max(a[i], a[i + 1], a[i + 2]) > 80) light++; else dark++;
    }
    const error = gl.getError();
    gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    return { common, differentMask, differentCamera, differentInk, differentPost, differentRetained, light, dark, glError: error };
  }, HUSH_COSMOS_INK_GLSL);
  assert.ok(result.common > 1000);
  assert.ok(result.light > 20 && result.dark > 100, 'the study must exercise stars/explosions and the dark field');
  assert.equal(result.differentMask, 0, 'moving silhouettes reveal the same world rays');
  assert.ok(result.differentCamera > 100, 'camera rotation must change the sky at a fixed viewport pixel');
  assert.equal(result.differentInk, 0); assert.equal(result.differentPost, 0);
  assert.equal(result.differentRetained, 0, 'retained marks and signals do not repaint after camera movement');
  assert.equal(result.glError, 0);
  console.log(JSON.stringify({ passed: true, contract: 'world-direction', scope: 'isolated WebGL2 compile and pixel ownership; native game and human acceptance pending', ...result }));
} finally { await browser.close(); }
