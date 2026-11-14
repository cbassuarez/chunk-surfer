// These are retained originals, not a second inventory or combat authority.
// Geometry remains metric and the existing anatomical palm supports each find.
import * as THREE from 'three';
import { DOOR_WEDGE_GEOMETRY } from '../data/door-wedge.js';
import { BOX_CRADLE } from './battle-hand-box-grips.js';
import { assetUrl } from '../platform/paths.js';
import { sourceRecordingCassetteGeometry, sourceRecordingCassetteIdentity } from './source-recording-cassette-model.js';
import { sourceRecordingCassetteMeshPayload, sourceRecordingCassetteLabelBitmap } from './source-recording-cassette.js';

export const RETAINED_HELD_MODELS = Object.freeze({
  'ren-home-cassette': { asset: 'assets/items/ren-home-cassette.glb', incline: .55 },
  'b3-session-card': { residentMesh: 'b3_session_card', incline: .55 },
  'vale-guarantor-slip': { residentMesh: 'loose_note', incline: .55 },
  'marble-eyes': { asset: 'assets/items/marble-eyes.glb', incline: .55 },
  'music-box': { asset: 'assets/items/lyle-music-box.glb', incline: 0 },
  'recording-cassette': { manufactured: true, incline: .55 },
  'door-wedge': { manufactured: true, incline: .55 },
});
const templates = new Map(), pending = new Map();
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
export const isRetainedHeldModel = id => own(RETAINED_HELD_MODELS, id);
export const retainedHeldItemReady = id => !!RETAINED_HELD_MODELS[id]?.manufactured || templates.has(id);

// Only textureless retained entries use the native receiver arrays. The coastal
// keepsake's photograph and damaged coating must instead retain its GLTF maps.
export function retainedPropTemplate(entry) {
  if (!entry?.primitives?.length) return null;
  const group = new THREE.Group(); group.name = `retained source: ${entry.name}`;
  for (const primitive of entry.primitives) {
    const data = primitive.nativeReceiverGeometry;
    if (!data?.positions || !data?.indices || primitive.texture || primitive.normalTexture || primitive.ormTexture)
      throw new Error(`Cannot copy ${entry.name}: complete retained material unavailable.`);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions), 3));
    if (data.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normals), 3));
    else geometry.computeVertexNormals();
    if (data.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uvs), 2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(data.indices), 1));
    const base = primitive.base || [1, 1, 1, 1];
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(...base.slice(0, 3)), roughness: primitive.roughness ?? 1,
      metalness: primitive.metallic ?? 0, emissive: new THREE.Color().setRGB(...(primitive.emissive || [0, 0, 0])),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = primitive.materialName || entry.name;
    group.add(mesh);
  }
  if (entry.nodeMatrix) group.applyMatrix4(new THREE.Matrix4().fromArray(entry.nodeMatrix));
  group.updateMatrixWorld(true); return group;
}

// Keep the original BIN/accessors/materials/textures byte for byte. Only scene
// reachability is narrowed so a 54 mm keepsake does not parse a whole coast.
export function subsetRetainedGLB(buffer, meshNames) {
  const input = new DataView(buffer), chunks = []; let json;
  if (input.getUint32(0, true) !== 0x46546c67) throw new Error('Retained asset is not GLB.');
  for (let at = 12; at < buffer.byteLength;) {
    const length = input.getUint32(at, true), type = input.getUint32(at + 4, true);
    const bytes = new Uint8Array(buffer, at + 8, length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(bytes));
    else chunks.push({ type, bytes });
    at += length + 8;
  }
  if (!json) throw new Error('Retained GLB has no scene JSON.');
  const wanted = new Set(meshNames), selected = new Set();
  for (const [i, node] of (json.nodes || []).entries())
    if (wanted.has(json.meshes?.[node.mesh]?.name)) selected.add(i);
  if (!selected.size) throw new Error('The exact retained mesh is absent.');
  const live = new Set();
  const visit = index => {
    const node = json.nodes[index], children = (node.children || []).filter(visit);
    if (selected.has(index) || children.length) { live.add(index); return true; }
    return false;
  };
  const roots = [...new Set((json.scenes || []).flatMap(scene => scene.nodes || []))].filter(visit);
  json.nodes = json.nodes.map((node, i) => {
    if (!live.has(i)) return {};
    const out = { ...node, children: (node.children || []).filter(j => live.has(j)) };
    if (!selected.has(i)) delete out.mesh;
    return out;
  });
  json.scenes = [{ name: 'retained original only', nodes: roots }]; json.scene = 0;
  const encoded = new TextEncoder().encode(JSON.stringify(json)), length = Math.ceil(encoded.length / 4) * 4;
  const total = 12 + 8 + length + chunks.reduce((sum, chunk) => sum + 8 + chunk.bytes.length, 0);
  const out = new ArrayBuffer(total), view = new DataView(out), bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
  view.setUint32(12, length, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + length); bytes.set(encoded, 20);
  let at = 20 + length;
  for (const chunk of chunks) {
    view.setUint32(at, chunk.bytes.length, true); view.setUint32(at + 4, chunk.type, true);
    bytes.set(chunk.bytes, at + 8); at += 8 + chunk.bytes.length;
  }
  return out;
}

export async function warmRetainedHeldItem(id, { template = null, props = null, resolveAsset = assetUrl } = {}) {
  const spec = RETAINED_HELD_MODELS[id]; if (!spec) return false;
  if (template) { templates.set(id, template.scene || template); return true; }
  if (retainedHeldItemReady(id)) return true;
  if (pending.has(id)) return pending.get(id);
  const request = (async () => {
    if (spec.residentMesh) {
      const native = props || await import('./props3d.js');
      const copied = native.installAuthoredPropMeshes((gl, pack) => {
        const entry = pack.catalog.get(spec.residentMesh);
        if (!entry) return false;
        const original = retainedPropTemplate(entry); if (!original) return false;
        templates.set(id, original); return true;
      });
      // A saved item can be inspected when the ordinary base pack becomes
      // resident again. Never fetch 62 MB or manufacture a stand-in here.
      return copied === true;
    }
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const response = await fetch(resolveAsset(spec.asset));
    if (!response.ok) throw new Error(`Retained ${id}: HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const parsed = await new GLTFLoader().parseAsync(spec.meshes ? subsetRetainedGLB(bytes, spec.meshes) : bytes, '');
    templates.set(id, parsed.scene); return true;
  })().finally(() => pending.delete(id));
  pending.set(id, request); return request;
}

function ownedClone(template) {
  const result = template.clone(true), geometries = new Map(), materials = new Map(), maps = new Map();
  result.traverse(node => {
    if (!node.isMesh) return;
    if (!geometries.has(node.geometry)) geometries.set(node.geometry, node.geometry.clone());
    node.geometry = geometries.get(node.geometry);
    const copy = source => {
      if (!materials.has(source)) {
        const material = source.clone();
        for (const [key, value] of Object.entries(material)) if (value?.isTexture) {
          if (!maps.has(value)) { const cloned = value.clone(); cloned.needsUpdate = true; maps.set(value, cloned); }
          material[key] = maps.get(value);
        }
        materials.set(source, material);
      }
      return materials.get(source);
    };
    node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
    node.castShadow = true; node.receiveShadow = true;
  });
  return result;
}
function cradle(digits = ['index', 'middle', 'ring', 'pinky']) {
  const grip = structuredClone(BOX_CRADLE);
  for (const id of ['index', 'middle', 'ring', 'pinky']) if (!digits.includes(id)) delete grip[id];
  return grip;
}
function supportBase(holder, x = .04, z = -.005) {
  holder.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(holder), center = bounds.getCenter(new THREE.Vector3());
  holder.position.add(new THREE.Vector3(x - center.x, -.079 - bounds.min.y, z - center.z));
}
function cassette(group) {
  const holder = new THREE.Group(); holder.name = 'retained numbered field cartridge';
  const geometry = sourceRecordingCassetteGeometry(); let labelMesh, labelKey = null;
  for (const name of ['shell', 'inset', 'steel', 'wear', 'ribbon', 'index', 'shutter', 'label']) {
    const piece = geometry[`source_recording_cassette_${name}`], data = sourceRecordingCassetteMeshPayload(piece);
    const meshGeometry = new THREE.BufferGeometry();
    for (const [key, source, width] of [['position', data.positions, 3], ['normal', data.normals, 3], ['uv', data.uvs, 2]])
      meshGeometry.setAttribute(key, new THREE.BufferAttribute(source, width));
    meshGeometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...piece.base.slice(0, 3)),
      roughness: piece.roughness, metalness: piece.metallic ?? 0 });
    const mesh = new THREE.Mesh(meshGeometry, material); mesh.name = `retained cartridge: ${name}`;
    mesh.castShadow = true; mesh.receiveShadow = true; holder.add(mesh); if (name === 'label') labelMesh = mesh;
  }
  holder.rotation.x = -Math.PI / 2; supportBase(holder, .042, -.005); group.add(holder);
  const update = frame => {
    const recording = frame.recording;
    if (!recording || typeof document === 'undefined') return;
    const identity = sourceRecordingCassetteIdentity(recording), stock = Number.isSafeInteger(recording.cassetteNumber) ? recording : null;
    const identityKey = JSON.stringify([identity.key, stock?.cassetteNumber, stock?.content]); if (identityKey === labelKey) return;
    const hasTake = !!(recording.take || recording.sourceTake || recording.takeId || recording.durationSeconds != null || recording.place || recording.roomId);
    const bitmap = sourceRecordingCassetteLabelBitmap(recording, { identityOnly: !hasTake, stock }), rgba = new Uint8Array(bitmap.pixels);
    for (let at = 3; at < rgba.length; at += 4) rgba[at] = 255;
    const map = new THREE.DataTexture(rgba, bitmap.width, bitmap.height, THREE.RGBAFormat);
    map.colorSpace = THREE.SRGBColorSpace; map.flipY = false; map.needsUpdate = true;
    labelMesh.material.map?.dispose(); labelMesh.material.map = map; labelMesh.material.color.set('#ffffff');
    labelMesh.material.needsUpdate = true; labelKey = identityKey;
  };
  return { holder, grip: cradle(['index', 'middle', 'ring']), update };
}
function doorWedge(group) {
  const holder = new THREE.Group(); holder.name = 'retained original: door-wedge';
  for (const piece of DOOR_WEDGE_GEOMETRY) {
    // Identical manufactured points, winding, rubber and metric dimensions to
    // the wedge under a real leaf; only its supported placement changes.
    const data = sourceRecordingCassetteMeshPayload(piece), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...piece.base.slice(0, 3)),
      roughness: piece.roughness, metalness: piece.metallic,
      emissive: new THREE.Color().setRGB(...piece.emissive) });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = piece.name;
    mesh.castShadow = true; mesh.receiveShadow = true; holder.add(mesh);
  }
  supportBase(holder, .058, -.005); group.add(holder);
  return { holder, grip: cradle(['index', 'middle']) };
}
export function buildRetainedHeldTool(id, group) {
  if (!isRetainedHeldModel(id)) return null;
  if (!retainedHeldItemReady(id)) throw new Error(`Retained ${id} is not resident.`);
  let holder, grip, update = () => {};
  if (id === 'recording-cassette') ({ holder, grip, update } = cassette(group));
  else if (id === 'door-wedge') ({ holder, grip } = doorWedge(group));
  else {
    holder = ownedClone(templates.get(id)); holder.name = `retained original: ${id}`;
    if (id === 'marble-eyes') {
      const pose = holder.getObjectByName('portrait-pose'); if (pose) pose.quaternion.identity();
      holder.updateMatrixWorld(true);
      const arranged = new THREE.Group(); arranged.name = holder.name;
      for (const [side, finger] of [['L', 'ring'], ['R', 'index']]) {
        const eye = new THREE.Group(); eye.name = `${side} separate marble eye`;
        const parts = []; holder.traverse(node => { if (node.isMesh && node.name.startsWith(`${side}-`)) parts.push(node); });
        for (const part of parts) { part.updateWorldMatrix(true, false); const matrix = part.matrixWorld.clone(); part.removeFromParent(); part.matrix.copy(matrix); part.matrix.decompose(part.position, part.quaternion, part.scale); eye.add(part); }
        if (!parts.length) throw new Error('The retained marble eyes lost their separate geometry.');
        const point = BOX_CRADLE[finger].position; supportBase(eye, point[0], point[2]); arranged.add(eye);
      }
      holder = arranged; grip = cradle(['index', 'ring']);
    } else {
      if (id === 'music-box') { supportBase(holder, .058, -.005); grip = cradle(['index', 'middle']); }
      else { supportBase(holder, .04, -.005); grip = cradle(); }
    }
    group.add(holder);
  }
  const box = new THREE.Box3().setFromObject(holder), size = box.getSize(new THREE.Vector3());
  return { bounds: { width: size.x, height: size.y, depth: size.z }, contacts: { right: grip }, controls: {},
    carryIncline: RETAINED_HELD_MODELS[id].incline, update,
    // Updated cartridge labels are allocated after the builder's initial owned
    // resource capture; this one extra map must also be released on eviction.
    disposeExtra() { if (id === 'recording-cassette') holder.traverse(mesh => { if (mesh.isMesh && mesh.name === 'retained cartridge: label') mesh.material.map?.dispose(); }); },
  };
}
