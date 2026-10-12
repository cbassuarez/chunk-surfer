import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SOURCE_HALL,
  SOURCE_HALL_BAYS,
  SOURCE_HALL_REGIMES,
  SOURCE_HALL_SHEET_COUNT,
  sourceHallCellIntervalMs,
  sourceHallDocumentStage,
  sourceHallLightPlacements,
  sourceHallPaceMultiplier,
  sourceHallPropPlacements,
  sourceHallRegime,
  sourceHallSheet,
  sourceHallStillPage,
} from '../src/data/source-hall.js';

// Test against the shipped meshes, including hinge-origin door leaves. A
// convenient authoring dimension cannot stand in for the actual visible body.
function glbMeshBounds(relativePath) {
  const bytes = readFileSync(new URL(relativePath, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  return new Map(gltf.meshes.map((mesh) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const primitive of mesh.primitives) {
      const position = gltf.accessors[primitive.attributes.POSITION];
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], position.min[axis]);
        max[axis] = Math.max(max[axis], position.max[axis]);
      }
    }
    return [mesh.name, { min, max }];
  }));
}

function transformedBounds(local, placement) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
  for (const x of [local.min[0], local.max[0]]) {
    for (const y of [local.min[1], local.max[1]]) {
      for (const z of [local.min[2], local.max[2]]) {
        const point = [
          placement.x + c * x * placement.scaleX + s * z * placement.scaleZ,
          placement.y + y * placement.scaleY,
          placement.z - s * x * placement.scaleX + c * z * placement.scaleZ,
        ];
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], point[axis]);
          max[axis] = Math.max(max[axis], point[axis]);
        }
      }
    }
  }
  return { min, max };
}

assert.equal(SOURCE_HALL.lengthMetres, 112);
assert.equal(SOURCE_HALL.widthMetres, 6);
assert.equal(SOURCE_HALL.ceilingMetres, 4.5);
assert.deepEqual(SOURCE_HALL_REGIMES.map(({ from, to }) => [from, to]), [
  [0, 22], [22, 48], [48, 78], [78, 100], [100, 112],
]);
for (const regime of SOURCE_HALL_REGIMES) {
  assert.equal(sourceHallRegime(regime.from).id, regime.id);
  assert.equal(sourceHallDocumentStage((regime.from + regime.to) / 2), regime.stage);
}
assert.equal(sourceHallRegime(112).id, 'stillness');

// Pace follows distance, not a frame count or an accidental engine ceiling.
for (const cellMetres of [0.25, 0.5, 1]) {
  const cells = SOURCE_HALL.lengthMetres / cellMetres;
  assert.ok(Math.abs(cells * sourceHallCellIntervalMs(cellMetres) / 1000 - 50) < 1e-9);
  assert.ok(Math.abs(sourceHallPaceMultiplier(45, cellMetres) * 45 - sourceHallCellIntervalMs(cellMetres)) < 1e-9);
}

// One form at 12m. Other documents have stable physical addresses and a stage
// inherited from those addresses, regardless of observer progress or read order.
for (const seed of [0, 1, 4417, 0xffffffff]) {
  const first = sourceHallSheet(seed, 0);
  assert.equal(first.depthMetres, 12);
  assert.equal(first.readable, true);
  assert.equal(first.documentStage, 0);
  for (let index = 1; index < SOURCE_HALL_SHEET_COUNT; index += 1) {
    const a = sourceHallSheet(seed, index);
    sourceHallSheet(seed, (index + 173) % SOURCE_HALL_SHEET_COUNT);
    const b = sourceHallSheet(seed, index, { distanceMetres: 112 });
    assert.deepEqual(b, a, `${seed}:${index} moved with progress or enumeration`);
    if (!a) continue;
    assert.ok(a.depthMetres >= 22, 'the single first form acquired neighbours in the dry stretch');
    assert.equal(a.documentStage, sourceHallDocumentStage(a.depthMetres));
    if (a.readable) assert.ok(a.depthMetres <= 112, 'visual continuation acquired an interaction');
  }
}

// Every historical slot fits the last 12m. The whole footprint of a decoy must
// clear the patch, including when a saved game carries a non-default slot.
const solutionAddresses = new Set();
for (let slot = 0; slot < 12; slot += 1) {
  const solution = sourceHallStillPage(4417, slot);
  solutionAddresses.add(`${solution.x}:${solution.z}`);
  assert.ok(solution.depthMetres >= 100 && solution.depthMetres <= 108);
  assert.ok(Math.abs(solution.x) + 0.24 < SOURCE_HALL.widthMetres / 2);
  for (let index = 1; index < SOURCE_HALL_SHEET_COUNT; index += 1) {
    const sheet = sourceHallSheet(4417, index, { slot });
    if (!sheet || sheet.surface !== 'floor') continue;
    const gap = Math.hypot(sheet.x - solution.x, sheet.z - solution.z);
    assert.ok(gap > SOURCE_HALL.stillPatchRadius + 0.28,
      `sheet ${index} intrudes into solution patch ${slot}`);
  }
}
assert.equal(solutionAddresses.size, 12);
assert.deepEqual(sourceHallStillPage(4417, null), sourceHallStillPage(4417));

// Returning late to the first physical form must not print the far end's text
// onto it at the moment of reading. Exercise the actual dialogue assignment.
{
  const { freshChunkSurfState, reduceChunkSurf } = await import('../src/game/chunk-surf-state.js');
  const { createSourceSpaceRuntime } = await import('../src/game/source-space-runtime.js');
  let state = freshChunkSurfState({ seed: 4417 });
  state = reduceChunkSurf(state, { type: 'SOURCE_ENTERED' });
  state = reduceChunkSurf(state, { type: 'HALL_ADVANCED', distance: 112 });
  const runtime = createSourceSpaceRuntime({ initialState: state });
  runtime.setPlayerPosition({ x: 0, y: -24, facing: 0 });
  const read = runtime.inspectFocused(0, -24, 0);
  assert.equal(read.event, 'page-read');
  assert.equal(read.page.stage, 0, 'first form inherited the reader\'s maximum stage');
}

// Repetition remains measurable while its relationships disappear. A number
// without a leaf and a pool without a fitting must both be real authored cases.
assert.ok(SOURCE_HALL_BAYS.some((bay) => bay.number && !bay.door));
assert.ok(SOURCE_HALL_BAYS.some((bay) => bay.lightPool && !bay.fitting));
for (let index = 1; index < SOURCE_HALL_BAYS.length; index += 1) {
  assert.equal(SOURCE_HALL_BAYS[index].depthMetres - SOURCE_HALL_BAYS[index - 1].depthMetres, 12);
}

const available = new Map([
  ...glbMeshBounds('../public/assets/conservatory-props.glb'),
  ...glbMeshBounds('../public/assets/conservatory-doors.glb'),
]);
const props = sourceHallPropPlacements();
assert.equal(new Set(props.map(({ id }) => id)).size, props.length);
assert.deepEqual(sourceHallPropPlacements(), props, 'architecture moves between samples');
for (const prop of props) {
  const local = available.get(prop.mesh);
  assert.ok(local, `hall requires an unshipped mesh: ${prop.mesh}`);
  const bounds = transformedBounds(local, prop);
  assert.equal(prop.solid, false, 'decorative hall relationships introduce a hidden collision');
  const crossesWalkingSpine = bounds.min[0] < SOURCE_HALL.centralClearHalfWidth
    && bounds.max[0] > -SOURCE_HALL.centralClearHalfWidth;
  if (crossesWalkingSpine) {
    assert.ok(bounds.max[1] <= 0.02 || bounds.min[1] >= 2.7,
      `${prop.id} visibly obstructs the clear walking spine without collision`);
  }
  assert.ok(bounds.min[2] >= -112.1 && bounds.max[2] <= 0,
    `${prop.id} crosses the hall's authored envelope`);
}
for (const bay of SOURCE_HALL_BAYS.filter(({ door }) => door)) {
  const frame = props.find(({ id }) => id === `${bay.id}:door-frame`);
  const leaf = props.find(({ id }) => id === `${bay.id}:door-leaf`);
  const frameBounds = transformedBounds(available.get(frame.mesh), frame);
  const leafBounds = transformedBounds(available.get(leaf.mesh), leaf);
  const centre = (bounds) => (bounds.min[2] + bounds.max[2]) / 2;
  assert.ok(Math.abs(centre(frameBounds) - centre(leafBounds)) < 0.02,
    'hinge-origin leaf sits beside, rather than inside, its frame');
}
assert.ok(props.some(({ semantic }) => semantic === 'hall-terminal-seam'));

// A distant fitting can remain a dim mesh without spending a visibility ray
// per pixel. Only useful nearby sources enter the small practical-light set.
for (let depth = 0; depth <= 112; depth += 0.5) {
  for (const maxLights of [0, 1, 3, 4, 99]) {
    const lights = sourceHallLightPlacements(depth, { maxLights });
    assert.ok(lights.length <= Math.min(4, maxLights));
    assert.equal(new Set(lights.map(({ id }) => id)).size, lights.length);
    for (const light of lights) {
      assert.equal(light.kind, 'fitting');
      assert.ok(Math.abs(-light.z - depth) < 16);
      assert.ok(light.radius > 0 && light.radius <= 16);
      assert.ok(light.intensity > 0 && light.intensity <= 1);
      assert.ok(light.y > 1.8 && light.y < 4.5);
    }
  }
}
assert.equal(sourceHallLightPlacements(56, { maxLights: 4 }).length, 3);

console.log('source hall Held Breath design specs passed');
