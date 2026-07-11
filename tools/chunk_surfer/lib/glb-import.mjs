// Turn an arbitrary source GLB into one clean, budgeted mesh that drops straight
// into the conservatory prop pack: node transforms baked, coincident vertices
// welded, axis fixed to Y-up, re-centred on the floor, scaled by real height,
// and simplified with meshoptimizer's quadric edge-collapse to a triangle budget.
//
// The welding is the load-bearing step. The files we get are two kinds: clean
// authored models with a real node hierarchy, and FabConvert exports that explode
// a model into tens of thousands of one-triangle "meshes" with duplicated corner
// vertices. Welding rebuilds the shared topology so a real simplifier can work on
// it — without it, edge-collapse (and the old clustering) produce spanning
// slivers, which is exactly the spaghetti this replaces.

import fs from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUMC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGLB(path) {
  const b = fs.readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'glTF') throw new Error(`not a GLB: ${path}`);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  let bin = null, p = 20 + jsonLen;
  while (p + 8 <= b.length) {
    const clen = b.readUInt32LE(p), ctype = b.readUInt32LE(p + 4);
    if (ctype === 0x004e4942) { bin = b.subarray(p + 8, p + 8 + clen); break; }   // "BIN\0"
    p += 8 + clen;
  }
  return { json, bin };
}

function readAccessor(json, bin, idx) {
  const acc = json.accessors[idx];
  const bv = json.bufferViews[acc.bufferView];
  const Comp = COMP[acc.componentType], nc = NUMC[acc.type];
  const bytesPer = Comp.BYTES_PER_ELEMENT;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = bv.byteStride || bytesPer * nc;
  const out = new Comp(acc.count * nc);
  for (let i = 0; i < acc.count; i++) {
    const src = base + i * stride;
    const tmp = new Uint8Array(bytesPer * nc);
    tmp.set(bin.subarray(src, src + bytesPer * nc));
    const el = new Comp(tmp.buffer, 0, nc);
    for (let k = 0; k < nc; k++) out[i * nc + k] = el[k];
  }
  return out;
}

// ── 4×4 column-major matrix maths (glTF convention) ──────────────────────────
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function fromTRS(node) {
  if (node.matrix) return node.matrix.slice();
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const applyPoint = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

// Every triangle in the file, world-space, grouped by source material. Keeping
// those groups is what makes a true model visibly better than the fallback:
// black piano lacquer, keys and brass hardware must not collapse to one colour.
function gather(json, bin) {
  const groups = new Map(); let sourceIndexCount=0;
  const groupFor=(material)=>{if(!groups.has(material))groups.set(material,{material,positions:[],indices:[]});return groups.get(material);};
  const sceneNodes = json.scenes?.[json.scene ?? 0]?.nodes ?? json.nodes.map((_, i) => i);
  const walk = (nodeIdx, parent) => {
    const node = json.nodes[nodeIdx];
    const world = multiply(parent, fromTRS(node));
    if (node.mesh != null) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if (prim.mode != null && prim.mode !== 4) continue;
        const out=groupFor(prim.material??-1),positions=out.positions,indices=out.indices;
        const pos = readAccessor(json, bin, prim.attributes.POSITION);
        const vCount = pos.length / 3, base = positions.length / 3;
        for (let i = 0; i < vCount; i++) {
          const [wx, wy, wz] = applyPoint(world, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
          positions.push(wx, wy, wz);
        }
        if (prim.indices != null) {
          const idx = readAccessor(json, bin, prim.indices);
          for (let i = 0; i < idx.length; i++) indices.push(base + idx[i]);
        } else for (let i = 0; i < vCount; i++) indices.push(base + i);
        sourceIndexCount+=prim.indices!=null?readAccessor(json,bin,prim.indices).length:vCount;
      }
    }
    for (const c of node.children || []) walk(c, world);
  };
  for (const n of sceneNodes) walk(n, identity());
  return {groups:[...groups.values()].map((g)=>({...g,positions:Float32Array.from(g.positions),indices:Uint32Array.from(g.indices)})),sourceTriangles:sourceIndexCount/3};
}

// Merge coincident vertices onto a grid so the mesh becomes topologically
// connected (undoing FabConvert's per-triangle duplication).
function weldArrays(P, I, eps = 5e-4) {
  const map = new Map(), pos = [], remap = new Int32Array(P.length / 3);
  const key = (x, y, z) => `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;
  for (let v = 0; v < P.length / 3; v++) {
    const k = key(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    let n = map.get(k);
    if (n === undefined) { n = pos.length / 3; pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); map.set(k, n); }
    remap[v] = n;
  }
  const out = new Uint32Array(I.length);
  for (let i = 0; i < I.length; i++) out[i] = remap[I[i]];
  // drop degenerate triangles created by welding
  const tris = [];
  for (let t = 0; t < out.length; t += 3) {
    const a = out[t], b = out[t + 1], c = out[t + 2];
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(tris) };
}

function bbox(P) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]);
  }
  return { lo, hi };
}

// Drop triangles poking outside the robust (0.5–99.5 percentile) box, so a stray
// vertex can't shrink the real object to nothing. Never drops everything.
function dropOutliers(P, I) {
  const axis = (o) => { const a = []; for (let i = o; i < P.length; i += 3) a.push(P[i]); a.sort((x, y) => x - y); return a; };
  const q = (a, t) => a[Math.floor(t * (a.length - 1))];
  const X = axis(0), Y = axis(1), Z = axis(2);
  const lo = [q(X, 0.005), q(Y, 0.005), q(Z, 0.005)], hi = [q(X, 0.995), q(Y, 0.995), q(Z, 0.995)];
  const ext = [hi[0] - lo[0] || 1, hi[1] - lo[1] || 1, hi[2] - lo[2] || 1], pad = 0.25;
  const inb = (a) => P[a] >= lo[0] - pad * ext[0] && P[a] <= hi[0] + pad * ext[0]
    && P[a + 1] >= lo[1] - pad * ext[1] && P[a + 1] <= hi[1] + pad * ext[1]
    && P[a + 2] >= lo[2] - pad * ext[2] && P[a + 2] <= hi[2] + pad * ext[2];
  const keep = [], remap = new Map(), out = [];
  const vi = (o) => { let n = remap.get(o); if (n === undefined) { n = keep.length / 3; keep.push(P[o * 3], P[o * 3 + 1], P[o * 3 + 2]); remap.set(o, n); } return n; };
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    if (inb(a) && inb(b) && inb(c)) out.push(vi(I[t]), vi(I[t + 1]), vi(I[t + 2]));
  }
  if (out.length < 3) return { positions: P, indices: I };
  return { positions: Float32Array.from(keep), indices: Uint32Array.from(out) };
}

// Keep only the slab of geometry inside a fractional band of one axis, to pull a
// single instrument out of a source that is really several (marimba+4).
function cropBand(P, I, { axis = 'x', from = 0, to = 1 }) {
  const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  let lo = Infinity, hi = -Infinity;
  for (let i = k; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); }
  const a = lo + (hi - lo) * from, b = lo + (hi - lo) * to;
  const keep = [], remap = new Map(), out = [];
  const vi = (o) => { let n = remap.get(o); if (n === undefined) { n = keep.length / 3; keep.push(P[o * 3], P[o * 3 + 1], P[o * 3 + 2]); remap.set(o, n); } return n; };
  for (let t = 0; t < I.length; t += 3) {
    const cc = (P[I[t] * 3 + k] + P[I[t + 1] * 3 + k] + P[I[t + 2] * 3 + k]) / 3;
    if (cc >= a && cc <= b) out.push(vi(I[t]), vi(I[t + 1]), vi(I[t + 2]));
  }
  if (out.length < 3) return { positions: P, indices: I };
  return { positions: Float32Array.from(keep), indices: Uint32Array.from(out) };
}

// Compact away any vertices no longer referenced by the (simplified) indices.
function compact(P, I) {
  const remap = new Int32Array(P.length / 3).fill(-1);
  const pos = [], out = new Uint32Array(I.length);
  for (let i = 0; i < I.length; i++) {
    const v = I[i];
    if (remap[v] < 0) { remap[v] = pos.length / 3; pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); }
    out[i] = remap[v];
  }
  return { positions: Float32Array.from(pos), indices: out };
}

function recomputeNormals(P, I) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const j of [a, b, c]) { N[j] += nx; N[j + 1] += ny; N[j + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l; N[i + 1] /= l; N[i + 2] /= l;
  }
  return N;
}

function reAxis(P, up) {
  if (up !== 'z') return;
  for (let i = 0; i < P.length; i += 3) { const y = P[i + 1], z = P[i + 2]; P[i + 1] = z; P[i + 2] = -y; }
}

// meshoptimizer quadric edge-collapse to a triangle budget, on welded topology.
async function simplifyMesh(P, I, targetTris) {
  const srcTris = I.length / 3;
  if (srcTris <= targetTris) return { positions: P, indices: I, tris: srcTris };
  await MeshoptSimplifier.ready;
  // Public API: simplify(indices, positions, stride-in-floats, targetIndexCount, targetError, flags).
  // No LockBorder: thin panelled props (a pew is nearly all border edges) would
  // otherwise refuse to collapse. A generous error lets it actually reach budget;
  // if quadric collapse still stalls above budget, fall back to sloppy collapse.
  let [simplified] = MeshoptSimplifier.simplify(I, P, 3, targetTris * 3, 0.9, []);
  if (simplified.length / 3 > targetTris * 1.2 && MeshoptSimplifier.simplifySloppy) {
    // simplifySloppy(indices, positions, stride, vertexLock, targetIndexCount, targetError) -> [indices, error]
    simplified = MeshoptSimplifier.simplifySloppy(I, P, 3, null, targetTris * 3, 1.0)[0];
  }
  return { positions: P, indices: simplified, tris: simplified.length / 3 };
}

// The public step. Returns { positions, normals, indices, triangles, bounds }
// in metres, Y-up, centred on x/z, sitting on y=0.
export async function importPropMesh(path, { up = 'y', yaw = 0, crop = null, targetH = 1, maxW = Infinity, maxD = Infinity, triBudget = 4000 } = {}) {
  const { json, bin } = readGLB(path);
  if (!bin) throw new Error(`GLB has no BIN chunk: ${path}`);
  const soup = gather(json, bin);
  let groups=soup.groups.map((raw)=>{const welded=weldArrays(raw.positions,raw.indices),cleaned=dropOutliers(welded.positions,welded.indices);let P=cleaned.positions,indices=cleaned.indices;reAxis(P,up);if(yaw){const c=Math.cos(yaw),s=Math.sin(yaw);for(let i=0;i<P.length;i+=3){const x=P[i],z=P[i+2];P[i]=x*c-z*s;P[i+2]=x*s+z*c;}}if(crop)({positions:P,indices}=cropBand(P,indices,crop));return{material:raw.material,positions:P,indices};}).filter((g)=>g.indices.length>=3);
  if(!groups.length)throw new Error(`${path}: no triangle groups survived cleaning`);
  const all=Float32Array.from(groups.flatMap((g)=>Array.from(g.positions)));
  // Fit: centre x/z, drop to floor, scale by height, clamp the footprint.
  const { lo, hi } = bbox(all);
  const ex = (hi[0] - lo[0]) || 1e-6, ez = (hi[2] - lo[2]) || 1e-6, ey = (hi[1] - lo[1]) || 1e-6;
  let scale = targetH / ey;
  if (ex * scale > maxW) scale = maxW / ex;
  if (ez * scale > maxD) scale = maxD / ez;
  const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
  for(const g of groups)for(let i=0;i<g.positions.length;i+=3){g.positions[i]=(g.positions[i]-cx)*scale;g.positions[i+1]=(g.positions[i+1]-lo[1])*scale;g.positions[i+2]=(g.positions[i+2]-cz)*scale;}
  const totalSource=groups.reduce((n,g)=>n+g.indices.length/3,0);const cooked=[];
  for(const g of groups){const share=Math.max(12,Math.round(triBudget*(g.indices.length/3)/totalSource)),sim=await simplifyMesh(g.positions,g.indices,share),packed=compact(sim.positions,sim.indices);if(packed.indices.length<3)continue;const src=json.materials?.[g.material]||{},pbr=src.pbrMetallicRoughness||{};cooked.push({positions:packed.positions,normals:recomputeNormals(packed.positions,packed.indices),indices:packed.indices,material:{name:src.name||`source material ${g.material}`,baseColorFactor:pbr.baseColorFactor||[.45,.45,.45,1],metallicFactor:pbr.metallicFactor??0,roughnessFactor:pbr.roughnessFactor??.7}});}
  const packedAll=Float32Array.from(cooked.flatMap((g)=>Array.from(g.positions))),bnd=bbox(packedAll);
  return {
    groups:cooked, triangles:cooked.reduce((n,g)=>n+g.indices.length/3,0),
    bounds: { min: bnd.lo.map((v) => +v.toFixed(3)), max: bnd.hi.map((v) => +v.toFixed(3)) },
    sourceTriangles: soup.sourceTriangles,
  };
}
