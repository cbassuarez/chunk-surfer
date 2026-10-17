import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Triangle, Vector3 } from 'three';
import { createBattleHandRig, parseBattleHandTemplate } from '../src/render/battle-hand-rig.js';
import { buildBattleHandTool } from '../src/render/battle-hand-tools.js';

const bytes = await readFile(new URL('../public/assets/battle-hands/right.glb', import.meta.url));
const template = await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const handles = ['torch', 'fork', 'spanner', 'coffee'];
const digits = ['index', 'middle', 'ring', 'pinky'];
const directions = [[1, .372, .217], [.237, 1, .417], [.417, .213, 1]].map(value => new Vector3(...value).normalize());

function handPoints(hand) {
  hand.root.updateMatrixWorld(true); hand.skin.skeleton.update();
  const points = [];
  for (let i = 0; i < hand.skin.geometry.attributes.position.count; i++) points.push(hand.skin.localToWorld(hand.skin.getVertexPosition(i, new Vector3())));
  for (const nail of hand.nails) for (let i = 0; i < nail.geometry.attributes.position.count; i++) points.push(nail.localToWorld(new Vector3().fromBufferAttribute(nail.geometry.attributes.position, i)));
  return points;
}

function solidPenetration(points, body) {
  const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(body.geometry, material);
  mesh.applyMatrix4(body.matrixWorld); mesh.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(mesh), ray = new Raycaster();
  const index = body.geometry.index, position = body.geometry.attributes.position, triangles = [];
  for (let i = 0; i < (index?.count || position.count); i += 3) triangles.push(new Triangle(...[0, 1, 2].map(offset => new Vector3().fromBufferAttribute(position, index ? index.getX(i + offset) : i + offset).applyMatrix4(body.matrixWorld))));
  const nearest = new Vector3(); let maximum = 0;
  for (const point of points) {
    if (!bounds.containsPoint(point)) continue;
    let votes = 0;
    for (const direction of directions) {
      ray.set(point, direction); let previous = -1, crossings = 0;
      for (const hit of ray.intersectObject(mesh, false)) if (hit.distance > 1e-7 && hit.distance - previous > 1e-6) { previous = hit.distance; crossings++; }
      if (crossings % 2) votes++;
    }
    if (votes < 2) continue;
    let depth = Infinity;
    for (const triangle of triangles) depth = Math.min(depth, triangle.closestPointToPoint(point, nearest).distanceTo(point));
    maximum = Math.max(maximum, depth);
  }
  material.dispose(); return maximum;
}

test('power grips use opposed palmar pads with a neutral forearm entering from the lower right', () => {
  for (const id of handles) {
    const tool = buildBattleHandTool(id), grip = tool.contacts.right, hand = createBattleHandRig(template);
    hand.setRootPose(grip.wrist); hand.setFingerPose(grip.pose);
    const wrist = new Quaternion(...grip.wrist.quaternion);
    const forearm = new Vector3(0, -1, 0).applyQuaternion(wrist), thumbSide = new Vector3(1, 0, 0).applyQuaternion(wrist);
    assert.ok(forearm.x > .8 && forearm.y < -.24, `${id}: forearm extends naturally down and right`);
    assert.ok(thumbSide.y > .8, `${id}: thumb side is above the little finger side`);
    assert.deepEqual(grip.forearmRotation, [0, 0, 0], `${id}: no compensating wrist bend`);
    const diagnostics = hand.measureGrip(grip);
    for (const digit of Object.keys(diagnostics)) {
      assert.ok(diagnostics[digit].error < .0016, `${id}:${digit} rests on the physical surface`);
      assert.ok(diagnostics[digit].normalDot > .65, `${id}:${digit} uses opposing palmar flesh`);
    }
    if (grip.thumb) {
      const fingerX = digits.map(digit => hand.getPad(digit).position.x);
      assert.ok(hand.getPad('thumb').position.x > Math.max(...fingerX) + .015, `${id}: thumb opposes the fingers across the object`);
    }
    hand.dispose(); tool.dispose();
  }
});

test('gripping skin and nails clear the entire tool including torch bell and fork shoulder', () => {
  for (const id of handles) {
    const tool = buildBattleHandTool(id), hand = createBattleHandRig(template);
    hand.setRootPose(tool.contacts.right.wrist); hand.setFingerPose(tool.contacts.right.pose);
    const points = handPoints(hand); tool.group.updateMatrixWorld(true);
    tool.group.traverse(body => {
      if (!body.isMesh || !['CylinderGeometry', 'ExtrudeGeometry', 'RoundedBoxGeometry'].includes(body.geometry.type)) return;
      const depth = solidPenetration(points, body);
      assert.ok(depth < .001, `${id}:${body.name || body.geometry.type} crosses skin or nail by ${depth * 1000} mm`);
    });
    hand.dispose(); tool.dispose();
  }
});

test('torch thumb actuates the physical switch through its full travel without turning the grip backwards', () => {
  const tool = buildBattleHandTool('torch'), hand = createBattleHandRig(template), grip = tool.contacts.right;
  hand.setRootPose(grip.wrist); hand.setFingerPose(grip.pose);
  const resting = hand.getPose(), control = tool.controls.trigger;
  for (const pressure of [0, .25, .5, .75, 1]) {
    const thumb = Object.fromEntries(Object.entries(resting.thumb).map(([key, value]) => [key, value + (control.pressedPose.thumb[key] - value) * pressure]));
    hand.setFingerPose({ thumb });
    tool.update({ action: 'expose', side: 'player', active: true, progress: .5, impactFired: true, controlPressure: pressure });
    const diagnostic = hand.measureGrip({ thumb: control }).thumb;
    assert.ok(diagnostic.error < .0012, `${pressure}: thumb stays on its moving switch`);
    assert.ok(diagnostic.normalDot > .7, `${pressure}: palmar thumb faces the switch`);
    for (const digit of digits) assert.ok(hand.getPose()[digit].every((angle, i) => angle === resting[digit][i]), `${pressure}: ${digit} stays planted`);
  }
  hand.dispose(); tool.dispose();
});
