import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import { createBattleHandRig, parseBattleHandTemplate } from '../src/render/battle-hand-rig.js';
import { buildBattleHandTool } from '../src/render/battle-hand-tools.js';

const bytes = readFileSync(new URL('../public/assets/battle-hands/right.glb', import.meta.url));
const template = await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const directions = [[1, .372, .217], [.237, 1, .417], [.417, .213, 1]].map(v => new Vector3(...v).normalize());

function posedSurface(hand) {
  hand.root.updateMatrixWorld(true); hand.skin.skeleton.update();
  const points = [], skinPositions = hand.skin.geometry.attributes.position;
  for (let i = 0; i < skinPositions.count; i++) points.push(hand.skin.localToWorld(hand.skin.getVertexPosition(i, new Vector3())));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap(p => p.toArray()), 3));
  geometry.setIndex(hand.skin.geometry.index.clone()); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const surface = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide })); surface.updateMatrixWorld(true);
  // Nails are separate rigid surfaces; include their vertices in both body and
  // opposite-hand clearance checks without treating them as a closed skin.
  for (const nail of hand.nails) for (let i = 0; i < nail.geometry.attributes.position.count; i++) points.push(nail.localToWorld(new Vector3().fromBufferAttribute(nail.geometry.attributes.position, i)));
  return { surface, points, dispose() { geometry.dispose(); surface.material.dispose(); } };
}

function assertOutsideHand(points, other, label) {
  const ray = new Raycaster(), positions = other.geometry.attributes.position, index = other.geometry.index;
  const triangles = [];
  for (let i = 0; i < index.count; i += 3) triangles.push(new Triangle(...[0, 1, 2].map(offset => new Vector3().fromBufferAttribute(positions, index.getX(i + offset)))));
  for (const point of points) {
    if (!other.geometry.boundingBox.containsPoint(point)) continue;
    let insideVotes = 0;
    for (const direction of directions) {
      ray.set(point, direction);
      let previous = -1, crossings = 0;
      for (const hit of ray.intersectObject(other, false)) if (hit.distance > 1e-7 && hit.distance - previous > 1e-6) { previous = hit.distance; crossings++; }
      if (crossings % 2) insideVotes++;
    }
    if (insideVotes < 2) continue;
    let depth = Infinity;
    for (const triangle of triangles) depth = Math.min(depth, triangle.closestPointToPoint(point, new Vector3()).distanceTo(point));
    assert.ok(depth < .001, `${label} skin/nail crosses the other hand by ${depth * 1000} mm`);
  }
}

for (const [id, body, actions] of [
  ['recorder', 'DA-1000 chassis', { rec: 'monitor', stop: 'stop', takes: 'playback' }],
  ['radio', 'portable short-wave radio', { tune: 'tune', transmit: 'radio-decoy' }],
  ['rig', 'bent interface chassis', { tune: 'runaway-feedback', invert: 'invert' }],
]) test(`${id} operating hand, nails and supporting hand clear each other throughout control travel`, () => {
  const tool = buildBattleHandTool(id), right = createBattleHandRig(template), left = createBattleHandRig(template, { side: 'left' });
  right.setRootPose(tool.contacts.right.wrist); right.setFingerPose(tool.contacts.right.pose);
  const rightSurface = posedSurface(right), chassis = tool.group.getObjectByName(body);
  chassis.geometry.computeBoundingBox(); const bounds = chassis.geometry.boundingBox;
  for (const [key, action] of Object.entries(actions)) for (const controlPressure of [0, .5, 1]) {
    tool.update({ action, side: 'player', active: true, progress: .5, impactFired: true, controlPressure });
    const control = tool.controls[key];
    left.setRootPose(control.wrist); left.setFingerPose(control.pose);
    const diagnostic = left.measureGrip({ index: control }).index;
    assert.ok(diagnostic.error < .0001, `${id}:${key} pad contact`); assert.ok(diagnostic.normalDot > .999, `${id}:${key} pad faces the control`);
    const leftSurface = posedSurface(left);
    for (const point of leftSurface.points) {
      const local = chassis.worldToLocal(point.clone());
      const penetration = Math.min(local.x - bounds.min.x, bounds.max.x - local.x, local.y - bounds.min.y, bounds.max.y - local.y, local.z - bounds.min.z, bounds.max.z - local.z);
      assert.ok(penetration < .001, `${id}:${key} skin/nail penetrates the chassis by ${penetration * 1000} mm`);
    }
    assertOutsideHand(leftSurface.points, rightSurface.surface, `${id}:${key} left`);
    assertOutsideHand(rightSurface.points, leftSurface.surface, `${id}:${key} right`);
    leftSurface.dispose();
  }
  rightSurface.dispose(); right.dispose(); left.dispose(); tool.dispose();
});
