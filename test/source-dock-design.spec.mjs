import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CELL, ZONE } from '../src/data/floorplan/legend.js';
import {
  SOURCE_DOCK_DESIGN,
  SOURCE_LANDING_PORTAL_APERTURE,
  SOURCE_LANDING_PORTAL_LOCAL,
  SOURCE_LANDING_PORTAL_MAX_ANGLE,
  SOURCE_LANDING_REAR_LOCAL,
  sourceLandingCellAt,
  sourceLandingContract,
  sourceLandingDoorPlacements,
  sourceLandingLights,
  sourceLandingPropCollisionAt,
  sourceLandingPropFootprints,
  sourceLandingPropPlacements,
  sourceLandingRecognitions,
} from '../src/data/source-landing.js';

// Use shipped geometry rather than the mesh name or its convenient authoring
// origin. This catches the lost roof, submerged chandelier and false desktop.
function readMeshes(file) {
  const bytes = readFileSync(new URL(file, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  const binaryStart = 20 + bytes.readUInt32LE(12) + 8;
  return json.meshes.map((mesh) => {
    const vertices = [];
    for (const primitive of mesh.primitives) {
      const accessor = json.accessors[primitive.attributes.POSITION];
      const view = json.bufferViews[accessor.bufferView];
      assert.equal(accessor.componentType, 5126);
      for (let i = 0; i < accessor.count; i += 1) {
        const start = binaryStart + (view.byteOffset || 0) + (accessor.byteOffset || 0)
          + i * (view.byteStride || 12);
        vertices.push([0, 4, 8].map((offset) => bytes.readFloatLE(start + offset)));
      }
    }
    return [mesh.name, vertices];
  });
}

const meshes = new Map([
  ...readMeshes('../public/assets/conservatory-props.glb'),
  ...readMeshes('../public/assets/conservatory-acquisitions.glb'),
  ...readMeshes('../public/assets/conservatory-doors.glb'),
]);
function transformedVertices(prop) {
  const vertices = meshes.get(prop.mesh);
  assert.ok(vertices, `unshipped dock mesh ${prop.mesh}`);
  const c = Math.cos(prop.yaw || 0), s = Math.sin(prop.yaw || 0), scale = prop.scale || 1;
  const sx = prop.scaleX ?? scale, sy = prop.scaleY ?? scale, sz = prop.scaleZ ?? scale;
  return vertices.map(([x, y, z]) => [
    prop.x * CELL + c * x * sx + s * z * sz,
    prop.y + y * sy,
    prop.z * CELL - s * x * sx + c * z * sz,
  ]);
}
function bounds(prop) {
  const vertices = transformedVertices(prop);
  return {
    min: [0, 1, 2].map((axis) => Math.min(...vertices.map((p) => p[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...vertices.map((p) => p[axis]))),
  };
}
const props = sourceLandingPropPlacements();
const byId = new Map(props.map((p) => [p.sourcePropId, p]));
assert.equal(new Set(props.map((p) => p.id)).size, props.length);
assert.equal(SOURCE_DOCK_DESIGN.freeWalking, true);
assert.equal(SOURCE_DOCK_DESIGN.orderedRecognitions, false);
assert.deepEqual(sourceLandingPropPlacements(), props, 'room composition moves between calls');

const roof = byId.get('dock-scene-roof');
assert.ok(roof, 'anchor filtering discarded the actual room-spanning roof');
const roofBounds = bounds(roof);
assert.ok(Math.abs(roofBounds.max[1] - 5.5) < 1e-5);
assert.ok(Math.abs(roofBounds.min[2] + 8) < 1e-5 && Math.abs(roofBounds.max[2] - 8) < 1e-5);
assert.ok(roofBounds.min[0] < -5.5 && roofBounds.max[0] > 5.5, 'roof fails to meet the side walls');
for (const [x, y, z] of transformedVertices(roof)) {
  if (y >= 2.7) continue;
  assert.ok(Math.abs(x) >= 5.5, `roof pier intrudes into open floor at ${x},${y},${z}`);
}
for (const p of props.filter((p) => p !== roof)) {
  const b = bounds(p);
  assert.ok(b.min[1] >= -.005, `${p.id} sinks below the room floor`);
  assert.ok(b.max[1] <= 5.5, `${p.id} crosses the room ceiling`);
}

const desk = byId.get('dock-desk-1'), clipboard = byId.get('dock-work-order-clipboard');
assert.equal(clipboard.on, 'dock-desk-1');
assert.ok(Math.abs(clipboard.y - .7175) < .012, 'clipboard uses desk-back height instead of its desktop');
const c = Math.cos(desk.yaw), s = Math.sin(desk.yaw);
for (const [x, , z] of transformedVertices(clipboard)) {
  const dx = x - desk.x * CELL, dz = z - desk.z * CELL;
  const localX = c * dx - s * dz, localZ = s * dx + c * dz;
  assert.ok(localX >= -.31 && localX <= .31 && localZ >= -.28 && localZ <= .20,
    'clipboard overhangs the measured desktop');
}
const cage = bounds(byId.get('dock-chandelier-frame'));
const chandelier = bounds(byId.get('dock-chandelier-intact'));
const support = bounds(byId.get('chandelier-crossbar'));
assert.ok(chandelier.min[1] > .7, 'chandelier is still submerged in the floor');
assert.ok(Math.abs(chandelier.max[1] - support.min[1]) < .006, 'chandelier hangs from empty air');
assert.ok(chandelier.min[0] > cage.min[0] && chandelier.max[0] < cage.max[0]);
assert.ok(chandelier.min[2] > cage.min[2] && chandelier.max[2] < cage.max[2]);
assert.ok(support.max[1] < cage.max[1] + .02, 'support overshoots its cage frame');

const footprints = sourceLandingPropFootprints();
for (const footprint of footprints) {
  const b = bounds(byId.get(footprint.sourcePropId));
  assert.ok(footprint.minX <= b.min[0] + .002 && footprint.maxX >= b.max[0] - .002,
    `body can enter visible width of ${footprint.sourcePropId}`);
  assert.ok(footprint.minZ <= b.min[2] + .002 && footprint.maxZ >= b.max[2] - .002,
    `body can enter visible depth of ${footprint.sourcePropId}`);
  const x = (footprint.minX + footprint.maxX) / (2 * CELL);
  const y = (footprint.minZ + footprint.maxZ) / (2 * CELL);
  assert.equal(sourceLandingPropCollisionAt(x, y)?.id, footprint.id);
  // The authored room has a stepped front-left corner. A rectangle derived
  // from its extrema cannot establish that perimeter freight is inside it.
  for (let px = footprint.minX; px <= footprint.maxX; px += .04) {
    for (let pz = footprint.minZ; pz <= footprint.maxZ; pz += .04) {
      assert.equal(sourceLandingCellAt(px / CELL, pz / CELL)?.solid, false,
        `${footprint.sourcePropId} is embedded in the authored room wall at ${px},${pz}`);
    }
  }
}
const clear = SOURCE_DOCK_DESIGN.clearFloorMetres;
for (let x = clear.minX; x <= clear.maxX; x += .1) {
  for (let z = clear.minZ; z <= clear.maxZ; z += .1) {
    assert.equal(sourceLandingCellAt(x / CELL, z / CELL)?.solid, false,
      `authored shell enters the broad free floor at ${x},${z}`);
    assert.equal(sourceLandingPropCollisionAt(x / CELL, z / CELL), null,
      `furniture enters the broad free floor at ${x},${z}`);
  }
}

// Flood the entire room at body scale. The dock remains one open floor with
// freely reachable sides of its anchors, rather than a diagrammed route.
const step = .25, free = new Map();
let total = 0;
for (let ix = 0; ix <= 40; ix += 1) {
  for (let iz = 0; iz <= 60; iz += 1) {
    const x = -5 + ix * step, z = -7.5 + iz * step;
    if (sourceLandingCellAt(x / CELL, z / CELL)?.solid !== false) continue;
    total += 1;
    if (!sourceLandingPropCollisionAt(x / CELL, z / CELL)) free.set(`${ix}:${iz}`, { ix, iz });
  }
}
assert.ok(free.size / total > .87, 'freight turns the room into a prop maze');
const reached = new Set(), pending = [free.values().next().value];
while (pending.length) {
  const { ix, iz } = pending.pop(), key = `${ix}:${iz}`;
  if (reached.has(key)) continue;
  reached.add(key);
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nextKey = `${ix + dx}:${iz + dz}`;
    if (free.has(nextKey) && !reached.has(nextKey)) pending.push(free.get(nextKey));
  }
}
assert.equal(reached.size, free.size, 'real prop collision isolates part of the room');

const origin = { x: 21, y: -88 };
const recognitions = sourceLandingRecognitions(origin);
assert.equal(recognitions.length, 3);
assert.deepEqual(recognitions.map((r) => r.id), ['source-dock:desk', 'source-dock:case', 'source-dock:chandelier']);
for (const r of recognitions) {
  const object = byId.get(r.sourcePropId);
  assert.equal(r.optional, true);
  assert.equal(r.x, origin.x + object.x);
  assert.equal(r.y, origin.y + object.z);
  assert.equal(sourceLandingPropCollisionAt(r.standX - origin.x, r.standY - origin.y), null);
  assert.ok(Math.hypot(r.x - r.standX, r.y - r.standY) * CELL < 1.5);
}

const portal = SOURCE_LANDING_PORTAL_LOCAL;
assert.deepEqual(SOURCE_LANDING_PORTAL_APERTURE, { width: 1, height: 2.2 });
assert.equal(sourceLandingCellAt(portal.x, portal.y).solid, true);
const renderedClosed = sourceLandingCellAt(portal.x, portal.y, { renderOnly: true });
const renderedOpen = sourceLandingCellAt(portal.x, portal.y, { portalOpen: true, renderOnly: true });
assert.deepEqual(renderedClosed, renderedOpen, 'moving leaf restores or removes a whole wall column');
assert.equal(renderedClosed.ceil, 2.2);
assert.equal(renderedClosed.zone, ZONE.getIn);
assert.equal(sourceLandingCellAt(portal.x + 1.01, portal.y, { renderOnly: true }).solid, true,
  'collision tolerance widened the visible door frame');
assert.equal(sourceLandingCellAt(12, 3, { portalOpen: true }).closure, 'building-services');
assert.equal(sourceLandingCellAt(SOURCE_LANDING_REAR_LOCAL.x, SOURCE_LANDING_REAR_LOCAL.y).corridorMouth, true);

const closedLeaf = sourceLandingDoorPlacements().find((p) => p.sourcePortalLeaf);
const openLeaf = sourceLandingDoorPlacements({ x: 0, y: 0 }, { portalProgress: 1 }).find((p) => p.sourcePortalLeaf);
assert.equal(openLeaf.x, closedLeaf.x);
assert.equal(openLeaf.z, closedLeaf.z);
assert.equal(openLeaf.yaw, -SOURCE_LANDING_PORTAL_MAX_ANGLE);
assert.ok(SOURCE_LANDING_PORTAL_MAX_ANGLE > 1.5 && SOURCE_LANDING_PORTAL_MAX_ANGLE < Math.PI / 2);
// Positive local leaf X is mirrored at the right jamb. The actual shipped tip
// moves into negative Source Z (outside), using the renderer's yaw convention.
const leafLocalTip = Math.max(...meshes.get(closedLeaf.mesh).map((v) => v[0]));
const tipZ = openLeaf.z * CELL - Math.sin(openLeaf.yaw) * leafLocalTip * openLeaf.scaleX;
assert.ok(tipZ < portal.y * CELL - .8, 'leaf swings inward despite its hinge name');

const dockLights = sourceLandingLights().filter((p) => p.sourceDockOnly);
assert.equal(dockLights.length, 3);
assert.ok(dockLights.every((p) => p.kind === 'fitting' && p.intensity <= .45 && p.radius <= 7.5));
assert.equal(props.filter((p) => p.semantic === 'dock-practical-fitting').length, dockLights.length);
assert.ok(!sourceLandingLights().some((p) => p.id.includes('chandelier')), 'dead bulbs became a light source');
assert.equal(sourceLandingContract().design.id, 'remembered-room');
assert.equal(sourceLandingContract().recognitions.length, 3);

console.log('Source dock Remembered Room geometry and free circulation specs passed');
