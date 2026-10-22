import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { finishSourceDesktopPressure } from '../src/render/source-desktop-view.js';

function performer() {
  const root = new THREE.Group(), bone = new THREE.Bone();
  const geometry = new THREE.BoxGeometry(.6, 1.8, .3);
  const positions = geometry.getAttribute('position');
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(positions.count * 4), 4));
  const weights = new Float32Array(positions.count * 4);
  for (let n = 0; n < positions.count; n++) weights[n * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.morphAttributes.position = [positions.clone()];
  geometry.morphAttributes.position[0].setX(0, positions.getX(0) + .2);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({
    color: '#687f75', emissive: '#334f7c', transparent: true, opacity: .48,
  }));
  mesh.name = 'pressure_body'; mesh.add(bone); mesh.bind(new THREE.Skeleton([bone])); root.add(mesh);
  return { root, mesh, bone };
}

test('desktop Pressure has a sealed black core independent of coloured lights and intent opacity', () => {
  const { root, mesh } = performer(), owned = [];
  const finish = finishSourceDesktopPressure(THREE, root, { own: value => { owned.push(value); return value; } });
  assert.equal(mesh.material.isMeshBasicMaterial, true);
  assert.deepEqual(mesh.material.color.toArray(), [0, 0, 0]);
  assert.equal(mesh.material.opacity, 1, 'the late surface must overwrite radiance at full coverage');
  assert.equal(mesh.material.transparent, true, 'the alpha-one core belongs after the transparent hull queue');
  assert.equal(mesh.material.side, THREE.DoubleSide);
  assert.equal(mesh.material.depthWrite, true); assert.equal(mesh.material.depthTest, true);
  assert.equal(mesh.material.fog, false); assert.equal(mesh.material.toneMapped, false);
  assert.equal(mesh.material.map, null); assert.equal(finish.cores[0], mesh.material);
  assert.equal(owned.length, 7, 'one core and six finite bands; no extra texture, camera or render target');
  for (const { material, radius, opacity } of finish.glows) {
    assert.deepEqual(material.color.toArray(), [1, 1, 1]);
    assert.equal(material.side, THREE.BackSide); assert.equal(material.transparent, true);
    assert.equal(material.depthWrite, false); assert.equal(material.depthTest, true);
    assert.equal(material.fog, false); assert.equal(material.toneMapped, false);
    assert.ok(radius > 0 && radius <= .17); assert.ok(opacity > 0 && opacity <= .72);
  }
});

test('white radiance shares the actual body skeleton and live morphs, expanding after skin deformation', () => {
  const { root, mesh, bone } = performer();
  const finish = finishSourceDesktopPressure(THREE, root);
  const shells = root.children.filter(node => node.isSkinnedMesh && node !== mesh);
  assert.equal(shells.length, 6);
  bone.position.x = .27; bone.rotation.z = .2; mesh.morphTargetInfluences[0] = .7;
  root.updateMatrixWorld(true); mesh.skeleton.update();
  const actual = mesh.getVertexPosition(0, new THREE.Vector3());
  for (const shell of shells) {
    assert.equal(shell.geometry, mesh.geometry); assert.equal(shell.skeleton, mesh.skeleton);
    assert.equal(shell.morphTargetInfluences, mesh.morphTargetInfluences);
    assert.ok(shell.getVertexPosition(0, new THREE.Vector3()).distanceTo(actual) < 1e-8);
    assert.equal(shell.frustumCulled, false, 'original unexpanded bounds must not cull the radiance');
    assert.ok(shell.renderOrder < mesh.renderOrder, 'concave white hulls must render before the sealed black core');
  }
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader };
  finish.glows[0].material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.sourcePressureRadius.value, finish.glows[0].radius);
  assert.ok(shader.vertexShader.indexOf('transformed += normalize(objectNormal)') > shader.vertexShader.indexOf('#include <skinning_vertex>'));
  assert.ok(shader.vertexShader.indexOf('transformed += normalize(objectNormal)') < shader.vertexShader.indexOf('#include <project_vertex>'));
  assert.match(shader.vertexShader, /#include <morphnormal_vertex>/);
  assert.match(shader.vertexShader, /#include <skinnormal_vertex>/);
});
