import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOK_PROFILES, LOOK_PROFILE_IDS } from '../src/render/look-profiles.js';
import { PIXEL_MESH_DEBUG_SOURCES } from '../src/render/pixel-mesh/settings.js';

const pixelShader = readFileSync('src/render/pixel-mesh/shader.js', 'utf8');
const renderer = readFileSync('src/render/r3d.js', 'utf8');

test('recording acquisition is authored per profile and remains fine grained', () => {
  for (const id of LOOK_PROFILE_IDS) {
    const profile = LOOK_PROFILES[id];
    assert.ok(profile.recording, `${id} has recording acquisition`);
    assert.ok(profile.vfd.cellPx <= 3, `${id} uses fine acquisition cells`);
    assert.ok(profile.vfd.paletteAmount <= 0.25, `${id} does not restore the dominant block palette`);
  }
});

test('VFD selection is destabilised before phosphor encoding', () => {
  for (const uniform of [
    'uRecordingCaptureMix',
    'uRecordingPatternScale',
    'uRecordingBlackFloor',
    'uRecordingDensityGamma',
    'uRecordingThresholdNoise',
    'uRecordingIrregularity',
    'uRecordingTemporalHz',
    'uRecordingTemporalSmear',
    'uRecordingScenePinning',
    'uRecordingFearGain',
    'uRecordingAudioGain',
  ]) assert.match(pixelShader, new RegExp(`uniform float ${uniform}`), uniform);

  assert.match(pixelShader, /recordingClock/);
  assert.match(pixelShader, /recordingNoise/);
  assert.match(pixelShader, /float ordered\s*=\s*bayer4/);
  assert.match(pixelShader, /float organic\s*=\s*recordingNoise/);
  assert.match(pixelShader, /float recordedSignal\s*=\s*clamp\(signalLevel\s*\+\s*instability/);
  assert.match(pixelShader, /smoothstep\(coverageThreshold[^;]+recordedSignal/s);
  assert.match(pixelShader, /mix\(c,\s*paletted/);
  assert.match(pixelShader, /recordingHash3/);
  assert.match(pixelShader, /formStipple/);
  assert.match(pixelShader, /formStipple\(worldMetres/);
  assert.doesNotMatch(pixelShader, /surfaceScreenCoordinates/);
  assert.match(pixelShader, /broadForm/);
  assert.match(pixelShader, /brightContour/);
  assert.match(pixelShader, /darkCrease/);
  assert.match(pixelShader, /float inkChroma/);
  assert.match(pixelShader, /luma\(neutralLightInk\)\s*\/\s*max\(0\.001,\s*luma\(captureLight\)\)/);
  assert.match(pixelShader, /vec3 oneBitScene/);
  assert.doesNotMatch(pixelShader, /capturedTone|acquiredScene/);
  assert.doesNotMatch(pixelShader, /clusteredDotScreen|diagonalLineScreen|materialScreen/);
  assert.match(pixelShader, /sceneSignal/);
  assert.match(pixelShader, /o\s*=\s*vec4\(finalColor,\s*clamp\(mem/);
});

test('raymarched material sampling remains direction-invariant', () => {
  assert.doesNotMatch(renderer, /sc\.xy\s*\+=\s*viewTs/);
  assert.doesNotMatch(renderer, /float\s+viewTs\s*=/);
  assert.match(renderer, /textureGrad\(uSurfHeight,sc,scDx,scDy\)/);
  assert.match(renderer, /textureGrad\(uSurfNormal,sc,scDx,scDy\)/);
  assert.match(renderer, /textureGrad\(uSurfRough,sc,scDx,scDy\)/);
  assert.match(renderer, /TEXTURE_MAX_ANISOTROPY_EXT,anisoMax/);
  assert.match(renderer, /sceneTex\s*=\s*makeTex\(sw,\s*sh,\s*null,\s*'rgba16f'\)/);
});

test('post grain is correlated, luma-shaped, black-protected, and accessibility-capped', () => {
  for (const uniform of [
    'uRecordingPostGrain',
    'uRecordingLumaGrain',
    'uRecordingTemporalHz',
    'uRecordingTemporalSmear',
  ]) assert.match(renderer, new RegExp(`uniform float ${uniform}`), uniform);

  assert.match(renderer, /correlatedGrain/);
  assert.match(renderer, /float blackProtect\s*=\s*smoothstep\(0\.003,\s*0\.045,\s*lumForGrain\)/);
  assert.match(renderer, /grainMask\s*=\s*blackProtect/);
  assert.match(renderer, /c\s*\+=\s*g\s*\*\s*\(recordingAmp\+eyeAmp\)/);
  assert.match(renderer, /uRecordingPostGrain/);
  assert.match(renderer, /uReduceFlash/);
  assert.match(renderer, /uReduceMotion/);
  assert.doesNotMatch(renderer, /0\.008\s*\*\s*uGlassGrain\s*\+\s*f\s*\*\s*0\.055/);
});

test('preferred tonal acquisition is held rather than flickered', () => {
  assert.match(renderer, /float heldClock\s*=\s*7\.35/);
  assert.match(renderer, /correlatedGrain\(\s*gl_FragCoord\.xy,\s*heldClock/s);
  assert.doesNotMatch(renderer, /hash01\(gl_FragCoord\.x\s*\+\s*fract\(uTime\)/);
  assert.doesNotMatch(pixelShader, /cellId\s*\+\s*floor\(uTime/);
});

test('post glass never replaces the complete frame with a binary wash', () => {
  const start = renderer.indexOf('const POST_FRAG');
  const end = renderer.indexOf('// Source Space', start);
  assert.ok(start >= 0 && end > start);
  const postShader = renderer.slice(start, end);
  assert.doesNotMatch(postShader, /bayer4Post|captureThreshold|vec3 oneBit|uRecordingCaptureMix/);
  assert.match(postShader, /c\s*\+=\s*g\s*\*\s*\(recordingAmp\+eyeAmp\)/);
});

test('renderer wires both acquisition stages and transitions recording profiles', () => {
  for (const name of [
    'uRecordingCaptureMix',
    'uRecordingPatternScale',
    'uRecordingBlackFloor',
    'uRecordingDensityGamma',
    'uRecordingThresholdNoise',
    'uRecordingIrregularity',
    'uRecordingTemporalHz',
    'uRecordingTemporalSmear',
    'uRecordingScenePinning',
    'uRecordingFearGain',
    'uRecordingAudioGain',
  ]) assert.match(renderer, new RegExp(`pixelMeshU\\('${name}'\\)`), name);

  for (const name of [
    'uRecordingPostGrain',
    'uRecordingLumaGrain',
    'uRecordingTemporalHz',
    'uRecordingTemporalSmear',
  ]) assert.match(renderer, new RegExp(`postU\\('${name}'\\)`), name);

  assert.match(renderer, /recording:\s*blendLayer\(lookFrom\.recording,\s*lookTarget\.recording,\s*t\)/);
});

test('Source Space remains outside physical recording acquisition', () => {
  const start = renderer.indexOf('const TEXT_SPACE_FRAG');
  const end = renderer.indexOf('// ── GL plumbing', start);
  assert.ok(start >= 0 && end > start);
  const textSpaceShader = renderer.slice(start, end);
  assert.doesNotMatch(textSpaceShader, /uRecording|correlatedGrain|blackProtect/);
});

test('diagnostics expose acquisition threshold, recorded signal, and instability', () => {
  for (const id of ['threshold', 'recorded', 'instability']) {
    assert.ok(PIXEL_MESH_DEBUG_SOURCES.includes(id), id);
  }
  assert.match(pixelShader, /uDebugSource == 6\.0/);
  assert.match(pixelShader, /uDebugSource == 7\.0/);
  assert.match(pixelShader, /uDebugSource == 8\.0/);
});
