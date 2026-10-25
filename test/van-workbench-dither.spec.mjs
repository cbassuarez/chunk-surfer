import test from 'node:test';
import assert from 'node:assert/strict';
import * as Three from 'three';
import { vanWorkbenchDitherFrame } from '../src/render/van-workbench-stage.js';
import { getLookProfile } from '../src/render/look-profiles.js';
import { createTransparentPixelMesh } from '../src/render/pixel-mesh/transparent.js';
import { VAN_REAR_STAGE } from '../src/data/van-rear-design.js';

test('workbench acquisition uses output pixels once and retains logical object-picking geometry', () => {
  const rect = Object.freeze({ x: 4, y: 2, w: 90, h: 23 });
  const frame = vanWorkbenchDitherFrame(rect, {
    cellW: 8.45 * 1.5, cellH: 20 * 1.5, dpr: 2, canvasHeight: 1680,
  });
  assert.equal(frame.width, 2282);
  assert.equal(frame.height, 1380);
  assert.equal(frame.dpr, 1, 'physical dimensions cannot be multiplied by display DPR again');
  assert.equal(frame.cellScale, 2);
  assert.equal(frame.worldUnitScale, VAN_REAR_STAGE.metresPerUnit);
  assert.deepEqual(frame.screenOffset, [101, 180], 'the shader plate uses the bottom-left overlay origin');
  assert.deepEqual(rect, { x: 4, y: 2, w: 90, h: 23 }, 'render acquisition cannot rewrite cell-space hit regions');
});

test('source geometry may be bounded while the acquired dither plate remains full-resolution', () => {
  for (const dimensions of [
    { rect: { x: 0, y: 0, w: 100, h: 30 }, dpr: 1 },
    { rect: { x: 0, y: 0, w: 200, h: 60 }, dpr: 3 },
  ]) {
    const frame = vanWorkbenchDitherFrame(dimensions.rect, dimensions);
    assert.equal(frame.width, Math.round(dimensions.rect.w * 8.45 * dimensions.dpr));
    assert.equal(frame.height, dimensions.rect.h * 20 * dimensions.dpr);
    assert.ok(frame.sceneScale > 0 && frame.sceneScale <= 1);
    assert.ok(frame.width * frame.sceneScale <= 1280 + 1e-8);
    assert.ok(frame.height * frame.sceneScale <= 800 + 1e-8);
  }
});

test('world look and accessibility ownership reach both shelf and detail without mutating settings', () => {
  const profile = getLookProfile('calm');
  const settings = Object.freeze({ cellSize: '4', reduceMotion: true, reduceFlash: true });
  const display = Object.freeze({ profile, screen: 'hatch', settings, screenScale: 1.25 });
  for (const detail of [false, true]) {
    const frame = vanWorkbenchDitherFrame({ x: 0, y: 0, w: 70, h: 20 }, { display, detail, now: 7.5 });
    assert.equal(frame.profile, profile, 'use the resolved game profile rather than a local look approximation');
    assert.equal(frame.screen, 'hatch');
    assert.equal(frame.cellSize, '4');
    assert.equal(frame.screenScale, 1.25, 'world render scale and display DPR have separate authorities');
    assert.deepEqual(frame.snapshot, { clock: 7.5, reducedMotion: true, reduceFlash: true });
    assert.ok(frame.exposure > 0 && frame.exposure < 1);
  }
  assert.deepEqual(settings, { cellSize: '4', reduceMotion: true, reduceFlash: true });
});

test('scene accessibility preferences also apply and no-source acquisition has a defined calm fallback', () => {
  const frame = vanWorkbenchDitherFrame({ x: 0, y: 0, w: 1, h: 1 }, {
    state: { reduceMotion: true, reduceFlash: true }, now: -Infinity,
  });
  assert.equal(frame.profile, 'calm');
  assert.equal(frame.cellSize, 'auto');
  assert.equal(frame.screenScale, 1);
  assert.deepEqual(frame.snapshot, { clock: 0, reducedMotion: true, reduceFlash: true });
  assert.equal(frame.dpr, 1);
  assert.equal(frame.width, 8);
  assert.equal(frame.height, 20);
});

test('enlarged workbench units acquire metric depth and surface grain without moving either source camera', async () => {
  const THREE = { ...Three, TextureLoader: class {
    loadAsync() { return Promise.resolve(new Three.Texture()); }
  } };
  const calls = [], viewport = new Three.Vector4(0, 0, 800, 600), clear = new Three.Color();
  let target = null;
  const renderer = {
    toneMappingExposure: .92, autoClear: true,
    getRenderTarget: () => target, setRenderTarget: value => { target = value; },
    getScissorTest: () => false, setScissorTest() {}, getClearAlpha: () => 1,
    getClearColor: out => out.copy(clear), setClearColor: value => clear.set(value),
    getViewport: out => out.copy(viewport), setViewport() {}, clear() {},
    render: scene => calls.push(scene.children[0]?.material),
  };
  const pass = createTransparentPixelMesh(THREE, renderer, { assetUrl: value => value });
  await pass.ready;
  const scene = new Three.Scene();
  scene.add(new Three.Mesh(new Three.BoxGeometry(), new Three.MeshBasicMaterial()));
  const scale = VAN_REAR_STAGE.metresPerUnit;
  try {
    for (const camera of [new Three.OrthographicCamera(-9.4, 9.4, 6.5, -6.5, .1, 70),
      new Three.PerspectiveCamera(32, 4 / 3, .1, 40)]) {
      camera.position.set(.1, 21, 15.2); camera.lookAt(0, .2, 0); camera.updateMatrixWorld(true);
      const originalWorld = camera.matrixWorld.clone(), originalProjection = camera.projectionMatrix.clone();
      const originalInverse = camera.projectionMatrixInverse.clone();
      pass.render(scene, camera, { width: 800, height: 600, worldUnitScale: scale });
      const acquisition = calls.at(-2).uniforms, dither = calls.at(-1).uniforms;
      for (const point of [new Three.Vector3(.6, -.2, -5), new Three.Vector3(-.3, .3, -27)]) {
        const ndc = point.clone().applyMatrix4(originalProjection);
        const metricView = ndc.clone().applyMatrix4(acquisition.projectionInverse.value);
        assert.ok(metricView.distanceTo(point.clone().multiplyScalar(scale)) < 1e-10,
          'encoded view depth must describe metres, rather than oversized layout units');
        const packedDepth = 1 / (1 + .14 * -metricView.z);
        const acquiredDepth = (1 / packedDepth - 1) / .14;
        const near = new Three.Vector3(ndc.x, ndc.y, -1).applyMatrix4(dither.uSourceProjectionInverse.value);
        const far = new Three.Vector3(ndc.x, ndc.y, 1).applyMatrix4(dither.uSourceProjectionInverse.value);
        const rayAmount = (-acquiredDepth - near.z) / (far.z - near.z);
        const reconstructed = near.lerp(far, rayAmount).applyMatrix4(dither.uSourceCameraWorld.value);
        const expected = point.clone().applyMatrix4(originalWorld).multiplyScalar(scale);
        assert.ok(reconstructed.distanceTo(expected) < 1e-10,
          'same shader depth reconstruction must pin marks to physical object positions');
      }
      assert.deepEqual(camera.matrixWorld.elements, originalWorld.elements);
      assert.deepEqual(camera.projectionMatrix.elements, originalProjection.elements);
      assert.deepEqual(camera.projectionMatrixInverse.elements, originalInverse.elements);
      assert.equal(pass.debug().worldUnitScale, scale);
      pass.render(scene, camera, { width: 800, height: 600 });
      assert.deepEqual(calls.at(-2).uniforms.projectionInverse.value.elements, originalInverse.elements,
        'all existing callers retain unscaled depth by default');
      assert.deepEqual(calls.at(-1).uniforms.uSourceCameraWorld.value.elements, originalWorld.elements);
      assert.equal(pass.debug().worldUnitScale, 1);
    }
  } finally { pass.dispose(); }
});
