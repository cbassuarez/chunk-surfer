import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { vanWorkbenchVisibleBounds, vanWorkbenchClosedCaseBounds } from '../src/render/van-workbench-stage.js';
import { VAN_REAR_CASE, VAN_REAR_STAGE, VAN_REAR_CARGO_LIGHT, vanRearCaseStops, vanRearWorldToStage,
  vanRearStageToWorld } from '../src/data/van-rear-design.js';
import { vanRearCargoLight } from '../src/render/van-rear-light.js';
import { ZONE } from '../src/data/floorplan/legend.js';

async function caseModel() {
  const bytes = readFileSync(new URL('../public/assets/items/field-case.glb', import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
function setOpen(model, open) {
  model.traverse(node => {
    if (node.name === 'open-lid-hinge') node.rotation.x = open ? -.31 : Math.PI / 2;
    if (node.name.includes('lid-retaining-strap')) node.visible = open;
  });
}

test('projectable workbench bounds exclude hidden meshes and entire hidden subtrees', () => {
  const root = new THREE.Group(), reference = new THREE.Group(); reference.position.set(2, 3, 4); reference.add(root);
  const material = new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), material));
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(900, 900, 900), material); hidden.visible = false; root.add(hidden);
  const hiddenParent = new THREE.Group(); hiddenParent.visible = false;
  hiddenParent.add(new THREE.Mesh(new THREE.BoxGeometry(1800, 1800, 1800), material)); root.add(hiddenParent);
  const local = vanWorkbenchVisibleBounds(THREE, root, reference), world = vanWorkbenchVisibleBounds(THREE, root);
  assert.deepEqual(local.min.toArray(), [-1, -2, -3]); assert.deepEqual(local.max.toArray(), [1, 2, 3]);
  assert.deepEqual(world.min.toArray(), [1, 1, 1]); assert.deepEqual(world.max.toArray(), [3, 5, 7]);
});

test('canonical closed-case measurement preserves live lid/strap state and excludes former phantom pick space', async () => {
  const model = await caseModel(), reference = new THREE.Group(); reference.add(model);
  const hinge = model.getObjectByName('open-lid-hinge'), openRotation = hinge.rotation.clone();
  const straps = []; model.traverse(node => { if (node.name.includes('lid-retaining-strap')) straps.push(node); });
  const canonical = vanWorkbenchClosedCaseBounds(THREE, model, reference);
  assert.deepEqual(hinge.rotation.toArray(), openRotation.toArray());
  assert.ok(straps.every(node => node.visible), 'measurement cannot leave live open-case straps hidden');
  setOpen(model, false);
  const visible = vanWorkbenchVisibleBounds(THREE, model, reference), broad = new THREE.Box3().setFromObject(model);
  assert.deepEqual(canonical.min.toArray(), visible.min.toArray());
  assert.deepEqual(canonical.max.toArray(), visible.max.toArray());
  assert.ok(broad.max.y - visible.max.y > .1, 'the real source contains formerly included hidden strap geometry');
});

test('one closed-housing scale keeps the real case feet seated and the rigid base unchanged when its lid opens', async () => {
  const model = await caseModel(), reference = new THREE.Group(); reference.add(model);
  const closed = vanWorkbenchClosedCaseBounds(THREE, model, reference), size = closed.getSize(new THREE.Vector3());
  const center = closed.getCenter(new THREE.Vector3()), scale = 6.45 / size.x, supportTop = -.0425;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -closed.min.y * scale + supportTop, -center.z * scale);
  setOpen(model, false);
  const closedResting = vanWorkbenchVisibleBounds(THREE, model, reference);
  assert.ok(Math.abs(closedResting.getSize(new THREE.Vector3()).x - 6.45) < 1e-8);
  assert.ok(Math.abs(closedResting.min.y - supportTop) < 1e-8, 'feet contact the seat rather than floating above it');
  const base = model.getObjectByName('base-pan-floor');
  assert.ok(base, 'the original case body is measured rather than a proxy box');
  const closedBase = vanWorkbenchVisibleBounds(THREE, base, reference);
  setOpen(model, true);
  const openBase = vanWorkbenchVisibleBounds(THREE, base, reference);
  assert.deepEqual(openBase.min.toArray(), closedBase.min.toArray());
  assert.deepEqual(openBase.max.toArray(), closedBase.max.toArray());
  assert.equal(model.scale.x, scale, 'opening the lid never rescales the complete case');
});

test('passive case stops clear the actual source housing and entire lid sweep without a new release action', async () => {
  const model = await caseModel(), reference = new THREE.Group(); reference.add(model);
  const closed = vanWorkbenchClosedCaseBounds(THREE, model, reference), center = closed.getCenter(new THREE.Vector3());
  const scale = (VAN_REAR_CASE.width / VAN_REAR_STAGE.metresPerUnit) / closed.getSize(new THREE.Vector3()).x;
  const seat = vanRearWorldToStage([0, VAN_REAR_CASE.seatTopY, VAN_REAR_CASE.centerZ]);
  model.scale.setScalar(scale); model.position.set(-center.x * scale, -closed.min.y * scale + seat[1], -center.z * scale + seat[2]);
  const stops = vanRearCaseStops().map(stop => {
    const center = new THREE.Vector3(...vanRearWorldToStage(stop.center)), half = new THREE.Vector3(...stop.size).multiplyScalar(.5 / VAN_REAR_STAGE.metresPerUnit);
    return { id: stop.id, box: new THREE.Box3(center.clone().sub(half), center.clone().add(half)) };
  });
  const hinge = model.getObjectByName('open-lid-hinge');
  for (let sample = 0; sample <= 6; sample++) {
    setOpen(model, sample !== 0); hinge.rotation.x = Math.PI / 2 + (-.31 - Math.PI / 2) * sample / 6;
    model.updateWorldMatrix(true, true);
    model.traverseVisible(node => {
      if (!node.isMesh) return;
      const position = node.geometry.getAttribute('position'), index = node.geometry.getIndex();
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      const broad = node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
      const relevant = stops.filter(stop => stop.box.intersectsBox(broad));
      if (!relevant.length) return;
      const triangle = new THREE.Triangle();
      for (let i = 0; i < (index?.count || position.count); i += 3) {
        for (const [key, offset] of [['a', 0], ['b', 1], ['c', 2]]) triangle[key].fromBufferAttribute(position, index ? index.getX(i + offset) : i + offset).applyMatrix4(node.matrixWorld);
        for (const stop of relevant) assert.equal(stop.box.intersectsTriangle(triangle), false,
          `${stop.id} intersects ${node.name} at lid sample ${sample}`);
      }
    });
  }
});

test('preparation cutaway retains the actual world roof-light source and inward cone', () => {
  const light = vanRearCargoLight({ group: 'ground', zone: ZONE.street,
    anchor: { x: 0, y: 2.30, z: 2.0, yaw: 0, floorY: 0 }, listener: { x: 0, z: 3 }, open: 1 });
  assert.ok(light);
  const mapped = vanRearStageToWorld(vanRearWorldToStage(VAN_REAR_CARGO_LIGHT.position));
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(mapped[i] - [light.x, light.y, light.z][i]) < 1e-8);
  assert.deepEqual(VAN_REAR_CARGO_LIGHT.direction, light.direction);
  assert.deepEqual(VAN_REAR_CARGO_LIGHT.color, light.color);
  assert.equal(VAN_REAR_CARGO_LIGHT.coneOuterCos, light.coneOuterCos);
  assert.equal(VAN_REAR_CARGO_LIGHT.coneInnerCos, light.coneInnerCos);
  assert.equal(VAN_REAR_CARGO_LIGHT.radius, light.radius);
});
