import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import * as THREE from 'three';
import { Box3, Euler, Matrix4, Triangle, Vector3, Scene, HemisphereLight, DirectionalLight } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BATTLE_GEAR } from '../src/game/combat-loadout.js';
import { battleHandPerformance } from '../src/render/battle-hand-performance.js';
import { buildBattleHandTool, warmBadgeHandTool, badgeHandToolReady } from '../src/render/battle-hand-tools.js';
import { createBattleHandRig, parseBattleHandTemplate } from '../src/render/battle-hand-rig.js';
import { applyRecordistHandLighting, recordistHandLighting,
  addRecordistForearm, shapeRecordistForearm } from '../src/render/battle-hands.js';
import {
  fieldHeldItemFrame, fieldHeldItemLayout, createFieldHeldItemPresenter,
  warmFieldHeldItem,
} from '../src/render/field-held-item.js';
const read = promisify(readFile);
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) <= epsilon, `${a} versus ${b}`);
const held = (id = 'light', extra = {}) => ({ id, active: true, present: true, ...extra });
let badgeSource;
async function loadBadge() {
  if (badgeSource) return badgeSource;
  const bytes = await read(new URL('../public/assets/items/badge.glb', import.meta.url));
  badgeSource = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  await warmBadgeHandTool({ template: badgeSource });
  return badgeSource;
}

test('a saved ID alone never draws a missing, deployed, unowned or inactive item', () => {
  let calls = 0;
  const presenter = createFieldHeldItemPresenter({ draw() { calls++; return true; } });
  const rect = { ctx: {}, width: 320, height: 220 };
  for (const frame of [null, {}, { id: 'light' }, held('light', { active: false }),
    held('light', { present: false }), held('radio', { deployed: true }), held('recorder', { missing: true }),
    held('constructor'), held('__proto__'), held('light', { toolId: 'radio' })]) {
    assert.equal(presenter.draw({ ...rect, frame }), false);
  }
  assert.equal(calls, 0);
  assert.equal(presenter.diagnostics().reason, 'inactive');
});

test('every active inventory identity maps to its exact existing tool without fabricating an operation', () => {
  const fieldKit = { cosmetics: { faceplate: 'olive', flashlightHousing: 'ivory' } };
  for (const [id, gear] of Object.entries(BATTLE_GEAR)) {
    const source = held(id, { now: 3, injuries: 2, fieldKit, lightOn: true });
    const before = structuredClone(source), frame = fieldHeldItemFrame(source, { width: 320, height: 220 });
    assert.equal(frame.tool, gear.toolId);
    assert.equal(frame.fieldCarry, true);
    assert.equal(frame.move, null);
    assert.equal(frame.actionActor, null);
    assert.equal(frame.rawProgress, 0);
    assert.equal(frame.injury, 'wounded');
    assert.equal(frame.lightOn, true);
    assert.deepEqual(source, before);
    assert.equal(battleHandPerformance(frame).handling, 'idle');
  }
});

test('the peripheral target joins the actual screen edges while the complete tool remains below the reticle and navigator', () => {
  for (const [width, height, navigatorBottom] of [[1280, 800, 444], [960, 600, 330], [736, 600, 330], [320, 568, 300]]) {
    const box = fieldHeldItemLayout({ width, height });
    assert.ok(box.x >= 0 && box.y > height / 2, 'the complete view lies below the reticle');
    assert.ok(box.y >= navigatorBottom, 'the complete tool target stays below the measured navigator');
    near(box.x + box.width, width);
    near(box.y + box.height, height);
    assert.ok(box.width > 0 && box.height > 0);
  }
  const explicit = fieldHeldItemLayout({ width: 1280, height: 800, worldWidth: 960, bottomInset: 30 });
  near(explicit.x + explicit.width, 960); near(explicit.y + explicit.height, 770);
  const logical = fieldHeldItemLayout({ width: 1280, height: 800 });
  const retina = fieldHeldItemLayout({ width: 2560, height: 1600, pixelRatio: 2 });
  for (const key of ['x', 'y', 'width', 'height']) near(retina[key], logical[key] * 2);
  assert.equal(fieldHeldItemLayout({ width: 0, height: 0 }), null);
});

test('inventory and field borrow the same presenter while preserving their explicit drawing rectangle', () => {
  const calls = [], presenter = createFieldHeldItemPresenter({
    draw: frame => { calls.push(frame); return true; }, diagnostics: () => ({ ready: true }),
  });
  for (const mode of ['inventory', 'field']) {
    const rect = { ctx: {}, x: 27, y: 60, width: 290, height: 380, pixelRatio: 2 };
    assert.equal(presenter.draw({ ...rect, mode, frame: held('recorder', { now: 2 }) }), true);
    const last = calls.at(-1);
    for (const key of ['ctx', 'x', 'y', 'width', 'height', 'pixelRatio']) assert.equal(last[key], rect[key]);
    assert.equal(last.tool, 'recorder');
    assert.equal(presenter.diagnostics().mode, mode);
  }
  assert.ok(calls[0].fieldFraming.extent > calls[1].fieldFraming.extent, 'the inventory view makes more room for the supported assembly');
});

test('reduced motion keeps a stable ordinary carry pose without a separate clock or looping action', () => {
  const before = fieldHeldItemFrame(held('tuning-fork', { now: 2, injuries: 3, reducedMotion: true }), { width: 300, height: 240 });
  const after = fieldHeldItemFrame(held('tuning-fork', { now: 92, injuries: 3, reducedMotion: true }), { width: 300, height: 240 });
  assert.deepEqual(battleHandPerformance(before).toolOffset, battleHandPerformance(after).toolOffset);
  assert.deepEqual(battleHandPerformance(before).toolRotation, battleHandPerformance(after).toolRotation);
  assert.equal(battleHandPerformance(before).operation, 0);
});

test('badge loading cannot substitute empty hands or another item', async () => {
  let draws = 0, requests = 0, ready = false;
  const presenter = createFieldHeldItemPresenter({ draw() { draws++; return true; },
    prepare: async id => { requests++; assert.equal(id, 'badge'); return true; }, badgeReady: () => ready,
    diagnostics: () => ({ ready: true }),
  });
  const options = { ctx: {}, width: 300, height: 240, frame: held('badge') };
  assert.equal(presenter.draw(options), false);
  assert.equal(draws, 0); assert.equal(requests, 1);
  assert.equal(presenter.diagnostics().reason, 'asset-loading');
  ready = true;
  assert.equal(presenter.draw(options), true); assert.equal(draws, 1);
  assert.equal(presenter.diagnostics().tool, 'badge');
});

test('a failed retained asset is not requested again on every display frame', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('controlled missing badge asset'); };
  try {
    assert.equal(await warmFieldHeldItem('badge'), false);
    for (let frame = 0; frame < 20; frame++) assert.equal(await warmFieldHeldItem('badge'), false);
    assert.equal(calls, 1);
    assert.equal(await warmFieldHeldItem('badge', { retry: true }), false);
    assert.equal(calls, 2, 'only an explicit retry makes another request');
  } finally { globalThis.fetch = original; }
});

test('the actual retained film badge rests on two existing anatomical pads without mutating its source', async () => {
  const source = await loadBadge(), initial = new Box3().setFromObject(source.scene);
  assert.equal(badgeHandToolReady(), true);
  const tool = buildBattleHandTool('badge'), holder = tool.group.getObjectByName('retained film badge');
  assert.ok(holder);
  near(holder.scale.x, .075); near(holder.scale.y, .075); near(holder.scale.z, .075);
  assert.equal(tool.group.children.length, 1);
  assert.deepEqual(Object.keys(tool.controls), [], 'an inert badge cannot gain a battle operation');
  const bytes = await read(new URL('../public/assets/battle-hands/right.glb', import.meta.url));
  const hand = createBattleHandRig(await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), { nails: false });
  hand.setRootPose(tool.contacts.right.wrist); hand.setFingerPose(tool.contacts.right.pose);
  const contacts = hand.measureGrip(tool.contacts.right, { space: 'world' });
  for (const finger of ['index', 'middle']) assert.ok(contacts[finger].error < .0016, 'actual skin pad retains the existing open-cradle support');
  tool.group.updateMatrixWorld(true);
  for (const finger of ['index', 'middle']) {
    const point = new Vector3(...tool.contacts.right[finger].position);
    const triangle = new Triangle(), a = new Vector3(), b = new Vector3(), c = new Vector3(), closest = new Vector3();
    let distance = Infinity;
    holder.traverse(mesh => {
      if (!mesh.isMesh) return;
      const positions = mesh.geometry.attributes.position, indices = mesh.geometry.index;
      for (let at = 0; at < (indices?.count || positions.count); at += 3) {
        a.fromBufferAttribute(positions, indices ? indices.getX(at) : at).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(positions, indices ? indices.getX(at + 1) : at + 1).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(positions, indices ? indices.getX(at + 2) : at + 2).applyMatrix4(mesh.matrixWorld);
        triangle.set(a, b, c).closestPointToPoint(point, closest);
        distance = Math.min(distance, point.distanceTo(closest));
      }
    });
    assert.ok(distance < .0002, `${finger} supports the real retained triangles within 0.2 mm`);
  }
  tool.dispose(); hand.dispose();
  const after = new Box3().setFromObject(source.scene);
  assert.deepEqual(after, initial, 'holding or disposing the badge modified the source model');
});

test('the complete physical tool geometry fits each field and inventory acquisition window', async () => {
  await loadBadge();
  for (const mode of ['field', 'inventory']) for (const [width, height] of [[300, 240], [290, 380], [380, 270]]) {
    for (const [id, gear] of Object.entries(BATTLE_GEAR)) {
      const frame = fieldHeldItemFrame(held(id), { width, height, mode });
      const tool = buildBattleHandTool(gear.toolId);
      const rotation = new Euler(-.045 + (gear.toolId === 'badge' ? .55 : 0), -.08, -.025);
      const transform = new Matrix4().makeRotationFromEuler(rotation).setPosition(...frame.fieldFraming.tool);
      tool.group.matrix.copy(transform); tool.group.matrixAutoUpdate = false; tool.group.updateMatrixWorld(true);
      const box = new Box3().setFromObject(tool.group), f = frame.fieldFraming;
      assert.ok(box.min.x >= -f.halfWidth && box.max.x <= f.halfWidth, `${mode}/${id} stays inside horizontal frustum`);
      assert.ok(box.min.y >= -f.extent / 2 && box.max.y <= f.extent / 2, `${mode}/${id} stays inside vertical frustum`);
      tool.dispose();
    }
  }
});

test('every actual field sleeve continues beyond a real viewport edge instead of ending inside its transparent target', async () => {
  await loadBadge();
  const bytes = await read(new URL('../public/assets/battle-hands/right.glb', import.meta.url));
  const template = await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  for (const [width, height, pixelRatio] of [[1280, 800, 1], [960, 600, 1], [2560, 1600, 2]]) {
    const rect = fieldHeldItemLayout({ width, height, pixelRatio });
    near(rect.x + rect.width, width); near(rect.y + rect.height, height);
    for (const [id, gear] of Object.entries(BATTLE_GEAR)) {
      const frame = fieldHeldItemFrame(held(id), rect), f = frame.fieldFraming;
      const tool = buildBattleHandTool(gear.toolId), hand = createBattleHandRig(template, { nails: false });
      const material = new THREE.MeshPhysicalMaterial(), arm = addRecordistForearm(THREE, hand, material);
      const grip = tool.contacts.right;
      tool.group.add(hand.root); hand.setRootPose(grip.wrist); hand.setFingerPose(grip.pose);
      tool.group.position.set(...f.tool);
      tool.group.rotation.set(-.045 + (gear.toolId === 'badge' ? .55 : 0), -.08, -.025);
      const wrist = hand.root.quaternion;
      const resting = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.045, -.08, -.025));
      const wanted = wrist.clone().invert().multiply(tool.group.quaternion.clone().invert()).multiply(resting).multiply(wrist);
      const angle = wanted.angleTo(new THREE.Quaternion());
      const compensation = angle > .45 ? new THREE.Quaternion().slerp(wanted, .45 / angle) : wanted;
      const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(grip.forearmRotation || [0, 0, 0])));
      arm.root.quaternion.copy(compensation).multiply(base);
      shapeRecordistForearm(THREE, arm); tool.group.updateMatrixWorld(true);
      const box = new Box3().setFromObject(arm.root);
      assert.ok(box.max.x > f.halfWidth || box.min.y < -f.extent / 2,
        `${id} sleeve ends inside a floating target at ${width}x${height}`);
      tool.dispose(); hand.dispose(); material.dispose(); arm.cloth.dispose();
    }
  }
});

test('the shared renderer reconciles field visibility and retains its original battle framing', () => {
  const source = readFileSync(new URL('../src/render/battle-hands.js', import.meta.url), 'utf8');
  assert.match(source, /frame\.fieldCarry && frame\.fieldFraming[\s\S]*?: battleHandFraming\(\{ width, height, left, right \}\)/);
  assert.match(source, /s\.left\.root\.visible = !frame\.fieldCarry/);
  assert.match(source, /s\.right\.root\.visible = true/);
  const wrapper = readFileSync(new URL('../src/render/field-held-item.js', import.meta.url), 'utf8');
  assert.doesNotMatch(wrapper, /new\s+(?:THREE\.)?WebGLRenderer|requestAnimationFrame\s*\(|setInterval\s*\(/);
});

test('the held field torch lens follows the actual switch, without changing battle impact emission', () => {
  const tool = buildBattleHandTool('torch'), lens = tool.group.getObjectByName('torch lens');
  tool.update({ fieldCarry: true, lightOn: true }); assert.equal(lens.material.emissiveIntensity, .08);
  tool.update({ fieldCarry: true, lightOn: false }); assert.equal(lens.material.emissiveIntensity, 0);
  tool.update({ action: 'whiteout', progress: .5, active: true, impactFired: true });
  assert.ok(lens.material.emissiveIntensity > 1);
  tool.dispose();
});

test('actual zero field light leaves no studio illumination and the same cache restores instrument lighting exactly', () => {
  const scene = new Scene(), lights = { hemisphere: new HemisphereLight(),
    key: new DirectionalLight(), rim: new DirectionalLight(), fill: new DirectionalLight() };
  const snapshot = () => ({ environment: scene.environmentIntensity,
    ...Object.fromEntries(Object.entries(lights).map(([name, light]) => [name, {
      intensity: light.intensity, color: light.color.toArray(), ...(light.groundColor ? { ground: light.groundColor.toArray() } : {}),
    }])) });
  applyRecordistHandLighting(scene, lights);
  const original = snapshot();
  const field = { fieldCarry: true, fieldLight: { torchPower: 0, ambientIntensity: 0,
    torchColor: [1, .9, .8], ambientColor: [.2, .4, .6] } };
  const before = structuredClone(field);
  applyRecordistHandLighting(scene, lights, field);
  assert.equal(scene.environmentIntensity, 0);
  for (const light of Object.values(lights)) assert.equal(light.intensity, 0, 'a studio light survived a completely unlit field');
  applyRecordistHandLighting(scene, lights, { fieldCarry: true });
  assert.deepEqual(snapshot(), original, 'inventory retained a prior field lighting value');
  applyRecordistHandLighting(scene, lights, field);
  applyRecordistHandLighting(scene, lights, {});
  assert.deepEqual(snapshot(), original, 'battle retained a prior field lighting value');
  assert.deepEqual(field, before, 'lighting mutated the authoritative room snapshot');
});

test('field light uses measured ambient and torch power while inventory retains its deliberate inspection light', () => {
  const fieldLight = { torchPower: 0, ambientIntensity: .027, ambientColor: [.66, .51, .35], torchColor: [1, .94, .82] };
  const off = recordistHandLighting({ fieldCarry: true, fieldLight });
  assert.equal(off.key, 0);
  assert.equal(off.hemisphere, .027);
  assert.equal(off.environment, .027 * .25);
  const on = recordistHandLighting({ fieldCarry: true, fieldLight: { ...fieldLight, torchPower: .5 } });
  assert.equal(on.key, .675);
  assert.deepEqual(on.keyColor, fieldLight.torchColor);
  const actual = fieldHeldItemFrame(held('light', { lightOn: true, fieldLight }), { width: 300, height: 240 });
  assert.equal(actual.lightOn, false, 'a depleted/interfered actual torch cannot glow from its saved switch alone');
  assert.equal(actual.fieldLight, fieldLight);
  const inventory = fieldHeldItemFrame(held('light', { lightOn: true, fieldLight }), { width: 300, height: 240, mode: 'inventory' });
  assert.equal(inventory.fieldLight, null);
  assert.equal(recordistHandLighting(inventory).owner, 'instrument');
  assert.equal(recordistHandLighting({ fieldCarry: false, fieldLight }).key, 2.7, 'ordinary world inputs changed the original battle light');
});
