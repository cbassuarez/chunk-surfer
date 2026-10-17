import test from 'node:test';
import assert from 'node:assert/strict';
import * as Three from 'three';
import { createTransparentPixelMesh } from '../src/render/pixel-mesh/transparent.js';
import { createSourceDesktopDither } from '../src/render/source-desktop-dither.js';
import { getLookProfile } from '../src/render/look-profiles.js';
import { screenUniforms } from '../src/render/pixel-mesh/screens.js';

function fixture(factory = createTransparentPixelMesh) {
  const textures = [];
  const THREE = { ...Three, TextureLoader: class {
    loadAsync() { const texture = new Three.Texture(); textures.push(texture); return Promise.resolve(texture); }
  } };
  const calls = [];
  let target = null, scissor = true, alpha = .7;
  const viewport = new Three.Vector4(4, 7, 300, 150), color = new Three.Color('#294c12');
  const renderer = {
    toneMappingExposure: 1.05, autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: next => { target = next; },
    getScissorTest: () => scissor, setScissorTest: value => { scissor = value; },
    getClearAlpha: () => alpha,
    getClearColor: out => out.copy(color),
    setClearColor: (value, nextAlpha) => { color.set(value); alpha = nextAlpha; },
    getViewport: out => out.copy(viewport),
    setViewport: (...args) => args[0]?.isVector4 ? viewport.copy(args[0]) : viewport.set(...args),
    clear() {},
    render(scene) { calls.push({ target, material: scene.children[0]?.material,
      targetSize: target ? [target.width, target.height] : null,
      viewport: target ? target.viewport.toArray() : viewport.toArray() }); },
  };
  const original = { color: color.clone(), viewport: viewport.clone(), alpha, scissor, autoClear: renderer.autoClear };
  const pass = factory(THREE, renderer, { assetUrl: value => value });
  const scene = new Three.Scene(); scene.add(new Three.Mesh(new Three.BoxGeometry(), new Three.MeshBasicMaterial()));
  const camera = new Three.OrthographicCamera(-1, 1, .5, -.5, .01, 5);
  camera.position.z = 1.8; camera.updateMatrixWorld();
  return { pass, scene, camera, renderer, calls, original, color, viewport, textures };
}

test('transparent acquisition screens at full output resolution while source geometry is capped', async () => {
  const f = fixture(); await f.pass.ready;
  f.pass.render(f.scene, f.camera, { width: 1200, height: 600, dpr: 2, sceneScale: .5, stageHeight: 400 });
  assert.deepEqual(f.calls.map(c => c.targetSize), [[1200, 600], [2400, 1200], null]);
  assert.deepEqual(f.calls[0].viewport, [0, 200, 1200, 400]);
  const uniforms = f.calls[2].material.uniforms;
  assert.deepEqual(uniforms.uSourceViewport.value.toArray(), [0, 400, 2400, 800]);
  assert.deepEqual(uniforms.uRes.value.toArray(), [2400, 1200]);
  assert.equal(f.calls[2].material.blending, Three.NoBlending);
  assert.equal(f.calls[2].material.defines.SOURCE_DESKTOP_TRANSPARENT, 1);
  assert.equal(f.pass.debug().coveragePreserved, true);
  f.pass.dispose();
});

test('per-frame world look, screen override, logical cells and global plate origin take effect together', async () => {
  const f = fixture(); await f.pass.ready;
  const profile = getLookProfile('battle');
  const snapshot = { clock: 7.5, reducedMotion: true, reduceFlash: true, audio: .3, fear: .4 };
  f.pass.render(f.scene, f.camera, { width: 800, height: 400, dpr: 2,
    profile, screen: 'hatch', cellSize: '4', cellScale: 1.5, screenScale: 1.25, screenOffset: [40, 180], snapshot });
  const u = f.calls[2].material.uniforms;
  assert.equal(u.uBlackPoint.value, profile.vfd.blackPoint);
  assert.equal(u.uRecordingTemporalHz.value, profile.recording.temporalHz);
  assert.equal(u.uCellPx.value, 6);
  assert.equal(u.uScreenPeriodPx.value, screenUniforms('hatch').periodPx * 1.25);
  assert.deepEqual(u.uSourceScreenOffset.value.toArray(), [40, 180]);
  assert.equal(u.uReduceMotion.value, 1); assert.equal(u.uReduceFlash.value, 1);
  assert.equal(u.uTime.value, 7.5); assert.equal(u.uAudio.value, .3); assert.equal(u.uFear.value, .4);
  f.pass.render(f.scene, f.camera, { width: 800, height: 400, profile: 'calm' });
  assert.equal(u.uCellPx.value, getLookProfile('calm').vfd.cellPx);
  assert.deepEqual(u.uSourceScreenOffset.value.toArray(), [0, 0]);
  assert.equal(u.uReduceMotion.value, 0); assert.equal(u.uReduceFlash.value, 0);
  f.pass.dispose();
});

test('perspective cast previews and orthographic performers use their actual projection at both acquisition stages', async () => {
  const f = fixture(); await f.pass.ready;
  for (const camera of [f.camera, new Three.PerspectiveCamera(48, 2, .03, 100)]) {
    camera.position.set(.7, 1.2, -3.6); camera.lookAt(0, .9, 0);
    camera.updateMatrixWorld(true);
    f.pass.render(f.scene, camera, { width: 800, height: 400 });
    const acquisition = f.calls.at(-2).material;
    const display = f.calls.at(-1).material;
    assert.deepEqual(acquisition.uniforms.projectionInverse.value.elements, camera.projectionMatrixInverse.elements,
      'packed character depth must use the active camera projection');
    assert.deepEqual(display.uniforms.uSourceProjectionInverse.value.elements, camera.projectionMatrixInverse.elements,
      'world-pinned dither must use the same camera projection');
    assert.match(acquisition.fragmentShader, /-view\.z\/view\.w/);
    assert.doesNotMatch(acquisition.fragmentShader, /mix\(nearFar/);
    assert.match(display.fragmentShader, /mix\(nearPoint\.xyz,farPoint\.xyz,rayAmount\)/);
    // Camera-space positions survive depth-buffer encoding for both camera
    // types, including off-axis fingertips and a face near the camera.
    for (const point of [new Three.Vector3(.1, -.2, -.15), new Three.Vector3(-.3, .4, -2.7)]) {
      const ndc = point.clone().applyMatrix4(camera.projectionMatrix);
      const restored = ndc.clone().applyMatrix4(acquisition.uniforms.projectionInverse.value);
      assert.ok(restored.distanceTo(point) < 1e-10);
    }
  }
  assert.equal(f.pass.debug().depthReconstruction, 'inverse-projection');
  f.pass.dispose();
});

test('Source desktop wrapper preserves Hush defaults and restores caller renderer state', async () => {
  const f = fixture(createSourceDesktopDither); await f.pass.ready;
  f.pass.render(f.scene, f.camera, { width: 800, height: 400, dpr: 2 });
  const u = f.calls[2].material.uniforms;
  assert.equal(f.pass.debug().profile, 'hush');
  assert.equal(u.uCellPx.value, getLookProfile('hush').vfd.cellPx * 2);
  assert.equal(u.uScreenPeriodPx.value, screenUniforms('crosshatch').periodPx * 2);
  assert.deepEqual(f.viewport.toArray(), f.original.viewport.toArray());
  assert.equal(f.color.getHex(), f.original.color.getHex());
  assert.equal(f.renderer.getClearAlpha(), f.original.alpha);
  assert.equal(f.renderer.getScissorTest(), f.original.scissor);
  assert.equal(f.renderer.autoClear, f.original.autoClear);
  assert.equal(f.renderer.getRenderTarget(), null);
  f.pass.dispose();
});

test('transparent pass disposes owned targets and materials once and stops rendering', async () => {
  const f = fixture(); await f.pass.ready;
  f.pass.render(f.scene, f.camera, { width: 800, height: 400 });
  let disposalCount = 0;
  for (const resource of [f.calls[0].target, f.calls[1].target, f.calls[1].material, f.calls[2].material, f.textures[0]]) {
    resource.addEventListener('dispose', () => disposalCount++);
  }
  f.pass.dispose(); f.pass.dispose();
  assert.equal(disposalCount, 5);
  assert.equal(f.pass.render(f.scene, f.camera, { width: 800, height: 400 }), false);
  assert.equal(f.calls.length, 3);
});
