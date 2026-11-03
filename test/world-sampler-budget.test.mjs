import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {MARCH_FRAG} from '../src/render/r3d.js';
import {PRESSURE_SCENE_GLSL} from '../src/render/pressure-composite.js';

test('the assembled world shader fits WebGL2 and D3D11 sixteen-sampler limits',()=>{
  const source=MARCH_FRAG.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'');
  const samplers=[...source.matchAll(/\buniform\s+sampler\w+\s+([^;]+);/g)]
    .flatMap(match=>match[1].split(',').map(name=>name.trim()));
  assert.equal(new Set(samplers).size,samplers.length);
  assert.ok(samplers.length<=16,`${samplers.length} fragment samplers exceed WebGL2's guaranteed sixteen: ${samplers.join(', ')}`);
  assert.ok(samplers.includes('uSourceSurface'));
  assert.ok(!samplers.includes('uHushBodyTex'),'sharing a texture unit does not merge two sampler uniforms at link time');
  assert.ok(MARCH_FRAG.includes(PRESSURE_SCENE_GLSL));
  assert.match(PRESSURE_SCENE_GLSL,/texture\(uSourceSurface,/);
});

test('shared sampler selects real HUSH geometry and prevents corpus reads only while that geometry is active',()=>{
  const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const start=source.indexOf('  const hushBodyTextureActive='),end=source.indexOf('  gl.activeTexture(gl.TEXTURE14)',start);
  assert.ok(start>=0&&end>start);
  const code=source.slice(start,end);
  for(const allowed of [false,true])for(const ready of [false,true])for(const draws of [0,1])for(const corpus of [null,'corpus']){
    const calls=[],active=allowed&&ready&&draws>0;
    const context={hushBodyRenderAllowed:allowed,hushBodyReady:ready,sourceSurfaceTexture:corpus,
      P3:{pressureTargets:()=>({draws,color:'geometry'})},U:name=>name,
      gl:{TEXTURE13:13,TEXTURE_2D:'2d',activeTexture:unit=>calls.push(['unit',unit]),
        bindTexture:(target,texture)=>calls.push(['texture',target,texture]),
        uniform1i:(name,value)=>calls.push(['sampler',name,value]),
        uniform1f:(name,value)=>calls.push(['ready',name,value])}};
    vm.runInNewContext(code,context);
    assert.deepEqual(calls,[['ready','uSourceReady',corpus&&!active?1:0],['unit',13],
      ['texture','2d',active?'geometry':corpus],['sampler','uSourceSurface',13]]);
  }
});
