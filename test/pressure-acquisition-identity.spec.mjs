import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRESSURE_INK_GLSL} from '../src/render/pressure-composite.js';
import {PIXEL_MESH_FRAG} from '../src/render/pixel-mesh/shader.js';
const renderer=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');

test('the active Pressure finish writes material identity from the same depth-tested pass',()=>{
 assert.match(renderer,/pressureFinishFbo=makeFbo\(pressureFinishTex,\[pressureIdentityTex\]\)/);
 const finish=renderer.slice(renderer.indexOf('function finishPressure('),renderer.indexOf('function presentThroughPost('));
 assert.match(finish,/drawBuffers\(\[gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1\]\)/);
 assert.match(finish,/pressureFinishReady=false/);
 assert.match(finish,/gl.drawArrays\([\s\S]*pressureFinishReady=true/);
 const frame=renderer.slice(renderer.indexOf('export function r3dFrame('),renderer.indexOf('export function r3dCanvas('));
 assert.match(frame,/if \(!gl\) return;\s*pressureFinishReady=false/,'the previous actor cannot reserve black/glow ink after leaving');
});

test('real material identity enters acquisition and final glass without rebuilding smooth geometry',()=>{
 const acquire=renderer.slice(renderer.indexOf('function runPixelMeshPass('),renderer.indexOf('function loadImageTexture('));
 assert.match(acquire,/bindTexture\(gl.TEXTURE_2D,pressureIdentityTex\|\|markTex\)/);
 assert.match(acquire,/pixelMeshU\('uRecordedPressureInkReady'\),pressureFinishReady\?1:0/);
 assert.match(PIXEL_MESH_FRAG,/pressureRecordedInk\(finalColor,texture\(uRecordedPressureInk,fullUv\).rg\)/);
 const post=renderer.slice(renderer.indexOf('const POST_FRAG = '),renderer.indexOf('const TEXT_SPACE_FRAG = '));
 assert.ok(post.indexOf('pressureRecordedInk(c,texture(uPressureInk,uv).rg)')>post.indexOf('uFrontEndToe)*fe'));
 assert.match(post,/if\(uPressureInkReady>\.5\)/);
 assert.match(renderer,/postU\('uPressureInkReady'\),pressureFinishReady\?1:0/);
 assert.doesNotMatch(post,/glowCoverage\(|for\(int i=0;i<8/,'reuse the already occluded finite mask instead of redilating every presentation pixel');
});

test('the shared active ink expression keeps black and white endpoints without erasing acquired dark marks',()=>{
 assert.match(PRESSURE_INK_GLSL,/float white=max\(recorded.r,max\(recorded.g,recorded.b\)\)/);
 const expression=PRESSURE_INK_GLSL.match(/white=([^;]+);/g)[1].slice(6,-1);
 const step=(edge,value)=>value<edge?0:1,mix=(a,b,t)=>a*(1-t)+b*t;
 const white=value=>Function('white','mix','step',`return ${expression}`)(value,mix,step);
 assert.equal(white(0),0);assert.equal(white(.005),.005);assert.equal(white(.945),1);
 assert.match(PRESSURE_INK_GLSL,/mix\(recorded,vec3\(white\),step\(\.5,identity.g\)\)\*\(1.0-step\(\.5,identity.r\)\)/);
});
