// Rebuild the first-person sculpt from the licensed bind mesh. The skeleton,
// bind transforms and pad locations stay compatible with existing prop grips.
import { NodeIO } from '@gltf-transform/core';
import { fileURLToPath } from 'node:url';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Vector3 } from 'three';

const asset = name => fileURLToPath(new URL('../../public/assets/battle-hands/' + name, import.meta.url));
const io = new NodeIO();
const doc = await io.read(asset('right.glb'));
const [mesh] = doc.getRoot().listMeshes();
const [skin] = doc.getRoot().listSkins();
const [primitive] = mesh.listPrimitives();
const position = primitive.getAttribute('POSITION').getArray();
const joints = primitive.getAttribute('JOINTS_0').getArray();
const weights = primitive.getAttribute('WEIGHTS_0').getArray();
const source = primitive.getIndices().getArray();
const [buffer] = doc.getRoot().listBuffers();

const point = (array, i) => new Vector3().fromArray(array, i * 3);
const gaussian = (p, centre, spread) => Math.exp(-p.toArray().reduce((sum, v, i) => sum + ((v - centre[i]) / spread[i]) ** 2, 0));
// Merge coincident vertices along the UV seam. The in-game skin material uses
// bind-space positions, so the seam need not be retained on the new surface.
const lookup = new Map(), vertices = [], remap = [];
for (let i = 0; i < position.length / 3; i++) {
  const p = point(position, i);
  const key = p.toArray().map(v => Math.round(v * 1e6)).join(',');
  if (!lookup.has(key)) {
    lookup.set(key, vertices.length);
    const influences = new Map();
    for (let slot = 0; slot < 4; slot++) {
      const j = i * 4 + slot;
      if (weights[j] > 0) influences.set(joints[j], weights[j]);
    }
    vertices.push({ p, influences, neighbors: new Set() });
  }
  remap.push(lookup.get(key));
}
const triangles = [], edges = new Map();
function edge(a, b, opposite) {
  const id = a < b ? a + ':' + b : b + ':' + a;
  if (!edges.has(id)) edges.set(id, { a, b, opposite: [] });
  edges.get(id).opposite.push(opposite);
  vertices[a].neighbors.add(b);
  vertices[b].neighbors.add(a);
  return edges.get(id);
}
for (let i = 0; i < source.length; i += 3) {
  const [a,b,c] = [remap[source[i]],remap[source[i+1]],remap[source[i+2]]];
  if (a !== b && b !== c && c !== a) triangles.push({ a,b,c, ab:edge(a,b,c), bc:edge(b,c,a), ca:edge(c,a,b) });
}
const result = [];
function blend(samples) {
  const p = new Vector3(), influences = new Map();
  for (const [i, factor] of samples) {
    p.addScaledVector(vertices[i].p, factor);
    for (const [bone, weight] of vertices[i].influences) {
      influences.set(bone, (influences.get(bone) || 0) + factor * weight);
    }
  }
  result.push({ p, influences });
  return result.length - 1;
}
for (const [i, v] of vertices.entries()) {
  const beta = .19 / Math.max(1, v.neighbors.size);
  blend([[i, 1 - beta * v.neighbors.size], ...[...v.neighbors].map(n => [n, beta])]);
}
for (const e of edges.values()) {
  const smooth = e.opposite.length === 2;
  e.index = blend(smooth
    ? [[e.a,.4],[e.b,.4], ...e.opposite.map(i => [i,.1])]
    : [[e.a,.5],[e.b,.5]]);
}
const denseIndex = new Uint32Array(triangles.flatMap(({a,b,c,ab,bc,ca}) =>
  [a,ab.index,ca.index, b,bc.index,ab.index, c,ca.index,bc.index, ab.index,bc.index,ca.index]));
const bone = Object.fromEntries(skin.listJoints().map((joint, i) => [joint.getName(), i]));
const landmarks = {
  index: [[.032,-.033,-.014],[.026,-.078,-.011]],
  middle: [[.037,-.036,.007],[.027,-.082,.012]],
  ring: [[.033,-.029,.027],[.022,-.070,.034]],
  pinky: [[.025,-.018,.044],[.015,-.051,.048]],
};
let sculpted = new Float32Array(result.length * 3), skinJoints = new Uint16Array(result.length * 4);
let skinWeights = new Float32Array(result.length * 4);
const corrections = Object.fromEntries([...Object.keys(landmarks), 'thumb'].map(id => [id, new Float32Array(sculpted.length)]));
for (const [i, { p, influences }] of result.entries()) {
  // WebXR bind space: -X is dorsal. Build relief at the size that can still
  // be read through the game's screen, with unchanged fingertip pads.
  const dorsal = Math.max(0, Math.min(1, (.023 - p.x) / .014));
  const tendon = Object.values(landmarks).reduce((sum, [base]) =>
    sum + gaussian(p,[.020,(base[1]+.028)/2,base[2] * .7],[.017,.040,.0048]),0);
  const web = gaussian(p, [.027,-.012,-.026], [.017,.029,.014]);
  const palmHeel = gaussian(p,[.048,.017,.024],[.014,.031,.023]);
  let knuckles = 0;
  for (const [digit, [base, middle]] of Object.entries(landmarks)) {
    knuckles += gaussian(p,[base[0]-.007,base[1],base[2]],[.014,.009,.008]);
    const knuckle = gaussian(p,[base[0]-.007,base[1],base[2]],[.014,.015,.011]);
    const hinge = gaussian(p,[middle[0]-.006,middle[1],middle[2]],[.012,.009,.008]);
    corrections[digit][i*3] = -dorsal * (.0024 * knuckle + .0018 * hinge);
  }
  // Thumb opposition pushes the web into the thenar pad. The contact end of
  // the thumb and the distal pads are outside the correction.
  corrections.thumb[i*3] = web * .0022;
  corrections.thumb[i*3+2] = web * .0014;
  p.x += .0027 * palmHeel - dorsal * (.0017 * tendon + .00135 * knuckles);
  p.toArray(sculpted, i*3);
  const entries = [...influences].sort((a,b) => b[1]-a[1]).slice(0,4);
  const sum = entries.reduce((a,b) => a+b[1],0);
  entries.forEach(([joint,weight], j) => {
    skinJoints[i*4+j] = joint;
    skinWeights[i*4+j] = weight / sum;
  });
}
function normals(points, index) {
  const out = Array.from({length:points.length/3}, () => new Vector3());
  for (let i = 0; i < index.length; i += 3) {
    const [a,b,c] = index.subarray(i,i+3);
    const origin = point(points,a);
    const n = point(points,b).sub(origin).cross(point(points,c).sub(origin));
    out[a].add(n); out[b].add(n); out[c].add(n);
  }
  return Float32Array.from(out.flatMap(n => n.normalize().toArray()));
}

// Concentrate triangles around the sculpted silhouette and joint weights
// while staying within the radio's existing per-frame geometry budget.
await MeshoptSimplifier.ready;
const attributes = new Float32Array(result.length * 8);
const denseNormals = normals(sculpted, denseIndex);
for (let i = 0; i < result.length; i++) {
  attributes.set(denseNormals.subarray(i*3,i*3+3), i*8);
  for (const [j, name] of Object.keys(corrections).entries()) attributes[i*8+3+j] = corrections[name][i*3] * 80;
}
const [index32] = MeshoptSimplifier.simplifyWithAttributes(denseIndex,sculpted,3,attributes,8,
  [.12,.12,.12,.10,.10,.10,.10,.12],null,10620,.008,['LockBorder']);
const [compactIndex, count] = MeshoptSimplifier.compactMesh(index32);
function compact(array, stride) {
  const out = new array.constructor(count*stride);
  for (let i=0;i<compactIndex.length;i++) if (compactIndex[i] !== 0xffffffff)
    out.set(array.subarray(i*stride,(i+1)*stride),compactIndex[i]*stride);
  return out;
}
sculpted = compact(sculpted,3);
skinJoints = compact(skinJoints,4);
skinWeights = compact(skinWeights,4);
for (const name of Object.keys(corrections)) corrections[name] = compact(corrections[name],3);
const index = Uint16Array.from(index32);
const baseNormals = normals(sculpted,index);
const accessor = (type,array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
primitive.setIndices(accessor('SCALAR',index))
  .setAttribute('POSITION',accessor('VEC3',sculpted))
  .setAttribute('NORMAL',accessor('VEC3',baseNormals))
  .setAttribute('TEXCOORD_0',null)
  .setAttribute('JOINTS_0',accessor('VEC4',skinJoints))
  .setAttribute('WEIGHTS_0',accessor('VEC4',skinWeights));
for (const [name, delta] of Object.entries(corrections)) {
  const corrected = normals(sculpted.map((v,i) => v + delta[i]),index);
  primitive.addTarget(doc.createPrimitiveTarget(name)
    .setAttribute('POSITION',accessor('VEC3',delta))
    .setAttribute('NORMAL',accessor('VEC3',corrected.map((v,i) => v-baseNormals[i]))));
}
const names = Object.keys(corrections);
for (const name of names) if (!(name === 'thumb' ? 'thumb-metacarpal' in bone : name+'-finger-metacarpal' in bone))
  throw new Error('Missing bind joint for ' + name);
mesh.setName('Recordist anatomical skin').setExtras({ targetNames: names }).setWeights(names.map(() => 0));
await io.write(asset('recordist.glb'),doc);
console.log(count + ' vertices, ' + index.length/3 + ' triangles, ' + names.length + ' pose corrections');
