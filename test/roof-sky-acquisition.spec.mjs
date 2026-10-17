import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ZONE } from '../src/data/floorplan/legend.js';
import { resolveLightingContext } from '../src/data/conservatory-lights.js';
import { r3dLightingDebug, r3dSetLightingContext } from '../src/render/r3d.js';
import { PIXEL_MESH_FRAG } from '../src/render/pixel-mesh/shader.js';

test('far-sky recovery belongs only to the occupied academic roof and resets at its exit', () => {
  const roof = resolveLightingContext({ group: 'academicRoof', zone: ZONE.academicRoof });
  assert.equal(roof.roofSkyRecovery, .95);
  for (const zone of [ZONE.academic, ZONE.dock, ZONE.street, ZONE.civicCourt]) {
    assert.equal(resolveLightingContext({ zone }).roofSkyRecovery, 0);
  }
  try {
    assert.equal(r3dSetLightingContext(roof).roofSkyRecovery, .95);
    assert.equal(r3dLightingDebug().roofSkyRecovery, .95);
    assert.equal(r3dSetLightingContext(resolveLightingContext({ zone: ZONE.academic })).roofSkyRecovery, 0);
    assert.equal(r3dLightingDebug().roofSkyRecovery, 0);
  } finally {
    r3dSetLightingContext({});
  }
});

test('far-plane sentinel restores city colour while nearer Ren and roof retain one-bit ink', () => {
  const r3d = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  assert.match(r3d, /const roofPropFar=P3\.propTargets\(\)\.far/);
  assert.match(r3d, /uRoofSkyPackedFar'\), 1 \/ \(1 \+ roofPropFar \* \.14\)/);
  assert.match(r3d, /gl\.uniform1f\(U\('uRoofView'\),lightingRoofSkyRecovery>0\?1:0\)/,
    'the extended city must share the roof-only lighting gate');
  assert.match(r3d, /if\(uRoofView > 0\.5\)\{/);
  const start = PIXEL_MESH_FRAG.indexOf('  float farSky =');
  const recoveryMix = PIXEL_MESH_FRAG.indexOf('  finalColor = mix(finalColor, c, farSky', start);
  const end = PIXEL_MESH_FRAG.indexOf(';', recoveryMix) + 1;
  assert.ok(start > PIXEL_MESH_FRAG.indexOf('vec3 oneBitScene ='), 'recovery must follow full acquisition');
  assert.ok(recoveryMix > start && end > recoveryMix, 'the extracted block ends at the sky recovery mix');
  const block = PIXEL_MESH_FRAG.slice(start, end).replace(/\bfloat\b/g, 'let');
  const evaluate = new Function('uRoofSkyPackedFar', 'packedDepth', 'uRoofSkyRecovery',
    'finalColor', 'c', 'smoothstep', 'mix', 'clamp', `${block}\nreturn finalColor;`);
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const smoothstep = (lo, hi, value) => {
    const t = clamp((value - lo) / (hi - lo), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
  const far = 1 / (1 + 1600 * .14);
  const ink = [.9, .9, .9], city = [.2, .3, .4];
  assert.deepEqual(evaluate(far, far, 0, ink, city, smoothstep, mix, clamp), ink,
    'outside the roof, even the far sky keeps the original display look');
  assert.deepEqual(evaluate(far, .3, .68, ink, city, smoothstep, mix, clamp), ink,
    'near-depth geometry must not receive city colour');
  const recovered = evaluate(far, far, .68, ink, city, smoothstep, mix, clamp);
  assert.ok(recovered[0] < ink[0] && recovered[0] > city[0]);
  assert.ok(recovered[1] < ink[1] && recovered[1] > city[1]);
});
