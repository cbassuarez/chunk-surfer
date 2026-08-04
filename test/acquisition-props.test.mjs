import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS, PROCUREMENT_COHORTS, PROP_MESH } from '../src/data/conservatory-props.js';
import * as PROPS from '../src/game/props.js';
import * as FP from '../src/world/floorplan.js';
import { propInstanceVisible } from '../src/render/props3d.js';

const manifest = JSON.parse(fs.readFileSync('tools/chunk_surfer/acquisition-sources.json', 'utf8'));
const stats = JSON.parse(fs.readFileSync('public/assets/conservatory-acquisitions.stats.json', 'utf8'));
const credits = JSON.parse(fs.readFileSync('public/assets/conservatory-acquisitions.credits.json', 'utf8'));
const bytes = fs.readFileSync('public/assets/conservatory-acquisitions.glb');
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());

assert.equal(bytes.subarray(0, 4).toString('ascii'), 'glTF');
assert.equal(bytes.readUInt32LE(4), 2);
assert.equal(bytes.readUInt32LE(8), bytes.length);
assert.ok(bytes.length <= manifest.limits.bytes);
assert.ok(stats.totalTriangles <= manifest.limits.triangles);
assert.ok(stats.maxTextureDimension <= manifest.limits.textureDimension);
assert.equal(stats.textureCount, 45);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), credits.pack.sha256);
assert.equal(gltf.animations, undefined);
assert.equal(gltf.skins, undefined);
assert.equal(gltf.extensionsUsed, undefined);
assert.equal(gltf.extensionsRequired, undefined);
assert.ok(gltf.materials.every((material) => ['OPAQUE', 'MASK'].includes(material.alphaMode || 'OPAQUE')));
assert.ok(gltf.materials.every((material) => !material.emissiveTexture && (material.emissiveFactor || [0, 0, 0]).every((value) => value === 0)));

const expectedMeshes = new Set(manifest.sources.map((source) => source.mesh));
assert.equal(expectedMeshes.size, 13);
assert.deepEqual(new Set(gltf.meshes.map((mesh) => mesh.name)), expectedMeshes);
for (const source of manifest.sources) {
  const mesh = gltf.meshes.find((entry) => entry.name === source.mesh);
  const triangles = mesh.primitives.reduce((sum, primitive) => sum + gltf.accessors[primitive.indices].count / 3, 0);
  assert.ok(triangles <= source.triangleBudget, `${source.mesh} exceeds its triangle budget`);
  assert.ok(mesh.primitives.every((primitive) => Number.isInteger(primitive.attributes.POSITION)
    && Number.isInteger(primitive.attributes.NORMAL)
    && Number.isInteger(primitive.attributes.TEXCOORD_0)
    && Number.isInteger(primitive.material)));
  const materials = mesh.primitives.map((primitive) => gltf.materials[primitive.material]);
  assert.ok(materials.some((material) => material.pbrMetallicRoughness?.baseColorTexture));
  assert.ok(materials.some((material) => material.normalTexture));
  assert.ok(materials.some((material) => material.pbrMetallicRoughness?.metallicRoughnessTexture));
  const credit = credits.sources.find((entry) => entry.mesh === source.mesh);
  assert.equal(credit.source, source.url);
  assert.equal(credit.license, 'CC0-1.0');
  assert.equal(credit.archiveSha256, source.sha256);
  assert.equal(credit.anchor, source.anchor);
}

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors,
});
for (const door of conservatory.doors || []) FP.setDoorKey(door.x, door.y, door.key);
FP.setAllDoorsOpen(true);
PROPS.propsInit(FP);

const historicalProps = CONSERVATORY_PROPS.filter((prop) => prop.provenance);
const acquisitions = historicalProps.filter((prop) => expectedMeshes.has(prop.mesh));
// 33 since the ground-floor dead end was furnished: FOH/F-06 through F-08, the
// three pieces of the front-of-house suite that were carried round the back and
// left there. Same cohort and the same stamping as the pieces still out front.
assert.equal(historicalProps.length, 33);
assert.equal(acquisitions.length, 33);
assert.equal(new Set(historicalProps.map((prop) => prop.provenance.assetTag)).size, 33);
assert.ok(historicalProps.every((prop) => PROCUREMENT_COHORTS[prop.provenance.cohort]));
assert.ok(acquisitions.every((prop) => !prop.sampleFamily && prop.interaction !== 'play'));

const expectedCohorts = {
  practice_room_contract: 8,
  foyer_suite: 8,   // 5 out front, 3 carried round to the east dead end
  curatorial_accessions: 2,
  hall_lighting_refit: 2,
  hall_lounge_replacement: 2,
  chapel_foundation_1908: 6,
  services_rewire: 3,
  maintenance_purchase: 2,
};
for (const [cohort, count] of Object.entries(expectedCohorts)) {
  assert.equal(historicalProps.filter((prop) => prop.provenance.cohort === cohort).length, count, cohort);
}

const practiceChairs = acquisitions.filter((prop) => prop.mesh === 'green_chair_01');
assert.equal(practiceChairs.length, 8);
assert.deepEqual(practiceChairs.map((prop) => prop.provenance.assetTag), ['P/CH-01', 'P/CH-02', 'P/CH-03', 'P/CH-04', 'P/CH-05', 'P/CH-06', 'P/CH-07', 'P/CH-08']);
const chair08=practiceChairs.find((prop)=>prop.provenance.assetTag==='P/CH-08');
const ensembleViolin=CONSERVATORY_PROPS.find((prop)=>prop.id==='practice-ensemble-violin');
assert.deepEqual({x:chair08?.x,y:chair08?.y},{x:ensembleViolin?.x,y:ensembleViolin?.y},
  'chair 08 remains beneath the violin in the redressed ensemble room');

const ceilingProps = acquisitions.filter((prop) => PROP_MESH[prop.mesh].mount === 'ceiling');
for (const prop of ceilingProps) {
  const rx = Math.round(prop.x * 2);
  const ry = Math.round(prop.y * 2);
  const top = FP.floorAt(rx, ry) + prop.elevation;
  const bottom = top - PROP_MESH[prop.mesh].h * prop.scale;
  assert.ok(top <= FP.ceilAt(rx, ry) - 0.15 + 1e-3, `${prop.id} clears the ceiling rose`);
  assert.ok(bottom > FP.floorAt(rx, ry) + 1.8, `${prop.id} clears heads and furniture`);
}

for (const prop of acquisitions.filter((entry) => ['marble_bust_01', 'horse_head'].includes(entry.mesh))) {
  assert.equal(prop.elevation, 0.955);
  assert.ok(prop.inspectAt);
}
assert.equal(acquisitions.filter((prop) => prop.mesh === 'power_box_01').length, 3);
assert.ok(acquisitions.filter((prop) => prop.mesh === 'power_box_01').every((prop) => !prop.blocks && prop.elevation === 1.45));

const foyerSofa = acquisitions.find((prop) => prop.id === 'acq-foyer-sofa-01');
const foyerSuiteSeating = acquisitions.filter((prop) => ['acq-foyer-sofa-01', 'acq-foyer-armchair-01', 'acq-foyer-armchair-02'].includes(prop.id));
const hallSofas = acquisitions.filter((prop) => prop.mesh === 'sofa_02');
assert.equal(foyerSofa.scale, 1.55);
assert.deepEqual(foyerSuiteSeating.map((prop) => prop.x), [75.5, 75.5, 75.5]);
assert.deepEqual(foyerSuiteSeating.map((prop) => prop.y), [19, 17.7, 20.3]);
assert.ok(foyerSuiteSeating.every((prop) => prop.yaw === -Math.PI / 2));
assert.ok(hallSofas.every((prop) => prop.scale === 1.35));
assert.ok(acquisitions.filter((prop) => prop.provenance.cohort === 'hall_lighting_refit')
  .every((prop) => prop.scale === 3 && prop.elevation === 7.4));

const plantPipes = CONSERVATORY_PROPS.filter((prop) => prop.id.startsWith('plant-pipe-'));
assert.ok(plantPipes.length >= 10);
for (const authored of plantPipes) {
  const placed = PROPS.propById(authored.id);
  assert.ok(placed, `${authored.id} remains in walkable plant-room air`);
  assert.equal(placed.zone, 8, `${authored.id} remains inside the plant zone`);
  assert.equal(authored.mount, 'wall');
  const behindX = placed.rx - Math.round(Math.sin(placed.yaw || 0));
  const behindY = placed.ry - Math.round(Math.cos(placed.yaw || 0));
  assert.equal(FP.isSolid(behindX, behindY), true, `${authored.id} faces away from a solid wall`);
}
const northLowerRun = [
  'plant-pipe-north-lower-1',
  'plant-pipe-north-lower-valve',
  'plant-pipe-north-lower-2',
  'plant-pipe-north-lower-elbow',
].map((id) => CONSERVATORY_PROPS.find((prop) => prop.id === id));
for (let index = 1; index < northLowerRun.length; index += 1) {
  const previous = northLowerRun[index - 1];
  const current = northLowerRun[index];
  const previousEnd = previous.x + PROP_MESH[previous.mesh].w / 2;
  const currentStart = current.x - PROP_MESH[current.mesh].w / 2;
  assert.ok(Math.abs(previousEnd - currentStart) <= 0.05, `${previous.id} joins ${current.id}`);
}

const removedCirculationIds=['ground-spine-large-portrait','practice-corridor-large-portrait','acq-ground-spine-chair-north','acq-ground-spine-chair-south','acq-ground-spine-chandelier','acq-practice-corridor-chair-west','acq-practice-corridor-chair-east','acq-practice-corridor-chandelier'];
assert.ok(removedCirculationIds.every((id)=>!historicalProps.some((prop)=>prop.id===id)),'stair approaches retain no acquisition furniture, paintings, or pendants');

const keys = new Set((conservatory.doors || []).map((door) => door.key).filter(Boolean));
const spawn = FP.toRuntimePoint(conservatory.spawn);
for (const prop of historicalProps) {
  assert.ok(PROPS.pathToProp(spawn.x, spawn.y, prop.id, keys), `${prop.id} inspection proxy is reachable`);
}

assert.equal(PROPS.pickProp(175, 12, 0, 2.5)?.id, 'acq-foyer-console-01');
assert.equal(PROPS.pickProp(178, 12, 0, 2.5)?.id, 'acq-foyer-horse-head');
assert.equal(PROPS.pickProp(185, 12, 0, 2.5)?.id, 'acq-foyer-console-02');
assert.equal(PROPS.pickProp(188, 12, 0, 2.5)?.id, 'acq-foyer-marble-bust');

const propRenderer = fs.readFileSync('src/render/props3d.js', 'utf8');
const worldRenderer = fs.readFileSync('src/render/r3d.js', 'utf8');
assert.match(propRenderer, /66\*Math\.PI\/180/);
assert.match(propRenderer, /DEPTH_COMPONENT24/);
assert.match(propRenderer, /uShadowTexel/);
assert.match(propRenderer, /alpha\*uBaseAlpha<uAlphaCut/);
assert.match(worldRenderer, /shadowMapSize:\s*RENDER_SCALE\s*<\s*\.75\s*\?\s*512\s*:\s*1024/);
assert.match(worldRenderer, /lamp\s*=.*beam\s*\*\s*propShadow/);
assert.match(worldRenderer, /conservatory-acquisitions\.glb/);

const sideThresholdProp = { mesh: 'door_frame_single', x: 0, z: 0, structural: false };
assert.equal(propInstanceVisible(sideThresholdProp, [-2.99, 0, 0], 35), true);
assert.equal(propInstanceVisible(sideThresholdProp, [-3.01, 0, 0], 35), true);
assert.equal(propInstanceVisible(sideThresholdProp, [-35.01, 0, 0], 35), false);

console.log('acquisition prop contracts passed');

// ── the garden shifts, and only in the way a garden may ──────────────────────
// The atrium garden is never quite as you left it. What it may NOT do is become
// a different obstacle course: the drift writes render offsets only, so colliders,
// interaction points and the pin in the west planter's soil stay authored.
{
  const gardenIds = [
    'academic-garden-planter-west', 'academic-garden-planter-east',
    'academic-garden-tree-west', 'academic-garden-tree-east',
    'academic-garden-leaves-north', 'academic-garden-leaves-south',
  ];
  for (const id of gardenIds) {
    const prop = PROPS.propById(id);
    assert.ok(prop, `${id} is placed`);
    const before = { rx: prop.rx, ry: prop.ry, ix: prop.interactionRx, iy: prop.interactionRy };
    const renderBefore = PROPS.renderInstances().find((entry) => entry.id === id);
    const applied = PROPS.setPropDrift(id, { dx: .21, dz: -.17, dyaw: .06 });
    const renderAfter = PROPS.renderInstances().find((entry) => entry.id === id);
    assert.equal(applied.dx, .21);
    assert.equal(renderAfter.x, renderBefore.x + .21, 'the renderer receives the moved pose');
    assert.equal(renderAfter.z, renderBefore.z - .17);
    assert.equal(prop.rx, before.rx, 'a drift never moves the collider');
    assert.equal(prop.ry, before.ry);
    assert.equal(prop.interactionRx, before.ix, 'nor where you have to stand to use it');
    assert.equal(prop.interactionRy, before.iy);
    assert.ok(Math.abs(prop.renderOffsetX) <= 1 && Math.abs(prop.renderOffsetZ) <= 1,
      'and it stays subtle');
    // Absolute, not cumulative: applying it twice is the same as applying it once.
    const yawOnce = prop.yaw;
    PROPS.setPropDrift(id, { dx: .21, dz: -.17, dyaw: .06 });
    assert.equal(prop.yaw, yawOnce, 'a repeated drift does not compound');
    // And it can be put back exactly.
    PROPS.setPropDrift(id, null);
    assert.equal(prop.renderOffsetX, prop.driftBase.x);
    assert.equal(prop.yaw, prop.driftBase.yaw);
  }
  // The stone the room is built from does not join in.
  for (const fixed of ['academic-garden-basin', 'academic-atrium-structure', 'academic-skylight']) {
    assert.ok(PROPS.propById(fixed), `${fixed} exists and is deliberately not in the drift set`);
    assert.ok(!gardenIds.includes(fixed));
  }
}
