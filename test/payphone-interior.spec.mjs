import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cameraBasis } from '../src/render/camera-basis.js';
import { payphoneLayout, rotaryRestAngle } from '../src/render/payphone-view.js';
import {
  PAYPHONE_CABINET, PAYPHONE_BOOK, payphoneInteriorPlane, payphoneInteriorPointer, payphoneInteriorWorldPoint,
  payphoneInteriorBookPlane, payphoneInteriorBookPointer,
} from '../src/render/payphone-interior.js';

const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);
const dot = (a, b) => a.reduce((v, n, i) => v + n * b[i], 0);
const pointOn = (plane, L, x, y) => payphoneInteriorWorldPoint(plane, x / plane.canvasWidth, y / plane.canvasHeight);
const project = (point, camera, size, width, height) => {
  const basis = cameraBasis(camera.yaw, camera.pitch);
  const relative = [point.x - camera.eye.x, point.y - camera.eye.y, point.z - camera.eye.z];
  const depth = dot(relative, basis.forward);
  assert.ok(depth > 0, 'fixture point went behind the eye');
  return {
    cellX: (.5 + dot(relative, basis.right) / (depth * .95 * width / height) * .5) * size.cols,
    cellY: (.5 - dot(relative, basis.up) / (depth * .95) * .5) * size.rows,
  };
};

// The existing grey cabinet and the live controls occupy the same physical
// width, height, roof and receiver anchor, regardless of screen dimensions.
for (const [cols, rows, cellW, cellH] of [[128, 36, 8, 16], [96, 54, 10, 20], [60, 60, 8, 16]]) {
  const size = { cols, rows }, L = payphoneLayout(size, { cellW, cellH });
  const pose = { boxWorld: { x: 20, y: 3.5, z: -81, yaw: .72 } };
  L.px.FW = cols * cellW + 7; L.px.FH = rows * cellH + 11;
  const plane = payphoneInteriorPlane(pose, L), body = L.px.housing;
  const tl = pointOn(plane, L, body.x, body.y), br = pointOn(plane, L, body.x + body.w, body.y + body.h);
  near(Math.hypot(br.x - tl.x, br.z - tl.z), .60, 'cabinet width');
  near(tl.y - br.y, .60 / 1.12, 'cabinet height');
  near(tl.y, pose.boxWorld.y + PAYPHONE_CABINET.top, 'cabinet top');
  const r = plane.right, n = plane.normal, at = pose.boxWorld;
  const eye = { x: at.x + n[0] * .08, y: at.y + 1.62, z: at.z + n[2] * .08 };
  for (const yawOffset of [-.35, 0, .4]) for (const pitch of [-.35, -.16, .13]) {
    const camera = { eye, yaw: -at.yaw + yawOffset, pitch };
    for (const digit of ['1', '4', '9', '0']) {
      const angle = rotaryRestAngle(digit), dial = L.dialPx;
      const x = dial.cx + Math.cos(angle) * dial.hole, y = dial.cy + Math.sin(angle) * dial.hole;
      const world = pointOn(plane, L, x, y);
      const width = cols * cellW + 7, height = rows * cellH + 11;
      const screen = project(world, camera, size, width, height);
      const event = { ...screen, type: 'pointerdown', pointerId: 17, button: 0 };
      const picked = payphoneInteriorPointer(event, { plane, ...camera, size, width, height });
      near(picked.cellX * cellW, x, 'finger-hole x after looking');
      near(picked.cellY * cellH, y, 'finger-hole y after looking');
      assert.equal(picked.pointerId, 17, 'ray mapping lost pointer ownership');
      assert.equal(event.cellX, screen.cellX, 'ray mapping mutated the raw scene event');
    }
  }
  const away = payphoneInteriorPointer({ cellX: cols / 2, cellY: rows / 2 },
    { plane, eye, yaw: -at.yaw + Math.PI, size });
  assert.equal(away, null, 'looking out at the road can still operate the set behind the eye');
  const edge = payphoneInteriorWorldPoint(plane, -.2, .5), camera = { eye, yaw: -at.yaw, pitch: -.16 };
  const event = project(edge, camera, size, cols * cellW, rows * cellH);
  const outside = payphoneInteriorPointer(event, { plane, ...camera, size });
  near(outside.instrumentUV.u, -.2, 'captured pull outside the canvas');
  assert.equal(outside.instrumentUV.inside, false);
  near(dot(r, n), 0, 'orthogonal cabinet basis');
}

// Old pose snapshots still resolve without a second placement convention.
const L = payphoneLayout({ cols: 128, rows: 36 }, { cellW: 8, cellH: 16 });
const exact = payphoneInteriorPlane({ boxWorld: { x: 7, y: 2, z: 8, yaw: .2 } }, L);
const compatible = payphoneInteriorPlane({ faceSet: -.2, groundY: 2,
  insideWorld: { x: 7 + Math.sin(.2) * PAYPHONE_CABINET.standingZ + Math.cos(.2) * PAYPHONE_CABINET.standingX,
    z: 8 + Math.cos(.2) * PAYPHONE_CABINET.standingZ - Math.sin(.2) * PAYPHONE_CABINET.standingX } }, L);
for (let i = 0; i < 3; i++) near(compatible.origin[i], exact.origin[i], 'pose compatibility');
assert.equal(payphoneInteriorPlane(null, L), null);
assert.equal(payphoneInteriorPointer({}, {}), null);

// Place the ink on the existing native directory cover, not on an invented
// upright book. Read the shipped mesh bounds so an asset change cannot quietly
// leave a second book floating off the shelf.
const bytes = readFileSync(new URL('../public/assets/conservatory-props.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12), pack = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const binary = 20 + jsonLength + 8;
const shell = pack.meshes.find(mesh => mesh.name === 'city_phone_box');
const cover = shell.primitives.find(p => pack.materials[p.material].name === 'mustard wool');
assert.ok(cover, 'native telephone directory cover is missing');
const accessor = pack.accessors[cover.attributes.POSITION], bufferView = pack.bufferViews[accessor.bufferView];
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < accessor.count * 3; i++) {
  const v = bytes.readFloatLE(binary + (bufferView.byteOffset || 0) + (accessor.byteOffset || 0) + i * 4);
  min[i % 3] = Math.min(min[i % 3], v); max[i % 3] = Math.max(max[i % 3], v);
}
const meshNear = (a, b, name) => assert.ok(Math.abs(a - b) < 1e-6, `${name}: ${a} != ${b}`);
meshNear(min[0], PAYPHONE_BOOK.left, 'book left edge');
meshNear(min[2], PAYPHONE_BOOK.backZ, 'book back edge');
meshNear(max[0] - min[0], PAYPHONE_BOOK.width, 'book native width');
meshNear(max[2] - min[2], PAYPHONE_BOOK.height, 'book native depth');
assert.ok(PAYPHONE_BOOK.topY > max[1] && PAYPHONE_BOOK.topY - max[1] < .02, 'print is not on the native book top');

for (const yaw of [0, .72, -Math.PI / 2, Math.PI]) {
  const pose = { boxWorld: { x: 13, y: 15.2, z: -71, yaw } }, plane = payphoneInteriorBookPlane(pose);
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)], front = [Math.sin(yaw), 0, Math.cos(yaw)];
  const centre = payphoneInteriorWorldPoint(plane, .5, .5), at = pose.boxWorld;
  near(centre.x, at.x + right[0] * .16 + front[0] * -.276, 'book centre x');
  near(centre.z, at.z + right[2] * .16 + front[2] * -.276, 'book centre z');
  near(centre.y, at.y + 1.033, 'book top elevation');
  const eye = { x: at.x + right[0] * .09 + front[0] * .23, y: at.y + 1.62,
    z: at.z + right[2] * .09 + front[2] * .23 };
  const size = { cols: 128, rows: 40 }, width = 1280, height = 800;
  for (const look of [-.2, .2]) for (const [u, region] of [[.25, 'scratches'], [.75, 'directory']]) {
    const camera = { eye, yaw: -yaw + look, pitch: -.58 };
    const point = payphoneInteriorWorldPoint(plane, u, .45), event = {
      ...project(point, camera, size, width, height), type: 'pointerdown', pointerId: 31,
    };
    const hit = payphoneInteriorBookPointer(event, { plane, layout: L, ...camera, size, width, height });
    assert.equal(hit.instrumentRegion, region, 'wrong page inspection');
    near(hit.cellX, L[region].x + L[region].w / 2, 'page inspection x');
    near(hit.cellY, L[region].y + L[region].h / 2, 'page inspection y');
    near(hit.instrumentUV.u, u, 'page projected u');
    assert.equal(hit.pointerId, 31, 'page mapping lost pointer ownership');
    const outside = project(payphoneInteriorWorldPoint(plane, 1.1, .45), camera, size, width, height);
    assert.equal(payphoneInteriorBookPointer(outside, { plane, layout: L, ...camera, size, width, height }), null,
      'a point outside the native book opened a page');
  }
}
assert.equal(payphoneInteriorBookPlane(null), null);
console.log('payphone interior: physical cabinet/book anchors and pointer projection survive look, aspect, scale and off-canvas pulls');
