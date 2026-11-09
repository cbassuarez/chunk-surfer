import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBasicMaterial, ShaderLib } from 'three';
import { HUSH_COSMOS, HUSH_COSMOS_NOVAE, HUSH_COSMOS_GLSL, HUSH_COSMOS_INK_GLSL,
  hushCosmosWorldField, hushCosmosSignalMaterial, hushCosmosRecordedInk, installHushCosmosMaterial } from '../src/render/hush-cosmos.js';

const unit = v => { const length = Math.hypot(...v); return v.map(value => value / length); };
const equal = (a, b, tolerance = 1e-10) => {
  assert.equal(a.length, b.length);
  a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) <= tolerance, `${value} ~= ${b[i]}`));
};

test('HUSH reveals one world-oriented field while its mask moves and the camera pans', () => {
  const ray = HUSH_COSMOS_NOVAE[0], camera = [2, 1.62, 4], reference = hushCosmosWorldField(ray);
  for (const distance of [1.2, 2.7, 14]) {
    const surface = ray.map((value, i) => camera[i] + value * distance);
    const direction = surface.map((value, i) => value - camera[i]);
    equal(hushCosmosWorldField(direction), reference);
  }
  // The same world direction moves across pixels when the camera turns, but
  // its constellation cannot move with those pixels or the deforming body.
  const screen = yaw => Math.atan2(ray[0], -ray[2]) - yaw;
  assert.notEqual(screen(0), screen(.4));
  equal(hushCosmosWorldField(ray), reference);
  assert.notDeepEqual(hushCosmosWorldField([-.7, .2, .5]), reference);
  assert.doesNotMatch(HUSH_COSMOS_GLSL, /\b(?:gl_FragCoord|uRes|uHushViewport|uTime|vUv|uModel|skinMatrix)\b/);
  assert.match(HUSH_COSMOS_GLSL, /hushCosmosWorldField\(vec3 worldDirection\)/);
  assert.match(HUSH_COSMOS_GLSL, /fwidth\(/, 'small stellar features have fragment-footprint antialiasing');
  assert.doesNotMatch(HUSH_COSMOS_GLSL, /float (?:band|rim|silver|cyan|magenta)=/, 'the former orbital graphic is removed');
});

test('the field has deep purple darkness, isolated stars and stationary exploded supernovae', () => {
  let dark = 0, bright = 0, intermediate = 0;
  for (let i = 0; i < 20000; i++) {
    const y = 1 - 2 * (i + .5) / 20000, phi = i * 2.3999632297, radius = Math.sqrt(1 - y * y);
    const field = hushCosmosWorldField([Math.cos(phi) * radius, y, Math.sin(phi) * radius]);
    assert.equal(field.length, 4); assert.ok(field.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    equal(field.color, field.slice(0, 3)); assert.equal(field.signal, field[3]);
    if (Math.max(...field.color) < .12) dark++;
    if (field.signal > .75) bright++;
    if (field.signal > .3) intermediate++;
  }
  assert.ok(dark > 6000 && dark < 16000, `${dark} dark samples: preserve black space without returning to the observed nearly empty mask`);
  assert.ok(bright > 100 && bright < 2000 && intermediate > bright, 'point stars remain distinct from the readable purple carrier');
  for (const [index, centre] of HUSH_COSMOS_NOVAE.entries()) {
    assert.ok(hushCosmosWorldField(centre).signal > .98);
    const right = unit([centre[2], 0, -centre[0]]);
    const shellRadius = [.075, .065, .047][index];
    const shell = hushCosmosWorldField(unit(centre.map((value, i) => value + right[i] * shellRadius)));
    assert.ok(shell.signal > .15, 'the star has an exploded body rather than only an isolated white pixel');
  }
  assert.ok(HUSH_COSMOS.darkInk[2] > HUSH_COSMOS.darkInk[0] && HUSH_COSMOS.darkInk[0] > HUSH_COSMOS.darkInk[1]);
  assert.ok(Object.isFrozen(HUSH_COSMOS));
});

test('the observed 3.2 m front/profile direction patches retain black gaps and readable five-bit purple structure', () => {
  // These angular patches follow the captured +Z front / -X profile bearings.
  // They are a palette/transport check, not a substitute for actual mesh pixels.
  const stats = directions => {
    let dark = 0, carrier = 0, stellar = 0, luminance = 0;
    for (const direction of directions) {
      const bits = Math.round(hushCosmosWorldField(direction).signal * 31), color = hushCosmosSignalMaterial(bits / 31).color;
      if (Math.max(...color) < .12) dark++;
      if (color[2] > .12 && bits < 20) carrier++;
      if (bits >= 24) stellar++;
      luminance += color[0] * .2126 + color[1] * .7152 + color[2] * .0722;
    }
    return { dark: dark / directions.length, carrier: carrier / directions.length, stellar: stellar / directions.length, luminance: luminance / directions.length };
  };
  const front = [], profile = [];
  for (let y = 0; y < 70; y++) for (let x = 0; x < 16; x++) {
    const a = (x / 15 - .5) * .09, b = -.36 + y / 69 * .61;
    front.push([a, b, 1]); profile.push([-1, b, a]);
  }
  const f = stats(front), p = stats(profile);
  assert.ok(f.carrier > .35 && f.dark > .1 && f.stellar > .02);
  assert.ok(p.carrier > .2 && p.dark > .35 && p.stellar > .007);
  assert.ok(f.luminance > .04 && f.luminance < .18 && p.luminance > .02 && p.luminance < .12,
    'the carrier must survive acquisition without becoming an overall bright surface');
});

test('normalization and triplanar boundaries do not create seams or invalid samples', () => {
  equal(hushCosmosWorldField([1, 2, -3]), hushCosmosWorldField([10, 20, -30]));
  for (const direction of [[0, .3, -.95], [.3, 0, -.95], [.3, -.95, 0]]) {
    const before = direction.map(value => value - 1e-7), after = direction.map(value => value + 1e-7);
    equal(hushCosmosWorldField(before), hushCosmosWorldField(after), .002);
  }
  for (const bad of [[0, 0, 0], [NaN, 0, 1], [1, 2], null]) assert.throws(() => hushCosmosWorldField(bad), /direction/);
});

test('the transported five-bit signal reconstructs the same material and acquired marks remain authoritative', () => {
  for (let bits = 0; bits < 32; bits++) {
    const signal = bits / 31, material = hushCosmosSignalMaterial(signal);
    assert.ok(material.color.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    for (const mark of [0, 1]) {
      const acquired = mark ? [.9, .92, .85] : [.0015, .005, .0045];
      const ink = hushCosmosRecordedInk(acquired, signal);
      assert.deepEqual(hushCosmosRecordedInk(ink, signal), ink);
      assert.equal(Math.max(...ink) > .08, !!mark);
      assert.deepEqual(hushCosmosRecordedInk(acquired, signal, [0, 0], [1, 1]),
        hushCosmosRecordedInk(acquired, signal, [1900, 700], [2560, 1440]), 'POST cannot re-sample another sky from viewport pixels');
    }
  }
  for (const direction of [[1, 2, 3], [-1, .2, -.8], ...HUSH_COSMOS_NOVAE]) {
    const field = hushCosmosWorldField(direction);
    assert.deepEqual(field.color, hushCosmosSignalMaterial(field.signal).color);
  }
  const ink = HUSH_COSMOS_INK_GLSL.slice(HUSH_COSMOS_INK_GLSL.lastIndexOf('vec3 hushCosmosRecordedInk'));
  assert.doesNotMatch(ink, /hushCosmosWorldField|gl_FragCoord|uRes|uHushViewport|worldDirection/);
  assert.match(ink, /recorded/); assert.match(ink, /signal/);
});

test('the secondary material samples post-deformation world position with the same camera ray', () => {
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
  assert.doesNotMatch(shader.fragmentShader, /gl_FragCoord|uHushViewport/);
  assert.equal(material.userData.hushCosmos.space, 'world-direction');
  assert.deepEqual(material.userData.hushCosmos.viewport.value, { x: 1, y: 1 });
  assert.equal(material.toneMapped, false); assert.equal(material.fog, false);
  assert.equal(material.customProgramCacheKey(), HUSH_COSMOS.revision); material.dispose();
});
