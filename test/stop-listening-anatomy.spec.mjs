import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { STOP_LISTENING_MESH } from '../src/data/stop-listening.js';
import { propMaterialFactors } from '../src/render/prop-material-contract.js';

const bytes = fs.readFileSync(process.env.CS_EAR_TEST_ASSET || new URL('../public/assets/stop-listening.glb', import.meta.url));
const length = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, 20 + length)), base = 28 + length;
function read(index) {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView];
  const count = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const width = a.componentType === 5126 || a.componentType === 5125 ? 4 : 2;
  const method = a.componentType === 5126 ? 'readFloatLE' : a.componentType === 5125 ? 'readUInt32LE' : 'readUInt16LE';
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: count }, (_, k) =>
    bytes[method](base + (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || count * width) + k * width)));
}
const mesh = (name) => gltf.meshes.find((m) => m.name === name);
const material = (p) => gltf.materials[p.material].name;
const triangles = (m) => m.primitives.filter((p) => material(p) !== 'stop listening floor wet').flatMap((p) => {
  const positions = read(p.attributes.POSITION), ids = read(p.indices).flat();
  return Array.from({ length: ids.length / 3 }, (_, i) => ids.slice(i * 3, i * 3 + 3).map((id) => positions[id]));
});

test('the shipped ear separates mapped cartilage, inflamed recesses and wet severed attachment', () => {
  const skin = gltf.materials.find((m) => m.name === 'stop listening ear skin').pbrMetallicRoughness;
  const deep = gltf.materials.find((m) => m.name === 'stop listening ear deep').pbrMetallicRoughness;
  const wound = gltf.materials.find((m) => m.name === 'stop listening ear wound').pbrMetallicRoughness;
  const rgb = skin.baseColorFactor.slice(0, 3);
  assert.ok(Number.isInteger(skin.baseColorTexture?.index), 'skin pigment must be an actual sampled material');
  assert.ok(skin.roughnessFactor === 1 && wound.roughnessFactor <= .46, 'wet root and cartilage need distinct mapped light response');
  assert.deepEqual(rgb,deep.baseColorFactor.slice(0,3),'continuous mapped pigment cannot acquire per-triangle skin/recess colour boundaries');
  for (const name of STOP_LISTENING_MESH.ears) {
    const primitives = mesh(name).primitives.filter((p) => material(p) !== 'stop listening floor wet');
    const total = primitives.reduce((n, p) => n + gltf.accessors[p.indices].count, 0);
    const fraction = (label) => primitives.filter((p) => material(p) === label).reduce((n, p) => n + gltf.accessors[p.indices].count, 0) / total;
    assert.ok(fraction('stop listening ear wound') > .10, `${name}: no substantial torn root`);
    assert.ok(fraction('stop listening ear deep') > .10, `${name}: the concha/folds have become an unbroken bright bowl`);
  }
});

function heightAt(tri, x, z) {
  const [a, b, c] = tri, den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(den) < 1e-10) return null;
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / den;
  const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / den;
  if (u < -.00001 || v < -.00001 || u + v > 1.00001) return null;
  return u * a[1] + v * b[1] + (1 - u - v) * c[1];
}

test('the actual concha has a deep recess bounded by raised folded cartilage', () => {
  const tris = triangles(mesh('stop_listening_ear_a'));
  const top = (x, z) => Math.max(0, ...tris.map((t) => heightAt(t, x, z)).filter((v) => v !== null));
  let recessed = 0;
  for (let x = -.075; x <= .055; x += .01) for (let z = -.08; z <= .10; z += .01) {
    const h = top(x, z), rim = [[.05, 0], [-.05, 0], [0, .05], [0, -.05]].map(([dx, dz]) => top(x + dx, z + dz));
    if (h < .05 && rim.filter((v) => v > h + .035).length >= 2) recessed++;
  }
  assert.ok(recessed >= 6, `only ${recessed} cm-grid samples have a 3.5cm-deep concha bounded by tragus/antihelix; its anterior canal side remains open`);
});

test('upper pinna has a recessed triangular fossa and a distinct long scapha', () => {
  const tris = triangles(mesh('stop_listening_ear_a'));
  const top = (x, z) => Math.max(0, ...tris.map((t) => heightAt(t, x, z)).filter((v) => v !== null));
  // Actual shipped surface samples, in metres: the old broad top plate passed
  // the concha test while erasing both upper-ear landmarks into a flat oval.
  const fossa = top(-.02, -.10), scapha = top(.06, -.08);
  assert.ok(fossa < .045, 'the triangular fossa has filled into a flat upper plate');
  for (const [x, z] of [[-.08, -.10], [.02, -.10], [-.02, -.18], [-.02, -.06]]) {
    assert.ok(top(x, z) > fossa + .025, 'the fossa is not bounded by the antihelical fork');
  }
  assert.ok(scapha < .045 && top(.02, -.08) > scapha + .025 && top(.10, -.08) > scapha + .025,
    'the inner fork and outer helix need a real separating groove');
});

test('the pinna web descends beneath a rolled helix instead of filling it into a thick slab', () => {
  const tris = triangles(mesh('stop_listening_ear_a'));
  const top = (x, z) => Math.max(0, ...tris.map((t) => heightAt(t, x, z)).filter((v) => v !== null));
  const web = top(-.02, -.14), rim = top(-.06, -.14);
  assert.ok(web < .052, `upper pinna web remains ${(web * 100).toFixed(1)} cm high`);
  assert.ok(rim > web + .025, 'the helix has no physical curl above the thinner web');
});

test('raised cartilage keeps a coherent pale surface rather than dark triangular camouflage', () => {
  let raised = 0, darkRaised = 0;
  for (const p of mesh('stop_listening_ear_a').primitives) {
    if (material(p) === 'stop listening floor wet') continue;
    const positions = read(p.attributes.POSITION), ids = read(p.indices).flat();
    for (let i = 0; i < ids.length; i += 3) {
      const y = ids.slice(i, i + 3).reduce((sum, id) => sum + positions[id][1], 0) / 3;
      if (y > .069) { raised++; if (material(p) === 'stop listening ear deep') darkRaised++; }
    }
  }
  assert.ok(raised > 100, 'the model has lost its raised cartilage');
  assert.ok(darkRaised / raised < .02, `${darkRaised}/${raised} raised faces carry false cavity patches that break up in dither`);
});

test('dither-facing tissue uses authored glTF roughness without the legacy squared conversion', () => {
  for (const name of ['skin', 'deep', 'wound']) {
    const mat = gltf.materials.find((m) => m.name === `stop listening ear ${name}`), pbr = mat.pbrMetallicRoughness;
    assert.equal(mat.extras?.materialFactors, 'gltf', `${name}: material semantics were stripped from the pack`);
    const factors = propMaterialFactors({ roughness: pbr.roughnessFactor, metallic: pbr.metallicFactor, hasOrm:true, semantics: mat.extras.materialFactors });
    assert.equal(factors.roughness, pbr.roughnessFactor);
    assert.equal(factors.legacyUnmapped, false);
    if (name !== 'wound') assert.ok(factors.roughness >= .55, `${name}: broad wet glare erases the folds`);
  }
});

test('actual tissue maps preserve flesh pigment, small relief and dielectric roughness through one shared UV set', async()=>{
  const tissue=gltf.materials.filter(mat=>/^stop listening ear /.test(mat.name));
  const imageData=async textureId=>{
    const texture=gltf.textures[textureId],image=gltf.images[texture.source],view=gltf.bufferViews[image.bufferView];
    return sharp(bytes.subarray(base+(view.byteOffset||0),base+(view.byteOffset||0)+view.byteLength)).raw().toBuffer({resolveWithObject:true});
  };
  const maps=tissue[0],ids=[maps.pbrMetallicRoughness.baseColorTexture.index,maps.normalTexture.index,maps.pbrMetallicRoughness.metallicRoughnessTexture.index];
  for(const mat of tissue){
    assert.deepEqual(mat.extras.tissueSurface,{version:1,profile:'severed-auricle',preservePigment:true,localSpecular:true});
    assert.deepEqual([mat.pbrMetallicRoughness.baseColorTexture.index,mat.normalTexture.index,mat.pbrMetallicRoughness.metallicRoughnessTexture.index],ids,'all roles share the actual three uploaded maps');
    assert.equal(mat.pbrMetallicRoughness.metallicFactor,0);
  }
  const [albedo,normal,orm]=await Promise.all(ids.map(imageData));
  for(const map of [albedo,normal,orm])assert.deepEqual([map.info.width,map.info.height],[512,512]);
  let colored=0,red=0,green=0,blue=0,minR=255,maxR=0;
  for(let i=0;i<albedo.data.length;i+=albedo.info.channels){
    const [r,g,b]=albedo.data.subarray(i,i+3);red+=r;green+=g;blue+=b;minR=Math.min(minR,r);maxR=Math.max(maxR,r);
    if(r>g*1.15&&r>b*1.15)colored++;
  }
  assert.ok(colored>512*512*.85&&red>green*1.2&&red>blue*1.2,'the actual decoded pigment is tissue colored, not gray factors');
  assert.ok(maxR-minR>65,'coherent blanched folds and clot pigment survive the image encoding');
  for(let i=0;i<orm.data.length;i+=orm.info.channels){assert.ok(orm.data[i+1]>=105&&orm.data[i+1]<=195);assert.equal(orm.data[i+2],0);}
  for(let i=0;i<normal.data.length;i+=normal.info.channels)assert.ok(normal.data[i+2]>230,'micro-relief cannot replace folded cartilage with large painted normals');
  assert.equal(gltf.images.length,4,'three tissue images plus the exact take sheet; no obsolete image copies');
  assert.equal(gltf.textures.length,4,'repeated anatomy builds cannot upload duplicate tissue textures');
  for(const name of [...STOP_LISTENING_MESH.ears,...STOP_LISTENING_MESH.heaps])for(const p of mesh(name).primitives){
    if(material(p)==='stop listening floor wet')continue;
    const uv=read(p.attributes.TEXCOORD_0),normals=read(p.attributes.NORMAL);
    assert.ok(uv.every(point=>point.every(Number.isFinite))&&uv.some(point=>Math.hypot(...point)>.1),`${name}: real anatomical UVs`);
    assert.ok(normals.every(n=>Math.abs(Math.hypot(...n)-1)<.002),`${name}: exported unit normals`);
  }
});

function fleshTopology(m) {
  const vertices = new Map(), edges = new Map(), parent = [];
  const faces = triangles(m);
  const index = (point) => {
    const key = point.map((n) => Math.round(n * 1e6)).join(',');
    if (!vertices.has(key)) { vertices.set(key, vertices.size); parent.push(parent.length); }
    return vertices.get(key);
  };
  const root = (n) => { while (parent[n] !== n) { parent[n] = parent[parent[n]]; n = parent[n]; } return n; };
  for (const tri of faces) {
    const ids = tri.map(index);
    if (new Set(ids).size !== 3) continue;
    for (let i = 0; i < 3; i++) {
      const a = ids[i], b = ids[(i + 1) % 3], key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      edges.set(key, (edges.get(key) || 0) + 1); parent[root(a)] = root(b);
    }
  }
  const bodies = new Map();
  for (const tri of faces) {
    const id = root(index(tri[0]));
    if (!bodies.has(id)) bodies.set(id, []);
    bodies.get(id).push(tri);
  }
  return { boundaryEdges: [...edges.values()].filter((n) => n === 1).length,
    nonmanifoldEdges: [...edges.values()].filter((n) => n > 2).length,
    bodies: bodies.size, bodyTriangles: [...bodies.values()] };
}

test('cut attachments and pinnae are actual closed volumes, not open sawtooth ribbons', () => {
  for (const name of STOP_LISTENING_MESH.ears) {
    const topology = fleshTopology(mesh(name));
    assert.equal(topology.boundaryEdges, 0, `${name}: exposed one-sided tissue edge`);
    assert.equal(topology.nonmanifoldEdges, 0, `${name}: overlapping faces in the cut volume`);
    assert.equal(topology.bodies, 1, `${name}: the cut root is detached from the pinna`);
  }
});

test('heaps keep the real 42, 26 and 34 volumetric ears instead of intersecting open ribbons', () => {
  for (const [name, count] of [['stop_listening_heap_a', 42], ['stop_listening_heap_b', 26], ['stop_listening_heap_c', 34]]) {
    const topology = fleshTopology(mesh(name));
    assert.equal(topology.boundaryEdges, 0, `${name}: open tissue surfaces reappeared`);
    assert.equal(topology.nonmanifoldEdges, 0, `${name}: non-manifold piled anatomy`);
    assert.equal(topology.bodies, count, `${name}: anatomy count or actual separateness changed`);
  }
});

test('actual exported heap solids do not bury one another under centimetres of guessed support', () => {
  // Independent of the builder's support receipt: intersect the exported
  // triangles with vertical columns, then compare the closed solid intervals.
  // v4 passed counts/bounds while producing 66–76 mm of interpenetration here.
  const step = .0125;
  for (const name of STOP_LISTENING_MESH.heaps) {
    const columns = new Map();
    const bodies = fleshTopology(mesh(name)).bodyTriangles.filter((body) => body.length >= 150);
    for (const [bodyId, body] of bodies.entries()) {
      const hits = new Map();
      for (const tri of body) {
        const xmin = Math.ceil(Math.min(...tri.map((p) => p[0])) / step), xmax = Math.floor(Math.max(...tri.map((p) => p[0])) / step);
        const zmin = Math.ceil(Math.min(...tri.map((p) => p[2])) / step), zmax = Math.floor(Math.max(...tri.map((p) => p[2])) / step);
        for (let x = xmin; x <= xmax; x++) for (let z = zmin; z <= zmax; z++) {
          const h = heightAt(tri, x * step, z * step);
          if (h == null) continue;
          const key = `${x},${z}`;
          if (!hits.has(key)) hits.set(key, []);
          hits.get(key).push(h);
        }
      }
      for (const [key, values] of hits) {
        values.sort((a, b) => a - b);
        const clean = values.filter((v, i) => i === 0 || Math.abs(v - values[i - 1]) > 1e-6);
        if (clean.length % 2) continue; // A sample exactly on a silhouette is not a reliable solid column.
        for (let i = 0; i < clean.length; i += 2) {
          if (!columns.has(key)) columns.set(key, []);
          columns.get(key).push({ bodyId, low: clean[i], high: clean[i + 1] });
        }
      }
    }
    let maxOverlap = 0;
    for (const intervals of columns.values()) for (let i = 0; i < intervals.length; i++) for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i], b = intervals[j];
      if (a.bodyId !== b.bodyId) maxOverlap = Math.max(maxOverlap, Math.min(a.high, b.high) - Math.max(a.low, b.low));
    }
    assert.ok(maxOverlap <= .003, `${name}: ${(maxOverlap * 1000).toFixed(1)} mm sampled interpenetration exceeds the 3 mm model tolerance`);
  }
});

test('wall lettering is pressed pigment film with an outward-facing surface, not rounded tube letters', () => {
  for (const name of Object.values(STOP_LISTENING_MESH.writing)) {
    const m = mesh(name), normals = m.primitives.flatMap((p) => read(p.attributes.NORMAL));
    assert.ok(normals.filter((n) => n[2] > .95).length / normals.length > .98, `${name}: pipe sides/back dominate the brush surface`);
    const points = m.primitives.flatMap((p) => read(p.attributes.POSITION));
    assert.ok(Math.max(...points.map((p) => p[2])) - Math.min(...points.map((p) => p[2])) < .002, `${name}: pigment floats off the wall`);
  }
});

test('loaded wall pigment stays matte and dark enough to read under the actual torch', () => {
  for (const tone of ['dark', 'pale']) {
    const p = gltf.materials.find((m) => m.name === `stop listening paint ${tone}`).pbrMetallicRoughness;
    assert.ok(p.roughnessFactor >= .90, `${tone}: a full-stroke white specular sheet erases the words`);
    assert.ok(Math.max(...p.baseColorFactor.slice(0, 3)) < .15, `${tone}: pale paint merges with the torch-lit wall`);
  }
});

test('the tissue pass keeps the exact take sheet and a bounded geometry/texture budget', () => {
  const h = crypto.createHash('sha256');
  for (const p of mesh(STOP_LISTENING_MESH.sheet).primitives) for (const [name, id] of Object.entries({ ...p.attributes, indices: p.indices }).sort()) {
    const a = gltf.accessors[id], v = gltf.bufferViews[a.bufferView];
    h.update(`${name}:${a.componentType}:${a.type}:${a.count}`);
    h.update(bytes.subarray(base + (v.byteOffset || 0), base + (v.byteOffset || 0) + v.byteLength));
  }
  assert.equal(h.digest('hex'), 'ed47b29c518786ed632b3d71e158923d39c370a6626d30572a8ac08c0392ace4', 'the take sheet changed with the ear/writing treatment');
  const count = gltf.meshes.reduce((sum, m) => sum + m.primitives.reduce((n, p) => n + gltf.accessors[p.indices].count / 3, 0), 0);
  assert.equal(gltf.meshes.length, 16, 'this pass cannot add locations or model dispatches');
  assert.ok(count <= 92000 && bytes.length <= 4700000, 'three512px tissue maps and anatomy remain bounded without changing model dispatches');
});
