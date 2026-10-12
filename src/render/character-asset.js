// Deliberately bounded character GLB support. Ordinary prop packs keep their
// stricter, static-only contract in props3d.js.
export const CHARACTER_LIMITS = Object.freeze({ joints: 48, morphs: 4, nodes: 160, vertices: 50000, primitives: 16, clips: 16, bytes: 64 * 1024 * 1024 });
const TYPES = { 5121: [Uint8Array, 1, 'getUint8'], 5123: [Uint16Array, 2, 'getUint16'], 5125: [Uint32Array, 4, 'getUint32'], 5126: [Float32Array, 4, 'getFloat32'] };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const finite = (v, label) => { if (!Number.isFinite(v)) throw new Error(`character ${label}: non-finite value`); return v; };
const ident = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function characterMultiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
}
function quaternion(q) {
  const n = Math.hypot(...q); if (!(n > 1e-8)) throw new Error('character zero quaternion');
  return q.map(v => v / n);
}
function qmul(a, b) { return quaternion([a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]); }
function slerp(a, b, t) {
  let dot = a.reduce((v, x, i) => v + x * b[i], 0), bb = b;
  if (dot < 0) { dot = -dot; bb = b.map(x => -x); }
  if (dot > .9995) return quaternion(a.map((x, i) => x + (bb[i] - x) * t));
  const angle = Math.acos(Math.min(1, dot)), s = Math.sin(angle);
  return a.map((x, i) => (Math.sin((1 - t) * angle) * x + Math.sin(t * angle) * bb[i]) / s);
}
function trs(t, q, s) {
  const [x, y, z, w] = q, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return new Float32Array([(1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0, 2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0, 2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0, ...t, 1]);
}
function point(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
function vector(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; }

export function parseCharacterAsset(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > CHARACTER_LIMITS.bytes || buffer.byteLength < 20) throw new Error('character GLB size invalid');
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2 || dv.getUint32(8, true) !== buffer.byteLength) throw new Error('character requires GLB 2');
  let json, bin;
  for (let at = 12; at < buffer.byteLength;) {
    if (at + 8 > buffer.byteLength) throw new Error('character truncated chunk');
    const len = dv.getUint32(at, true), kind = dv.getUint32(at + 4, true); at += 8;
    if (at + len > buffer.byteLength || len % 4) throw new Error('character invalid chunk length');
    const bytes = new Uint8Array(buffer, at, len);
    if (kind === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(bytes));
    if (kind === 0x004e4942) bin = bytes;
    at += len;
  }
  if (!json || !bin || json.asset?.version !== '2.0') throw new Error('character missing GLB data');
  if (json.extensionsRequired?.length || json.extensionsUsed?.length) throw new Error('character extensions unsupported');
  if (json.buffers?.length !== 1 || json.buffers[0].uri || json.buffers[0].byteLength > bin.byteLength) throw new Error('character requires one embedded buffer');
  if ((json.nodes?.length || 0) > CHARACTER_LIMITS.nodes || (json.animations?.length || 0) > CHARACTER_LIMITS.clips) throw new Error('character node/clip limit exceeded');
  const accessor = (index, { floats = false } = {}) => {
    const a = json.accessors?.[index], v = json.bufferViews?.[a?.bufferView], spec = TYPES[a?.componentType], width = WIDTH[a?.type];
    if (!a || !v || !spec || !width || a.sparse || v.buffer !== 0 || !Number.isInteger(a.count) || a.count < 1 || a.count > 1000000) throw new Error(`character accessor ${index} unsupported`);
    const [Ctor, bytes, getter] = spec, stride = v.byteStride || bytes * width, offset = (v.byteOffset || 0) + (a.byteOffset || 0);
    if (stride < bytes * width || offset < 0 || offset + (a.count - 1) * stride + bytes * width > (v.byteOffset || 0) + v.byteLength || (v.byteOffset || 0) + v.byteLength > bin.byteLength) throw new Error(`character accessor ${index} exceeds buffer`);
    const out = floats ? new Float32Array(a.count * width) : new Ctor(a.count * width), view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < width; k++) {
      let n = finite(view[getter](offset + i * stride + k * bytes, true), `accessor ${index}`);
      if (a.normalized) { if (a.componentType === 5121) n /= 255; else if (a.componentType === 5123) n /= 65535; else throw new Error('character normalized component unsupported'); }
      out[i * width + k] = n;
    }
    return { data: out, count: a.count, width, type: a.type, componentType: a.componentType };
  };
  const nodes = (json.nodes || []).map((n, i) => {
    const translation = [...(n.translation || [0, 0, 0])], rotation = quaternion([...(n.rotation || [0, 0, 0, 1])]), scale = [...(n.scale || [1, 1, 1])];
    if(translation.length!==3||rotation.length!==4||scale.length!==3||(n.matrix&&n.matrix.length!==16))throw new Error('character invalid node transform');
    [...translation, ...rotation, ...scale, ...(n.matrix || [])].forEach(v => finite(v, `node ${i}`));
    if (scale.some(v => Math.abs(v) < 1e-7)) throw new Error('character singular node scale');
    return { ...n, translation, rotation, scale, parent: -1, matrix: n.matrix ? new Float32Array(n.matrix) : null };
  });
  nodes.forEach((n, i) => (n.children || []).forEach(child => {
    if (!nodes[child] || child === i || nodes[child].parent !== -1) throw new Error('character invalid node hierarchy'); nodes[child].parent = i;
  }));
  const order = [], visit = new Set(), visiting = new Set();
  function walk(i) { if (visiting.has(i)) throw new Error('character cyclic hierarchy'); if (visit.has(i)) return; visiting.add(i); if (nodes[i].parent >= 0) walk(nodes[i].parent); visiting.delete(i); visit.add(i); order.push(i); }
  nodes.forEach((_, i) => walk(i));
  const skins = (json.skins || []).map(s => {
    if (!s.joints?.length || s.joints.length > CHARACTER_LIMITS.joints || new Set(s.joints).size !== s.joints.length || s.joints.some(j => !nodes[j])) throw new Error('character invalid skin joints');
    const ib = s.inverseBindMatrices == null ? null : accessor(s.inverseBindMatrices, { floats: true });
    if (ib && (ib.type !== 'MAT4' || ib.componentType!==5126 || ib.count !== s.joints.length)) throw new Error('character invalid inverse bind matrices');
    return { joints: [...s.joints], inverseBind: s.joints.map((_, i) => ib ? ib.data.slice(i * 16, i * 16 + 16) : ident()) };
  });
  const entries = [];
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni]; if (node.mesh == null) continue;
    const mesh = json.meshes?.[node.mesh], skin = skins[node.skin];
    if (!mesh || !skin) throw new Error('character meshes must be skinned');
    if (!mesh.name || entries.some(e => e.name === mesh.name)) throw new Error('character mesh names must be unique');
    if (!mesh.primitives?.length || mesh.primitives.length > CHARACTER_LIMITS.primitives) throw new Error('character primitive limit');
    let vertices = 0, morphCount = null;
    const primitives = mesh.primitives.map(p => {
      if ((p.mode ?? 4) !== 4 || p.indices == null) throw new Error('character indexed triangles required');
      const a = p.attributes || {}, pos = accessor(a.POSITION, { floats: true }), normal = accessor(a.NORMAL, { floats: true }), uv = a.TEXCOORD_0 == null ? null : accessor(a.TEXCOORD_0, { floats: true }), joints = accessor(a.JOINTS_0), weights = accessor(a.WEIGHTS_0, { floats: true }), indices = accessor(p.indices);
      if (pos.type !== 'VEC3' || pos.componentType!==5126 || normal.type !== 'VEC3' || normal.componentType!==5126 || joints.type !== 'VEC4' || ![5121, 5123].includes(joints.componentType) || weights.type !== 'VEC4' || ![5121,5123,5126].includes(weights.componentType) || (weights.componentType!==5126&&!json.accessors[a.WEIGHTS_0].normalized) || [normal, joints, weights, ...(uv ? [uv] : [])].some(x => x.count !== pos.count) || (uv && (uv.type !== 'VEC2'||uv.componentType!==5126)) || indices.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indices.componentType) || indices.count % 3 || json.accessors[a.JOINTS_0].normalized || json.accessors[p.indices].normalized) throw new Error('character attribute shape mismatch');
      vertices += pos.count; if (vertices > CHARACTER_LIMITS.vertices) throw new Error('character vertex limit');
      for (const idx of indices.data) if (idx >= pos.count) throw new Error('character index exceeds vertices');
      for (let i = 0; i < weights.data.length; i += 4) {
        let total = 0; for (let j = 0; j < 4; j++) { if (joints.data[i + j] >= skin.joints.length || weights.data[i + j] < 0) throw new Error('character invalid influence'); total += weights.data[i + j]; }
        if (total < 1e-7) throw new Error('character zero weights'); for (let j = 0; j < 4; j++) weights.data[i + j] /= total;
      }
      const targets = (p.targets || []).map(t => {
        const p = t.POSITION == null ? null : accessor(t.POSITION, { floats: true }), n = t.NORMAL == null ? null : accessor(t.NORMAL, { floats: true });
        if ((!p && !n) || [p, n].filter(Boolean).some(a => a.type !== 'VEC3' || a.componentType!==5126 || a.count !== pos.count)) throw new Error('character invalid morph target');
        return { positions: p?.data || new Float32Array(pos.data.length), normals: n?.data || new Float32Array(pos.data.length) };
      });
      if (targets.length > CHARACTER_LIMITS.morphs || (morphCount != null && morphCount !== targets.length)) throw new Error('character morph limit/mismatch'); morphCount = targets.length;
      return { positions: pos.data, normals: normal.data, uv: uv?.data || new Float32Array(pos.count * 2), joints: joints.data, weights: weights.data, indices: indices.data, indexType: indices.componentType, targets, material: p.material || 0, vertexCount: pos.count };
    });
    const jointRadii = new Float32Array(skin.joints.length), morphRadii = new Float32Array(skin.joints.length * CHARACTER_LIMITS.morphs);
    for (const p of primitives) for (let v = 0; v < p.vertexCount; v++) for (let j = 0; j < 4; j++) {
      if (p.weights[v * 4 + j] <= 0) continue;
      const joint = p.joints[v * 4 + j], ib = skin.inverseBind[joint], q = point(ib, ...p.positions.subarray(v * 3, v * 3 + 3));
      jointRadii[joint] = Math.max(jointRadii[joint], Math.hypot(...q));
      p.targets.forEach((m, k) => { const q = vector(ib, ...m.positions.subarray(v * 3, v * 3 + 3)); morphRadii[joint * CHARACTER_LIMITS.morphs + k] = Math.max(morphRadii[joint * CHARACTER_LIMITS.morphs + k], Math.hypot(...q)); });
    }
    entries.push({ name: mesh.name, node: ni, skin, primitives, extras: mesh.extras || {}, morphCount, morphNames: mesh.extras?.targetNames || Array.from({ length: morphCount }, (_, i) => String(i)), defaultMorphs: node.weights || mesh.weights || [], jointRadii, morphRadii });
  }
  if (!entries.length) throw new Error('character pack has no meshes');
  const clips = new Map();
  for (const [ai, animation] of (json.animations || []).entries()) {
    const name = animation.name || `clip-${ai}`; if (clips.has(name)) throw new Error('character duplicate clip');
    let duration = 0;
    const channels = (animation.channels || []).map(c => {
      const s = animation.samplers?.[c.sampler], node = c.target?.node, path = c.target?.path, interpolation = s?.interpolation || 'LINEAR';
      if (!nodes[node] || nodes[node].matrix || !['translation', 'rotation', 'scale', 'weights'].includes(path) || !['LINEAR', 'STEP', 'CUBICSPLINE'].includes(interpolation)) throw new Error('character unsupported animation channel');
      const times = accessor(s.input, { floats: true }), values = accessor(s.output, { floats: true });
      if (times.type !== 'SCALAR' || times.componentType!==5126 || values.componentType!==5126 || times.count > 4096 || times.data[0] < 0) throw new Error('character invalid clip times');
      for (let i = 1; i < times.count; i++) if (times.data[i] <= times.data[i - 1]) throw new Error('character clip times not increasing');
      duration = Math.max(duration, times.data.at(-1)); if (duration > 120) throw new Error('character clip duration limit');
      const width = path === 'rotation' ? 4 : path === 'weights' ? entries.find(e => e.node === node)?.morphCount : 3;
      if (!width || width > 4 || values.data.length !== times.count * width * (interpolation === 'CUBICSPLINE' ? 3 : 1)) throw new Error('character animation output mismatch');
      return { node, path, times: times.data, values: values.data, width, interpolation };
    });
    clips.set(name, { name, duration, channels });
  }
  return { json, bin, nodes, order, entries, clips };
}

function sample(channel, t) {
  const { times, values, width, interpolation } = channel, cubic = interpolation === 'CUBICSPLINE', valueAt = i => Array.from(values.subarray((i * (cubic ? 3 : 1) + (cubic ? 1 : 0)) * width, (i * (cubic ? 3 : 1) + (cubic ? 1 : 0) + 1) * width));
  if (t <= times[0]) return valueAt(0); if (t >= times.at(-1)) return valueAt(times.length - 1);
  let lo = 0, hi = times.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid; }
  const a = valueAt(lo); if (interpolation === 'STEP') return a;
  const b = valueAt(hi), dt = times[hi] - times[lo], u = (t - times[lo]) / dt;
  if (cubic) {
    const u2 = u * u, u3 = u2 * u;
    const out = a.map((v, k) => (2 * u3 - 3 * u2 + 1) * v + (u3 - 2 * u2 + u) * dt * values[(lo * 3 + 2) * width + k] + (-2 * u3 + 3 * u2) * b[k] + (u3 - u2) * dt * values[(hi * 3) * width + k]);
    return channel.path === 'rotation' ? quaternion(out) : out;
  }
  return channel.path === 'rotation' ? slerp(quaternion(a), quaternion(b), u) : a.map((v, k) => v + (b[k] - v) * u);
}

const subtract = (a, b) => a.map((v, k) => v - b[k]);
const dot = (a, b) => a.reduce((sum, v, k) => sum + v * b[k], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = v => { const n = Math.hypot(...v); return v.map(x => x / Math.max(n, 1e-9)); };
const origin = m => Array.from(m.subarray(12, 15));
function between(a, b) {
  const u = unit(a), v = unit(b), d = Math.max(-1, Math.min(1, dot(u, v)));
  if (d < -.999999) return [...unit(cross(u, Math.abs(u[0]) < .8 ? [1, 0, 0] : [0, 1, 0])), 0];
  return quaternion([...cross(u, v), 1 + d]);
}
function matrixQuaternion(m) {
  const c = [unit(Array.from(m.subarray(0, 3))), unit(Array.from(m.subarray(4, 7))), unit(Array.from(m.subarray(8, 11)))];
  const m00 = c[0][0], m11 = c[1][1], m22 = c[2][2], trace = m00 + m11 + m22;
  let q;
  if (trace > 0) { const s = Math.sqrt(trace + 1) * 2; q = [(c[1][2] - c[2][1]) / s, (c[2][0] - c[0][2]) / s, (c[0][1] - c[1][0]) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (c[1][0] + c[0][1]) / s, (c[2][0] + c[0][2]) / s, (c[1][2] - c[2][1]) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(c[1][0] + c[0][1]) / s, s / 4, (c[2][1] + c[1][2]) / s, (c[2][0] - c[0][2]) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(c[2][0] + c[0][2]) / s, (c[2][1] + c[1][2]) / s, s / 4, (c[0][1] - c[1][0]) / s]; }
  return quaternion(q);
}
function rotatedAt(matrix, delta, position) {
  const out = characterMultiply(trs([0, 0, 0], delta, [1, 1, 1]), matrix);
  out.set(position, 12); return out;
}

// Captured support anchors are resolved after ordinary clip/joint sampling.
// This modifies only the two leg chains: the submitted navigation root and
// its recorded yaw remain authoritative. Both colour and depth use this one
// resulting palette, including the animated conservative bounds below.
function supportContacts(asset, world, local, descriptor, rest) {
  const support = descriptor.support;
  if (support == null) return;
  if (!support || !Array.isArray(support.contacts) || support.contacts.length > 2) throw new Error('character support contacts invalid');
  const clip = asset.clips.get(support.clip);
  if (!clip) throw new Error('character support reference clip invalid');
  const time = Math.max(0, Math.min(clip.duration, finite(Number(support.time ?? 0), 'support time'))), referenceLocal = rest(), reference = [];
  for (const channel of clip.channels) referenceLocal[channel.node][channel.path] = sample(channel, time);
  for (const i of asset.order) {
    const n = asset.nodes[i], v = referenceLocal[i], m = n.matrix || trs(v.translation, v.rotation, v.scale);
    reference[i] = n.parent < 0 ? m : characterMultiply(reference[n.parent], m);
  }
  const seen = new Set();
  for (const contact of support.contacts) {
    if (!contact || !['L', 'R'].includes(contact.side) || seen.has(contact.side)
      || !Array.isArray(contact.offset) || contact.offset.length !== 3
      || contact.offset.some(v => !Number.isFinite(v) || Math.abs(v) > 4)
      || !Number.isFinite(contact.yaw) || !Number.isFinite(contact.weight)) throw new Error('character support anchor invalid');
    seen.add(contact.side);
    const weight = Math.max(0, Math.min(1, contact.weight)); if (weight < 1e-8) continue;
    const chain = ['thigh', 'shin', 'foot'].map(name => asset.nodes.findIndex(n => n.name === `${name}_${contact.side}`));
    if (chain.some(i => i < 0) || asset.nodes[chain[1]].parent !== chain[0] || asset.nodes[chain[2]].parent !== chain[1]) throw new Error('character support leg hierarchy invalid');
    const [thigh, shin, foot] = chain, hip = origin(world[thigh]), knee = origin(world[shin]), ankle = origin(world[foot]);
    // Game heading has the opposite sign to a right-handed Y quaternion.
    const turn = [0, -Math.sin(contact.yaw / 2), 0, Math.cos(contact.yaw / 2)];
    const targetFrame = characterMultiply(trs(contact.offset, turn, [1, 1, 1]), reference[foot]);
    let target = ankle.map((v, k) => v + (targetFrame[12 + k] - v) * weight);
    const l1 = Math.hypot(...subtract(knee, hip)), l2 = Math.hypot(...subtract(ankle, knee)), axis = unit(subtract(target, hip));
    const reach = Math.max(.00001, Math.min(l1 + l2 - .00001, Math.max(Math.abs(l1 - l2) + .00001, Math.hypot(...subtract(target, hip)))));
    target = hip.map((v, k) => v + axis[k] * reach);
    const along = (l1 * l1 + reach * reach - l2 * l2) / (2 * reach), height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    let pole = subtract(knee, hip); pole = pole.map((v, k) => v - axis[k] * dot(pole, axis));
    if (Math.hypot(...pole) < 1e-6) pole = cross(axis, Math.abs(axis[0]) < .8 ? [1, 0, 0] : [0, 0, 1]);
    pole = unit(pole);
    const solvedKnee = hip.map((v, k) => v + axis[k] * along + pole[k] * height);
    world[thigh] = rotatedAt(world[thigh], between(subtract(knee, hip), subtract(solvedKnee, hip)), hip);
    world[shin] = rotatedAt(world[shin], between(subtract(ankle, knee), subtract(target, solvedKnee)), solvedKnee);
    const footRotation = slerp(matrixQuaternion(world[foot]), matrixQuaternion(targetFrame), weight);
    const footScale = [0, 4, 8].map(at => Math.hypot(...world[foot].subarray(at, at + 3)));
    world[foot] = trs(target, footRotation, footScale);
    const descendants = new Set([foot]);
    for (const i of asset.order) if (i !== foot && descendants.has(asset.nodes[i].parent)) {
      descendants.add(i); const n = asset.nodes[i], v = local[i];
      world[i] = characterMultiply(world[n.parent], n.matrix || trs(v.translation, v.rotation, v.scale));
    }
  }
}

export function sampleCharacterPose(asset, entry, descriptor = {}) {
  const rest = () => asset.nodes.map((n,i) => ({ translation: [...n.translation], rotation: [...n.rotation], scale: [...n.scale], weights: [...(n.weights||asset.entries.find(e=>e.node===i)?.defaultMorphs||[])] }));
  let layers=descriptor.clips;
  if(layers!=null&&(!Array.isArray(layers)||layers.length>2||!layers.length))throw new Error('character requires one or two clip layers');
  if(!layers)layers=descriptor.blend?[{name:descriptor.clip,time:descriptor.time,loop:descriptor.loop,weight:1-(descriptor.blend.weight??0)},{name:descriptor.blend.clip,time:descriptor.blend.time,loop:descriptor.blend.loop,weight:descriptor.blend.weight??0}]:[{name:descriptor.clip,time:descriptor.time,loop:descriptor.loop,weight:1}];
  const sampled=layers.map(layer=>{
    const name=layer.name??layer.clip,clip=name?asset.clips.get(name):null;
    if(name&&!clip)throw new Error(`character unknown clip ${name}`);
    let time=Math.max(0,finite(Number(layer.time??0),'clip time'));
    if(clip)time=layer.loop&&clip.duration>0?time%clip.duration:Math.min(time,clip.duration);
    const weight=Math.max(0,finite(Number(layer.weight??1),'layer weight')),local=rest();
    for(const channel of clip?.channels||[]){const value=sample(channel,time);local[channel.node][channel.path]=channel.path==='rotation'?quaternion(value):value;}
    return {local,clip:clip?.name||null,time,weight};
  });
  const a=sampled[0],b=sampled[1],fraction=b?b.weight/Math.max(1e-9,a.weight+b.weight):0;
  let local=a.local;
  if(b)local=a.local.map((v,i)=>({translation:v.translation.map((x,k)=>x+(b.local[i].translation[k]-x)*fraction),rotation:slerp(v.rotation,b.local[i].rotation,fraction),scale:v.scale.map((x,k)=>x+(b.local[i].scale[k]-x)*fraction),weights:Array.from({length:Math.max(v.weights.length,b.local[i].weights.length)},(_,k)=>(v.weights[k]||0)+((b.local[i].weights[k]||0)-(v.weights[k]||0))*fraction)}));
  if(sampled.every(layer=>layer.weight===0))local=rest();
  for (let i = 0; i < asset.nodes.length; i++) {
    const extra = descriptor.joints?.[asset.nodes[i].name]; if (!extra) continue;
    if (extra.rotation) { if (extra.rotation.length !== 4 || extra.rotation.some(v => !Number.isFinite(v))) throw new Error('character joint rotation invalid'); local[i].rotation = qmul(local[i].rotation, extra.rotation); }
    if (extra.translation) { if (extra.translation.length !== 3 || extra.translation.some(v => !Number.isFinite(v))) throw new Error('character joint translation invalid'); local[i].translation = local[i].translation.map((v, k) => v + extra.translation[k]); }
  }
  const world = [];
  for (const i of asset.order) {
    const n = asset.nodes[i], v = local[i], m = n.matrix || trs(v.translation, v.rotation, v.scale);
    world[i] = n.parent < 0 ? m : characterMultiply(world[n.parent], m);
  }
  supportContacts(asset, world, local, descriptor, rest);
  const bones = new Float32Array(CHARACTER_LIMITS.joints * 16);
  for (let i = 0; i < CHARACTER_LIMITS.joints; i++) bones.set(i < entry.skin.joints.length ? characterMultiply(world[entry.skin.joints[i]], entry.skin.inverseBind[i]) : ident(), i * 16);
  const morphs = new Float32Array(CHARACTER_LIMITS.morphs), animated = local[entry.node].weights || entry.defaultMorphs;
  for (let i = 0; i < entry.morphCount; i++) {
    const override = descriptor.morphs?.[entry.morphNames[i]] ?? descriptor.morphs?.[i], v = override ?? animated[i] ?? 0;
    morphs[i] = Math.max(-2, Math.min(2, finite(Number(v), 'morph weight')));
  }
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let j = 0; j < entry.skin.joints.length; j++) {
    const m = world[entry.skin.joints[j]];
    let radius = entry.jointRadii[j]; for (let k = 0; k < entry.morphCount; k++) radius += Math.abs(morphs[k]) * entry.morphRadii[j * CHARACTER_LIMITS.morphs + k];
    // Frobenius norm conservatively contains any scale/shear in the hierarchy.
    radius *= Math.hypot(m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]);
    for (let k = 0; k < 3; k++) { bounds.min[k] = Math.min(bounds.min[k], m[12 + k] - radius); bounds.max[k] = Math.max(bounds.max[k], m[12 + k] + radius); }
  }
  return { bones, morphs, bounds, clip: a.clip, time:a.time, layers:sampled.map(({clip,time,weight})=>({clip,time,weight})) };
}

// Used by both production vertex shaders, including the depth-only shadow pass.
export const CHARACTER_DEFORM_GLSL = `
layout(location=13) in uvec4 aCharacterJoints;
layout(location=14) in vec4 aCharacterWeights;
uniform float uCharacterEnabled;
uniform mat4 uCharacterBones[48];
uniform highp sampler2D uCharacterMorphTex;
uniform ivec2 uCharacterMorphSize;
uniform int uCharacterVertexCount,uCharacterMorphCount;
uniform vec4 uCharacterMorphWeights;
vec3 characterDelta(int index){return texelFetch(uCharacterMorphTex,ivec2(index%uCharacterMorphSize.x,index/uCharacterMorphSize.x),0).xyz;}
void deformCharacter(inout vec3 position,inout vec3 normal){
  if(uCharacterEnabled<.5)return;
  for(int k=0;k<4;k++){if(k>=uCharacterMorphCount)break;int at=k*uCharacterVertexCount*2+gl_VertexID;position+=characterDelta(at)*uCharacterMorphWeights[k];normal+=characterDelta(at+uCharacterVertexCount)*uCharacterMorphWeights[k];}
  mat4 skin=uCharacterBones[aCharacterJoints.x]*aCharacterWeights.x+uCharacterBones[aCharacterJoints.y]*aCharacterWeights.y+uCharacterBones[aCharacterJoints.z]*aCharacterWeights.z+uCharacterBones[aCharacterJoints.w]*aCharacterWeights.w;
  position=(skin*vec4(position,1.0)).xyz;
  mat3 s=mat3(skin);float determinantS=determinant(s);
  normal=normalize(abs(determinantS)>.000001?transpose(inverse(s))*normal:s*normal);
}
`;
