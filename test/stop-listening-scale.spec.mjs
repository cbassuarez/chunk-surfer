import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import { conservatory as C } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import * as PROPS from '../src/game/props.js';
import { STOP_LISTENING_ROOM_IDS, STOP_LISTENING_ROOMS, STOP_LISTENING_MESH, STOP_LISTENING_EAR_SCALE } from '../src/data/stop-listening.js';
import { STOP_LISTENING_BOUNDS, STOP_LISTENING_FLESH_BOUNDS } from '../src/data/generated/stop-listening-geometry.js';
import { stopListeningPlacements, stopListeningLoosePlacements, stopListeningFootprint } from '../src/game/stop-listening.js';

const bytes = fs.readFileSync(process.env.CS_EAR_TEST_ASSET || new URL('../public/assets/stop-listening.glb', import.meta.url));
const n = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, 20 + n)), binary = 28 + n;
function positions(accessor) {
  const a = gltf.accessors[accessor], v = gltf.bufferViews[a.bufferView];
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: 3 }, (_, k) =>
    bytes.readFloatLE(binary + (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || 12) + k * 4)));
}
const flesh = (mesh) => mesh.primitives.filter((p) => gltf.materials[p.material].name !== 'stop listening floor wet')
  .flatMap((p) => positions(p.attributes.POSITION));
const extent = (points) => ({ min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))), max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) });

test('actual shipped ear anatomy is half-metre scale after ordinary instance variation', () => {
  assert.equal(STOP_LISTENING_EAR_SCALE, 6.4);
  for (const name of STOP_LISTENING_MESH.ears) {
    const b = extent(flesh(gltf.meshes.find((m) => m.name === name)));
    const length = b.max[2] - b.min[2];
    assert.ok(length * 1.3 >= .43, `${name}: only ${(length * 1.3).toFixed(3)}m of anatomy, excluding its wet smear`);
    assert.ok(length * 1.6 < .76, `${name}: oversized beyond the authored room scale`);
  }
});

test('every packed ear and heap agrees with its bounds and rests on the floor', () => {
  for (const name of [...STOP_LISTENING_MESH.ears, ...STOP_LISTENING_MESH.heaps]) {
    const mesh = gltf.meshes.find((m) => m.name === name), f = extent(flesh(mesh));
    const all = extent(mesh.primitives.flatMap((p) => positions(p.attributes.POSITION)));
    for (const key of ['min', 'max']) for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(all[key][i] - STOP_LISTENING_BOUNDS[name][key][i]) <= .000051, `${name}: stale packed bounds`);
      assert.ok(Math.abs(f[key][i] - STOP_LISTENING_FLESH_BOUNDS[name][key][i]) <= .000051, `${name}: stale anatomy bounds`);
    }
    assert.ok(Math.abs(f.min[1] - .002) < .00001, `${name}: cartilage floats or cuts through its floor`);
    const liquid = mesh.primitives.filter((p) => gltf.materials[p.material].name === 'stop listening floor wet').flatMap((p) => positions(p.attributes.POSITION));
    assert.ok(liquid.every((p) => Math.abs(p[1] - .0008) < .00001), `${name}: wet stain was enlarged away from the floor`);
  }
});

FP.compile(C.levels, { width: C.width, height: C.height, widenCorridors: C.widenCorridors,
  connectors: C.connectors, edgePortals: C.edgePortals, doors: C.doors });
PROPS.propsInit(FP);
const zoneRoom = { [ZONE.natatorium]: 'the_tub', [ZONE.hall]: 'amplifications', [ZONE.practice]: 'soundnoisemusic' };
const floorAt = (x, y) => FP.floorAt(Math.round(x * 2), Math.round(y * 2));
const canPlace = (room) => (x, y) => {
  const rx = Math.round(x * 2), ry = Math.round(y * 2);
  return !FP.isSolid(rx, ry) && !FP.isCollisionOnly(rx, ry) && zoneRoom[FP.zoneAt(rx, ry)] === room && PROPS.propCanOccupy(rx, ry);
};

for (const roomId of STOP_LISTENING_ROOM_IDS) test(`${roomId}: giant ears fit actual surfaces without hiding the sheet, entry or route`, () => {
  const room = STOP_LISTENING_ROOMS[roomId], options = { canPlace: canPlace(roomId), floorAt };
  const poses = stopListeningPlacements(roomId, options), actual = (p) => ({ ...p, x: p.x + (p.renderOffsetX || 0), y: p.y + (p.renderOffsetZ || 0) });
  const ears = poses.filter((p) => p.id.includes(':ear:')), heaps = poses.filter((p) => p.id.includes(':heap:'));
  assert.equal(heaps.length, room.heaps.length, 'a giant heap no longer fits its assigned room');
  assert.ok(ears.length >= room.fields.reduce((sum, f) => sum + f.count, 0) * .9, 'size increase erased the floor treatment');
  for (const prop of [...ears, ...heaps]) {
    const pose = actual(prop), floor = floorAt(pose.x, pose.y);
    for (const p of stopListeningFootprint(pose)) {
      assert.ok(options.canPlace(p.x, p.y), `${prop.id}: clips a wall, pool boundary or existing furniture`);
      assert.ok(Math.abs(floorAt(p.x, p.y) - floor) < .025, `${prop.id}: crosses a terrace riser`);
      assert.ok(Math.hypot(p.x - room.sheet.x, p.y - room.sheet.y) >= .39999, `${prop.id}: conceals the take sheet`);
      assert.ok(Math.hypot(p.x - room.entry.x, p.y - room.entry.y) >= .69999, `${prop.id}: crowds the entrance`);
    }
  }
  const cells = [];
  for (const f of room.fields) for (let x = Math.ceil(f.x0 * 2); x <= Math.floor(f.x1 * 2); x++) for (let y = Math.ceil(f.y0 * 2); y <= Math.floor(f.y1 * 2); y++)
    cells.push({ x, y, open: PROPS.propCanOccupy(x, y) });
  for (const p of stopListeningLoosePlacements(poses, FP, STOP_LISTENING_BOUNDS)) {
    const live = PROPS.setLooseProp(p.id, p);
    assert.equal(live.blocks, false, 'this visual treatment cannot alter the recording route');
  }
  for (const cell of cells) assert.equal(PROPS.propCanOccupy(cell.x, cell.y), cell.open, 'an existing route changed after staging enlarged ears');
  for (const p of poses) PROPS.setLooseProp(p.id, null);
});
