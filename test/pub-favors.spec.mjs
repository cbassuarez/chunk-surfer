import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import { PUB_FAVOR_PROPS, PUB_FAVOR_MESHES, pubFavorFixture } from '../src/data/pub-favors.js';
import { PUB_SERVICE_TRAY } from '../src/data/pub-population.js';
import { PUB_INTERIOR_LAYOUT } from '../src/data/exterior-pub-furnishings.js';
import { pubLocalFromWorld } from '../src/data/exterior-pub.js';
import { BUILDING_AMENITY_PROPS } from '../src/data/building-amenities.js';
import { buildBuildingAmenities } from '../tools/chunk_surfer/building-amenities-geometry.mjs';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';

FP.compile(conservatory.levels, conservatory);
PROPS.propsInit(FP);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`);
const rendered = id => PROPS.renderInstances({ inscriptions: false }).find(p => p.id === id);
const bodyAt = point => ({ x: Math.floor((point.x - .25) * 2), y: Math.floor((point.y - .25) * 2) });
const pack = readFileSync(new URL('../public/assets/pub-quest-props.glb', import.meta.url));
const packJson = JSON.parse(pack.subarray(20, 20 + pack.readUInt32LE(12)).toString().trim());
const bounds = meshName => {
  const mesh = packJson.meshes.find(m => m.name === meshName);
  assert.ok(mesh, `shipped asset contains ${meshName}`);
  const positionAccessors = mesh.primitives.map(p => packJson.accessors[p.attributes.POSITION]);
  return { min: [0, 1, 2].map(a => Math.min(...positionAccessors.map(p => p.min[a]))), max: [0, 1, 2].map(a => Math.max(...positionAccessors.map(p => p.max[a]))) };
};

test('all three interactive objects have one authored home and real nonblocking mesh dimensions', () => {
  assert.equal(PUB_FAVOR_PROPS.length, 3);
  for (const fixture of PUB_FAVOR_PROPS) {
    assert.equal(CONSERVATORY_PROPS.filter(p => p.id === fixture.id).length, 1);
    const prop = PROPS.propById(fixture.id);
    assert.ok(prop, `${fixture.id} survives floor compilation`);
    assert.equal(prop.interactive, true);
    assert.equal(prop.blocks, false);
    assert.equal(PROP_MESH[fixture.mesh], PUB_FAVOR_MESHES[fixture.mesh]);
    const b = bounds(fixture.mesh), dimensions = PUB_FAVOR_MESHES[fixture.mesh];
    assert.ok(b.max[0] - b.min[0] <= dimensions.w + .001);
    assert.ok(b.max[2] - b.min[2] <= dimensions.d + .001);
    assert.ok(b.max[1] - b.min[1] <= dimensions.h + .001);
    assert.equal(prop.action, fixture.id === 'pub-service-tray' ? 'pub-service-tray' : 'pub-favor');
    if (fixture.id !== 'pub-service-tray') assert.equal(prop.pubFavorId, fixture.id.replace('pub-favor-', ''));
  }
  bounds('pub_service_tray_empty');
  assert.equal(pubFavorFixture('missing'), null);
});

test('the service tray rests on the actual counter and targets its public edge', () => {
  const fixture = pubFavorFixture('pub-service-tray'), render = rendered(fixture.id);
  near(render.x, PUB_SERVICE_TRAY.x, 'tray world X');
  near(render.z, PUB_SERVICE_TRAY.y, 'tray world Z');
  near(render.y, .12 + 1.14, 'tray counter height');
  const local = pubLocalFromWorld({ x: render.x, z: render.z });
  const counter = PUB_INTERIOR_LAYOUT.furniture.find(f => f.id === 'pub-counter').bounds;
  const b = bounds(fixture.mesh);
  for (const x of [local.x + b.min[0], local.x + b.max[0]]) assert.ok(x >= counter.x0 && x <= counter.x1);
  for (const z of [local.z + b.min[2], local.z + b.max[2]]) assert.ok(z >= counter.z0 && z <= counter.z1);
  assert.deepEqual(PROPS.propById(fixture.id).renderGroups, ['ground']);
});

test('the opener sits on the dry worktop and clears actual kettle, sink and mug geometry', () => {
  const fixture = pubFavorFixture('pub-favor-opener'), prop = PROPS.propById(fixture.id);
  const host = BUILDING_AMENITY_PROPS.find(p => p.id === fixture.pubSupportId);
  assert.equal(host.id, 'amenity-staff-tea-counter');
  assert.equal(prop.floor, 10);
  assert.deepEqual(prop.renderGroups, ['academic']);
  near(rendered(fixture.id).y, 10.9425, 'opener at worktop');
  const dx = fixture.x - host.x, dz = fixture.y - host.y;
  const local = [dx * Math.cos(-host.yaw) - dz * Math.sin(-host.yaw), .9425, dx * Math.sin(-host.yaw) + dz * Math.cos(-host.yaw)];
  const b = bounds(fixture.mesh);
  const object = { min: b.min.map((v, a) => v + local[a]), max: b.max.map((v, a) => v + local[a]) };
  assert.ok(object.min[0] > -.32 && object.max[0] < 1, 'whole opener lies on dry top, outside sink cutout');
  assert.ok(object.min[2] > -.30 && object.max[2] < .30);
  const parts = [];
  const add = kind => (m, ...args) => { if (m.name === host.mesh) parts.push({ kind, args }); };
  const MAT = Object.fromEntries(['wood', 'black', 'poolBlue', 'ivory', 'paper', 'steel', 'agedWhite', 'cloth', 'navy'].map((id, i) => [id, i]));
  buildBuildingAmenities({ mesh: name => ({ name }), materials: [], MAT, addBox: add('box'), addBeam: add('beam'), addEllipsoid: add('ellipsoid'), addCylinder: add('cylinder'), addQuad: add('quad') });
  const partBounds = part => {
    const a = part.args;
    if (part.kind === 'quad') return { min: [0, 1, 2].map(i => Math.min(...a.slice(0, 4).map(p => p[i]))), max: [0, 1, 2].map(i => Math.max(...a.slice(0, 4).map(p => p[i]))) };
    if (part.kind === 'beam') return { min: [0, 1, 2].map(i => Math.min(a[0][i], a[1][i]) - a[2] / 2), max: [0, 1, 2].map(i => Math.max(a[0][i], a[1][i]) + a[2] / 2) };
    const radius = part.kind === 'cylinder' ? [a[1], a[2] / 2, a[1]] : a[1].map(v => v / 2);
    return { min: a[0].map((v, i) => v - radius[i]), max: a[0].map((v, i) => v + radius[i]) };
  };
  for (const part of parts) {
    const p = partBounds(part);
    const intersects = [0, 1, 2].every(a => object.min[a] < p.max[a] - 1e-6 && object.max[a] > p.min[a] + 1e-6);
    assert.equal(intersects, false, `opener overlaps ${part.kind} ${JSON.stringify(part.args.slice(0, 2))}`);
  }
});

test('the order book sits on the desktop without overlapping the existing phone', () => {
  const fixture = pubFavorFixture('pub-favor-orderbook'), render = rendered(fixture.id);
  const desk = rendered(fixture.pubSupportId), phone = rendered('occupation-box-office-phone');
  assert.ok(desk && phone);
  near(render.y, .53, 'book lies on desktop');
  const b = bounds(fixture.mesh), d = PROP_BOUNDS[desk.mesh], phoneBounds = PROP_BOUNDS[phone.mesh];
  for (const axis of [0, 2]) {
    const key = axis === 0 ? 'x' : 'z';
    assert.ok(render[key] + b.min[axis] >= desk[key] + d.min[axis]);
    assert.ok(render[key] + b.max[axis] <= desk[key] + d.max[axis]);
  }
  const phoneFront = phone.z - Math.abs(phoneBounds.min[0]) * Math.sin(phone.yaw) - Math.abs(phoneBounds.min[2]) * Math.cos(phone.yaw);
  assert.ok(render.z + b.max[2] < phoneFront - .04, 'book clears phone by more than40mm');
  assert.deepEqual(PROPS.propById(fixture.id).renderGroups, ['ground']);
});

test('each pickup is addressable from an unblocked body position on its own floor', () => {
  for (const fixture of PUB_FAVOR_PROPS) {
    const p = PROPS.propById(fixture.id), at = bodyAt(fixture.pubApproachAt);
    assert.equal(FP.isSolid(at.x, at.y), false, fixture.id);
    assert.equal(PROPS.propCanOccupy(at.x, at.y), true, fixture.id);
    near(FP.floorAt(at.x, at.y), p.floor, `${fixture.id} approach floor`);
    const x = (at.x + .5) * .5, y = (at.y + .5) * .5;
    const dx = p.interactionX - x, dy = p.interactionY - y;
    const yaw = Math.atan2(dx, -dy), pitch = Math.atan2(p.floor + p.elevation + p.h / 2 - (p.floor + 1.58), Math.hypot(dx, dy));
    assert.equal(PROPS.pickProp(at.x, at.y, 0, 2, { yaw, pitch })?.id, fixture.id, `${fixture.id} actual reticle target`);
  }
});

test('removal and authored restoration preserve each exact home without duplicate loose props', () => {
  for (const fixture of PUB_FAVOR_PROPS) {
    const before = rendered(fixture.id);
    PROPS.setLooseProp(fixture.id, null);
    assert.equal(PROPS.propById(fixture.id), null);
    const restored = PROPS.restoreAuthoredProp(fixture.id);
    assert.ok(restored);
    assert.deepEqual(rendered(fixture.id), before);
    assert.equal(PROPS.restoreAuthoredProp(fixture.id), restored);
    assert.equal(PROPS.allProps().filter(p => p.id === fixture.id).length, 1);
  }
});
