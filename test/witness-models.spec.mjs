import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsTransmission, KHRMaterialsIOR, KHRMaterialsVolume } from '@gltf-transform/extensions';
import * as THREE from 'three';
import { VAN_KIT_MODELS, WITNESS_MODELS, vanKitModel } from '../src/data/van-kit-models.js';
import { WITNESS_DESIGN, WITNESS_BOARDS, WITNESS_COMPONENTS, WITNESS_CONNECTORS,
  WITNESS_WIRES, WITNESS_TRACES, WITNESS_MOUNTS, WITNESS_SWITCHES, WITNESS_SERVICE_STRIP } from '../src/data/witness-assembly.js';
import { ENDING_IDS } from '../src/progression/schema.js';
import { freshFieldKit, resolveFieldKit } from '../src/game/field-kit.js';
import { vanWorkbenchModelIds } from '../src/render/van-workbench-stage.js';

const io = new NodeIO().registerExtensions([KHRMaterialsTransmission, KHRMaterialsIOR, KHRMaterialsVolume]);
const documents = new Map();
const load = id => {
  if (!documents.has(id)) documents.set(id, io.read(`public/${vanKitModel(id).model}`));
  return documents.get(id);
};
const find = (doc, name) => doc.getRoot().listNodes().find(node => node.getName() === name);
const named = (doc, name) => doc.getRoot().listNodes().filter(node => node.getName() === name);
const rootOf = doc => doc.getRoot().listScenes()[0].listChildren()[0];
const primitives = node => node.getMesh()?.listPrimitives() || [];
const material = node => primitives(node)[0]?.getMaterial();
const descendants = node => [node, ...node.listChildren().flatMap(descendants)];
const localMatrix = (doc, node) => new THREE.Matrix4().fromArray(rootOf(doc).getWorldMatrix()).invert()
  .multiply(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
const unit = 1 / 300;
const point = (x, y, depth = 0) => new THREE.Vector3((x - WITNESS_DESIGN.width / 2) * unit,
  (WITNESS_DESIGN.height / 2 - y) * unit, .232 - depth * unit);

function vertices(node, transform = new THREE.Matrix4()) {
  return primitives(node).flatMap(primitive => {
    const p = primitive.getAttribute('POSITION');
    return Array.from({ length: p.getCount() }, (_, i) => new THREE.Vector3(...p.getElement(i, [])).applyMatrix4(transform));
  });
}
function triangles(node, transform = new THREE.Matrix4()) {
  return primitives(node).flatMap(primitive => {
    const p = primitive.getAttribute('POSITION'), indices = primitive.getIndices();
    const length = indices?.getCount() ?? p.getCount(), result = [];
    for (let i = 0; i < length; i += 3) result.push([0, 1, 2].map(j => new THREE.Vector3(
      ...p.getElement(indices ? indices.getScalar(i + j) : i + j, [])).applyMatrix4(transform)));
    return result;
  });
}
function rayHits(doc, x, y, include = () => true) {
  const origin = point(x, y); origin.z = 1;
  const ray = new THREE.Ray(origin, new THREE.Vector3(0, 0, -1)), target = new THREE.Vector3(), hits = [];
  for (const node of doc.getRoot().listNodes()) if (node.getMesh() && include(node)) {
    for (const triangle of triangles(node, localMatrix(doc, node))) {
      if (ray.intersectTriangle(...triangle, false, target)) hits.push({ node, z: target.z });
    }
  }
  return hits.sort((a, b) => b.z - a.z);
}

test('Witness ships two distinct original GLBs without replacing the eight ordinary kit assets', async () => {
  assert.equal(Object.keys(VAN_KIT_MODELS).length, 8);
  assert.deepEqual(Object.keys(WITNESS_MODELS).sort(), [WITNESS_DESIGN.model, WITNESS_DESIGN.plateModel].sort());
  const hashes = new Set();
  for (const spec of Object.values(WITNESS_MODELS)) {
    assert.equal(vanKitModel(spec.id), spec); assert.ok(!VAN_KIT_MODELS[spec.id]);
    const path = `public/${spec.model}`, bytes = await readFile(path), doc = await load(spec.id);
    assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'binary glTF magic');
    assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
    assert.ok((await stat(path)).size < 2_000_000, `${spec.id}: inspection asset budget`);
    const root = rootOf(doc), extras = root.getExtras(), bounds = new THREE.Box3();
    assert.equal(root.getName(), spec.id); assert.equal(extras.origin, 'floor-center'); assert.equal(extras.up, 'Y');
    assert.equal(extras.authorship, 'Original AUDIOCORP field-kit geometry');
    let triangleCount = 0;
    for (const node of doc.getRoot().listNodes()) {
      assert.ok(node.getWorldMatrix().every(Number.isFinite), `${node.getName()}: finite transform`);
      for (const primitive of primitives(node)) {
        const p = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL'), indices = primitive.getIndices();
        assert.ok(p?.getCount() > 0 && normals?.getCount() === p.getCount());
        assert.ok(p.getArray().every(Number.isFinite)); assert.ok(normals.getArray().every(Number.isFinite));
        assert.ok(primitive.getMaterial(), `${node.getName()}: material is present`);
        const length = indices?.getCount() ?? p.getCount(); assert.equal(length % 3, 0); triangleCount += length / 3;
        if (indices) for (const index of indices.getArray()) assert.ok(index >= 0 && index < p.getCount());
      }
      for (const vertex of vertices(node, new THREE.Matrix4().fromArray(node.getWorldMatrix()))) bounds.expandByPoint(vertex);
    }
    assert.equal(extras.triangles, triangleCount);
    assert.ok(Math.abs(bounds.min.y) < 1e-5, `${spec.id}: rests on floor`);
    assert.ok(Math.abs(bounds.min.x + bounds.max.x) < 1e-5 && Math.abs(bounds.min.z + bounds.max.z) < 1e-5,
      `${spec.id}: centered in X/Z`);
    assert.ok(bounds.getSize(new THREE.Vector3()).toArray().every(n => n > 0 && n < 4));
  }
  hashes.add(createHash('sha256').update(await readFile(`public/${VAN_KIT_MODELS['field-recorder'].model}`)).digest('hex'));
  assert.equal(hashes.size, 3, 'the two new models are not aliases or copies of the standard recorder');
});

test('the fitted finish selects the new recorder model without replacing any other kit object', () => {
  const kit = freshFieldKit(), ordinary = vanWorkbenchModelIds(kit);
  assert.equal(ordinary.recorder, 'field-recorder');
  kit.headphones = 'closed'; kit.microphone = 'directional'; kit.recorder = 'headroom';
  kit.cosmetics = { faceplate: 'witness', buttons: 'signal', vfd: 'amber' };
  const owned = resolveFieldKit(kit, { endingsSeen: ['helped', 'surfaced'] });
  const ids = vanWorkbenchModelIds(owned);
  assert.equal(ids.recorder, WITNESS_DESIGN.model);
  assert.equal(ids.headphones, 'headphones-closed'); assert.equal(ids.microphone, 'microphone-directional');
  for (const slot of ['case', 'map', 'radio', 'light']) assert.equal(ids[slot], ordinary[slot]);
  assert.equal(vanWorkbenchModelIds(resolveFieldKit(kit, { endingsSeen: ['helped'] })).recorder, 'field-recorder',
    'ownership-resolved kit never selects a locked clear recorder');
  kit.cosmetics.faceplate = 'olive'; assert.equal(vanWorkbenchModelIds(kit).recorder, 'field-recorder');
});

test('clear polymer uses physical transmission, acrylic IOR, thickness and absorption rather than ghost opacity', async () => {
  for (const id of Object.keys(WITNESS_MODELS)) {
    const doc = await load(id), polymer = doc.getRoot().listMaterials().find(entry => entry.getName() === 'witness-polymer');
    assert.ok(polymer); assert.equal(polymer.getAlphaMode(), 'OPAQUE'); assert.equal(polymer.getBaseColorFactor()[3], 1);
    assert.equal(polymer.getMetallicFactor(), 0); assert.ok(polymer.getRoughnessFactor() > 0 && polymer.getRoughnessFactor() < .05,
      'polished clear shell, not a frosted layer hiding the board');
    const transmission = polymer.getExtension('KHR_materials_transmission');
    const ior = polymer.getExtension('KHR_materials_ior'), volume = polymer.getExtension('KHR_materials_volume');
    assert.ok(transmission && ior && volume);
    assert.ok(transmission.getTransmissionFactor() >= .95 && transmission.getTransmissionFactor() <= 1,
      'near-clear polymer preserves the authored interior');
    assert.ok(Math.abs(ior.getIOR() - 1.49) < .005);
    assert.ok(volume.getThicknessFactor() >= .02 && volume.getThicknessFactor() <= .04);
    assert.ok(volume.getAttenuationDistance() > 0 && Number.isFinite(volume.getAttenuationDistance()));
    const tint = volume.getAttenuationColor(); assert.ok(tint[0] > tint[2] && tint.every(n => n > .5 && n <= 1));
    const name = id === WITNESS_DESIGN.model ? 'recorder-faceplate-with-optical-aperture' : 'replacement-clear-faceplate';
    const plate = find(doc, name); assert.equal(material(plate), polymer);
    const bounds = new THREE.Box3().setFromPoints(vertices(plate));
    assert.ok(bounds.max.z - bounds.min.z >= volume.getThicknessFactor(), 'clear plate has modeled side walls and bevels');
  }
});

test('recorder internals match the shared boards, components, connectors, traces and harness endpoints', async () => {
  const doc = await load(WITNESS_DESIGN.model), nodes = doc.getRoot().listNodes();
  const manifestParts = [...WITNESS_BOARDS, ...WITNESS_COMPONENTS, ...WITNESS_CONNECTORS, ...WITNESS_WIRES, ...WITNESS_SWITCHES.map(sw => ({ id: sw.part }))];
  assert.deepEqual(nodes.filter(node => node.getName().startsWith('witness-part:')).map(node => node.getName()).sort(),
    manifestParts.map(part => `witness-part:${part.id}`).sort());
  for (const part of manifestParts) assert.ok(descendants(find(doc, `witness-part:${part.id}`)).some(node => node.getMesh()), part.id);
  for (const [i] of WITNESS_TRACES.entries()) assert.ok(find(doc, `witness-trace:${i + 1}`));
  assert.equal(nodes.filter(node => node.getName().startsWith('witness-trace:')).length, WITNESS_TRACES.length);
  for (const connector of WITNESS_CONNECTORS) {
    const part = find(doc, `witness-part:${connector.id}`), contacts = descendants(part).filter(node => node.getName().startsWith('connector-contact:'));
    assert.equal(contacts.length, connector.pins);
    for (let i = 0; i < connector.pins; i++) assert.ok(contacts.some(node => node.getName() === `connector-contact:${connector.id}:${i + 1}`));
  }
  for (const wire of WITNESS_WIRES) {
    const part = find(doc, `witness-part:${wire.id}`), harness = part.listChildren().find(node => node.getName() === `harness:${wire.from}:${wire.to}`);
    assert.ok(harness); assert.equal(material(harness).getName(), `witness-${wire.color}`);
    const positions = vertices(harness, localMatrix(doc, harness));
    for (const [connectorId, index] of [[wire.from, 0], [wire.to, wire.points.length - 1]]) {
      const connector = WITNESS_CONNECTORS.find(entry => entry.id === connectorId);
      assert.ok(connector); assert.deepEqual(wire.points[index], [connector.x, connector.y]);
      const endpoint = point(connector.x, connector.y, 16);
      assert.ok(positions.some(vertex => vertex.distanceTo(endpoint) < wire.radius * unit * 1.1), `${wire.id}: physical tube reaches ${connectorId}`);
    }
    assert.equal(part.listChildren().filter(node => node.getName() === 'harness-retainer').length, 2);
  }
  assert.equal(named(doc, 'witness-threaded-insert').length, WITNESS_MOUNTS.length);
});

test('real PCB sightlines remain open through clear plate; no opaque main body hides the assembly', async () => {
  const doc = await load(WITNESS_DESIGN.model);
  assert.ok(!find(doc, 'recorder-diecast-body'));
  for (const name of ['witness-rear-chassis-floor', 'witness-open-chassis-side', 'witness-open-chassis-crossmember']) assert.ok(find(doc, name));
  const opaque = node => {
    const mat = material(node);
    return mat && mat.getAlphaMode() === 'OPAQUE' && !(mat.getExtension('KHR_materials_transmission')?.getTransmissionFactor() > 0);
  };
  for (const [x, y, boardId] of [[280, 38, 'PCB-A'], [420, 38, 'PCB-A'], [565, 38, 'PCB-A'],
    [120, 374, 'PCB-B'], [420, 326, 'PCB-B'], [590, 326, 'PCB-B']]) {
    const hit = rayHits(doc, x, y, opaque)[0];
    assert.equal(hit?.node.getName(), 'laminated-PCB', `${x},${y}: clear region must reveal its PCB, not an opaque shell`);
    assert.ok(descendants(find(doc, `witness-part:${boardId}`)).includes(hit.node));
    assert.ok(hit.z < .232 - .025 / 2, 'board sits physically behind the clear front');
  }
  const well = find(doc, 'recorder-dark-optical-well'), substrate = find(doc, 'recorder-display-substrate'), glass = find(doc, 'recorder-front-cover-glass');
  assert.equal(material(well).getAlphaMode(), 'OPAQUE', 'the VFD is not a hole through to the world');
  assert.ok(primitives(substrate)[0].getAttribute('TEXCOORD_0'), 'live VFD texture has an actual substrate');
  const z = node => new THREE.Vector3().setFromMatrixPosition(localMatrix(doc, node)).z;
  assert.ok(z(well) < z(substrate) && z(substrate) < z(glass), 'separate dark well, electrodes, and front cover');
});

test('transport caps, printing and lamps travel together above independently modeled switch stems', async () => {
  const doc = await load(WITNESS_DESIGN.model);
  for (const sw of WITNESS_SWITCHES) {
    const label = sw.id.toUpperCase(), actuator = find(doc, `transport-${label}-actuator`);
    assert.ok(actuator); assert.equal(actuator.getMesh(), null, 'animation target is an assembly, not just a colored cap');
    const moving = descendants(actuator), cap = find(doc, `transport-${label}-cap`);
    for (const name of [`transport-${label}-cap`, `transport-${label}-lamp`, `etched-legend:${label}`]) {
      assert.ok(moving.some(node => node.getName() === name), `${label}: ${name} follows physical key travel`);
    }
    for (const name of [`transport-${label}-socket`, `transport-${label}-bezel`]) {
      const fixed = find(doc, name); assert.ok(fixed); assert.ok(!moving.includes(fixed), `${label}: mounting hardware stays fixed`);
    }
    const stem = find(doc, `witness-stem:${sw.id}`), switchPart = find(doc, `witness-part:${sw.part}`);
    assert.ok(stem && descendants(switchPart).includes(stem));
    for (const name of ['visible-switch-plunger', 'actuator-foot']) assert.ok(stem.listChildren().some(node => node.getName() === name));
    const capPosition = new THREE.Vector3().setFromMatrixPosition(localMatrix(doc, cap));
    const stemPosition = new THREE.Vector3().setFromMatrixPosition(localMatrix(doc, stem));
    assert.ok(Math.abs(capPosition.x - stemPosition.x) < 1e-7, `${label}: stem is aligned with its own key`);
    assert.ok(stemPosition.z < capPosition.z, `${label}: plunger sits behind the plastic cap`);
  }
  const plate = find(doc, 'recorder-faceplate-with-optical-aperture');
  const plateBounds = new THREE.Box3().setFromPoints(vertices(plate, localMatrix(doc, plate)));
  const legend = find(doc, 'etched-legend:WITNESS EDITION');
  assert.ok(new THREE.Vector3().setFromMatrixPosition(localMatrix(doc, legend)).z < (plateBounds.min.z + plateBounds.max.z) / 2,
    'edition printing lies in the underside half of the clear polymer, not floating on its front');
});

test('replacement is an independently modeled sleeved faceplate with real screen and switch apertures', async () => {
  const doc = await load(WITNESS_DESIGN.plateModel), plate = find(doc, 'replacement-clear-faceplate');
  for (const name of ['protective-service-sleeve', 'acid-free-support-card', 'heat-sealed-sleeve-edge']) assert.ok(find(doc, name));
  assert.ok(!doc.getRoot().listNodes().some(node => node.getName().startsWith('witness-part:')),
    'replacement plate is not a second complete recorder');
  const ray = new THREE.Ray(), target = new THREE.Vector3(), faceTriangles = triangles(plate);
  for (const [x, y] of [[368, 195.5], ...WITNESS_SWITCHES.map(sw => [sw.x, sw.y])]) {
    ray.set(new THREE.Vector3((x - 368) * unit, (202.5 - y) * unit, 1), new THREE.Vector3(0, 0, -1));
    assert.ok(!faceTriangles.some(triangle => ray.intersectTriangle(...triangle, false, target)), `${x},${y}: actual opening, not painted transparency`);
  }
  assert.ok(find(doc, 'etched-legend:WITNESS EDITION')); assert.ok(find(doc, 'etched-legend:FIT AT VAN'));
});

test('each earned ending has a separate switchable physical service stamp within the internal strip', async () => {
  const doc = await load(WITNESS_DESIGN.model), stamps = doc.getRoot().listNodes().filter(node => node.getName().startsWith('witness-ending:'));
  assert.deepEqual(stamps.map(node => node.getName()).sort(), ENDING_IDS.map(id => `witness-ending:${id}`).sort());
  const strip = find(doc, 'witness-service-strip'); assert.ok(strip);
  const centers = new Set(), s = WITNESS_SERVICE_STRIP;
  for (const stamp of stamps) {
    assert.ok(!stamp.getMesh(), 'stamp group can be hidden independently at runtime');
    assert.ok(stamp.listChildren().some(node => node.getName() === 'earned-service-stamp'));
    assert.ok(stamp.listChildren().some(node => node.getName() === 'stamp-mark'));
    const p = new THREE.Vector3().setFromMatrixPosition(localMatrix(doc, stamp));
    const x = p.x / unit + 368, y = 202.5 - p.y / unit;
    assert.ok(x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h, stamp.getName());
    centers.add(p.toArray().join(','));
  }
  assert.equal(centers.size, ENDING_IDS.length, 'marks do not overlap into one repeated medal');
});
