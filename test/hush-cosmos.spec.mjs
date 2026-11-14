import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBasicMaterial, ShaderLib } from 'three';
import { HUSH_COSMOS, HUSH_COSMOS_NOVAE, HUSH_COSMOS_GLSL, HUSH_COSMOS_INK_GLSL, HUSH_COSMOS_TRANSPORT_GLSL,
  hushCosmosWorldField, hushCosmosSignalMaterial, hushCosmosRecordedInk, installHushCosmosMaterial,
  hushCosmosEncodeTransport, hushCosmosDecodeTransport } from '../src/render/hush-cosmos.js';

const unit = v => { const length = Math.hypot(...v); return v.map(value => value / length); };
const equal = (a, b, tolerance = 1e-10) => {
  assert.equal(a.length, b.length);
  a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) <= tolerance, `${value} ~= ${b[i]}`));
};
const litRay = [0.30165080538658573, -0.86955, -0.3910109833618797];
const neutral = color => { assert.equal(color[0], color[1]); assert.equal(color[1], color[2]); };
const sphere = count => Array.from({length:count},(_,i)=>{
  const y=1-2*(i+.5)/count,phi=i*2.3999632297,radius=Math.sqrt(1-y*y);
  return[Math.cos(phi)*radius,y,Math.sin(phi)*radius];
});

test('HUSH reveals one world-oriented field while its mask moves and the camera pans', () => {
  const ray = unit(litRay), camera = [2, 1.62, 4], reference = hushCosmosWorldField(ray);
  assert.ok(reference.signal > .5, 'the invariant follows an actual visible point, not only uniform darkness');
  for (const distance of [1.2, 2.7, 14]) {
    const surface = ray.map((value, i) => camera[i] + value * distance);
    const direction = surface.map((value, i) => value - camera[i]);
    equal(hushCosmosWorldField(direction), reference);
  }
  // A world point crosses the image as the camera pans; the body only masks it.
  const screen = yaw => Math.atan2(ray[0], -ray[2]) - yaw;
  assert.notEqual(screen(0), screen(.4));
  equal(hushCosmosWorldField(ray), reference);
  assert.notDeepEqual(hushCosmosWorldField([-.7, .2, .5]), reference);
  assert.doesNotMatch(HUSH_COSMOS_GLSL, /\b(?:gl_FragCoord|uRes|uHushViewport|uTime|vUv|uModel|skinMatrix)\b/);
  assert.match(HUSH_COSMOS_GLSL, /hushCosmosWorldField\(vec3 worldDirection\)/);
  assert.match(HUSH_COSMOS_GLSL, /fwidth\(/, 'points are filtered by the real fragment footprint');
  assert.doesNotMatch(HUSH_COSMOS_GLSL, /hushCosmosNoise|hushCosmosNova|nebula|explosion/,
    'the superseded carrier and large stellar landmarks are removed');
});

test('the replacement field is almost entirely neutral black with sparse, dim stationary points', () => {
  let dark = 0, transported = 0, stellar = 0, mean = 0;
  for (const direction of sphere(20000)) {
    const field = hushCosmosWorldField(direction), bits = Math.round(field.signal * 31);
    assert.equal(field.length, 4); assert.ok(field.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    equal(field.color, field.slice(0, 3)); assert.equal(field.signal, field[3]); neutral(field.color);
    if (bits === 0) dark++;
    else transported++;
    if (field.signal > .3) stellar++;
    mean += field.color[0];
    assert.ok(Math.max(...field.color) <= .20, 'the interior has no bright nova or broad carrier');
  }
  assert.ok(dark > 19800, `${dark}/20000 must remain dark after five-bit transport`);
  assert.ok(transported > 10 && transported < 150, `${transported} resolved point samples: sparse but not an empty field`);
  assert.ok(stellar > 0 && stellar < 50, 'there are isolated dim point centres');
  assert.ok(mean / 20000 < .001, 'the black interior cannot acquire an overall luminous wash');
  assert.deepEqual(HUSH_COSMOS_NOVAE, [], 'the legacy export cannot seed any explosion');
  neutral(HUSH_COSMOS.darkInk); neutral(HUSH_COSMOS.stellarInk);
  assert.ok(Math.max(...HUSH_COSMOS.darkInk) < .001);
  assert.ok(Object.isFrozen(HUSH_COSMOS));
});

test('front/profile direction patches retain quiet black and isolated five-bit points without a colored carrier', () => {
  const stats = directions => {
    let dark = 0, points = 0, luminance = 0;
    for (const direction of directions) {
      const bits = Math.round(hushCosmosWorldField(direction).signal * 31), color = hushCosmosSignalMaterial(bits / 31).color;
      neutral(color); if (!bits) dark++; else points++;
      luminance += color[0];
    }
    return { dark: dark / directions.length, points: points / directions.length, luminance: luminance / directions.length };
  };
  const front = [], profile = [];
  for (let y = 0; y < 240; y++) for (let x = 0; x < 60; x++) {
    const a = (x / 59 - .5) * .09, b = -.36 + y / 239 * .61;
    front.push([a, b, 1]); profile.push([-1, b, a]);
  }
  const f = stats(front), p = stats(profile);
  for (const patch of [f, p]) {
    assert.ok(patch.dark > .99 && patch.points > .0001 && patch.points < .01, JSON.stringify(patch));
    assert.ok(patch.luminance > 0 && patch.luminance < .001,
      'actual angular patches retain black without becoming featureless or bright');
  }
});

test('normalization and triplanar boundaries do not create seams or invalid samples', () => {
  equal(hushCosmosWorldField([1, 2, -3]), hushCosmosWorldField([10, 20, -30]));
  for (const direction of [[0, .3, -.95], [.3, 0, -.95], [.3, -.95, 0], [1, 1, .3], [-1, .3, 1]]) {
    const before = direction.map(value => value - 1e-7), after = direction.map(value => value + 1e-7);
    equal(hushCosmosWorldField(before), hushCosmosWorldField(after), .002);
  }
  for (const bad of [[0, 0, 0], [NaN, 0, 1], [1, 2], null]) assert.throws(() => hushCosmosWorldField(bad), /direction/);
});

test('footprint filtering attenuates unresolved points without moving or inflating their peak', () => {
  const peak = footprint => hushCosmosWorldField(litRay, {footprint}).signal;
  assert.ok(peak(0) > peak(1 / 1600));
  assert.ok(peak(1 / 1600) > peak(1 / 400));
  assert.ok(peak(1 / 400) > peak(1 / 100));
  assert.equal(peak(1 / 32), 0, 'unresolved points vanish rather than aliasing across large pixels');
  equal(hushCosmosWorldField(litRay, {footprint:NaN}), hushCosmosWorldField(litRay));
  assert.match(HUSH_COSMOS_GLSL, /filtered=variance\+aa\*aa\/12\.0/);
  assert.match(HUSH_COSMOS_GLSL, /variance\/filtered/,
    'broadening a point must lower its peak instead of generating extra energy');
  assert.match(HUSH_COSMOS_GLSL, /for\(int y=-1;y<=1;y\+\+\)for\(int x=-1;x<=1;x\+\+\)/,
    'the filter includes points in neighboring cells rather than cutting them at an edge');
});

test('the transported five-bit signal reconstructs neutral dim material and preserves only acquired marks', () => {
  for (let bits = 0; bits < 32; bits++) {
    const signal = bits / 31, material = hushCosmosSignalMaterial(signal);
    assert.ok(material.color.every(value => Number.isFinite(value) && value >= 0 && value <= .20)); neutral(material.color);
    for (const mark of [0, 1]) {
      const acquired = mark ? [.9, .92, .85] : [.0015, .005, .0045];
      const ink = hushCosmosRecordedInk(acquired, signal);
      assert.deepEqual(hushCosmosRecordedInk(ink, signal), ink); neutral(ink);
      assert.equal(Math.max(...ink) > .08, !!mark);
      assert.ok(Math.max(...ink) <= .25, 'recorded points cannot become bright white decorations');
      assert.deepEqual(hushCosmosRecordedInk(acquired, signal, [0, 0], [1, 1]),
        hushCosmosRecordedInk(acquired, signal, [1900, 700], [2560, 1440]), 'POST cannot re-sample another sky from viewport pixels');
    }
  }
  for (const direction of [[1, 2, 3], [-1, .2, -.8], litRay]) {
    const field = hushCosmosWorldField(direction);
    assert.deepEqual(field.color, hushCosmosSignalMaterial(field.signal).color);
  }
  const ink = HUSH_COSMOS_INK_GLSL.slice(HUSH_COSMOS_INK_GLSL.lastIndexOf('vec3 hushCosmosRecordedInk'));
  assert.doesNotMatch(ink, /hushCosmosWorldField|gl_FragCoord|uRes|uHushViewport|worldDirection/);
  assert.match(ink, /recorded/); assert.match(ink, /signal/);
});

test('signed secondary transport retains every scalar through covered half-float samples and cannot identify ordinary colors', () => {
  // Native half-float targets preserve the signed sentinel. Simulate MSAA
  // coverage over transparent zero, unpremultiply and then decode, as the host
  // must do before its display/acquisition mapping.
  const half = value => { // Round finite values to the half-float mantissa step.
    if (!value) return value;
    const quantum = 2 ** Math.max(-24, Math.floor(Math.log2(Math.abs(value))) - 10);
    return Math.round(value / quantum) * quantum;
  };
  for (let bits=0;bits<32;bits++) for (const coverage of [1, .75, .5, .25, .03125]) {
    const signal=bits/31, packed=hushCosmosEncodeTransport(signal);
    const raw=packed.map(value=>half(value*coverage)/coverage), decoded=hushCosmosDecodeTransport(raw);
    assert.equal(decoded[0],1);assert.ok(Math.abs(decoded[1]-signal)<.0005);
    assert.equal(Math.round(decoded[1]*31),bits);
    equal(hushCosmosSignalMaterial(decoded[1]).color,hushCosmosSignalMaterial(signal).color,.0001);
  }
  for (const rgb of [[0,0,0],[1,1,1],[.9,.1,1],[0,.5,0],[1,0,0],[0,0,1],[100,100,100],[-1,.5,0],[0,.5,-1]])
    assert.deepEqual(hushCosmosDecodeTransport(rgb),[0,0],JSON.stringify(rgb));
  assert.deepEqual(hushCosmosEncodeTransport(-10),[-1,0,-1]);assert.deepEqual(hushCosmosEncodeTransport(10),[-1,1,-1]);
  assert.match(HUSH_COSMOS_TRANSPORT_GLSL,/vec3\(-1\.0,clamp\(signal,0\.0,1\.0\),-1\.0\)/);
  assert.match(HUSH_COSMOS_TRANSPORT_GLSL,/step\(\.0001,-raw.r\)\*step\(\.0001,-raw.b\)/);
});

test('the secondary material samples post-deformation world position and emits signed transport after lighting', () => {
  const material = new MeshBasicMaterial({ color: 0 }); let previousCalls = 0;
  material.onBeforeCompile = () => { previousCalls++; };
  installHushCosmosMaterial(material); const installed = material.onBeforeCompile;
  installHushCosmosMaterial(material); assert.strictEqual(material.onBeforeCompile, installed);
  const shader = { vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, {}); assert.equal(previousCalls, 1);
  assert.match(shader.vertexShader, /hushWorld=batchingMatrix\*hushWorld/);
  assert.match(shader.vertexShader, /hushWorld=instanceMatrix\*hushWorld/);
  assert.match(shader.vertexShader, /vHushCosmosWorld=\(modelMatrix\*hushWorld\).xyz/);
  assert.ok(shader.vertexShader.indexOf('vHushCosmosWorld=') > shader.vertexShader.indexOf('#include <skinning_vertex>'));
  assert.match(shader.fragmentShader, /hushCosmosWorldField\(normalize\(vHushCosmosWorld-cameraPosition\)\)/);
  assert.match(shader.fragmentShader,/gl_FragColor.rgb=hushCosmosEncodeTransport\(hushField.a\)/);
  assert.doesNotMatch(shader.fragmentShader, /gl_FragCoord|uHushViewport/);
  const output=shader.fragmentShader.indexOf('gl_FragColor.rgb=');
  assert.ok(output>shader.fragmentShader.indexOf('#include <opaque_fragment>'));
  assert.ok(output<shader.fragmentShader.indexOf('#include <premultiplied_alpha_fragment>'));
  assert.doesNotMatch(shader.fragmentShader.slice(output),/gl_FragColor.a\s*=/,'real alpha coverage is unchanged');
  assert.equal(material.userData.hushCosmos.space, 'world-direction');
  assert.equal(material.userData.hushCosmos.transport,'signed-half-float-rgb');
  assert.deepEqual(material.userData.hushCosmos.viewport.value, { x: 1, y: 1 });
  assert.equal(material.toneMapped, false); assert.equal(material.fog, false);
  assert.equal(material.customProgramCacheKey(), HUSH_COSMOS.revision); material.dispose();
  assert.throws(()=>installHushCosmosMaterial({}).onBeforeCompile({vertexShader:'#include <project_vertex>',fragmentShader:'no output hook'}),/output hooks/);
});
