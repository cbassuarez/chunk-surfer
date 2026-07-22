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
assert.equal(historicalProps.length, 34);
assert.equal(acquisitions.length, 33);
assert.equal(new Set(historicalProps.map((prop) => prop.provenance.assetTag)).size, 34);
assert.ok(historicalProps.every((prop) => PROCUREMENT_COHORTS[prop.provenance.cohort]));
assert.ok(acquisitions.every((prop) => !prop.sampleFamily && prop.interaction !== 'play'));

const expectedCohorts = {
  practice_room_contract: 8,
  foyer_suite: 5,
  curatorial_accessions: 3,
  hall_lighting_refit: 2,
  hall_lounge_replacement: 2,
  chapel_foundation_1908: 6,
  services_rewire: 3,
  maintenance_purchase: 2,
  ground_spine_furnishing: 3,
};
for (const [cohort, count] of Object.entries(expectedCohorts)) {
  assert.equal(historicalProps.filter((prop) => prop.provenance.cohort === cohort).length, count, cohort);
}

const practiceChairs = acquisitions.filter((prop) => prop.mesh === 'green_chair_01');
assert.equal(practiceChairs.length, 8);
assert.deepEqual(practiceChairs.map((prop) => prop.provenance.assetTag), ['P/CH-01', 'P/CH-02', 'P/CH-03', 'P/CH-04', 'P/CH-05', 'P/CH-06', 'P/CH-07', 'P/CH-08']);
assert.ok(practiceChairs.some((prop) => prop.x === 61 && prop.y === 76), 'chair 07 remains beneath the violin');

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

const spinePortrait = historicalProps.find((prop) => prop.id === 'ground-spine-large-portrait');
const spineSet = historicalProps.filter((prop) => prop.provenance.cohort === 'ground_spine_furnishing');
assert.equal(spinePortrait.mesh, 'portrait_frame');
assert.ok(spinePortrait.scale >= 2);
assert.equal(spinePortrait.x, 73.75, 'ground-spine painting is on the atrium west wall, not the box-office wall');
assert.equal(spinePortrait.y, 23, 'ground-spine painting is centred on the basement-stair axis');
assert.deepEqual(spineSet.map((prop) => prop.mesh).sort(), ['arm_chair_01', 'arm_chair_01', 'chandelier_03']);
assert.deepEqual(spineSet.filter((prop) => prop.mesh === 'arm_chair_01').map((prop) => prop.y), [21.8, 24.2]);
assert.deepEqual(spineSet.filter((prop) => prop.mesh === 'arm_chair_01').map((prop) => prop.x), [72.85, 72.85]);
assert.ok(spineSet.filter((prop) => prop.mesh === 'arm_chair_01')
  .every((prop) => prop.yaw === Math.PI / 2 && prop.scale === 1.35));
assert.equal(spineSet.find((prop) => prop.mesh === 'chandelier_03').y, 23);
assert.equal(spineSet.find((prop) => prop.mesh === 'chandelier_03').x, 69);

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
