import test from 'node:test';
import assert from 'node:assert/strict';
import { applySourceEmergencyTorch, resolveTorchLook } from '../src/render/lighting-model.js';
import { applyFieldKitTorchLook } from '../src/render/field-kit-torch.js';
import { fieldKitEffects } from '../src/game/field-kit.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { CHUNK_SURF_PHASE, freshChunkSurfState } from '../src/game/chunk-surf-state.js';
import { SOURCE_TIER_BY_ID } from '../src/data/source-level.js';
import { CELL, ZONE } from '../src/data/floorplan/legend.js';
import { resolveLightingContext } from '../src/data/conservatory-lights.js';
import { r3dSetLightingContext, r3dLightingDebug } from '../src/render/r3d.js';
import { PIXEL_MESH_FRAG } from '../src/render/pixel-mesh/shader.js';

test('the hall and Source models keep physical light without reviving an off or attenuated torch', () => {
  for (const profile of ['hall', 'proper']) for (const power of [0, .12, .5, 1]) {
    const base = { ...resolveTorchLook({ battery: .3, perception: .4 }), power };
    const hall = applySourceEmergencyTorch(base, { profile });
    assert.equal(hall.sourceTorchMode, 'none', 'physical hall must bypass the image inversion');
    assert.equal(hall.band, base.band);
    assert.equal(hall.health, base.health);
    assert.equal(hall.perception, base.perception);
    assert.equal(hall.reach, base.reach, 'battery and HUSH still limit the useful reach');
    assert.ok(hall.power <= power);
    if (!power) assert.equal(hall.power, 0);
    assert.ok(hall.shoulder > 0, 'received highlights retain headroom');
  }
});

test('the soft hall penumbra retains the fitted throw and flood differences', () => {
  const looks = {};
  for (const flashlight of ['reference', 'throw', 'flood']) {
    const fitted = applyFieldKitTorchLook(resolveTorchLook(), fieldKitEffects({ flashlight }));
    const hall = applySourceEmergencyTorch(fitted, { profile: 'hall' });
    assert.ok(hall.coneInner < fitted.coneInner, 'the outer edge opens gradually');
    assert.ok(hall.coneOuter > fitted.coneOuter, 'the hotspot occupies less of the footprint');
    assert.ok(hall.coneOuter - hall.coneInner > fitted.coneOuter - fitted.coneInner);
    assert.ok(hall.spill >= fitted.spill && hall.spill <= .12);
    looks[flashlight] = hall;
  }
  assert.ok(looks.throw.reach > looks.reference.reach);
  assert.ok(looks.reference.reach > looks.flood.reach);
  assert.ok(looks.throw.coneInner > looks.reference.coneInner);
  assert.ok(looks.reference.coneInner > looks.flood.coneInner);
});

test('later Source modes and ordinary light keep their prior optical response', () => {
  const base = resolveTorchLook();
  for (const state of [{}, { xray: true }, { active: true, cycle: .3 }]) {
    const look = applySourceEmergencyTorch(base, state);
    assert.equal(look.shoulder, undefined, 'the hall shoulder does not leak into other geography');
    assert.equal(look.coneInner, base.coneInner);
    assert.equal(look.coneOuter, base.coneOuter);
    assert.equal(look.spill, base.spill);
  }
  assert.equal(applySourceEmergencyTorch(base, { xray: true }).sourceTorchMode, 'xray');
  assert.equal(applySourceEmergencyTorch(base, { active: true }).sourceTorchMode, 'emergency');
  const ordinary = applySourceEmergencyTorch(base);
  assert.equal(ordinary.color, base.color);
  assert.equal(ordinary.power, base.power);
});

test('hall exposure follows the physical hall and releases at the still-page threshold', () => {
  const base = { ...freshChunkSurfState(), landscapeOrigin: { x: 0, y: 0 } };
  const fork = SOURCE_TIER_BY_ID.fork;
  const properPosition = { x: 30, y: (fork.from + fork.to) / 2, facing: 0 };
  const source = createSourceSpaceRuntime({ initialState: { ...base, phase: CHUNK_SURF_PHASE.LANDSCAPE, firstLiftCompleted: true } });
  source.setPlayerPosition(properPosition);
  assert.equal(source.probe().divide.active, true, 'the exposure fixture must stand on the actual Divide');
  const sourceAmbient = source.sourceAmbient();
  const ordinary = resolveLightingContext({ zone: ZONE.none });
  assert.deepEqual(sourceAmbient.color, ordinary.ambientColor,
    'proper retains the building\'s neutral ambient rather than a second colour treatment');
  assert.equal(sourceAmbient.intensity, Math.max(.05, ordinary.ambientIntensity),
    'the explorable field retains a bounded ambient floor while fixtures and the torch provide local light');
  assert.equal(sourceAmbient.whitePointScale, ordinary.whitePointScale);
  assert.equal(source.sourceLook().roomMemoryActive, true);
  assert.equal(source.sourceFlashlightFrame().mode, 'normal');
  assert.equal(source.sourceFlashlightFrame().profile, 'proper',
    'Source models retain a soft material beam after the hall profile releases');
  for (const phase of [CHUNK_SURF_PHASE.HALL, CHUNK_SURF_PHASE.HAYSTACK]) {
    const runtime = createSourceSpaceRuntime({ initialState: { ...base, phase } });
    const ambient = runtime.sourceAmbient();
    assert.equal(runtime.sourceFlashlightFrame().profile, 'hall');
    assert.equal(runtime.sourceFlashlightFrame().xray, false);
    assert.equal(ambient.intensity, .028, 'physical hall concrete keeps its own authored lighting floor');
    assert.deepEqual(ambient.color, [.60, .64, .61],
      'the hall keeps its authored physical concrete light independently of proper\'s neutral white');
    assert.ok(ambient.whitePointScale > 0 && ambient.whitePointScale < 1,
      'the hall supplies a VFD exposure ceiling for its actual light');
    assert.ok(ambient.captureExposure > 1 && ambient.captureExposure <= 12,
      'full recording capture receives the hall exposure independently of VFD levels');
  }
  for (const phase of [CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL]) {
    const runtime = createSourceSpaceRuntime({ initialState: { ...base, phase, firstLiftCompleted: true } });
    runtime.setPlayerPosition(properPosition);
    assert.deepEqual(runtime.sourceAmbient(), sourceAmbient,
      'physical room exposure must release beyond the dock threshold');
    assert.equal(runtime.sourceAmbient().captureExposure, 8);
    assert.equal(runtime.sourceFlashlightFrame().profile, 'proper');
    assert.equal(runtime.sourceFlashlightFrame().mode, 'normal');
    assert.equal(runtime.sourceLook().roomMemoryActive, true);
  }
  const transforming = createSourceSpaceRuntime({ initialState: { ...base, phase: CHUNK_SURF_PHASE.TRANSFORMING, firstLiftCompleted: true } });
  transforming.setPlayerPosition(properPosition);
  assert.equal(transforming.sourceLook().roomMemoryActive, false,
    'the new proper recording does not rewrite the earlier transformation phase');
  assert.equal(transforming.sourceAmbient().intensity, .012);
  assert.equal(transforming.sourceFlashlightFrame().xray, true);
});

test('recording exposure is bounded and resets with the next lighting context', () => {
  try {
    assert.equal(r3dSetLightingContext({ captureExposure: 6 }).captureExposure, 6);
    assert.equal(r3dLightingDebug().captureExposure, 6);
    for (const value of [-Infinity, NaN, undefined, 0, 99, Infinity]) {
      const exposure = r3dSetLightingContext({ captureExposure: value }).captureExposure;
      assert.ok(exposure >= 1 && exposure <= 12);
    }
    assert.equal(r3dSetLightingContext({}).captureExposure, 1,
      'leaving the hall must not retain its recording gain');
  } finally {
    r3dSetLightingContext({});
  }
});

test('capture exposure reveals dim form while preserving the raw-light black gate', () => {
  // Evaluate the actual scalar acquisition block. This catches applying the
  // gain after the binary decision, or lifting the raw shadow gate with it.
  const block = PIXEL_MESH_FRAG.slice(PIXEL_MESH_FRAG.indexOf('  float sourceLuma ='),
    PIXEL_MESH_FRAG.indexOf('  // Resolve only the middle'));
  const evaluate = new Function('c', 'sx0', 'sx1', 'sy0', 'sy1', 'uRecordingExposure',
    'uRecordingBlackFloor', 'uRecordingDensityGamma', 'uRecordingSensitivity', 'luma', 'mix', 'clamp', 'pow', 'smoothstep', 'step', 'max',
    `${block.replace(/\bfloat\b/g, 'let')}\nreturn { exposed, formTone, hasCapturedLight };`);
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const smoothstep = (lo, hi, value) => { const t = clamp((value - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
  const sample = (luma, gain, sensitivity = 1) => evaluate(luma, ...Array.from({ length: 4 }, () => ({ rgb: luma })),
    gain, .004, .72, sensitivity, value => value, (a, b, t) => a + (b - a) * t,
    clamp, Math.pow, smoothstep, (edge, value) => value < edge ? 0 : 1, Math.max);
  for (const shadow of [0, .001, .004, .008]) {
    assert.equal(sample(shadow, 6).hasCapturedLight, 0, 'gain cannot manufacture light inside deep shadow');
  }
  const original = sample(.04, 1), hall = sample(.04, 6);
  assert.ok(original.formTone < .14, 'the reproduced failure sits below the halftone range');
  assert.ok(hall.formTone > .14 && hall.formTone < .76, 'hall exposure puts dim form into the halftone range');
  assert.equal(hall.hasCapturedLight, original.hasCapturedLight);
  assert.equal(sample(0, 8, 8).hasCapturedLight, 0, 'low-light sensitivity cannot illuminate exact absence');
  assert.equal(sample(.0004, 8, 8).hasCapturedLight, 0, 'sensor noise below the calibrated floor remains absent');
  assert.equal(sample(.002, 8, 8).hasCapturedLight, 1, 'real low-light material survives the calibrated sensor gate');
});
