import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CELL, OUTDOOR_ZONES, ZONE, isOutdoorZone } from '../src/data/floorplan/legend.js';
import {
  EXTERIOR_ROOF_ARCHITECTURE_IDS,
  EXTERIOR_ROOFLINE_MESH,
  EXTERIOR_ROOFLINE_PACK,
  exteriorRoofArchitectureInstances,
  exteriorRooflineInstance,
} from '../src/data/exterior-roofline.js';
import { shouldHideCrossEnvelopeProp, worldPropVisibilityKey } from '../src/game/prop-visibility.js';
import { propInstanceVisible } from '../src/render/props3d.js';
import { applyInstitutionPosters } from '../src/data/institution-poster-sites.js';
import { hallChandelierInstances, HALL_CHANDELIER_TREATMENT } from '../src/data/hall-chandelier-treatment.js';
import { parseGlb } from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';

FP.compile(conservatory.levels, conservatory);
PROPS.propsInit(FP);
const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const roofHosts = PROPS.renderInstances({ group: 'academicRoof', inscriptions: false });
const roofIds = new Set(roofHosts.map(instance => instance.id));
const architectureIds = new Set(EXTERIOR_ROOF_ARCHITECTURE_IDS);
const closureId = 'ellery-west-roofline-closure';

// Run the production function itself, rather than a second implementation of
// its selection/filter. Unrelated chapter state, character animation, windows,
// and door leaves are inert; the real compiled prop store, grouping, inscription
// attachment, and cross-envelope visibility still run. This is CPU integration
// evidence, not a substitute for the final native depth/dither inspection.
const functionSource = source.slice(
  source.indexOf('function worldRenderInstances(group=null){'),
  source.indexOf('\nfunction usingSourceSpace(){'),
).trim();
assert.ok(functionSource.startsWith('function worldRenderInstances('));
assert.ok(functionSource.endsWith('}'));
function worldFor(zone, group = 'ground') {
  const scope = {
    usingSourceSpace: () => false,
    usingStairAnomaly: () => false,
    syncArchitecturalLocalLights: () => {},
    chapelTowerState: () => ({ phase: 'inactive', tenorRopeTaken: false }),
    CHAPEL_TOWER_PHASE: { TOWER_CLEARED: 'cleared', CHAPEL_FINAL: 'final', TOWER_ACTIVE: 'active' },
    currentNatatoriumWaterRun: () => null,
    FP: { ...FP, zoneAt: () => zone, logicalToPhysical: () => ({ x: 0, z: 0, y: 0 }) },
    px: 0, py: 0, CELL, PROPS, isOutdoorZone, applyInstitutionPosters,
    hallChandelierInstances, hallChandelierRendered: [{ id: 'stale-hall-fixture' }],
    exteriorRoofArchitectureInstances, exteriorRooflineInstance, worldPropVisibilityKey,
    renderedWorldPropVisibilityKey: '',
    PUB_NEW_ACTORS: [], streetCrowdRenderReady: false,
    roofRenMemoryFoldActive: false, activeEndingCutscene: null,
    ENDING_VARIANT: { CENTURY_STAY: 'century-stay' },
    roofRenState: () => ({ cabinetOpened: false, stage: 'unmet' }),
    KEY_CABINET_RING: { 'C-17': { id: 'test-key-ring' } },
    playerKeys: new Set(), flagTest: () => false,
    hideStaticTowerRope: () => false, boothPresentationPose: 'waiting',
    openingVehicleScene: null, brendanFinale: () => null,
    hiddenCrossEnvelopeProp: instance => shouldHideCrossEnvelopeProp(instance, { observerZone: zone }),
    waterBodies: [], pubHospitalityInstance: instance => instance, R3: {},
    vigilCharacterIdForMesh: () => null,
    pubActor: () => null, boothGuardRenderInstance: instance => instance,
    worldPaperIndex: () => -1, storyGuidanceEmissive: (_instance, base) => base,
    propEmissive: () => null, pubHospitalityRendered: [],
    buildingWindowForObserver: () => null, doorRenderInstances: () => [],
  };
  const result = new Function('scope', `with(scope){return (${functionSource});}`)(scope)(group);
  assert.equal(scope.renderedWorldPropVisibilityKey, worldPropVisibilityKey({ group, zone }),
    'production submission records the context consumed by the frame cache');
  assert.deepEqual(scope.hallChandelierRendered, group === 'hall' ? result.filter(instance => instance.practicalFixture) : [],
    'only an actual Hall submission retains practical fixtures for the Hall light owner');
  return result;
}

test('production Hall submission fits both real chandeliers and their supports through the shared adapter', () => {
  const world = worldFor(ZONE.hall, 'hall');
  assert.deepEqual(world.filter(instance => instance.practicalFixture).map(instance => instance.id).sort(),
    [...HALL_CHANDELIER_TREATMENT.fixtureIds].sort());
  for (const id of HALL_CHANDELIER_TREATMENT.fixtureIds) {
    assert.equal(world.filter(instance => instance.id === `${id}:support`).length, 1);
    assert.equal(world.find(instance => instance.id === id).practicalEmissiveScale, 0, 'static submission cannot invent a lit episode');
  }
});

test('production ground composition retains exactly the three static roof constructions in every outdoor zone', () => {
  const ground = PROPS.renderInstances({ group: 'ground', inscriptions: false });
  assert.ok(EXTERIOR_ROOF_ARCHITECTURE_IDS.every(id => !ground.some(instance => instance.id === id)),
    'the ordinary ground group must retain the original missing-roof regression fixture');
  assert.deepEqual(roofHosts.filter(instance => architectureIds.has(instance.id)).map(instance => instance.id),
    EXTERIOR_ROOF_ARCHITECTURE_IDS, 'select real roof props, not synthetic whitelist fixtures');

  for (const zone of OUTDOOR_ZONES) {
    const world = worldFor(zone);
    const selected = world.filter(instance => roofIds.has(instance.id));
    assert.deepEqual(selected.map(instance => instance.id), EXTERIOR_ROOF_ARCHITECTURE_IDS, `outdoor zone ${zone}`);
    for (const instance of selected) {
      const actual = roofHosts.find(host => host.id === instance.id);
      assert.equal(instance.structural, true);
      for (const key of ['mesh', 'x', 'y', 'z', 'yaw', 'scale', 'zone']) assert.equal(instance[key], actual[key]);
      assert.equal(shouldHideCrossEnvelopeProp(actual, { observerZone: zone }), false,
        `${instance.id} must survive the actual exterior envelope filter in zone ${zone}`);
      assert.equal(world.filter(candidate => candidate.id === instance.id).length, 1);
    }
  }
});

test('production ground composition never promotes roof actors, seats, shortcuts, or collectibles', () => {
  const roofOnly = roofHosts.filter(instance => !architectureIds.has(instance.id));
  assert.ok(roofOnly.some(instance => instance.id === 'roof-ren'), 'real actor fixture must exist');
  assert.ok(roofOnly.some(instance => instance.id === 'roof-shortcut-top'), 'real chapter interaction must exist');
  for (const zone of OUTDOOR_ZONES) {
    const ids = new Set(worldFor(zone).map(instance => instance.id));
    for (const instance of roofOnly) assert.equal(ids.has(instance.id), false, `${instance.id} leaked into ground zone ${zone}`);
    for (const id of ['academic-roof-home-cassette', 'academic-roof-effects-index', 'academic-roof-pressure-pad']) {
      assert.equal(ids.has(id), false, `${id} is not exterior scenery`);
    }
  }

  // An academic-roof-looking prefix or height must not become a ground-view
  // exemption. Exact static IDs, rather than an open prefix, define this repair.
  for (const zone of OUTDOOR_ZONES.filter(zone => zone !== ZONE.academicRoof)) {
    for (const id of ['roof-ren', 'academic-roof-home-cassette', 'academic-roof-structure-decoy']) {
      assert.equal(shouldHideCrossEnvelopeProp({ id, mesh: 'unknown_roof_prop', x: 70, z: 30, y: 19 },
        { observerZone: zone }), true, `${id} incorrectly bypassed the ${zone} ground envelope`);
    }
  }
});

test('the real roof-closure mesh is selected, depth-capable, and within outdoor prop reach', () => {
  const pack = parseGlb(fs.readFileSync(new URL('../public' + EXTERIOR_ROOFLINE_PACK, import.meta.url)));
  const mesh = pack.json.meshes.find(mesh => mesh.name === EXTERIOR_ROOFLINE_MESH);
  assert.ok(mesh && mesh.primitives.length, 'the selected closure resolves to built physical geometry');
  assert.ok(mesh.primitives.every(primitive => pack.json.accessors[primitive.attributes.POSITION].count >= 3
    && pack.json.accessors[primitive.indices].count >= 3));
  for (const material of pack.json.materials) assert.ok(!material.alphaMode || material.alphaMode === 'OPAQUE');

  for (const zone of OUTDOOR_ZONES) {
    const matches = worldFor(zone).filter(instance => instance.id === closureId);
    assert.equal(matches.length, 1, `closure selected once in zone ${zone}`);
    const instance = matches[0];
    assert.equal(instance.mesh, mesh.name);
    assert.equal(instance.skyExposed, true);
    assert.equal(shouldHideCrossEnvelopeProp(instance, { observerZone: zone }), false);
    for (const eye of [[41, 1.62, 55], [133, 1.62, 82], [50, 1.62, 103]]) {
      assert.equal(propInstanceVisible(instance, eye), true, `closure culled at ${eye}`);
    }
  }
});

test('interior and unrelated render groups do not gain imported roof construction or closure', () => {
  for (const zone of [ZONE.getIn, ZONE.foyer, ZONE.hall, ZONE.academic, ZONE.church, ZONE.pub, ZONE.stationers]) {
    const selected = worldFor(zone);
    assert.equal(selected.some(instance => architectureIds.has(instance.id) || instance.id === closureId), false,
      `ground render imports a roof into indoor zone ${zone}`);
  }
  for (const zone of OUTDOOR_ZONES) {
    for (const group of ['stair', 'academic', 'chapel', null]) {
      assert.deepEqual(exteriorRoofArchitectureInstances(roofHosts, { zone, group }), []);
      assert.equal(exteriorRooflineInstance({ zone, group }), null);
    }
    const stair = worldFor(zone, 'stair');
    assert.equal(stair.some(instance => architectureIds.has(instance.id) || instance.id === closureId), false);
  }
});

test('ordinary occupied roof rendering keeps its own actors and deduplicates the retained ground shell', () => {
  const world = worldFor(ZONE.academicRoof, 'academicRoof');
  assert.ok(world.some(instance => instance.id === 'roof-ren'), 'repair must not remove the actual roof encounter');
  assert.ok(world.some(instance => instance.id === closureId));
  for (const id of EXTERIOR_ROOF_ARCHITECTURE_IDS) assert.equal(world.filter(instance => instance.id === id).length, 1);
});

test('production loader and mesh sky lighting reference the authored roof closure and outdoor contract', () => {
  const r3d = fs.readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const props3d = fs.readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
  assert.match(r3d, /import\s*\{\s*EXTERIOR_ROOFLINE_PACK\s*\}\s*from\s*['"]\.\.\/data\/exterior-roofline\.js['"]/);
  assert.ok(/\.then\(\(\)=>P3\.addPropPack\(assetUrl\(EXTERIOR_ROOFLINE_PACK\)\)/.test(r3d),
    'closure pack must enter the shared prop catalog after the base pack, not an isolated renderer');
  assert.ok(r3d.indexOf('basePropPackLoad=P3.loadPropPack(') < r3d.indexOf('P3.addPropPack(assetUrl(EXTERIOR_ROOFLINE_PACK))'));
  assert.ok(/OUTDOOR_ZONES\.map\(zone=>`vZone==\$\{zone\}`\)\.join\('\|\|'\)/.test(props3d),
    'sky eligibility must derive from all current exterior zones, including service yard and occupied roof');
});

test('a rejected optional roof-closure decode does not abort subsequent building packs', async () => {
  const r3d = fs.readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const start = r3d.indexOf('.then(()=>P3.addPropPack(assetUrl(EXTERIOR_ROOFLINE_PACK))');
  const end = r3d.indexOf('.then(()=>P3.addPropPack(assetUrl(EXTERIOR_STATIONERS_PACK))', start);
  assert.ok(start >= 0 && end > start);
  const loadRoof = new Function('P3', 'assetUrl', 'EXTERIOR_ROOFLINE_PACK', 'console',
    `return Promise.resolve()${r3d.slice(start, end).trim()};`);
  for (const failed of [false, true]) {
    const attempted = [], warnings = [];
    let nextPackReached = false;
    await loadRoof({ addPropPack(path) {
      attempted.push(path);
      return failed ? Promise.reject(new Error('test unavailable roof closure')) : Promise.resolve();
    } }, path => path, EXTERIOR_ROOFLINE_PACK, { warn: (...args) => warnings.push(args) })
      .then(() => { nextPackReached = true; });
    assert.deepEqual(attempted, [EXTERIOR_ROOFLINE_PACK]);
    assert.equal(nextPackReached, true, 'opening street, doors and main stair must remain loadable');
    assert.equal(warnings.length, failed ? 1 : 0);
  }
});
