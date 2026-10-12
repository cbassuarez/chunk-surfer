import {
  Group, Matrix4, Mesh, MeshPhysicalMaterial, Quaternion, SphereGeometry, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// Metres, with the wrist at the origin. +Y extends along the fingers, +Z is
// the palm normal, and +X is the thumb side of the right hand.
// The left hand reflects X on a wrapper; joint flexion remains anatomical.
export const BATTLE_HAND_AXES = Object.freeze({ units: 'metres', fingers: '+Y', palm: '+Z', rightLittleFinger: '-X', rightThumb: '+X' });
export const HAND_FINGERS = Object.freeze(['index', 'middle', 'ring', 'pinky']);
export const HAND_LIMITS = Object.freeze({
  mcp: Object.freeze([-.12, 1.55]), pip: Object.freeze([0, 1.78]), dip: Object.freeze([0, 1.27]),
  spread: Object.freeze([-.27, .27]), opposition: Object.freeze([0, 1.38]),
  abduction: Object.freeze([-.65, .65]), thumbMcp: Object.freeze([-.12, 1.15]), thumbIp: Object.freeze([0, 1.38]),
});
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
// Measured from the bind mesh at 68% of each distal segment (pads) and 55%
// (nails). The palmar flesh is thicker than the dorsal nail bed.
const PAD_DEPTH = Object.freeze({ index: .00659, middle: .00703, ring: .00670, pinky: .00561, thumb: .00941 });
const NAIL_HEIGHT = Object.freeze({ index: .0061, middle: .0062, ring: .0060, pinky: .0055, thumb: .0054 });
const canonical = new Matrix4().set(0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1);
const clamp = (v, range) => Math.max(range[0], Math.min(range[1], Number.isFinite(v) ? v : 0));
const vec = v => v?.isVector3 ? v.clone() : new Vector3(...(v || [0, 0, 0]));
const templates = new Map();

export async function parseBattleHandTemplate(buffer) {
  const asset = await new GLTFLoader().parseAsync(buffer, '');
  let skin;
  asset.scene.traverse(node => { if (node.isSkinnedMesh) skin = node; });
  if (!skin || skin.skeleton.bones.length !== 25) throw new Error('Battle hand requires the anatomical 25-joint hand asset.');
  return asset;
}

export function loadBattleHandTemplate(url = `${import.meta.env?.BASE_URL || '/'}assets/battle-hands/right.glb`) {
  if (!templates.has(url)) {
    const pending = fetch(url).then(response => {
      if (!response.ok) throw new Error(`Battle hand asset: HTTP ${response.status}`);
      return response.arrayBuffer();
    }).then(parseBattleHandTemplate).catch(error => { templates.delete(url); throw error; });
    templates.set(url, pending);
  }
  return templates.get(url);
}

function solveLinear(matrix, values) {
  const n = values.length, a = matrix.map((row, i) => [...row, values[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    if (Math.abs(a[c][c]) < 1e-12) return Array(n).fill(0);
    const divisor = a[c][c]; for (let j = c; j <= n; j++) a[c][j] /= divisor;
    for (let r = 0; r < n; r++) if (r !== c) {
      const factor = a[r][c]; for (let j = c; j <= n; j++) a[r][j] -= factor * a[c][j];
    }
  }
  return a.map(row => row[n]);
}

export function createBattleHandRig(template, { side = 'right', material, nailMaterial, nails = true } = {}) {
  if (!['left', 'right'].includes(side)) throw new Error(`Unknown hand side: ${side}`);
  const scene = cloneSkeleton(template.scene || template);
  scene.updateMatrixWorld(true);
  let skin;
  scene.traverse(node => { if (node.isSkinnedMesh) skin = node; });
  const joints = Object.fromEntries(skin.skeleton.bones.map(bone => [bone.name, bone]));
  const wristOrigin = joints.wrist.getWorldPosition(new Vector3());
  const chains = [
    ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
    ...HAND_FINGERS.map(finger => [`${finger}-finger-metacarpal`, `${finger}-finger-phalanx-proximal`, `${finger}-finger-phalanx-intermediate`, `${finger}-finger-phalanx-distal`, `${finger}-finger-tip`]),
  ];
  // Source WebXR joints are absolute-pose siblings. attach() preserves the
  // bind-world matrices while giving flexion the actual parent/child chain.
  for (const chain of chains) {
    let parent = joints.wrist;
    for (const name of chain) { parent.attach(joints[name]); parent = joints[name]; }
  }
  scene.updateMatrixWorld(true);
  const rest = Object.fromEntries(Object.entries(joints).map(([name, bone]) => [name, { quaternion: bone.quaternion.clone(), position: bone.position.clone(), scale: bone.scale.clone() }]));
  const root = new Group(); root.name = `battle-${side}-hand-wrist`;
  const basis = new Group(); basis.quaternion.setFromRotationMatrix(canonical);
  basis.add(scene); scene.position.sub(wristOrigin); root.add(basis);
  if (side === 'left') basis.scale.z = -1; // Native Z maps to canonical -X.
  skin.frustumCulled = false;
  skin.castShadow = true; skin.receiveShadow = true;
  if (material) skin.material = material;

  const ownedNailMaterial = !nailMaterial;
  nailMaterial ||= new MeshPhysicalMaterial({ color: 0xc3a391, roughness: .48, clearcoat: .18 });
  const nailGeometry = new SphereGeometry(1, 16, 10), nailMeshes = [];
  const distal = finger => joints[finger === 'thumb' ? 'thumb-phalanx-distal' : `${finger}-finger-phalanx-distal`];
  const tip = finger => joints[finger === 'thumb' ? 'thumb-tip' : `${finger}-finger-tip`];
  const padLocal = {};
  for (const finger of [...HAND_FINGERS, 'thumb']) {
    const bone = distal(finger), length = bone.worldToLocal(tip(finger).getWorldPosition(new Vector3())).length();
    // WebXR joint -Y points out of the palm; +Y is the nail/dorsal side.
    // Contacts must use the palmar volume, not the terminal joint or its back.
    padLocal[finger] = new Vector3(0, -PAD_DEPTH[finger], -length * .68);
    if (nails) {
      const nail = new Mesh(nailGeometry, nailMaterial);
      nail.name = `${side}-${finger}-nail`;
      nail.scale.set(finger === 'thumb' ? .0061 : .0048, .00065, length * .30);
      nail.position.set(0, NAIL_HEIGHT[finger], -length * .55);
      bone.add(nail); nailMeshes.push(nail);
    }
  }
  let pose = { index: [.06, .12, .08], middle: [.10, .16, .10], ring: [.14, .20, .13], pinky: [.20, .26, .17], spread: { index: -.035, middle: 0, ring: .025, pinky: .05 }, thumb: { opposition: .15, abduction: 0, mcp: .12, ip: .08 } };
  const rotate = new Quaternion();
  function applyFinger(finger) {
    if (finger === 'thumb') {
      const t = pose.thumb;
      const cmc = joints['thumb-metacarpal']; cmc.quaternion.copy(rest[cmc.name].quaternion);
      // CMC opposition includes metacarpal flexion AND axial rotation. Rotating
      // only the terminal phalanx would move the tip without opposing the pad.
      // The wrist's -Y is palmar. Opposition adducts across the palm and rolls
      // the thumb pad toward it; positive abduction lifts out of that plane.
      // Positive phalanx flexion is -local X, toward the WebXR palmar -Y.
      cmc.quaternion.premultiply(rotate.setFromAxisAngle(X, -t.abduction));
      cmc.quaternion.premultiply(rotate.setFromAxisAngle(Y, -t.opposition * .80));
      cmc.quaternion.multiply(rotate.setFromAxisAngle(Z, t.opposition * 1.10));
      for (const [name, angle] of [['thumb-phalanx-proximal', t.mcp], ['thumb-phalanx-distal', t.ip]]) joints[name].quaternion.copy(rest[name].quaternion).multiply(rotate.setFromAxisAngle(X, -angle));
    } else {
      for (const [i, part] of ['proximal', 'intermediate', 'distal'].entries()) {
        const name = `${finger}-finger-phalanx-${part}`, bone = joints[name];
        bone.quaternion.copy(rest[name].quaternion);
        if (i === 0) bone.quaternion.multiply(rotate.setFromAxisAngle(Y, pose.spread[finger] || 0));
        bone.quaternion.multiply(rotate.setFromAxisAngle(X, -pose[finger][i]));
      }
    }
    root.updateMatrixWorld(true);
  }
  function setFingerPose(next = {}) {
    for (const finger of HAND_FINGERS) {
      const values = next[finger];
      if (values) pose[finger] = [clamp(values[0], HAND_LIMITS.mcp), clamp(values[1], HAND_LIMITS.pip), clamp(values[2], HAND_LIMITS.dip)];
      if (next.spread?.[finger] != null) pose.spread[finger] = clamp(next.spread[finger], HAND_LIMITS.spread);
    }
    if (next.little) pose.pinky = [clamp(next.little[0], HAND_LIMITS.mcp), clamp(next.little[1], HAND_LIMITS.pip), clamp(next.little[2], HAND_LIMITS.dip)];
    for (const [name, limit] of [['opposition', 'opposition'], ['abduction', 'abduction'], ['mcp', 'thumbMcp'], ['ip', 'thumbIp']]) if (next.thumb?.[name] != null) pose.thumb[name] = clamp(next.thumb[name], HAND_LIMITS[limit]);
    for (const finger of [...HAND_FINGERS, 'thumb']) applyFinger(finger);
    return api;
  }
  function setRootPose({ position, quaternion, rotation, scale } = {}) {
    if (position) root.position.copy(vec(position));
    if (quaternion) root.quaternion.copy(quaternion.isQuaternion ? quaternion : new Quaternion(...quaternion));
    else if (rotation) root.rotation.set(...rotation);
    if (scale != null) typeof scale === 'number' ? root.scale.setScalar(scale) : root.scale.copy(vec(scale));
    root.updateMatrixWorld(true); return api;
  }
  function getPad(finger, space = 'world') {
    const position = distal(finger).localToWorld(padLocal[finger].clone());
    const normal = Y.clone().negate().transformDirection(distal(finger).matrixWorld);
    if (space === 'local') { root.worldToLocal(position); normal.transformDirection(new Matrix4().copy(root.matrixWorld).invert()); }
    return { position, normal };
  }
  const limitsFor = finger => finger === 'thumb' ? [HAND_LIMITS.opposition, HAND_LIMITS.abduction, HAND_LIMITS.thumbMcp, HAND_LIMITS.thumbIp] : [HAND_LIMITS.mcp, HAND_LIMITS.pip, HAND_LIMITS.dip, HAND_LIMITS.spread];
  function parameters(finger) { return finger === 'thumb' ? ['opposition', 'abduction', 'mcp', 'ip'].map(name => pose.thumb[name]) : [...pose[finger], pose.spread[finger] || 0]; }
  function parameterize(finger, values) {
    values = values.map((value, i) => clamp(value, limitsFor(finger)[i]));
    if (finger === 'thumb') ['opposition', 'abduction', 'mcp', 'ip'].forEach((name, i) => { pose.thumb[name] = values[i]; });
    else {
      // A gripping digit uses the ordinary flexor coupling. This prevents an
      // IK target from producing a deeply bent PIP with a straight DIP hook.
      values[2] = Math.max(values[1] * .35, Math.min(values[1] * .85 + .15, values[2]));
      pose[finger] = values.slice(0, 3); pose.spread[finger] = values[3];
    }
    applyFinger(finger); return values;
  }
  let diagnostics = {};
  function measureGrip(contacts, { space = 'world', tolerance = .002 } = {}) {
    diagnostics = {};
    root.updateMatrixWorld(true);
    for (let [finger, contact] of Object.entries(contacts || {})) {
      if (finger === 'little') finger = 'pinky';
      if (![...HAND_FINGERS, 'thumb'].includes(finger) || !contact) continue;
      const target = vec(contact.position || contact), normal = contact.normal ? vec(contact.normal).normalize() : null;
      if (space === 'world') {
        root.worldToLocal(target);
        if (normal) normal.transformDirection(new Matrix4().copy(root.matrixWorld).invert());
      }
      const pad = getPad(finger, 'local'), error = pad.position.distanceTo(target);
      diagnostics[finger] = { error, reached: error <= tolerance, normalDot: normal ? -pad.normal.dot(normal) : null, parameters: parameters(finger), target: target.toArray(), position: pad.position.toArray() };
    }
    return getContactDiagnostics();
  }
  function solveGrip(contacts, { space = 'world', iterations = 60, tolerance = .002, normalWeight = .001 } = {}) {
    diagnostics = {};
    root.updateMatrixWorld(true);
    for (let [finger, contact] of Object.entries(contacts || {})) {
      if (finger === 'little') finger = 'pinky';
      if (![...HAND_FINGERS, 'thumb'].includes(finger) || !contact) continue;
      const target = vec(contact.position || contact);
      const outward = contact.normal ? vec(contact.normal).normalize() : null;
      if (space === 'world') {
        root.worldToLocal(target);
        if (outward) outward.transformDirection(new Matrix4().copy(root.matrixWorld).invert());
      }
      const expectedNormal = outward?.negate();
      const feature = () => { const pad = getPad(finger, 'local'); return [...pad.position.toArray(), ...(expectedNormal ? pad.normal.toArray().map(n => n * normalWeight) : [])]; };
      const goal = [...target.toArray(), ...(expectedNormal ? expectedNormal.toArray().map(n => n * normalWeight) : [])];
      const distance = () => getPad(finger, 'local').position.distanceTo(target);
      let best = parameters(finger), bestScore = Infinity;
      const seed = best;
      const starts = [seed, finger === 'thumb' ? [.65, 0, .55, .30] : [.6, 1.05, .65, seed[3]], finger === 'thumb' ? [1.25, -.3, .8, .7] : [1.15, .55, .35, seed[3]], finger === 'thumb' ? [1.2, .5, 0, 0] : [0, 0, 0, 0]];
      for (const start of starts) {
        let values = parameterize(finger, start);
        for (let step = 0; step < iterations; step++) {
          const current = feature(), error = goal.map((value, i) => value - current[i]);
          const jacobian = [];
          for (let j = 0; j < 4; j++) {
            const perturbed = [...values], h = values[j] + .001 <= limitsFor(finger)[j][1] ? .001 : -.001;
            perturbed[j] += h; parameterize(finger, perturbed);
            const moved = feature(); jacobian.push(moved.map((value, i) => (value - current[i]) / h));
          }
          parameterize(finger, values);
          const hessian = jacobian.map((column, j) => jacobian.map((other, k) => column.reduce((sum, value, i) => sum + value * other[i], 0) + (j === k ? .000004 : 0)));
          const gradient = jacobian.map(column => column.reduce((sum, value, i) => sum + value * error[i], 0));
          const delta = solveLinear(hessian, gradient);
          values = parameterize(finger, values.map((value, i) => value + Math.max(-.28, Math.min(.28, delta[i]))));
          const currentFeature = feature();
          const score = currentFeature.reduce((sum, value, i) => sum + (goal[i] - value) ** 2, 0);
          if (score < bestScore) { bestScore = score; best = [...values]; }
          if (distance() < tolerance * .15) break;
        }
        if (Math.sqrt(bestScore) < tolerance * .3) break;
      }
      parameterize(finger, best);
      const pad = getPad(finger, 'local'), error = pad.position.distanceTo(target);
      diagnostics[finger] = { error, reached: error <= tolerance, normalDot: expectedNormal ? pad.normal.dot(expectedNormal) : null, parameters: [...best], target: target.toArray(), position: pad.position.toArray() };
    }
    return getContactDiagnostics();
  }
  function getContactDiagnostics() { return structuredClone(diagnostics); }
  const api = {
    root, scene, skin, joints, rest, nails: nailMeshes, side,
    setRootPose, setFingerPose, solveGrip, measureGrip, getPad, getContactDiagnostics,
    getFingertips(space = 'world') {
      root.updateMatrixWorld(true);
      return Object.fromEntries([...HAND_FINGERS, 'thumb'].map(finger => { const point = tip(finger).getWorldPosition(new Vector3()); if (space === 'local') root.worldToLocal(point); return [finger, point]; }));
    },
    getPose() { return structuredClone(pose); },
    dispose() { nailGeometry.dispose(); if (ownedNailMaterial) nailMaterial.dispose(); skin.skeleton.dispose(); },
  };
  setFingerPose();
  return api;
}
