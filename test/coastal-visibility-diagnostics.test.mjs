import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCoastalVisibility } from '../tools/chunk_surfer/source-drive-study/coastal-visibility.mjs';
const mesh = { primitives: [{ positions: [-2, -2, -10, 2, -2, -10, 2, 2, -10, -2, 2, -10], indices: [0, 1, 2, 0, 2, 3] }] };
function frame(actualDepth) {
  return { model: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], camera: { eye: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 },
    width: 100, height: 100, region: { x: 45, y: 45, right: 55, bottom: 55, width: 10, height: 10 },
    values: Array.from({ length: 100 }, () => [.02, .02, .02, .01, .01, .01, 1 / (1 + actualDepth * .14), .9, .9, .9]).flat() };
}
test('triangle/depth diagnostic uses view metres rather than longer corner-ray distance', () => {
  const value = classifyCoastalVisibility(frame(10), mesh);
  assert.equal(value.counts.targetPixels, 100); assert.equal(value.counts.depthConsistent, 100);
  assert.ok(Math.abs(value.depthConsistentTarget.p3Luma.mean - .02) < 1e-10);
  assert.ok(Math.abs(value.depthConsistentTarget.postWaterLuma.mean - .01) < 1e-10);
  assert.equal(value.depthConsistentTarget.finalLitFraction, 1);
});
test('actual nearer depth and missing farther surface remain distinct failure causes', () => {
  assert.equal(classifyCoastalVisibility(frame(5), mesh).counts.foregroundOccluded, 100);
  assert.equal(classifyCoastalVisibility(frame(15), mesh).counts.missingOrBehind, 100);
});
